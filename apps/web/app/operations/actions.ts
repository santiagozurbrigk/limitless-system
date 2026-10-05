"use server";

import { revalidatePath } from "next/cache";
import {
  isMissingTableError,
  tryRequireOrganizationId,
} from "@/lib/auth/bootstrap";
import { requireAuthContext } from "@/lib/auth/require-auth";
import { callClaudeJson } from "@/lib/ai/anthropic";
import {
  AVISO_ORG_NO_ACTIVA,
  organizacionSigueActiva,
} from "@/lib/intelligence/organizaciones-activas";
import type { ResultadoReporteSemanal } from "@/lib/operations/resultado-reporte-semanal";
import { buildOrgContextText, getOrgContext } from "@/lib/ai/org-context";
import { wrapUntrustedContent } from "@/lib/ai/wrap-untrusted-content";
import { ingestDocument } from "@/lib/rag/ingest";
import {
  DB_TO_UI_DEPARTMENT,
  getCurrentWeekStart,
  UI_TO_DB_DEPARTMENT,
  WEEKLY_DEPARTMENTS,
} from "@/lib/operations/weekly-utils";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { firstZodError, saveWeeklyInputSchema, uuidSchema } from "@/lib/validations";
import { paths } from "@/routes";
import type {
  Department,
  WeeklyInputRow,
  WeeklyReportJson,
  WeeklyReportRow,
} from "@/types/operations";

function mapWeeklyError(msg: string): string {
  if (isMissingTableError(msg)) {
    return "Faltan tablas weekly_inputs / weekly_reports. Ejecuta supabase/migrations/20260615300000_weekly_inputs.sql.";
  }
  return msg;
}

export async function saveWeeklyInputAction(input: unknown): Promise<{ ok: true }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado.");
  }

  const parsed = saveWeeklyInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(firstZodError(parsed.error));
  }

  const data = parsed.data;

  const { user, orgId, supabase } = await requireAuthContext();
  const weekStart = getCurrentWeekStart();
  const dbDepartment = UI_TO_DB_DEPARTMENT[data.department];

  const content = data.content?.trim() || null;
  const rating = data.rating ?? null;

  const { error } = await supabase.from("weekly_inputs").upsert(
    {
      organization_id: orgId,
      week_start: weekStart,
      department: dbDepartment,
      type: "text",
      content,
      rating,
      submitted_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,week_start,department,submitted_by" }
  );

  if (error) throw new Error(mapWeeklyError(error.message));

  void ingestDocument({
    organizationId: orgId,
    sourceType: "weekly_input",
    sourceId: `${weekStart}-${dbDepartment}-${user.id}`,
    title: `Input ${data.department} - ${weekStart}`,
    data: {
      department: dbDepartment,
      content,
      rating,
      week_start: weekStart,
    },
    department: dbDepartment,
    tags: ["weekly_input", dbDepartment],
  }).catch((err) => console.error("[RAG] Error ingestando weekly input:", err));

  revalidatePath(paths.platform.operations.weeklyInputs);
  revalidatePath(paths.platform.operations.overview);
  revalidatePath(paths.platform.dashboard);

  return { ok: true };
}

const updateWeeklyInputSchema = saveWeeklyInputSchema;

export async function updateWeeklyInputAction(
  id: string,
  input: unknown
): Promise<{ ok: true }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado.");
  }

  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) throw new Error(firstZodError(idParsed.error));

  const parsed = updateWeeklyInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(firstZodError(parsed.error));

  const { user, orgId, role, supabase } = await requireAuthContext();
  const data = parsed.data;
  const dbDepartment = UI_TO_DB_DEPARTMENT[data.department];

  const { data: existing, error: readError } = await supabase
    .from("weekly_inputs")
    .select("id, submitted_by")
    .eq("id", idParsed.data)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (readError || !existing) {
    throw new Error("Input no encontrado.");
  }

  if (role !== "founder" && existing.submitted_by !== user.id) {
    throw new Error("Solo podés editar tus propios inputs.");
  }

  const content = data.content?.trim() || null;
  const rating = data.rating ?? null;

  const { error } = await supabase
    .from("weekly_inputs")
    .update({
      department: dbDepartment,
      content,
      rating,
      updated_at: new Date().toISOString(),
    })
    .eq("id", idParsed.data)
    .eq("organization_id", orgId);

  if (error) throw new Error(mapWeeklyError(error.message));

  revalidatePath(paths.platform.operations.weeklyInputs);
  revalidatePath(paths.platform.operations.teamInputs);
  revalidatePath(paths.platform.operations.overview);

  return { ok: true };
}

