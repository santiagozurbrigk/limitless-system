"use server";

/**
 * A · WINS — CRUD del tracker, capturas y usos.
 *
 * Las columnas configurables de un win son campos de C0 (`entity = 'win'`) y se
 * validan con las mismas reglas: lo que no se entiende se rechaza, no se guarda
 * como cero.
 *
 * Las capturas van a un bucket **privado** (`client-wins`) y se leen por signed
 * URL — mismo patrón que `sop_attachments` y `trial-reels`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import {
  CONSENT_DISPLAYS,
  CONSENT_STATUSES,
  USAGE_STATES,
  WIN_USAGE_CHANNELS,
  type ClientBaseline,
  type ClientWin,
} from "@/types/wins";
import type {
  ClientWinRow,
  WinAttachment,
  WinAttachmentRow,
  WinUsage,
  WinUsageRow,
} from "@/types/wins";
import {
  CLIENT_WINS_BUCKET,
  WIN_SIGNED_URL_TTL_SECONDS,
  isAllowedWinAttachment,
  rowToClientWin,
  rowToWinAttachment,
  rowToWinUsage,
  sanitizeFilename,
} from "@/lib/wins";
import { activeFields, validateFieldValues } from "@/lib/custom-fields";
import { listFieldDefinitionsAction } from "@/app/clients/custom-field-actions";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  registrarFallaDeAccion,
  type MutationResult,
} from "@/lib/server/action-result";
import { respaldoDeLectura } from "@/lib/server/lectura-degradable";
import { firstZodError, uuidSchema } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paths } from "@/routes";
import { assertOrgStoragePath, soloRutasDeLaOrg } from "@/lib/storage/org-path";

const metricSchema = z
  .object({
    key: z.string().trim().min(1).max(60),
    value: z.number().finite(),
    unit: z.string().trim().max(20).nullable().default(null),
  })
  .nullable()
  .default(null);

const winSchema = z.object({
  clientId: z.string().uuid("Elegí el cliente."),
  winDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  achievement: z.string().trim().min(1, "Escribí qué logró.").max(500),
  metric: metricSchema,
  custom: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(2000).nullable().default(null),
  /** Adjuntos subidos antes de guardar; se enganchan al win recién creado. */
  draftId: uuidSchema.nullable().default(null),

  /**
   * ⭐ Los permisos del cliente. `not_asked` es el estado honesto por defecto:
   * no preguntamos todavía, así que no se puede usar.
   */
  consentStatus: z.enum(CONSENT_STATUSES).default("not_asked"),
  consentDisplay: z.enum(CONSENT_DISPLAYS).nullable().default(null),
  consentNote: z.string().trim().max(500).nullable().default(null),

  /** `used` no se manda: se deriva de los usos cargados. */
  usageState: z.enum(USAGE_STATES).default("unused"),
  needsScreenshot: z.boolean().default(false),
});

export type CreateWinInput = z.input<typeof winSchema>;

/**
 * Un permiso a medias no es un permiso: si autorizó, hay que saber **cómo
 * quiere aparecer**, porque de eso depende si se puede poner su nombre. Misma
 * regla que el check `client_wins_consent_check` en la base — acá se valida
 * para poder explicarla en castellano en vez de mostrar un error de Postgres.
 */
function assertConsentIsComplete(values: {
  consentStatus?: string;
  consentDisplay?: string | null;
}) {
  if (values.consentStatus === "granted" && !values.consentDisplay) {
    throw new ErrorEsperable("Si el cliente autorizó, elegí cómo quiere aparecer.");
  }
}

function revalidate(clientId?: string) {
  revalidatePath(paths.platform.clients.wins);
  if (clientId) revalidatePath(paths.platform.clients.detail(clientId));
}

