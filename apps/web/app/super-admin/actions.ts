"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { isAllowedBrainFile } from "@/lib/ai-brain/file-types";
import { AI_BRAIN_BUCKET, uiContentTypeToDb } from "@/lib/ai-brain/mapper";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { isMissingTableError } from "@/lib/auth/bootstrap";
import { generateTempPassword } from "@/lib/auth/generate-temp-password";
import { tempPasswordProfileFields } from "@/lib/auth/temp-password-expiry";
import { regenerateUserTempPassword } from "@/lib/auth/regenerate-temp-password";
import type { TempCredentials } from "@/lib/auth/temp-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  actionErrorMessage,
  runMutation,
  type MutationResult,
} from "@/lib/server/action-result";
import {
  addOrganizationNoteSchema,
  archiveAiBrainDocumentSchema,
  createAiBrainDocumentSchema,
  createFounderAccountSchema,
  createHoldingOrgSchema,
  createOrganizationFromHoldingSchema,
  deactivateUserSchema,
  deleteAiBrainDocumentSchema,
  firstZodError,
  getAiBrainSignedUrlSchema,
  prepareAiBrainFileUploadSchema,
  regenerateTempPasswordSchema,
  setOrganizationStatusSchema,
  updateOrganizationMrrSchema,
} from "@/lib/validations";
import { ADD_ON_IDS } from "@/lib/auth/add-on-ids";
import { processAiBrainDocument } from "@/lib/ai-brain/process-document";
import { resolveBrainFileMimeType, isAllowedBrainFile as validateBrainFile } from "@/lib/ai-brain/file-types";
import type { z } from "zod";
import type { BrainContentType } from "@/types/ai-brain";
import type { CreateFounderResult } from "@/types/super-admin";
import { paths } from "@/routes";
import { loadOrgHealthScores } from "@/lib/super-admin/org-health";
import {
  loadAICostsSummary,
  loadAdminUsers,
  loadOrganizationDetail,
  loadOrganizationsList,
} from "@/lib/super-admin/queries";

export async function getOrganizationDetailAction(
  ...args: Parameters<typeof loadOrganizationDetail>
) {
  return loadOrganizationDetail(...args);
}

export async function getAllUsersAction(
  ...args: Parameters<typeof loadAdminUsers>
) {
  return loadAdminUsers(...args);
}

export async function getAICostsAction(
  ...args: Parameters<typeof loadAICostsSummary>
) {
  return loadAICostsSummary(...args);
}

export async function getClientHealthAction(
  ...args: Parameters<typeof loadOrgHealthScores>
) {
  return loadOrgHealthScores(...args);
}

const REVALIDATE_ORGS = [
  paths.superAdmin.organizations,
  paths.superAdmin.costs,
  paths.superAdmin.users,
  paths.superAdmin.holding,
];

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function revalidateSuperAdmin() {
  for (const p of REVALIDATE_ORGS) {
    revalidatePath(p);
  }
  revalidatePath(paths.superAdmin.infrastructure);
  revalidatePath(paths.superAdmin.aiBrain.root);
  revalidatePath(paths.superAdmin.aiBrain.library);
}

async function requireSuperAdminAndParse<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; error: string }
> {
  try {
    await requireSuperAdmin();
  } catch (error) {
    return { success: false, error: actionErrorMessage(error) };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}

export async function createFounderAccountAction(
  input: unknown
): Promise<MutationResult<CreateFounderResult>> {
  const auth = await requireSuperAdminAndParse(createFounderAccountSchema, input);
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { organizationName, founderName, email } = auth.data;

  return runMutation(async () => {
    const admin = createAdminClient();
    const password = generateTempPassword();

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: founderName },
      });

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? "No se pudo crear el usuario");
    }

    const userId = authData.user.id;

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: organizationName, status: "active" })
      .select("id")
      .single();

    if (orgError || !org) {
      await admin.auth.admin.deleteUser(userId);
      throw new Error(orgError?.message ?? "No se pudo crear la organización");
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      organization_id: org.id,
      email,
      full_name: founderName,
      role: "founder",
      ...tempPasswordProfileFields(),
    });

    if (profileError) {
      await admin.from("organizations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(userId);
      throw new Error(profileError.message);
    }

    revalidateSuperAdmin();

    return {
      organizationId: org.id,
      organizationName,
      email,
      password,
      emailSent: false,
      tempCredentials: { email, tempPassword: password },
    };
  });
}

