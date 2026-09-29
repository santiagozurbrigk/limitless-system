"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import { listVTurbPlayers, VTurbApiError } from "@/lib/vturb/client";
import {
  deleteVTurbIntegration,
  getVTurbIntegrationForOrg,
  upsertVTurbIntegration,
} from "@/lib/vturb/integration";
import { syncVTurbPlayersForOrg } from "@/lib/vturb/sync-players";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

/**
 * Server Actions de la unidad I-6 — VTurb.
 *
 * VTurb hostea los VSL y es la fuente de la etapa Engaged del embudo VSL: M08
 * (visitantes), M10 (reproducciones), M11 (% promedio visto) y M12 (llegaron al
 * CTA).
 */

// ─── Estado ───────────────────────────────────────────────────────────────────

export type VTurbPlayerOption = {
  playerId: string;
  name: string | null;
  durationSeconds: number | null;
  /** `null` o `0` significa que el player no tiene pitch time en VTurb. */
  pitchTime: number | null;
};

export type VTurbStatus = {
  connected: boolean;
  playersSyncedAt: string | null;
  playerCount: number;
  /** Players sin pitch time: en esos, M12 no se puede medir. */
  playersWithoutPitchTime: number;
  lastError: string | null;
};

export async function getVTurbStatusAction(): Promise<VTurbStatus> {
  const organizationId = await requireOrganizationId();

  const empty: VTurbStatus = {
    connected: false,
    playersSyncedAt: null,
    playerCount: 0,
    playersWithoutPitchTime: 0,
    lastError: null,
  };

  const row = await getVTurbIntegrationForOrg(organizationId).catch(() => null);
  if (!row) return empty;

  const players = await listVTurbPlayerOptionsAction();

  return {
    connected: true,
    playersSyncedAt: row.players_synced_at,
    playerCount: players.length,
    playersWithoutPitchTime: players.filter((p) => !p.pitchTime).length,
    lastError: row.last_error,
  };
}

/** Players disponibles para bindear a un paso de embudo. */
export async function listVTurbPlayerOptionsAction(): Promise<VTurbPlayerOption[]> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data } = await supabase
    .from("vturb_players")
    .select("external_id, name, duration_seconds, pitch_time")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    playerId: row.external_id as string,
    name: (row.name as string | null) ?? null,
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    pitchTime: (row.pitch_time as number | null) ?? null,
  }));
}

// ─── Conectar ─────────────────────────────────────────────────────────────────

/**
 * Guarda la API key y trae el catálogo de players en el mismo paso.
 *
 * La key se valida llamando a `/players/list` antes de guardarla: VTurb devuelve
 * 401 si el token o la versión del header están mal, así que un error acá
 * distingue una key inválida de una cuenta sin videos.
 */
export async function connectVTurbAction(
  apiKey: string,
  timezone?: string
): Promise<MutationResult<{ players: number; withoutPitchTime: number }>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();

    const trimmed = apiKey.trim();
    if (!trimmed) throw new Error("La API key no puede estar vacía");

    try {
      await listVTurbPlayers(trimmed);
    } catch (error) {
      if (error instanceof VTurbApiError && error.status === 401) {
        throw new Error("VTurb rechazó la API key (401). Revisá que sea la de Analytics API.");
      }
      throw error;
    }

    await upsertVTurbIntegration(organizationId, trimmed, timezone);
    const sync = await syncVTurbPlayersForOrg(organizationId);
    if (sync.error) throw new Error(sync.error);

    revalidatePath(paths.platform.integrations);
    return { players: sync.players, withoutPitchTime: sync.withoutPitchTime };
  });
}

export async function syncVTurbPlayersAction(): Promise<
  MutationResult<{ players: number; withoutPitchTime: number; skipped: number }>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const result = await syncVTurbPlayersForOrg(organizationId);
    if (result.error) throw new Error(result.error);

    revalidatePath(paths.platform.integrations);
    return {
      players: result.players,
      withoutPitchTime: result.withoutPitchTime,
      skipped: result.skipped,
    };
  });
}

export async function disconnectVTurbAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    await deleteVTurbIntegration(organizationId);
    revalidatePath(paths.platform.integrations);
  });
}
