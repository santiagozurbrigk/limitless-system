import { parseFathomInvitees, type FathomInvitee } from "@/lib/fathom/invitees";

export const FATHOM_API_BASE =
  process.env.FATHOM_API_BASE?.trim() ?? "https://api.fathom.ai/external/v1";

/** Documentado: GET /external/v1/meetings — legacy no oficial: /v1/calls */
export const FATHOM_LIST_MEETINGS_PATH = "/meetings";
export const FATHOM_LEGACY_CALLS_URL = "https://api.fathom.ai/v1/calls";

export class FathomApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Segundos de espera que pidió Fathom en `Retry-After` (sólo en un 429). */
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "FathomApiError";
  }
}

/**
 * ⭐ Traduce una falla de Fathom a algo que se pueda leer y actuar.
 *
 * El caso que más aparece —110 veces en 24 horas en producción— es el 429: los
 * crons piden reuniones cada diez minutos y queman la cuota, así que cuando una
 * persona aprieta "sincronizar" a mano le rebota. El mensaje crudo de la API es
 * una URL de 600 caracteres con un cursor codificado y "Too Many Requests" al
 * final: no le sirve a nadie.
 *
 * Un 429 **no es un error del usuario ni una configuración rota**, y el mensaje
 * tiene que decirlo, porque si no la reacción natural es desconectar y volver a
 * conectar la cuenta, que no arregla nada.
 */
export function mensajeDeFathom(fallo: unknown): string {
  if (fallo instanceof FathomApiError) {
    if (fallo.status === 429) {
      return "Fathom está limitando los pedidos en este momento. Tus llamadas no se pierden: esperá unos minutos y probá de nuevo, o dejá que el sync automático las traiga.";
    }
    if (fallo.status === 401 || fallo.status === 403) {
      return "Fathom rechazó la clave. Puede que la hayas revocado desde su panel: reconectá tu cuenta.";
    }
    if (fallo.status && fallo.status >= 500) {
      return "Fathom está con problemas de su lado. Probá más tarde.";
    }
    return fallo.message;
  }
  return fallo instanceof Error ? fallo.message : "No se pudo sincronizar con Fathom.";
}

/**
 * `Retry-After` en segundos. La doc de Fathom lo manda en segundos; también se
 * acepta la forma de fecha HTTP. Ilegible o ausente: `undefined`.
 */
export function leerRetryAfter(valor: string | null, ahora = Date.now()): number | undefined {
  if (!valor?.trim()) return undefined;
  const segundos = Number(valor.trim());
  if (Number.isFinite(segundos) && segundos >= 0) return segundos;
  const fecha = Date.parse(valor);
  if (Number.isNaN(fecha)) return undefined;
  return Math.max(0, Math.ceil((fecha - ahora) / 1000));
}

function fathomHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-Api-Key": apiKey,
    Accept: "application/json",
  };
}

async function parseFathomErrorFromText(rawText: string, statusText: string): Promise<string> {
  try {
    const body = JSON.parse(rawText) as { message?: string; error?: string };
    return body.message ?? body.error ?? statusText;
  } catch {
    return statusText || "Error desconocido";
  }
}

function logFathomApiKeyDebug(apiKey: string | undefined | null, context: string) {
  console.log(`[Fathom:${context}] API key configured:`, Boolean(apiKey?.trim()));
}

function logFathomHttpDebug(
  context: string,
  endpoint: string,
  res: Response,
  rawText: string
) {
  console.log(`[Fathom:${context}] Endpoint:`, endpoint);
  console.log(`[Fathom:${context}] Status:`, res.status);
  console.log(
    `[Fathom:${context}] Headers:`,
    Object.fromEntries(res.headers.entries())
  );
  console.log(`[Fathom:${context}] Raw response:`, rawText.slice(0, 500));
}

export type FathomListPayload = {
  items: unknown[];
  nextCursor: string | null;
  topLevelKeys: string[];
  isDirectArray: boolean;
};

/** Normaliza listados: array directo, { items }, { data }, { calls }, paginación next_cursor. */
export function parseFathomListPayload(data: unknown): FathomListPayload {
  if (Array.isArray(data)) {
    return {
      items: data,
      nextCursor: null,
      topLevelKeys: ["<array>"],
      isDirectArray: true,
    };
  }

  if (!data || typeof data !== "object") {
    return {
      items: [],
      nextCursor: null,
      topLevelKeys: [],
      isDirectArray: false,
    };
  }

  const obj = data as Record<string, unknown>;
  const topLevelKeys = Object.keys(obj);
  const rawItems =
    obj.items ?? obj.meetings ?? obj.calls ?? obj.data ?? obj.results ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [];
  const nextRaw = obj.next_cursor ?? obj.cursor ?? null;

  console.log("[Fathom] Parsed list payload:", {
    topLevelKeys,
    itemCount: items.length,
    next_cursor: nextRaw,
    hasDataArray: Array.isArray(obj.data),
    hasItemsArray: Array.isArray(obj.items),
    hasCallsArray: Array.isArray(obj.calls),
  });

  return {
    items,
    nextCursor: typeof nextRaw === "string" && nextRaw.length > 0 ? nextRaw : null,
    topLevelKeys,
    isDirectArray: false,
  };
}

