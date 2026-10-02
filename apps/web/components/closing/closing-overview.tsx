"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  cn,
  GlassPanel,
} from "@ai-coo/ui";
import { Calendar, ExternalLink, Video } from "lucide-react";
import { FilterPills } from "@/components/marketing/filter-pills";
import {
  acceptsManualOutcome,
  CLOSING_CALL_STATUSES,
  CLOSING_CALL_STATUS_LABEL,
} from "@/lib/closing/call-status";
import { ModuleSubnav } from "@/components/shared/client";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { isSameMonth, pickCalendarFocusDate } from "@/lib/closing/calendar";
import { useHashTab } from "@/lib/hooks/use-hash-tab";
import { usePlatformData } from "@/providers";
import { useToast } from "@/providers/toast-provider";
import { paths } from "@/routes";
import { ESCONDIDO } from "@/lib/release/escondido";
import type { ClosingCall, ClosingCallSource, ClosingCallStatus } from "@/types/closing";
import { CalendlyManualSyncNotice } from "@/components/integrations/calendly-manual-sync-notice";
import type { GHLCalendar } from "@/lib/ghl/client";
import { ClosingCalendar } from "./closing-calendar";
import { ClosersRanking } from "./closers-ranking";
import { PaymentModal } from "./payment-modal";
import { CallOutcomeModal, type CallOutcomeKind } from "./call-outcome-modal";
import { LeadsTable } from "./leads-table";
import { saveCallFollowUpAction } from "@/app/sales/lead-actions";
import type { FollowUpCatalog, FollowUpOption } from "@/lib/sales/follow-up-options";
import type { LeadTableResult } from "@/app/sales/lead-actions";
import type { TeamMember } from "@/types/team";

const TABS = [
  { label: "Calendario", hash: "calendario" },
  { label: "Lista", hash: "lista" },
  { label: "Seguimiento", hash: "seguimiento" },
  { label: "Equipo", hash: "equipo" },
].filter(
  // Escondida para el release (SCRUM-490): el ranking sale siempre vacío
  // ([CLOSER-AMOUNT-CLOSED]).
  (tab) => !(tab.hash === "equipo" && ESCONDIDO.closingEquipo)
);

// Las etiquetas viven en lib/closing/call-status.ts: eran tres copias distintas
// del mismo vocabulario, y así fue como se desincronizaron.
const STATUS_LABEL = CLOSING_CALL_STATUS_LABEL;

const SOURCE_LABEL: Record<ClosingCallSource, string> = {
  calendly: "Calendly",
  ghl: "GHL",
  manual: "Manual",
};

const SOURCE_CLASS: Record<ClosingCallSource, string> = {
  calendly: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  ghl: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  manual: "border-border bg-muted/40 text-muted-foreground",
};

const STATUS_VARIANT: Record<
  ClosingCallStatus,
  "default" | "success" | "warning" | "destructive" | "secondary"
> = {
  scheduled: "default",
  attended: "secondary",
  closed: "success",
  not_closed: "warning",
  no_show: "destructive",
  cancelled: "secondary",
};