export async function deleteWeeklyInputAction(id: string): Promise<{ ok: true }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado.");
  }

  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) throw new Error(firstZodError(idParsed.error));

  const { user, orgId, role, supabase } = await requireAuthContext();

  const { data: existing, error: readError } = await supabase
    .from("weekly_inputs")
    .select("id, submitted_by")
    .eq("id", idParsed.data)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (readError || !existing) {
    throw new Error("Input no encontrado.");
  }

  if (role !== "founder" && existing.submitted_by !== user.id) {
    throw new Error("Solo podés eliminar tus propios inputs.");
  }

  const { error } = await supabase
    .from("weekly_inputs")
    .delete()
    .eq("id", idParsed.data)
    .eq("organization_id", orgId);

  if (error) throw new Error(mapWeeklyError(error.message));

  revalidatePath(paths.platform.operations.weeklyInputs);
  revalidatePath(paths.platform.operations.teamInputs);
  revalidatePath(paths.platform.operations.overview);

  return { ok: true };
}

export async function getWeeklyInputsForWeekAction(
  weekStart: string
): Promise<WeeklyInputRow[]> {
  return getWeeklyInputsAction(weekStart);
}

export async function getWeeklyInputsAction(
  weekStart?: string
): Promise<WeeklyInputRow[]> {
  if (!isSupabaseConfigured()) return [];

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];

  const supabase = await createClient();
  const week = weekStart ?? getCurrentWeekStart();

  const { data, error } = await supabase
    .from("weekly_inputs")
    .select(
      "id, organization_id, week_start, department, type, content, rating, submitted_by, created_at, updated_at, profiles(full_name, avatar_url)"
    )
    .eq("organization_id", organizationId)
    .eq("week_start", week)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getWeeklyInputs]", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const raw = row as Record<string, unknown>;
    const profilesRaw = raw.profiles;
    const profile = Array.isArray(profilesRaw) ? profilesRaw[0] : profilesRaw;
    return {
      ...(raw as WeeklyInputRow),
      profiles: (profile as WeeklyInputRow["profiles"]) ?? null,
    };
  });
}

export async function getWeeklyInputsHistoryAction(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("weekly_inputs")
    .select("week_start")
    .eq("organization_id", organizationId)
    .order("week_start", { ascending: false });

  if (error) {
    console.error("[getWeeklyInputsHistory]", error.message);
    return [];
  }

  return [...new Set((data ?? []).map((row) => row.week_start as string))];
}

export async function countWeeklyInputsForWeek(
  weekStart?: string
): Promise<number> {
  const rows = await getWeeklyInputsAction(weekStart);
  return new Set(rows.map((row) => row.department)).size;
}

/**
 * Genera el reporte semanal de Operaciones con Claude a partir de los inputs
 * de la semana. Los errores esperables (org no activa, sin inputs, fallas de
 * la base o de la IA) vuelven como valor con su motivo, para que el founder
 * vea el mensaje (ver `ResultadoReporteSemanal`); sólo lo inesperado (sin
 * sesión, la base caída al comprobar la org) sigue lanzando.
 */
