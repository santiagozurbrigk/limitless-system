"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { uuidSchema } from "@/lib/validations";
import type {
  ExecutiveReport,
  ReportPeriod,
} from "@/types/executive-reports";

const SELECT =
  "id, period, week_label, title, executive_summary, risks, bottlenecks, recommendations, departments, generated_at";

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

function toDepartments(value: unknown): ExecutiveReport["departments"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (d): d is { name: string; status: string } =>
        !!d &&
        typeof d === "object" &&
        typeof (d as { name?: unknown }).name === "string"
    )
    .map((d) => ({
      name: d.name,
      status:
        d.status === "healthy" || d.status === "critical"
          ? d.status
          : "watch",
    }));
}

function mapRow(row: Record<string, unknown>): ExecutiveReport {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    period: (row.period as ReportPeriod) ?? "weekly",
    weekLabel: String(row.week_label ?? ""),
    generatedAt: String(row.generated_at ?? ""),
    executiveSummary: String(row.executive_summary ?? ""),
    risks: toStringArray(row.risks),
    bottlenecks: toStringArray(row.bottlenecks),
    recommendations: toStringArray(row.recommendations),
    departments: toDepartments(row.departments),
  };
}

/**
 * El último reporte de cada cadencia, en una sola consulta.
 *
 * Es lo que alimenta el panel de la topbar. Se trae todo junto y no una
 * consulta por pestaña porque el panel muestra las tres de entrada: pedirlas
 * de a una haría que cambiar de pestaña tenga latencia, sobre algo que ya
 * está en la base.
 *
 * Una cadencia sin reportes devuelve `null`, que la UI muestra como "todavía
 * no se generó" — distinto de un reporte vacío.
 */
export async function getLatestReportsByCadenceAction(): Promise<
  Record<ReportPeriod, ExecutiveReport | null>
> {
  const empty: Record<ReportPeriod, ExecutiveReport | null> = {
    daily: null,
    weekly: null,
    monthly: null,
  };

  if (!isSupabaseConfigured()) return empty;

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  // El último de cada cadencia, con una consulta por cadencia (usa el índice
  // organization_id, period, period_start DESC). Antes se traían los últimos
  // 60 de cualquier cadencia: el mensual guarda el día 1 del mes que reporta
  // y, hacia fin de mes, los diarios lo dejaban fuera de esos 60 (SCRUM-67).
  const periodos = Object.keys(empty) as ReportPeriod[];
  const resultados = await Promise.all(
    periodos.map((period) =>
      supabase
        .from("executive_reports")
        .select(SELECT)
        .eq("organization_id", organizationId)
        .eq("period", period)
        .order("period_start", { ascending: false })
        .order("generated_at", { ascending: false })
        .limit(1)
    )
  );

  // Si falla alguna consulta no se muestra a medias: una cadencia en `null`
  // diría "todavía no se generó" aunque el reporte exista.
  const fallida = resultados.findIndex(({ error }) => error);
  if (fallida >= 0) {
    const mensaje = resultados[fallida]!.error!.message;
    console.error("[getLatestReportsByCadence]", periodos[fallida], mensaje);
    throw new Error("No se pudieron cargar los reportes.");
  }

  resultados.forEach(({ data }, i) => {
    const row = data?.[0];
    if (row) empty[periodos[i]!] = mapRow(row);
  });

  return empty;
}

export async function listExecutiveReportsAction(): Promise<ExecutiveReport[]> {
  if (!isSupabaseConfigured()) return [];

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("executive_reports")
    .select(SELECT)
    .eq("organization_id", organizationId)
    .order("generated_at", { ascending: false });

  if (error) {
    console.error("[listExecutiveReports]", error.message);
    return [];
  }

  return (data ?? []).map(mapRow);
}

export async function getExecutiveReportByIdAction(
  id: string
): Promise<ExecutiveReport | null> {
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return null;

  if (!isSupabaseConfigured()) return null;

  const organizationId = await requireOrganizationId();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("executive_reports")
    .select(SELECT)
    .eq("organization_id", organizationId)
    .eq("id", parsedId.data)
    .maybeSingle();

  if (error) {
    console.error("[getExecutiveReportById]", error.message);
    return null;
  }

  return data ? mapRow(data) : null;
}