/**
 * SCRUM-516: las escrituras de wins devuelven sus errores esperables como
 * valor (`MutationResult`), dentro de `mutacionConErroresEsperables`.
 * Validación, sesión, permiso del cliente a medias, captura que no es imagen o
 * es muy grande, y win o cliente que ya no existe (PGRST116, 23503) vuelven con
 * su motivo; lo inesperado (la base, Storage, una ruta ajena) se registra, va a
 * Sentry y vuelve con el texto fijo. Antes el texto crudo de la base o de
 * Storage llegaba al formulario.
 *
 * Las lecturas (`listWinsAction`, baselines y nichos) las componen la pantalla
 * de Wins y la revisión semanal, que esperan el dato: siguen devolviendo vacío
 * ante una falla, pero ahora la falla queda registrada (`respaldoDeLectura`).
 * Antes `catch { return [] }` la escondía.
 */

/** Código de PostgREST cuando `.single()` no encuentra la fila. */
const SIN_FILAS = "PGRST116";
/** Código de Postgres de una clave foránea que apunta a algo que no existe. */
const REFERENCIA_INEXISTENTE = "23503";

const WIN_NO_ENCONTRADO = "No se encontró el win. Puede que lo hayan borrado.";
const CLIENTE_INEXISTENTE = "El cliente que elegiste ya no existe. Recargá la página.";
const WIN_INEXISTENTE = "El win ya no existe. Recargá la página.";
const SIN_DESTINO = "Falta indicar a qué win va la captura.";

/** Escritura de un win: el win o el cliente que no está vuelven con su motivo. */
function errorDeWin(error: { message: string; code?: string | null }): Error {
  if (error.code === SIN_FILAS) return new ErrorEsperable(WIN_NO_ENCONTRADO);
  if (error.code === REFERENCIA_INEXISTENTE) return new ErrorEsperable(CLIENTE_INEXISTENTE);
  return new FallaDeLaBase(error);
}

/** Escritura que cuelga de un win (captura, uso): el win que ya no está. */
function errorDeLoDelWin(error: { message: string; code?: string | null }): Error {
  if (error.code === REFERENCIA_INEXISTENTE) return new ErrorEsperable(WIN_INEXISTENTE);
  return new FallaDeLaBase(error);
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/**
 * Los wins de la organización, con sus capturas y sus usos.
 *
 * Trae todo de una y arma en memoria: una consulta por win para adjuntos y otra
 * para usos serían dos consultas por fila de la tabla.
 *
 * Si no se pueden leer las capturas o los usos, los wins se muestran sin ellos
 * y la falla queda registrada.
 */
export async function listWinsAction(clientId?: string): Promise<ClientWin[]> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    let winsQuery = supabase
      .from("client_wins")
      .select("*")
      .eq("organization_id", organizationId)
      .order("win_date", { ascending: false });

    if (clientId) winsQuery = winsQuery.eq("client_id", clientId);

    const { data: winRows, error } = await winsQuery;
    if (error) {
      if (isMissingTableError(error.message)) return [];
      throw new FallaDeLaBase(error);
    }

    const rows = winRows as ClientWinRow[];
    if (rows.length === 0) return [];

    const winIds = rows.map((row) => row.id);
    const [attachmentsResult, usagesResult] = await Promise.all([
      supabase.from("win_attachments").select("*").in("win_id", winIds),
      supabase.from("win_usages").select("*").in("win_id", winIds),
    ]);

    const attachmentRows: WinAttachmentRow[] = attachmentsResult.error
      ? respaldoDeLectura("clientes:wins-capturas", new FallaDeLaBase(attachmentsResult.error), [])
      : ((attachmentsResult.data as WinAttachmentRow[]) ?? []);
    const usageRows: WinUsageRow[] = usagesResult.error
      ? respaldoDeLectura("clientes:wins-usos", new FallaDeLaBase(usagesResult.error), [])
      : ((usagesResult.data as WinUsageRow[]) ?? []);

    const attachments = await withSignedUrls(
      attachmentRows.map(rowToWinAttachment),
      organizationId
    );
    const usages = usageRows.map(rowToWinUsage);

    const byWinAttachments = groupBy(attachments, (item) => item.winId ?? "");
    const byWinUsages = groupBy(usages, (item) => item.winId);

    return rows.map((row) =>
      rowToClientWin(row, {
        attachments: byWinAttachments.get(row.id) ?? [],
        usages: byWinUsages.get(row.id) ?? [],
      })
    );
  } catch (error) {
    return respaldoDeLectura("clientes:wins", error, []);
  }
}

