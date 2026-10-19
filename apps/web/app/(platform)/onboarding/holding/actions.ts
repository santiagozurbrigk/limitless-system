"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isMissingTableError,
  loadProfileOrganizationContext,
} from "@/lib/auth/bootstrap";
import {
  type HoldingBillingModel,
  type HoldingOnboardingData,
} from "@/lib/holding/billing";
import { leerExperienciaDeLaOrganizacion } from "@/lib/organization/experience";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { actionErrorMessage } from "@/lib/server/action-result";
import {
  completeHoldingOnboardingSchema,
  firstZodError,
  saveHoldingBillingModelSchema,
} from "@/lib/validations";
import { paths } from "@/routes";

async function requireHoldingOrgId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { organizationId, accountType, canManageHolding } =
    await loadProfileOrganizationContext(
    user.id
  );

  if (!organizationId) throw new Error("Sin perfil");
  if (accountType !== "holding") {
    throw new Error("Esta acción es solo para cuentas holding");
  }
  if (!canManageHolding) {
    throw new Error("Sólo el founder del holding puede hacer esto");
  }

  return organizationId;
}

async function markHoldingOnboardingComplete(
  organizationId: string,
  payload: HoldingOnboardingData
) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("onboarding_responses")
    .select("id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("onboarding_responses")
      .update({
        data: payload,
        completed_at: now,
        updated_at: now,
      })
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("onboarding_responses").insert({
    organization_id: organizationId,
    data: payload,
    completed_at: now,
  });

  if (error) {
    if (isMissingTableError(error.message)) {
      throw new Error(
        "Falta la tabla onboarding_responses. Ejecuta la migración en Supabase."
      );
    }
    throw new Error(error.message);
  }
}

export async function saveHoldingBillingModelAction(model: unknown) {
  let holdingOrgId: string;
  try {
    holdingOrgId = await requireHoldingOrgId();
  } catch (error) {
    throw new Error(actionErrorMessage(error));
  }

  const parsed = saveHoldingBillingModelSchema.safeParse({ model });
  if (!parsed.success) {
    throw new Error(firstZodError(parsed.error));
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("organizations")
    .update({ holding_billing_model: parsed.data.model })
    .eq("id", holdingOrgId);

  if (error) throw new Error(error.message);

  return { ok: true as const };
}

function validateBusinessesForBillingModel(
  businesses: Array<{
    name: string;
    revenueSharePct?: number;
    fixedFeeAmount?: number;
    fixedFeeCurrency?: string;
  }>,
  billingModel: HoldingBillingModel
): void {
  for (const business of businesses) {
    if (billingModel === "revenue_share") {
      const pct = business.revenueSharePct;
      if (pct == null || Number.isNaN(pct)) {
        throw new Error(
          `El % de revenue share de "${business.name}" debe estar entre 0 y 100`
        );
      }
    } else {
      const amount = business.fixedFeeAmount;
      if (amount == null || Number.isNaN(amount) || amount <= 0) {
        throw new Error(
          `El monto fijo de "${business.name}" debe ser mayor a 0`
        );
      }
    }
  }
}

export async function completeHoldingOnboardingAction(data: unknown) {
  let holdingOrgId: string;
  try {
    holdingOrgId = await requireHoldingOrgId();
  } catch (error) {
    throw new Error(actionErrorMessage(error));
  }

  const parsed = completeHoldingOnboardingSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(firstZodError(parsed.error));
  }

  const admin = createAdminClient();

  const { data: holdingOrg, error: holdingError } = await admin
    .from("organizations")
    .select("holding_billing_model")
    .eq("id", holdingOrgId)
    .single();

  if (holdingError || !holdingOrg?.holding_billing_model) {
    throw new Error("Elegí primero tu modelo de cobro");
  }

  const billingModel = holdingOrg.holding_billing_model as HoldingBillingModel;
  const businesses = parsed.data.businesses;

  // Validación cruzada según modelo ya guardado (no cabe en el schema estático).
  validateBusinessesForBillingModel(businesses, billingModel);

  // Los negocios heredan la experiencia del holding (SCRUM-523). Se lee antes
  // de crear ninguno: si falla, no queda nada a medias.
  const experience = await leerExperienciaDeLaOrganizacion(admin, holdingOrgId);

  const createdOrgIds: string[] = [];

  try {
    for (const business of businesses) {
      const { data: newOrg, error: orgError } = await admin
        .from("organizations")
        .insert({
          name: business.name,
          status: "active",
          account_type: "founder",
          skip_onboarding: true,
          experience,
        })
        .select("id")
        .single();

      if (orgError || !newOrg) {
        throw new Error(orgError?.message ?? `Error creando "${business.name}"`);
      }

      createdOrgIds.push(newOrg.id);

      const { error: linkError } = await admin.from("holding_businesses").insert({
        holding_org_id: holdingOrgId,
        business_org_id: newOrg.id,
        business_name: business.name,
        revenue_share_pct:
          billingModel === "revenue_share"
            ? business.revenueSharePct ?? null
            : null,
        fixed_fee_amount:
          billingModel === "fixed_fee"
            ? business.fixedFeeAmount ?? null
            : null,
        fixed_fee_currency:
          billingModel === "fixed_fee"
            ? business.fixedFeeCurrency ?? "USD"
            : null,
        status: "active",
      });

      if (linkError) {
        throw new Error(linkError.message);
      }
    }
  } catch (err) {
    // Rollback: eliminar todas las orgs creadas en este intento
    if (createdOrgIds.length > 0) {
      await admin
        .from("organizations")
        .delete()
        .in("id", createdOrgIds);
    }
    throw err;
  }

  await markHoldingOnboardingComplete(holdingOrgId, {
    kind: "holding",
    billingModel,
    businessCount: businesses.length,
  });

  revalidatePath(paths.platform.holding);
  revalidatePath(paths.platform.holdingOnboarding);
  redirect(paths.platform.holding);
}

export async function getHoldingOnboardingStateAction() {
  const holdingOrgId = await requireHoldingOrgId();
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizations")
    .select("holding_billing_model")
    .eq("id", holdingOrgId)
    .maybeSingle();

  return {
    billingModel: (org?.holding_billing_model as HoldingBillingModel | null) ?? null,
  };
}