export async function generateWeeklyReportAction(): Promise<ResultadoReporteSemanal> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Supabase no configurado.", motivo: "falla" };
  }

  const { orgId, supabase } = await requireAuthContext();

  // Una org pausada o dada de baja no gasta IA a pedido (SCRUM-210). Va antes
  // de marcar el reporte como "generating", para no dejarlo trabado.
  if (!(await organizacionSigueActiva(orgId))) {
    return { success: false, error: AVISO_ORG_NO_ACTIVA, motivo: "org-no-activa" };
  }

  const weekStart = getCurrentWeekStart();

  const { data: inputs, error: inputsError } = await supabase
    .from("weekly_inputs")
    .select("*")
    .eq("organization_id", orgId)
    .eq("week_start", weekStart);

  if (inputsError) {
    return { success: false, error: mapWeeklyError(inputsError.message), motivo: "falla" };
  }
  if (!inputs?.length) {
    return { success: false, error: "No hay inputs para esta semana todavía.", motivo: "sin-inputs" };
  }

  const { error: upsertError } = await supabase.from("weekly_reports").upsert(
    {
      organization_id: orgId,
      week_start: weekStart,
      status: "generating",
    },
    { onConflict: "organization_id,week_start" }
  );

  if (upsertError) {
    return { success: false, error: mapWeeklyError(upsertError.message), motivo: "falla" };
  }

  try {
    const inputsText = inputs
      .map((input) => {
        const dept = String(input.department).toUpperCase();
        const parts: string[] = [];
        if (input.rating != null) parts.push(`Rating: ${input.rating}/5`);
        if (input.content?.trim()) parts.push(input.content.trim());
        return `[${dept}] ${parts.join(" — ")}`;
      })
      .join("\n");

    const weekEnd = new Date(`${weekStart}T12:00:00`);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const { data: conversations } = await supabase
      .from("conversations")
      .select("status, ai_score, ai_label, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", weekStart)
      .lt("created_at", weekEnd.toISOString());

    const salesContext = conversations?.length
      ? `\nMétricas de ventas de la semana:
- Conversaciones activas: ${conversations.filter((c) => c.status === "active").length}
- Leads hot: ${conversations.filter((c) => c.ai_label === "hot").length}
- Leads warm: ${conversations.filter((c) => c.ai_label === "warm").length}`
      : "";

    const system =
      "Sos un COO de IA analizando reportes semanales de infoproductos latinoamericanos. Respondé ÚNICAMENTE con JSON válido en español.";

    const user = `Basándote en los inputs del equipo de esta semana${
      salesContext ? " y las métricas de ventas" : ""
    }, generá un reporte ejecutivo.

INPUTS DEL EQUIPO:
${wrapUntrustedContent("inputs_equipo", inputsText)}
${salesContext}

JSON:
{
  "executive_summary": "<resumen ejecutivo de 3-4 oraciones>",
  "risks": [
    { "title": "<riesgo>", "description": "<detalle>", "level": "high|medium|low" }
  ],
  "bottlenecks": [
    { "area": "<área>", "description": "<cuello de botella>" }
  ],
  "recommendations": [
    { "title": "<acción>", "description": "<detalle accionable>", "priority": "high|medium|low" }
  ]
}`;

    const orgContext = await getOrgContext(orgId);
    const orgContextText = buildOrgContextText(orgContext);

    const reportJson = await callClaudeJson<WeeklyReportJson>({
      organizationId: orgId,
      task: "weekly_report",
      feature: "weekly_report",
      cachedSystemPrompt: orgContextText,
      system,
      user,
      maxTokens: 1500,
    });

    if (!reportJson?.executive_summary) {
      throw new Error("La IA no devolvió un reporte válido.");
    }

    const { error: saveError } = await supabase.from("weekly_reports").upsert(
      {
        organization_id: orgId,
        week_start: weekStart,
        executive_summary: reportJson.executive_summary,
        risks: reportJson.risks ?? [],
        bottlenecks: reportJson.bottlenecks ?? [],
        recommendations: reportJson.recommendations ?? [],
        generated_at: new Date().toISOString(),
        status: "ready",
      },
      { onConflict: "organization_id,week_start" }
    );

    if (saveError) throw new Error(mapWeeklyError(saveError.message));

    revalidatePath(paths.platform.operations.overview);
    revalidatePath(paths.platform.dashboard);

    return { success: true, data: undefined };
  } catch (err) {
    await supabase
      .from("weekly_reports")
      .update({ status: "error" })
      .eq("organization_id", orgId)
      .eq("week_start", weekStart);

    console.error("[generateWeeklyReportAction]", err);
    return {
      success: false,
      error: err instanceof Error && err.message ? err.message : "Error al generar reporte",
      motivo: "falla",
    };
  }
}

export async function getWeeklyReportAction(
  weekStart?: string
): Promise<WeeklyReportRow | null> {
  if (!isSupabaseConfigured()) return null;

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return null;

  const supabase = await createClient();
  const week = weekStart ?? getCurrentWeekStart();

  const { data, error } = await supabase
    .from("weekly_reports")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("week_start", week)
    .maybeSingle();

  if (error) {
    console.error("[getWeeklyReport]", error.message);
    return null;
  }

  return (data as WeeklyReportRow | null) ?? null;
}

export async function getWeeklyCompletionStatus(
  weekStart?: string
): Promise<{ completed: Department[]; total: number }> {
  const rows = await getWeeklyInputsAction(weekStart);

  const completed = [
    ...new Set(
      rows.map(
        (row) =>
          DB_TO_UI_DEPARTMENT[
            row.department as keyof typeof DB_TO_UI_DEPARTMENT
          ]
      )
    ),
  ].filter(Boolean) as Department[];

  return { completed, total: WEEKLY_DEPARTMENTS.length };
}
