/**
 * ⭐ El Panel en vivo, sin mandar datos (SCRUM-540, AR pasada 2).
 *
 * Antes el Panel se actualizaba solo porque el provider de la plataforma
 * escuchaba las conversaciones en vivo y el Panel se calculaba en el navegador
 * con esas filas. Ahora el Panel se calcula en el servidor, así que para
 * seguir en vivo escucha el mismo canal y, ante cualquier cambio, le pide al
 * servidor que lo vuelva a calcular (`router.refresh()`), **sin usar los datos
 * del evento**.
 *
 * El canal manda las filas de `conversations` al navegador, así que sólo se
 * abre si quien mira puede leer `conversaciones` (founder, sin rol o con
 * Ventas), con la misma regla que el resto del marco. Con sólo el Panel no se
 * abre: el Panel se ve al cargar o navegar.
 */

import { puedeLeerDelMarco } from "@/lib/auth/lecturas-del-marco";
import type { PermisosDeModulo } from "@/lib/auth/regla-de-modulo";
import type { createClient } from "@/lib/supabase/client";

type ClienteDeRealtime = ReturnType<typeof createClient>;

/**
 * Un solo canal por organización, compartido. Medido con la sonda de la AR 2:
 * el Panel se monta dos veces seguidas al cargar, y cortar un canal y abrir
 * otro en el mismo instante dejaba al nuevo sin eventos. Así el canal se abre
 * una vez, cada montaje suma un oyente, y se cierra unos segundos después de
 * que se va el último (si vuelve otro antes, sigue el mismo canal).
 */
type Entrada = {
  supabase: ClienteDeRealtime;
  canal: ReturnType<ClienteDeRealtime["channel"]> | null;
  oyentes: Set<() => void>;
  cierre: ReturnType<typeof setTimeout> | null;
  cerrado: boolean;
  /** Cuándo se avisó por última vez, y el aviso del final de una ráfaga, si hay uno esperando. */
  ultimoAviso: number;
  avisoPendiente: ReturnType<typeof setTimeout> | null;
};
const canales = new Map<string, Entrada>();
export const ESPERA_PARA_CERRAR_MS = 5000;

/**
 * ⭐ Como mucho un aviso cada este tiempo (AR 3 de SCRUM-540). Cada aviso hace
 * que el servidor vuelva a calcular el Panel entero; un webhook que actualiza
 * muchas conversaciones juntas mandaba un evento por fila y el Panel pedía un
 * `router.refresh()` por cada uno (31 cambios, 35 pedidos). Ahora el primer
 * evento avisa enseguida y los que llegan dentro del intervalo se juntan en un
 * aviso al final, así el último cambio siempre termina en la pantalla.
 */
export const INTERVALO_ENTRE_AVISOS_MS = 2500;

function avisarAgrupado(entrada: Entrada): void {
  if (entrada.avisoPendiente) return; // ya hay un aviso esperando el final de la ráfaga
  const avisarATodos = () => {
    entrada.ultimoAviso = Date.now();
    for (const avisar of entrada.oyentes) avisar();
  };
  const falta = entrada.ultimoAviso + INTERVALO_ENTRE_AVISOS_MS - Date.now();
  if (falta <= 0) {
    avisarATodos();
    return;
  }
  entrada.avisoPendiente = setTimeout(() => {
    entrada.avisoPendiente = null;
    if (!entrada.cerrado) avisarATodos();
  }, falta);
}

/**
 * Se suscribe y devuelve cómo cortar, o `null` si quien mira no puede leer
 * conversaciones (no se abre ningún canal).
 */
export function suscribirPanelEnVivo(opciones: {
  permisos: PermisosDeModulo;
  organizationId: string | null;
  cliente: () => ClienteDeRealtime;
  alCambiar: () => void;
}): (() => void) | null {
  if (!puedeLeerDelMarco(opciones.permisos, "conversaciones")) return null;
  const organizationId = opciones.organizationId;
  if (!organizationId) return null;
  let entrada = canales.get(organizationId);
  if (!entrada) {
    const supabase = opciones.cliente();
    const oyentes = new Set<() => void>();
    const nueva: Entrada = {
      supabase,
      canal: null,
      oyentes,
      cierre: null,
      cerrado: false,
      ultimoAviso: 0,
      avisoPendiente: null,
    };
    canales.set(organizationId, nueva);
    // Se abre después de tener la sesión: si el canal se une con la clave
    // anónima, la RLS de `conversations` no le manda nada (medido: la mitad de
    // las cargas el Panel no se enteraba).
    void (async () => {
      await supabase.auth.getSession();
      if (nueva.cerrado) return;
      // El evento trae la fila: no se usa. Sólo se avisa a cada Panel abierto.
      nueva.canal = supabase
        .channel(`panel:conversations:${organizationId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversations", filter: `organization_id=eq.${organizationId}` },
          () => avisarAgrupado(nueva)
        )
        .subscribe();
    })();
    entrada = nueva;
  }
  if (entrada.cierre) {
    clearTimeout(entrada.cierre);
    entrada.cierre = null;
  }
  const actual = entrada;
  const avisar = () => opciones.alCambiar();
  actual.oyentes.add(avisar);
  return () => {
    actual.oyentes.delete(avisar);
    if (actual.oyentes.size > 0) return;
    actual.cierre = setTimeout(() => {
      actual.cerrado = true;
      if (actual.avisoPendiente) clearTimeout(actual.avisoPendiente);
      if (actual.canal) void actual.supabase.removeChannel(actual.canal);
      canales.delete(organizationId);
    }, ESPERA_PARA_CERRAR_MS);
  };
}