async function fetchFathomListPage(
  apiKey: string,
  listUrl: URL,
  context: string,
  debug: boolean
): Promise<{ res: Response; rawText: string; endpoint: string }> {
  const endpoint = listUrl.toString();
  logFathomApiKeyDebug(apiKey, context);

  const res = await fetch(endpoint, {
    headers: fathomHeaders(apiKey),
    cache: "no-store",
  });

  const rawText = await res.text();
  if (debug) {
    logFathomHttpDebug(context, endpoint, res, rawText);
  }

  return { res, rawText, endpoint };
}


/** Valida la API key listando una reunión (llamada de prueba). */
export async function validateFathomApiKey(apiKey: string): Promise<void> {
  const url = new URL(`${FATHOM_API_BASE}${FATHOM_LIST_MEETINGS_PATH}`);
  url.searchParams.set("limit", "1");

  const { res, rawText } = await fetchFathomListPage(
    apiKey,
    url,
    "validate",
    true
  );

  if (res.status === 401 || res.status === 403) {
    throw new FathomApiError(
      "API key de Fathom inválida. Revisala en fathom.video/settings/api.",
      res.status
    );
  }

  if (!res.ok) {
    const detail = await parseFathomErrorFromText(rawText, res.statusText);
    throw new FathomApiError(
      `No se pudo validar la API key de Fathom: ${detail}`,
      res.status
    );
  }
}

export type FathomListProbeResult = {
  endpoint: string;
  status: number;
  rawPreview: string;
  topLevelKeys: string[];
  itemCount: number;
  nextCursor: string | null;
};

/** Probe de diagnóstico — usa el endpoint documentado GET /external/v1/meetings. */
export async function probeFathomListEndpoint(
  apiKey: string,
  context = "probe"
): Promise<FathomListProbeResult> {
  const url = new URL(`${FATHOM_API_BASE}${FATHOM_LIST_MEETINGS_PATH}`);
  url.searchParams.set("limit", "5");
  url.searchParams.set("include_transcript", "true");

  const { res, rawText, endpoint } = await fetchFathomListPage(
    apiKey,
    url,
    context,
    true
  );

  let parsed: FathomListPayload = {
    items: [],
    nextCursor: null,
    topLevelKeys: [],
    isDirectArray: false,
  };

  if (rawText.trim()) {
    try {
      parsed = parseFathomListPayload(JSON.parse(rawText) as unknown);
    } catch (e) {
      console.error(`[Fathom:${context}] JSON parse error:`, e);
    }
  }

  if (res.status === 404) {
    console.warn(
      `[Fathom:${context}] ${endpoint} returned 404 — documented path is GET ${FATHOM_API_BASE}${FATHOM_LIST_MEETINGS_PATH}`
    );
    const legacyRes = await fetch(FATHOM_LEGACY_CALLS_URL, {
      headers: fathomHeaders(apiKey),
      cache: "no-store",
    });
    const legacyText = await legacyRes.text();
    console.log(`[Fathom:${context}] Legacy /v1/calls status:`, legacyRes.status);
    console.log(`[Fathom:${context}] Legacy raw:`, legacyText.slice(0, 500));
  }

  return {
    endpoint,
    status: res.status,
    rawPreview: rawText.slice(0, 500),
    topLevelKeys: parsed.topLevelKeys,
    itemCount: parsed.items.length,
    nextCursor: parsed.nextCursor,
  };
}

