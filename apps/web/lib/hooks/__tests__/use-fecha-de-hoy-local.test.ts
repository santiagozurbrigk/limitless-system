/**
 * SCRUM-493: el hook que da el "hoy" del navegador vuelve a avisar al cambiar
 * el día local, para que una pantalla abierta de un día para el otro recalcule
 * qué está vencido.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { msHastaLaMedianocheLocal, suscribirseAlCambioDeDia } from "../use-fecha-de-hoy-local";

afterEach(() => {
  restaurarZona();
  vi.useRealTimers();
});

describe("msHastaLaMedianocheLocal", () => {
  it("cuenta hasta la medianoche local (más un segundo)", () => {
    conZona("America/Argentina/Buenos_Aires");
    // 1-oct 22:00 en Buenos Aires: faltan 2 horas.
    expect(msHastaLaMedianocheLocal(new Date("2026-10-02T01:00:00Z"))).toBe(2 * 3600_000 + 1_000);
  });
});

describe("suscribirseAlCambioDeDia", () => {
  it("avisa al pasar la medianoche local, cada día, hasta que se desuscribe", () => {
    conZona("America/Argentina/Buenos_Aires");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T01:00:00Z"));
    const avisar = vi.fn();
    const desuscribir = suscribirseAlCambioDeDia(avisar);

    vi.advanceTimersByTime(2 * 3600_000);
    expect(avisar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(avisar).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(24 * 3600_000);
    expect(avisar).toHaveBeenCalledTimes(2);

    desuscribir();
    vi.advanceTimersByTime(48 * 3600_000);
    expect(avisar).toHaveBeenCalledTimes(2);
  });
});
