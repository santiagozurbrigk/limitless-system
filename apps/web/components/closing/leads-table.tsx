"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Settings2,
  UserCircle2,
} from "lucide-react";
import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@ai-coo/ui";
import { FilterPills } from "@/components/marketing/filter-pills";
import { EmptyState } from "@/components/shared/empty-state";
import {
  listLeadsTableAction,
  setLeadQualificationAction,
  setNextActionAction,
  setNextActionNotesAction,
  setNextActionOwnerAction,
  type LeadTableResult,
  type LeadTableRow,
  type LeadTableScope,
  type LeadTableSort,
} from "@/app/sales/lead-actions";
import {
  buildLeadThread,
  LEAD_THREAD_STATE_LABEL,
  type LeadAttempt,
  type LeadThreadState,
} from "@/lib/sales/lead-thread";
import {
  closingActionSlugs,
  fechaPropuestaDelProximoPaso,
  findOption,
  needsDate,
  type FollowUpCatalog,
  type FollowUpOption,
} from "@/lib/sales/follow-up-options";
import { CLOSING_CALL_STATUS_LABEL } from "@/lib/closing/call-status";
import { fechaAInstanteEnZona } from "@/lib/fechas/calendario";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import type { TeamMember } from "@/types/team";
import { useToast } from "@/providers/toast-provider";
import { FollowUpOptionPicker } from "./follow-up-option-picker";
import { LeadDetailDrawer } from "./lead-detail-drawer";
import { ManageFollowUpOptionsDialog } from "./manage-follow-up-options-dialog";

/**
 * La tabla de seguimiento.
 *
 * ⭐ **Reemplaza al acordeón.** Antes, editar un lead costaba tres clicks —abrir
 * la fila, elegir el botón, guardar— y nunca se podían ver dos leads a la vez.
 * Acá cada celda se edita en el lugar y el cambio se guarda solo.
 *
 * ⭐ **El estado no se edita: se deriva.** Es la regla que sostiene el módulo. La
 * columna se recalcula en el cliente con el mismo `buildLeadThread` que usa el
 * servidor, así que cambiar el próximo paso mueve el estado en el acto y sin
 * inventar nada.
 */

const STATE_VARIANT: Record<
  LeadThreadState,
  "default" | "success" | "warning" | "destructive" | "secondary"
> = {
  follow_up_due: "destructive",
  pending_outcome: "warning",
  stalled: "warning",
  scheduled: "default",
  follow_up_planned: "secondary",
  won: "success",
  lost: "secondary",
};

const STATE_ORDER: LeadThreadState[] = [
  "follow_up_due",
  "pending_outcome",
  "stalled",
  "scheduled",
  "follow_up_planned",
  "won",
  "lost",
];

