/**
 * lib/vturb/sync-players.ts
 *
 * Trae el catálogo de players de VTurb y lo guarda.
 *
 * Es un catálogo, no una fuente de métricas: sirve para que el usuario elija qué
 * video corresponde a cada instancia de embudo, y para conocer dos datos que las
 * métricas necesitan:
 *
 * - **`duration`** — `/times/user_engagement` lo pide como parámetro requerido.
 * - **`pitch_time`** — el segundo del CTA según VTurb. Sin esto, M12 no se puede
 *   calcular sin que el usuario configure el segundo a mano.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { listVTurbPlayers } from "./client";
import { decryptVTurbApiKey, getVTurbIntegrationForOrg } from "./integration";

export type VTurbPlayerSyncResult = {
  organizationId: string;
  players: number;
  /** Players sin `pitch_time` configurado en VTurb: M12 no se puede medir ahí. */
  withoutPitchTime: number;
  skipped: number;
  error?: string;
};

export async function syncVTurbPlayersForOrg(
  organizationId: string
): Promise<VTurbPlayerSyncResult> {
  const empty: VTurbPlayerSyncResult = {
    organizationId,
    players: 0,
    withoutPitchTime: 0,
    skipped: 0,
  };

  try {
    const row = await getVTurbIntegrationForOrg(organizationId);
    if (!row) return { ...empty, error: "VTurb no configurado" };

    const apiKey = decryptVTurbApiKey(row.api_key_encrypted, row.organization_id);
    const players = await listVTurbPlayers(apiKey);

    const now = new Date().toISOString();
    let skipped = 0;
    let withoutPitchTime = 0;

    const rows = players.flatMap((player) => {
      if (!player.id) {
        // Sin id no se puede referenciar desde un embudo.
        skipped += 1;
        return [];
      }
      if (!player.pitch_time) withoutPitchTime += 1;

      return [
        {
          organization_id: organizationId,
          external_id: player.id,
          name: player.name ?? null,
          duration_seconds: player.duration ?? null,
          pitch_time: player.pitch_time ?? null,
          raw: player,
          synced_at: now,
        },
      ];
    });

    const admin = createAdminClient();

    if (rows.length) {
      const { error } = await admin
        .from("vturb_players")
        .upsert(rows, { onConflict: "organization_id,external_id" });
      if (error) return { ...empty, skipped, error: error.message };
    }

    await admin
      .from("vturb_integrations")
      .update({ players_synced_at: now, last_error: null })
      .eq("organization_id", organizationId);

    return { organizationId, players: rows.length, withoutPitchTime, skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    const admin = createAdminClient();
    await admin
      .from("vturb_integrations")
      .update({ last_error: message })
      .eq("organization_id", organizationId);
    return { ...empty, error: message };
  }
}
