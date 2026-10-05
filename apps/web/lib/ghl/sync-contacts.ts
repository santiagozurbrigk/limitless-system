/**
 * Mapeo idempotente GHL Contacts → clients.
 * Los contactos se deduplan por nombre (normalizado).
 * Solo inserta los que no existen todavía — no sobreescribe clientes existentes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { esFechaCalendario, fechaDeHoyEnZona, fechaEnZona } from "@/lib/fechas/calendario";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import type { GHLContact } from "./client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveContactName(c: GHLContact): string {
  const parts = [c.firstName?.trim(), c.lastName?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Sin nombre";
}

/**
 * La fecha de alta del contacto en el día de la organización. `dateAdded` es un
 * instante: su fecha de UTC caía en el día siguiente para un contacto creado de
 * noche en Argentina, y sin fecha se usaba el "hoy" de UTC (SCRUM-493).
 */
export function resolveJoinDate(c: GHLContact, zona: string | null, ahora: Date = new Date()): string {
  if (c.dateAdded) {
    const texto = c.dateAdded.trim();
    if (esFechaCalendario(texto)) return texto;
    const d = new Date(texto);
    if (!isNaN(d.getTime())) return fechaEnZona(d, zona);
  }
  return fechaDeHoyEnZona(zona, ahora);
}

function buildNotes(c: GHLContact): Array<{ question: string; answer: string }> {
  const notes: Array<{ question: string; answer: string }> = [];
  if (c.email) notes.push({ question: "Email", answer: c.email });
  if (c.phone) notes.push({ question: "Teléfono", answer: c.phone });
  if (c.tags?.length) notes.push({ question: "Tags GHL", answer: c.tags.join(", ") });
  return notes;
}

// ─── Tipos de resultado ───────────────────────────────────────────────────────

export type GHLContactsSyncResult = {
  fetched: number;
  inserted: number;
  skippedExisting: number;
};

// ─── Función principal ────────────────────────────────────────────────────────

export async function syncGHLContactsForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  contacts: GHLContact[]
): Promise<GHLContactsSyncResult> {
  const result: GHLContactsSyncResult = {
    fetched: contacts.length,
    inserted: 0,
    skippedExisting: 0,
  };

  if (!contacts.length) return result;

  // Resolver nombres de todos los contactos
  const withNames = contacts.map((c) => ({
    contact: c,
    name: resolveContactName(c),
  }));

  // Buscar clientes ya existentes por nombre (normalizado, case-insensitive)
  const names = withNames.map((x) => x.name.toLowerCase());
  const { data: existing, error: fetchErr } = await supabase
    .from("clients")
    .select("name")
    .eq("organization_id", organizationId);

  if (fetchErr) throw new Error(fetchErr.message);

  const existingNamesLower = new Set(
    (existing ?? []).map((r: { name: string }) => r.name.toLowerCase())
  );
  void names; // used implicitly via existingNamesLower

  const toInsert = withNames.filter(
    ({ name }) => !existingNamesLower.has(name.toLowerCase())
  );
  result.skippedExisting = contacts.length - toInsert.length;

  if (!toInsert.length) return result;

  // Una sola consulta por organización, no una por contacto.
  const zona = await leerZonaHorariaDeLaOrganizacion(supabase, organizationId);

  const rows = toInsert.map(({ contact, name }) => ({
    organization_id:  organizationId,
    name,
    join_date:        resolveJoinDate(contact, zona),
    payment_type:     "upfront" as const,
    platform:         "other" as const,
    total_amount:     0,
    status:           "active" as const,
    is_success_case:  false,
    installments:     [],
    ai_insights:      [],
    linked_calls:     [],
    // Email y teléfono van en form_answers de la primera closing_call;
    // aquí los guardamos en ai_insights para no perderlos
    ai_insights_raw:  buildNotes(contact).length > 0
      ? buildNotes(contact).map((n) => `${n.question}: ${n.answer}`)
      : [],
  }));

  // Limpiar campo extra (solo fue para claridad)
  const cleanRows = rows.map(({ ai_insights_raw, ...r }) => ({
    ...r,
    ai_insights: ai_insights_raw,
  }));

  // Insertar en lotes de 50
  const BATCH = 50;
  for (let i = 0; i < cleanRows.length; i += BATCH) {
    const batch = cleanRows.slice(i, i + BATCH);
    const { error } = await supabase.from("clients").insert(batch);
    if (error) throw new Error(error.message);
    result.inserted += batch.length;
  }

  return result;
}
