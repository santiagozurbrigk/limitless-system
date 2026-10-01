"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { scheduleBusinessContextRagIndexing } from "@/lib/business-context/schedule-rag-indexing";
import { assertDocumentIndexed } from "@/lib/business-context/rag-indexing";
import { isOpenAIConfigured } from "@/lib/rag/embeddings";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  exportGoogleDriveFile,
  exportGoogleDocAsMarkdown,
  exportGoogleDriveFilePreview,
  getGoogleDriveFileMetadata,
  GOOGLE_DOC_MIME,
  GOOGLE_SHEET_MIME,
  listGoogleDriveFilesByMime,
  type GoogleDriveContentFile,
} from "@/lib/google/drive-content";
import { getGoogleAccessTokenForOrganization } from "@/lib/google/get-access-token";
import { googleDriveFileIdSchema } from "@/lib/google/drive-schemas";
import { isGooglePermissionError } from "@/lib/google/errors";
import { loadFathomCallsForKnowledgeBase } from "@/lib/fathom/knowledge-base-queries";
import {
  BUSINESS_CONTEXT_BUCKET,
  DOCUMENT_CATEGORIES,
} from "@/lib/business-context/constants";
import {
  isAllowedDocumentFile,
  sanitizeFilename,
} from "@/lib/business-context/file-types";
import { extractTextFromFile } from "@/lib/business-context/extract-text";
import {
  mapDocumentRowToContextDocument,
  type BusinessContextDocumentRow,
} from "@/lib/business-context/types";
import type { ContextDocument, FathomKnowledgeCall } from "@/types/business-context";
import { paths } from "@/routes";
import { assertOrgStoragePath, soloRutasDeLaOrg } from "@/lib/storage/org-path";

const ROW_COLUMNS =
  "id, organization_id, title, category, source, content_text, content_markdown, storage_path, mime_type, status, index_error, external_source_id, uploaded_by, created_at, updated_at";

// Accept built-in slugs AND custom org slugs (any non-empty lowercase-dashed string)
const categorySchema = z
  .string()
  .trim()
  .min(1, "La categoría es obligatoria")
  .max(80, "Slug de categoría demasiado largo")
  .regex(/^[a-z0-9_-]+$/, "Slug inválido");

const createTextNoteSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  category: categorySchema,
  content: z.string().trim().min(1, "El contenido es obligatorio").max(100_000),
});

const prepareFileUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1).max(200),
});

const createFromFileSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  category: categorySchema,
  storagePath: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
});

const idSchema = z.string().uuid("Identificador inválido");

const importGoogleSourceSchema = z.object({
  googleFileId: googleDriveFileIdSchema,
  category: categorySchema,
});

const previewGoogleFileSchema = z.object({
  googleFileId: googleDriveFileIdSchema,
  kind: z.enum(["doc", "sheet"]),
});

export type GoogleDriveListItem = GoogleDriveContentFile;

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Borra el documento RAG (y sus chunks) asociado a un documento de contexto. */
async function removeFromRag(
  organizationId: string,
  sourceId: string
): Promise<void> {
  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("rag_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .in("source_type", ["business_context_note", "business_context_document"])
    .eq("source_id", sourceId);

  const ids = (docs ?? []).map((d) => d.id as string);
  if (!ids.length) return;

  await admin.from("rag_chunks").delete().in("document_id", ids);
  await admin.from("rag_documents").delete().in("id", ids);
}

// ---------------------------------------------------------------------------
// Notas de texto
// ---------------------------------------------------------------------------

export async function createTextNoteAction(
  input: unknown
): Promise<MutationResult<{ id: string }>> {
  const parsed = createTextNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const uploadedBy = await currentUserId();
    const admin = createAdminClient();
    const { title, category, content } = parsed.data;

    const { data: row, error } = await admin
      .from("business_context_documents")
      .insert({
        organization_id: organizationId,
        title,
        category,
        source: "manual",
        content_text: content,
        status: "processing",
        uploaded_by: uploadedBy,
      })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message ?? "No se pudo guardar la nota");
    }

    const docId = row.id as string;
    console.error("[BusinessContext:RAG] createTextNoteAction saved", {
      docId,
      organizationId,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      openaiConfigured: isOpenAIConfigured(),
    });

    const schedule = await scheduleBusinessContextRagIndexing({
      organizationId,
      id: docId,
      sourceType: "business_context_note",
      title,
      category,
      content,
    });

    console.error("[BusinessContext:RAG] createTextNoteAction scheduled", {
      docId,
      mode: schedule.mode,
      ...(schedule.mode === "inline" ? { chunkCount: schedule.chunkCount } : {}),
    });

    revalidatePath(paths.platform.businessContext.documents);
    return { id: row.id as string };
  });
}