export type FathomMeetingRecord = {
  id: string;
  recording_id: string;
  title: string;
  meeting_title?: string;
  transcript?: string;
  /** Transcript crudo de la API (array/objeto) — se serializa a text en sync. */
  transcriptRaw?: unknown;
  summary?: string;
  durationSeconds?: number;
  callDate?: string;
  recording_start_time?: string;
  scheduled_start_time?: string;
  recording_end_time?: string;
  /**
   * Cuándo Fathom registró la reunión. Es el campo por el que filtran
   * `created_after` y `created_before`, así que el cursor de la sync se arma
   * con este, no con la hora de grabación. Requerido en el schema; puede
   * faltar igual, y la sync lo tolera (`lib/fathom/cursor.ts`).
   */
  created_at?: string;
  url?: string;
  /** Invitados del calendario, con mail y si son externos. Puede venir vacío. */
  calendar_invitees: FathomInvitee[];
  /** Tipo de reunión asignado en Fathom, o null si la org no usa tipos. */
  meeting_type?: string | null;
  /** URL de la videollamada (Zoom/Meet/Teams) del evento de calendario. */
  meeting_url?: string | null;
};

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    // 🐛 Bug arreglado: `default_summary` de Fathom es un **objeto**
    // (`{ markdown_formatted: "..." }`), no un string. Sin esto `pickString`
    // devolvía undefined y **el resumen no llegaba nunca**, en silencio.
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of ["markdown_formatted", "text", "content", "summary"]) {
        const nestedValue = nested[nestedKey];
        if (typeof nestedValue === "string" && nestedValue.trim()) {
          return nestedValue.trim();
        }
      }
    }
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function extractTranscript(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const lines = raw
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (!entry || typeof entry !== "object") return "";
        const seg = entry as Record<string, unknown>;
        return typeof seg.text === "string" ? seg.text : "";
      })
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
    return undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.text === "string") return obj.text;
  if (Array.isArray(obj.segments)) {
    const lines = obj.segments
      .map((s) => {
        if (!s || typeof s !== "object") return "";
        const seg = s as Record<string, unknown>;
        return typeof seg.text === "string" ? seg.text : "";
      })
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
  }
  return undefined;
}

export function mapFathomMeeting(raw: unknown): FathomMeetingRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const id = pickString(obj, [
    "recording_id",
    "call_id",
    "id",
    "meeting_id",
  ]);
  if (!id) return null;

  const title =
    pickString(obj, ["title", "meeting_title", "name"]) ?? "Llamada Fathom";
  const meetingTitle = pickString(obj, ["meeting_title", "title"]);

  const recordingStart = pickString(obj, [
    "recording_start_time",
    "recorded_at",
    "created_at",
    "start_time",
  ]);
  const scheduledStart = pickString(obj, ["scheduled_start_time"]);
  const recordingEnd = pickString(obj, ["recording_end_time", "scheduled_end_time"]);

  return {
    id,
    recording_id: id,
    title,
    meeting_title: meetingTitle,
    transcript: extractTranscript(obj.transcript),
    transcriptRaw: obj.transcript,
    summary: pickString(obj, ["summary", "ai_summary", "default_summary"]),
    durationSeconds: pickNumber(obj, [
      "duration_seconds",
      "duration",
      "duration_in_seconds",
    ]),
    callDate: recordingStart ?? scheduledStart,
    recording_start_time: recordingStart,
    scheduled_start_time: scheduledStart,
    recording_end_time: recordingEnd,
    created_at: pickString(obj, ["created_at"]),
    url: pickString(obj, ["url", "share_url", "record_url", "recording_url"]),
    // ⭐ Estos tres venían en la respuesta desde siempre y el parser los tiraba.
    // Son la señal con la que se identifica y clasifica una llamada; el título,
    // que era lo único que se leía, está vacío en el 86% de los casos.
    calendar_invitees: parseFathomInvitees(obj.calendar_invitees),
    meeting_type: pickString(obj, ["meeting_type"]) ?? null,
    meeting_url: pickString(obj, ["meeting_url"]) ?? null,
  };
}

export type ListFathomMeetingsOptions = {
  createdAfter?: string;
  /** Tope superior de `created_at`. Lo usa la lectura por tramos (`lib/fathom/leer-ventana.ts`). */
  createdBefore?: string;
  includeTranscript?: boolean;
  /** El resumen ya escrito por Fathom. */
  includeSummary?: boolean;
  /** Los próximos pasos, con link al segundo exacto del video. */
  includeActionItems?: boolean;
  /** ⭐ De acá sale `matched_speaker_display_name`: el alias, gratis. */
  includeCrmMatches?: boolean;
  maxPages?: number;
  /**
   * Momento (ms) desde el cual no se pide otra página: la lectura vuelve como
   * cortada (`truncated`) y el resto queda para la corrida siguiente. Lo pone
   * el cron (`lib/fathom/plazo-del-cron.ts`).
   */
  plazo?: number;
  /** Loguea status, headers, respuesta cruda y shape de paginación (cron/debug). */
  debug?: boolean;
  debugContext?: string;
};

export type FathomMeetingsListing = {
  /** Las reuniones mapeadas, en el orden en que las devolvió Fathom. */
  meetings: FathomMeetingRecord[];
  /**
   * ⭐ `true` si la lectura se cortó en el tope de páginas y Fathom todavía
   * tenía más. Antes no se informaba, y la sync avanzaba el cursor como si
   * hubiera leído todo: las reuniones que quedaban del otro lado del corte no
   * se pedían nunca más.
   */
  truncated: boolean;
  /** Páginas pedidas. La lectura por tramos lo descuenta de su presupuesto. */
  pages: number;
};

