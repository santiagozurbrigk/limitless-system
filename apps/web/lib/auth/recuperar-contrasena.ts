/**
 * Recuperar la contraseña olvidada (SCRUM-16 · [AUTH-RECUPERAR-PASSWORD]).
 *
 * Lógica pura, aparte de la action para poder testearla. El mail lo manda
 * Supabase Auth (`resetPasswordForEmail`) por el SMTP de Resend; la plantilla y
 * la configuración están en `docs/operacion/entorno-y-deploy.md` § Mails de
 * autenticación.
 */

/**
 * ⭐ La respuesta es la misma exista o no la cuenta: decir "no hay ninguna cuenta
 * con ese mail" le serviría a cualquiera para averiguar quién usa Limitless.
 */
export const MENSAJE_RECUPERACION_ENVIADA =
  "Si ese email tiene una cuenta, en unos minutos te llega un correo con un link para elegir una contraseña nueva. Revisá también la carpeta de spam.";

/** Lo que ve quien abre un link de recuperación vencido o ya usado. */
export const LINK_RECUPERACION_VENCIDO_QUERY = "link_vencido";
export const LINK_RECUPERACION_VENCIDO_MESSAGE =
  "El link para recuperar la contraseña venció o ya se usó. Pedí uno nuevo desde «¿Olvidaste tu contraseña?».";

/** Límites: por email (que nadie llene la casilla de otro) y por IP. */
export const LIMITE_RECUPERACION_POR_EMAIL = { windowMs: 60 * 60 * 1000, maxRequests: 3 };
export const LIMITE_RECUPERACION_POR_IP = { windowMs: 60 * 60 * 1000, maxRequests: 10 };

export function clavesDeRecuperacion(ip: string, email: string) {
  return {
    porEmail: `recuperar:${email.trim().toLowerCase()}`,
    porIp: `recuperar-ip:${ip}`,
  };
}

/**
 * Adónde vuelve el link del mail si la plantilla usa `{{ .ConfirmationURL }}`.
 * `/auth/callback` con `type=recovery` lleva a elegir la contraseña nueva. La
 * plantilla recomendada arma el link con `token_hash`, que funciona también si
 * el mail se abre en otro dispositivo (ver la doc de entorno).
 */
export function urlDeVueltaDeRecuperacion(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/auth/callback?type=recovery`;
}
