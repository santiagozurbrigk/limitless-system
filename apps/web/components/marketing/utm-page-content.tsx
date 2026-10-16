"use client";

import { useState } from "react";
import type { ContentAssetView } from "@/app/marketing/actions";
import type { UTMLinkRow } from "@/types/utm";
import { UTMGenerator } from "./utm-generator";
import { UTMSetupGuide } from "./utm-setup-guide";
import { UTMTable } from "./utm-table";

export function UTMPageContent({
  initialLinks,
  motivoDeLinks = null,
  youtubeVideos,
  orgWebsiteUrl,
  motivoDeUrlDelSitio = null,
}: {
  initialLinks: UTMLinkRow[];
  /** Si la lectura de los links falló, su motivo (SCRUM-520). */
  motivoDeLinks?: string | null;
  youtubeVideos: ContentAssetView[];
  orgWebsiteUrl: string | null;
  /** Si la lectura de la URL del sitio falló, su motivo (SCRUM-520). */
  motivoDeUrlDelSitio?: string | null;
}) {
  const [links, setLinks] = useState(initialLinks);

  return (
    <div className="space-y-6">
      <UTMSetupGuide />

      <div className="grid gap-6 lg:grid-cols-2">
        <UTMGenerator
          youtubeVideos={youtubeVideos}
          orgWebsiteUrl={orgWebsiteUrl}
          motivoDeUrlDelSitio={motivoDeUrlDelSitio}
          onCreated={(link) => setLinks((prev) => [link, ...prev])}
        />
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-medium text-foreground">
              UTMs creados
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Métricas de atribución por video de YouTube.
            </p>
          </div>
          <UTMTable links={links} onLinksChange={setLinks} motivoDeCarga={motivoDeLinks} />
        </div>
      </div>
    </div>
  );
}