export async function createOrganizationFromHoldingAction(
  input: unknown
): Promise<MutationResult<{ orgId: string; tempCredentials: TempCredentials }>> {
  const auth = await requireSuperAdminAndParse(
    createOrganizationFromHoldingSchema,
    input
  );
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { name: organizationName, founderEmail: email, plan } = auth.data;

  return runMutation(async () => {
    const admin = createAdminClient();
    const password = generateTempPassword();
    const mrrUsd = plan === "pro" ? 30000 : 0;

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: organizationName, status: "active", mrr_usd: mrrUsd })
      .select("id")
      .single();

    if (orgError || !org) {
      throw new Error(orgError?.message ?? "Error creando organización");
    }

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Founder" },
      });

    if (authError || !authData.user) {
      await admin.from("organizations").delete().eq("id", org.id);
      throw new Error(authError?.message ?? "Error creando usuario");
    }

    const userId = authData.user.id;

    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      organization_id: org.id,
      email,
      full_name: "Founder",
      role: "founder",
      ...tempPasswordProfileFields(),
    });

    if (profileError) {
      await admin.from("organizations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(userId);
      throw new Error(profileError.message);
    }

    const holdingRes = await admin
      .from("holdings")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (holdingRes.data?.id) {
      const linkRes = await admin.from("holding_organizations").upsert(
        {
          holding_id: holdingRes.data.id,
          organization_id: org.id,
        },
        { onConflict: "holding_id,organization_id" }
      );

      if (
        linkRes.error &&
        !isMissingTableError(linkRes.error.message)
      ) {
        console.error(
          "[createOrganizationFromHoldingAction] link",
          linkRes.error.message
        );
      }
    }

    revalidateSuperAdmin();

    return {
      orgId: org.id,
      tempCredentials: { email, tempPassword: password },
    };
  });
}

