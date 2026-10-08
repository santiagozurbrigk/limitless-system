import type { CalendlyEventSyncPayload } from "@/types/calendly";

type CalendlyPaged<T> = {
  collection?: T[];
  pagination?: { next_page?: string | null };
};

type ScheduledEventResource = {
  uri?: string;
  start_time?: string;
  status?: string;
};

type InviteeResource = {
  uri?: string;
  email?: string;
  name?: string;
  status?: string;
  no_show?: { created_at?: string } | null;
  questions_and_answers?: Array<{
    question?: string;
    answer?: string | number | null;
  }>;
};

/**
 * Status HTTP con el que respondió la API de Calendly, si `error` salió de un
 * rechazo de la API (y no de la red o de un bug). Lo usa la sync por closer
 * para distinguir una conexión vencida (401) o un límite de consultas (429) de
 * una falla.
 */
export function statusDeLaApiDeCalendly(error: unknown): number | null {
  if (!(error instanceof Error) || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

async function fetchCalendlyJson<T>(url: string, accessToken: string): Promise<T> {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message =
      (json as { message?: string })?.message ??
      (json as { title?: string })?.title ??
      `Calendly API error (${resp.status})`;
    // Un `Error` común con el status: con una subclase, `runMutation` (la sync
    // de la org) pasaría a reportar estos rechazos como falla.
    throw Object.assign(new Error(message), { status: resp.status });
  }
  return json as T;
}

async function fetchAllPages<T>(
  initialUrl: string,
  accessToken: string
): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = initialUrl;

  while (url) {
    const page: CalendlyPaged<T> = await fetchCalendlyJson<CalendlyPaged<T>>(
      url,
      accessToken
    );
    items.push(...(page.collection ?? []));
    url = page.pagination?.next_page ?? null;
  }

  return items;
}

/**
 * ⭐ Cancelar no es faltar.
 *
 * `invitee.status === "canceled"` se guardaba como `no_show`, que mezcla dos
 * hechos distintos: en un no-show el lead no se presentó a una llamada que
 * ocurrió; en una cancelación la llamada nunca ocurrió. Contarlas juntas infla
 * la tasa de inasistencia con turnos que nadie dejó plantado, y borra el evento
 * que el seguimiento del lead necesita registrar.
 *
 * Calendly informa la cancelación en `invitee.status` pero no siempre quién la
 * pidió; el autor se resuelve aparte, en `cancellation.canceled_by`.
 */
function mapInviteeStatus(invitee: InviteeResource): CalendlyEventSyncPayload["statusHint"] {
  if (invitee.no_show?.created_at) return "no_show";
  if (invitee.status === "canceled") return "cancelled";
  return "scheduled";
}

function mapQuestions(invitee: InviteeResource) {
  const qas = invitee.questions_and_answers;
  if (!Array.isArray(qas)) return [];
  return qas
    .map((qa) => {
      const question = qa?.question;
      const answer = qa?.answer;
      if (!question || answer == null) return null;
      return { question: String(question), answer: String(answer) };
    })
    .filter((v): v is { question: string; answer: string } => v != null);
}

/**
 * Importa invitees de eventos programados vía API (planes sin webhooks).
 */
export async function fetchCalendlyScheduledEventPayloads(
  accessToken: string,
  organizationUri: string,
  options?: { minStartTime?: string; maxStartTime?: string }
): Promise<CalendlyEventSyncPayload[]> {
  const minStartTime =
    options?.minStartTime ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const maxStartTime =
    options?.maxStartTime ??
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    organization: organizationUri,
    status: "active",
    min_start_time: minStartTime,
    max_start_time: maxStartTime,
    count: "100",
  });

  const events = await fetchAllPages<ScheduledEventResource>(
    `https://api.calendly.com/scheduled_events?${params}`,
    accessToken
  );

  const payloads: CalendlyEventSyncPayload[] = [];

  for (const event of events) {
    const eventUri = event.uri;
    const startTime = event.start_time;
    if (!eventUri || !startTime) continue;

    const inviteeParams = new URLSearchParams({ count: "100" });
    const eventUuid = eventUri.replace(/\/$/, "").split("/").pop() ?? "";
    if (!eventUuid) continue;

    const invitees = await fetchAllPages<InviteeResource>(
      `https://api.calendly.com/scheduled_events/${encodeURIComponent(eventUuid)}/invitees?${inviteeParams}`,
      accessToken
    );

    for (const invitee of invitees) {
      const eventId = invitee.uri ?? eventUri;
      const inviteeName = invitee.name?.trim();
      if (!eventId || !inviteeName) continue;

      payloads.push({
        eventId,
        startTime,
        inviteeName,
        inviteeEmail: invitee.email,
        url: eventUri,
        questionsAndAnswers: mapQuestions(invitee),
        statusHint: mapInviteeStatus(invitee),
      });
    }
  }

  return payloads;
}
