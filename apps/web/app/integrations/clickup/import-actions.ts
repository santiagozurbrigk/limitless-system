"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { fechaDeHoyDeLaOrganizacion } from "@/lib/fechas/organizacion";
import {
  fetchClickUpWorkspaces,
  fetchClickUpLists,
  fetchAllClickUpTasks,
  type ClickUpTask,
  type ClickUpList,
  type ClickUpWorkspace,
} from "@/lib/clickup/client";
import { buildAutoMapping, type FieldMapping, type ClickUpFieldSource, type ClientField } from "@/lib/clickup/field-mapper";

export type ClickUpConnectResult =
  | { success: true; workspaces: ClickUpWorkspace[] }
  | { success: false; error: string };

export async function validateClickUpKeyAction(apiKey: string): Promise<ClickUpConnectResult> {
  await requireOrganizationId();
  if (!apiKey?.trim()) return { success: false, error: "Ingresá tu API key de ClickUp." };
  try {
    const workspaces = await fetchClickUpWorkspaces(apiKey.trim());
    if (!workspaces.length) return { success: false, error: "No se encontraron workspaces en tu cuenta." };
    return { success: true, workspaces };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al conectar con ClickUp." };
  }
}

export type FetchListsResult =
  | { success: true; lists: ClickUpList[] }
  | { success: false; error: string };

export async function fetchClickUpListsAction(apiKey: string, workspaceId: string): Promise<FetchListsResult> {
  await requireOrganizationId();
  try {
    const lists = await fetchClickUpLists(apiKey, workspaceId);
    return { success: true, lists };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener listas." };
  }
}

export type ClickUpPreviewRow = Record<string, string>;

export type FetchPreviewResult =
  | {
      success: true;
      fields: ClickUpFieldSource[];
      mapping: FieldMapping[];
      preview: ClickUpPreviewRow[];
      totalTasks: number;
    }
  | { success: false; error: string };

export async function fetchClickUpPreviewAction(
  apiKey: string,
  listId: string
): Promise<FetchPreviewResult> {
  await requireOrganizationId();
  try {
    const tasks = await fetchAllClickUpTasks(apiKey, listId);
    if (!tasks.length) {
      return { success: false, error: "La lista no tiene tareas." };
    }

    const customFieldNames = new Set<string>();
    for (const task of tasks) {
      for (const cf of task.custom_fields ?? []) {
        if (cf.name) customFieldNames.add(cf.name);
      }
    }

    const fields: ClickUpFieldSource[] = [
      { name: "Nombre de tarea", isBuiltin: true },
      ...Array.from(customFieldNames).map((n) => ({ name: n, isBuiltin: false })),
    ];

    const mapping = buildAutoMapping(fields);

    const preview: ClickUpPreviewRow[] = tasks.slice(0, 5).map((task) =>
      extractRowValues(task, fields)
    );

    return { success: true, fields, mapping, preview, totalTasks: tasks.length };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener vista previa." };
  }
}

function extractRowValues(task: ClickUpTask, fields: ClickUpFieldSource[]): ClickUpPreviewRow {
  const row: ClickUpPreviewRow = {};
  for (const field of fields) {
    if (field.isBuiltin) {
      row[field.name] = task.name ?? "";
    } else {
      const cf = (task.custom_fields ?? []).find((f) => f.name === field.name);
      row[field.name] = resolveCustomFieldValue(cf?.value, cf?.type ?? "");
    }
  }
  return row;
}

function resolveCustomFieldValue(value: unknown, type: string): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (type === "drop_down" && typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((v) => (typeof v === "object" && v !== null ? (v as Record<string, unknown>).value ?? "" : v)).join(", ");
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    return String(obj.value ?? obj.name ?? "");
  }
  return String(value);
}

export type ImportClickUpResult =
  | { success: true; inserted: number; errors: number }
  | { success: false; error: string };

