/**
 * Aviso de una lectura que no se pudo hacer, con su motivo (SCRUM-504): lo
 * devuelve la acción; si fue inesperado, el texto fijo. Para que una pantalla
 * no muestre ceros o listas vacías como si fueran datos.
 */
export function AvisoDeLecturaFallida({ titulo, motivo }: { titulo: string; motivo: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
    >
      <span className="font-medium">{titulo}</span> {motivo}
    </div>
  );
}
