/**
 * Qué producto ve la organización: Limitless completo o Limitless Webinars
 * (`organizations.experience`, SCRUM-523).
 *
 *   - `full`: todos los módulos de siempre. Es el default de la columna: las
 *     organizaciones que existían antes de Webinars quedaron acá, y un alta
 *     que no diga nada también (el lado seguro).
 *   - `webinar`: Limitless Webinars. Las altas lo mandan explícito: toda
 *     organización nueva nace así (decisión del PO), salvo el negocio que un
 *     holding crea dentro de su cuenta, que hereda la del holding.
 *
 * El dato sólo lo escribe el service role (los usuarios no tienen UPDATE de la
 * columna). Qué cambia en el menú y las rutas con cada valor es SCRUM-524.
 * Esto no tiene nada que ver con las banderas de `lib/release/escondido.ts`:
 * aquellas esconden algo a todas las organizaciones mientras se termina; esto
 * es una propiedad de cada organización.
 */
import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOrganizationId, SIN_ORGANIZACION_VINCULADA } from "@/lib/auth/bootstrap";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { lecturaDegradable } from "@/lib/server/lectura-degradable";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const EXPERIENCIAS = ["webinar", "full"] as const;

export type OrganizationExperience = (typeof EXPERIENCIAS)[number];

/**
 * Lo que se usa si la experiencia no se puede leer: `full`. Una falla de
 * lectura no le saca a nadie módulos que tenía; mostrar de más acá no abre
 * datos, porque cada pantalla sigue con sus permisos.
 */
export const EXPERIENCIA_SI_FALLA: OrganizationExperience = "full";

export function esExperiencia(valor: unknown): valor is OrganizationExperience {
  return typeof valor === "string" && (EXPERIENCIAS as readonly string[]).includes(valor);
}

/**
 * La experiencia guardada de una organización. Lanza si no se puede leer, si
 * la fila no aparece o si el valor no es uno de los dos: no inventa un valor.
 * La usa el alta de un negocio dentro de un holding para heredar la del
 * holding (con el service role) y `getOrganizationExperience` (con la sesión).
 * El texto del error no lleva el valor leído.
 */
export async function leerExperienciaDeLaOrganizacion(
  supabase: SupabaseClient,
  organizationId: string
): Promise<OrganizationExperience> {
  const { data, error } = await supabase
    .from("organizations")
    .select("experience")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) throw new FallaDeLaBase(error);
  if (!data) {
    throw new FallaDeLaBase({ message: "No se encontró la organización para leer su experiencia" });
  }
  const experiencia = (data as { experience?: unknown }).experience;
  if (!esExperiencia(experiencia)) {
    throw new FallaDeLaBase({ message: "La organización tiene una experiencia que no es webinar ni full" });
  }
  return experiencia;
}

/**
 * La organización activa, o `null` si la cuenta no tiene ninguna (un super
 * admin). Cualquier otra cosa que lance `requireOrganizationId` sigue de largo:
 * una sesión no válida o una cuenta desactivada (`ErrorEsperable`) las relanza
 * `lecturaDegradable`, como en el layout; una falla de la base o de Auth se
 * registra y la experiencia queda en `full`.
 */
async function organizacionActiva(): Promise<string | null> {
  try {
    return await requireOrganizationId();
  } catch (error) {
    if (error instanceof Error && error.message === SIN_ORGANIZACION_VINCULADA) return null;
    throw error;
  }
}

async function experienciaDeLaOrganizacionActiva(): Promise<OrganizationExperience> {
  // Sin base configurada (modo demo) o sin organización (super admin) no hay
  // nada que leer: no es una falla, y se ve como siempre.
  if (!isSupabaseConfigured()) return EXPERIENCIA_SI_FALLA;
  const organizationId = await organizacionActiva();
  if (!organizationId) return EXPERIENCIA_SI_FALLA;
  const supabase = await createClient();
  return leerExperienciaDeLaOrganizacion(supabase, organizationId);
}

/**
 * La experiencia de la organización activa (la del negocio elegido, en una
 * cuenta holding), con la sesión de quien mira.
 *
 * **Memoizada por request** con `cache()` de React: el layout y las pantallas
 * del mismo render comparten una sola lectura. Lectura degradable
 * (`lecturaDegradable`, SCRUM-108): si falla la lectura o la resolución de la
 * organización, devuelve `full` y la falla queda en Sentry con el tag
 * `lectura_degradada` = `organizacion:experiencia`. Una sesión no válida o una
 * cuenta desactivada no se degradan: se relanzan. Sin organización activa
 * (super admin) o sin Supabase configurado devuelve `full` sin consultar.
 */
export const getOrganizationExperience = cache(
  (): Promise<OrganizationExperience> =>
    lecturaDegradable(
      "organizacion:experiencia",
      experienciaDeLaOrganizacionActiva,
      EXPERIENCIA_SI_FALLA
    )
);
