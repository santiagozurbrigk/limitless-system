"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { firstZodError, uuidSchema } from "@/lib/validations";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type LeadMagnetType = "documento" | "loom" | "dashboard" | "landing" | "otro";
export type LeadMagnetChannel = "manychat" | "typeform" | "google_forms" | "landing" | "instagram_dm" | "manual";

export type LeadMagnet = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  type: LeadMagnetType;
  channel: LeadMagnetChannel;
  assetUrl: string | null;
  redirectUrl: string | null;
  manychatFlowId: string | null;
  manychatFlowName: string | null;
  formId: string | null;
  formSource: string | null;
  status: "active" | "paused" | "archived";
  createdAt: string;
  updatedAt: string;
  // métricas calculadas
  totalLeads: number;
  totalAttributedClients: number;
  totalRevenue: number;
};

export type LeadMagnetLead = {
  id: string;
  leadMagnetId: string;
  email: string | null;
  name: string | null;
  channel: LeadMagnetChannel;
  attributedClientId: string | null;
  attributedClientName: string | null;
  attributedRevenue: number | null;
  capturedAt: string;
  conversationId: string | null;
};

export type CreateLeadMagnetInput = {
  name: string;
  description?: string;
  type: LeadMagnetType;
  channel: LeadMagnetChannel;
  assetUrl?: string;
  manychatFlowId?: string;
  manychatFlowName?: string;
  formId?: string;
  formSource?: string;
};

// ─── Validación ───────────────────────────────────────────────────────────────
//
// Errores como valor (SCRUM-520): un rechazo esperable (sin sesión, id o dato
// inválido, lead magnet inexistente o de otra organización) vuelve con su
// mensaje; cualquier otra falla se registra con la etiqueta de la acción y
// vuelve con el texto fijo. Los valores son los enums de la base
// (`20260806120000_lead_magnets.sql`): antes un valor fuera de la lista llegaba
// a la base y volvía su texto crudo.

const ID_INVALIDO = "ID inválido";
const LEAD_MAGNET_NO_ENCONTRADO = "No encontramos ese lead magnet.";

const nombreSchema = z
  .string({ error: "Ingresá un nombre para el lead magnet." })
  .refine((nombre) => nombre.trim().length > 0, "Ingresá un nombre para el lead magnet.");
const tipoSchema = z.enum(["documento", "loom", "dashboard", "landing", "otro"], {
  error: "Tipo de lead magnet inválido.",
});
const canalSchema = z.enum(
  ["manychat", "typeform", "google_forms", "landing", "instagram_dm", "manual"],
  { error: "Canal de lead magnet inválido." }
);
const estadoSchema = z.enum(["active", "paused", "archived"], {
  error: "Estado de lead magnet inválido.",
});

function validarId(id: unknown): string {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new ErrorEsperable(ID_INVALIDO);
  return parsed.data;
}

function validar<T>(schema: z.ZodType<T>, valor: unknown): T {
  const parsed = schema.safeParse(valor);
  if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
  return parsed.data;
}

// ─── CRUD Lead Magnets ────────────────────────────────────────────────────────

/**
 * Los lead magnets de la organización con sus métricas. Si falla cualquiera de
 * las tres lecturas, el motivo y no una lista vacía o métricas en cero
 * (SCRUM-520).
 */
export async function getLeadMagnetsAction(): Promise<MutationResult<LeadMagnet[]>> {
  return mutacionConErroresEsperables("[getLeadMagnets]", async () => {
    if (!isSupabaseConfigured()) return [];
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: lms, error } = await supabase
      .from("lead_magnets")
      .select("*")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .order("created_at", { ascending: false });

    if (error) throw new FallaDeLaBase(error);
    if (!lms) return [];

    const { data: leads, error: leadsError } = await supabase
      .from("lead_magnet_leads")
      .select("lead_magnet_id, attributed_client_id")
      .eq("organization_id", organizationId);

    if (leadsError) throw new FallaDeLaBase(leadsError);

    const clientIds = (leads ?? [])
      .map((l) => l.attributed_client_id)
      .filter(Boolean) as string[];

    let revenueByClient: Record<string, number> = {};
    if (clientIds.length > 0) {
      // Filtro por la organización como defensa en profundidad (QA de SCRUM-520):
      // la única escritura de `attributed_client_id` (`attributeLeadMagnetToClient`)
      // guarda un cliente de la misma organización que el lead, así que no se
      // pierde nada; sin el filtro, un `attributed_client_id` de otro negocio
      // escrito a mano sumaría su revenue si la RLS lo deja leer (cartera del
      // holding).
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("id, total_amount")
        .eq("organization_id", organizationId)
        .in("id", clientIds);
      if (clientsError) throw new FallaDeLaBase(clientsError);
      revenueByClient = Object.fromEntries(
        (clients ?? []).map((c) => [c.id, c.total_amount ?? 0])
      );
    }

    return lms.map((lm) => {
      const lmLeads = (leads ?? []).filter((l) => l.lead_magnet_id === lm.id);
      const attributed = lmLeads.filter((l) => l.attributed_client_id);
      const revenue = attributed.reduce(
        (sum, l) => sum + (revenueByClient[l.attributed_client_id!] ?? 0),
        0
      );
      return {
        id: lm.id,
        organizationId: lm.organization_id,
        name: lm.name,
        description: lm.description,
        type: lm.type as LeadMagnetType,
        channel: lm.channel as LeadMagnetChannel,
        assetUrl: lm.asset_url,
        redirectUrl: lm.redirect_url,
        manychatFlowId: lm.manychat_flow_id,
        manychatFlowName: lm.manychat_flow_name,
        formId: lm.form_id,
        formSource: lm.form_source,
        status: lm.status as "active" | "paused" | "archived",
        createdAt: lm.created_at,
        updatedAt: lm.updated_at,
        totalLeads: lmLeads.length,
        totalAttributedClients: attributed.length,
        totalRevenue: revenue,
      };
    });
  });
}

