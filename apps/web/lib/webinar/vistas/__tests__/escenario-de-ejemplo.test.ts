/**
 * SCRUM-542: el escenario de ejemplo es determinístico y cada recorrido es
 * coherente con los eventos (nadie compra sin asistir, nadie asiste antes de
 * registrarse, cada etapa viene después de la anterior).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { TipoDeEvento } from "../contratos";
import type { FilaEvento } from "../filas";
import {
  PREFIJO_DE_IDS_DE_EJEMPLO,
  escenarioDeEjemplo,
} from "../escenario-de-ejemplo";

const AHORA = new Date("2026-11-01T15:30:00Z");
const filas = escenarioDeEjemplo(AHORA);

afterEach(() => vi.restoreAllMocks());

function eventosDe(leadId: string, launchId: string): FilaEvento[] {
  return filas.eventos.filter((e) => e.lead_id === leadId && e.launch_id === launchId);
}

describe("determinismo", () => {
  it("la misma hora da exactamente las mismas filas", () => {
    expect(escenarioDeEjemplo(new Date("2026-11-01T15:59:59Z"))).toEqual(filas);
  });

  it("no usa Math.random", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random no se usa en el escenario");
    });
    escenarioDeEjemplo(AHORA);
    expect(random).not.toHaveBeenCalled();
  });

  it("otro día da los mismos recorridos corridos en el tiempo", () => {
    const otro = escenarioDeEjemplo(new Date("2026-12-15T15:30:00Z"));
    expect(otro.eventos.map((e) => [e.lead_id, e.kind])).toEqual(
      filas.eventos.map((e) => [e.lead_id, e.kind])
    );
  });
});

describe("tamaño y forma", () => {
  it("un lanzamiento activo Pago y uno cerrado; dos sesiones en el activo", () => {
    const [activo, cerrado] = filas.lanzamientos;
    expect(activo).toMatchObject({ status: "active", variant: "paid", closed_at: null });
    expect(cerrado.status).toBe("closed");
    expect(cerrado.closed_at).not.toBeNull();
    expect(filas.sesiones.filter((s) => s.launch_id === activo.id)).toHaveLength(2);
  });

  it("300 leads, cada uno registrado al menos una vez; 30 en los dos lanzamientos", () => {
    expect(filas.leads).toHaveLength(300);
    const porLead = new Map<string, number>();
    for (const r of filas.registros) porLead.set(r.lead_id, (porLead.get(r.lead_id) ?? 0) + 1);
    expect(porLead.size).toBe(300);
    expect([...porLead.values()].filter((n) => n === 2)).toHaveLength(30);
  });

  it("un registro por lead y lanzamiento, con su evento registered", () => {
    const claves = filas.registros.map((r) => `${r.launch_id}|${r.lead_id}`);
    expect(new Set(claves).size).toBe(claves.length);
    for (const r of filas.registros) {
      const registered = eventosDe(r.lead_id, r.launch_id).filter((e) => e.kind === "registered");
      expect(registered).toHaveLength(1);
      expect(registered[0].occurred_at).toBe(r.registered_at);
    }
  });

  it("los IDs son únicos y llevan el prefijo de ejemplo", () => {
    const ids = [
      ...filas.lanzamientos.map((x) => x.id),
      ...filas.sesiones.map((x) => x.id),
      ...filas.leads.map((x) => x.id),
      ...filas.registros.map((x) => x.id),
      ...filas.eventos.map((x) => x.id),
      ...filas.notas.map((x) => x.id),
      ...filas.equipo.map((x) => x.user_id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.startsWith(PREFIJO_DE_IDS_DE_EJEMPLO)).toBe(true);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("ningún contacto es de una persona real", () => {
    for (const lead of filas.leads) {
      expect(lead.email).toMatch(/^[a-z.0-9]+@example\.com$/);
      if (lead.phone_e164) expect(lead.phone_e164).toMatch(/^\+447700900\d{3}$/);
    }
    expect(filas.leads.some((l) => l.phone_e164 === null)).toBe(true);
    expect(filas.leads.some((l) => l.name === null)).toBe(true);
  });

  it("nada ocurre en el futuro", () => {
    const ahora = AHORA.toISOString();
    for (const e of filas.eventos) expect(e.occurred_at <= ahora).toBe(true);
    for (const r of filas.registros) expect(r.registered_at <= ahora).toBe(true);
  });
});

describe("cada recorrido es coherente", () => {
  // Qué tiene que haber pasado antes de cada etapa (en el mismo lanzamiento).
  const REQUIERE: Partial<Record<TipoDeEvento, TipoDeEvento[]>> = {
    attended: ["registered"],
    stayed_to_offer: ["attended"],
    raised_hand: ["attended"],
    contacted: ["raised_hand"],
    qualified: ["contacted"],
    disqualified: ["contacted"],
    call_booked: ["qualified"],
    call_attended: ["call_booked"],
    call_no_show: ["call_booked"],
    purchased: ["attended"],
    refunded: ["purchased"],
  };

  for (const lanzamiento of filas.lanzamientos) {
    it(`en ${lanzamiento.name}`, () => {
      const sesiones = new Map(filas.sesiones.map((s) => [s.id, s]));
      const leads = new Set(
        filas.registros.filter((r) => r.launch_id === lanzamiento.id).map((r) => r.lead_id)
      );
      for (const leadId of leads) {
        const eventos = eventosDe(leadId, lanzamiento.id);
        const primero = new Map<TipoDeEvento, string>();
        for (const e of eventos) {
          // Cada tipo una sola vez por lanzamiento.
          expect(primero.has(e.kind)).toBe(false);
          primero.set(e.kind, e.occurred_at);
        }
        for (const e of eventos) {
          for (const previo of REQUIERE[e.kind] ?? []) {
            expect(primero.has(previo), `${e.kind} sin ${previo}`).toBe(true);
            expect(primero.get(previo)! <= e.occurred_at, `${e.kind} antes de ${previo}`).toBe(true);
          }
        }
        expect(primero.has("disqualified") && primero.has("qualified")).toBe(false);
        expect(primero.has("call_attended") && primero.has("call_no_show")).toBe(false);

        // La asistencia es a una sesión del lanzamiento, posterior al registro.
        const asistio = eventos.find((e) => e.kind === "attended");
        if (asistio) {
          const sesion = sesiones.get(asistio.data.session_id!)!;
          expect(sesion.launch_id).toBe(lanzamiento.id);
          expect(sesion.starts_at > primero.get("registered")!).toBe(true);
          const seQuedo = eventos.find((e) => e.kind === "stayed_to_offer");
          if (seQuedo) {
            expect(seQuedo.data.session_id).toBe(sesion.id);
            // Sin minuto de la oferta no se puede saber quién se quedó.
            expect(sesion.offer_offset_seconds).not.toBeNull();
          }
        }
        for (const compra of eventos.filter((e) => e.kind === "purchased" || e.kind === "refunded")) {
          expect(compra.data.amount).toBe(lanzamiento.offer_price);
          expect(compra.data.currency).toBe(lanzamiento.currency);
        }
      }
    });
  }

  it("el embudo nunca crece: no hay más compradores que asistentes", () => {
    for (const lanzamiento of filas.lanzamientos) {
      const cuantos = (kind: TipoDeEvento) =>
        new Set(
          filas.eventos
            .filter((e) => e.launch_id === lanzamiento.id && e.kind === kind)
            .map((e) => e.lead_id)
        ).size;
      const cadena: TipoDeEvento[] = [
        "registered",
        "attended",
        "raised_hand",
        "contacted",
        "qualified",
        "call_booked",
        "call_attended",
      ];
      for (let i = 1; i < cadena.length; i += 1) {
        expect(cuantos(cadena[i])).toBeLessThanOrEqual(cuantos(cadena[i - 1]));
      }
      expect(cuantos("purchased")).toBeLessThanOrEqual(cuantos("attended"));
      expect(cuantos("refunded")).toBeLessThanOrEqual(cuantos("purchased"));
      expect(cuantos("purchased")).toBeGreaterThan(0);
    }
  });

  it("el estado de venta es la última etapa, y quien tiene llamada tiene closer", () => {
    for (const s of filas.estadosDeVenta) {
      const eventos = eventosDe(s.lead_id, s.launch_id).sort((a, b) =>
        a.occurred_at.localeCompare(b.occurred_at)
      );
      expect(s.stage).toBe(eventos.at(-1)!.kind);
      if (eventos.some((e) => e.kind === "call_booked")) {
        expect(s.owner_user_id).toBe(filas.equipo[2].user_id);
      }
      if (!eventos.some((e) => e.kind === "contacted")) {
        expect(s.owner_user_id).toBeNull();
        expect(s.last_contact_at).toBeNull();
      }
    }
  });

  it("las notas son de leads contactados, después del contacto", () => {
    expect(filas.notas.length).toBeGreaterThan(0);
    for (const nota of filas.notas) {
      const contacto = eventosDe(nota.lead_id, nota.launch_id).find((e) => e.kind === "contacted");
      expect(contacto).toBeDefined();
      expect(nota.created_at > contacto!.occurred_at).toBe(true);
    }
  });

  it("no hay eventos de las fuentes que el escenario tiene caídas o sin conectar", () => {
    const kinds = new Set(filas.eventos.map((e) => e.kind));
    expect(kinds.has("email_confirmed")).toBe(false); // GoHighLevel sin conectar
    expect(kinds.has("vip_purchased")).toBe(false); // Commas con error
  });
});
