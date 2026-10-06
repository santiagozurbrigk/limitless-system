"use server";

import type { AuthError } from "@supabase/supabase-js";
import {
  registrarFallaDeAccion,
  type MutationResult,
} from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MIN_PASSWORD_LENGTH = 8;

const SESION_VENCIDA = "Tu sesión venció. Volvé a iniciar sesión para cambiar la contraseña.";
const CAMBIO_A_MEDIAS =
  "La contraseña se cambió, pero no se pudo terminar de guardar el cambio. Intentá de nuevo con otra contraseña.";
const MISMA_CONTRASENA =
  "La nueva contraseña tiene que ser distinta de la actual. Si ya la cambiaste en un intento anterior, elegí otra.";
const CONTRASENA_FILTRADA =
  "Esa contraseña aparece en filtraciones conocidas. Elegí otra.";
const CONTRASENA_DEBIL =
  "La contraseña no cumple los requisitos de seguridad. Probá con una más larga que combine letras, números y símbolos.";
const DEMASIADOS_INTENTOS = "Hiciste muchos intentos seguidos. Esperá unos minutos y probá de nuevo.";
const NO_SE_PUDO_CAMBIAR = "Error al actualizar la contraseña";

/**
 * ⭐ Los rechazos de Supabase Auth que se le pueden explicar al usuario
 * (SCRUM-497). `same_password` es el caso del reintento después de un cambio
 * a medias: la contraseña nueva ya es la actual. No se baja la marca igual,
 * porque la "nueva" podría ser la temporal y quedaría permanente: se le pide
 * otra. Cualquier otro código es una falla: se registra y va a Sentry.
 */
function motivoDelRechazoDeAuth(error: AuthError): string | null {
  switch (error.code) {
    case "same_password":
      return MISMA_CONTRASENA;
    case "weak_password": {
      const razones = "reasons" in error && Array.isArray(error.reasons) ? error.reasons : [];
      return razones.includes("pwned") ? CONTRASENA_FILTRADA : CONTRASENA_DEBIL;
    }
    case "session_not_found":
    case "session_expired":
      return SESION_VENCIDA;
    case "over_request_rate_limit":
      return DEMASIADOS_INTENTOS;
    default:
      return null;
  }
}

/**
 * Cambia la contraseña y recién entonces baja la marca de contraseña temporal.
 *
 * Las dos cosas van juntas en el servidor a propósito: si el cliente cambiaba la
 * contraseña y después llamaba a una acción que sólo limpiaba la marca, alcanzaba
 * con llamar a la acción para que la contraseña temporal quedara permanente.
 *
 * Los errores esperables vuelven como valor, con returns explícitos: en
 * producción Next no le manda al cliente el mensaje de un error lanzado por una
 * server action, y la pantalla quedaba en "Guardando…" sin decir nada.
 */
export async function completePasswordChangeAction(
  newPassword: string
): Promise<MutationResult> {
  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      success: false,
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: SESION_VENCIDA };

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    const motivo = motivoDelRechazoDeAuth(updateError);
    if (motivo) return { success: false, error: motivo };
    registrarFallaDeAccion("[completePasswordChange] updateUser", updateError);
    return { success: false, error: NO_SE_PUDO_CAMBIAR };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      must_change_password: false,
      temp_password_expires_at: null,
    })
    .eq("id", user.id);

  if (error) {
    registrarFallaDeAccion("[completePasswordChange] bajar la marca de contraseña temporal", error);
    return { success: false, error: CAMBIO_A_MEDIAS };
  }

  return { success: true, data: undefined };
}
