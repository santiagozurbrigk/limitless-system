/**
 * Las tareas de un cliente que nacen de una llamada 1-1.
 *
 * Este archivo es el lado servidor del ciclo: corre dentro del procesamiento de
 * la llamada, que es un trabajo de fondo sin sesión de usuario, y por eso usa el
 * cliente admin. El CRUD que dispara una persona vive en
 * `app/clients/task-actions.ts` y va por RLS como corresponde.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { extractOneOnOneTasks } from "@/lib/fathom/one-on-one-tasks";

/**
 * Extrae los compromisos de una 1-1 y los guarda como tareas del cliente.
 *
 * ⭐ **Corre una sola vez por llamada.** La marca `one_on_one_tasks_extracted_at`
 * es lo que impide que volver a pegar el mismo link le cargue al cliente la
 * misma tanda de tareas por segunda vez; y una tanda repetida no se distingue a
 * simple vista de trabajo nuevo.
 *
 * ⭐ **Nunca tira.** Si la extracción falla, la llamada ya quedó guardada y
 * contada: perderla entera porque el modelo no contestó sería cambiar un
 * problema chico —no hay tareas automáticas— por uno grande.
 *
 * @returns cuántas tareas se crearon.
 */
export async function maybeExtractOneOnOneTasks(params: {
  callId: string;
  organizationId: string;
  clientId: string | null;
  purpose: string | null | undefined;
  transcript: string | null;
  callDate?: string | null;
  createdBy?: string | null;
  /** Lo pidió una persona desde la ficha: se ignora la marca de "ya corrió". */
  force?: boolean;
}): Promise<number> {
  if (params.purpose !== "delivery" || !params.clientId) return 0;
  if (!params.transcript?.trim()) return 0;

  const admin = createAdminClient();

  try {
    const { data: call } = await admin
      .from("fathom_calls")
      .select("one_on_one_tasks_extracted_at")
      .eq("id", params.callId)
      .maybeSingle();

    if (call?.one_on_one_tasks_extracted_at && !params.force) return 0;

    const { data: client } = await admin
      .from("clients")
      .select("name")
      .eq("id", params.clientId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();

    // SCRUM-43: un cliente que no es de la organización no recibe tareas.
    if (!client) return 0;

    const { tasks, outcome } = await extractOneOnOneTasks({
      organizationId: params.organizationId,
      transcript: params.transcript,
      clientName: client.name ?? null,
      callDate: params.callDate ?? null,
    });

    /**
     * ⭐ La marca se pone cuando la respuesta **se entendió**, con tareas o sin
     * ellas: una llamada donde no se acordó nada concreto es un resultado válido
     * y definitivo, y sin la marca se volvería a pagar el análisis para siempre.
     *
     * Pero si la respuesta vino ilegible, **no se marca**. Marcar ahí fue el
     * error de la primera versión: dejó la llamada con cero tareas y cerrada a
     * cualquier reintento, que es la peor de las dos opciones posibles.
     */
    if (outcome !== "ilegible") {
      await admin
        .from("fathom_calls")
        .update({ one_on_one_tasks_extracted_at: new Date().toISOString() })
        .eq("id", params.callId);
    }

    if (!tasks.length) return 0;

    // Las nuevas van al final de lo que el cliente ya tenía pendiente.
    const { data: ultima } = await admin
      .from("client_tasks")
      .select("position")
      .eq("organization_id", params.organizationId)
      .eq("client_id", params.clientId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    let position = Number(ultima?.position ?? 0);

    const { error } = await admin.from("client_tasks").insert(
      tasks.map((task) => ({
        organization_id: params.organizationId,
        client_id: params.clientId,
        title: task.title,
        description: task.description,
        owner: task.owner,
        due_date: task.dueDate,
        source: "fathom_call",
        source_call_id: params.callId,
        position: ++position,
        created_by: params.createdBy ?? null,
      }))
    );

    if (error) {
      console.error("[client-tasks] insert", error.message);
      return 0;
    }

    return tasks.length;
  } catch (error) {
    console.error("[client-tasks] extracción 1-1", error);
    return 0;
  }
}
