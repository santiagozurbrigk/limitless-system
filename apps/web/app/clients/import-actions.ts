"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { fechaDeHoyDeLaOrganizacion } from "@/lib/fechas/organizacion";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import { parseClientsExcel, type ColumnMapping, type ClientImportRow } from "@/lib/clients/excel-parser";
import { matchPlanByName, selectBestSystem, type PlanLike } from "@/lib/clients/plan-matcher";
import { parseClosingCallsExcel, type ClosingColumnMapping } from "@/lib/closing/excel-parser";
import {
  parseSalesMetricsExcel,
  parseFinanceMetricsExcel,
  parseSalesMetricsTransposed,
  parseFinanceMetricsTransposed,
  isTransposedMetricsSheet,
  deriveSalesMetrics,
  type SalesMetricsColumnMapping,
  type FinanceMetricsColumnMapping,
} from "@/lib/metrics/excel-parser";

// ─── Preview de encabezados y primeras filas ──────────────────────────────────

export type ExcelPreview = {
  headers: string[];
  rows: Record<string, string>[];
  allSheets: string[];
  activeSheet: string;
  /** Para hojas transpuestas (meses=columnas): etiquetas de la columna A (nombres de métricas). */
  rowLabels?: string[];
};

export async function getExcelPreviewAction(
  fileBase64: string,
  sheetName?: string
): Promise<MutationResult<ExcelPreview>> {
  return runMutation(async () => {
    await requireOrganizationId();
    const buffer = Buffer.from(fileBase64, "base64");
    const wb = XLSX.read(buffer, { type: "buffer", raw: false });
    const allSheets = wb.SheetNames;
    if (!allSheets.length) throw new Error("El archivo no tiene hojas.");

    // Si se pide una hoja específica la usamos; si no, elegimos la mejor heurísticamente
    const targetSheet = sheetName
      ? allSheets.find((n) => n === sheetName) ?? allSheets[0]
      : pickBestSheet(wb);

    const sheet = wb.Sheets[targetSheet ?? ""];

    // Leer como arrays crudos para detectar y saltar filas de título/merged.
    // sheet_to_json con header:0 genera "__EMPTY" cuando la primera fila
    // tiene una sola celda (título merged) — { header: 1 } evita ese problema.
    const rawArrays = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    if (!rawArrays.length) {
      return { headers: [], rows: [], allSheets, activeSheet: targetSheet ?? allSheets[0] ?? "" };
    }

    // Primera fila con ≥2 celdas no vacías = fila real de encabezados
    const headerRowIdx = rawArrays.findIndex(
      (row) => (row as unknown[]).filter((v) => String(v ?? "").trim()).length >= 2
    );
    if (headerRowIdx === -1) {
      return { headers: [], rows: [], allSheets, activeSheet: targetSheet ?? allSheets[0] ?? "" };
    }

    const headerRow = (rawArrays[headerRowIdx] as unknown[]).map((v) => String(v ?? "").trim());
    const dataRows = rawArrays.slice(headerRowIdx + 1);

    const headers = headerRow.filter(Boolean);
    const rows = dataRows.slice(0, 5).map((row) => {
      const arr = row as unknown[];
      const out: Record<string, string> = {};
      headerRow.forEach((h, i) => {
        if (h) out[h] = String(arr[i] ?? "").slice(0, 80);
      });
      return out;
    });

    // Para hojas transpuestas, devolver TODAS las etiquetas de la columna A
    // (son los nombres de las métricas que el usuario podrá mapear manualmente)
    let rowLabels: string[] | undefined;
    if (isTransposedMetricsSheet(headers)) {
      rowLabels = dataRows
        .map((row) => String((row as unknown[])[0] ?? "").trim())
        .filter(Boolean);
    }

    return { headers, rows, allSheets, activeSheet: targetSheet ?? allSheets[0] ?? "", rowLabels };
  });
}

/**
 * Heurística: elige la hoja con más encabezados no vacíos en la fila de datos.
 * Usa { header: 1 } para encontrar la fila real de encabezados (saltea títulos merged).
 * Si hay empate prefiere la primera con nombre que contenga palabras clave de datos.
 */
