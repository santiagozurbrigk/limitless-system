"use server";

/** A · Todo lo que la pantalla de Wins necesita, en una llamada. */

import { listClientsAction } from "@/app/clients/actions";
import { sinRechazo } from "@/lib/auth/regla-de-modulo";
import { listFieldDefinitionsAction } from "@/app/clients/custom-field-actions";
import {
  listClientBaselinesAction,
  listClientNichesAction,
  listWinsAction,
} from "@/app/clients/win-actions";
import { listClientTrackingAction } from "@/app/clients/tracking-actions";
import type { WinsPageData } from "@/components/clients/wins/wins-page";

export async function getWinsPageDataAction(): Promise<WinsPageData> {
  const [wins, clients, winFields, baselines, niches, tracking] = await Promise.all([
    listWinsAction(),
    listClientsAction().then((r) => sinRechazo(r, [])),
    listFieldDefinitionsAction("win"),
    listClientBaselinesAction(),
    listClientNichesAction(),
    listClientTrackingAction(),
  ]);

  return { wins, clients, winFields, baselines, niches, tracking };
}
