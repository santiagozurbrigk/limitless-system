"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import {
  requireOrgRole,
  ROLES_CLAVES_DE_INGESTA,
  SIN_PERMISO_CLAVES_DE_INGESTA,
} from "@/lib/auth/require-org-role";
import { ESCONDIDO } from "@/lib/release/escondido";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generarClaveDeIngesta,
  type ClaveDeIngestaResumen,
} from "@/lib/webinar/claves-de-ingesta";
import { CLAVE_DE_INGESTA_INEXISTENTE } from "@/lib/webinar/textos-de-claves";
import { paths } from "@/routes";

/*
 * Claves de ingesta de la landing, desde Integraciones (SCRUM-527).
 *
 * `ingest_keys` no tiene policies (sólo service role), así que estas acciones
 * escriben y leen con el cliente admin, que no pasa por la RLS. Por eso cada
 * una, en el servidor y antes de tocar la tabla:
 *   1. corta si la entrada está escondida (`ESCONDIDO.ingestaLanding`);
 *   2. resuelve la organización activa (`requireOrganizationId`);
 *   3. exige founder o admin de esa organización (`requireOrgRole`, con
 *      `current_user_has_org_role`: incluye al founder de un holding operando
 *      uno de sus negocios y deja afuera a un perfil desactivado), el mismo
 *      criterio que las policies de configuración de SCRUM-526;
 *   4. filtra toda consulta por `organization_id`.
 *
 * Errores como valor desde el inicio (SCRUM-497): lo esperable vuelve con su
 * mensaje en voseo; lo demás se registra (consola y Sentry, tag
 * `server_action`) y vuelve con un texto fijo. La clave en texto sólo viaja en
 * la respuesta de `crearClaveDeIngestaAction`; ni ella ni su hash van a un log,
 * a Sentry ni al texto de un error.
 */

const NO_DISPONIBLE = "Las claves de ingesta todavía no están disponibles.";
const NOMBRE_VACIO = "Poné un nombre para la clave, por ejemplo el de la landing que la va a usar.";
const NOMBRE_LARGO = "El nombre de la clave puede tener hasta 100 caracteres.";
const NOMBRE_CON_CONTROL = "El nombre de la clave no puede tener saltos de línea, tabulaciones ni otros caracteres invisibles.";
const CLAVE_INEXISTENTE = CLAVE_DE_INGESTA_INEXISTENTE;
const FALLO_AL_LEER =
  "No se pudieron leer las claves de ingesta. Recargá la página para intentar de nuevo.";

const LARGO_MAXIMO_DEL_NOMBRE = 100;
// Caracteres de control: Postgres no acepta NUL en `text` (22P05) y los demás
// no tienen sentido en un nombre (AR pasada 1).
const CARACTER_DE_CONTROL = /[\u0000-\u001f\u007f]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNAS_DEL_RESUMEN = "id, label, created_at, last_used_at, revoked_at";

type FilaDeResumen = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function aResumen(fila: FilaDeResumen): ClaveDeIngestaResumen {
  return {
    id: fila.id,
    label: fila.label,
    createdAt: fila.created_at,
    lastUsedAt: fila.last_used_at,
    revokedAt: fila.revoked_at,
  };
}

/** Pasos 1 a 3: devuelve la organización en la que se puede operar. */
async function organizacionConPermiso(): Promise<string> {
  if (ESCONDIDO.ingestaLanding) throw new ErrorEsperable(NO_DISPONIBLE);
  const organizationId = await requireOrganizationId();
  await requireOrgRole(ROLES_CLAVES_DE_INGESTA, SIN_PERMISO_CLAVES_DE_INGESTA);
  return organizationId;
}

function nombreValido(label: unknown): string {
  const limpio = typeof label === "string" ? label.trim() : "";
  if (!limpio) throw new ErrorEsperable(NOMBRE_VACIO);
  if (CARACTER_DE_CONTROL.test(limpio)) throw new ErrorEsperable(NOMBRE_CON_CONTROL);
  // Como `char_length` de la base: cuenta caracteres, no unidades UTF-16.
  if ([...limpio].length > LARGO_MAXIMO_DEL_NOMBRE) throw new ErrorEsperable(NOMBRE_LARGO);
  return limpio;
}

/** Las claves de la organización activa, la más nueva primero. Sin el hash. */
export async function listarClavesDeIngestaAction(): Promise<
  MutationResult<ClaveDeIngestaResumen[]>
> {
  return mutacionConErroresEsperables(
    "[listarClavesDeIngesta]",
    async () => {
      const organizationId = await organizacionConPermiso();
      const { data, error } = await createAdminClient()
        .from("ingest_keys")
        .select(COLUMNAS_DEL_RESUMEN)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw new FallaDeLaBase(error);
      return ((data ?? []) as FilaDeResumen[]).map(aResumen);
    },
    FALLO_AL_LEER,
  );
}

export type ClaveDeIngestaCreada = {
  /** La clave en texto. Es la única vez que sale del servidor. */
  clave: string;
  resumen: ClaveDeIngestaResumen;
};

/**
 * Crea una clave y la devuelve una sola vez. En la base queda sólo su sha256:
 * después nadie la puede volver a ver, ni siquiera quien la creó.
 */
export async function crearClaveDeIngestaAction(
  label: string,
): Promise<MutationResult<ClaveDeIngestaCreada>> {
  return mutacionConErroresEsperables("[crearClaveDeIngesta]", async () => {
    const organizationId = await organizacionConPermiso();
    const nombre = nombreValido(label);
    const { clave, hash } = generarClaveDeIngesta();

    const { data, error } = await createAdminClient()
      .from("ingest_keys")
      .insert({ organization_id: organizationId, key_hash: hash, label: nombre })
      .select(COLUMNAS_DEL_RESUMEN)
      .single();
    if (error) {
      // Texto fijo: la fila que se intentó guardar lleva el hash, y el error no
      // tiene que poder arrastrarlo al log ni a Sentry. El código sí viaja.
      throw new FallaDeLaBase({
        message: "No se pudo guardar la clave de ingesta.",
        code: (error as { code?: string | null }).code ?? null,
      });
    }

    revalidatePath(paths.platform.integrations);
    return { clave, resumen: aResumen(data as FilaDeResumen) };
  });
}

/**
 * Revoca una clave de la organización activa: desde ese momento
 * `verificarClaveDeIngesta` la rechaza. Una clave de otra organización, que no
 * existe o ya revocada responde lo mismo, y no es éxito.
 */
export async function revocarClaveDeIngestaAction(
  id: string,
): Promise<MutationResult<{ revokedAt: string }>> {
  return mutacionConErroresEsperables("[revocarClaveDeIngesta]", async () => {
    const organizationId = await organizacionConPermiso();
    if (typeof id !== "string" || !UUID.test(id)) throw new ErrorEsperable(CLAVE_INEXISTENTE);

    const revokedAt = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("ingest_keys")
      .update({ revoked_at: revokedAt })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("revoked_at", null)
      .select("id");
    if (error) throw new FallaDeLaBase(error);
    if (!data || data.length === 0) throw new ErrorEsperable(CLAVE_INEXISTENTE);

    revalidatePath(paths.platform.integrations);
    return { revokedAt };
  });
}
