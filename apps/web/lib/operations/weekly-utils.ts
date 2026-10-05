import { sumarDias } from "@/lib/fechas/calendario";
import type { Department } from "@/types/operations";

export type DbWeeklyDepartment =
  | "ventas"
  | "delivery"
  | "operaciones"
  | "marketing"
  | "founder";

export const WEEKLY_DEPARTMENTS: DbWeeklyDepartment[] = [
  "ventas",
  "delivery",
  "operaciones",
  "marketing",
  "founder",
];

export const UI_TO_DB_DEPARTMENT: Record<Department, DbWeeklyDepartment> = {
  sales: "ventas",
  delivery: "delivery",
  operations: "operaciones",
  marketing: "marketing",
  founder: "founder",
};

export const DB_TO_UI_DEPARTMENT: Record<DbWeeklyDepartment, Department> = {
  ventas: "sales",
  delivery: "delivery",
  operaciones: "operations",
  marketing: "marketing",
  founder: "founder",
};

export const DB_DEPARTMENT_LABELS: Record<DbWeeklyDepartment, string> = {
  ventas: "Ventas",
  delivery: "Delivery",
  operaciones: "Operaciones",
  marketing: "Marketing",
  founder: "Founder",
};

/**
 * Lunes de la semana (ISO) de una fecha calendario, en YYYY-MM-DD.
 *
 * Recibe "hoy" ya armado: el de la zona de la organización. Antes tomaba el reloj del proceso: en el
 * servidor (UTC), el domingo de noche en Argentina ya era lunes y los inputs
 * caían en la semana siguiente; y la medianoche local pasada por
 * `toISOString` daba el domingo en zonas al este de UTC (SCRUM-493).
 */
export function getCurrentWeekStart(hoy: string): string {
  // Día de la semana de la fecha calendario (0 = domingo), leído sobre el
  // calendario y no sobre el reloj de nadie.
  const diaDeLaSemana = new Date(`${hoy}T00:00:00Z`).getUTCDay();
  return sumarDias(hoy, diaDeLaSemana === 0 ? -6 : 1 - diaDeLaSemana);
}

export function getWeekEndLabel(weekStart: string): string {
  const end = new Date(`${weekStart}T12:00:00`);
  end.setDate(end.getDate() + 6);
  return end.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function getWeekStartLabel(weekStart: string): string {
  return new Date(`${weekStart}T12:00:00`).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  });
}

export function formatWeekRange(weekStart: string): string {
  return `Semana del ${getWeekStartLabel(weekStart)} al ${getWeekEndLabel(weekStart)}`;
}
