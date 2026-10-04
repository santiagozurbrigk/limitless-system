import { listGoogleFormFiles } from "@/lib/google/drive-forms";
import {
  GoogleIntegrationPermissionError,
  isGooglePermissionError,
} from "@/lib/google/errors";
import { scorePendingFormResponses } from "@/lib/forms/sync-scoring";
import { refreshGoogleAccessToken } from "@/lib/google/refresh-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { traerRespuestasGoogleForms } from "@/lib/forms/paginar-respuestas";

type GoogleFormsIntegration = {
  organization_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  last_sync_at: string | null;
};

type GoogleFormQuestion = {
  questionId: string;
  title?: string;
};

type GoogleFormResponse = {
  responseId: string;
  createTime?: string;
  lastSubmittedTime?: string;
  answers?: Record<
    string,
    {
      questionId: string;
      textAnswers?: { answers: { value: string }[] };
    }
  >;
};

async function getAccessToken(
  integration: GoogleFormsIntegration
): Promise<string | null> {
  if (!integration.access_token) return null;

  const expiresAt = integration.token_expires_at
    ? new Date(integration.token_expires_at).getTime()
    : null;

  if (
    expiresAt &&
    expiresAt < Date.now() + 60_000 &&
    integration.refresh_token
  ) {
    const refreshed = await refreshGoogleAccessToken(integration.refresh_token);
    if (!refreshed) return integration.access_token;

    const admin = createAdminClient();
    await admin
      .from("google_forms_integrations")
      .update({
        access_token: refreshed.access_token,
        token_expires_at: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : null,
      })
      .eq("organization_id", integration.organization_id);

    return refreshed.access_token;
  }

  return integration.access_token;
}

function mapGoogleAnswers(
  answers: GoogleFormResponse["answers"],
  questionMap: Map<string, string>
): { field: string; value: string }[] {
  const result: { field: string; value: string }[] = [];
  for (const a of Object.values(answers ?? {})) {
    const label = questionMap.get(a.questionId) ?? a.questionId;
    const values =
      a.textAnswers?.answers.map((x) => x.value).join(", ") ?? "";
    result.push({ field: label, value: values });
  }
  return result;
}

async function fetchFormDefinition(
  formId: string,
  headers: Record<string, string>
): Promise<{
  info?: { title?: string; description?: string };
  items?: { questionItem?: { question?: GoogleFormQuestion } }[];
} | null> {
  const formRes = await fetch(
    `https://forms.googleapis.com/v1/forms/${formId}`,
    { headers }
  );
  if (formRes.status === 403 || formRes.status === 401) {
    throw new GoogleIntegrationPermissionError(formRes.status);
  }
  if (!formRes.ok) return null;
  return formRes.json();
}

export type GoogleFormsSyncResult = {
  formsSynced: number;
  responsesSynced: number;
  responsesScored: number;
  permissionDenied?: boolean;
};

