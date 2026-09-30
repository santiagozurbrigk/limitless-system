/**
 * [AUTH-CALLBACK-NEXT] (SCRUM-2): a dónde se puede mandar al usuario después
 * de iniciar sesión.
 *
 * `/auth/callback` armaba la redirección como `${origin}${next}` con el `next`
 * de la URL tal cual. Con `next=.evil.com` quedaba
 * `https://app.com.evil.com` y con `next=@evil.com`, `https://app.com@evil.com`
 * (el host pasa a ser evil.com). Hoy es difícil de explotar, porque la
 * redirección sólo pasa después de canjear un código válido y el `next` de ese
 * link lo arma la app; se cierra antes de que otro flujo (recuperar contraseña,
 * login con `next`) lo exponga.
 *
 * Sólo se acepta un path interno: empieza con una sola `/` y, resuelto contra
 * el origen, sigue en el mismo origen. Cualquier otra cosa cae en el destino
 * por defecto.
 */
export function destinoSeguro(
  next: string | null | undefined,
  origin: string,
  porDefecto: string
): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return porDefecto;
  }
  try {
    const url = new URL(next, origin);
    if (url.origin !== new URL(origin).origin) return porDefecto;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return porDefecto;
  }
}
