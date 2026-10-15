import { RefreshCw } from "lucide-react";
import type { MutationResult } from "@/lib/server/action-result";

/**
 * Lo que dice la biblioteca de contenido sobre la sincronización con Zernio
 * (SCRUM-519): la hora si sincronizó (o si se salteó por el intervalo, como
 * antes) y el motivo si no. Antes, una sincronización fallida no decía nada.
 */
export function EstadoDeSincronizacion({
  resultado,
  ahora,
}: {
  resultado: MutationResult<unknown>;
  ahora: Date;
}) {
  if (!resultado.success) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px]">
        Sin sincronizar: {resultado.error}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px]">
      <RefreshCw className="h-3 w-3" aria-hidden />
      Sincronizado{" "}
      {ahora.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}