export async function syncGoogleFormsForOrganization(
  organizationId: string
): Promise<GoogleFormsSyncResult> {
  const admin = createAdminClient();
  const result: GoogleFormsSyncResult = {
    formsSynced: 0,
    responsesSynced: 0,
    responsesScored: 0,
  };

  const { data: integration } = await admin
    .from("google_forms_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .maybeSingle();

  if (!integration?.access_token) return result;

  const accessToken = await getAccessToken(integration as GoogleFormsIntegration);
  if (!accessToken) return result;

  const headers = { Authorization: `Bearer ${accessToken}` };

  let remoteForms;
  try {
    remoteForms = await listGoogleFormFiles(accessToken);
  } catch (e) {
    if (isGooglePermissionError(e)) {
      return { ...result, permissionDenied: true };
    }
    throw e;
  }

  let algunoIncompleto = false;
  for (const remote of remoteForms) {
    let formData;
    try {
      formData = await fetchFormDefinition(remote.id, headers);
    } catch (e) {
      if (isGooglePermissionError(e)) {
        return { ...result, permissionDenied: true };
      }
      throw e;
    }
    if (!formData) continue;

    const questionMap = new Map<string, string>();
    const questions: { id: string; title: string }[] = [];
    for (const item of formData.items ?? []) {
      const q = item.questionItem?.question;
      if (!q?.questionId) continue;
      const title = q.title ?? q.questionId;
      questionMap.set(q.questionId, title);
      questions.push({ id: q.questionId, title });
    }

    const { data: formRow, error: formError } = await admin
      .from("forms")
      .upsert(
        {
          organization_id: organizationId,
          platform: "google_forms",
          external_form_id: remote.id,
          title: formData.info?.title ?? remote.name,
          description: formData.info?.description ?? null,
          questions,
          is_active: true,
        },
        { onConflict: "organization_id,platform,external_form_id" }
      )
      .select("id, last_synced_at")
      .single();

    if (formError || !formRow) continue;
    result.formsSynced++;

    const since = formRow.last_synced_at ?? integration.last_sync_at;
    // ⭐ SCRUM-57: todas las páginas (`nextPageToken`), no sólo las primeras 1.000.
    const paginado = await traerRespuestasGoogleForms<GoogleFormResponse>(
      async (url) => {
        const res = await fetch(url, { headers });
        return { ok: res.ok, status: res.status, json: res.ok ? await res.json() : null };
      },
      remote.id,
      since
    );
    if (paginado.status === 403 || paginado.status === 401) {
      return { ...result, permissionDenied: true };
    }
    if (!paginado.completo && paginado.items.length === 0) {
      algunoIncompleto = true;
      continue;
    }

    const items = paginado.items;
    let newForForm = 0;
    let fallidas = 0;

    for (const item of items) {
      const answers = mapGoogleAnswers(item.answers, questionMap);
      const submittedAt =
        item.lastSubmittedTime ?? item.createTime ?? null;

      const { error: upsertError } = await admin.from("form_responses").upsert(
        {
          organization_id: organizationId,
          form_id: formRow.id,
          external_response_id: item.responseId,
          respondent_email: null,
          respondent_name: null,
          answers,
          submitted_at: submittedAt,
          completion_time_seconds: 0,
          is_complete: true,
        },
        // Único por organización (SCRUM-57).
        { onConflict: "organization_id,external_response_id", ignoreDuplicates: false }
      );

      if (!upsertError) {
        newForForm++;
        result.responsesSynced++;
      } else {
        fallidas++;
      }
    }

    // Si faltó una página o falló un guardado, el cursor no avanza.
    const avanzarCursor = paginado.completo && fallidas === 0;
    if (!avanzarCursor) algunoIncompleto = true;

    const { count: totalResponses } = await admin
      .from("form_responses")
      .select("id", { count: "exact", head: true })
      .eq("form_id", formRow.id);

    await admin
      .from("forms")
      .update({
        total_responses: totalResponses ?? 0,
        ...(avanzarCursor ? { last_synced_at: new Date().toISOString() } : {}),
      })
      .eq("id", formRow.id);

    if (newForForm > 0) {
      result.responsesScored += await scorePendingFormResponses(
        organizationId,
        formRow.id,
        Math.min(newForForm, 20)
      );
    }
  }

  // Un formulario nuevo sin cursor propio cae en el de la integración: si
  // alguno quedó incompleto, éste tampoco avanza.
  if (!algunoIncompleto) {
    await admin
      .from("google_forms_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("organization_id", organizationId);
  }

  return result;
}

export async function syncAllGoogleFormsOrganizations(): Promise<{
  orgs: number;
  orgErrors: number;
  formsSynced: number;
  responsesSynced: number;
  responsesScored: number;
  permissionErrors: number;
}> {
  const admin = createAdminClient();
  const { data: integrations, error: integrationsError } = await admin
    .from("google_forms_integrations")
    .select("organization_id")
    .eq("status", "connected");
  if (integrationsError) throw new Error(integrationsError.message);

  let formsSynced = 0;
  let responsesSynced = 0;
  let responsesScored = 0;
  let permissionErrors = 0;

  let orgErrors = 0;

  for (const row of integrations ?? []) {
    // Aislado por org: un error de una cuenta no puede frenar la sync de las
    // que vienen después.
    let r: Awaited<ReturnType<typeof syncGoogleFormsForOrganization>>;
    try {
      r = await syncGoogleFormsForOrganization(row.organization_id);
    } catch (err) {
      orgErrors++;
      console.error("[syncGoogleFormsForOrganization] falló la org", row.organization_id, err);
      continue;
    }
    if (r.permissionDenied) permissionErrors++;
    formsSynced += r.formsSynced;
    responsesSynced += r.responsesSynced;
    responsesScored += r.responsesScored;
  }

  return {
    orgs: integrations?.length ?? 0,
    orgErrors,
    formsSynced,
    responsesSynced,
    responsesScored,
    permissionErrors,
  };
}
