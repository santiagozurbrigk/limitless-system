const MANYCHAT_API_BASE = "https://api.manychat.com";

type ManyChatApiResponse<T> = {
  status?: string;
  data?: T;
  message?: string;
  details?: unknown;
};

export type ManyChatPageInfo = {
  id?: number | string;
  name?: string;
};

export type ManyChatSubscriber = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  name?: string;
  status?: string;
  last_interaction?: string;
  ig_username?: string;
  last_text_input?: string;
  tags?: Array<{ id?: number; name?: string } | string>;
};

/**
 * Un error de la API de ManyChat con el status de la respuesta, para que quien
 * llama distinga una API key rechazada (401/403) de una falla (SCRUM-520). El
 * mensaje es el mismo de antes.
 */
export class ManyChatHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ManyChatHttpError";
    this.status = status;
  }
}

async function manyChatFetch<T>(
  apiToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const resp = await fetch(`${MANYCHAT_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await resp.json().catch(() => null)) as ManyChatApiResponse<T> | null;

  if (!resp.ok || json?.status === "error") {
    const detailMessages = (
      json?.details as { messages?: Array<{ message?: string }> } | undefined
    )?.messages;
    const firstDetail = detailMessages?.[0]?.message;
    const message =
      firstDetail ??
      json?.message ??
      `ManyChat API error (${resp.status})`;
    throw new ManyChatHttpError(message, resp.status);
  }

  return (json?.data ?? json) as T;
}

export async function fetchManyChatPageInfo(apiToken: string): Promise<ManyChatPageInfo> {
  const resp = await fetch(`${MANYCHAT_API_BASE}/fb/page/getInfo`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
    },
  });

  const json = (await resp.json().catch(() => null)) as ManyChatApiResponse<ManyChatPageInfo> | null;

  // 401/403 → definitely invalid key
  if (resp.status === 401 || resp.status === 403) {
    throw new Error("API key de ManyChat inválida. Revísala en tu cuenta de ManyChat → Settings → API.");
  }

  // Other non-ok status or error status can mean the account has no FB page
  // (Instagram/WhatsApp-only accounts). Accept the key as valid with empty page info.
  if (!resp.ok || json?.status === "error") {
    return {};
  }

  return (json?.data ?? json ?? {}) as ManyChatPageInfo;
}

export type ManyChatFlow = {
  ns: string;
  name: string;
  status: "enabled" | "disabled" | "draft" | string;
};

/**
 * Los flujos de la página. Si ManyChat rechaza o falla, lanza (SCRUM-520):
 * antes devolvía `[]` y la pantalla de Automatizaciones decía que no había
 * flujos configurados.
 */
export async function fetchManyChatFlows(apiToken: string): Promise<ManyChatFlow[]> {
  const data = await manyChatFetch<ManyChatFlow[]>(apiToken, "/fb/page/getFlows");
  return Array.isArray(data) ? data : [];
}

export async function fetchManyChatSubscriber(
  apiToken: string,
  subscriberId: string
): Promise<ManyChatSubscriber> {
  const params = new URLSearchParams({ subscriber_id: subscriberId });
  return manyChatFetch<ManyChatSubscriber>(
    apiToken,
    `/fb/subscriber/getInfo?${params}`
  );
}

function isEmailInput(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhoneInput(value: string): boolean {
  return /^\+?[\d\s().-]{8,}$/.test(value);
}

function isNumericSubscriberId(value: string): boolean {
  return /^\d+$/.test(value);
}

function firstSubscriberFromLookup(
  data: ManyChatSubscriber | ManyChatSubscriber[] | null | undefined
): ManyChatSubscriber | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

async function findSubscriberBySystemField(
  apiToken: string,
  field: "email" | "phone",
  value: string
): Promise<ManyChatSubscriber | null> {
  const params = new URLSearchParams({ [field]: value });
  const data = await manyChatFetch<ManyChatSubscriber | ManyChatSubscriber[]>(
    apiToken,
    `/fb/subscriber/findBySystemField?${params}`
  );
  return firstSubscriberFromLookup(data);
}

/** Acepta subscriber ID numérico, email o teléfono (SMS). */
export async function resolveManyChatSubscriber(
  apiToken: string,
  input: string
): Promise<ManyChatSubscriber> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Indica un subscriber ID, email o teléfono.");
  }

  if (isEmailInput(trimmed)) {
    const found = await findSubscriberBySystemField(apiToken, "email", trimmed);
    if (!found?.id) {
      throw new Error(
        "No encontramos un contacto con ese email en ManyChat. Si es solo WhatsApp, usa el subscriber ID numérico ({{user_id}} en External Request)."
      );
    }
    return fetchManyChatSubscriber(apiToken, String(found.id));
  }

  if (isPhoneInput(trimmed)) {
    const normalized = trimmed.replace(/\s/g, "");
    const found = await findSubscriberBySystemField(apiToken, "phone", normalized);
    if (!found?.id) {
      throw new Error(
        "No encontramos un contacto con ese teléfono (campo SMS). Prueba con el subscriber ID numérico."
      );
    }
    return fetchManyChatSubscriber(apiToken, String(found.id));
  }

  if (!isNumericSubscriberId(trimmed)) {
    throw new Error(
      "El subscriber ID debe ser numérico (ej. el valor de {{user_id}}). Un email va en el mismo campo y lo buscamos automáticamente."
    );
  }

  return fetchManyChatSubscriber(apiToken, trimmed);
}

function normalizeManyChatTags(
  tags?: Array<{ name?: string } | string>
): string[] {
  if (!tags?.length) return [];
  return tags
    .map((tag) => (typeof tag === "string" ? tag : tag.name))
    .filter((tag): tag is string => Boolean(tag?.trim()))
    .map((tag) => tag.trim());
}

export async function fetchManyChatSubscriberTags(
  apiToken: string,
  subscriberId: string
): Promise<string[]> {
  try {
    const data = await manyChatFetch<{ tags?: Array<{ name?: string } | string> }>(
      apiToken,
      `/fb/subscriber/getTags?subscriber_id=${encodeURIComponent(subscriberId)}`
    );
    const fromEndpoint = normalizeManyChatTags(data.tags);
    if (fromEndpoint.length > 0) return fromEndpoint;
  } catch {
    // fallback to subscriber profile tags
  }

  const subscriber = await fetchManyChatSubscriber(apiToken, subscriberId);
  return normalizeManyChatTags(subscriber.tags);
}
