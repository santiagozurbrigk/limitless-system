"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { requireAuthContext } from "@/lib/auth/require-auth";
import {
  assertClaudeKeyFormat,
  validateClaudeApiKey,
  validationErrorMessage,
} from "@/lib/ai/validate-claude-key";
import { invalidateOrgCredentialCache } from "@/lib/ai/credential-resolver";
import { invalidateOrgContext } from "@/lib/ai/org-context";
import { decrypt, encrypt, maskSecret } from "@/lib/security/encryption";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { runMutation, actionErrorMessage, type MutationResult } from "@/lib/server/action-result";
import {
  firstZodError,
  saveClaudeApiKeySchema,
  saveGeneralOrganizationSettingsSchema,
  updateNotificationPreferencesSchema,
  updateOrganizationWebsiteSchema,
} from "@/lib/validations";
import { paths } from "@/routes";
import type { z } from "zod";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

export type ClaudeApiKeyStatus = {
  hasKey: boolean;
  status: "none" | "valid" | "valid_no_credits" | "invalid" | "error";
  lastValidated: string | null;
  keyPreview: string | null;
};

export type OrganizationSettings = {
  name: string;
  industry: string | null;
  website_url: string | null;
  timezone: string | null;
  currency: string | null;
  language: string | null;
  country: string | null;
};

export type NotificationPreferences = {
  emailWeeklyReport: boolean;
  emailNewConversation: boolean;
  emailBookingConfirmed: boolean;
  emailSaleClosed: boolean;
  emailSopSuggestion: boolean;
  inappNewConversation: boolean;
  inappBookingConfirmed: boolean;
  inappSaleClosed: boolean;
  inappGhostingAlert: boolean;
};

type NotificationPreferencesRow = {
  email_weekly_report: boolean | null;
  email_new_conversation: boolean | null;
  email_booking_confirmed: boolean | null;
  email_sale_closed: boolean | null;
  email_sop_suggestion: boolean | null;
  inapp_new_conversation: boolean | null;
  inapp_booking_confirmed: boolean | null;
  inapp_sale_closed: boolean | null;
  inapp_ghosting_alert: boolean | null;
};

const NOTIFICATION_DEFAULTS: NotificationPreferences = {
  emailWeeklyReport: true,
  emailNewConversation: false,
  emailBookingConfirmed: true,
  emailSaleClosed: true,
  emailSopSuggestion: true,
  inappNewConversation: true,
  inappBookingConfirmed: true,
  inappSaleClosed: true,
  inappGhostingAlert: true,
};

function rowToNotificationPreferences(
  row: NotificationPreferencesRow
): NotificationPreferences {
  return {
    emailWeeklyReport: row.email_weekly_report ?? NOTIFICATION_DEFAULTS.emailWeeklyReport,
    emailNewConversation:
      row.email_new_conversation ?? NOTIFICATION_DEFAULTS.emailNewConversation,
    emailBookingConfirmed:
      row.email_booking_confirmed ?? NOTIFICATION_DEFAULTS.emailBookingConfirmed,
    emailSaleClosed: row.email_sale_closed ?? NOTIFICATION_DEFAULTS.emailSaleClosed,
    emailSopSuggestion:
      row.email_sop_suggestion ?? NOTIFICATION_DEFAULTS.emailSopSuggestion,
    inappNewConversation:
      row.inapp_new_conversation ?? NOTIFICATION_DEFAULTS.inappNewConversation,
    inappBookingConfirmed:
      row.inapp_booking_confirmed ?? NOTIFICATION_DEFAULTS.inappBookingConfirmed,
    inappSaleClosed: row.inapp_sale_closed ?? NOTIFICATION_DEFAULTS.inappSaleClosed,
    inappGhostingAlert:
      row.inapp_ghosting_alert ?? NOTIFICATION_DEFAULTS.inappGhostingAlert,
  };
}

function prefsToRow(
  prefs: Partial<NotificationPreferences>
): Record<string, boolean | string> {
  const row: Record<string, boolean | string> = {
    updated_at: new Date().toISOString(),
  };
  if (prefs.emailWeeklyReport != null) {
    row.email_weekly_report = prefs.emailWeeklyReport;
  }
  if (prefs.emailNewConversation != null) {
    row.email_new_conversation = prefs.emailNewConversation;
  }
  if (prefs.emailBookingConfirmed != null) {
    row.email_booking_confirmed = prefs.emailBookingConfirmed;
  }
  if (prefs.emailSaleClosed != null) {
    row.email_sale_closed = prefs.emailSaleClosed;
  }
  if (prefs.emailSopSuggestion != null) {
    row.email_sop_suggestion = prefs.emailSopSuggestion;
  }
  if (prefs.inappNewConversation != null) {
    row.inapp_new_conversation = prefs.inappNewConversation;
  }
  if (prefs.inappBookingConfirmed != null) {
    row.inapp_booking_confirmed = prefs.inappBookingConfirmed;
  }
  if (prefs.inappSaleClosed != null) {
    row.inapp_sale_closed = prefs.inappSaleClosed;
  }
  if (prefs.inappGhostingAlert != null) {
    row.inapp_ghosting_alert = prefs.inappGhostingAlert;
  }
  return row;
}

