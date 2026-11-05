/**
 * SCRUM-543 · La pantalla de Inicio: con y sin lanzamiento activo y con una
 * fuente caída (criterio de aceptación), más los números que no llegaron
 * `medido`. Fixtures a mano con los constructores de `dato.ts`.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InicioDelLanzamientoActivo, VistaInicio } from "@/lib/webinar/vistas/contratos";
import { conError, desactualizado, faltaConfigurar, medido, sinFuente } from "@/lib/webinar/vistas/dato";
import { PantallaDeInicio } from "../pantalla-de-inicio";

vi.mock("@/providers/zona-de-la-organizacion-provider", () => ({ useZonaDeLaOrganizacion: () => null }));

const AHORA = "2026-11-05T12:00:00.000Z";

function activo(cambios: Partial<InicioDelLanzamientoActivo> = {}): InicioDelLanzamientoActivo {
  return {
    lanzamiento: {
      id: "8f0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f",
      nombre: "Webinar de noviembre",
      variante: "paid",
      estado: "active",
      moneda: "USD",
      precioDeLaOferta: 997,
      captaDesde: "2026-10-28",
      cierraEl: "2026-11-08",
      cerradoAt: null,
    },
    diasParaElCierre: 3,
    proximaSesion: { id: "s3", empiezaAt: "2026-11-06T23:00:00.000Z" },
    registrados: medido(210, "landing", AHORA),
    registradosUltimas24h: medido(12, "landing", AHORA),
    embudo: [
      { paso: "registrados", etiqueta: "Se registraron", personas: medido(210, "landing", AHORA) },
      { paso: "confirmaron_el_email", etiqueta: "Confirmaron el email", personas: sinFuente("ghl", "GoHighLevel no está conectado.") },
      { paso: "se_quedaron_a_la_oferta", etiqueta: "Se quedaron a la oferta", personas: faltaConfigurar("configuracion", "Falta el minuto de la oferta de la sesión 2.") },
    ],
    tasas: {
      asistencia: medido(0.4, "calculado", AHORA),
      conversionDeAsistentes: medido(0.1, "calculado", AHORA),
      conversionDeRegistrados: medido(0.04, "calculado", AHORA),
    },
    ventas: {
      ventas: medido(8, "whop", AHORA),
      ingresos: medido(7976, "whop", AHORA),
      reembolsos: medido(0, "whop", AHORA),
      ventasVip: conError("commas", "Commas rechazó la clave.", AHORA),
    },
    anuncios: {
      inversion: desactualizado(4380.5, "meta_ads", AHORA, "La última lectura de Meta Ads es de hace 3 días."),
      costoPorRegistro: desactualizado(20.86, "calculado", AHORA, "La inversión puede estar atrasada."),
      costoPorVenta: desactualizado(547.56, "calculado", AHORA, "La inversión puede estar atrasada."),
      roas: medido(null, "calculado", AHORA),
    },
    sesiones: [
      { id: "s1", empiezaAt: "2026-11-03T23:00:00.000Z", asistieron: medido(84, "zoom", AHORA), seQuedaronALaOferta: medido(60, "zoom", AHORA) },
      { id: "s3", empiezaAt: "2026-11-06T23:00:00.000Z", asistieron: null, seQuedaronALaOferta: null },
    ],
    pendientesDelEquipo: {
      levantaronLaManoSinContactar: medido(5, "manual", AHORA),
      agendadosSinCerrar: sinFuente("calendly", "Calendly no está conectado."),
    },
    fuentes: [
      { fuente: "landing", state: "medido", reason: null, ultimaLecturaAt: AHORA },
      { fuente: "commas", state: "error", reason: "Commas rechazó la clave.", ultimaLecturaAt: AHORA },
    ],
    ...cambios,
  };
}

function dibujar(vista: VistaInicio, href: string | null = null): string {
  return renderToStaticMarkup(createElement(PantallaDeInicio, { vista, hrefCrearLanzamiento: href }));
}

describe("⭐ con lanzamiento activo", () => {
  const html = dibujar({ esEjemplo: true, activo: medido(activo(), "landing", AHORA) });

  it("cartel de ejemplo, nombre, variante, precio y cuenta regresiva", () => {
    expect(html).toContain('data-cartel="datos-de-ejemplo"');
    expect(html).toContain("Webinar de noviembre");
    expect(html).toContain("Pago");
    expect(html).toMatch(/Oferta: .*997/);
    expect(html).toMatch(/data-cuenta-regresiva="true"[^>]*>Cierra en 3 días</);
    expect(html).toContain("Próxima sesión:");
  });

  it("números principales con su formato; las últimas 24 h como ayuda", () => {
    expect(html).toMatch(/data-numero="Registrados" data-estado="medido"/);
    expect(html).toContain("+12 en las últimas 24 h");
    expect(html).toContain("40 %");
  });

  it("⭐ un número desactualizado muestra el valor con la marca y el motivo; uno con error, el estado sin cero", () => {
    expect(html).toMatch(/data-numero="Inversión en anuncios" data-estado="desactualizado"/);
    expect(html).toContain("La última lectura de Meta Ads es de hace 3 días.");
    expect(html).toMatch(/data-numero="Ventas VIP" data-estado="error"/);
    expect(html).toContain("Commas rechazó la clave.");
  });

  it("ROAS sin denominador: «—»", () => {
    expect(html).toMatch(/data-numero="ROAS" data-estado="medido"[^]*?—/);
  });

  it("⭐ lo que el equipo tiene que mover hoy enlaza a Leads con el filtro y el lanzamiento", () => {
    expect(html).toContain(
      'href="/leads?filtro=levanto_la_mano_sin_contactar&amp;lanzamiento=8f0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f"'
    );
    expect(html).toMatch(/data-pendiente="agendado_sin_cerrar"[^]*?Sin fuente\. Calendly no está conectado\./);
    expect(html).not.toContain("filtro=agendado_sin_cerrar");
  });

  it("embudo: los pasos sin medir dicen su estado, nunca un cero", () => {
    expect(html).toMatch(/data-paso="confirmaron_el_email" data-estado="sin_fuente"[^]*?Sin fuente/);
    expect(html).toMatch(/data-paso="se_quedaron_a_la_oferta" data-estado="falta_configurar"[^]*?Falta configurar/);
  });

  it("sesiones: la que ya ocurrió con su asistencia; la que viene, «Todavía no ocurrió»", () => {
    expect(html).toMatch(/data-sesion="s1"[^]*?Asistieron: 84/);
    expect(html).toMatch(/data-sesion="s3"[^]*?Todavía no ocurrió\./);
  });

  it("⭐ fuente caída: el estado de las fuentes la muestra primero, con su motivo", () => {
    expect(html).toContain("· 1 no está al día");
    const iError = html.indexOf('data-fuente="commas"');
    const iLanding = html.indexOf('data-fuente="landing"');
    expect(iError).toBeGreaterThan(-1);
    expect(iError).toBeLessThan(iLanding);
    expect(html).toMatch(/data-fuente="commas" data-estado="error"/);
  });

  it("con la landing al día y registros recientes no hay aviso de registros", () => {
    expect(html).not.toContain('data-aviso="registros"');
  });
});

describe("⭐ con la landing caída", () => {
  it("aparece el aviso de registros que dejan de llegar, con el motivo de la fuente", () => {
    const html = dibujar({
      esEjemplo: false,
      activo: medido(
        activo({
          fuentes: [
            { fuente: "landing", state: "error", reason: "La landing no envía registros desde ayer.", ultimaLecturaAt: AHORA },
          ],
        }),
        "landing",
        AHORA
      ),
    });
    expect(html).toMatch(/role="alert" data-aviso="registros"/);
    expect(html).toContain("Los registros pueden no estar llegando");
    expect(html).toContain("La landing no envía registros desde ayer.");
    expect(html).not.toContain("datos-de-ejemplo");
  });
});

describe("⭐ sin lanzamiento activo", () => {
  it("estado vacío; sin ruta para crear, sin enlace", () => {
    const html = dibujar({ esEjemplo: false, activo: medido(null, "landing", AHORA) });
    expect(html).toContain("No hay un lanzamiento activo.");
    expect(html).not.toContain("Crear un lanzamiento");
    expect(html).not.toContain("data-cuenta-regresiva");
  });

  it("con ruta para crear, el botón lleva ahí", () => {
    const html = dibujar({ esEjemplo: false, activo: medido(null, "landing", AHORA) }, "/lanzamientos");
    expect(html).toMatch(/href="\/lanzamientos"[^>]*>Crear un lanzamiento</);
  });
});

describe("el lanzamiento activo no se pudo leer", () => {
  it("muestra el estado y el motivo; no un estado vacío ni números", () => {
    const html = dibujar({
      esEjemplo: false,
      activo: sinFuente("landing", "Todavía no podemos mostrar los lanzamientos de tu organización."),
    });
    expect(html).toContain("Sin fuente");
    expect(html).toContain("Todavía no podemos mostrar los lanzamientos de tu organización.");
    expect(html).not.toContain("No hay un lanzamiento activo.");
    expect(html).not.toContain("data-numero");
  });
});