function formatCallDate(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ClosingOverview({
  ghlCalendars = [],
  ghlSelectedCalendarIds = [],
  leadsTable,
  teamMembers = [],
}: {
  /** Calendarios disponibles en GHL (fetched server-side). Vacío si no hay integración. */
  ghlCalendars?: GHLCalendar[];
  /** IDs de calendarios actualmente seleccionados para sync. */
  ghlSelectedCalendarIds?: string[];
  /** Primera página de la tabla de seguimiento, resuelta en el servidor. */
  leadsTable: LeadTableResult;
  /** Equipo de la organización, para asignar el responsable del próximo paso. */
  teamMembers?: TeamMember[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkCallId = searchParams.get("call");
  const { push } = useToast();
  const {
    closingCalls,
    closingCallsLoading,
    refreshClosingCalls,
    clients,
    markCallClosed,
    markCallNotClosed,
    markCallNoShow,
  } = usePlatformData();
  const hashTab = useHashTab("calendario");
  // `#equipo` cae en el calendario mientras la pestaña está escondida.
  const activeTab =
    hashTab === "equipo" && ESCONDIDO.closingEquipo ? "calendario" : hashTab;
  const root = paths.platform.sales.closing;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ClosingCallStatus | "all">("all");
  /** Filtro de calendario GHL — "all" o un calendarId específico */
  const [calendarFilter, setCalendarFilter] = useState<string>("all");
  const [paymentOpen, setPaymentOpen] = useState(false);
  /** Qué resultado se está cargando: "no cerrada" o "no show". */
  const [outcomeKind, setOutcomeKind] = useState<CallOutcomeKind | null>(null);
  /** Catálogo de valores para el modal — un valor creado ahí queda disponible. */
  const [catalog, setCatalog] = useState<FollowUpCatalog>(leadsTable.catalog);
  const [calendarMode, setCalendarMode] = useState<"month" | "week">("month");
  const [calendarAnchor, setCalendarAnchor] = useState(() =>
    pickCalendarFocusDate(closingCalls)
  );

  // Calendarios GHL activos (los que efectivamente están seleccionados para sync)
  const activeGhlCalendars = ghlCalendars.filter((c) =>
    ghlSelectedCalendarIds.includes(c.id)
  );
  // Mostrar filtro de calendario solo si hay 2+ calendarios GHL activos
  const showCalendarFilter = activeGhlCalendars.length >= 2;

  useEffect(() => {
    void refreshClosingCalls();
  }, [refreshClosingCalls]);

  useEffect(() => {
    if (closingCalls.length === 0) return;
    setCalendarAnchor((prev) => {
      const hasCallInView = closingCalls.some((c) =>
        isSameMonth(new Date(c.scheduledAt), prev)
      );
      return hasCallInView ? prev : pickCalendarFocusDate(closingCalls);
    });
  }, [closingCalls]);

  const appliedDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (closingCalls.length === 0) {
      setSelectedId(null);
      return;
    }
    if (
      deepLinkCallId &&
      appliedDeepLinkRef.current !== deepLinkCallId &&
      closingCalls.some((c) => c.id === deepLinkCallId)
    ) {
      appliedDeepLinkRef.current = deepLinkCallId;
      setSelectedId(deepLinkCallId);
      return;
    }
    if (!selectedId || !closingCalls.some((c) => c.id === selectedId)) {
      setSelectedId(closingCalls[0].id);
    }
  }, [closingCalls, selectedId, deepLinkCallId]);

  const selected = closingCalls.find((c) => c.id === selectedId);

  // Aplica primero el filtro de calendario GHL, luego el de estado
  const calendarFilteredCalls = useMemo(() => {
    if (calendarFilter === "all" || !showCalendarFilter) return closingCalls;
    return closingCalls.filter(
      (c) => c.ghlCalendarId === calendarFilter
    );
  }, [closingCalls, calendarFilter, showCalendarFilter]);

  const filteredCalls = useMemo(() => {
    if (listFilter === "all") return calendarFilteredCalls;
    return calendarFilteredCalls.filter((c) => c.status === listFilter);
  }, [calendarFilteredCalls, listFilter]);

  const navTabs = TABS.map((t) => ({
    label: t.label,
    href: `${root}#${t.hash}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader description="Calendario de llamadas de cierre, contexto Calendly y resultados" />

      <CalendlyManualSyncNotice showIntegrationsLink />

      {/* Filtro de calendario GHL — solo si hay 2+ calendarios activos */}
      {showCalendarFilter ? (
        <FilterPills
          options={[
            { value: "all", label: "Todos los calendarios" },
            ...activeGhlCalendars.map((c) => ({ value: c.id, label: c.name })),
          ]}
          value={calendarFilter}
          onChange={setCalendarFilter}
        />
      ) : null}

      <ModuleSubnav
        tabs={navTabs}
        isTabActive={(href) => (href.split("#")[1] ?? "calendario") === activeTab}
      />

      {activeTab === "seguimiento" ? (
        <LeadsTable initial={leadsTable} teamMembers={teamMembers} />
      ) : activeTab === "equipo" ? (
        <div className="space-y-4">
          <ClosersRanking />
        </div>
      ) : null}

      <div
        className={
          activeTab === "equipo" || activeTab === "seguimiento"
            ? "hidden"
            : "flex flex-col gap-6"
        }
      >
        <div className="min-w-0 w-full space-y-4">
          {closingCallsLoading ? (
            <p className="text-sm text-muted-foreground">Cargando llamadas…</p>
          ) : closingCalls.length === 0 ? (
            <EmptyState
              title="Sin llamadas agendadas"
              description="Conectá Calendly para ver tus llamadas de cierre aquí."
              icon={<Calendar className="h-8 w-8" />}
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link href={paths.platform.integrations}>Conectar Calendly</Link>
                </Button>
              }
            />
          ) : activeTab === "lista" ? (
            <>
              <FilterPills
                options={(
                  ["all", ...CLOSING_CALL_STATUSES] as const
                ).map((f) => ({
                  value: f,
                  label:
                    f === "all" ? "Todos" : STATUS_LABEL[f as ClosingCallStatus],
                }))}
                value={listFilter}
                onChange={(value) =>
                  setListFilter(value as typeof listFilter)
                }
              />
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3">Lead</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Fuente UTM</th>
                      <th className="px-4 py-3">Closer</th>
                      <th className="px-4 py-3">Resultado</th>
                      <th className="px-4 py-3">Ingreso</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCalls.map((call) => (
                      <tr
                        key={call.id}
                        className={cn(
                          "border-b border-border/50 cursor-pointer hover:bg-muted/30",
                          selectedId === call.id && "bg-muted/40"
                        )}
                        onClick={() => setSelectedId(call.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{call.leadName}</span>
                            {call.source && call.source !== "manual" ? (
                              <span
                                className={cn(
                                  "inline-flex w-fit items-center rounded-full border px-1.5 py-px text-[10px] font-medium leading-none",
                                  SOURCE_CLASS[call.source]
                                )}
                              >
                                {SOURCE_LABEL[call.source]}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatCallDate(call.scheduledAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[call.status]}>
                            {STATUS_LABEL[call.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {call.utmSource ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-medium text-foreground">
                                {call.utmSource}
                              </span>
                              {call.utmMedium ? (
                                <span className="text-[10px] text-muted-foreground">
                                  {call.utmMedium}
                                  {call.utmCampaign ? ` · ${call.utmCampaign}` : ""}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {call.closedByName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {call.outcome?.paymentType ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {call.outcome?.revenue
                            ? `$${call.outcome.revenue.toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="ghost">
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={calendarMode === "month" ? "default" : "outline"}
                    onClick={() => setCalendarMode("month")}
                  >
                    Mes
                  </Button>
                  <Button
                    size="sm"
                    variant={calendarMode === "week" ? "default" : "outline"}
                    onClick={() => setCalendarMode("week")}
                  >
                    Semana
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Llamadas importadas desde Calendly
                </p>
              </div>
              <ClosingCalendar
                calls={calendarFilteredCalls}
                mode={calendarMode}
                anchorDate={calendarAnchor}
                onAnchorChange={setCalendarAnchor}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {(
                  [
                    ["scheduled", CLOSING_CALL_STATUS_LABEL.scheduled],
                    ["attended", CLOSING_CALL_STATUS_LABEL.attended],
                    ["closed", CLOSING_CALL_STATUS_LABEL.closed],
                    ["not_closed", CLOSING_CALL_STATUS_LABEL.not_closed],
                    ["no_show", CLOSING_CALL_STATUS_LABEL.no_show],
                    ["cancelled", CLOSING_CALL_STATUS_LABEL.cancelled],
                  ] as const
                ).map(([status, label]) => (
                  <span key={status} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        status === "scheduled" && "bg-primary",
                        status === "closed" && "bg-emerald-500",
                        status === "attended" && "bg-sky-500",
                        status === "not_closed" && "bg-amber-500",
                        status === "no_show" && "bg-destructive",
                        status === "cancelled" && "bg-muted-foreground"
                      )}
                    />
                    {label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {selected && (
          <CallDetailPanel
            call={selected}
            linkedClient={clients.find((c) => c.closingCallId === selected.id)}
            onMarkClosed={() => setPaymentOpen(true)}
            onMarkNotClosed={() => setOutcomeKind("not_closed")}
            onMarkNoShow={() => setOutcomeKind("no_show")}
          />
        )}
      </div>

      {selected && (
        <>
          <PaymentModal
            open={paymentOpen}
            onOpenChange={setPaymentOpen}
            defaultName={selected.leadName}
            onSubmit={async (payload) => {
              try {
                const client = await markCallClosed(selected.id, payload);
                push({
                  title: "Cliente creado",
                  description: `${client.name} añadido con estado Realizar onboarding`,
                  variant: "success",
                });
                router.push(paths.platform.clients.detail(client.id));
              } catch (e) {
                push({
                  title: "Error al guardar cliente",
                  description:
                    e instanceof Error ? e.message : "Intenta de nuevo",
                  variant: "default",
                });
              }
            }}
          />
          <CallOutcomeModal
            open={outcomeKind !== null}
            onOpenChange={(open) => setOutcomeKind(open ? outcomeKind : null)}
            kind={outcomeKind ?? "not_closed"}
            leadName={selected.leadName}
            catalog={catalog}
            teamMembers={teamMembers}
            onCatalogChange={(option: FollowUpOption) =>
              setCatalog((current) =>
                option.kind === "next_action"
                  ? { ...current, nextActions: [...current.nextActions, option] }
                  : { ...current, qualifications: [...current.qualifications, option] }
              )
            }
            onSubmit={async (payload) => {
              try {
                // Primero el resultado de la llamada: es el dato que el closer
                // vino a cargar. Si el seguimiento falla después, el resultado
                // igual quedó guardado y se lo decimos.
                if (outcomeKind === "no_show") {
                  await markCallNoShow(selected.id);
                } else {
                  await markCallNotClosed(
                    selected.id,
                    payload.reason ?? "other",
                    payload.notes
                  );
                }
              } catch (e) {
                push({
                  title: "Error al guardar el resultado",
                  description: e instanceof Error ? e.message : undefined,
                  variant: "default",
                });
                return;
              }

              const followUp = await saveCallFollowUpAction({
                callId: selected.id,
                qualification: payload.qualification,
                nextAction: payload.nextAction,
                nextActionAt: payload.nextActionAt,
                ownerId: payload.ownerId,
                notes: payload.nextActionNotes,
              });

              if (!followUp.ok) {
                push({
                  title: "El resultado se guardó, el seguimiento no",
                  description: followUp.error,
                  variant: "default",
                });
                return;
              }

              push({
                title: payload.nextAction
                  ? "Resultado y seguimiento guardados"
                  : "Resultado guardado — el lead queda sin próximo paso",
                variant: "success",
              });
              router.refresh();
            }}
          />
        </>
      )}
    </div>
  );
}

function CallDetailPanel({
  call,
  linkedClient,
  onMarkClosed,
  onMarkNotClosed,
  onMarkNoShow,
}: {
  call: ClosingCall;
  linkedClient?: { id: string; name: string };
  onMarkClosed: () => void;
  onMarkNotClosed: () => void;
  onMarkNoShow: () => void;
}) {
  // `attended` también acepta resultado: es una llamada que el proveedor marcó
  // como asistida y a la que nadie le cargó el desenlace. Comparar contra
  // `scheduled` a mano dejaba a esas llamadas sin forma de cerrarse desde Limitless —
  // que es exactamente el estado "Falta cargar el resultado" de la tabla.
  const acceptsOutcome = acceptsManualOutcome(call.status);

  return (
    <GlassPanel className="w-full p-5 space-y-5">
      <div>
        <p className="text-lg font-semibold">{call.leadName}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {formatCallDate(call.scheduledAt)}
        </p>
        <Badge className="mt-2" variant={STATUS_VARIANT[call.status]}>
          {STATUS_LABEL[call.status]}
        </Badge>
      </div>

      {/* Atribución UTM — solo si hay datos (llamadas de origen GHL con UTM) */}
      {(call.utmSource || call.utmMedium || call.utmCampaign) && (
        <section className="rounded-lg border border-border p-3 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Atribución UTM
          </h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {call.utmSource && (
              <>
                <dt className="text-xs text-muted-foreground">Fuente</dt>
                <dd className="text-xs font-medium">{call.utmSource}</dd>
              </>
            )}
            {call.utmMedium && (
              <>
                <dt className="text-xs text-muted-foreground">Medio</dt>
                <dd className="text-xs font-medium">{call.utmMedium}</dd>
              </>
            )}
            {call.utmCampaign && (
              <>
                <dt className="text-xs text-muted-foreground">Campaña</dt>
                <dd className="text-xs font-medium">{call.utmCampaign}</dd>
              </>
            )}
            {call.utmContent && (
              <>
                <dt className="text-xs text-muted-foreground">Contenido</dt>
                <dd className="text-xs font-medium">{call.utmContent}</dd>
              </>
            )}
            {call.utmTerm && (
              <>
                <dt className="text-xs text-muted-foreground">Término</dt>
                <dd className="text-xs font-medium">{call.utmTerm}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      <section>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Datos del formulario
        </h4>
        <dl className="space-y-3">
          {call.formAnswers.map((a, i) => (
            <div key={i}>
              <dt className="text-xs text-muted-foreground">{a.question}</dt>
              <dd className="text-sm mt-0.5">{a.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      {call.fathomUrl && (
        <section className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Video className="h-4 w-4" />
            Grabación Fathom
          </div>
          {/* El recuadro "Vista previa" no previsualizaba nada (SCRUM-490). */}
          {!ESCONDIDO.vistaPreviaFathomEnTurno && (
            <div className="aspect-video rounded-md bg-muted/50 flex items-center justify-center text-xs text-muted-foreground">
              Vista previa
            </div>
          )}
          <Button size="sm" variant="outline" className="w-full gap-2" asChild>
            <a href={call.fathomUrl} target="_blank" rel="noopener noreferrer">
              Abrir en Fathom
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </section>
      )}

      {acceptsOutcome ? (
        <section className="space-y-2 pt-2 border-t border-border">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Resultado de la llamada
          </h4>
          <Button className="w-full" onClick={onMarkClosed}>
            Marcar como cerrada
          </Button>
          <Button className="w-full" variant="outline" onClick={onMarkNotClosed}>
            Marcar como no cerrada
          </Button>
          <Button className="w-full" variant="ghost" onClick={onMarkNoShow}>
            Marcar como no show
          </Button>
        </section>
      ) : (
        <section className="space-y-3 pt-2 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Resultado registrado — no podés modificarlo desde acá.
          </p>
          {call.status === "closed" && linkedClient ? (
            <Button size="sm" variant="outline" className="w-full" asChild>
              <Link href={paths.platform.clients.detail(linkedClient.id)}>
                Ver cliente — {linkedClient.name}
              </Link>
            </Button>
          ) : null}
        </section>
      )}
    </GlassPanel>
  );
}
