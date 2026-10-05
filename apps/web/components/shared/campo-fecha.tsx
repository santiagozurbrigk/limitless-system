"use client";

import { Input, type InputProps } from "@ai-coo/ui";
import { aFechaDeInput } from "@/lib/fechas/calendario";

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
};

/**
 * El campo de fecha de la app: un `<input type="date">` (el `Input` de
 * `@ai-coo/ui`) que habla en fechas calendario.
 *
 * ⭐ El valor guardado pasa por `aFechaDeInput`, así que un `timestamptz` se
 * muestra con el día que se eligió y no con el de UTC (de noche en Argentina,
 * `toISOString().slice(0, 10)` ya da el día siguiente). Lo que sale por
 * `onChange` es exactamente la fecha elegida: si va a una columna
 * `timestamptz`, se guarda con `fechaAInstanteLocal` para que vuelva a
 * mostrarse igual.
 *
 * Acepta las mismas props que `Input` (`disabled`, `min`, `max`, `id`,
 * `className`, etc.); `min` y `max` son fechas `YYYY-MM-DD` (por ejemplo,
 * `fechaDeHoyLocal()`).
 */
export function CampoFecha({ value, onChange, ...props }: CampoFechaProps) {
  return (
    <Input
      {...props}
      type="date"
      value={aFechaDeInput(value)}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}
