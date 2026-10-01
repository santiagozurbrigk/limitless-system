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
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
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
  draftId: z.string().uuid().nullable().default(null),

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
    throw new Error("Si el cliente autorizó, elegí cómo quiere aparecer.");
  }
}

function revalidate(clientId?: string) {
  revalidatePath(paths.platform.clients.wins);
  if (clientId) revalidatePath(paths.platform.clients.detail(clientId));
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/**
 * Los wins de la organización, con sus capturas y sus usos.
 *
 * Trae todo de una y arma en memoria: una consulta por win para adjuntos y otra
 * para usos serían dos consultas por fila de la tabla.
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
      console.error("[listWins]", error.message);
      return [];
    }

    const rows = winRows as ClientWinRow[];
    if (rows.length === 0) return [];

    const winIds = rows.map((row) => row.id);
    const [attachmentsResult, usagesResult] = await Promise.all([
      supabase.from("win_attachments").select("*").in("win_id", winIds),
      supabase.from("win_usages").select("*").in("win_id", winIds),
    ]);

    const attachments = await withSignedUrls(
      ((attachmentsResult.data as WinAttachmentRow[]) ?? []).map(rowToWinAttachment),
      organizationId
    );
    const usages = ((usagesResult.data as WinUsageRow[]) ?? []).map(rowToWinUsage);

    const byWinAttachments = groupBy(attachments, (item) => item.winId ?? "");
    const byWinUsages = groupBy(usages, (item) => item.winId);

    return rows.map((row) =>
      rowToClientWin(row, {
        attachments: byWinAttachments.get(row.id) ?? [],
        usages: byWinUsages.get(row.id) ?? [],
      })
    );
  } catch {
    return [];
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

    if (error) return {};

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
  } catch {
    return {};
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

    if (error) return {};
    const result: Record<string, string> = {};
    for (const row of data as { id: string; niche: string | null }[]) {
      if (row.niche?.trim()) result[row.id] = row.niche.trim();
    }
    return result;
  } catch {
    return {};
  }
}

// ─── Escritura ──────────────────────────────────────────────────────────────

export async function createWinAction(
  input: CreateWinInput
): Promise<MutationResult<ClientWin>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();

    const parsed = winSchema.safeParse(input);
    if (!parsed.success) throw new Error(firstZodError(parsed.error));
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

    if (error) throw new Error(error.message);

    const win = rowToClientWin(data as ClientWinRow);

    // Los adjuntos subidos antes de guardar se enganchan ahora.
    if (values.draftId) {
      await supabase
        .from("win_attachments")
        .update({ win_id: win.id, draft_id: null })
        .eq("draft_id", values.draftId)
        .eq("organization_id", organizationId);
    }

    revalidate(values.clientId);
    return win;
  });
}

export async function updateWinAction(
  id: string,
  input: Partial<CreateWinInput>
): Promise<MutationResult<ClientWin>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();

    const parsed = winSchema.partial().safeParse(input);
    if (!parsed.success) throw new Error(firstZodError(parsed.error));
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

    if (error) throw new Error(error.message);
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
 */
export async function deleteWinAction(id: string): Promise<MutationResult<void>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: attachments } = await supabase
      .from("win_attachments")
      .select("storage_path")
      .eq("win_id", id)
      .eq("organization_id", organizationId);

    const paths_ = soloRutasDeLaOrg(
      ((attachments as { storage_path: string }[]) ?? []).map((row) => row.storage_path),
      organizationId,
      "wins"
    );
    if (paths_.length > 0) {
      const admin = createAdminClient();
      await admin.storage.from(CLIENT_WINS_BUCKET).remove(paths_);
    }

    const { error } = await supabase
      .from("client_wins")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
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
  throw new Error("Falta indicar a qué win va la captura.");
}

export async function prepareWinAttachmentUploadAction(input: DestinoDeCaptura & {
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<
  MutationResult<{ storagePath: string; signedUrl: string; contentType: string }>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();

    const allowed = isAllowedWinAttachment(
      input.fileName,
      input.mimeType,
      input.fileSize
    );
    if (!allowed.ok) throw new Error(allowed.error);

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

    if (error || !data?.signedUrl) {
      throw new Error(
        error?.message ??
          `No se pudo preparar la subida. ¿Existe el bucket "${CLIENT_WINS_BUCKET}"?`
      );
    }

    return { storagePath, signedUrl: data.signedUrl, contentType: allowed.mimeType };
  });
}

/** Paso 2: registrar la captura ya subida. */
export async function finalizeWinAttachmentAction(input: DestinoDeCaptura & {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<MutationResult<WinAttachment>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    if (!input.winId && !input.draftId) {
      throw new Error("Falta indicar a qué win va la captura.");
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

    if (error) throw new Error(error.message);
    const [withUrl] = await withSignedUrls(
      [rowToWinAttachment(data as WinAttachmentRow)],
      organizationId
    );
    return withUrl!;
  });
}

export async function deleteWinAttachmentAction(
  id: string
): Promise<MutationResult<void>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data } = await supabase
      .from("win_attachments")
      .select("storage_path")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    const rutas = soloRutasDeLaOrg(
      [(data as { storage_path: string } | null)?.storage_path],
      organizationId,
      "wins"
    );
    if (rutas.length > 0) {
      const admin = createAdminClient();
      await admin.storage.from(CLIENT_WINS_BUCKET).remove(rutas);
    }

    const { error } = await supabase
      .from("win_attachments")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidate();
  });
}

// ─── Usos ───────────────────────────────────────────────────────────────────

const usageSchema = z.object({
  winId: z.string().uuid(),
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
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const parsed = usageSchema.safeParse(input);
    if (!parsed.success) throw new Error(firstZodError(parsed.error));
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

    if (error) throw new Error(error.message);
    revalidate();
    return rowToWinUsage(data as WinUsageRow);
  });
}

export async function deleteWinUsageAction(id: string): Promise<MutationResult<void>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { error } = await supabase
      .from("win_usages")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
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
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const parsed = baselineSchema.safeParse(input);
    if (!parsed.success) throw new Error(firstZodError(parsed.error));
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

    if (error) throw new Error(error.message);
    revalidate(clientId);
  });
}

// ─── Ayudas ─────────────────────────────────────────────────────────────────

/** Valida las columnas configurables con las reglas de C0. */
async function validateCustom(raw: Record<string, unknown>) {
  const fields = activeFields(await listFieldDefinitionsAction("win"));
  const validation = validateFieldValues(fields, raw);
  if (!validation.ok) {
    throw new Error(Object.values(validation.errors)[0] ?? "Datos inválidos");
  }
  return validation.values;
}

/**
 * El bucket es privado: cada captura necesita su link firmado para verse. Sólo
 * se firman rutas de la org (SCRUM-81); una ajena queda sin link.
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
  const { data } =
    rutas.length > 0
      ? await admin.storage.from(CLIENT_WINS_BUCKET).createSignedUrls(rutas, WIN_SIGNED_URL_TTL_SECONDS)
      : { data: [] };

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
