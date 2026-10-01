"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { callClaudeJson, AI_MODELS } from "@/lib/ai/anthropic";
import { buildOrgContextText, getOrgContext, invalidateOrgContext } from "@/lib/ai/org-context";
import { ingestDocument } from "@/lib/rag/ingest";
import { createAdminClient } from "@/lib/supabase/admin";
import { SOP_ATTACHMENTS_BUCKET } from "@/lib/sops/constants";
import {
  isAllowedSopAttachment,
  sanitizeFilename,
} from "@/lib/sops/attachment-types";
import { buildSOPGenerationPrompt } from "@/lib/sops/generate-sop-prompt";
import {
  actionErrorMessage,
  runMutation,
  type MutationResult,
} from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  firstZodError,
  generateSOPSchema,
  getSOPsFiltersSchema,
  saveSOPSchema,
  updateSOPSchema,
  uuidSchema,
} from "@/lib/validations";
import { paths } from "@/routes/paths";
import { assertOrgStoragePath, soloRutasDeLaOrg } from "@/lib/storage/org-path";

function revalidateSops() {
  revalidatePath(paths.platform.operations.sops);
}

export type GeneratedSOPData = {
  title: string;
  summary: string;
  content: string;
  estimatedDurationMinutes: number;
  tags: string[];
  stepsCount: number;
};

export async function generateSOPAction(
  input: unknown
): Promise<MutationResult<GeneratedSOPData>> {
  const parsed = generateSOPSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  const data = parsed.data;

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();

    const { data: existingSOPs } = await supabase
      .from("sops")
      .select("title, department")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(10);

    const { data: salesScript } = await supabase
      .from("sales_scripts")
      .select("sections")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();

    const prompt = buildSOPGenerationPrompt({
      ...data,
      orgContext: {
        orgName: org?.name ?? "la organización",
        existingSOPs: existingSOPs ?? [],
        salesScript: salesScript
          ? JSON.stringify(salesScript.sections)
          : undefined,
      },
    });

    const orgContext = await getOrgContext(organizationId);
    const orgContextText = buildOrgContextText(orgContext);

    const generated = await callClaudeJson<{
      title: string;
      summary: string;
      estimated_duration_minutes: number;
      tags: string[];
      content: string;
      steps_count: number;
    }>({
      task: "sop_generation",
      cachedSystemPrompt: orgContextText,
      system:
        "Respondé únicamente con JSON válido. No incluyas markdown fences ni texto fuera del objeto JSON.",
      user: prompt,
      maxTokens: 3000,
      feature: "sop_generation",
      organizationId,
    });

    if (!generated) {
      throw new Error(
        "Configurá tu API key de Claude en Settings → IA para generar SOPs"
      );
    }

    return {
      title: generated.title,
      summary: generated.summary,
      content: generated.content,
      estimatedDurationMinutes: generated.estimated_duration_minutes,
      tags: generated.tags,
      stepsCount: generated.steps_count,
    };
  });
}

export async function saveSOPAction(
  input: unknown
): Promise<MutationResult<{ id: string }>> {
  const parsed = saveSOPSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  const data = parsed.data;

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const { data: sop, error } = await supabase
      .from("sops")
      .insert({
        organization_id: organizationId,
        title: data.title,
        goal: data.goal,
        department: data.department,
        expected_outcome: data.expectedOutcome ?? null,
        additional_context: data.additionalContext ?? null,
        content: data.content,
        tags: data.tags ?? [],
        estimated_duration_minutes: data.estimatedDurationMinutes ?? null,
        generated_by_ai: data.generatedByAI ?? false,
        ai_model: data.generatedByAI ? AI_MODELS.SONNET : null,
        status: data.status ?? "draft",
        created_by: "user",
        author_user_id: profile?.id ?? null,
        version: 1,
      })
      .select("id")
      .single();

    if (error) {
      if (isMissingTableError(error.message)) {
        throw new Error(
          "La tabla de SOPs aún no está migrada en Supabase. Aplicá la migración 20260616300000_sops_enhanced.sql"
        );
      }
      throw new Error(error.message);
    }

    await supabase.from("sop_versions").insert({
      sop_id: sop.id,
      organization_id: organizationId,
      version: 1,
      content: data.content,
      changed_by: profile?.id ?? null,
      change_note: "Versión inicial",
    });

    const { data: fullSop } = await supabase
      .from("sops")
      .select("*")
      .eq("id", sop.id)
      .single();

    if (fullSop && (data.status ?? "draft") === "active") {
      void ingestDocument({
        organizationId,
        sourceType: "sop",
        sourceId: sop.id,
        title: fullSop.title,
        data: fullSop,
        department: fullSop.department,
        tags: ["sop", fullSop.department],
      }).catch((err) => console.error("[RAG] Error ingestando SOP:", err));
    }

    if (data.draftId) {
      await supabase
        .from("sop_attachments")
        .update({ sop_id: sop.id, draft_id: null })
        .eq("organization_id", organizationId)
        .eq("draft_id", data.draftId);
    }

    revalidateSops();
    invalidateOrgContext(organizationId);
    return { id: sop.id };
  });
}

