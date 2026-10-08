import type { ReactNode } from "react";
import { Badge } from "@ai-coo/ui";
import { isResendConfigured } from "@/lib/email";
import { ClaudeApiKeySettings } from "@/components/settings/claude-api-key-settings";
import type { PlatformClaudeKeyStatus } from "@/lib/ai/platform-credential";
import type { RespuestaDeSalud } from "@/lib/observability/salud";
import { vistaDeCorrida, type TonoDeEstado } from "@/lib/super-admin/estado-de-corridas";
import { formatOrgDateTime } from "@/lib/super-admin/format-org-datetime";
import type { CorridasDeProcesos, InfrastructureStats } from "@/types/super-admin";

const VARIANTE_POR_TONO = {
  ok: "success",
  aviso: "secondary",
  error: "destructive",
  neutro: "outline",
} as const satisfies Record<TonoDeEstado, string>;

const ESTADO_GENERAL: Record<RespuestaDeSalud["status"], { tono: TonoDeEstado; etiqueta: string }> = {
  ok: { tono: "ok", etiqueta: "Todo responde" },
  degradado: { tono: "aviso", etiqueta: "Degradado" },
  caido: { tono: "error", etiqueta: "Caído" },
};

/** Fecha y hora corta en la zona de Argentina (la de por defecto de la plataforma). */
function horaCorta(iso: string): string {
  return formatOrgDateTime(iso, null, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EstadoBadge({ tono, children }: { tono: TonoDeEstado; children: ReactNode }) {
  return <Badge variant={VARIANTE_POR_TONO[tono]}>{children}</Badge>;
}

export function InfrastructurePage({
  stats,
  platformClaudeKey,
  salud,
  corridas,
  ahora,
}: {
  stats: InfrastructureStats;
  platformClaudeKey: PlatformClaudeKeyStatus;
  /** El mismo chequeo que responde `GET /api/health`. */
  salud: RespuestaDeSalud;
  corridas: CorridasDeProcesos;
  ahora: Date;
}) {
  const resendConfigurado = isResendConfigured();
  const chequeos: { nombre: string; ok: boolean; bien: string; mal: string }[] = [
    { nombre: "Base de datos", ok: salud.chequeos.base, bien: "Responde", mal: "No responde" },
    { nombre: "Storage", ok: salud.chequeos.storage, bien: "Responde", mal: "No responde" },
    {
      nombre: "Variables críticas",
      ok: salud.chequeos.variables,
      bien: "Completas",
      mal: "Falta alguna",
    },
    {
      nombre: "Envío de emails (Resend)",
      ok: resendConfigurado,
      bien: "API key y remitente definidos",
      mal: "Falta API key o remitente",
    },
  ];
  const general = ESTADO_GENERAL[salud.status];

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border/60 p-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold">Estado de la plataforma</h3>
          <EstadoBadge tono={general.tono}>{general.etiqueta}</EstadoBadge>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Versión desplegada</dt>
            <dd className="font-mono text-xs">
              {salud.version.commit
                ? `${salud.version.commit}${salud.version.entorno ? ` (${salud.version.entorno})` : ""}`
                : "Sin datos de Vercel (entorno local)"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Medido</dt>
            <dd>{horaCorta(salud.hora)}</dd>
          </div>
        </dl>
        <ul className="mt-4 space-y-2">
          {chequeos.map((chequeo) => (
            <li
              key={chequeo.nombre}
              className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2 text-sm"
            >
              <span>{chequeo.nombre}</span>
              <EstadoBadge tono={chequeo.ok ? "ok" : "error"}>
                {chequeo.ok ? chequeo.bien : chequeo.mal}
              </EstadoBadge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Es el mismo chequeo que consulta el monitor externo en /api/health.
        </p>
      </section>

      <section className="rounded-xl border border-border/60 p-6">
        <h3 className="text-sm font-semibold">Procesos programados</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Última corrida de cada cron, en hora de Argentina. Si uno figura sin cierre o con orgs
          fallidas, revisá los logs de Vercel de esa ruta y los issues de Sentry. Los crons que
          reparten el trabajo en una cola figuran como Encolado: cuentan los jobs publicados, no
          cómo terminó cada uno.
        </p>
        {corridas.disponible ? null : (
          <p className="mt-3 text-sm text-destructive">
            No se pudo leer el registro de corridas. Revisá que la migración de corridas_de_procesos
            esté aplicada.
          </p>
        )}
        <ul className="mt-4 space-y-2">
          {corridas.procesos.map((proceso) => {
            const vista = vistaDeCorrida(proceso.corrida, ahora);
            return (
              <li key={proceso.proceso} className="rounded-lg bg-muted/20 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs">{proceso.proceso}</span>
                  <EstadoBadge tono={vista.tono}>{vista.etiqueta}</EstadoBadge>
                </div>
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {proceso.corrida ? `Empezó ${horaCorta(proceso.corrida.inicio)}` : "Todavía no corrió"}
                    {proceso.horario ? ` · horario ${proceso.horario} (UTC)` : ""}
                  </span>
                  {vista.detalle ? <span className="text-right">{vista.detalle}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
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
    </div>
  );
}
