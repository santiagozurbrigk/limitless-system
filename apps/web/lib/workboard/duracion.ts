/**
 * Una duración en minutos como la muestra el Tablero: "1 minuto", "45 minutos", "1 hora",
 * "2 horas", "1h 30m". Va después de dos puntos ("Tiempo ya registrado: 1
 * hora"): las formas no concuerdan en género ni número entre sí.
 */
export function formatearDuracion(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} ${m === 1 ? "minuto" : "minutos"}`;
  if (m === 0) return `${h} ${h === 1 ? "hora" : "horas"}`;
  return `${h}h ${m}m`;
}
