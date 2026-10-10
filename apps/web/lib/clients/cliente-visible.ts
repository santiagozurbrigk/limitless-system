import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { uuidSchema } from "@/lib/validations";

/**
 * Si quien mira puede ver al cliente `id`, para que la ficha llame a
 * `notFound()` en el servidor (SCRUM-108).
 *
 * La ficha leía el cliente de la lista del navegador y llamaba a `notFound()`
 * desde un client component: con un id inexistente o de otra organización la
 * app rompía con el error #310 de React ("Application error") en lugar de
 * mostrar el `not-found` de la plataforma.
 *
 * Misma consulta y mismos filtros que `listClientsAction`, la lista de donde
 * la ficha saca los datos: sólo la RLS de `clients` (la org propia y, para un
 * holding, los clientes de sus negocios). Así la ficha no aparece para algo
 * que la lista no muestra, ni al revés.
 *
 * - Un id que no es un UUID no existe (PostgREST lo rechazaría con un 400).
 * - Sin Supabase configurado la lista está vacía: no existe.
 * - Si la lectura falla, lanza: una caída de la base no es "no existe", la
 *   pantalla cae en su boundary y queda en Sentry.
 */
export async function clienteVisibleExiste(id: string): Promise<boolean> {
  if (!uuidSchema.safeParse(id).success) return false;
  if (!isSupabaseConfigured()) return false;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new FallaDeLaBase(error);
  return data !== null;
}