export async function importClickUpClientsAction(
  apiKey: string,
  listId: string,
  clientMapping: FieldMapping[]
): Promise<ImportClickUpResult> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase no configurado." };

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  let tasks: ClickUpTask[];
  try {
    tasks = await fetchAllClickUpTasks(apiKey, listId);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener tareas." };
  }

  if (!tasks.length) return { success: false, error: "No se encontraron tareas en la lista." };

  // Re-build auto-mapping server-side so we don't depend on client serialization.
  // Then override with explicit client choices for custom fields.
  const customFieldNames = Array.from(
    new Set(tasks.flatMap((t) => (t.custom_fields ?? []).map((cf) => cf.name).filter(Boolean)))
  ) as string[];

  const serverAutoMapping = buildAutoMapping([
    { name: "task_name_builtin", isBuiltin: true },
    ...customFieldNames.map((n) => ({ name: n, isBuiltin: false })),
  ]);

  // For custom fields: prefer the client mapping (user may have adjusted it)
  const effectiveMapping: (FieldMapping & { isBuiltin?: boolean })[] = serverAutoMapping.map((sm) => {
    if (sm.clickupField === "task_name_builtin") return { ...sm, isBuiltin: true };
    const override = clientMapping.find((m) => m.clickupField === sm.clickupField);
    if (override) return { ...override, isBuiltin: false };
    return { ...sm, isBuiltin: false };
  });

  const activeMapping = effectiveMapping.filter(
    (m) => m.clientField !== null && m.clientField !== ("null" as ClientField)
  ) as (FieldMapping & { clientField: ClientField; isBuiltin?: boolean })[];

  let inserted = 0;
  let skipped = 0;
  let insertErrors = 0;

  // Alta por defecto: hoy en la organización (el servidor corre en UTC y de
  // noche en Argentina ya sería mañana). Una sola consulta para todo el lote.
  const hoy = await fechaDeHoyDeLaOrganizacion(supabase, organizationId);

  console.log(`[clickup import] total tasks: ${tasks.length}, first task name: "${tasks[0]?.name}", keys: ${Object.keys(tasks[0] ?? {}).join(",")}`);

  for (const task of tasks) {
    // Always use task.name directly — never rely on mapping serialization for this
    const taskName = (task.name ?? "").trim();
    if (!taskName) { skipped++; continue; }

    const clientRow: Record<string, unknown> = {
      organization_id: organizationId,
      name: taskName,
    };

    // Apply custom field mappings
    for (const m of activeMapping) {
      if (m.clientField === "name" || m.isBuiltin) continue; // already set above
      const cf = (task.custom_fields ?? []).find((f) => f.name === m.clickupField);
      if (!cf) continue;
      const rawValue = resolveCustomFieldValue(cf.value, cf.type ?? "");
      const coerced = coerceFieldValue(m.clientField, rawValue);
      if (coerced !== null) clientRow[m.clientField] = coerced;
    }

    if (!clientRow.join_date) clientRow.join_date = hoy;
    if (!clientRow.status) clientRow.status = "active";
    if (clientRow.total_amount == null) clientRow.total_amount = 0;
    if (!clientRow.payment_type) clientRow.payment_type = "upfront";
    if (!clientRow.platform) clientRow.platform = "other";

    const { error } = await supabase.from("clients").insert(clientRow);
    if (error) {
      console.error("[clickup import] insert error:", error.message, "row:", JSON.stringify(clientRow));
      insertErrors++;
      continue;
    }
    inserted++;
  }

  return { success: true, inserted, errors: skipped + insertErrors };
}

function coerceFieldValue(field: ClientField, raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  switch (field) {
    case "total_amount":
    case "upfront_amount":
    case "fee_amount": {
      const n = parseFloat(trimmed.replace(/[^0-9.,]/g, "").replace(",", "."));
      return isNaN(n) ? null : n;
    }
    case "is_success_case":
      return /^(si|sí|yes|true|1)$/i.test(trimmed);
    case "join_date": {
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    case "payment_type": {
      const pt = trimmed.toLowerCase();
      if (/instal|cuota|mensual|quota/i.test(pt)) return "installments";
      if (/anticipo.*cuota|upfront.*fee|cuota.*anticipo/i.test(pt)) return "upfront_fee";
      return "upfront";
    }
    case "status": {
      const st = trimmed.toLowerCase();
      if (/activ/i.test(st)) return "active";
      if (/inactiv|pausad/i.test(st)) return "pending_onboarding";
      if (/exit|success/i.test(st)) return "success_case";
      return "active";
    }
    case "platform": {
      const pl = trimmed.toLowerCase();
      if (/mercado|mp\b/i.test(pl)) return "mercadopago";
      if (/stripe/i.test(pl)) return "stripe";
      if (/paypal/i.test(pl)) return "paypal";
      if (/transfer|banco|bank/i.test(pl)) return "bank_transfer";
      return "other";
    }
    default:
      return trimmed;
  }
}
