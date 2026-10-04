/**
 * Paginación de las respuestas de Typeform y Google Forms (SCRUM-57).
 *
 * ⭐ Antes cada sync pedía una sola página de 1.000 y después avanzaba
 * `last_synced_at` igual: si un formulario recibía más de 1.000 respuestas entre
 * dos syncs, las que sobraban se perdían para siempre. Ahora se piden todas las
 * páginas, y si alguna falla se avisa (`completo: false`) para que la sync NO
 * avance el cursor y la próxima corrida las vuelva a pedir.
 *
 * Docs bajadas: `docs/external-apis/typeform/retrieve-responses.md` (cursor
 * `before`, orden por defecto `submitted_at,desc`, máx. 1.000 por página) y
 * `docs/external-apis/google-forms/forms.responses.list.md` (`pageToken` /
 * `nextPageToken`; el filtro tiene que ser el mismo en cada página).
 */

/** Tope de seguridad: nunca más de 50 páginas (50.000 respuestas) por formulario y corrida. */
export const MAX_PAGINAS_DE_RESPUESTAS = 50;

export type PaginaJson = (url: string) => Promise<{ ok: boolean; status: number; json: unknown }>;

export type Paginado<T> = { items: T[]; completo: boolean; status?: number };

type ItemTypeform = { token?: string };

export async function traerRespuestasTypeform<T extends ItemTypeform>(
  pedir: PaginaJson,
  formId: string,
  since: string | null
): Promise<Paginado<T>> {
  const PAGE_SIZE = 1000;
  const items: T[] = [];
  let before: string | null = null;

  for (let pagina = 0; pagina < MAX_PAGINAS_DE_RESPUESTAS; pagina++) {
    let url = `https://api.typeform.com/forms/${formId}/responses?page_size=${PAGE_SIZE}`;
    if (since) url += `&since=${encodeURIComponent(since)}`;
    if (before) url += `&before=${encodeURIComponent(before)}`;

    const res = await pedir(url);
    if (!res.ok) return { items, completo: false, status: res.status };

    const pageItems = ((res.json as { items?: T[] })?.items ?? []) as T[];
    items.push(...pageItems);

    // Página incompleta: no hay más. Orden por defecto submitted_at desc, así
    // que el siguiente lote es "antes" de la última respuesta recibida.
    if (pageItems.length < PAGE_SIZE) return { items, completo: true };
    const ultimo = pageItems[pageItems.length - 1]?.token;
    if (!ultimo) return { items, completo: false };
    before = ultimo;
  }

  // Se llegó al tope: lo traído se guarda, pero el cursor no avanza.
  return { items, completo: false };
}

export async function traerRespuestasGoogleForms<T>(
  pedir: PaginaJson,
  formId: string,
  since: string | null
): Promise<Paginado<T>> {
  const items: T[] = [];
  let pageToken: string | null = null;

  for (let pagina = 0; pagina < MAX_PAGINAS_DE_RESPUESTAS; pagina++) {
    let url = `https://forms.googleapis.com/v1/forms/${formId}/responses?pageSize=1000`;
    // El filtro tiene que ser el mismo en todas las páginas.
    if (since) url += `&filter=timestamp%3E${encodeURIComponent(since)}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await pedir(url);
    if (!res.ok) return { items, completo: false, status: res.status };

    const body = (res.json ?? {}) as { responses?: T[]; nextPageToken?: string };
    items.push(...(body.responses ?? []));

    if (!body.nextPageToken) return { items, completo: true };
    pageToken = body.nextPageToken;
  }

  return { items, completo: false };
}
