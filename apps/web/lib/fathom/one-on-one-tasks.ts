/**
 * Los compromisos de una 1-1, sacados del transcript.
 *
 * ⭐ Es hermano de `team-task-extraction.ts`, pero pregunta otra cosa, y la
 * diferencia es el punto del módulo.
 *
 * En una reunión de equipo todas las tareas son del equipo, y alcanza con
 * preguntar "qué hay que hacer". En una 1-1 hay **dos lados**: el cliente se
 * compromete a grabar los videos y el coach a mandarle la plantilla. Si se
 * mezclan, el coach cierra la llamada sin registro de lo suyo y la lista del
 * cliente queda con cosas que no le tocan.
 *
 * ⭐ Lo que **no** es una tarea: lo que el cliente ya hizo, lo que se discutió
 * sin llegar a un compromiso, y los consejos generales del coach. La diferencia
 * entre "te conviene postear más seguido" y "vas a postear tres veces por semana
 * hasta la próxima" es la que decide si esta lista sirve o es ruido.
 */
import { AI_MODELS, callClaudeText } from "@/lib/ai/anthropic";
import { wrapUntrustedContent } from "@/lib/ai/wrap-untrusted-content";

export type OneOnOneTaskOwner = "client" | "coach";

export type OneOnOneTask = {
  title: string;
  description: string;
  owner: OneOnOneTaskOwner;
  /** `YYYY-MM-DD`, sólo si en la llamada se dijo una fecha. */
  dueDate: string | null;
};

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 500;
/** Un transcript de una hora entra holgado; el corte es contra los casos raros. */
const TRANSCRIPT_MAX_CHARS = 120_000;
/** Más de esto en una sola llamada es la IA inventando, no un coach exigente. */
const MAX_TASKS = 25;

const SYSTEM_PROMPT = `Sos un asistente que lee la transcripción de una sesión 1-1 entre un coach y su cliente, y extrae los compromisos concretos que quedaron para después de la llamada.

Devolvé SOLO un JSON array (sin markdown, sin explicaciones) de objetos con:
- title: string, máximo 120 caracteres, en infinitivo o imperativo, concreto y verificable
- description: string, el contexto de por qué quedó ese compromiso (podés dejarlo vacío)
- owner: "client" si le toca al cliente, "coach" si le toca al coach o su equipo
- due_date: "YYYY-MM-DD" si en la llamada se dijo una fecha concreta, o null

Reglas:
- Solo compromisos hacia adelante. Lo que el cliente YA hizo no es una tarea.
- Un consejo general no es una tarea. "Te conviene postear más" no entra; "vas a postear 3 veces por semana" sí.
- Si algo se discutió pero no quedó decidido, no lo incluyas.
- No inventes fechas. Si no se dijo ninguna, due_date es null.
- Escribí en español rioplatense, en la misma voz en que se habló.
- Si no hay ningún compromiso concreto, devolvé [].`;