function pickBestSheet(wb: XLSX.WorkBook): string {
  // Palabras clave en el nombre de la hoja → bonus de nombre
  const SHEET_NAME_KEYWORDS = /data|cliente|lead|contacto|venta|llamada|crm|registro|hoja|trazabilidad|instagram|seguimiento|alumnos|miembros|members/i;
  // Columnas típicas de un CRM de clientes → bonus de contenido
  const CLIENT_HEADER_KEYWORDS = /^(nombre|name|apellido|cliente|email|correo|tel[eé]fono|celular|instagram|ig|programa|plan|producto|cc|monto|fecha)$/i;

  let bestSheet = wb.SheetNames[0] ?? "";
  let bestScore = -1;

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rawArrays = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (!rawArrays.length) continue;
    const headerRowIdx = rawArrays.findIndex(
      (row) => (row as unknown[]).filter((v) => String(v ?? "").trim()).length >= 2
    );
    if (headerRowIdx === -1) continue;
    const headerCells = (rawArrays[headerRowIdx] as unknown[]).filter((v) => String(v ?? "").trim());
    const headerCount = headerCells.length;

    // Bonus por nombre de la hoja
    const nameBonus = SHEET_NAME_KEYWORDS.test(name) ? 5 : 0;

    // Bonus por cantidad de columnas típicas de CRM de clientes presentes
    const clientColMatches = headerCells.filter((h) =>
      CLIENT_HEADER_KEYWORDS.test(String(h).trim())
    ).length;
    // Normalizar: cuántas de las columnas son "de cliente" (porcentaje × 10, máx 15)
    const clientColRatio = headerCount > 0 ? clientColMatches / headerCount : 0;
    const clientColBonus = Math.min(Math.round(clientColRatio * 15), 15);

    const score = headerCount + nameBonus + clientColBonus;
    if (score > bestScore) {
      bestScore = score;
      bestSheet = name;
    }
  }
  return bestSheet;
}

// ─── Tipos de resultado ───────────────────────────────────────────────────────

export type ExcelImportResult = {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  /** Cantidad de clientes a los que se asignó un plan automáticamente por match de nombre */
  planMatchCount?: number;
};

// ─── Importar clientes desde Excel ───────────────────────────────────────────

/**
 * Recibe el archivo como base64 (vendrá del cliente via FormData serializado).
 * El Server Action no puede recibir File directamente en Next.js 15 app router
 * cuando se serializa por la red → lo enviamos como base64.
 */