export async function updateSOPAction(
  sopId: string,
  input: unknown
): Promise<MutationResult<{ ok: true }>> {
  const idParsed = uuidSchema.safeParse(sopId);
  if (!idParsed.success) {
    return { success: false, error: firstZodError(idParsed.error) };
  }

  const patchParsed = updateSOPSchema.safeParse(input);
  if (!patchParsed.success) {
    return { success: false, error: firstZodError(patchParsed.error) };
  }

  const data = patchParsed.data;

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const { data: current, error: fetchError } = await supabase
      .from("sops")
      .select("version, content")
      .eq("id", idParsed.data)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!current) throw new Error("SOP no encontrado");

    const newVersion = (current.version ?? 1) + 1;

    const { error } = await supabase
      .from("sops")
      .update({
        title: data.title,
        content: data.content,
        status: data.status,
        tags: data.tags,
        version: data.content && data.content !== current.content ? newVersion : current.version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", idParsed.data)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);

    if (data.content && data.content !== current.content) {
      await supabase.from("sop_versions").insert({
        sop_id: idParsed.data,
        organization_id: organizationId,
        version: newVersion,
        content: data.content,
        changed_by: profile?.id ?? null,
        change_note: data.changeNote ?? "Actualización",
      });
    }

    const { data: updatedSop } = await supabase
      .from("sops")
      .select("*")
      .eq("id", idParsed.data)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (updatedSop && updatedSop.status === "active") {
      void ingestDocument({
        organizationId,
        sourceType: "sop",
        sourceId: idParsed.data,
        title: updatedSop.title,
        data: updatedSop,
        department: updatedSop.department,
        tags: ["sop", updatedSop.department],
      }).catch((err) => console.error("[RAG] Error ingestando SOP:", err));
    }

    revalidateSops();
    invalidateOrgContext(organizationId);
    return { ok: true };
  });
}

export type SopVersionView = {
  id: string;
  version: number;
  content: string;
  change_note: string | null;
  created_at: string;
  changed_by_name: string | null;
};

export async function getSOPVersionsAction(
  sopId: string
): Promise<MutationResult<SopVersionView[]>> {
  const idParsed = uuidSchema.safeParse(sopId);
  if (!idParsed.success) {
    return { success: false, error: firstZodError(idParsed.error) };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("sop_versions")
      .select(
        "id, version, content, change_note, created_at, changed_by, profiles(full_name)"
      )
      .eq("sop_id", idParsed.data)
      .eq("organization_id", organizationId)
      .order("version", { ascending: false });

    if (error) {
      if (isMissingTableError(error.message)) return [];
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => {
      const raw = row as Record<string, unknown>;
      const profilesRaw = raw.profiles;
      const profile = Array.isArray(profilesRaw) ? profilesRaw[0] : profilesRaw;
      const fullName =
        profile && typeof profile === "object" && "full_name" in profile
          ? (profile.full_name as string | null)
          : null;

      return {
        id: row.id as string,
        version: row.version as number,
        content: row.content as string,
        change_note: row.change_note as string | null,
        created_at: row.created_at as string,
        changed_by_name: fullName,
      };
    });
  });
}

export async function getSOPsAction(filters?: unknown) {
  const filtersParsed = getSOPsFiltersSchema.safeParse(filters);
  if (!filtersParsed.success) {
    console.warn("[getSOPsAction]", firstZodError(filtersParsed.error));
    return [];
  }

  const resolvedFilters = filtersParsed.data;

  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    let query = supabase
      .from("sops")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (resolvedFilters?.department) {
      query = query.eq("department", resolvedFilters.department);
    }
    if (resolvedFilters?.status) {
      query = query.eq("status", resolvedFilters.status);
    }
    if (resolvedFilters?.search) {
      query = query.ilike("title", `%${resolvedFilters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  } catch (error) {
    console.warn("[getSOPsAction]", actionErrorMessage(error));
    return [];
  }
}

export async function prepareSopAttachmentUploadAction(input: {
  draftId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<
  MutationResult<{ storagePath: string; signedUrl: string; contentType: string }>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const allowed = isAllowedSopAttachment(
      input.fileName,
      input.mimeType,
      input.fileSize
    );
    if (!allowed.ok) throw new Error(allowed.error);

    const attachmentId = crypto.randomUUID();
    const safeName = sanitizeFilename(input.fileName);
    const storagePath = `${organizationId}/drafts/${input.draftId}/${attachmentId}-${safeName}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(SOP_ATTACHMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      throw new Error(
        error?.message ??
          `No se pudo preparar la subida. ¿Existe el bucket "${SOP_ATTACHMENTS_BUCKET}"?`
      );
    }

    return {
      storagePath,
      signedUrl: data.signedUrl,
      contentType: allowed.mimeType,
    };
  });
}

export async function finalizeSopAttachmentAction(input: {
  draftId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
}): Promise<MutationResult<{ id: string }>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    const allowed = isAllowedSopAttachment(input.fileName, input.mimeType, input.fileSize);
    if (!allowed.ok) throw new Error(allowed.error);
    assertOrgStoragePath(input.storagePath, organizationId);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sop_attachments")
      .insert({
        organization_id: organizationId,
        draft_id: input.draftId,
        file_name: input.fileName,
        storage_path: input.storagePath,
        mime_type: allowed.mimeType,
        file_size: input.fileSize ?? null,
        uploaded_by: profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      if (isMissingTableError(error.message)) {
        throw new Error(
          "Falta la tabla sop_attachments. Ejecutá supabase/migrations/20260719100000_sop_attachments.sql"
        );
      }
      throw new Error(error.message);
    }

    return { id: data.id as string };
  });
}

export async function deleteSopAttachmentAction(
  attachmentId: string
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: row } = await supabase
      .from("sop_attachments")
      .select("storage_path")
      .eq("id", attachmentId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    const { error } = await supabase
      .from("sop_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);

    const rutas = soloRutasDeLaOrg([row?.storage_path], organizationId, "sops");
    if (rutas.length > 0) {
      await admin.storage.from(SOP_ATTACHMENTS_BUCKET).remove(rutas);
    }
  });
}
