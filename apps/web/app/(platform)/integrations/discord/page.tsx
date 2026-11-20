import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@ai-coo/ui";
import { getDiscordSettingsAction } from "@/app/discord/actions";
import { DiscordSettings } from "@/components/integrations/discord-settings";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function DiscordIntegrationPage() {
  const sinAcceso = await exigirModuloDeLaPagina("integrations");
  if (sinAcceso) return sinAcceso;

  const data = await getDiscordSettingsAction();

  if (!data.integration || data.integration.status !== "connected") {
    redirect(paths.platform.integrations);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={paths.platform.integrations}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Discord</h1>
          <p className="text-sm text-muted-foreground">
            {data.integration.guild_name ?? "Servidor conectado"}
          </p>
        </div>
      </div>

      <DiscordSettings
        integration={data.integration}
        linkedClients={data.linkedClients}
        pendingLinks={data.pendingLinks}
        clients={data.clients}
        channelClients={data.channelClients}
        channelPeople={data.channelPeople}
        team={data.team}
      />
    </div>
  );
}
