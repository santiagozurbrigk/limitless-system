import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { CartelDatosDeEjemplo } from "@/components/webinar/cartel-datos-de-ejemplo";
import { camposDesdeLaVista } from "@/lib/webinar/lanzamientos/formulario";
import type { VistaConfiguracionDelLanzamiento } from "@/lib/webinar/vistas/contratos";
import { ETIQUETA_DE_FUENTE } from "@/lib/webinar/vistas/dato";
import { paths } from "@/routes/paths";
import { FormularioDelLanzamiento } from "./formulario-del-lanzamiento";
import { SeccionDeFuentes } from "./secciones-del-lanzamiento";

/**
 * ⭐ Configuración de un lanzamiento de Limitless Webinars (SCRUM-529): lo que
 * falta cargar para que cada número se pueda medir, el formulario para editar
 * datos y sesiones, y las campañas y productos asociados. Dibuja lo que
 * devuelve `leerConfiguracionDelLanzamiento` (SCRUM-542). Campañas y productos
 * se muestran pero todavía no se editan acá: se eligen de los catálogos de
 * Meta y del procesador de pagos (`[WEBINAR-CONFIG-CAMPANAS-Y-PRODUCTOS]`).
 */
export function PantallaDeConfiguracion({ vista }: { vista: VistaConfiguracionDelLanzamiento }) {
  const l = vista.lanzamiento;
  return (
    <div className="flex flex-col gap-6">
      <CartelDatosDeEjemplo visible={vista.esEjemplo} />
      <p className="text-sm">
        <Link href={paths.platform.lanzamientosDetail(l.id)} className="text-primary hover:underline">
          ← Volver al detalle de {l.nombre}
        </Link>
      </p>

      {vista.faltantes.length > 0 ? (
        <section aria-label="Falta cargar" data-faltantes className="flex flex-col gap-2 rounded-lg border border-warning/40 px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            Falta cargar
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {vista.faltantes.map((f, i) => (
              <li key={`${f.campo}-${f.sesionId ?? i}`} data-faltante={f.campo}>
                {f.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">No falta cargar nada para medir este lanzamiento.</p>
      )}

      <section aria-label="Datos del lanzamiento" className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Datos y sesiones</h3>
        <FormularioDelLanzamiento modo="editar" launchId={l.id} inicial={camposDesdeLaVista(l, vista.sesiones)} />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-label="Campañas" className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Campañas de anuncios</h3>
          {vista.campanas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin campañas asociadas.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {vista.campanas.map((c) => (
                <li key={c.id} className="rounded-lg border border-border px-3 py-2">
                  {c.plataforma} · <span className="font-mono text-xs">{c.campaignExternalId}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Productos" className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Productos</h3>
          {vista.productos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin productos asociados.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {vista.productos.map((p) => (
                <li key={p.id} className="rounded-lg border border-border px-3 py-2">
                  {p.rol === "main" ? "Oferta principal" : "Asiento VIP"} ·{" "}
                  {p.proveedor in ETIQUETA_DE_FUENTE
                    ? ETIQUETA_DE_FUENTE[p.proveedor as keyof typeof ETIQUETA_DE_FUENTE]
                    : p.proveedor}{" "}
                  · <span className="font-mono text-xs">{p.productExternalId}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <SeccionDeFuentes fuentes={vista.fuentes} />
    </div>
  );
}
