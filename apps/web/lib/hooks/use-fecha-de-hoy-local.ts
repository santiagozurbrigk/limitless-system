"use client";

import { useSyncExternalStore } from "react";
import { fechaDeHoyLocal } from "@/lib/fechas/calendario";

/** Milisegundos que faltan para la próxima medianoche local (más un margen de 1 s). */
export function msHastaLaMedianocheLocal(ahora: Date = new Date()): number {
  const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  return Math.max(1_000, manana.getTime() - ahora.getTime() + 1_000);
}

/**
 * Avisa cuando cambia el día local. Una pantalla abierta de un día para el otro
 * vuelve a calcular "vencida" sin recargar.
 */
export function suscribirseAlCambioDeDia(avisar: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const programar = () => {
    timer = setTimeout(() => {
      avisar();
      programar();
    }, msHastaLaMedianocheLocal());
  };
  programar();
  return () => clearTimeout(timer);
}

/**
 * La fecha de hoy del navegador, para decidir en pantalla qué está vencido.
 *
 * ⭐ Devuelve `null` en el render del servidor y en la hidratación: el servidor
 * corre en UTC y su "hoy" no es el del usuario. Si el HTML del servidor marcara
 * "vencida" con el día de UTC, React no corrige ese atributo al hidratar. Con
 * `null`, quien llama no marca nada hasta tener el día local, y React vuelve a
 * renderizar enseguida con la fecha del navegador.
 */
export function useFechaDeHoyLocal(): string | null {
  return useSyncExternalStore(suscribirseAlCambioDeDia, fechaDeHoyLocal, () => null);
}
