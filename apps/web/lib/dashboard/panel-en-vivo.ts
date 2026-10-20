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
  if (!opciones.organizationId) return null;
  const supabase = opciones.cliente();
  const filtro = `organization_id=eq.${opciones.organizationId}`;
  // El evento trae la fila: no se usa. Sólo se pide el Panel de nuevo.
  const avisar = () => opciones.alCambiar();
  const canal = supabase
    .channel(`panel:conversations:${opciones.organizationId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: filtro }, avisar)
    .subscribe();
  return () => {
    void supabase.removeChannel(canal);
  };
}
