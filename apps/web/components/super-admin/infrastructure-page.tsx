import { Badge } from "@ai-coo/ui";
import { isResendConfigured } from "@/lib/email";
import { ClaudeApiKeySettings } from "@/components/settings/claude-api-key-settings";
import type { PlatformClaudeKeyStatus } from "@/lib/ai/platform-credential";
import type { InfrastructureStats } from "@/types/super-admin";

export function InfrastructurePage({
  stats,
  platformClaudeKey,
}: {
  stats: InfrastructureStats;
  platformClaudeKey: PlatformClaudeKeyStatus;
}) {
  const integrations = [
    {
      name: "Resend (emails)",
      status: isResendConfigured() ? "ok" : "warn",
      label: isResendConfigured()
        ? "API key + remitente definidos"
        : "Falta API key o remitente",
    },
    {
      name: "Calendly OAuth",
      status: "ok",
      label: "Configurado ✓",
    },
    {
      name: "ManyChat Webhook",
      status: "ok",
      label: "Configurado ✓",
    },
    {
      name: "Instagram / Meta",
      status: "warn",
      label: "Pendiente aprobación ⚠",
    },
    {
      name: "YouTube API",
      status: "off",
      label: "No configurado",
    },
    {
      name: "Supabase Storage",
      status: "ok",
      label: "Configurado ✓",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border/60 p-6">
        <h3 className="text-sm font-semibold">Plataforma</h3>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Frontend</dt>
            <dd>Vercel (otc-plaform.vercel.app)</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Database</dt>
            <dd>Supabase (sa-east-1)</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Auth</dt>
            <dd>Supabase Auth</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border/60 p-6">
        <h3 className="text-sm font-semibold">Datos en Supabase</h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["Organizaciones", stats.organizations],
            ["Usuarios", stats.users],
            ["Conversaciones", stats.conversations],
            ["Closing calls", stats.closingCalls],
            ["Clientes", stats.clients],
            ["Documentos AI Brain", stats.aiBrainDocuments],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="rounded-lg bg-muted/20 px-3 py-2"
            >
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-border/60 p-6">
        <ClaudeApiKeySettings initialStatus={platformClaudeKey} scope="platform" />
      </section>

      <section className="rounded-xl border border-border/60 p-6">
        <h3 className="text-sm font-semibold">Integraciones globales</h3>
        <ul className="mt-4 space-y-2">
          {integrations.map((i) => (
            <li
              key={i.name}
              className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2 text-sm"
            >
              <span>{i.name}</span>
              <Badge
                variant={
                  i.status === "ok"
                    ? "success"
                    : i.status === "warn"
                      ? "secondary"
                      : "outline"
                }
              >
                {i.label}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