export async function setOrganizationStatusAction(
  organizationId: string,
  active: boolean
): Promise<MutationResult> {
  const auth = await requireSuperAdminAndParse(setOrganizationStatusSchema, {
    organizationId,
    active,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { organizationId: orgId, active: isActive } = auth.data;

  return runMutation(async () => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({ status: isActive ? "active" : "paused" })
      .eq("id", orgId);

    if (error) throw new Error(error.message);
    revalidateSuperAdmin();
    revalidatePath(`${paths.superAdmin.organizations}/${orgId}`);
  });
}

export async function updateOrganizationMrrAction(
  organizationId: string,
  mrrUsd: number
): Promise<MutationResult> {
  const auth = await requireSuperAdminAndParse(updateOrganizationMrrSchema, {
    organizationId,
    mrrUsd,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { organizationId: orgId, mrrUsd: validatedMrr } = auth.data;

  return runMutation(async () => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({ mrr_usd: validatedMrr })
      .eq("id", orgId);

    if (error) throw new Error(error.message);
    revalidateSuperAdmin();
    revalidatePath(`${paths.superAdmin.organizations}/${orgId}`);
  });
}

export async function addOrganizationNoteAction(
  organizationId: string,
  note: string,
  createdBy = "Super Admin"
): Promise<MutationResult> {
  const auth = await requireSuperAdminAndParse(addOrganizationNoteSchema, {
    organizationId,
    note,
    createdBy,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const {
    organizationId: orgId,
    note: text,
    createdBy: author,
  } = auth.data;

  return runMutation(async () => {
    const admin = createAdminClient();
    const { error } = await admin.from("organization_notes").insert({
      organization_id: orgId,
      note: text,
      created_by: author ?? "Super Admin",
    });

    if (error) throw new Error(error.message);
    revalidatePath(`${paths.superAdmin.organizations}/${orgId}`);
  });
}

export async function deactivateUserAction(
  userId: string
): Promise<MutationResult> {
  const auth = await requireSuperAdminAndParse(deactivateUserSchema, { userId });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  return runMutation(async () => {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(auth.data.userId, {
      ban_duration: "876000h",
    });
    if (error) throw new Error(error.message);
    revalidatePath(paths.superAdmin.users);
  });
}

export async function prepareAiBrainFileUploadAction(
  input: unknown
): Promise<
  MutationResult<{
    storagePath: string;
    signedUrl: string;
    contentType: string;
  }>
> {
  const auth = await requireSuperAdminAndParse(
    prepareAiBrainFileUploadSchema,
    input
  );
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { fileName, fileSize, mimeType } = auth.data;

  return runMutation(async () => {
    const allowed = isAllowedBrainFile(fileName, mimeType, fileSize);
    if (!allowed.ok) throw new Error(allowed.error);

    const docId = crypto.randomUUID();
    const safeName = sanitizeFilename(fileName);
    const storagePath = `${docId}-${safeName}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(AI_BRAIN_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      throw new Error(
        error?.message ??
          `No se pudo preparar la subida. ¿Existe el bucket "${AI_BRAIN_BUCKET}"?`
      );
    }

    return {
      storagePath,
      signedUrl: data.signedUrl,
      contentType: allowed.mimeType,
    };
  });
}

export type CreateAiBrainDocumentInput = {
  title: string;
  contentType: BrainContentType;
  category: string;
  description?: string;
  tags?: string;
  coverageAreas?: string;
  uploadedBy?: string;
  miroUrl?: string;
  storagePath?: string;
  fileName?: string;
  fileSizeBytes?: number;
  fileMimeType?: string;
};

export async function createAiBrainDocumentAction(
  input: unknown
): Promise<MutationResult<{ id: string }>> {
  const auth = await requireSuperAdminAndParse(createAiBrainDocumentSchema, input);
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const data = auth.data;

  return runMutation(async () => {
    const admin = createAdminClient();
    const tags = data.tags
      ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    const coverage_areas = data.coverageAreas
      ? data.coverageAreas.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    const uploadedBy = data.uploadedBy?.trim() || "Super Admin";
    const miroUrl = data.miroUrl?.trim() ?? "";

    let file_url: string | null = null;
    let file_name: string | null = null;
    let file_size_bytes: number | null = null;
    let source_url: string | null = null;
    let dbContentType = uiContentTypeToDb(data.contentType);

    if (miroUrl) {
      source_url = miroUrl;
      dbContentType = "miro_board";
    } else if (data.storagePath && data.fileName) {
      file_url = data.storagePath;
      file_name = data.fileName;
      file_size_bytes = data.fileSizeBytes ?? null;
      const mime = data.fileMimeType ?? "";
      if (mime.startsWith("image/")) {
        dbContentType = "image";
      }
    }

    const { data: row, error } = await admin
      .from("ai_brain_documents")
      .insert({
        title: data.title,
        category: data.category.trim() || "general",
        content_type: dbContentType,
        file_url,
        file_name,
        file_size_bytes,
        source_url,
        description: data.description?.trim() || null,
        tags,
        coverage_areas,
        status: "pending_indexing",
        uploaded_by: uploadedBy,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    revalidatePath(paths.superAdmin.aiBrain.root);
    revalidatePath(paths.superAdmin.aiBrain.library);
    return { id: row.id };
  });
}

export async function archiveAiBrainDocumentAction(
  id: string
): Promise<MutationResult> {
  const auth = await requireSuperAdminAndParse(archiveAiBrainDocumentSchema, {
    id,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const documentId = auth.data.id;

  return runMutation(async () => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("ai_brain_documents")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", documentId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.superAdmin.aiBrain.root);
    revalidatePath(paths.superAdmin.aiBrain.library);
    revalidatePath(paths.superAdmin.aiBrain.document(documentId));
  });
}

export async function deleteAiBrainDocumentAction(
  id: string
): Promise<MutationResult> {
  const auth = await requireSuperAdminAndParse(deleteAiBrainDocumentSchema, {
    id,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const documentId = auth.data.id;

  return runMutation(async () => {
    const admin = createAdminClient();
    const { data: row } = await admin
      .from("ai_brain_documents")
      .select("file_url")
      .eq("id", documentId)
      .maybeSingle();

    if (row?.file_url) {
      await admin.storage.from(AI_BRAIN_BUCKET).remove([row.file_url]);
    }

    const { error } = await admin
      .from("ai_brain_documents")
      .delete()
      .eq("id", documentId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.superAdmin.aiBrain.root);
    revalidatePath(paths.superAdmin.aiBrain.library);
  });
}

export async function getAiBrainSignedUrlAction(
  storagePath: string
): Promise<MutationResult<{ url: string }>> {
  const auth = await requireSuperAdminAndParse(getAiBrainSignedUrlSchema, {
    storagePath,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  return runMutation(async () => {
    const admin = createAdminClient();
    const path = auth.data.storagePath.replace(/^ai-brain-documents\//, "");
    const { data, error } = await admin.storage
      .from(AI_BRAIN_BUCKET)
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? "No se pudo generar el enlace");
    }
    return { url: data.signedUrl };
  });
}

export async function processAiBrainDocumentAction(
  documentId: string
): Promise<MutationResult<{ charCount: number }>> {
  return runMutation(async () => {
    await requireSuperAdmin();
    const result = await processAiBrainDocument(documentId);
    if (!result.ok) throw new Error(result.error);
    revalidatePath(paths.superAdmin.aiBrain.document(documentId));
    return { charCount: result.charCount };
  });
}

/**
 * Descarga un archivo de Google Drive del super-admin y lo sube al bucket ai-brain-documents.
 * Retorna storagePath, fileName, fileSize y mimeType listos para createAiBrainDocumentAction.
 */
export async function importDriveFileForBrainAction(input: {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
}): Promise<
  MutationResult<{
    storagePath: string;
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
  }>
> {
  await requireSuperAdmin();

  return runMutation(async () => {
    // Use the super-admin's own Google Drive token (stored by user_id)
    const user = await requireSuperAdmin();
    const adminDb = createAdminClient();
    const { data: tokenRow } = await adminDb
      .from("super_admin_google_tokens")
      .select("access_token")
      .eq("user_id", user.id)
      .maybeSingle();
    const accessToken = tokenRow?.access_token ?? null;
    if (!accessToken) {
      throw new Error(
        "No hay conexión con Google Drive. Conectá tu cuenta de Google desde el botón 'Desde Google Drive' en el formulario."
      );
    }

    // Resolve MIME type — Google Docs/Sheets need export
    let dlUrl: string;
    let resolvedMime = input.mimeType;

    const EXPORT_MAP: Record<string, string> = {
      "application/vnd.google-apps.document":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.google-apps.spreadsheet":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };

    if (EXPORT_MAP[input.mimeType]) {
      resolvedMime = EXPORT_MAP[input.mimeType];
      dlUrl = `https://www.googleapis.com/drive/v3/files/${input.fileId}/export?mimeType=${encodeURIComponent(resolvedMime)}&supportsAllDrives=true`;
    } else {
      dlUrl = `https://www.googleapis.com/drive/v3/files/${input.fileId}?alt=media&supportsAllDrives=true`;
    }

    // Resolve filename extension
    const EXT_MAP: Record<string, string> = {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
      "application/pdf": ".pdf",
      "text/plain": ".txt",
      "text/markdown": ".md",
    };
    let fileName = input.fileName;
    const hasExt = /\.\w+$/.test(fileName);
    if (!hasExt && EXT_MAP[resolvedMime]) {
      fileName = fileName + EXT_MAP[resolvedMime];
    }

    // Validate file type
    const allowed = validateBrainFile(fileName, resolvedMime, input.fileSize);
    if (!allowed.ok) throw new Error(allowed.error);

    // Download from Drive
    const dlRes = await fetch(dlUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!dlRes.ok) {
      throw new Error(
        `Error al descargar el archivo de Drive (${dlRes.status}). Verificá los permisos.`
      );
    }

    const buffer = await dlRes.arrayBuffer();
    const fileSizeBytes = buffer.byteLength;

    // Upload to ai-brain-documents bucket
    const admin = createAdminClient();
    const docId = crypto.randomUUID();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${docId}-${safeName}`;

    const { error: uploadError } = await admin.storage
      .from(AI_BRAIN_BUCKET)
      .upload(storagePath, buffer, {
        contentType: resolvedMime,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Error al subir al bucket: ${uploadError.message}`);
    }

    return { storagePath, fileName, fileSizeBytes, mimeType: resolvedMime };
  });
}

export async function createHoldingOrgAction(
  input: unknown
): Promise<MutationResult<{ orgId: string; tempCredentials: TempCredentials }>> {
  const auth = await requireSuperAdminAndParse(createHoldingOrgSchema, input);
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { name: organizationName, founderEmail: email } = auth.data;

  return runMutation(async () => {
    const admin = createAdminClient();
    const password = generateTempPassword();

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Holding Admin" },
      });

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? "Error creando usuario");
    }

    const userId = authData.user.id;

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: organizationName,
        status: "active",
        account_type: "holding",
      })
      .select("id")
      .single();

    if (orgError || !org) {
      await admin.auth.admin.deleteUser(userId);
      throw new Error(orgError?.message ?? "Error creando holding");
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      organization_id: org.id,
      email,
      full_name: "Holding Admin",
      role: "founder",
      is_holding_admin: true,
      ...tempPasswordProfileFields(),
    });

    if (profileError) {
      await admin.from("organizations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(userId);
      throw new Error(profileError.message);
    }

    revalidateSuperAdmin();
    revalidatePath(paths.superAdmin.organizations);

    return {
      orgId: org.id,
      tempCredentials: { email, tempPassword: password },
    };
  });
}

