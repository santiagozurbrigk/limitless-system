import Link from "next/link";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ai-coo/ui";
import {
  COLUMNAS_DE_LEADS,
  TEXTO_SIN_CONTACTAR,
  TEXTO_SIN_RESPONSABLE,
  nombreVisible,
  textoDelOrigen,
} from "@/lib/webinar/leads/config";
import { urlDeLaFicha } from "@/lib/webinar/leads/url";
import { ETIQUETA_DEL_EVENTO, type FilaDeLead } from "@/lib/webinar/vistas/contratos";
import { FechaDeLaOrg } from "./fecha-de-la-org";

/**
 * La tabla de Leads (SCRUM-545, AC-1). Dibuja las filas en el orden en que
 * llegan del contrato, sin reordenar ni recortar (CD-16). Cada fila enlaza a
 * la ficha con el lanzamiento elegido (DT-15); el enlace cubre toda la fila
 * (`relative` en la fila, `after:absolute after:inset-0` en el enlace), así un
 * clic en cualquier parte abre la ficha (AC-11). Sin estado ni efectos.
 */
export function TablaDeLeads({
  filas,
  launchId,
}: {
  filas: FilaDeLead[];
  /** El lanzamiento elegido, para que la ficha muestre su estado de venta. */
  launchId: string | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNAS_DE_LEADS.map((columna) => (
            <TableHead key={columna.id}>{columna.etiqueta}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((fila) => (
          <TableRow key={fila.leadId} className="relative" data-lead={fila.leadId}>
            <TableCell>
              <Link
                href={urlDeLaFicha(fila.leadId, launchId)}
                className="font-medium after:absolute after:inset-0 hover:underline"
              >
                {nombreVisible(fila)}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{ETIQUETA_DEL_EVENTO[fila.etapa]}</Badge>
            </TableCell>
            <TableCell>{textoDelOrigen(fila.origen)}</TableCell>
            <TableCell>{fila.responsable?.nombre ?? TEXTO_SIN_RESPONSABLE}</TableCell>
            <TableCell>
              {fila.ultimoContactoAt ? (
                <FechaDeLaOrg iso={fila.ultimoContactoAt} />
              ) : (
                TEXTO_SIN_CONTACTAR
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
