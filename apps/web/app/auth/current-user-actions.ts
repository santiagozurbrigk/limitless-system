"use server";

import { requireAuthContext } from "@/lib/auth/require-auth";
import {
  rechazoPorModulo,
  type RechazoPorModulo,
} from "@/lib/auth/acceso-a-modulo";

export async function getCurrentUserIdAction(): Promise<string | RechazoPorModulo> {
  const rechazo = await rechazoPorModulo("integrations");
  if (rechazo) return rechazo;
  const { user } = await requireAuthContext();
  return user.id;
}