export async function listFathomMeetings(
  apiKey: string,
  options: ListFathomMeetingsOptions = {}
): Promise<FathomMeetingsListing> {
  const meetings: FathomMeetingRecord[] = [];
  let cursor: string | undefined;
  let truncated = false;
  let pages = 0;
  const maxPages = options.maxPages ?? 20;
  const debug = options.debug ?? false;
  const context = options.debugContext ?? "list";

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${FATHOM_API_BASE}${FATHOM_LIST_MEETINGS_PATH}`);
    if (cursor) url.searchParams.set("cursor", cursor);
    if (options.createdAfter) {
      url.searchParams.set("created_after", options.createdAfter);
    }
    if (options.createdBefore) {
      url.searchParams.set("created_before", options.createdBefore);
    }
    if (options.includeTranscript !== false) {
      url.searchParams.set("include_transcript", "true");
    }
    /**
     * ⭐ Fathom ofrece cuatro `include_` y Limitless pedía **uno solo**, así que se
     * estaba tirando información que ya viene sin costo extra de request:
     *
     * - `include_summary`      — el resumen ya escrito (⚠️ ver el bug de
     *                            `default_summary` en `pickString`)
     * - `include_action_items` — los próximos pasos, **con link al segundo exacto**
     * - `include_crm_matches`  — ⭐ el vínculo entre nombre de pantalla y mail
     *                            (`matched_speaker_display_name`), que es de
     *                            donde el alias se aprende solo
     *
     * ⚠️ Ojo con el costo: pedir summary o transcript convierte el request en
     * "pesado" (30/min, y puede bajar a 5). Por eso el camino normal es el
     * webhook, que no gasta cuota; esto es para el poll de reconciliación.
     */
    if (options.includeSummary !== false) {
      url.searchParams.set("include_summary", "true");
    }
    if (options.includeActionItems !== false) {
      url.searchParams.set("include_action_items", "true");
    }
    if (options.includeCrmMatches !== false) {
      url.searchParams.set("include_crm_matches", "true");
    }

    const { res, rawText, endpoint } = await fetchFathomListPage(
      apiKey,
      url,
      `${context}:page${page}`,
      debug || page === 0
    );
    pages++;

    if (res.status === 401 || res.status === 403) {
      throw new FathomApiError(
        "API key de Fathom inválida o revocada.",
        res.status
      );
    }

    if (!res.ok) {
      const detail = await parseFathomErrorFromText(rawText, res.statusText);
      throw new FathomApiError(
        `Error al listar reuniones de Fathom (${endpoint}): ${detail}`,
        res.status,
        res.status === 429 ? leerRetryAfter(res.headers.get("retry-after")) : undefined
      );
    }

    let data: unknown;
    try {
      data = rawText.trim() ? JSON.parse(rawText) : {};
    } catch (e) {
      console.error(`[Fathom:${context}] Invalid JSON on page ${page}:`, e);
      throw new FathomApiError("Respuesta JSON inválida de Fathom.", res.status);
    }

    const { items, nextCursor } = parseFathomListPayload(data);
    let pageMapped = 0;
    console.log(`[Fathom:sync] Parsed meetings: raw=${items.length} (page ${page})`);
    for (const item of items) {
      const mapped = mapFathomMeeting(item);
      if (mapped) {
        meetings.push(mapped);
        pageMapped++;
      } else if (debug) {
        const keys =
          item && typeof item === "object"
            ? Object.keys(item as Record<string, unknown>)
            : [];
        console.warn("[Fathom] Skipped unmapped meeting item:", {
          keys,
          recording_id:
            item && typeof item === "object"
              ? (item as Record<string, unknown>).recording_id
              : undefined,
        });
      }
    }
    console.log(
      `[Fathom:sync] Page ${page} mapped: ${pageMapped}/${items.length}, total so far: ${meetings.length}`
    );

    if (!nextCursor) break;
    if (page === maxPages - 1 || (options.plazo !== undefined && Date.now() >= options.plazo)) {
      truncated = true;
      break;
    }
    cursor = nextCursor;
  }

  if (debug) {
    console.log(`[Fathom:${context}] Total meetings mapped:`, meetings.length);
  }
  if (truncated) {
    console.warn(
      `[Fathom:${context}] Lectura cortada (tope de ${maxPages} páginas o plazo del cron): Fathom tenía más.`
    );
  }

  return { meetings, truncated, pages };
}

export async function fetchFathomMeetingTitle(
  apiKey: string,
  meetingId: string
): Promise<string | null> {
  try {
    const res = await fetch(`${FATHOM_API_BASE}/meetings/${meetingId}`, {
      headers: fathomHeaders(apiKey),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return (
      pickString(data, ["title", "meeting_title", "name"]) ?? null
    );
  } catch {
    return null;
  }
}