/** El baseline de cada cliente, para el dashboard. */
export async function listClientBaselinesAction(): Promise<
  Record<string, ClientBaseline>
> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clients")
      .select("id, niche, baseline_metric_key, baseline_metric_value, baseline_metric_unit, baseline_captured_at")
      .eq("organization_id", organizationId)
      .not("baseline_metric_key", "is", null);

    if (error) throw new FallaDeLaBase(error);

    const result: Record<string, ClientBaseline> = {};
    for (const row of data as {
      id: string;
      baseline_metric_key: string | null;
      baseline_metric_value: number | string | null;
      baseline_metric_unit: string | null;
      baseline_captured_at: string | null;
    }[]) {
      const key = row.baseline_metric_key?.trim();
      const value =
        typeof row.baseline_metric_value === "number"
          ? row.baseline_metric_value
          : Number(row.baseline_metric_value);
      // Un baseline sin número no es un baseline de cero: no existe.
      if (!key || !Number.isFinite(value)) continue;
      result[row.id] = {
        metricKey: key,
        metricValue: value,
        metricUnit: row.baseline_metric_unit?.trim() || null,
        capturedAt: row.baseline_captured_at,
      };
    }
    return result;
  } catch (error) {
    return respaldoDeLectura("clientes:wins-baselines", error, {});
  }
}

/** El nicho de cada cliente, para el dashboard. */
export async function listClientNichesAction(): Promise<Record<string, string>> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clients")
      .select("id, niche")
      .eq("organization_id", organizationId)
      .not("niche", "is", null);

    if (error) throw new FallaDeLaBase(error);
    const result: Record<string, string> = {};
    for (const row of data as { id: string; niche: string | null }[]) {
      if (row.niche?.trim()) result[row.id] = row.niche.trim();
    }
    return result;
  } catch (error) {
    return respaldoDeLectura("clientes:wins-nichos", error, {});
  }
}

// ─── Escritura ──────────────────────────────────────────────────────────────

export async function createWinAction(
  input: CreateWinInput
): Promise<MutationResult<ClientWin>> {
  return mutacionConErroresEsperables("[createWin]", async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();

    const parsed = winSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const values = parsed.data;

    assertConsentIsComplete(values);
    const custom = await validateCustom(values.custom);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_wins")
      .insert({
        organization_id: organizationId,
        client_id: values.clientId,
        win_date: values.winDate,
        achievement: values.achievement,
        metric_key: values.metric?.key ?? null,
        metric_value: values.metric?.value ?? null,
        metric_unit: values.metric?.unit ?? null,
        custom,
        source: "manual",
        notes: values.notes,
        created_by: profile?.id ?? null,
        consent_status: values.consentStatus,
        consent_display: values.consentDisplay,
        consent_note: values.consentNote,
        consent_updated_at:
          values.consentStatus === "not_asked" ? null : new Date().toISOString(),
        usage_state: values.usageState,
        needs_screenshot: values.needsScreenshot,
      })
      .select("*")
      .single();

    if (error) throw errorDeWin(error);

    const win = rowToClientWin(data as ClientWinRow);

    // Los adjuntos subidos antes de guardar se enganchan ahora. El win ya
    // quedó guardado: si esto falla no se devuelve error (reintentar crearía
    // otro win), pero la falla queda registrada en vez de perderse.
    if (values.draftId) {
      const { error: errorCapturas } = await supabase
        .from("win_attachments")
        .update({ win_id: win.id, draft_id: null })
        .eq("draft_id", values.draftId)
        .eq("organization_id", organizationId);
      if (errorCapturas) {
        registrarFallaDeAccion("[createWin] capturas", new FallaDeLaBase(errorCapturas));
      }
    }

    revalidate(values.clientId);
    return win;
  });
}