const SORT_LABEL: Record<LeadTableSort, string> = {
  urgency: "Urgencia",
  recent: "Último turno",
  name: "Nombre",
  next_action_at: "Fecha del próximo paso",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

/**
 * Fecha por defecto de un próximo paso nuevo: pasado mañana en la zona de la
 * organización, guardada al mediodía de esa zona para que la celda la muestre
 * igual a todos los miembros.
 */
function defaultNextActionAt(zona: string | null): string {
  return fechaAInstanteEnZona(fechaPropuestaDelProximoPaso(zona), zona);
}

export function LeadsTable({
  initial,
  teamMembers,
}: {
  initial: LeadTableResult;
  teamMembers: TeamMember[];
}) {
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();

  // La zona de la org: la fecha del próximo paso se propone, guarda, muestra y
  // vence en ella, igual que en el servidor.
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const [result, setResult] = useState<LeadTableResult>(initial);
  const [catalog, setCatalog] = useState<FollowUpCatalog>(initial.catalog);
  const [rows, setRows] = useState<LeadTableRow[]>(initial.rows);
  const [scope, setScope] = useState<LeadTableScope>("pending");
  const [stateFilter, setStateFilter] = useState<LeadThreadState | "all">("all");
  const [sort, setSort] = useState<LeadTableSort>("urgency");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const closing = useMemo(
    () => closingActionSlugs(catalog.nextActions),
    [catalog.nextActions]
  );

  // La primera carga ya vino del servidor: no repetirla al montar.
  const firstRender = useRef(true);

  const load = useCallback(() => {
      startTransition(async () => {
        const next = await listLeadsTableAction({
          scope,
          state: stateFilter,
          search,
          sort,
          page,
        });
        setResult(next);
        setRows(next.rows);
        setCatalog(next.catalog);
      });
    },
    [scope, stateFilter, search, sort, page]
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // El buscador escribe letra por letra: se espera a que frene.
    const timer = setTimeout(() => load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  /**
   * Aplica un cambio a un turno y **recalcula el estado del lead**.
   *
   * Se usa el mismo `buildLeadThread` del servidor, que es puro: la columna
   * Estado se mueve en el acto y sigue siendo derivada, no escrita a mano.
   */
  function patchRow(leadId: string, patch: Partial<LeadAttempt>) {
    setRows((current) =>
      current.map((row) => {
        if (row.leadId !== leadId) return row;
        const attempts = row.attempts.map((a) =>
          a.id === row.targetAttemptId ? { ...a, ...patch } : a
        );
        // Con la zona de la organización, igual que el servidor: el próximo
        // paso vence por día en esa zona.
        const thread = buildLeadThread(attempts, new Date(), zonaDeLaOrganizacion, closing);
        const target =
          thread.actionableAttemptId ?? row.targetAttemptId ?? thread.attempts[0]?.id ?? null;
        const targetAttempt = thread.attempts.find((a) => a.id === target) ?? null;
        return {
          ...row,
          attempts: thread.attempts,
          state: thread.state,
          qualification: thread.latestQualification,
          targetAttemptId: target,
          nextAction: targetAttempt?.nextAction ?? null,
          nextActionAt: targetAttempt?.nextActionAt ?? null,
          nextActionOwnerId: targetAttempt?.nextActionOwnerId ?? null,
          nextActionNotes: targetAttempt?.nextActionNotes ?? null,
        };
      })
    );
  }

  /** La fila como está ahora, para poder volver atrás si el guardado falla. */
  function snapshot(leadId: string): LeadTableRow | null {
    return rows.find((r) => r.leadId === leadId) ?? null;
  }

  function restore(row: LeadTableRow | null) {
    if (!row) return;
    setRows((current) => current.map((r) => (r.leadId === row.leadId ? row : r)));
  }

  function handleNextAction(row: LeadTableRow, slug: string | null) {
    if (!row.targetAttemptId) return;
    // Un valor que pide fecha y no la tiene arranca con una por defecto: sin
    // fecha nunca vencería, y el lead se perdería en silencio. La celda de al
    // lado queda lista para corregirla.
    const wantsDate = slug ? needsDate(catalog.nextActions, slug) : false;
    const nextActionAt = wantsDate
      ? (row.nextActionAt ?? defaultNextActionAt(zonaDeLaOrganizacion))
      : null;

    const previous = snapshot(row.leadId);
    patchRow(row.leadId, {
      nextAction: slug,
      nextActionAt,
      ...(slug ? {} : { nextActionOwnerId: null, nextActionNotes: null }),
    });

    startTransition(async () => {
      const res = await setNextActionAction({
        callId: row.targetAttemptId!,
        nextAction: slug,
        nextActionAt,
      });
      if (!res.ok) {
        restore(previous);
        push({ title: "No se pudo guardar", description: res.error });
      }
    });
  }

  function handleDate(row: LeadTableRow, value: string | null) {
    if (!row.targetAttemptId || !row.nextAction) return;
    if (!value) {
      push({
        title: "El próximo paso necesita una fecha",
        description: "Sin fecha nunca vence, así que el lead no vuelve a la cola.",
      });
      return;
    }
    // Mediodía de la zona de la org: `CampoFecha` (con esa zona) lo vuelve a
    // mostrar como el mismo día, y el estado lo cuenta en ese día.
    const iso = fechaAInstanteEnZona(value, zonaDeLaOrganizacion);
    const previous = snapshot(row.leadId);
    patchRow(row.leadId, { nextActionAt: iso });

    startTransition(async () => {
      const res = await setNextActionAction({
        callId: row.targetAttemptId!,
        nextAction: row.nextAction,
        nextActionAt: iso,
      });
      if (!res.ok) {
        restore(previous);
        push({ title: "No se pudo guardar la fecha", description: res.error });
      }
    });
  }

  function handleQualification(row: LeadTableRow, slug: string | null) {
    if (!row.targetAttemptId) return;
    const previous = snapshot(row.leadId);
    patchRow(row.leadId, { postCallQualification: slug });

    startTransition(async () => {
      const res = await setLeadQualificationAction({
        callId: row.targetAttemptId!,
        moment: "post",
        qualification: slug,
      });
      if (!res.ok) {
        restore(previous);
        push({ title: "No se pudo calificar", description: res.error });
      }
    });
  }

  function handleOwner(row: LeadTableRow, ownerId: string | null) {
    if (!row.targetAttemptId) return;
    const previous = snapshot(row.leadId);
    patchRow(row.leadId, { nextActionOwnerId: ownerId });

    startTransition(async () => {
      const res = await setNextActionOwnerAction({
        callId: row.targetAttemptId!,
        ownerId,
      });
      if (!res.ok) {
        restore(previous);
        push({ title: "No se pudo asignar", description: res.error });
      }
    });
  }

  function handleNotes(row: LeadTableRow, notes: string) {
    if (!row.targetAttemptId) return;
    const clean = notes.trim() || null;
    if (clean === row.nextActionNotes) return;
    const previous = snapshot(row.leadId);
    patchRow(row.leadId, { nextActionNotes: clean });

    startTransition(async () => {
      const res = await setNextActionNotesAction({
        callId: row.targetAttemptId!,
        notes: clean,
      });
      if (!res.ok) {
        restore(previous);
        push({ title: "No se pudo guardar la nota", description: res.error });
      }
    });
  }

  function addOption(option: FollowUpOption) {
    setCatalog((current) =>
      option.kind === "next_action"
        ? { ...current, nextActions: [...current.nextActions, option] }
        : { ...current, qualifications: [...current.qualifications, option] }
    );
  }

  const pendingCount =
    result.counts.follow_up_due + result.counts.pending_outcome + result.counts.stalled;
  const totalCount = STATE_ORDER.reduce((sum, s) => sum + result.counts[s], 0);
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);
  const selected = rows.find((r) => r.leadId === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPills
          options={[
            { value: "pending", label: `Pendientes (${pendingCount})` },
            { value: "all", label: `Todos (${totalCount})` },
          ]}
          value={scope}
          onChange={(value) => {
            setScope(value as LeadTableScope);
            setStateFilter("all");
            setPage(1);
          }}
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            placeholder="Buscar por nombre o mail"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-8 w-56 pl-7 text-xs"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
              {stateFilter === "all"
                ? "Todos los estados"
                : LEAD_THREAD_STATE_LABEL[stateFilter]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              className="text-xs"
              onSelect={() => {
                setStateFilter("all");
                setPage(1);
              }}
            >
              Todos los estados
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {STATE_ORDER.map((s) => (
              <DropdownMenuItem
                key={s}
                className="justify-between text-xs"
                onSelect={() => {
                  setStateFilter(s);
                  setScope("all");
                  setPage(1);
                }}
              >
                {LEAD_THREAD_STATE_LABEL[s]}
                <span className="text-muted-foreground">{result.counts[s]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5" />
              {SORT_LABEL[sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(SORT_LABEL) as LeadTableSort[]).map((s) => (
              <DropdownMenuItem
                key={s}
                className="text-xs"
                onSelect={() => {
                  setSort(s);
                  setPage(1);
                }}
              >
                {SORT_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={() => setManageOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Valores
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            disabled={isPending}
            onClick={() => load()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {result.truncated && (
        <p className="text-xs text-muted-foreground">
          Se están leyendo los primeros 2.000 leads. Hay más, y no entran en esta
          vista.
        </p>
      )}

      {/* La tabla */}
      {rows.length === 0 ? (
        <EmptyState
          title={
            scope === "pending"
              ? "Ningún lead quedó sin próximo paso"
              : "Sin leads para mostrar"
          }
          description={
            scope === "pending"
              ? "Cuando una llamada pase sin resultado, o venza un seguimiento, aparece acá."
              : "Los leads se crean solos cuando un turno trae mail o contacto de GHL."
          }
          icon={<UserCircle2 className="h-8 w-8" />}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                {[
                  "Lead",
                  "Estado",
                  "Último turno",
                  "Intentos",
                  "Calificación",
                  "Próximo paso",
                  "Fecha",
                  "Responsable",
                  "Notas",
                ].map((header) => (
                  <th
                    key={header}
                    className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const actionOption = findOption(catalog.nextActions, row.nextAction);
                const dateDisabled =
                  !row.nextAction || actionOption?.behavior === "closes_thread";
                const owner = row.nextActionOwnerId
                  ? teamMembers.find((m) => m.id === row.nextActionOwnerId)
                  : null;

                return (
                  <tr
                    key={row.leadId}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="max-w-[220px] px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.leadId)}
                        className="block w-full text-left"
                      >
                        <span className="block truncate text-sm font-medium hover:text-primary">
                          {row.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.email ?? "Sin mail"}
                        </span>
                      </button>
                    </td>

                    <td className="px-3 py-1.5">
                      <Badge
                        variant={STATE_VARIANT[row.state]}
                        className="whitespace-nowrap text-[10px]"
                      >
                        {LEAD_THREAD_STATE_LABEL[row.state]}
                      </Badge>
                    </td>

                    <td className="whitespace-nowrap px-3 py-1.5 text-xs">
                      <span className="block">{formatDate(row.lastAttemptAt)}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {row.lastStatus ? CLOSING_CALL_STATUS_LABEL[row.lastStatus] : "—"}
                      </span>
                    </td>

                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {row.attemptCount}
                    </td>

                    <td className="min-w-[150px] px-3 py-1.5">
                      <FollowUpOptionPicker
                        kind="qualification"
                        options={catalog.qualifications}
                        value={row.qualification}
                        disabled={!row.targetAttemptId}
                        placeholder="Sin calificar"
                        onSelect={(slug) => handleQualification(row, slug)}
                        onCreated={addOption}
                      />
                    </td>

                    <td className="min-w-[170px] px-3 py-1.5">
                      <FollowUpOptionPicker
                        kind="next_action"
                        options={catalog.nextActions}
                        value={row.nextAction}
                        disabled={!row.targetAttemptId}
                        placeholder="Sin definir"
                        onSelect={(slug) => handleNextAction(row, slug)}
                        onCreated={addOption}
                      />
                    </td>

                    <td className="px-3 py-1.5">
                      <CampoFecha
                        value={row.nextActionAt}
                        zona={zonaDeLaOrganizacion}
                        disabled={dateDisabled}
                        onChange={(fecha) => handleDate(row, fecha)}
                        className={cn(
                          "h-7 w-auto rounded-md border-transparent bg-transparent px-1 py-0 text-xs dark:border-transparent dark:bg-transparent",
                          !dateDisabled && "hover:border-border focus:border-border focus-visible:border-border",
                          dateDisabled && "cursor-not-allowed opacity-40 disabled:opacity-40"
                        )}
                      />
                    </td>

                    <td className="min-w-[150px] px-3 py-1.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild disabled={!row.nextAction}>
                          <button
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs transition-colors",
                              row.nextAction ? "hover:bg-muted/60" : "opacity-40"
                            )}
                          >
                            {owner ? (
                              <span className="truncate">{owner.name}</span>
                            ) : (
                              <span className="text-muted-foreground">Sin asignar</span>
                            )}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          <DropdownMenuItem
                            className="text-xs text-muted-foreground"
                            onSelect={() => handleOwner(row, null)}
                          >
                            Sin asignar
                          </DropdownMenuItem>
                          {teamMembers.map((member) => (
                            <DropdownMenuItem
                              key={member.id}
                              className="text-xs"
                              onSelect={() => handleOwner(row, member.id)}
                            >
                              {member.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>

                    <td className="min-w-[200px] px-3 py-1.5">
                      <NotesCell
                        key={`${row.leadId}-${row.nextActionNotes ?? ""}`}
                        value={row.nextActionNotes}
                        disabled={!row.nextAction}
                        onCommit={(notes) => handleNotes(row, notes)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginado */}
      {result.total > result.pageSize && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            {from}–{to} de {result.total}
          </span>
          <Button
            size="icon"
            variant="outline"
            aria-label="Página anterior"
            disabled={result.page <= 1 || isPending}
            onClick={() => setPage(result.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Página siguiente"
            disabled={result.page >= lastPage || isPending}
            onClick={() => setPage(result.page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <LeadDetailDrawer
        row={selected}
        catalog={catalog}
        teamMembers={teamMembers}
        zona={zonaDeLaOrganizacion}
        onClose={() => setSelectedId(null)}
      />

      <ManageFollowUpOptionsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        catalog={catalog}
        onCatalogChange={setCatalog}
      />
    </div>
  );
}

/** Nota del próximo paso: se escribe en la celda y se guarda al salir. */
function NotesCell({
  value,
  disabled,
  onCommit,
}: {
  value: string | null;
  disabled?: boolean;
  onCommit: (notes: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");

  return (
    <input
      value={draft}
      disabled={disabled}
      placeholder={disabled ? "" : "Contexto…"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value ?? "");
      }}
      className={cn(
        "h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-xs",
        !disabled && "hover:border-border focus:border-border focus:outline-none",
        disabled && "cursor-not-allowed opacity-40"
      )}
    />
  );
}
