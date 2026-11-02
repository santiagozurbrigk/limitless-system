import { FlaskConical } from "lucide-react";

/**
 * Cartel fijo "Datos de ejemplo" de las pantallas de Limitless Webinars
 * (SCRUM-542). Toda pantalla que recibe una vista con `esEjemplo: true` lo
 * muestra arriba de todo; con `false` no dibuja nada, así que se puede poner
 * siempre: `<CartelDatosDeEjemplo visible={vista.esEjemplo} />`.
 *
 * Fijo (`sticky`): se queda a la vista al bajar, para que nadie tome un número
 * del escenario por uno real. Sin estado ni efectos: es un Server Component.
 */
export function CartelDatosDeEjemplo({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      data-cartel="datos-de-ejemplo"
      className="sticky top-0 z-30 flex items-center gap-2 rounded-lg border border-warning/40 bg-background/95 px-3 py-2 text-sm text-warning backdrop-blur"
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">Datos de ejemplo.</span>{" "}
        <span className="text-muted-foreground">
          Esta organización es una demo: los números y las personas son inventados.
        </span>
      </p>
    </div>
  );
}