export async function createLeadMagnetAction(
  input: CreateLeadMagnetInput
): Promise<MutationResult<{ id: string }>> {
  return mutacionConErroresEsperables("[createLeadMagnet]", async () => {
    validar(nombreSchema, input?.name);
    validar(tipoSchema, input.type);
    validar(canalSchema, input.channel);
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("lead_magnets")
      .insert({
        organization_id: organizationId,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        channel: input.channel,
        asset_url: input.assetUrl ?? null,
        manychat_flow_id: input.manychatFlowId ?? null,
        manychat_flow_name: input.manychatFlowName ?? null,
        form_id: input.formId ?? null,
        form_source: input.formSource ?? null,
      })
      .select("id")
      .single();

    if (error) throw new FallaDeLaBase(error);

    revalidatePath("/platform/marketing/lead-magnets");
    return { id: data.id };
  });
}

/**
 * Edita un lead magnet de la organización. Si el id no es de la organización,
 * no se escribe nada y vuelve el motivo (antes respondía éxito sin haber
 * cambiado nada).
 */
export async function updateLeadMagnetAction(
  id: string,
  input: Partial<CreateLeadMagnetInput> & { status?: "active" | "paused" | "archived" }
): Promise<MutationResult> {
  return mutacionConErroresEsperables("[updateLeadMagnet]", async () => {
    const leadMagnetId = validarId(id);
    if (input?.name !== undefined) validar(nombreSchema, input.name);
    if (input.type !== undefined) validar(tipoSchema, input.type);
    if (input.channel !== undefined) validar(canalSchema, input.channel);
    if (input.status !== undefined) validar(estadoSchema, input.status);
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("lead_magnets")
      .update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.type !== undefined && { type: input.type }),
        ...(input.channel !== undefined && { channel: input.channel }),
        ...(input.assetUrl !== undefined && { asset_url: input.assetUrl }),
        ...(input.manychatFlowId !== undefined && { manychat_flow_id: input.manychatFlowId }),
        ...(input.manychatFlowName !== undefined && { manychat_flow_name: input.manychatFlowName }),
        ...(input.formId !== undefined && { form_id: input.formId }),
        ...(input.formSource !== undefined && { form_source: input.formSource }),
        ...(input.status !== undefined && { status: input.status }),
      })
      .eq("id", leadMagnetId)
      .eq("organization_id", organizationId)
      .select("id");

    if (error) throw new FallaDeLaBase(error);
    if (!data?.length) throw new ErrorEsperable(LEAD_MAGNET_NO_ENCONTRADO);
    revalidatePath("/platform/marketing/lead-magnets");
  });
}

/**
 * Archiva un lead magnet de la organización. Antes no miraba el resultado:
 * una falla o un id ajeno respondían éxito y la pantalla decía "Lead Magnet
 * eliminado" sin haberlo archivado.
 */
export async function deleteLeadMagnetAction(id: string): Promise<MutationResult> {
  return mutacionConErroresEsperables("[deleteLeadMagnet]", async () => {
    const leadMagnetId = validarId(id);
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lead_magnets")
      .update({ status: "archived" })
      .eq("id", leadMagnetId)
      .eq("organization_id", organizationId)
      .select("id");

    if (error) throw new FallaDeLaBase(error);
    if (!data?.length) throw new ErrorEsperable(LEAD_MAGNET_NO_ENCONTRADO);
    revalidatePath("/platform/marketing/lead-magnets");
  });
}

// ─── Leads de un LM ───────────────────────────────────────────────────────────

/** Los leads de un lead magnet; si la base falla, el motivo y no una lista vacía. */
export async function getLeadMagnetLeadsAction(
  leadMagnetId: string
): Promise<MutationResult<LeadMagnetLead[]>> {
  return mutacionConErroresEsperables("[getLeadMagnetLeads]", async () => {
    const id = validarId(leadMagnetId);
    if (!isSupabaseConfigured()) return [];
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("lead_magnet_leads")
      .select("*, clients(name, total_amount)")
      .eq("organization_id", organizationId)
      .eq("lead_magnet_id", id)
      .order("captured_at", { ascending: false });

    if (error) throw new FallaDeLaBase(error);
    if (!data) return [];

    return data.map((row) => ({
      id: row.id,
      leadMagnetId: row.lead_magnet_id,
      email: row.email,
      name: row.name,
      channel: row.channel as LeadMagnetChannel,
      attributedClientId: row.attributed_client_id,
      attributedClientName: (row.clients as { name: string } | null)?.name ?? null,
      attributedRevenue: row.attributed_client_id
        ? ((row.clients as { total_amount: number } | null)?.total_amount ?? null)
        : null,
      capturedAt: row.captured_at,
      conversationId: row.conversation_id,
    }));
  });
}
