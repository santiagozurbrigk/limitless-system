"use client";

/**
 * El link del formulario de onboarding de un cliente de un growth partner.
 *
 * ⭐ Va dentro de la tarjeta «Clientes», arriba de sus solapas: el link es de
 * ese cliente, y lo que responde cae en la solapa «Onboarding» que está justo
 * abajo.
 *
 * Si el cliente vuelve a completar el link, sus respuestas pisan las de la
 * ficha. Por eso el historial muestra cada envío con lo que había antes.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@ai-coo/ui";
import { ClipboardCheck, Copy, ExternalLink, History, Link2, Loader2, Unlink } from "lucide-react";
import {
  createOnboardingLinkAction,
  getOnboardingStatusAction,
  revokeOnboardingLinkAction,
  type OnboardingStatus,
} from "@/app/clients/onboarding-link-actions";
import { ACCION_DE_FILA } from "@/components/clients/ficha-section";
import { onboardingFormPath, type OnboardingSubmission } from "@/lib/client-onboarding/links";
import { findOption } from "@/lib/custom-fields";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion, leerConMotivo, type Lectura } from "@/lib/client/correr-accion";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import { paths } from "@/routes";
import type { FieldDefinition } from "@/types/custom-fields";

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Un valor guardado, como se lee: la etiqueta de la opción y no su clave. */
function comoTexto(value: unknown, field: FieldDefinition | undefined): string {
  if (value === null || value === undefined) return "";
  const lista = Array.isArray(value) ? value : [value];
  return lista
    .map((v) => (field ? (findOption(field.options, v)?.label ?? String(v)) : String(v)))
    .join(", ");
}

/**
 * El link y los envíos del cliente, o el motivo si no se pudieron leer
 * (SCRUM-516). Antes una falla se mostraba como "sin link", con el botón de
 * generar uno.
 */
export function cargarEstadoDelOnboarding(subClientId: string): Promise<Lectura<OnboardingStatus>> {
  return leerConMotivo(
    () => getOnboardingStatusAction(subClientId),
    "[SubClientOnboarding] estado"
  );
}

