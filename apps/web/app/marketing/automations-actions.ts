"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { fetchManyChatFlows, ManyChatHttpError, type ManyChatFlow } from "@/lib/manychat/client";
import { getManyChatIntegrationForOrganization } from "@/lib/manychat/integration";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ESCONDIDO } from "@/lib/release/escondido";
import {
  ErrorEsperable,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";

export type AutomationFlow = {
  id: string;
  name: string;
  status: "active" | "paused" | "draft";
  source: "manychat";
};

export type AutomationFlowsList = {
  flows: AutomationFlow[];
  manychatConnected: boolean;
};

function normalizeStatus(raw: string): AutomationFlow["status"] {
  if (raw === "enabled") return "active";
  if (raw === "disabled") return "paused";
  return "draft";
}

function manyChatFlowToAutomation(flow: ManyChatFlow): AutomationFlow {
  return {
    id: flow.ns,
    name: flow.name,
    status: normalizeStatus(flow.status),
    source: "manychat",
  };
}

/**
 * El motivo de una API key rechazada. Mientras ManyChat esté escondido en
 * Integraciones (`ESCONDIDO.integracionManyChat`, SCRUM-490) no se manda al
 * usuario a una pantalla donde no la va a encontrar.
 */
function motivoDeApiKeyRechazada(): string {
  return ESCONDIDO.integracionManyChat
    ? "ManyChat rechazó la API key de tu organización. Hay que volver a conectarlo."
    : "ManyChat rechazó la API key de tu organización. Volvé a conectarlo desde Integraciones.";
}

/**
 * Un rechazo de ManyChat con motivo claro: un 401 o 403 dice que la API key de
 * la organización ya no sirve (es lo mismo que mira `fetchManyChatPageInfo` al
 * conectar). Cualquier otra respuesta (429, 5xx, la red) es una falla.
 */
function rechazoDeManyChat(error: unknown): unknown {
  if (error instanceof ManyChatHttpError && (error.status === 401 || error.status === 403)) {
    return new ErrorEsperable(motivoDeApiKeyRechazada());
  }
  return error;
}

/**
 * Los flujos de ManyChat de la organización. Sin integración, la lista vacía y
 * `manychatConnected: false`, como antes. Si falla la lectura de la
 * integración o la llamada a ManyChat, el motivo (SCRUM-520): antes
 * `fetchManyChatFlows` devolvía `[]` ante cualquier error y la pantalla decía
 * "No hay flujos configurados en ManyChat".
 */
export async function listAutomationFlowsAction(): Promise<MutationResult<AutomationFlowsList>> {
  return mutacionConErroresEsperables("[listAutomationFlows]", async () => {
    if (!isSupabaseConfigured()) {
      return { flows: [], manychatConnected: false };
    }

    const organizationId = await requireOrganizationId();
    const integration = await getManyChatIntegrationForOrganization(organizationId);

    if (!integration?.api_token) {
      return { flows: [], manychatConnected: false };
    }

    const raw = await fetchManyChatFlows(integration.api_token).catch((error: unknown) => {
      throw rechazoDeManyChat(error);
    });
    const flows = raw.map(manyChatFlowToAutomation);

    return { flows, manychatConnected: true };
  });
}
