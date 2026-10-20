"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { rechazoDeZernio } from "@/lib/marketing/rechazos-de-contenido";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validations";
import type { ZernioLinkedAd } from "@/lib/zernio/client";
import { getZernioClientForOrganization } from "@/lib/zernio/integration";
import { rechazoPorModulo } from "@/lib/auth/acceso-a-modulo";

/*
 * Errores como valor (SCRUM-502): sin sesión, ID inválido, Zernio sin conectar
 * o con la conexión rechazada vuelven con su motivo; una falla de la base o de
 * Zernio (otro status, tiempo agotado, red) se registra y vuelve con el texto
 * fijo. Antes `getMarketingAdsAction` devolvía el texto crudo de Zernio.
 */

export type MarketingAdsFilters = {
  status?: string;
  platform?: string;
  fromDate?: string;
  toDate?: string;
};

export type MarketingAdsResult = {
  ads: ZernioLinkedAd[];
  pagination: {
    hasMore?: boolean;
    cursor?: string | null;
    total?: number;
  } | null;
};

export async function getContentPieceAdsAction(
  contentPieceId: string
): Promise<MutationResult<{ ads: ZernioLinkedAd[] }>> {
  const rechazo = await rechazoPorModulo("marketing");
  if (rechazo) return rechazo;

  return mutacionConErroresEsperables("[getContentPieceAds]", async () => {
    if (!uuidSchema.safeParse(contentPieceId).success) throw new ErrorEsperable("ID inválido");
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: piece, error } = await supabase
      .from("content_pieces")
      .select("platform_post_id")
      .eq("id", contentPieceId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw new FallaDeLaBase(error);
    if (!piece?.platform_post_id) {
      return { ads: [] };
    }

    const client = await getZernioClientForOrganization(organizationId).catch(
      (err: unknown) => {
        throw rechazoDeZernio(err);
      }
    );
    const response = await client
      .getLinkedAds(String(piece.platform_post_id))
      .catch((err: unknown) => {
        throw rechazoDeZernio(err);
      });
    return { ads: response.ads ?? [] };
  });
}

export async function getMarketingAdsAction(
  filters?: MarketingAdsFilters
): Promise<MutationResult<MarketingAdsResult>> {
  const rechazo = await rechazoPorModulo("marketing");
  if (rechazo) return rechazo;

  return mutacionConErroresEsperables("[getMarketingAds]", async () => {
    const organizationId = await requireOrganizationId();

    const client = await getZernioClientForOrganization(organizationId).catch(
      (err: unknown) => {
        throw rechazoDeZernio(err);
      }
    );
    const apiStatus =
      filters?.status === "error" ? undefined : filters?.status;

    const response = await client
      .listAds({
        source: "all",
        limit: 100,
        status: apiStatus,
        platform: filters?.platform,
        fromDate: filters?.fromDate,
        toDate: filters?.toDate,
      })
      .catch((err: unknown) => {
        throw rechazoDeZernio(err);
      });

    let ads = response.ads ?? [];
    if (filters?.status === "error") {
      ads = ads.filter(
        (ad) => ad.status === "error" || ad.status === "rejected"
      );
    }

    return {
      ads,
      pagination: response.pagination ?? null,
    };
  });
}
