import { destinoSeguro } from "@/lib/auth/redirect-seguro";
import { paths } from "@/routes/paths";

/**
 * [AUTH-ALTA-EMAIL-AJENO] parte A (SCRUM-495): aceptar una invitación de equipo
 * (`/invite?token=`) ya no crea cuentas.
 *
 * Antes, quien tuviera el link elegía una contraseña y la app creaba en Auth
 * una cuenta **confirmada** con el email de la invitación: el dueño de ese
 * email no confirmaba nada. Ahora la invitación sólo la acepta una cuenta que
 * ya existe, con la sesión iniciada, con ese mismo email (confirmado). La
 * aceptación es una sola transacción en la base
 * (`aceptar_invitacion_de_equipo`, migración `20261005150000`): vincula el
 * perfil a la org con el rol de la invitación y la marca usada, sin que dos
 * pestañas la puedan usar dos veces.
 *
 * Este módulo es puro (lo usan la página, la action y el login): motivos,
 * mensajes y rutas.
 */

/** Por qué una invitación no se puede aceptar. Los primeros los devuelve la base. */
export type MotivoRechazoInvitacion =
  | "no_existe"
  | "usada"
  | "vencida"
  | "sin_cuenta"
  | "email_sin_confirmar"
  | "otro_email"
  | "otra_org"
  | "rol_de_otra_org"
  | "sin_sesion"
  | "error";

/** Lo que devuelve `aceptar_invitacion_de_equipo`. */
export type MotivoDeLaBase =
  | "aceptada"
  | "ya_era_miembro"
  | Exclude<MotivoRechazoInvitacion, "sin_sesion" | "error">;

const MOTIVOS_DE_LA_BASE: ReadonlySet<string> = new Set<MotivoDeLaBase>([
  "aceptada",
  "ya_era_miembro",
  "no_existe",
  "usada",
  "vencida",
  "sin_cuenta",
  "email_sin_confirmar",
  "otro_email",
  "otra_org",
  "rol_de_otra_org",
]);

/** `null` si la base devolvió algo que no es un motivo conocido. */
export function leerMotivoDeLaBase(valor: unknown): MotivoDeLaBase | null {
  return typeof valor === "string" && MOTIVOS_DE_LA_BASE.has(valor)
    ? (valor as MotivoDeLaBase)
    : null;
}

export const MENSAJE_INVITACION: Record<MotivoRechazoInvitacion, string> = {
  no_existe:
    "Esta invitación no existe. Revisá que el link esté completo o pedile uno nuevo a quien te invitó.",
  usada: "Esta invitación ya se usó. Si ya sos parte del equipo, iniciá sesión.",
  vencida: "Esta invitación venció o fue anulada. Pedile una nueva a quien te invitó.",
  sin_cuenta:
    "No encontramos tu cuenta. Cerrá sesión y volvé a entrar con la cuenta del email invitado.",
  email_sin_confirmar:
    "Tu email todavía no está confirmado. Confirmalo desde el mail que te llegó y volvé a abrir la invitación.",
  otro_email:
    "Esta invitación es para otro email. Cerrá sesión y entrá con la cuenta del email invitado.",
  otra_org:
    "Tu cuenta ya pertenece a otra organización y cada cuenta puede estar en una sola. Pedile a quien te invitó que te dé de alta con otro email.",
  rol_de_otra_org:
    "El rol de esta invitación no es de la organización. Pedile una invitación nueva a quien te invitó.",
  sin_sesion: "Iniciá sesión con la cuenta del email invitado para aceptar la invitación.",
  error: "No se pudo aceptar la invitación. Probá de nuevo en unos minutos.",
};

/** Cuando `/invite` no pudo leer la invitación (el detalle va al log). */
export const MENSAJE_INVITACION_NO_CARGADA =
  "No se pudo cargar la invitación. Probá de nuevo en unos minutos.";

/** Para quien no tiene cuenta: desde la invitación no se crean cuentas. */
export const MENSAJE_SIN_CUENTA =
  "¿Todavía no tenés cuenta con ese email? Pedile a quien te invitó que te dé de alta desde Equipo.";

/** Igualdad de emails sin importar mayúsculas ni espacios de los bordes. */
export function mismoEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** El estado de una fila de `team_invitations`, para mostrarla. */
export function estadoDeInvitacion(
  fila: { status: string; expires_at: string } | null,
  ahora: Date
): "pendiente" | "no_existe" | "usada" | "vencida" {
  if (!fila) return "no_existe";
  if (fila.status === "accepted") return "usada";
  if (fila.status !== "pending") return "vencida";
  if (new Date(fila.expires_at).getTime() <= ahora.getTime()) return "vencida";
  return "pendiente";
}

/** Qué le muestra `/invite` a quien abre una invitación pendiente. */
export function vistaDeInvitacionPendiente(
  emailInvitado: string,
  emailDeLaSesion: string | null
): "iniciar_sesion" | "aceptar" | "otro_email" {
  if (emailDeLaSesion === null) return "iniciar_sesion";
  return mismoEmail(emailInvitado, emailDeLaSesion) ? "aceptar" : "otro_email";
}

export function rutaDeInvitacion(token: string): string {
  return `${paths.invite}?token=${encodeURIComponent(token)}`;
}

/** El login que, al entrar, vuelve a la invitación. */
export function loginParaInvitacion(token: string): string {
  return `${paths.auth.login}?next=${encodeURIComponent(rutaDeInvitacion(token))}`;
}

/** Origen de referencia para resolver el `next`: sólo se aceptan paths internos. */
const ORIGEN_INTERNO = "http://limitless.invalid";

/**
 * El `next` del login, sólo si es una invitación: un path interno
 * (`destinoSeguro`, sin open redirect) cuyo path es exactamente `/invite` y
 * trae token. Devuelve la ruta rearmada (sólo el token), así que nada más de lo
 * que venga en el `next` llega a la redirección. Cualquier otra cosa da `null`
 * y el login sigue su camino de siempre.
 */
export function destinoDeInvitacion(next: unknown): string | null {
  if (typeof next !== "string" || !next) return null;
  const destino = destinoSeguro(next, ORIGEN_INTERNO, "");
  if (!destino) return null;
  const url = new URL(destino, ORIGEN_INTERNO);
  if (url.pathname !== paths.invite) return null;
  const token = url.searchParams.get("token");
  return token ? rutaDeInvitacion(token) : null;
}
