"use client";

/**
 * La lista de clientes — el tablero de **entrega**.
 *
 * ⭐ Responde una sola pregunta, de un vistazo: **dónde está parado cada cliente
 * y qué le falta**. Etapa, próxima tarea con su fecha límite, objetivo y cuánto
 * le queda para cerrar la etapa.
 *
 * Lo financiero (plan, días de programa, pago, adeudado, monto) se mudó a
 * `/sales/cobros` el 2026-09-11. Mezclarlos hacía que la tabla respondiera dos
 * preguntas a medias, y son preguntas que muchas veces hacen dos personas
 * distintas.
 *
 * ⭐ Los filtros se arman con los datos, no con el catálogo. Medido en
 * producción el 2026-09-21: 306 de 307 clientes en «Activo», cero en
 * «Onboarding hecho», cero en «Caso de éxito». Una fila de cinco pastillas para
 * filtrar una dimensión donde el 99,7% es un solo valor no filtra nada, y la
 * columna «Estado» que decía «Activo» 306 veces tampoco. Los estados siguen
 * existiendo —una organización que recién carga clientes va a ver «Pendiente de
 * onboarding (12)»—, pero una pastilla sólo aparece cuando hay alguien detrás.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  StaggerFade,
  StaggerFadeItem,
} from "@ai-coo/ui";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  ChevronDown,
  HelpCircle,
  CalendarClock,
  Hourglass,
  MoonStar,
  Receipt,
  Route,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Trash2,
  Trophy,
} from "lucide-react";
import { deleteClientAction } from "@/app/clients/actions";
import { correrMutacion } from "@/lib/client/correr-accion";
import { toggleClientTaskAction } from "@/app/clients/task-actions";
import { getClientsDiscordActivityAction } from "@/app/discord/actions";
import type { ClientActivity } from "@/lib/discord/activity";
import {
  getClientsBoardAction,
  type ClientsBoardData,
} from "@/app/clients/clients-board-actions";
import {
  isConfirmedResolution,
  type LastOneOnOne,
} from "@/lib/fathom/one-on-one-types";
import { ACCION_DE_FILA } from "@/components/clients/ficha-section";
import { FilterPills } from "@/components/marketing/filter-pills";
import { isOverdue } from "@/lib/clients/next-task";
import { useHoyDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import {
  formatPeriodShort,
  formatRevenue,
  type RevenueSummary,
} from "@/lib/clients/revenue";
import {
  ETIQUETAS_DE_SATISFACCION,
  type NivelDeSatisfaccion,
} from "@/lib/clients/satisfaction";
import type { ClientTask } from "@/types/client-tasks";
import { FieldValueCell } from "@/components/clients/custom-fields/field-value-cell";
import { paths } from "@/routes";
import { usePlatformData } from "@/providers";
import { useToast } from "@/providers/toast-provider";
import type { Client, ClientStatus } from "@/types/clients";
import type { ClientJourneyStatus } from "@/types/checkpoints";
import { activeFields, fieldOptionColorVar } from "@/lib/custom-fields";
import { useHasAddOn, useModuleAccess } from "@/providers/permissions-provider";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ImportClientsDialog } from "@/components/clients/import-clients-dialog";
import { cn } from "@/lib/utils";
import { getClientSignalsAction, type ClientSignals } from "@/app/clients/signals-actions";
import { ACTIVITY_SOURCE_LABEL } from "@/lib/clients/signals";
import { textoDelAviso } from "@/lib/custom-fields/date-alert";
import { ClientOnboardingInbox } from "@/components/clients/client-onboarding-inbox";

/**
 * Los estados que **vale la pena señalar** en la fila, con su etiqueta.
 *
 * «Activo» no está a propósito: es el estado normal de un cliente en programa,
 * y una etiqueta que dice lo normal en cada fila es ruido. Lo que se marca es
 * la excepción: el que todavía no arrancó y el que ya es caso de éxito.
 */