function normalizeWebsiteUrl(websiteUrl: string): string {
  const trimmed = websiteUrl.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    throw new Error("La URL debe empezar con https://");
  }
  return trimmed.replace(/\/$/, "");
}

type AuthContext = Awaited<ReturnType<typeof requireAuthContext>>;

async function requireOrganizationIdAndParse<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): Promise<
  | { success: true; data: z.infer<T>; organizationId: string }
  | { success: false; error: string }
> {
  let organizationId: string;
  try {
    organizationId = await requireOrganizationId();
  } catch (error) {
    return { success: false, error: actionErrorMessage(error) };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  return { success: true, data: parsed.data, organizationId };
}

async function requireAuthContextAndParse<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): Promise<
  | { success: true; data: z.infer<T>; auth: AuthContext }
  | { success: false; error: string }
> {
  let auth: AuthContext;
  try {
    auth = await requireAuthContext();
  } catch (error) {
    return { success: false, error: actionErrorMessage(error) };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  return { success: true, data: parsed.data, auth };
}

export async function getOrganizationSettingsAction(): Promise<OrganizationSettings | null> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("name, industry, website_url, timezone, currency, language, country")
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    name: data.name ?? "",
    industry: (data.industry as string | null) ?? null,
    website_url: (data.website_url as string | null) ?? null,
    timezone: (data.timezone as string | null) ?? null,
    currency: (data.currency as string | null) ?? null,
    language: (data.language as string | null) ?? null,
    country: (data.country as string | null) ?? null,
  };
}

export async function updateOrganizationWebsiteAction(
  websiteUrl: string
): Promise<MutationResult> {
  const auth = await requireOrganizationIdAndParse(updateOrganizationWebsiteSchema, {
    websiteUrl,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { websiteUrl: parsedWebsiteUrl } = auth.data;

  return runMutation(async () => {
    const organizationId = auth.organizationId;
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const supabase = await createClient();
    const normalized = parsedWebsiteUrl
      ? normalizeWebsiteUrl(parsedWebsiteUrl)
      : null;

    const { error } = await supabase
      .from("organizations")
      .update({ website_url: normalized })
      .eq("id", organizationId);

    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.settings);
    revalidatePath(paths.platform.marketing.utms);
  });
}

export async function saveGeneralOrganizationSettingsAction(input: {
  orgName: string;
  industry?: string;
  websiteUrl: string;
  timezone?: string;
  currency?: string;
  language?: string;
  country?: string;
}): Promise<MutationResult> {
  const auth = await requireOrganizationIdAndParse(
    saveGeneralOrganizationSettingsSchema,
    input
  );
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { orgName, industry, websiteUrl, timezone, currency, language, country } =
    auth.data;

  return runMutation(async () => {
    const organizationId = auth.organizationId;
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const supabase = await createClient();

    const website_url = websiteUrl ? normalizeWebsiteUrl(websiteUrl) : null;

    const { error } = await supabase
      .from("organizations")
      .update({
        name: orgName,
        industry: industry || null,
        website_url,
        timezone: timezone ?? null,
        currency: currency ?? null,
        language: language ?? null,
        country: country ?? null,
      })
      .eq("id", organizationId);

    if (error) throw new Error(error.message);

    invalidateOrgContext(organizationId);

    revalidatePath(paths.platform.settings);
    revalidatePath(paths.platform.marketing.utms);
  });
}

export async function getNotificationPreferencesAction(): Promise<NotificationPreferences> {
  if (!isSupabaseConfigured()) {
    return { ...NOTIFICATION_DEFAULTS };
  }

  const { user, orgId } = await requireAuthContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("[getNotificationPreferences]", error.message);
    return { ...NOTIFICATION_DEFAULTS };
  }

  if (!data) {
    const { data: created, error: insertError } = await supabase
      .from("notification_preferences")
      .insert({
        profile_id: user.id,
        organization_id: orgId,
      })
      .select()
      .single();

    if (insertError || !created) {
      console.error("[getNotificationPreferences] insert", insertError?.message);
      return { ...NOTIFICATION_DEFAULTS };
    }

    return rowToNotificationPreferences(created as NotificationPreferencesRow);
  }

  return rowToNotificationPreferences(data as NotificationPreferencesRow);
}

