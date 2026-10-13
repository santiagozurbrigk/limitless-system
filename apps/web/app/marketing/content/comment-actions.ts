"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import {
  rechazoDeZernio,
  ZERNIO_NO_CONECTADO,
} from "@/lib/marketing/rechazos-de-contenido";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validations";
import {
  getZernioClientForOrganization,
  getZernioIntegrationForOrg,
} from "@/lib/zernio/integration";
import type { ZernioPostCommentsResponse } from "@/lib/zernio/client";

/**
 * Comentarios en vivo de la pieza (SCRUM-502: errores como valor). Pieza sin
 * post, Zernio sin conectar o sin cuenta de la plataforma vuelven con su
 * motivo; una falla de la base o de Zernio, con el texto fijo.
 */
export async function getContentPieceCommentsAction(
  contentPieceId: string,
  cursor?: string
): Promise<MutationResult<ZernioPostCommentsResponse>> {
  return mutacionConErroresEsperables("[getContentPieceComments]", async () => {
    if (!uuidSchema.safeParse(contentPieceId).success) throw new ErrorEsperable("ID inválido");
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: piece, error } = await supabase
      .from("content_pieces")
      .select("platform_post_id, platform")
      .eq("id", contentPieceId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw new FallaDeLaBase(error);
    if (!piece?.platform_post_id) {
      throw new ErrorEsperable("Esta pieza no tiene un post de plataforma asociado");
    }

    const integration = await getZernioIntegrationForOrg(organizationId);
    if (!integration) {
      throw new ErrorEsperable(ZERNIO_NO_CONECTADO);
    }

    const platform = String(piece.platform ?? "instagram").toLowerCase();
    const account =
      integration.connected_accounts.find(
        (item) => item.platform.toLowerCase() === platform
      ) ??
      integration.connected_accounts.find(
        (item) => item.platform.toLowerCase() === "instagram"
      );

    if (!account) {
      throw new ErrorEsperable("No hay una cuenta de Instagram conectada en Zernio");
    }

    const client = await getZernioClientForOrganization(organizationId).catch(
      (err: unknown) => {
        throw rechazoDeZernio(err);
      }
    );
    return client
      .getPostComments(String(piece.platform_post_id), account.accountId, 25, cursor)
      .catch((err: unknown) => {
        throw rechazoDeZernio(err);
      });
  });
}