const STATUS_DESTACADO: Partial<Record<ClientStatus, { label: string; filtro: string }>> = {
  pending_onboarding: { label: "Pendiente de onboarding", filtro: "Pendientes de onboarding" },
  onboarding_done: { label: "Onboarding hecho", filtro: "Onboarding hecho" },
  success_case: { label: "Caso de éxito", filtro: "Casos de éxito" },
};

type ClientListFilter =
  | ClientStatus
  | "all"
  | "stalled"
  | "silent"
  /** En riesgo o disconforme: los que hay que mirar esta semana. */
  | "attention"
  /** Growth partners: hace N días que no hay novedades del cliente. */
  | "no_news"
  /** Growth partners: una fecha con aviso de uno de sus creadores se acerca. */
  | "dates";

/** Los niveles que piden atención. El resto no necesita que nadie haga nada hoy. */
const SATISFACCION_EN_ALERTA: readonly string[] = ["en_riesgo", "disconforme"];

type ClientListSort = "recent" | "name" | "last_one_on_one";

const SORT_LABEL: Record<ClientListSort, string> = {
  recent: "Más recientes",
  name: "Nombre A–Z",
  last_one_on_one: "Última 1-1",
};

const EMPTY_BOARD: ClientsBoardData = {
  journey: {},
  checkpoints: [],
  checkpointFields: [],
  clientFields: [],
  lastOneOnOne: {},
  nextTask: {},
  revenue: {},
  manualStages: {},
};

/** Normaliza para buscar: sin tildes, sin mayúsculas. «Gómez» encuentra «gomez». */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ── Diálogo de confirmación de eliminación ─────────────────────────────────

