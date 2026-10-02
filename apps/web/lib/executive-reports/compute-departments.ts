import type { SupabaseClient } from "@supabase/supabase-js";
import type { FrequentObjectionSummary } from "@/types/sales";
import type { ExecutiveReport } from "@/types/executive-reports";

export type DepartmentStatus = "healthy" | "watch" | "critical";

/**
 * Departamentos reportados en el reporte ejecutivo, con su label visible y la
 * clave que usan en la tabla `weekly_inputs`. Pensado para reutilizarse en
 * `/operations/overview`, que hoy usa un grid mockeado.
 */
const DEPARTMENT_MAP: Array<{ name: string; dbKey: string }> = [
  { name: "Ventas", dbKey: "ventas" },
  { name: "Delivery", dbKey: "delivery" },
  { name: "Operaciones", dbKey: "operaciones" },
  { name: "Marketing", dbKey: "marketing" },
  { name: "Fundador", dbKey: "founder" },
];

function rank(status: DepartmentStatus): number {
  return status === "critical" ? 0 : status === "watch" ? 1 : 2;
}

/** Devuelve el peor de dos estados (el más conservador). */
function worst(a: DepartmentStatus, b: DepartmentStatus): DepartmentStatus {
  return rank(a) <= rank(b) ? a : b;
}

function statusFromRatings(ratings: number[]): DepartmentStatus | null {
  if (ratings.length === 0) return null;
  const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  if (avg >= 4) return "healthy";
  if (avg >= 3) return "watch";
  return "critical";
}

/**
 * Calcula el estado real de cada departamento a partir de `weekly_inputs`
 * recientes. Reglas honestas:
 * - Sin inputs recientes para un departamento → "watch" (ni optimista ni
 *   alarmista sin datos).
 * - Con ratings → promedio: ≥4 healthy, ≥3 watch, <3 critical.
 * - Con inputs de texto pero sin rating → "watch" (hay actividad, sin señal).
 * - Ventas: además se degrada (nunca se mejora) si las objeciones frecuentes
 *   son muchas.
 */
export async function computeDepartmentStatuses(
  admin: SupabaseClient,
  organizationId: string,
  options: {
    sinceDays?: number;
    /** Rango fijo (YYYY-MM-DD) de `week_start`. Si viene, reemplaza a `sinceDays`. */
    desde?: string;
    hasta?: string;
    frequentObjections?: FrequentObjectionSummary[];
  } = {}
): Promise<ExecutiveReport["departments"]> {
  const sinceDays = options.sinceDays ?? 7;
  const since =
    options.desde ??
    new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let query = admin
    .from("weekly_inputs")
    .select("department, content, rating")
    .eq("organization_id", organizationId)
    .gte("week_start", since);
  if (options.hasta) query = query.lte("week_start", options.hasta);
  const { data } = await query;

  const byDept = new Map<string, { ratings: number[]; hasContent: boolean }>();
  for (const row of data ?? []) {
    const key = String(row.department);
    const bucket = byDept.get(key) ?? { ratings: [], hasContent: false };
    if (typeof row.rating === "number") bucket.ratings.push(row.rating);
    if (typeof row.content === "string" && row.content.trim().length > 0) {
      bucket.hasContent = true;
    }
    byDept.set(key, bucket);
  }

  const objectionsTotal = (options.frequentObjections ?? []).reduce(
    (sum, o) => sum + o.count,
    0
  );

  return DEPARTMENT_MAP.map(({ name, dbKey }) => {
    const bucket = byDept.get(dbKey);

    let status: DepartmentStatus;
    if (!bucket || (bucket.ratings.length === 0 && !bucket.hasContent)) {
      status = "watch";
    } else {
      status = statusFromRatings(bucket.ratings) ?? "watch";
    }

    if (dbKey === "ventas") {
      if (objectionsTotal >= 20) status = worst(status, "critical");
      else if (objectionsTotal >= 8) status = worst(status, "watch");
    }

    return { name, status };
  });
}