export function SubClientOnboarding({
  subClient,
  fields,
  onSubmissionSeen,
}: {
  subClient: { id: string; name: string };
  /** Las columnas activas del cliente. */
  fields: FieldDefinition[];
  /** Hay un envío más nuevo que lo que muestra la ficha: recargarla. */
  onSubmissionSeen: () => void;
}) {
  const { push } = useToast();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [historial, setHistorial] = useState(false);

  const preguntas = fields.filter((field) => field.onboarding !== null && field.section !== null);

  const cargar = useCallback(async () => {
    const lectura = await cargarEstadoDelOnboarding(subClient.id);
    if (lectura.ok) {
      setStatus(lectura.data);
      setMotivo(null);
    } else {
      setMotivo(lectura.motivo);
    }
  }, [subClient.id]);

  useEffect(() => {
    setStatus(null);
    setMotivo(null);
    void cargar();
  }, [cargar]);

  if (status === null) {
    return motivo ? (
      <AvisoDeLecturaFallida titulo="No se pudo cargar el formulario de onboarding." motivo={motivo} />
    ) : null;
  }

  if (preguntas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-2.5 text-xs leading-relaxed text-muted-foreground dark:border-white/[0.12]">
        Para mandarle el formulario de onboarding, primero cargá las preguntas en{" "}
        <Link href={paths.platform.clients.customFields} className="text-primary hover:underline">
          Campos personalizados
        </Link>
        .
      </p>
    );
  }

  const url =
    status.link && typeof window !== "undefined"
      ? `${window.location.origin}${onboardingFormPath(status.link.token)}`
      : null;
  const ultimo = status.submissions[0] ?? null;

  const generar = async () => {
    setWorking(true);
    await correrMutacion({
      accion: () => createOnboardingLinkAction(subClient.id),
      alExito: (link) => setStatus((s) => ({ submissions: s?.submissions ?? [], link })),
      avisar: push,
      tituloError: "No se pudo generar el link",
      etiqueta: "[SubClientOnboarding] generar link",
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
    if (!status.link) return;
    if (
      !window.confirm(
        `¿Desactivar el link de ${subClient.name}? Quien lo tenga ya no va a poder abrirlo. Lo que respondió queda guardado.`
      )
    ) {
      return;
    }
    const linkId = status.link.id;
    setWorking(true);
    await correrMutacion({
      accion: () => revokeOnboardingLinkAction(linkId),
      alExito: () => setStatus((s) => ({ submissions: s?.submissions ?? [], link: null })),
      avisar: push,
      tituloError: "No se pudo desactivar",
      etiqueta: "[SubClientOnboarding] desactivar link",
    });
    setWorking(false);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-2.5 text-xs dark:border-white/[0.08]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">Formulario de onboarding</span>
        {status.link ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={copiar}
            >
              {copiado ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiado ? "Copiado" : "Copiar link"}
            </Button>
            {url ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(ACCION_DE_FILA, "h-7 w-7 p-0")}
                title="Abrir el formulario"
                asChild
              >
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(ACCION_DE_FILA, "h-7 w-7 p-0")}
              title="Desactivar el link"
              onClick={revocar}
              disabled={working}
            >
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={generar}
            disabled={working}
          >
            {working ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
            Generar link
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
        <span>
          {ultimo
            ? `Lo completó ${ultimo.respondentName ?? "alguien"} el ${fecha(ultimo.createdAt)}.`
            : status.link
              ? "Todavía no lo completó."
              : `Generá el link y mandáselo a ${subClient.name}. Lo que responda cae en la solapa Onboarding.`}
        </span>
        {status.submissions.length > 0 ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={() => {
              setHistorial(true);
              // Si respondió mientras la ficha estaba abierta, lo que se ve
              // abajo está viejo: se recarga junto con el historial.
              onSubmissionSeen();
            }}
          >
            <History className="h-3 w-3" />
            Historial ({status.submissions.length})
          </button>
        ) : null}
      </div>

      {historial ? (
        <HistorialDeEnvios
          nombre={subClient.name}
          envios={status.submissions}
          fields={fields}
          onClose={() => setHistorial(false)}
        />
      ) : null}
    </div>
  );
}

function HistorialDeEnvios({
  nombre,
  envios,
  fields,
  onClose,
}: {
  nombre: string;
  envios: OnboardingSubmission[];
  fields: FieldDefinition[];
  onClose: () => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(envios[0]?.id ?? null);

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Onboarding de {nombre}</DialogTitle>
          <DialogDescription>
            Cada envío pisa las respuestas de la ficha. Acá queda lo que mandó y lo
            que había antes en cada respuesta que cambió.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {envios.map((envio) => {
            const cambios = Object.keys(envio.replaced);
            const esteAbierto = abierto === envio.id;
            return (
              <div key={envio.id} className="rounded-lg border border-border/60 dark:border-white/[0.08]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                  onClick={() => setAbierto(esteAbierto ? null : envio.id)}
                >
                  <span className="font-medium">
                    {fecha(envio.createdAt)} · {envio.respondentName ?? "Sin nombre"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {cambios.length === 1 ? "1 cambio" : `${cambios.length} cambios`}
                  </span>
                </button>

                {esteAbierto ? (
                  <div className="border-t border-border/50 px-3 py-3 dark:border-white/[0.06]">
                    <RespuestasDelEnvio envio={envio} fields={fields} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lo que mandó un envío, pregunta por pregunta. Si pisó algo, muestra qué
 * había antes. La usan el historial de la ficha y la bandeja sin asignar.
 */
export function RespuestasDelEnvio({
  envio,
  fields,
}: {
  envio: OnboardingSubmission;
  fields: FieldDefinition[];
}) {
  const porClave = new Map(fields.map((field) => [field.key, field]));
  return (
    <dl className="space-y-3">
      {Object.entries(envio.answers).map(([key, value]) => {
        const field = porClave.get(key);
        const texto = comoTexto(value, field);
        const cambio = key in envio.replaced;
        const antes = comoTexto(envio.replaced[key], field);
        return (
          <div key={key} className="space-y-1">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {envio.labels[key] ?? field?.label ?? key}
              {cambio ? <span className="ml-1.5 normal-case text-primary">cambió</span> : null}
            </dt>
            <dd className="whitespace-pre-wrap break-words text-sm">
              {texto || <span className="text-muted-foreground">(vacío)</span>}
            </dd>
            {cambio ? (
              <dd className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                Antes: {antes || "(vacío)"}
              </dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}
