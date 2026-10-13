"use client";

/**
 * La ficha del cliente.
 *
 * ⭐ Está armada en tres capas y dos columnas, y el orden no es estético: es el
 * orden de las preguntas que trae quien la abre.
 *
 * 1. **El encabezado** contesta "¿quién es y en qué estado está?": nombre, alta,
 *    producto, apodo y el recorrido de estados. Absorbió tres bloques que antes
 *    eran paneles sueltos (el apodo, el flujo de estado y el botón de caso de
 *    éxito, que era el último paso de ese mismo flujo y existía dos veces).
 * 2. **La franja** contesta "¿cómo viene?" sin scrollear: sesiones, pendientes,
 *    recorrido y satisfacción.
 * 3. **Las dos columnas** separan el trabajo del contexto. A la izquierda lo que
 *    se hace con el cliente —recorrido, sesiones, tareas, historial—; a la
 *    derecha lo que se sabe de él —datos, satisfacción, notas, wins, Discord—.
 *    Antes eran catorce bloques en una sola columna de ancho fijo, con seis
 *    estilos de encabezado distintos, que se leían como una pila y no como una
 *    pantalla.
 *
 * En pantallas angostas las columnas se apilan, trabajo primero.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@ai-coo/ui";
import { ExternalLink, History, PhoneCall, Sparkles } from "lucide-react";
import { usePlatformData } from "@/providers";
import { useHasAddOn, useModuleAccess } from "@/providers/permissions-provider";
import { useToast } from "@/providers/toast-provider";
import { ClientHeader } from "@/components/clients/client-header";
import { ClientOverviewStrip } from "@/components/clients/client-overview-strip";
import { FichaCard, FichaSection } from "@/components/clients/ficha-section";
import { ClientLinkedCallsSection } from "@/components/clients/client-linked-calls";
import { ClientOneOnOnesSection } from "@/components/clients/client-one-on-ones";
import { ClientTasksSection } from "@/components/clients/client-tasks-section";
import { ClientCustomFieldsSection } from "@/components/clients/client-custom-fields-section";
import { ClientSubClientsCard } from "@/components/clients/client-sub-clients-card";
import { ClientRevenueCard } from "@/components/clients/client-revenue-card";
import { ClientNotesSection } from "@/components/clients/client-notes-section";
import { ClientSatisfactionSection } from "@/components/clients/client-satisfaction-section";
import { ClientDiscordActivity } from "@/components/clients/client-discord-activity";
import { ClientTimeline } from "@/components/clients/client-timeline";
import { ClientJourneySection } from "@/components/clients/checkpoints";
import { ClientWinsSection } from "@/components/clients/wins";
import { cargarColumnasDelCliente } from "@/components/clients/client-custom-fields-section";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import { activeFields } from "@/lib/custom-fields";
import type { FieldDefinition } from "@/types/custom-fields";
import type { Client, ClientStatus } from "@/types/clients";

export function ClientDetail({ client: initial }: { client: Client }) {
  const { clients, updateClient } = usePlatformData();
  const { push } = useToast();
  const client = clients.find((c) => c.id === initial.id) ?? initial;
  /** El atajo a Cobros no se ofrece a quien no puede entrar a Ventas. */
  const puedeVerCobros = useModuleAccess("sales") !== "none";
  /**
   * Los clientes del cliente y la facturación de su negocio son del add-on
   * `growth_partners`, hecho para Limitless. Sin él, ninguna de las dos
   * tarjetas existe. El servidor lo vuelve a chequear en cada acción.
   */
  const growthPartners = useHasAddOn("growth_partners");

  /**
   * Las columnas configurables del cliente, pedidas una vez.
   *
   * Las usan dos tarjetas —la de secciones y la de campos sueltos—, y pedirlas
   * por separado sería el mismo fetch dos veces por ficha abierta.
   */
  /** Todas, archivadas incluidas; `null` mientras cargan o si fallaron. */
  const [columnas, setColumnas] = useState<FieldDefinition[] | null>(null);
  /**
   * Si no se pudieron leer, el motivo (SCRUM-517): antes se callaba. Un solo
   * aviso para las dos tarjetas que las usan.
   */
  const [motivoColumnas, setMotivoColumnas] = useState<string | null>(null);
  const clientFields = useMemo(() => activeFields(columnas ?? []), [columnas]);
  useEffect(() => {
    let alive = true;
    void cargarColumnasDelCliente().then((lectura) => {
      if (!alive) return;
      if (lectura.ok) setColumnas(lectura.data);
      else setMotivoColumnas(lectura.motivo);
    });
    return () => {
      alive = false;
    };
  }, []);

  const advanceStatus = async (status: ClientStatus) => {
    try {
      await updateClient(client.id, {
        status,
        isSuccessCase: status === "success_case",
      });
      push({ title: "Estado actualizado", variant: "success" });
    } catch (e) {
      push({
        title: "No se pudo actualizar",
        description: e instanceof Error ? e.message : undefined,
        variant: "default",
      });
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ClientHeader
        client={client}
        puedeVerCobros={puedeVerCobros}
        onStatusChange={advanceStatus}
      />

      <ClientOverviewStrip clientId={client.id} satisfaction={client.satisfaction} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-start">
        {/* ── El trabajo ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-8">
          <ClientJourneySection
            clientId={client.id}
            manualStageId={client.manualStageId ?? null}
          />

          <ClientOneOnOnesSection clientId={client.id} />

          <ClientTasksSection clientId={client.id} />

          <ClientLinkedCallsSection calls={client.linkedCalls} />

          <FichaSection icon={History} title="Historial">
            <ClientTimeline clientId={client.id} />
          </FichaSection>
        </div>

        {/* ── El contexto ────────────────────────────────────────────── */}
        <aside className="min-w-0 space-y-4">
          {motivoColumnas ? (
            <AvisoDeLecturaFallida
              titulo="No se pudieron cargar los datos del cliente."
              motivo={motivoColumnas}
            />
          ) : null}

          {growthPartners ? (
            <>
              {/*
                Los clientes del cliente, con Marketing, Ventas y Sistemas de
                cada uno. Va primero porque es el contexto con el que se lee
                todo lo demás.
              */}
              <ClientSubClientsCard client={client} fields={clientFields} />

              {/* Cuánto factura su negocio: la medida de si esto está funcionando. */}
              <ClientRevenueCard clientId={client.id} />
            </>
          ) : null}

          {/* Las columnas sueltas, las que no están en ninguna sección. */}
          <ClientCustomFieldsSection client={client} columnas={columnas} />

          <ClientSatisfactionSection
            clientId={client.id}
            initialLevel={client.satisfaction ?? null}
            initialUpdatedAt={client.satisfactionUpdatedAt ?? null}
            updatedByName={client.satisfactionUpdatedByName ?? null}
          />

          <ClientNotesSection
            clientId={client.id}
            initialNotes={client.notes ?? null}
            initialUpdatedAt={client.notesUpdatedAt ?? null}
          />

          <ClientWinsSection clientId={client.id} />

          <ClientDiscordActivity clientId={client.id} />

          {/*
            La grabación de la venta es un link, no una "vista previa": el
            recuadro gris que decía «Vista previa Fathom» no previsualizaba nada
            y ocupaba el alto de un video.
          */}
          {client.salesFathomUrl ? (
            <FichaCard icon={PhoneCall} title="Llamada de venta">
              <Button variant="outline" size="sm" className="w-full gap-2" asChild>
                <a href={client.salesFathomUrl} target="_blank" rel="noopener noreferrer">
                  Abrir la grabación en Fathom
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </FichaCard>
          ) : null}

          {client.aiInsights.length > 0 ? (
            <FichaCard icon={Sparkles} title="Contexto del cierre">
              <ul className="space-y-2.5">
                {client.aiInsights.map((line, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                    <Sparkles
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-primary/70"
                      aria-hidden
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </FichaCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