// ---------------------------------------------------------------------------
// Subida de archivos (PDF / TXT / MD)
// ---------------------------------------------------------------------------

export async function prepareDocumentFileUploadAction(
  input: unknown
): Promise<MutationResult<{ storagePath: string; signedUrl: string; contentType: string }>> {
  const parsed = prepareFileUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const { fileName, fileSize, mimeType } = parsed.data;

    const allowed = isAllowedDocumentFile(fileName, mimeType, fileSize);
    if (!allowed.ok) throw new Error(allowed.error);

    const docId = crypto.randomUUID();
    const safeName = sanitizeFilename(fileName);
    const storagePath = `${organizationId}/${docId}-${safeName}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(BUSINESS_CONTEXT_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      throw new Error(
        error?.message ??
          `No se pudo preparar la subida. ¿Existe el bucket "${BUSINESS_CONTEXT_BUCKET}"?`
      );
    }

    return {
      storagePath,
      signedUrl: data.signedUrl,
      contentType: allowed.mimeType,
    };
  });
}

export async function createDocumentFromFileAction(
  input: unknown
): Promise<MutationResult<{ id: string }>> {
  const parsed = createFromFileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const uploadedBy = await currentUserId();
    const admin = createAdminClient();
    const { title, category, mimeType } = parsed.data;
    const storagePath = assertOrgStoragePath(parsed.data.storagePath, organizationId);

    const allowed = isAllowedDocumentFile(parsed.data.fileName, mimeType);
    if (!allowed.ok) throw new Error(allowed.error);

    const { data: row, error } = await admin
      .from("business_context_documents")
      .insert({
        organization_id: organizationId,
        title,
        category,
        source: "manual",
        storage_path: storagePath,
        mime_type: allowed.mimeType,
        status: "processing",
        uploaded_by: uploadedBy,
      })
      .select("id")
      .single();

    if (error || !row) {
      throw new Error(error?.message ?? "No se pudo registrar el documento");
    }

    const id = row.id as string;

    // Descargar, extraer texto e indexar en RAG (best-effort, no bloquea el alta).
    let extracted = "";
    try {
      const { data: file, error: downloadError } = await admin.storage
        .from(BUSINESS_CONTEXT_BUCKET)
        .download(storagePath);

      if (downloadError || !file) {
        throw new Error(downloadError?.message ?? "No se pudo leer el archivo subido");
      }

      const buffer = await file.arrayBuffer();
      extracted = await extractTextFromFile(buffer, allowed.mimeType);
    } catch (err) {
      console.error("[BusinessContext] extracción de texto falló:", err);
    }

    if (!extracted.trim()) {
      await admin
        .from("business_context_documents")
        .update({
          status: "error",
          index_error: "No se pudo extraer texto del archivo (¿PDF escaneado o vacío?)",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      throw new Error(
        "El archivo se subió pero no se pudo extraer texto para indexar (¿PDF escaneado o vacío?)."
      );
    }

    await admin
      .from("business_context_documents")
      .update({ content_text: extracted, updated_at: new Date().toISOString() })
      .eq("id", id);

    await scheduleBusinessContextRagIndexing({
      organizationId,
      id,
      sourceType: "business_context_document",
      title,
      category,
      content: extracted,
    });

    revalidatePath(paths.platform.businessContext.documents);
    return { id };
  });
}

// ---------------------------------------------------------------------------
// Google Docs y Sheets (Drive API — scope drive.readonly ya en OAuth unificado)
// ---------------------------------------------------------------------------

async function requireGoogleAccessToken(): Promise<string> {
  const organizationId = await requireOrganizationId();
  const token = await getGoogleAccessTokenForOrganization(organizationId);
  if (!token) {
    throw new Error(
      "Google no está conectado. Conectá tu cuenta desde Integraciones para importar Docs y Sheets."
    );
  }
  return token;
}

async function assertGoogleSourceNotImported(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  source: "google_doc" | "google_sheet",
  googleFileId: string
): Promise<void> {
  const { data } = await admin
    .from("business_context_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("source", source)
    .eq("external_source_id", googleFileId)
    .maybeSingle();

  if (data?.id) {
    throw new Error("Este archivo de Google ya está en tu base de conocimiento.");
  }
}

async function importGoogleDriveContent(args: {
  source: "google_doc" | "google_sheet";
  googleFileId: string;
  category: string;
  exportMimeType: string;
  emptyContentMessage: string;
}): Promise<{ id: string }> {
  const organizationId = await requireOrganizationId();
  const uploadedBy = await currentUserId();
  const admin = createAdminClient();
  const accessToken = await requireGoogleAccessToken();

  await assertGoogleSourceNotImported(
    admin,
    organizationId,
    args.source,
    args.googleFileId
  );

  let content: string;
  let contentMarkdown: string | null = null;
  let title: string;

  try {
    const [exported, meta] = await Promise.all([
      exportGoogleDriveFile(accessToken, args.googleFileId, args.exportMimeType),
      getGoogleDriveFileMetadata(accessToken, args.googleFileId),
    ]);
    content = exported.trim();
    title = meta?.name?.trim() || "Documento de Google";

    // For Google Docs, also export as Markdown to preserve structure in the viewer.
    // Falls back to null silently if the API doesn't support it.
    if (args.source === "google_doc") {
      contentMarkdown = await exportGoogleDocAsMarkdown(accessToken, args.googleFileId);
    }
  } catch (err) {
    if (isGooglePermissionError(err)) {
      throw new Error(
        "Permisos de Google insuficientes. Reconectá tu cuenta desde Integraciones."
      );
    }
    throw err;
  }

  if (!content) {
    throw new Error(args.emptyContentMessage);
  }

  const { data: row, error } = await admin
    .from("business_context_documents")
    .insert({
      organization_id: organizationId,
      title,
      category: args.category,
      source: args.source,
      external_source_id: args.googleFileId,
      content_text: content,
      content_markdown: contentMarkdown,
      status: "processing",
      uploaded_by: uploadedBy,
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? "No se pudo guardar el documento importado");
  }

  const docId = row.id as string;

  const schedule = await scheduleBusinessContextRagIndexing({
    organizationId,
    id: docId,
    sourceType: "business_context_document",
    title,
    category: args.category,
    content,
  });

  if (schedule.mode === "inline") {
    await assertDocumentIndexed(admin, docId);
  }

  revalidatePath(paths.platform.businessContext.documents);
  return { id: docId };
}

export async function getGoogleDocsListAction(): Promise<GoogleDriveListItem[]> {
  const accessToken = await requireGoogleAccessToken();
  try {
    return await listGoogleDriveFilesByMime(accessToken, GOOGLE_DOC_MIME);
  } catch (err) {
    if (isGooglePermissionError(err)) {
      throw new Error(
        "Permisos de Google insuficientes. Reconectá tu cuenta desde Integraciones."
      );
    }
    throw err;
  }
}

export async function getGoogleSheetsListAction(): Promise<GoogleDriveListItem[]> {
  const accessToken = await requireGoogleAccessToken();
  try {
    return await listGoogleDriveFilesByMime(accessToken, GOOGLE_SHEET_MIME);
  } catch (err) {
    if (isGooglePermissionError(err)) {
      throw new Error(
        "Permisos de Google insuficientes. Reconectá tu cuenta desde Integraciones."
      );
    }
    throw err;
  }
}

/** Vista previa lazy del contenido exportado (solo al seleccionar en el picker). */
export async function previewGoogleDriveFileAction(
  input: unknown
): Promise<{ preview: string }> {
  const parsed = previewGoogleFileSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  const accessToken = await requireGoogleAccessToken();
  const exportMime = parsed.data.kind === "doc" ? "text/plain" : "text/csv";

  try {
    const preview = await exportGoogleDriveFilePreview(
      accessToken,
      parsed.data.googleFileId,
      exportMime
    );
    return { preview };
  } catch (err) {
    if (isGooglePermissionError(err)) {
      throw new Error(
        "Permisos de Google insuficientes. Reconectá tu cuenta desde Integraciones."
      );
    }
    throw err;
  }
}

export async function importGoogleDocAction(
  input: unknown
): Promise<MutationResult<{ id: string }>> {
  const parsed = importGoogleSourceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () =>
    importGoogleDriveContent({
      source: "google_doc",
      googleFileId: parsed.data.googleFileId,
      category: parsed.data.category,
      exportMimeType: "text/plain",
      emptyContentMessage: "El Google Doc está vacío o no se pudo leer su contenido.",
    })
  );
}

export async function importGoogleSheetAction(
  input: unknown
): Promise<MutationResult<{ id: string }>> {
  const parsed = importGoogleSourceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () =>
    importGoogleDriveContent({
      source: "google_sheet",
      googleFileId: parsed.data.googleFileId,
      category: parsed.data.category,
      exportMimeType: "text/csv",
      emptyContentMessage: "La Google Sheet está vacía o no se pudo exportar como CSV.",
    })
  );
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export async function getBusinessContextDocumentsAction(): Promise<
  ContextDocument[]
> {
  const organizationId = await requireOrganizationId();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("business_context_documents")
    .select(ROW_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[BusinessContext] listar documentos:", error.message);
    return [];
  }

  return (data ?? []).map((row) =>
    mapDocumentRowToContextDocument(row as BusinessContextDocumentRow)
  );
}

export async function getFathomContextCallsAction(): Promise<{
  contextCalls: FathomKnowledgeCall[];
  clientMeetingCalls: FathomKnowledgeCall[];
}> {
  const organizationId = await requireOrganizationId();
  return loadFathomCallsForKnowledgeBase(organizationId);
}

export async function getDocumentByIdAction(
  id: string
): Promise<ContextDocument | null> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return null;

  const organizationId = await requireOrganizationId();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("business_context_documents")
    .select(ROW_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", parsed.data)
    .maybeSingle();

  if (error || !data) return null;
  return mapDocumentRowToContextDocument(data as BusinessContextDocumentRow);
}

export async function getDocumentOriginalFileUrlAction(
  input: unknown
): Promise<MutationResult<{ url: string; mimeType: string | null }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Identificador inválido" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    const { data: row, error } = await admin
      .from("business_context_documents")
      .select("storage_path, mime_type")
      .eq("organization_id", organizationId)
      .eq("id", parsed.data)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row?.storage_path) throw new Error("Este documento no tiene archivo original");

    const { data, error: signedUrlError } = await admin.storage
      .from(BUSINESS_CONTEXT_BUCKET)
      .createSignedUrl(assertOrgStoragePath(row.storage_path, organizationId), 3600);

    if (signedUrlError || !data?.signedUrl) {
      throw new Error(
        signedUrlError?.message ?? "No se pudo abrir el archivo original"
      );
    }

    return {
      url: data.signedUrl,
      mimeType: (row.mime_type as string | null) ?? null,
    };
  });
}

export async function deleteDocumentAction(
  input: unknown
): Promise<MutationResult<{ id: string }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Identificador inválido" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();
    const id = parsed.data;

    const { data: row } = await admin
      .from("business_context_documents")
      .select("id, storage_path")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();

    if (!row) throw new Error("Documento no encontrado");

    const rutas = soloRutasDeLaOrg([row.storage_path as string | null], organizationId, "business-context");
    if (rutas.length > 0) {
      await admin.storage.from(BUSINESS_CONTEXT_BUCKET).remove(rutas);
    }

    await removeFromRag(organizationId, id);

    const { error } = await admin
      .from("business_context_documents")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", id);

    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.businessContext.documents);
    revalidatePath(paths.platform.businessContext.viewer(id));
    return { id };
  });
}

// ---------------------------------------------------------------------------
// Re-sincronizar contenido Markdown (para Google Docs importados antes de que
// se soportara la exportación en Markdown)
// ---------------------------------------------------------------------------

export async function resyncDocumentMarkdownAction(
  input: unknown
): Promise<MutationResult<{ id: string }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Identificador inválido" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();
    const id = parsed.data;

    const { data: row } = await admin
      .from("business_context_documents")
      .select("id, source, external_source_id")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();

    if (!row) throw new Error("Documento no encontrado");
    if (row.source !== "google_doc" || !row.external_source_id) {
      throw new Error(
        "Solo los Google Docs pueden regenerar su formato Markdown."
      );
    }

    const accessToken = await requireGoogleAccessToken();
    const markdown = await exportGoogleDocAsMarkdown(
      accessToken,
      row.external_source_id as string
    );

    if (!markdown) {
      throw new Error(
        "No se pudo obtener el formato Markdown de este Google Doc. " +
          "Verificá que tu cuenta de Google tenga acceso al documento."
      );
    }

    const { error } = await admin
      .from("business_context_documents")
      .update({
        content_markdown: markdown,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", id);

    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.businessContext.viewer(id));
    return { id };
  });
}

// ---------------------------------------------------------------------------
// Custom categories
// ---------------------------------------------------------------------------

export type CustomCategoryRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  created_at: string;
};

const customCategoryNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre es obligatorio")
  .max(60, "Máximo 60 caracteres");

function toSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

export async function getCustomCategoriesAction(): Promise<CustomCategoryRow[]> {
  if (!isSupabaseConfigured()) return [];
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();
  const { data } = await supabase
    .from("knowledge_base_categories")
    .select("id, organization_id, name, slug, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as CustomCategoryRow[];
}

export async function createCustomCategoryAction(
  input: unknown
): Promise<MutationResult<CustomCategoryRow>> {
  const parsed = customCategoryNameSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Nombre inválido" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const name = parsed.data.trim();
    const slug = toSlug(name);

    if (!slug) throw new Error("Nombre inválido para generar un slug");

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("knowledge_base_categories")
      .insert({ organization_id: organizationId, name, slug })
      .select("id, organization_id, name, slug, created_at")
      .single();

    if (error) {
      if (error.code === "23505") throw new Error("Ya existe una categoría con ese nombre");
      throw new Error(error.message);
    }

    revalidatePath(paths.platform.businessContext.documents);
    return data as CustomCategoryRow;
  });
}

export async function deleteCustomCategoryAction(
  id: string
): Promise<MutationResult<{ documentsReassigned: number }>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: "ID inválido" };

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    // Load the category to get its slug
    const { data: cat, error: catErr } = await admin
      .from("knowledge_base_categories")
      .select("slug")
      .eq("id", parsed.data)
      .eq("organization_id", organizationId)
      .single();

    if (catErr || !cat) throw new Error("Categoría no encontrada");

    // Reassign documents using this slug to 'operations' (default fallback)
    const { count } = await admin
      .from("business_context_documents")
      .update({ category: "operations" })
      .eq("organization_id", organizationId)
      .eq("category", (cat as { slug: string }).slug);

    await admin
      .from("knowledge_base_categories")
      .delete()
      .eq("id", parsed.data)
      .eq("organization_id", organizationId);

    revalidatePath(paths.platform.businessContext.documents);
    return { documentsReassigned: count ?? 0 };
  });
}
