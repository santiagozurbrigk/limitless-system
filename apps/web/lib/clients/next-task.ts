/**
 * Cuál es **la próxima tarea** de un cliente.
 *
 * ⭐ Hasta acá, la columna «Próxima tarea» de la tabla mostraba el próximo hito
 * del recorrido. El recorrido es un catálogo que se define una vez y vale para
 * todos; la próxima tarea es lo que vos decidiste para **este** cliente, ya sea
 * escribiéndola o sacándola de una llamada. Son dos cosas distintas, y la que
 * dice qué hacer mañana es la segunda.
 *
 * Lógica pura: no toca base ni red.
 */
import { fechaVencida } from "@/lib/fechas/calendario";
import type { ClientTask } from "@/types/client-tasks";

/**
 * La que hay que hacer primero, con este criterio:
 *
 *   1. Sólo pendientes. Una tarea hecha no es la próxima.
 *   2. Las que tienen fecha van antes que las que no: una fecha es un
 *      compromiso, y lo sin fecha puede esperar por definición.
 *   3. Entre las que tienen fecha, la más próxima —vencida incluida, que es la
 *      más urgente de todas.
 *   4. A igualdad, el orden en que se cargaron.
 *
 * ⭐ El dueño **no** desempata. Una tarea del coach vencida es más urgente que
 * una del cliente para la semana que viene, y al revés; ordenar por dueño
 * escondería la vencida abajo de una lista que nadie mira entera.
 */
export function pickNextTask(tasks: readonly ClientTask[]): ClientTask | null {
  const pendientes = tasks.filter((task) => task.status === "pending");
  if (pendientes.length === 0) return null;

  return pendientes.reduce((mejor, actual) =>
    comparar(actual, mejor) < 0 ? actual : mejor
  );
}

function comparar(a: ClientTask, b: ClientTask): number {
  if (a.dueDate && b.dueDate) {
    const porFecha = a.dueDate.localeCompare(b.dueDate);
    if (porFecha !== 0) return porFecha;
  } else if (a.dueDate) {
    return -1;
  } else if (b.dueDate) {
    return 1;
  }
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * ¿Está vencida? Se compara por día, no por instante: lo que vence hoy todavía
 * está a tiempo.
 *
 * `hoy` es una fecha calendario (`YYYY-MM-DD`) que arma quien llama:
 * `useHoyDeLaOrganizacion()` en el navegador y `fechaDeHoyEnZona(zona de la
 * organización)` en el servidor. No hay default a propósito: el reloj del
 * proceso en el servidor es UTC, y de noche en Argentina ya es mañana
 * (SCRUM-493).
 */
export function isOverdue(task: ClientTask, hoy: string): boolean {
  if (task.status === "done") return false;
  return fechaVencida(task.dueDate, hoy);
}