function clamp(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Cómo salió la lectura de la respuesta del modelo.
 *
 * ⭐ Existe porque "cero tareas" son **dos cosas distintas** y confundirlas
 * costó un debug a ciegas: una llamada donde no se acordó nada concreto es un
 * resultado válido y definitivo; una respuesta que no se pudo leer es una falla
 * que hay que reintentar y, sobre todo, que hay que poder ver en el log.
 */
export type OneOnOneParseOutcome =
  /** Se entendió la respuesta. Puede traer tareas o ninguna, y las dos son ciertas. */
  | "ok"
  /** El modelo no contestó nada. */
  | "vacio"
  /** Contestó algo que no se pudo leer como tareas. Hay que reintentar. */
  | "ilegible";

export type OneOnOneParseResult = {
  tasks: OneOnOneTask[];
  outcome: OneOnOneParseOutcome;
};

/**
 * Los objetos JSON sueltos que haya en un texto, respetando las comillas.
 *
 * ⭐ Es el plan B cuando el array entero no parsea. Un `JSON.parse` del bloque
 * completo es todo o nada: una coma de más en la última tarea tira las cinco.
 * Leyendo objeto por objeto se pierde la rota y se salvan las demás.
 *
 * Cuenta llaves llevando registro de si está dentro de un string, porque una
 * llave dentro de una descripción no abre nada.
 */
function extraerObjetosJson(text: string): string[] {
  const objetos: string[] = [];
  let profundidad = 0;
  let inicio = -1;
  let enString = false;
  let escapado = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (enString) {
      /**
       * ⭐ Un salto de línea dentro de un texto es JSON inválido: los saltos
       * reales van como `\n`. Verlo crudo significa que una comilla quedó sin
       * cerrar y el conteo se desincronizó — de ahí en adelante todo lo que
       * parece una llave está "dentro" de un texto que nunca termina, y el
       * objeto siguiente, que puede estar perfecto, se pierde con el roto.
       *
       * Al encontrarlo se abandona el objeto en curso y se vuelve a empezar en
       * la próxima llave. Se pierde la tarea mal escrita, que es inevitable, y
       * se salvan las que vienen después.
       */
      if (ch === "\n") {
        enString = false;
        escapado = false;
        profundidad = 0;
        inicio = -1;
        continue;
      }
      if (escapado) escapado = false;
      else if (ch === "\\") escapado = true;
      else if (ch === '"') enString = false;
      continue;
    }

    if (ch === '"') {
      enString = true;
    } else if (ch === "{") {
      if (profundidad === 0) inicio = i;
      profundidad++;
    } else if (ch === "}") {
      profundidad--;
      if (profundidad === 0 && inicio >= 0) {
        objetos.push(text.slice(inicio, i + 1));
        inicio = -1;
      }
      if (profundidad < 0) profundidad = 0;
    }
  }

  return objetos;
}

/** Las comas colgantes son lo que más rompe: `{...},]` o `{ "a": 1, }`. */
function repararComasColgantes(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}

function parseOrNull(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    try {
      return JSON.parse(repararComasColgantes(json));
    } catch {
      return null;
    }
  }
}

function aTarea(item: unknown): OneOnOneTask | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;

  const title = clamp(record.title ?? record.titulo, TITLE_MAX);
  if (!title) return null;

  const ownerRaw = String(record.owner ?? record.responsable ?? "").toLowerCase();
  const owner: OneOnOneTaskOwner =
    ownerRaw === "coach" || ownerRaw === "equipo" ? "coach" : "client";

  const rawDue = String(record.due_date ?? record.fecha ?? "").trim();
  // Sólo se acepta la fecha en el formato pedido. Cualquier otra cosa —"la
  // semana que viene", "15/10"— se descarta: una fecha mal leída vence cuando
  // no corresponde y el aviso deja de significar algo.
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null;

  return {
    title,
    description: clamp(record.description ?? record.descripcion, DESCRIPTION_MAX),
    owner,
    dueDate,
  };
}

/**
 * Del texto que devuelve el modelo a las tareas.
 *
 * ⭐ Lo que no se entiende se descarta, no se completa con un valor por defecto
 * inventado. Una tarea sin título no es una tarea vacía: no es nada.
 *
 * ⭐ Lee en tres pasadas, de la más estricta a la más tolerante: el array
 * entero, después los objetos sueltos que encuentre, y recién ahí se da por
 * vencida. Lo que se aguanta así es un modelo que devuelve el JSON dentro de una
 * explicación, con una coma de más, o un objeto por línea sin array — las tres
 * formas en que un modelo chico contesta "bien" sin contestar exacto.
 *
 * Lógica pura: no toca red ni base.
 */
