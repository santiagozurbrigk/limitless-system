"use client";

import { ArrowDown, X } from "lucide-react";
import {
  CLOSING_CALL_STATUS_LABEL,
  isClosingCallStatus,
} from "@/lib/closing/call-status";
import { Badge, cn } from "@ai-coo/ui";
import type { UTMFunnelData, UTMLinkRow } from "@/types/utm";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function conversionPct(from: number, to: number): string {
  if (from === 0) return "0%";
  return `${Math.round((to / from) * 100)}%`;
}

function bookingStatusLabel(status?: string): string {
  // Sin el vocabulario compartido, cada estado nuevo caía en "Agendado": una
  // llamada cancelada se mostraba como si siguiera en pie.
  return isClosingCallStatus(status)
    ? CLOSING_CALL_STATUS_LABEL[status]
    : "Agendado";
}

function roiBadge(totalRevenue: number) {
  if (totalRevenue >= 1000) {
    return (
      <Badge variant="success" className="text-[10px]">
        Alto impacto
      </Badge>
    );
  }
  if (totalRevenue >= 100) {
    return (
      <Badge variant="warning" className="text-[10px]">
        Impacto medio
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      Bajo impacto
    </Badge>
  );
}

function FunnelStep({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}: {count}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function UTMLeadsSheet({
  open,
  onOpenChange,
  link,
  funnel,
  motivo = null,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: UTMLinkRow | null;
  funnel: UTMFunnelData | null;
  /** Si no se pudo cargar el funnel, su motivo en vez del funnel vacío (SCRUM-520). */
  motivo?: string | null;
  loading?: boolean;
}) {
  const leads = funnel?.leads ?? [];
  const bookings = funnel?.bookings ?? [];
  const sales = funnel?.sales ?? [];
  const totalRevenue = funnel?.totalRevenue ?? 0;

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-black/50"
          aria-label="Cerrar panel de funnel"
          onClick={() => onOpenChange(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border/40 bg-background p-6 shadow-xl backdrop-blur-xl transition-transform duration-200 dark:border-glass dark:bg-[#111111]/80",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-hidden={!open}
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-medium text-foreground">
              Funnel — {link?.youtube_video_title ?? link?.utm_campaign ?? "UTM"}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {link?.utm_campaign}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando funnel…</p>
        ) : motivo ? (
          <div className="text-sm">
            <p className="font-medium text-foreground">No se pudo cargar el funnel</p>
            <p className="mt-1 text-muted-foreground">{motivo}</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
            <FunnelStep label="Leads capturados" count={leads.length}>
              {leads.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay leads para este UTM.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {leads.map((lead) => (
                    <li
                      key={lead.id}
                      className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 dark:border-glass dark:bg-glass"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {lead.lead_email ??
                          lead.lead_identifier ??
                          "Lead anónimo"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(lead.captured_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </FunnelStep>

            {leads.length > 0 ? (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ArrowDown className="h-3.5 w-3.5" />
                conversión {conversionPct(leads.length, bookings.length)}
              </div>
            ) : null}

            <FunnelStep label="Bookings atribuidos" count={bookings.length}>
              {bookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin bookings atribuidos aún.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {bookings.map((booking) => {
                    const call = booking.closing_calls;
                    const name =
                      booking.lead_name ??
                      call?.lead_name ??
                      "Lead sin nombre";
                    const status = call?.status ?? "scheduled";
                    return (
                      <li
                        key={booking.id}
                        className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 dark:border-glass dark:bg-glass"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {name}
                          </p>
                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                            {bookingStatusLabel(status)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(booking.booked_at)}
                          {call?.scheduled_at
                            ? ` · call ${formatDate(call.scheduled_at)}`
                            : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </FunnelStep>

            {bookings.length > 0 ? (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ArrowDown className="h-3.5 w-3.5" />
                conversión {conversionPct(bookings.length, sales.length)}
              </div>
            ) : null}

            <FunnelStep
              label={`Ventas cerradas — ${formatMoney(totalRevenue)} total`}
              count={sales.length}
            >
              {sales.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin ventas atribuidas aún.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sales.map((sale) => (
                    <li
                      key={sale.id}
                      className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 dark:border-glass dark:bg-glass"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {sale.clients?.name ?? "Cliente"}
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatMoney(sale.revenue)}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(sale.sold_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </FunnelStep>

            <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-4 dark:border-glass">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                ROI del video
              </p>
              <p className="mt-2 text-sm text-foreground">
                Este video generó{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(totalRevenue)}
                </span>{" "}
                en ventas directas
              </p>
              <div className="mt-2">{roiBadge(totalRevenue)}</div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
