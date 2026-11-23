"use client";

import { useState, useTransition } from "react";
import {
  agregarNotaDelLeadAction,
  asignarResponsableDelLeadAction,
  marcarAvanceDelLeadAction,
} from "@/app/leads/actions";
import { correrMutacion } from "@/lib/client/correr-accion";
import {
  agregarNotaLocal,
  aplicarAvance,
  aplicarResponsable,
  estadoInicial,
  type EstadoLocalDelLead,
} from "@/lib/webinar/leads/estado-local";
import type {
  EstadoDeVenta,
  EtapaDelLead,
  NotaDelLead,
  PersonaDelEquipo,
} from "@/lib/webinar/vistas/contratos";
import { tieneValor, type Dato } from "@/lib/webinar/vistas/dato";
import { useToast } from "@/providers/toast-provider";
import { PanelDeVentaDelLead } from "./panel-de-venta-del-lead";

/**
 * El envoltorio cliente del panel de venta (SCRUM-545, DT-11): guarda el
 * cambio de ejemplo en el estado local y llama a las acciones simuladas. Con
 * éxito aplica el cambio sólo acá (se pierde al recargar); con error,
 * `correrMutacion` avisa con el motivo y no cambia nada.
 *
 * La ficha lo dibuja con `key` de lead y lanzamiento: al pasar a otra ficha
 * no arrastra el estado.
 */
export function PanelDeVentaCliente({
  leadId,
  launchId,
  estadoDeVenta,
  notas,
  equipo,
}: {
  leadId: string;
  launchId: string;
  estadoDeVenta: Dato<EstadoDeVenta>;
  notas: Dato<NotaDelLead[]>;
  equipo: PersonaDelEquipo[];
}) {
  const [local, setLocal] = useState<EstadoLocalDelLead | null>(() =>
    tieneValor(estadoDeVenta) ? estadoInicial(estadoDeVenta.value) : null
  );
  const [borrador, setBorrador] = useState("");
  const [ocupado, startTransition] = useTransition();
  const { push } = useToast();

  function marcarAvance(etapaActual: EtapaDelLead) {
    startTransition(() =>
      correrMutacion({
        accion: () => marcarAvanceDelLeadAction({ leadId, launchId, etapaActual }),
        avisar: push,
        tituloError: "No se pudo marcar el avance",
        etiqueta: "[PanelDeVentaCliente] marcar avance",
        alExito: ({ etapa }) => setLocal((previo) => (previo ? aplicarAvance(previo, etapa) : previo)),
      })
    );
  }

  function asignarResponsable(responsableUserId: string | null) {
    startTransition(() =>
      correrMutacion({
        accion: () => asignarResponsableDelLeadAction({ leadId, launchId, responsableUserId }),
        avisar: push,
        tituloError: "No se pudo asignar el responsable",
        etiqueta: "[PanelDeVentaCliente] asignar responsable",
        alExito: (data) => {
          const persona = equipo.find((p) => p.userId === data.responsableUserId) ?? null;
          setLocal((previo) => (previo ? aplicarResponsable(previo, persona) : previo));
        },
      })
    );
  }

  function agregarNota() {
    startTransition(() =>
      correrMutacion({
        accion: () => agregarNotaDelLeadAction({ leadId, launchId, texto: borrador }),
        avisar: push,
        tituloError: "No se pudo agregar la nota",
        etiqueta: "[PanelDeVentaCliente] agregar nota",
        alExito: ({ texto, creadaAt }) => {
          setLocal((previo) => (previo ? agregarNotaLocal(previo, { launchId, texto, creadaAt }) : previo));
          setBorrador("");
        },
      })
    );
  }

  return (
    <PanelDeVentaDelLead
      estadoDeVenta={estadoDeVenta}
      notas={notas}
      equipo={equipo}
      local={local}
      borradorDeNota={borrador}
      ocupado={ocupado}
      alMarcarAvance={marcarAvance}
      alAsignarResponsable={asignarResponsable}
      alCambiarBorrador={setBorrador}
      alAgregarNota={agregarNota}
    />
  );
}