export async function importClientsFromExcelAction(
  fileBase64: string,
  columnMapping?: ColumnMapping,
  sheetName?: string
): Promise<MutationResult<ExcelImportResult>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const buffer = Buffer.from(fileBase64, "base64");
    const hoy = await fechaDeHoyDeLaOrganizacion(supabase, organizationId);
    const { rows, errors } = parseClientsExcel(buffer, hoy, columnMapping, sheetName);

    if (!rows.length) {
      return { inserted: 0, skipped: 0, errors: errors.length ? errors : [{ row: 0, message: "El archivo no contiene clientes para importar." }] };
    }

    // Buscar cuáles ya existen por nombre (case-insensitive)
    const names = rows.map((r) => r.name.toLowerCase());
    const { data: existing } = await supabase
      .from("clients")
      .select("name")
      .eq("organization_id", organizationId);

    const existingNamesLower = new Set(
      (existing ?? []).map((r: { name: string }) => r.name.toLowerCase())
    );

    const toInsert = rows.filter((r) => !existingNamesLower.has(r.name.toLowerCase()));
    const skipped = rows.length - toInsert.length;
    void names;

    if (!toInsert.length) {
      return { inserted: 0, skipped, errors };
    }

    // Cargar planes de la org para hacer auto-match por nombre de producto
    const { data: plansData } = await supabase
      .from("plans")
      .select("id, name, installment_systems")
      .eq("organization_id", organizationId);

    const plans: PlanLike[] = (plansData ?? []).map((p: {
      id: string;
      name: string;
      installment_systems: Array<{ id: string }> | null;
    }) => ({
      id: p.id,
      name: p.name,
      installmentSystems: p.installment_systems ?? [],
    }));

    const insertPayload = toInsert.map((row: ClientImportRow) => {
      // Intentar match automático del producto con un plan existente
      const matchedPlan = row.product ? matchPlanByName(row.product, plans) : null;
      const planId = matchedPlan?.id ?? null;
      const systemId = matchedPlan ? selectBestSystem(matchedPlan) : null;

      return {
        organization_id:              organizationId,
        name:                         row.name,
        join_date:                    row.joinDate || hoy,
        payment_type:                 "upfront" as const,
        platform:                     "other" as const,
        total_amount:                 row.totalAmount ?? 0,
        status:                       row.status ?? "active",
        is_success_case:              false,
        installments:                 [],
        ai_insights:                  buildClientInsights(row),
        linked_calls:                 [],
        offered_product:              row.product ?? null,
        plan_id:                      planId,
        selected_installment_system_id: systemId,
      };
    });

    // Insertar en lotes de 50
    const BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < insertPayload.length; i += BATCH) {
      const batch = insertPayload.slice(i, i + BATCH);
      const { error } = await supabase.from("clients").insert(batch);
      if (error) throw new Error(error.message);
      inserted += batch.length;
    }

    const planMatchCount = insertPayload.filter((r) => r.plan_id).length;
    console.info(`[import-clients-excel] org=${organizationId} inserted=${inserted} skipped=${skipped} planMatchCount=${planMatchCount}`);

    // Invalidar caché de Next.js para que /clients muestre los datos recién importados
    revalidatePath("/clients");
    revalidatePath("/dashboard");

    return { inserted, skipped, errors, planMatchCount };
  });
}

function buildClientInsights(row: ClientImportRow): string[] {
  const insights: string[] = [];
  if (row.email) insights.push(`Email: ${row.email}`);
  if (row.phone) insights.push(`Teléfono: ${row.phone}`);
  if (row.notes) insights.push(`Notas: ${row.notes}`);
  return insights;
}

// ─── Importar llamadas de cierre desde Excel ──────────────────────────────────

export async function importClosingCallsFromExcelAction(
  fileBase64: string,
  columnMapping?: ClosingColumnMapping
): Promise<MutationResult<ExcelImportResult>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const buffer = Buffer.from(fileBase64, "base64");
    const { rows, errors } = parseClosingCallsExcel(buffer, columnMapping);

    if (!rows.length) {
      return { inserted: 0, skipped: 0, errors: errors.length ? errors : [{ row: 0, message: "El archivo no contiene llamadas para importar." }] };
    }

    const insertPayload = rows.map((row) => ({
      organization_id: organizationId,
      lead_name:       row.leadName,
      scheduled_at:    row.scheduledAt,
      status:          row.status,
      form_answers:    buildClosingFormAnswers(row),
    }));

    const BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < insertPayload.length; i += BATCH) {
      const batch = insertPayload.slice(i, i + BATCH);
      const { error } = await supabase.from("closing_calls").insert(batch);
      if (error) throw new Error(error.message);
      inserted += batch.length;
    }

    console.info(`[import-closing-excel] org=${organizationId} inserted=${inserted}`);
    return { inserted, skipped: 0, errors };
  });
}

function buildClosingFormAnswers(row: { email?: string; amountClosed?: number; notes?: string }) {
  const answers: Array<{ question: string; answer: string }> = [];
  if (row.email)       answers.push({ question: "Email",          answer: row.email });
  if (row.amountClosed) answers.push({ question: "Monto cerrado", answer: String(row.amountClosed) });
  if (row.notes)       answers.push({ question: "Notas",          answer: row.notes });
  return answers;
}

// ─── Importar métricas de ventas desde Excel ──────────────────────────────────