export async function regenerateTempPasswordAction(
  userId: string
): Promise<MutationResult<TempCredentials>> {
  const auth = await requireSuperAdminAndParse(regenerateTempPasswordSchema, {
    userId,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  return runMutation(async () => {
    const credentials = await regenerateUserTempPassword(auth.data.userId);
    revalidateSuperAdmin();
    return credentials;
  });
}

// ---------------------------------------------------------------------------
// AI Brain — Batch API (Anthropic)
// ---------------------------------------------------------------------------

/**
 * Resuelve un cliente Anthropic para uso del super-admin:
 * intenta la clave global y, si no existe, usa la de cualquier org activa.
 */
// Org "Optimiza tu Control" — fuente de credencial para operaciones super-admin
const SUPER_ADMIN_CREDENTIAL_ORG_ID = "46cce98c-6d4c-4e4d-94a7-7cc24ae1104d";

async function resolveSuperAdminAnthropicClient(
  admin: ReturnType<typeof createAdminClient>
): Promise<Anthropic> {
  const globalKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (globalKey) return new Anthropic({ apiKey: globalKey });

  const { data: org } = await admin
    .from("organizations")
    .select("claude_api_key_encrypted")
    .eq("id", SUPER_ADMIN_CREDENTIAL_ORG_ID)
    .maybeSingle();

  if (!org?.claude_api_key_encrypted) {
    throw new Error(
      "No hay credencial de Anthropic disponible. Configurá ANTHROPIC_API_KEY en las variables de entorno."
    );
  }

  const { decrypt } = await import("@/lib/security/encryption");
  const apiKey = decrypt(org.claude_api_key_encrypted, {
    field: "organizations.claude_api_key_encrypted",
    organizationId: SUPER_ADMIN_CREDENTIAL_ORG_ID,
  });
  return new Anthropic({ apiKey });
}

/**
 * Envía todos los documentos activos con content_text al Anthropic Batch API
 * para generar ai_summary de cada uno. 50% más barato que requests individuales.
 */
export async function submitBrainSummaryBatchAction(): Promise<
  MutationResult<{ batchId: string; docCount: number }>
> {
  return runMutation(async () => {
    await requireSuperAdmin();

    const admin = createAdminClient();

    // Buscar docs activos con content_text pero sin ai_summary
    const { data: docs, error: docsErr } = await admin
      .from("ai_brain_documents")
      .select("id, title, content_text")
      .eq("status", "active")
      .is("ai_summary", null)
      .not("content_text", "is", null);

    if (docsErr) throw new Error(docsErr.message);
    if (!docs || docs.length === 0) {
      throw new Error("No hay documentos activos con contenido para resumir");
    }

    const client = await resolveSuperAdminAnthropicClient(admin);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requests: any[] = docs.map((doc) => ({
      custom_id: doc.id,
      params: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `Título: ${doc.title}\n\nContenido:\n${String(doc.content_text ?? "").slice(0, 4000)}\n\nEscribí un resumen de 1-2 oraciones en español que describa de qué trata este documento y por qué es útil. Solo el resumen, sin preámbulo.`,
          },
        ],
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batch = await (client.beta.messages.batches as any).create({ requests });

    // Marcar todos los docs con el batch_job_id
    const docIds = docs.map((d) => d.id);
    await admin
      .from("ai_brain_documents")
      .update({ batch_job_id: batch.id })
      .in("id", docIds);

    revalidatePath(paths.superAdmin.aiBrain.root);

    return { batchId: batch.id as string, docCount: docs.length };
  });
}

/**
 * Consulta el estado de un batch y aplica los resultados a ai_brain_documents.
 */
export async function syncBrainBatchResultsAction(
  batchId: string
): Promise<
  MutationResult<{ status: string; processed: number; pending: number }>
> {
  return runMutation(async () => {
    await requireSuperAdmin();

    const admin = createAdminClient();
    const client = await resolveSuperAdminAnthropicClient(admin);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batch = await (client.beta.messages.batches as any).retrieve(batchId);

    if (batch.processing_status !== "ended") {
      return {
        status: batch.processing_status as string,
        processed: 0,
        pending: (batch.request_counts?.processing ?? 0) + (batch.request_counts?.errored ?? 0),
      };
    }

    let processed = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const result of await (client.beta.messages.batches as any).results(batchId)) {
      if (result.result?.type !== "succeeded") continue;

      const summaryText = (result.result.message?.content ?? [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { type: string; text: string }) => b.text)
        .join("")
        .trim();

      if (!summaryText) continue;

      await admin
        .from("ai_brain_documents")
        .update({ ai_summary: summaryText, batch_job_id: null })
        .eq("id", result.custom_id);

      processed++;
    }

    revalidatePath(paths.superAdmin.aiBrain.root);

    return { status: "ended", processed, pending: 0 };
  });
}

/**
 * Actualiza los add-ons habilitados para una organización.
 * Solo permite valores válidos definidos en ADD_ON_IDS.
 */
export async function updateOrgAddOnsAction(
  orgId: string,
  addOns: string[]
): Promise<MutationResult<{ enabledAddOns: string[] }>> {
  return runMutation(async () => {
    await requireSuperAdmin();

    const validated = addOns.filter((id): id is (typeof ADD_ON_IDS)[number] =>
      ADD_ON_IDS.includes(id as (typeof ADD_ON_IDS)[number])
    );

    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({ enabled_add_ons: validated })
      .eq("id", orgId);

    if (error) throw new Error(error.message);

    revalidateSuperAdmin();
    revalidatePath(`/super-admin/organizations/${orgId}`);

    return { enabledAddOns: validated };
  });
}