export async function updateWinAction(
  id: string,
  input: Partial<CreateWinInput>
): Promise<MutationResult<ClientWin>> {
  return mutacionConErroresEsperables("[updateWin]", async () => {
    const organizationId = await requireOrganizationId();

    const parsed = winSchema.partial().safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const values = parsed.data;

    const patch: Record<string, unknown> = {};
    if (values.winDate !== undefined) patch.win_date = values.winDate;
    if (values.achievement !== undefined) patch.achievement = values.achievement;
    if (values.notes !== undefined) patch.notes = values.notes;
    if (values.clientId !== undefined) patch.client_id = values.clientId;
    if (values.metric !== undefined) {
      patch.metric_key = values.metric?.key ?? null;
      patch.metric_value = values.metric?.value ?? null;
      patch.metric_unit = values.metric?.unit ?? null;
    }
    if (values.custom !== undefined) {
      patch.custom = await validateCustom(values.custom);
    }
    if (values.usageState !== undefined) patch.usage_state = values.usageState;
    if (values.needsScreenshot !== undefined) {
      patch.needs_screenshot = values.needsScreenshot;
    }
    if (values.consentNote !== undefined) patch.consent_note = values.consentNote;

    // La fecha del permiso se pisa sólo si el permiso cambió: es el dato que
    // después responde "¿cuándo dijo que sí?".
    if (values.consentStatus !== undefined) {
      assertConsentIsComplete(values);
      patch.consent_status = values.consentStatus;
      patch.consent_display = values.consentDisplay ?? null;
      patch.consent_updated_at =
        patch.consent_status === "not_asked" ? null : new Date().toISOString();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_wins")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) throw errorDeWin(error);
    const win = rowToClientWin(data as ClientWinRow);
    revalidate(win.clientId);
    return win;
  });
}

/**
 * Borra un win con sus capturas.
 *
 * Los archivos del bucket se borran también: la cascada de la base se lleva las
 * filas, pero no los objetos de storage — quedarían ocupando lugar para siempre.
 * Por eso, si no se pueden leer o borrar las capturas, no se borra el win:
 * vuelve el texto fijo y se puede reintentar sin dejar archivos huérfanos.
 */
export async function deleteWinAction(id: string): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteWin]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: attachments, error: readError } = await supabase
      .from("win_attachments")
      .select("storage_path")
      .eq("win_id", id)
      .eq("organization_id", organizationId);
    if (readError) throw new FallaDeLaBase(readError);

    const paths_ = soloRutasDeLaOrg(
      ((attachments as { storage_path: string }[]) ?? []).map((row) => row.storage_path),
      organizationId,
      "wins"
    );
    if (paths_.length > 0) {
      const admin = createAdminClient();
      const { error: storageError } = await admin.storage
        .from(CLIENT_WINS_BUCKET)
        .remove(paths_);
      if (storageError) throw new FallaDeLaBase(storageError);
    }

    const { error } = await supabase
      .from("client_wins")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidate();
  });
}

// ─── Capturas ───────────────────────────────────────────────────────────────

/** Paso 1: pedir el link firmado de subida. Copia de `prepareSopAttachmentUploadAction`. */
/**
 * ⭐ Una captura se puede subir a un win que **ya existe**, no sólo a uno nuevo.
 *
 * Antes sólo se aceptaba `draftId` —el identificador temporal de un win que
 * todavía no se guardó—, así que al **editar** un win ya guardado la pantalla
 * respondía "guardá el win y después agregá la captura". Pero ya estaba
 * guardado: no había ninguna forma de llegar a agregarla.
 *
 * Ahora va uno de los dos: `winId` cuando el win existe, `draftId` cuando se
 * está creando. Nunca ninguno.
 */
type DestinoDeCaptura = { draftId?: string; winId?: string };

function rutaDeCaptura(
  organizationId: string,
  destino: DestinoDeCaptura,
  archivo: string
): string {
  if (destino.winId) return `${organizationId}/wins/${destino.winId}/${archivo}`;
  if (destino.draftId) return `${organizationId}/drafts/${destino.draftId}/${archivo}`;
  throw new ErrorEsperable(SIN_DESTINO);
}