export async function importSalesMetricsFromExcelAction(
  fileBase64: string,
  columnMapping: SalesMetricsColumnMapping,
  sheetName?: string
): Promise<MutationResult<ExcelImportResult>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const buffer = Buffer.from(fileBase64, "base64");
    const hoy = await fechaDeHoyDeLaOrganizacion(supabase, organizationId);
    const { rows, errors } = parseSalesMetricsExcel(buffer, hoy, columnMapping, sheetName);

    if (!rows.length) {
      return {
        inserted: 0,
        skipped: 0,
        errors: errors.length ? errors : [{ row: 0, message: "El archivo no contiene métricas de ventas para importar." }],
      };
    }

    const BATCH = 50;
    let inserted = 0;
    const skipped = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((row) => ({
        organization_id: organizationId,
        category:        "sales" as const,
        period_start:    row.periodStart,
        period_label:    row.periodLabel,
        metrics:         row.metrics,
      }));
      const { error, count } = await supabase
        .from("metrics_snapshots")
        .upsert(batch, { onConflict: "organization_id,category,period_start", count: "exact" });
      if (error) throw new Error(error.message);
      inserted += count ?? batch.length;
    }

    console.info(`[import-sales-metrics] org=${organizationId} inserted=${inserted} skipped=${skipped}`);
    return { inserted, skipped, errors };
  });
}

// ─── Importar métricas de finanzas desde Excel ────────────────────────────────

export async function importFinanceMetricsFromExcelAction(
  fileBase64: string,
  columnMapping: FinanceMetricsColumnMapping,
  sheetName?: string
): Promise<MutationResult<ExcelImportResult>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const buffer = Buffer.from(fileBase64, "base64");
    const hoy = await fechaDeHoyDeLaOrganizacion(supabase, organizationId);
    const { rows, errors } = parseFinanceMetricsExcel(buffer, hoy, columnMapping, sheetName);

    if (!rows.length) {
      return {
        inserted: 0,
        skipped: 0,
        errors: errors.length ? errors : [{ row: 0, message: "El archivo no contiene métricas de finanzas para importar." }],
      };
    }

    const BATCH = 50;
    let inserted = 0;
    const skipped = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((row) => ({
        organization_id: organizationId,
        category:        "finance" as const,
        period_start:    row.periodStart,
        period_label:    row.periodLabel,
        metrics:         row.metrics,
      }));
      const { error, count } = await supabase
        .from("metrics_snapshots")
        .upsert(batch, { onConflict: "organization_id,category,period_start", count: "exact" });
      if (error) throw new Error(error.message);
      inserted += count ?? batch.length;
    }

    console.info(`[import-finance-metrics] org=${organizationId} inserted=${inserted} skipped=${skipped}`);
    return { inserted, skipped, errors };
  });
}

// ─── Importar métricas de ventas transpuestas (pivot: métricas=filas, meses=columnas) ──

export async function importSalesMetricsTransposedAction(
  fileBase64: string,
  /** Mapeo manual: { [fieldKey]: "Etiqueta de fila exacta en el Excel" } */
  rowMapping: Record<string, string>,
  sheetName?: string
): Promise<MutationResult<ExcelImportResult>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const buffer = Buffer.from(fileBase64, "base64");
    const hoy = await fechaDeHoyDeLaOrganizacion(supabase, organizationId);
    const { rows, errors } = parseSalesMetricsTransposed(buffer, hoy, rowMapping, sheetName);

    if (!rows.length) {
      return {
        inserted: 0,
        skipped: 0,
        errors: errors.length ? errors : [{ row: 0, message: "No se encontraron métricas de ventas en el formato transpuesto." }],
      };
    }

    const BATCH = 50;
    let inserted = 0;
    const skipped = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((row) => ({
        organization_id: organizationId,
        category:        "sales" as const,
        period_start:    row.periodStart,
        period_label:    row.periodLabel,
        metrics:         row.metrics,
      }));
      const { error, count } = await supabase
        .from("metrics_snapshots")
        .upsert(batch, { onConflict: "organization_id,category,period_start", count: "exact" });
      if (error) throw new Error(error.message);
      inserted += count ?? batch.length;
    }

    console.info(`[import-sales-metrics-transposed] org=${organizationId} inserted=${inserted} skipped=${skipped}`);
    return { inserted, skipped, errors };
  });
}

