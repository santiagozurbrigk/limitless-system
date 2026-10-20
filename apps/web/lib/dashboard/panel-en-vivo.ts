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
  canal: ReturnType<ClienteDeRealtime["channel"]>;
  oyentes: Set<() => void>;
  cierre: ReturnType<typeof setTimeout> | null;
};
const canales = new Map<string, Entrada>();
export const ESPERA_PARA_CERRAR_MS = 5000;

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
    // El evento trae la fila: no se usa. Sólo se avisa a cada Panel abierto.
    const canal = supabase
      .channel(`panel:conversations:${organizationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `organization_id=eq.${organizationId}` },
        () => {
          for (const avisar of oyentes) avisar();
        }
      )
      .subscribe();
    entrada = { supabase, canal, oyentes, cierre: null };
    canales.set(organizationId, entrada);
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
      void actual.supabase.removeChannel(actual.canal);
      canales.delete(organizationId);
    }, ESPERA_PARA_CERRAR_MS);
  };
}
