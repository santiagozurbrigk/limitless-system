import type {
  EstadoDeVenta,
  EtapaDelLead,
  NotaDelLead,
  PersonaDelEquipo,
} from "@/lib/webinar/vistas/contratos";

/**
 * ⭐ El cambio simulado de la ficha (SCRUM-545, DT-18). Las acciones no
 * escriben en ninguna base: con éxito, la ficha refleja el cambio sólo acá, en
 * el estado local, que se pierde al recargar (AC-9).
 *
 * Funciones puras: no mutan la entrada. `ultimoContactoAt` no se toca: marcar
 * "Contactado" de ejemplo no es un contacto medido.
 */

/** Una nota agregada en esta pantalla: no se guardó ("Nota de ejemplo"). */
export type NotaLocal = NotaDelLead & { deEjemplo: true };

export type EstadoLocalDelLead = {
  etapa: EtapaDelLead;
  responsable: PersonaDelEquipo | null;
  /** Las notas agregadas en esta pantalla, la más nueva primero. */
  notasLocales: NotaLocal[];
  /** Hubo al menos un cambio de ejemplo (para el aviso). */
  huboCambios: boolean;
};

export function estadoInicial(venta: EstadoDeVenta): EstadoLocalDelLead {
  return {
    etapa: venta.etapa,
    responsable: venta.responsable,
    notasLocales: [],
    huboCambios: false,
  };
}

export function aplicarAvance(
  estado: EstadoLocalDelLead,
  etapa: EtapaDelLead
): EstadoLocalDelLead {
  return { ...estado, etapa, huboCambios: true };
}

export function aplicarResponsable(
  estado: EstadoLocalDelLead,
  responsable: PersonaDelEquipo | null
): EstadoLocalDelLead {
  return { ...estado, responsable, huboCambios: true };
}

export function agregarNotaLocal(
  estado: EstadoLocalDelLead,
  nota: { launchId: string; texto: string; creadaAt: string }
): EstadoLocalDelLead {
  const nueva: NotaLocal = {
    id: `local-${estado.notasLocales.length + 1}`,
    launchId: nota.launchId,
    texto: nota.texto,
    autor: null,
    creadaAt: nota.creadaAt,
    deEjemplo: true,
  };
  return { ...estado, notasLocales: [nueva, ...estado.notasLocales], huboCambios: true };
}