// ─── Importar métricas de finanzas transpuestas ───────────────────────────────

export async function importFinanceMetricsTransposedAction(
  fileBase64: string,
  /** Mapeo manual: { [fieldKey]: "Etiqueta de fila exacta en el Excel" } */
  rowMapping: Record<string, string>,
  sheetName?: string
): Promise<MutationResult<ExcelImportResult>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const buffer = Buffer.from(fileBase64, "base64");
    const hoy = await fechaDeHoyDeLaOrganizacion(supabase, organizationId);
    const { rows, errors } = parseFinanceMetricsTransposed(buffer, hoy, rowMapping, sheetName);

    if (!rows.length) {
      return {
        inserted: 0,
        skipped: 0,
        errors: errors.length ? errors : [{ row: 0, message: "No se encontraron métricas de finanzas en el formato transpuesto." }],
      };
    }

    const BATCH = 50;
    let inserted = 0;
    const skipped = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((row) => ({
        organization_id: organizationId,
        category:        "finance" as const,
        period_start:    row.periodStart,
        period_label:    row.periodLabel,
        metrics:         row.metrics,
      }));
      const { error, count } = await supabase
        .from("metrics_snapshots")
        .upsert(batch, { onConflict: "organization_id,category,period_start", count: "exact" });
      if (error) throw new Error(error.message);
      inserted += count ?? batch.length;
    }

    console.info(`[import-finance-metrics-transposed] org=${organizationId} inserted=${inserted} skipped=${skipped}`);
    return { inserted, skipped, errors };
  });
}

// Re-export de tipos para el wizard
export type { SalesMetricsColumnMapping, FinanceMetricsColumnMapping };

// ─── Importar métricas de ventas manualmente (formulario inline) ──────────────

/** Una fila del formulario manual. period = "YYYY-MM" */
export type ManualSalesMetricInput = {
  period:         string;
  leadsTotales?:  number;
  agendasTotales?: number;
  asistencias?:   number;
  inasistencias?: number;
  cierres?:       number;
  facturacion?:   number;
  gastos?:        number;
};

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function periodLabel(yyyymm: string): string {
  const [year, month] = yyyymm.split("-");
  const name = MONTH_NAMES_ES[(parseInt(month ?? "1", 10) - 1)] ?? month;
  return `${name} ${year}`;
}

export async function importSalesMetricsManualAction(
  rows: ManualSalesMetricInput[]
): Promise<MutationResult<ExcelImportResult>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const validRows = rows.filter(r => /^\d{4}-\d{2}$/.test(r.period));
    if (!validRows.length) {
      return {
        inserted: 0,
        skipped:  0,
        errors:   [{ row: 0, message: "No hay períodos válidos para importar (formato esperado: AAAA-MM)." }],
      };
    }

    const batch = validRows.map(row => {
      const raw: Record<string, number> = {};
      if (row.leadsTotales   != null) raw["leads_totales"]   = row.leadsTotales;
      if (row.agendasTotales != null) raw["agendas_totales"] = row.agendasTotales;
      if (row.asistencias    != null) raw["asistencias"]     = row.asistencias;
      if (row.inasistencias  != null) raw["inasistencias"]   = row.inasistencias;
      if (row.cierres        != null) raw["cierres"]         = row.cierres;
      if (row.facturacion    != null) raw["facturacion"]     = row.facturacion;
      if (row.gastos         != null) raw["gastos"]          = row.gastos;

      return {
        organization_id: organizationId,
        category:        "sales" as const,
        period_start:    `${row.period}-01`,
        period_label:    periodLabel(row.period),
        metrics:         deriveSalesMetrics(raw),
      };
    });

    const { error, count } = await supabase
      .from("metrics_snapshots")
      .upsert(batch, { onConflict: "organization_id,category,period_start", count: "exact" });
    if (error) throw new Error(error.message);

    const inserted = count ?? batch.length;
    console.info(`[import-sales-metrics-manual] org=${organizationId} inserted=${inserted}`);
    return { inserted, skipped: 0, errors: [] };
  });
}