export async function prepareWinAttachmentUploadAction(input: DestinoDeCaptura & {
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<
  MutationResult<{ storagePath: string; signedUrl: string; contentType: string }>
> {
  return mutacionConErroresEsperables("[prepareWinAttachmentUpload]", async () => {
    const organizationId = await requireOrganizationId();

    const allowed = isAllowedWinAttachment(
      input.fileName,
      input.mimeType,
      input.fileSize
    );
    if (!allowed.ok) throw new ErrorEsperable(allowed.error);

    const attachmentId = crypto.randomUUID();
    const safeName = sanitizeFilename(input.fileName);
    const storagePath = rutaDeCaptura(
      organizationId,
      input,
      `${attachmentId}-${safeName}`
    );

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(CLIENT_WINS_BUCKET)
      .createSignedUploadUrl(storagePath);

    // Sin el bucket o con Storage caído es una falla: el texto de Storage no
    // le sirve al usuario.
    if (error) throw new FallaDeLaBase(error);
    if (!data?.signedUrl) {
      throw new FallaDeLaBase({
        message: `Storage no devolvió el link de subida del bucket "${CLIENT_WINS_BUCKET}"`,
      });
    }

    return { storagePath, signedUrl: data.signedUrl, contentType: allowed.mimeType };
  });
}

/**
 * Paso 2: registrar la captura ya subida. Una ruta de otra organización
 * (`assertOrgStoragePath`) es inesperada: es una señal de manipulación, no un
 * error del usuario (el mismo criterio que el Tablero, SCRUM-503).
 */
export async function finalizeWinAttachmentAction(input: DestinoDeCaptura & {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<MutationResult<WinAttachment>> {
  return mutacionConErroresEsperables("[finalizeWinAttachment]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    if (!input.winId && !input.draftId) {
      throw new ErrorEsperable(SIN_DESTINO);
    }
    assertOrgStoragePath(input.storagePath, organizationId);

    const { data, error } = await supabase
      .from("win_attachments")
      .insert({
        organization_id: organizationId,
        // Uno de los dos, nunca los dos: la base lo hace cumplir.
        win_id: input.winId ?? null,
        draft_id: input.winId ? null : (input.draftId ?? null),
        file_name: input.fileName,
        storage_path: input.storagePath,
        mime_type: input.mimeType,
        file_size: input.fileSize,
      })
      .select("*")
      .single();

    if (error) throw errorDeLoDelWin(error);
    const [withUrl] = await withSignedUrls(
      [rowToWinAttachment(data as WinAttachmentRow)],
      organizationId
    );
    return withUrl!;
  });
}

/**
 * Borra una captura. Primero el archivo y después la fila: si Storage falla,
 * no se borra la fila (quedaría el archivo sin dueño) y vuelve el texto fijo.
 */
export async function deleteWinAttachmentAction(
  id: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteWinAttachment]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error: readError } = await supabase
      .from("win_attachments")
      .select("storage_path")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (readError) throw new FallaDeLaBase(readError);

    const rutas = soloRutasDeLaOrg(
      [(data as { storage_path: string } | null)?.storage_path],
      organizationId,
      "wins"
    );
    if (rutas.length > 0) {
      const admin = createAdminClient();
      const { error: storageError } = await admin.storage
        .from(CLIENT_WINS_BUCKET)
        .remove(rutas);
      if (storageError) throw new FallaDeLaBase(storageError);
    }

    const { error } = await supabase
      .from("win_attachments")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidate();
  });
}

// ─── Usos ───────────────────────────────────────────────────────────────────

const usageSchema = z.object({
  winId: uuidSchema,
  channel: z.enum(WIN_USAGE_CHANNELS),
  locationLabel: z.string().trim().max(200).nullable().default(null),
  url: z.string().trim().url("El link no es válido.").max(500).nullable().default(null),
  usedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  notes: z.string().trim().max(500).nullable().default(null),
});

