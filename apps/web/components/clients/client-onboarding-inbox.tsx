"use client";

/**
 * El link general del onboarding y su bandeja «sin asignar».
 *
 * ⭐ Es el pedido del audio: «si no está creado el cliente, que se cree con el
 * formulario… y después decir, bueno, esta ficha pertenece al cliente». El
 * link general lo puede completar cualquiera; lo que llega espera acá hasta
 * que alguien del equipo dice de qué cliente es (o crea uno nuevo con ese
 * envío). No crea clientes solo: un envío de prueba o repetido sería un
 * cliente fantasma en la cartera.
 *
 * Va arriba de la tabla de clientes, y sólo con el add-on `growth_partners`.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from "@ai-coo/ui";
import {
  ChevronDown,
  ClipboardCheck,
  Copy,
  Inbox,
  Link2,
  Loader2,
  Trash2,
  Unlink,
  UserPlus,
} from "lucide-react";
import {
  assignOnboardingSubmissionAction,
  createGeneralOnboardingLinkAction,
  discardOnboardingSubmissionAction,
  getGeneralOnboardingAction,
  revokeOnboardingLinkAction,
  type GeneralOnboarding,
} from "@/app/clients/onboarding-link-actions";
import { listFieldDefinitionsAction } from "@/app/clients/custom-field-actions";
import { listSubClientsAction } from "@/app/clients/sub-client-actions";
import { RespuestasDelEnvio } from "@/components/clients/sub-client-onboarding";
import { onboardingFormPath, type OnboardingSubmission } from "@/lib/client-onboarding/links";
import type { SubClient } from "@/lib/clients/sub-clients";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion, leerConMotivo, type Lectura } from "@/lib/client/correr-accion";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import type { Client } from "@/types/clients";
import type { FieldDefinition } from "@/types/custom-fields";

const CONTROL_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

/** Valor del selector para «crear uno nuevo». No choca con un uuid. */
const NUEVO = "__nuevo";

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

/**
 * El link general y la bandeja, o el motivo si no se pudieron leer (SCRUM-516).
 * Antes una falla se mostraba como "sin link y sin envíos".
 */
export function cargarBandejaDeOnboarding(): Promise<Lectura<GeneralOnboarding>> {
  return leerConMotivo(getGeneralOnboardingAction, "[ClientOnboardingInbox] bandeja");
}

/**
 * Los creadores de un growth partner, o el motivo si no se pudieron leer.
 * Antes una falla se mostraba como "no tiene creadores" y el envío se asignaba
 * a uno nuevo, duplicado.
 */
export function cargarCreadores(clientId: string): Promise<Lectura<SubClient[]>> {
  return leerConMotivo(
    () => listSubClientsAction(clientId),
    "[ClientOnboardingInbox] creadores"
  );
}

/**
 * Si el botón «Asignar» está habilitado. Con un cliente existente hace falta
 * haber leído sus creadores (SCRUM-516): si la lectura falló, el envío iría a
 * un creador nuevo y duplicaría al que ya existe. Con un cliente nuevo no hay
 * creadores que leer.
 */
export function sePuedeAsignar(estado: {
  clientId: string;
  newClientName: string;
  subClientId: string;
  newSubName: string;
  creadoresError: string | null;
}): boolean {
  const esNuevo = estado.clientId === NUEVO;
  return (
    (esNuevo
      ? estado.newClientName.trim() !== ""
      : estado.clientId !== "" && estado.creadoresError === null) &&
    (estado.subClientId !== NUEVO || estado.newSubName.trim() !== "")
  );
}