function DeleteClientDialog({
  client,
  onConfirm,
  onCancel,
  pending,
}: {
  client: Client;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar cliente</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          ¿Estás seguro que querés eliminar a{" "}
          <span className="font-medium text-foreground">{client.name}</span>? Esta acción no se puede deshacer.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function ClientsList({ clients }: { clients: Client[] }) {
  const { refreshClients } = usePlatformData();
  const { push } = useToast();
  const router = useRouter();
  const [filter, setFilter] = useState<ClientListFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ClientListSort>("recent");
  /**
   * ⭐ Quién puede gestionar clientes: el fundador **o** cualquiera cuyo rol
   * tenga acceso total al módulo.
   *
   * Antes esto miraba sólo `isFounder`, así que un miembro con un rol que le
   * daba "acceso total a Clientes" entraba y veía una lista pelada: sin planes,
   * sin revisión semanal, sin wins, sin recorrido y sin campos. El permiso
   * existía, se podía configurar, y no servía para nada.
   *
   * Un permiso que la pantalla ignora es peor que no tenerlo: hace creer que el
   * acceso está dado. `useModuleAccess` ya devuelve "full" para el fundador,
   * así que alcanza con preguntar una sola cosa.
   */
  const puedeGestionar = useModuleAccess("clients") === "full";
  /** ¿Puede además ver los cobros? El atajo no se ofrece si no va a poder entrar. */
  const puedeVerCobros = useModuleAccess("sales") !== "none";

  /** D2 · Actividad en Discord por cliente, para la señal de silencio. */
  const [discordActivity, setDiscordActivity] = useState<Record<string, ClientActivity>>({});
  const [board, setBoard] = useState<ClientsBoardData>(EMPTY_BOARD);
  /** Growth partners: sin novedades y fechas cercanas de sus creadores. */
  const [signals, setSignals] = useState<ClientSignals | null>(null);
  const [, startLoad] = useTransition();
  const [pending, startTransition] = useTransition();

  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  /**
   * El tablero se vuelve a pedir cada vez que cambia la lista de clientes.
   *
   * ⭐ De ahí que los handlers llamen sólo a `refreshClients()`: eso trae una
   * lista nueva del servidor, cambia la identidad del arreglo y este efecto
   * vuelve a correr. Pedir el tablero además a mano sería el mismo fetch dos
   * veces por cada check marcado.
   */
  useEffect(() => {
    startLoad(async () => {
      const [boardData, activity, senales] = await Promise.all([
        getClientsBoardAction(),
        getClientsDiscordActivityAction(),
        // Sin el add-on devuelve vacío: no hace falta preguntar antes.
        getClientSignalsAction().catch(() => null),
      ]);
      setBoard(boardData);
      setDiscordActivity(activity);
      setSignals(senales);
    });
  }, [clients]);

  const {
    journey,
    clientFields,
    lastOneOnOne,
    nextTask,
    revenue,
    manualStages,
  } = board;

  /**
   * Las columnas configurables que se muestran en la tabla.
   *
   * ⭐ Son las que la organización configuró, no una lista fija: si configuró
   * sólo "Objetivo general", se ve una columna; si configuró tres, tres. La
   * tabla la decide la configuración, igual que en el tracker de wins.
   */
  /**
   * ⭐ Sólo las columnas marcadas para la tabla. Con la plantilla de Marketing,
   * Ventas y Sistemas cargada son 22 campos: dibujarlos todos convertiría la
   * lista en una planilla de 25 columnas. Se prenden de a una desde Campos
   * personalizados.
   */
  /*
    Las de un apartado (Marketing, Ventas, Sistemas) tampoco: con el add-on
    `growth_partners` se cargan en cada cliente del cliente, no en la fila, y
    sin él los apartados no existen.
  */
  const customColumns = useMemo(
    () =>
      activeFields(clientFields).filter(
        (field) => field.showInTable && field.section === null
      ),
    [clientFields]
  );
  /** La facturación del negocio del cliente es del add-on `growth_partners`. */
  const growthPartners = useHasAddOn("growth_partners");

  /** Nombre de cada fase, para la etiqueta de la fase fijada a mano. */
  const stageNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of Object.values(journey)) {
      if (entry.currentStageId && entry.currentStageName) {
        map.set(entry.currentStageId, entry.currentStageName);
      }
    }
    return map;
  }, [journey]);

  /** ¿Hay recorrido configurado? Sin él, sus columnas no se muestran. */
  const hasJourney = Object.keys(journey).length > 0;

  /**
   * Cuántos clientes hay detrás de cada filtro posible.
   *
   * ⭐ Es lo que decide qué pastillas se dibujan: una con cero atrás no aparece.
   * Y el número va en la pastilla porque es la respuesta a la pregunta que
   * hace que alguien la toque: "¿cuántos están trabados?".
   */
  const conteos = useMemo(() => {
    const porEstado: Partial<Record<ClientStatus, number>> = {};
    let stalled = 0;
    let silent = 0;
    let attention = 0;
    let noNews = 0;
    let dates = 0;
    for (const client of clients) {
      if (signals?.silence[client.id]?.isSilent) noNews += 1;
      if (signals?.dateAlerts[client.id]?.length) dates += 1;
      porEstado[client.status] = (porEstado[client.status] ?? 0) + 1;
      if (journey[client.id]?.stalled) stalled += 1;
      if (discordActivity[client.id]?.isSilent) silent += 1;
      if (client.satisfaction && SATISFACCION_EN_ALERTA.includes(client.satisfaction)) {
        attention += 1;
      }
    }
    return { porEstado, stalled, silent, attention, noNews, dates };
  }, [clients, journey, discordActivity, signals]);

  const filtros = useMemo(() => {
    const lista: { value: ClientListFilter; label: string }[] = [
      { value: "all", label: `Todos (${clients.length})` },
    ];
    // Primero lo que pide acción: un cliente en riesgo es más urgente que
    // cualquier corte por estado.
    if (conteos.attention > 0) {
      lista.push({ value: "attention", label: `Atención (${conteos.attention})` });
    }
    if (conteos.dates > 0) {
      lista.push({ value: "dates", label: `Fechas cerca (${conteos.dates})` });
    }
    if (conteos.noNews > 0) {
      lista.push({ value: "no_news", label: `Sin novedades (${conteos.noNews})` });
    }
    if (conteos.stalled > 0) {
      lista.push({ value: "stalled", label: `Trabados (${conteos.stalled})` });
    }
    if (conteos.silent > 0) {
      lista.push({ value: "silent", label: `En silencio (${conteos.silent})` });
    }
    for (const [status, def] of Object.entries(STATUS_DESTACADO)) {
      const n = conteos.porEstado[status as ClientStatus] ?? 0;
      if (n > 0) lista.push({ value: status as ClientStatus, label: `${def.filtro} (${n})` });
    }
    return lista;
  }, [clients.length, conteos]);

  // Si el filtro elegido se quedó sin gente (se borró el último), vuelve a Todos.
  useEffect(() => {
    if (!filtros.some((f) => f.value === filter)) setFilter("all");
  }, [filtros, filter]);

  const visibles = useMemo(() => {
    const q = normalizar(query);
    const lista = clients.filter((client) => {
      if (filter === "stalled" && !journey[client.id]?.stalled) return false;
      if (filter === "silent" && !discordActivity[client.id]?.isSilent) return false;
      if (filter === "no_news" && !signals?.silence[client.id]?.isSilent) return false;
      if (filter === "dates" && !signals?.dateAlerts[client.id]?.length) return false;
      if (
        filter === "attention" &&
        !(client.satisfaction && SATISFACCION_EN_ALERTA.includes(client.satisfaction))
      ) {
        return false;
      }
      if (!["all", "stalled", "silent", "attention", "no_news", "dates"].includes(filter)) {
        if (client.status !== filter) return false;
      }
      if (q) {
        const pajar = normalizar(
          [client.name, client.nickname, client.email, client.offeredProduct]
            .filter(Boolean)
            .join(" ")
        );
        if (!pajar.includes(q)) return false;
      }
      return true;
    });

    const porNombre = (a: Client, b: Client) => a.name.localeCompare(b.name, "es");
    if (sort === "name") return lista.sort(porNombre);
    if (sort === "last_one_on_one") {
      // Los que tienen sesión, de la más reciente a la más vieja; los que no, al
      // final por nombre: un guion no es "más viejo", es "no hay".
      return lista.sort((a, b) => {
        const da = lastOneOnOne[a.id]?.date ?? "";
        const db = lastOneOnOne[b.id]?.date ?? "";
        if (da !== db) return db.localeCompare(da);
        return porNombre(a, b);
      });
    }
    return lista.sort((a, b) => {
      const d = b.joinDate.localeCompare(a.joinDate);
      return d !== 0 ? d : porNombre(a, b);
    });
  }, [clients, filter, query, sort, journey, discordActivity, lastOneOnOne, signals]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      await correrMutacion({
        accion: () => deleteClientAction(target.id),
        alExito: async () => {
          await refreshClients();
          push({ title: `Cliente "${target.name}" eliminado`, variant: "success" });
        },
        avisar: push,
        tituloError: "No se pudo eliminar el cliente",
        etiqueta: "[ClientsList] eliminar cliente",
      });
    });
  };

  /**
   * Dar por hecha la próxima tarea desde la tabla.
   *
   * ⭐ Es el reemplazo del check que antes marcaba un hito del recorrido. La
   * diferencia importa: un hito es del catálogo y vale para todos; esto es lo
   * que vos decidiste para este cliente, y es lo único que tiene sentido tildar
   * sin abrir la ficha.
   */
  function marcarTareaHecha(task: ClientTask | undefined) {
    if (!task) return;
    startTransition(async () => {
      const result = await toggleClientTaskAction({ taskId: task.id, done: true });
      if (!result.success) {
        push({ title: "No se pudo marcar", description: result.error });
        return;
      }
      await refreshClients();
      push({ title: "Tarea completada", variant: "success" });
    });
  }

  const abrirFicha = (client: Client) => router.push(paths.platform.clients.detail(client.id));

  return (
    <div className="space-y-4">
      {/* ── Barra: acciones a la izquierda, atajos y configuración a la derecha ── */}
      {puedeGestionar ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <NewClientDialog />
            <ImportClientsDialog />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={paths.platform.clients.weeklyReview}>
                <CalendarCheck className="h-4 w-4" />
                Revisión semanal
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={paths.platform.clients.wins}>
                <Trophy className="h-4 w-4" />
                Wins
              </Link>
            </Button>
            {/*
              ⭐ El atajo a Cobros existe porque el monto y el adeudado se
              mostraban acá hasta hoy. Sin él, quien los buscaba en esta tabla
              concluiría que se perdieron.
            */}
            {puedeVerCobros ? (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href={paths.platform.sales.cobros}>
                  <Receipt className="h-4 w-4" />
                  Cobros
                </Link>
              </Button>
            ) : null}
            {/*
              C0 · Único acceso a la configuración de columnas configurables y
              del recorrido. Va acá y no en el grupo "Configuración" de la
              navegación: la barra superior saltea ese grupo entero, así que
              desde el escritorio no se llegaba. Agrupado en un menú porque
              configurar no es algo que se haga todos los días, y dos botones
              más en la barra la convertían en una hilera de siete.
            */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  Configurar
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={paths.platform.clients.checkpoints} className="gap-2">
                    <Route className="h-4 w-4" />
                    Recorrido del cliente
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={paths.platform.clients.customFields} className="gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    Campos personalizados
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : null}

      {/*
        ⭐ El link general del onboarding y lo que llegó por él sin asignar.
        Sólo con el add-on `growth_partners`.
      */}
      {growthPartners && puedeGestionar ? (
        <ClientOnboardingInbox clients={clients} onAssigned={() => void refreshClients()} />
      ) : null}

      {/* ── Buscar, filtrar, ordenar ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, apodo, mail o producto"
            aria-label="Buscar clientes"
            className="h-9 pl-9"
          />
        </div>

        {/* Una sola pastilla («Todos») no es un filtro: no se dibuja. */}
        {filtros.length > 1 ? (
          <div className="max-w-full overflow-x-auto">
            <FilterPills
              options={filtros.map((f) => ({ value: f.value, label: f.label }))}
              value={filter}
              onChange={(value) => setFilter(value as ClientListFilter)}
            />
          </div>
        ) : null}

        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Ordenar
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            value={sort}
            onChange={(event) => setSort(event.target.value as ClientListSort)}
          >
            {(Object.keys(SORT_LABEL) as ClientListSort[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="whitespace-nowrap px-4 py-3 font-medium">Cliente</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Próxima tarea</th>
              {hasJourney ? (
                <th className="whitespace-nowrap px-4 py-3 font-medium">Etapa</th>
              ) : null}
              <th className="whitespace-nowrap px-4 py-3 font-medium">Satisfacción</th>
              {growthPartners ? (
                <th className="whitespace-nowrap px-4 py-3 font-medium">Facturación</th>
              ) : null}
              <th className="whitespace-nowrap px-4 py-3 font-medium">Última 1-1</th>
              {customColumns.map((field) => (
                <th key={field.id} className="whitespace-nowrap px-4 py-3 font-medium">
                  {field.label}
                </th>
              ))}
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <StaggerFade as="tbody">
            {visibles.map((client) => {
              const status = journey[client.id];
              const destacado = STATUS_DESTACADO[client.status];
              const silencio = discordActivity[client.id];
              const sinNovedades = signals?.silence[client.id];
              const fechas = signals?.dateAlerts[client.id] ?? [];
              return (
                <StaggerFadeItem
                  as="tr"
                  key={client.id}
                  /*
                    ⭐ La fila entera abre la ficha. Antes el único camino era
                    un link de once píxeles al final de la fila; en una tabla
                    de 264 filas eso es apuntar con el mouse 264 veces. Los
                    controles de adentro (el check, la papelera) frenan la
                    propagación para no abrir la ficha de rebote.
                  */
                  className="group cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40"
                  onClick={() => abrirFicha(client)}
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={paths.platform.clients.detail(client.id)}
                        className="font-medium hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {client.name}
                      </Link>
                      {client.nickname ? (
                        <span className="text-xs text-muted-foreground">{client.nickname}</span>
                      ) : null}
                      {client.isSuccessCase ? (
                        <Star
                          className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                          aria-label="Caso de éxito"
                        />
                      ) : destacado ? (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {destacado.label}
                        </Badge>
                      ) : null}
                      {/* D2 · Silencio en Discord, al lado del nombre: es del cliente, no de un estado. */}
                      {silencio?.isSilent ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-warning/40 px-1.5 py-0.5 text-[10px] text-warning"
                          title={`Sin escribir en Discord hace ${silencio.daysSinceLastMessage} días`}
                        >
                          <MoonStar className="h-2.5 w-2.5" />
                          {silencio.daysSinceLastMessage}d
                        </span>
                      ) : null}
                      {/*
                        ⭐ Growth partners: sin novedades de ningún tipo (no
                        sólo Discord) desde hace el umbral de la organización.
                      */}
                      {sinNovedades?.isSilent ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-1.5 py-0.5 text-[10px] text-destructive"
                          title={`Sin novedades hace ${sinNovedades.days} días. La última fue ${
                            ACTIVITY_SOURCE_LABEL[sinNovedades.source] ?? sinNovedades.source
                          }.`}
                        >
                          <Hourglass className="h-2.5 w-2.5" />
                          Sin novedades {sinNovedades.days}d
                        </span>
                      ) : null}
                      {fechas.length > 0 ? (
                        <span
                          className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary"
                          title={fechas
                            .map(
                              (f) =>
                                `${f.fieldLabel} de ${f.subClientName}: ${textoDelAviso(f.aviso)}`
                            )
                            .join("\n")}
                        >
                          <CalendarClock className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">
                            {fechas[0]!.fieldLabel} · {fechas[0]!.subClientName} ·{" "}
                            {textoDelAviso(fechas[0]!.aviso)}
                            {fechas.length > 1 ? ` (+${fechas.length - 1})` : ""}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <NextTaskCell
                      task={nextTask[client.id]}
                      disabled={pending}
                      canCheck={puedeGestionar}
                      onCheck={() => marcarTareaHecha(nextTask[client.id])}
                    />
                  </td>

                  {hasJourney ? (
                    <td className="px-4 py-3">
                      <StageCell
                        status={status}
                        manualStageName={
                          manualStages[client.id]
                            ? stageNameById.get(manualStages[client.id]!) ?? null
                            : null
                        }
                      />
                    </td>
                  ) : null}

                  <td className="px-4 py-3">
                    <SatisfaccionCell level={client.satisfaction} />
                  </td>

                  {growthPartners ? (
                    <td className="px-4 py-3">
                      <FacturacionCell summary={revenue[client.id]} />
                    </td>
                  ) : null}

                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <LastOneOnOneCell entry={lastOneOnOne[client.id]} />
                  </td>

                  {customColumns.map((field) => (
                    <td key={field.id} className="px-4 py-3">
                      <FieldValueCell field={field} value={client.custom?.[field.key]} />
                    </td>
                  ))}

                  <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    {puedeGestionar ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          ACCION_DE_FILA,
                          "h-7 w-7 p-0 hover:text-destructive",
                          // Se ve al pasar por la fila o al llegar con el teclado;
                          // 264 papeleras siempre visibles pesan más que la tabla.
                          "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                        )}
                        title="Eliminar cliente"
                        aria-label={`Eliminar a ${client.name}`}
                        onClick={() => setDeleteTarget(client)}
                        disabled={pending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </td>
                </StaggerFadeItem>
              );
            })}
          </StaggerFade>
        </table>
        {visibles.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {query.trim()
              ? `Ningún cliente coincide con «${query.trim()}».`
              : "No hay clientes con este filtro."}
          </p>
        ) : null}
      </div>

      {/* Confirmación de eliminación */}
      {deleteTarget ? (
        <DeleteClientDialog
          client={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          pending={pending}
        />
      ) : null}

    </div>
  );
}

/**
 * La etapa en la que está el cliente, con cuánto le falta para cerrarla.
 *
 * ⭐ Absorbió la columna «Progreso de etapa», que era una barra en una columna
 * aparte diciendo de la misma fase que esta celda nombraba. Dos columnas para un
 * dato obligan a leer de izquierda a derecha para entender una sola cosa.
 *
 * Un cliente sin ningún hito registrado muestra "Sin empezar", no "Fase 1": no
 * arrancó el recorrido, y decir lo contrario sería inventar. Salvo que alguien
 * haya fijado la fase a mano, que es exactamente el caso que esto resuelve.
 */
function StageCell({
  status,
  manualStageName,
}: {
  status: ClientJourneyStatus | undefined;
  manualStageName: string | null;
}) {
  const nombre = status?.currentStageName ?? manualStageName;

  if (!nombre) {
    return <span className="text-xs text-muted-foreground">Sin empezar</span>;
  }

  const hayProgreso = status && status.stageTotal > 0;
  const completa = hayProgreso && status.stageReached >= status.stageTotal;

  return (
    <div className="min-w-[110px] space-y-1">
      <span className="flex items-center gap-1.5 text-xs">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{
            backgroundColor: status?.currentStageColor
              ? fieldOptionColorVar(status.currentStageColor)
              : undefined,
          }}
        />
        <span className="truncate">{nombre}</span>
      </span>

      {hayProgreso ? (
        <div className="flex items-center gap-1.5">
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={status.stageReached}
            aria-valuemin={0}
            aria-valuemax={status.stageTotal}
            aria-label="Progreso de la etapa"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                completa ? "bg-emerald-500" : "bg-primary"
              )}
              style={{
                width: `${Math.round((status.stageReached / status.stageTotal) * 100)}%`,
              }}
            />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {status.stageReached}/{status.stageTotal}
          </span>
        </div>
      ) : !status?.currentStageName && manualStageName ? (
        <span className="text-[11px] text-muted-foreground">fijada a mano</span>
      ) : null}
    </div>
  );
}

/**
 * La próxima tarea del cliente: la que alguien escribió o la que salió de una
 * llamada 1-1.
 *
 * ⭐ Antes acá iba el próximo **hito del recorrido**. Son dos cosas distintas y
 * el pedido fue explícito: el recorrido es un catálogo que se define una vez y
 * vale para todos; esto es lo que decidiste para este cliente. Lo que dice qué
 * hacer mañana es lo segundo.
 */
function NextTaskCell({
  task,
  disabled,
  canCheck,
  onCheck,
}: {
  task: ClientTask | undefined;
  disabled: boolean;
  /** Con solo lectura se ve la tarea y su fecha, pero no el check. */
  canCheck: boolean;
  onCheck: () => void;
}) {
  const hoy = useHoyDeLaOrganizacion();

  if (!task) {
    return <span className="text-xs text-muted-foreground">Sin tareas</span>;
  }

  const vencida = hoy !== null && isOverdue(task, hoy);

  return (
    <div className="flex min-w-[170px] items-start gap-2">
      {canCheck ? (
        <button
          type="button"
          onClick={onCheck}
          disabled={disabled}
          title={`Marcar "${task.title}" como hecha`}
          aria-label={`Marcar "${task.title}" como hecha`}
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border text-transparent transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
        >
          <Check className="h-3 w-3" />
        </button>
      ) : null}
      <div className="min-w-0 space-y-0.5">
        <span className="block text-xs">{task.title}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
          <span>{task.owner === "coach" ? "coach" : "cliente"}</span>
          {task.dueDate ? (
            <span className={cn(vencida && "font-medium text-destructive")}>
              {vencida ? (
                <>
                  <AlertTriangle className="mr-0.5 inline h-3 w-3" />
                  venció el {formatearDia(task.dueDate)}
                </>
              ) : (
                `para el ${formatearDia(task.dueDate)}`
              )}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/** `2026-09-21` → `21/09`. Se parte a mano para no correr el día por zona horaria. */
function formatearDia(iso: string): string {
  const [, month, day] = iso.split("-");
  return month && day ? `${day}/${month}` : iso;
}

/**
 * Qué tan conforme está el cliente.
 *
 * ⭐ Reemplaza a la columna «Estado», que decía «Activo» en 306 de 307 filas.
 * Esto es lo que cambia entre un cliente y otro, y lo que hace falta ver de un
 * vistazo para saber a quién llamar.
 */
function SatisfaccionCell({ level }: { level: string | null | undefined }) {
  if (!level || !(level in ETIQUETAS_DE_SATISFACCION)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const nivel = ETIQUETAS_DE_SATISFACCION[level as NivelDeSatisfaccion];
  return (
    <span
      className={cn("whitespace-nowrap text-xs font-medium", nivel.color)}
      title={nivel.descripcion}
    >
      {nivel.label}
    </span>
  );
}

/**
 * La facturación del **negocio del cliente**.
 *
 * ⚠️ No es lo que el cliente nos paga a nosotros: eso vive en Cobros. Esto es
 * lo que el cliente gana, o sea la medida de si el acompañamiento funciona.
 *
 * ⭐ Va con el mes al lado, siempre. Un número de facturación sin fecha se lee
 * como actual, y «12.400» de hace seis meses no dice nada sobre hoy.
 */
function FacturacionCell({ summary }: { summary: RevenueSummary | undefined }) {
  if (!summary?.latest) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const { latest, changePct } = summary;
  const subio = changePct != null && changePct > 0;
  const bajo = changePct != null && changePct < 0;

  return (
    <div className="min-w-[110px] space-y-0.5">
      <span className="flex items-center gap-1.5">
        <span className="text-sm font-medium tabular-nums">
          {formatRevenue(latest.amount, latest.currency)}
        </span>
        {changePct != null ? (
          <span
            className={cn(
              "text-[11px] font-medium tabular-nums",
              subio && "text-success",
              bajo && "text-destructive",
              !subio && !bajo && "text-muted-foreground"
            )}
          >
            {subio ? "+" : ""}
            {changePct}%
          </span>
        ) : null}
      </span>
      <span className="block whitespace-nowrap text-[11px] text-muted-foreground">
        {formatPeriodShort(latest.period)}
      </span>
    </div>
  );
}

/**
 * La fecha de la última sesión 1-1 con el cliente.
 *
 * ⭐ Sale de las grabaciones de Fathom que el clasificador resolvió como
 * **entrega con este cliente**. La llamada de cierre no cuenta: es con un lead y
 * su propósito es venta, así que mostrarla acá diría que hubo una sesión de
 * acompañamiento el día que se firmó el contrato.
 *
 * Cuando el vínculo se resolvió por un peldaño **candidato** —un nombre
 * normalizado, que dos personas pueden compartir— la fecha se muestra igual,
 * pero avisada. Esconderla hasta que alguien confirme dejaría la columna vacía
 * durante semanas; mostrarla sin avisar diría una fecha que puede ser de otra
 * persona.
 */
function LastOneOnOneCell({ entry }: { entry: LastOneOnOne | undefined }) {
  if (!entry) return <span className="text-xs text-muted-foreground">—</span>;

  const [year, month, day] = entry.date.split("-");
  const label = year && month && day ? `${day}/${month}/${year}` : entry.date;
  const confirmed = isConfirmedResolution(entry.resolutionMethod);

  const content = (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {label}
      {/*
        ⭐ El total va pegado a la fecha y no en una columna aparte: solos, "12
        de septiembre" y "7" no dicen nada; juntos dicen si el cliente viene con
        ritmo o si hace rato que no se lo ve.
      */}
      {entry.totalCalls > 1 ? (
        <span
          className="tabular-nums text-muted-foreground"
          title={
            entry.everyDays != null
              ? `${entry.totalCalls} sesiones 1-1, una cada ${entry.everyDays} días`
              : `${entry.totalCalls} sesiones 1-1`
          }
        >
          ·&nbsp;{entry.totalCalls}
        </span>
      ) : null}
      {!confirmed ? (
        <span
          className="text-warning"
          title="Se dedujo por el nombre: puede ser de otra persona. Confirmalo en Llamadas sin asociar."
        >
          <HelpCircle className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  );

  if (!entry.fathomUrl) return content;

  return (
    <a
      href={entry.fathomUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline"
      title={entry.title ?? "Abrir la grabación"}
    >
      {content}
    </a>
  );
}
