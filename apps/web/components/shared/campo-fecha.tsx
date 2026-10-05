"use client";

import { Input, type InputProps } from "@ai-coo/ui";
import { fechaDeValorGuardado } from "@/lib/fechas/calendario";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";

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
   * La zona en la que se lee un `timestamptz` guardado. Por defecto, la de la
   * organización (`useZonaDeLaOrganizacion`): todos los miembros ven el mismo
   * día, estén donde estén. Se pasa sólo para leer en otra zona.
   */
  zona?: string | null;
};

/**
 * El campo de fecha de la app: un `<input type="date">` (el `Input` de
 * `@ai-coo/ui`) que habla en fechas calendario.
 *
 * ⭐ El valor guardado pasa por `fechaDeValorGuardado` en la zona de la
 * organización, así que un `timestamptz` se muestra con el día que se eligió y
 * no con el de UTC (de noche en Argentina, `toISOString().slice(0, 10)` ya da
 * el día siguiente) ni con el del navegador de quien mira. Una fecha
 * `YYYY-MM-DD` (columna `date`) se muestra tal cual. Lo que sale por `onChange`
 * es exactamente la fecha elegida: si va a una columna `timestamptz`, se guarda
 * con `fechaAInstanteEnZona` en la zona de la organización para que vuelva a
 * mostrarse igual.
 *
 * Acepta las mismas props que `Input` (`disabled`, `min`, `max`, `id`,
 * `className`, etc.); `min` y `max` son fechas `YYYY-MM-DD` (por ejemplo, el
 * hoy de la organización de `useHoyDeLaOrganizacion`).
 */
export function CampoFecha({ value, onChange, zona, ...props }: CampoFechaProps) {
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  return (
    <Input
      {...props}
      type="date"
      value={fechaDeValorGuardado(value, zona === undefined ? zonaDeLaOrganizacion : zona)}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}