export function parseOneOnOneTasks(raw: string): OneOnOneParseResult {
  const texto = raw.trim().replace(/```(?:json)?/gi, "").trim();
  if (!texto) return { tasks: [], outcome: "vacio" };

  const recortar = (tasks: OneOnOneTask[]) => tasks.slice(0, MAX_TASKS);

  // 1 · El array completo, que es lo que se pidió.
  const desdeEl = texto.indexOf("[");
  const hastaEl = texto.lastIndexOf("]");
  if (desdeEl >= 0 && hastaEl > desdeEl) {
    const parsed = parseOrNull(texto.slice(desdeEl, hastaEl + 1));
    if (Array.isArray(parsed)) {
      return {
        tasks: recortar(parsed.map(aTarea).filter((t): t is OneOnOneTask => t !== null)),
        outcome: "ok",
      };
    }
  }

  // 2 · Objeto por objeto. Salva la tanda cuando una sola tarea viene rota.
  const objetos = extraerObjetosJson(texto);
  if (objetos.length > 0) {
    const tasks = objetos
      .map((obj) => aTarea(parseOrNull(obj)))
      .filter((t): t is OneOnOneTask => t !== null);

    // Si había objetos pero ninguno era una tarea, el modelo contestó otra cosa
    // (por ejemplo `{"error": ...}`), y eso es ilegible, no "no hay tareas".
    if (tasks.length > 0) return { tasks: recortar(tasks), outcome: "ok" };
  }

  // 3 · Un array vacío explícito es una respuesta válida: no hubo compromisos.
  if (/\[\s*\]/.test(texto)) return { tasks: [], outcome: "ok" };

  return { tasks: [], outcome: "ilegible" };
}

/**
 * Lee el transcript de una 1-1 y devuelve los compromisos que quedaron.
 *
 * Nunca tira: la llamada ya está guardada y contada, y perderla entera porque el
 * modelo contestó raro sería cambiar un problema chico por uno grande.
 *
 * ⭐ Cuando la respuesta no se puede leer, **loguea una muestra del texto
 * crudo**. Sin eso, "no salieron tareas" es indistinguible de "no había tareas",
 * y la única forma de saber cuál de las dos fue es adivinar.
 */
/**
 * El contexto que va antes del transcript en el prompt.
 *
 * ⭐ La fecha de la llamada va en el prompt porque sin ella "para el viernes"
 * no se puede convertir en una fecha. Con la fecha de hoy en vez de la de la
 * llamada, una grabación de hace dos semanas produciría vencimientos ya
 * pasados. `fechaDeLaLlamada` es el día (`YYYY-MM-DD`) en la zona de la
 * organización: cortar el instante en UTC corría un día una 1-1 de la noche en
 * Argentina, y con ella todos los vencimientos (SCRUM-493).
 */
export function contextoDelPrompt(params: {
  clientName?: string | null;
  fechaDeLaLlamada?: string | null;
}): string {
  return [
    params.clientName ? `Cliente: ${params.clientName}` : null,
    params.fechaDeLaLlamada ? `Fecha de la llamada: ${params.fechaDeLaLlamada}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function extractOneOnOneTasks(params: {
  organizationId: string;
  transcript: string;
  clientName?: string | null;
  /** El día de la llamada (`YYYY-MM-DD`) en la zona de la organización. */
  fechaDeLaLlamada?: string | null;
}): Promise<OneOnOneParseResult> {
  const transcript = params.transcript.trim();
  if (!transcript) return { tasks: [], outcome: "vacio" };

  const contexto = contextoDelPrompt(params);

  const rawText = await callClaudeText({
    organizationId: params.organizationId,
    model: AI_MODELS.HAIKU,
    feature: "fathom_one_on_one_tasks",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${contexto ? `${contexto}\n\n` : ""}${wrapUntrustedContent(
          "transcript",
          transcript.slice(0, TRANSCRIPT_MAX_CHARS)
        )}`,
      },
    ],
    maxTokens: 4096,
  });

  if (!rawText?.trim()) {
    console.warn("[1-1:tareas] el modelo no devolvió texto");
    return { tasks: [], outcome: "vacio" };
  }

  const result = parseOneOnOneTasks(rawText);

  if (result.outcome === "ilegible") {
    console.error(
      "[1-1:tareas] no se pudo leer la respuesta del modelo. Muestra cruda:",
      rawText.slice(0, 1200)
    );
  } else if (result.tasks.length === 0) {
    console.warn("[1-1:tareas] el modelo no encontró compromisos en la llamada");
  }

  return result;
}