export type CreateWinUsageInput = z.input<typeof usageSchema>;

export async function addWinUsageAction(
  input: CreateWinUsageInput
): Promise<MutationResult<WinUsage>> {
  return mutacionConErroresEsperables("[addWinUsage]", async () => {
    const organizationId = await requireOrganizationId();
    const parsed = usageSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const values = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("win_usages")
      .insert({
        organization_id: organizationId,
        win_id: values.winId,
        channel: values.channel,
        location_label: values.locationLabel,
        url: values.url,
        used_at: values.usedAt,
        notes: values.notes,
      })
      .select("*")
      .single();

    if (error) throw errorDeLoDelWin(error);
    revalidate();
    return rowToWinUsage(data as WinUsageRow);
  });
}

export async function deleteWinUsageAction(id: string): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteWinUsage]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { error } = await supabase
      .from("win_usages")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new FallaDeLaBase(error);
    revalidate();
  });
}

// ─── Baseline y nicho del cliente ───────────────────────────────────────────

const baselineSchema = z.object({
  niche: z.string().trim().max(120).nullable().default(null),
  baselineMetricKey: z.string().trim().max(60).nullable().default(null),
  baselineMetricValue: z.number().finite().nullable().default(null),
  baselineMetricUnit: z.string().trim().max(20).nullable().default(null),
  baselineCapturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export async function updateClientBaselineAction(
  clientId: string,
  input: z.input<typeof baselineSchema>
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[updateClientBaseline]", async () => {
    const organizationId = await requireOrganizationId();
    const parsed = baselineSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const values = parsed.data;

    // Una clave sin número, o un número sin clave, no forman un baseline: se
    // guarda vacío en vez de medio cargado.
    const hasBaseline =
      values.baselineMetricKey !== null && values.baselineMetricValue !== null;

    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .update({
        niche: values.niche,
        baseline_metric_key: hasBaseline ? values.baselineMetricKey : null,
        baseline_metric_value: hasBaseline ? values.baselineMetricValue : null,
        baseline_metric_unit: hasBaseline ? values.baselineMetricUnit : null,
        baseline_captured_at: hasBaseline ? values.baselineCapturedAt : null,
      })
      .eq("id", clientId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidate(clientId);
  });
}

// ─── Ayudas ─────────────────────────────────────────────────────────────────

/** Valida las columnas configurables con las reglas de C0. */
async function validateCustom(raw: Record<string, unknown>) {
  const fields = activeFields(await listFieldDefinitionsAction("win"));
  const validation = validateFieldValues(fields, raw);
  if (!validation.ok) {
    throw new ErrorEsperable(Object.values(validation.errors)[0] ?? "Datos inválidos");
  }
  return validation.values;
}

/**
 * El bucket es privado: cada captura necesita su link firmado para verse. Sólo
 * se firman rutas de la org (SCRUM-81); una ajena queda sin link. Si Storage no
 * firma, las capturas quedan sin link y la falla se registra.
 */
async function withSignedUrls(
  attachments: WinAttachment[],
  organizationId: string
): Promise<WinAttachment[]> {
  if (attachments.length === 0) return [];

  const rutas = soloRutasDeLaOrg(
    attachments.map((item) => item.storagePath),
    organizationId,
    "wins"
  );
  const admin = createAdminClient();
  const { data, error } =
    rutas.length > 0
      ? await admin.storage.from(CLIENT_WINS_BUCKET).createSignedUrls(rutas, WIN_SIGNED_URL_TTL_SECONDS)
      : { data: [], error: null };
  // Sin links las capturas no se ven, pero el win sí: la falla se registra.
  if (error) respaldoDeLectura("clientes:wins-links-de-capturas", new FallaDeLaBase(error), null);

  const urlByPath = new Map(
    (data ?? []).map((entry) => [entry.path ?? "", entry.signedUrl])
  );

  return attachments.map((item) => ({
    ...item,
    signedUrl: urlByPath.get(item.storagePath) ?? null,
  }));
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}