export async function updateNotificationPreferencesAction(
  prefs: Partial<NotificationPreferences>
): Promise<MutationResult> {
  const auth = await requireAuthContextAndParse(
    updateNotificationPreferencesSchema,
    prefs
  );
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  return runMutation(async () => {
    if (!isSupabaseConfigured()) {
      throw new Error("Supabase no configurado.");
    }

    const { user, orgId } = auth.auth;
    const supabase = await createClient();

    const { error } = await supabase.from("notification_preferences").upsert(
      {
        profile_id: user.id,
        organization_id: orgId,
        ...prefsToRow(auth.data),
      },
      { onConflict: "profile_id,organization_id" }
    );

    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.settings);
  });
}

export async function getClaudeApiKeyStatusAction(): Promise<ClaudeApiKeyStatus> {
  if (!isSupabaseConfigured()) {
    return {
      hasKey: false,
      status: "none",
      lastValidated: null,
      keyPreview: null,
    };
  }

  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: statusRow } = await supabase
      .from("organization_claude_status")
      .select(
        "has_claude_key, claude_api_key_status, claude_api_key_last_validated_at"
      )
      .eq("id", organizationId)
      .maybeSingle();

    if (!statusRow?.has_claude_key) {
      return {
        hasKey: false,
        status: "none",
        lastValidated: null,
        keyPreview: null,
      };
    }

    let keyPreview: string | null = null;
    const admin = createAdminClient();
    const { data: orgRow } = await admin
      .from("organizations")
      .select("claude_api_key_encrypted")
      .eq("id", organizationId)
      .maybeSingle();

    const stored = orgRow?.claude_api_key_encrypted as string | null | undefined;
    if (stored) {
      try {
        keyPreview = maskSecret(decrypt(stored));
      } catch {
        keyPreview = "****";
      }
    }

    return {
      hasKey: true,
      status:
        (statusRow.claude_api_key_status as ClaudeApiKeyStatus["status"]) ??
        "none",
      lastValidated:
        (statusRow.claude_api_key_last_validated_at as string | null) ?? null,
      keyPreview,
    };
  } catch {
    return {
      hasKey: false,
      status: "none",
      lastValidated: null,
      keyPreview: null,
    };
  }
}

export async function saveClaudeApiKeyAction(
  apiKey: string
): Promise<
  MutationResult<{
    maskedKey: string;
    status: Extract<ClaudeApiKeyStatus["status"], "valid" | "valid_no_credits">;
  }>
> {
  const auth = await requireAuthContextAndParse(saveClaudeApiKeySchema, {
    apiKey,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { apiKey: trimmed } = auth.data;

  return runMutation(async () => {
    if (!isSupabaseConfigured()) {
      throw new Error("Supabase no configurado.");
    }

    const { orgId } = auth.auth;
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    assertClaudeKeyFormat(trimmed);

    const validation = await validateClaudeApiKey(trimmed);
    if (!validation.ok) {
      throw new Error(validationErrorMessage(validation.reason));
    }

    const keyStatus = validation.status;
    const encryptedKey = encrypt(trimmed);
    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({
        claude_api_key_encrypted: encryptedKey,
        claude_api_key_status: keyStatus,
        claude_api_key_last_validated_at: new Date().toISOString(),
      })
      .eq("id", orgId);

    if (error) throw new Error(error.message);

    invalidateOrgCredentialCache(orgId);
    invalidateOrgContext(orgId);
    revalidatePath(paths.platform.settings);
    return { maskedKey: maskSecret(trimmed), status: keyStatus };
  });
}

export async function removeClaudeApiKeyAction(): Promise<MutationResult> {
  return runMutation(async () => {
    if (!isSupabaseConfigured()) {
      throw new Error("Supabase no configurado.");
    }

    const { orgId } = await requireAuthContext();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();

    const { error } = await admin
      .from("organizations")
      .update({
        claude_api_key_encrypted: null,
        claude_api_key_status: "none",
        claude_api_key_last_validated_at: null,
      })
      .eq("id", orgId);

    if (error) throw new Error(error.message);

    invalidateOrgCredentialCache(orgId);
    invalidateOrgContext(orgId);
    revalidatePath(paths.platform.settings);
    return undefined;
  });
}