export function ClientOnboardingInbox({
  clients,
  onAssigned,
}: {
  clients: Client[];
  /** Se asignó un envío (y quizás se creó un cliente): recargar la lista. */
  onAssigned: () => void;
}) {
  const { push } = useToast();
  const [data, setData] = useState<GeneralOnboarding | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [bandeja, setBandeja] = useState(false);

  const cargar = useCallback(async () => {
    const lectura = await cargarBandejaDeOnboarding();
    if (lectura.ok) {
      setData(lectura.data);
      setMotivo(null);
    } else {
      setMotivo(lectura.motivo);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (data === null) {
    return motivo ? (
      <AvisoDeLecturaFallida titulo="No se pudo cargar el onboarding para clientes nuevos." motivo={motivo} />
    ) : null;
  }

  const url =
    data.link && typeof window !== "undefined"
      ? `${window.location.origin}${onboardingFormPath(data.link.token)}`
      : null;

  const generar = async () => {
    setWorking(true);
    await correrMutacion({
      accion: createGeneralOnboardingLinkAction,
      alExito: (link) => setData((d) => ({ pending: d?.pending ?? [], link })),
      avisar: push,
      tituloError: "No se pudo generar el link",
      etiqueta: "[ClientOnboardingInbox] generar link",
    });
    setWorking(false);
  };

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      push({ title: "No se pudo copiar", description: url });
    }
  };

  const revocar = async () => {
    if (!data.link) return;
    if (
      !window.confirm(
        "¿Desactivar el link general? Quien lo tenga ya no va a poder abrirlo. Lo que llegó sigue en la bandeja."
      )
    ) {
      return;
    }
    const linkId = data.link.id;
    setWorking(true);
    await correrMutacion({
      accion: () => revokeOnboardingLinkAction(linkId),
      alExito: () => setData((d) => ({ pending: d?.pending ?? [], link: null })),
      avisar: push,
      tituloError: "No se pudo desactivar",
      etiqueta: "[ClientOnboardingInbox] desactivar link",
    });
    setWorking(false);
  };

  const quitar = (id: string) =>
    setData((d) => (d ? { ...d, pending: d.pending.filter((e) => e.id !== id) } : d));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium">Onboarding para clientes nuevos</p>
        <p className="text-xs text-muted-foreground">
          Un link para quien todavía no está cargado. Lo que responda queda acá
          hasta que digas de qué cliente es.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {data.pending.length > 0 ? (
          <Button size="sm" className="gap-1.5" onClick={() => setBandeja(true)}>
            <Inbox className="h-4 w-4" />
            {data.pending.length === 1 ? "1 sin asignar" : `${data.pending.length} sin asignar`}
          </Button>
        ) : null}

        {data.link ? (
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={copiar}>
              {copiado ? <ClipboardCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? "Copiado" : "Copiar link"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0"
              title="Desactivar el link general"
              onClick={revocar}
              disabled={working}
            >
              <Unlink className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={generar} disabled={working}>
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Generar link general
          </Button>
        )}
      </div>

      {bandeja ? (
        <Bandeja
          pending={data.pending}
          clients={clients}
          onClose={() => setBandeja(false)}
          onResolved={(id, asignado) => {
            quitar(id);
            if (asignado) onAssigned();
          }}
        />
      ) : null}
    </div>
  );
}

function Bandeja({
  pending,
  clients,
  onClose,
  onResolved,
}: {
  pending: OnboardingSubmission[];
  clients: Client[];
  onClose: () => void;
  onResolved: (id: string, asignado: boolean) => void;
}) {
  const [fields, setFields] = useState<FieldDefinition[]>([]);

  // Sólo para mostrar las respuestas con la etiqueta de cada opción.
  useEffect(() => {
    listFieldDefinitionsAction("client").then(setFields).catch(() => setFields([]));
  }, []);

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Onboardings sin asignar</DialogTitle>
          <DialogDescription>
            Llegaron por el link general. Asignalos a un cliente para que las
            respuestas caigan en la ficha de su creador.
          </DialogDescription>
        </DialogHeader>

        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No queda nada por asignar.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((envio) => (
              <EnvioSinAsignar
                key={envio.id}
                envio={envio}
                clients={clients}
                fields={fields}
                onResolved={(asignado) => onResolved(envio.id, asignado)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EnvioSinAsignar({
  envio,
  clients,
  fields,
  onResolved,
}: {
  envio: OnboardingSubmission;
  clients: Client[];
  fields: FieldDefinition[];
  onResolved: (asignado: boolean) => void;
}) {
  const { push } = useToast();
  const [verRespuestas, setVerRespuestas] = useState(false);
  const [clientId, setClientId] = useState<string>("");
  const [newClientName, setNewClientName] = useState(envio.respondentName ?? "");
  const [creadores, setCreadores] = useState<SubClient[] | null>(null);
  // Si no se pudieron leer los creadores, no se asigna: el envío iría a un
  // creador nuevo y duplicaría al que ya existe.
  const [creadoresError, setCreadoresError] = useState<string | null>(null);
  const [subClientId, setSubClientId] = useState<string>(NUEVO);
  const [newSubName, setNewSubName] = useState(envio.creatorName ?? "");
  const [saving, setSaving] = useState(false);

  const ordenados = [...clients].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const esNuevo = clientId === NUEVO;

  // Los creadores del growth partner elegido, para poder sumar el envío a uno
  // que ya existe en vez de duplicarlo.
  useEffect(() => {
    setCreadores(null);
    setCreadoresError(null);
    setSubClientId(NUEVO);
    if (!clientId || clientId === NUEVO) return;
    let vivo = true;
    void cargarCreadores(clientId).then((lectura) => {
      if (!vivo) return;
      if (!lectura.ok) {
        setCreadoresError(lectura.motivo);
        return;
      }
      const lista = lectura.data;
      setCreadores(lista);
      const mismo = lista.find(
        (s) => s.name.trim().toLowerCase() === (envio.creatorName ?? "").trim().toLowerCase()
      );
      if (mismo) setSubClientId(mismo.id);
    });
    return () => {
      vivo = false;
    };
  }, [clientId, envio.creatorName]);

  const puedeAsignar = sePuedeAsignar({
    clientId,
    newClientName,
    subClientId,
    newSubName,
    creadoresError,
  });

  const asignar = async () => {
    setSaving(true);
    let asignado = false;
    await correrMutacion({
      accion: () =>
        assignOnboardingSubmissionAction({
          submissionId: envio.id,
          clientId: esNuevo ? null : clientId,
          newClientName: esNuevo ? newClientName : null,
          subClientId: subClientId === NUEVO ? null : subClientId,
          newSubClientName: subClientId === NUEVO ? newSubName : null,
        }),
      alExito: () => {
        asignado = true;
      },
      avisar: push,
      tituloError: "No se pudo asignar",
      etiqueta: "[ClientOnboardingInbox] asignar",
    });
    setSaving(false);
    if (!asignado) return;
    push({ title: "Onboarding asignado", variant: "success" });
    onResolved(true);
  };

  const descartar = async () => {
    if (!window.confirm("¿Descartar este envío? Sale de la bandeja y no se asigna a nadie.")) {
      return;
    }
    setSaving(true);
    let descartado = false;
    await correrMutacion({
      accion: () => discardOnboardingSubmissionAction(envio.id),
      alExito: () => {
        descartado = true;
      },
      avisar: push,
      tituloError: "No se pudo descartar",
      etiqueta: "[ClientOnboardingInbox] descartar",
    });
    setSaving(false);
    if (descartado) onResolved(false);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3 dark:border-white/[0.08]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{envio.creatorName ?? "Sin nombre de creador"}</p>
          <p className="text-xs text-muted-foreground">
            Lo completó {envio.respondentName ?? "alguien"} el {fecha(envio.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setVerRespuestas((v) => !v)}
          >
            Respuestas
            <ChevronDown className={cn("h-3 w-3 transition-transform", verRespuestas && "rotate-180")} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Descartar"
            onClick={descartar}
            disabled={saving}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {verRespuestas ? (
        <div className="max-h-72 overflow-y-auto rounded-md bg-muted/40 p-3 dark:bg-white/[0.03]">
          <RespuestasDelEnvio envio={envio} fields={fields} />
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Cliente (growth partner)</Label>
          <select
            className={CONTROL_CLASS}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          >
            <option value="">Elegí un cliente…</option>
            <option value={NUEVO}>+ Cliente nuevo</option>
            {ordenados.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          {esNuevo ? (
            <Input
              value={newClientName}
              maxLength={200}
              placeholder="Nombre del cliente nuevo"
              onChange={(event) => setNewClientName(event.target.value)}
            />
          ) : null}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Creador</Label>
          <select
            className={CONTROL_CLASS}
            value={subClientId}
            disabled={clientId === "" || (!esNuevo && creadores === null)}
            onChange={(event) => setSubClientId(event.target.value)}
          >
            <option value={NUEVO}>+ Creador nuevo</option>
            {(creadores ?? []).map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
          {creadoresError ? (
            <AvisoDeLecturaFallida titulo="No se pudieron cargar sus creadores." motivo={creadoresError} />
          ) : null}
          {subClientId === NUEVO ? (
            <Input
              value={newSubName}
              maxLength={200}
              placeholder="Nombre del creador"
              onChange={(event) => setNewSubName(event.target.value)}
            />
          ) : null}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={asignar} disabled={!puedeAsignar || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Asignar
        </Button>
      </div>
    </div>
  );
}
