/**
 * [CLIENTES-PENDING-CALLS-HUERFANA] (SCRUM-31): el número que acompaña al
 * acceso a «Llamadas sin asociar» en la barra de /clients.
 *
 * Sin pendientes no se muestra número (el acceso sigue visible, para poder
 * entrar a cargar identidades); con más de 99 se abrevia para que el botón no
 * cambie de ancho.
 */
export function cantidadPendienteVisible(cantidad: number): string | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
  return cantidad > 99 ? "99+" : String(Math.floor(cantidad));
}
