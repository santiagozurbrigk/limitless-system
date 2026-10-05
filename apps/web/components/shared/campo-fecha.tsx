"use client";

import { Input, type InputProps } from "@ai-coo/ui";
import { aFechaDeInput, fechaDeValorGuardado } from "@/lib/fechas/calendario";

export type CampoFechaProps = Omit<
  InputProps,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  /**
   * Lo guardado, tal como viene de la base: una fecha `YYYY-MM-DD` (columna
   * `date`) o un instante (columna `timestamptz`). `null` o `""` = sin fecha.
   */
  value: string | null | undefined;
  /** La fecha elegida, `YYYY-MM-DD`, o `null` si se borró el campo. */
  onChange: (fecha: string | null) => void;
  /**
   * La zona en la que se lee un `timestamptz` guardado. Se pasa cuando el dato
   * es de la organización (por ejemplo, la fecha del próximo paso de Closing):
   * la zona de la org (`organizations.timezone`; `null` = la de por defecto),
   * para que todos los miembros vean el mismo día. Sin `zona`, se lee en la del
   * navegador.
   */
  zona?: string | null;
};

/**
 * El campo de fecha de la app: un `<input type="date">` (el `Input` de
 * `@ai-coo/ui`) que habla en fechas calendario.
 *
 * ⭐ El valor guardado pasa por `fechaDeValorGuardado` (con `zona`) o por
 * `aFechaDeInput` (sin ella), así que un `timestamptz` se muestra con el día
 * que se eligió y no con el de UTC (de noche en Argentina,
 * `toISOString().slice(0, 10)` ya da el día siguiente). Lo que sale por
 * `onChange` es exactamente la fecha elegida: si va a una columna
 * `timestamptz`, se guarda con `fechaAInstanteEnZona` en la misma `zona` para
 * que vuelva a mostrarse igual.
 *
 * Acepta las mismas props que `Input` (`disabled`, `min`, `max`, `id`,
 * `className`, etc.); `min` y `max` son fechas `YYYY-MM-DD` (por ejemplo,
 * `fechaDeHoyLocal()`).
 */
export function CampoFecha({ value, onChange, zona, ...props }: CampoFechaProps) {
  return (
    <Input
      {...props}
      type="date"
      value={zona === undefined ? aFechaDeInput(value) : fechaDeValorGuardado(value, zona)}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}
