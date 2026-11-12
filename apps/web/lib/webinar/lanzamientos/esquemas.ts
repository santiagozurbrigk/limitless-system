import { z } from "zod";
import { uuidSchema } from "@/lib/validations";
import type { EstadoDelLanzamiento } from "@/lib/webinar/vistas/contratos";

/**
 * ⭐ Crear y editar un lanzamiento (SCRUM-529): la entrada de las acciones y la
 * regla de lanzamientos en paralelo. Viven acá y no en
 * `app/lanzamientos/actions.ts` porque un archivo `"use server"` sólo exporta
 * funciones async. Los nombres de los campos siguen el contrato de vista
 * (SCRUM-542); los valores de `variante`, los del modelo (SCRUM-526).
 */

export const VARIANTES = ["organic", "paid", "paid_plus"] as const;
export const MAXIMO_DE_SESIONES = 10;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const fechaCalendario = z
  .string()
  .regex(FECHA, "Usá el formato AAAA-MM-DD")
  .nullable();

export const sesionSchema = z.object({
  empiezaAt: z.string().datetime({ offset: true, message: "Cargá la fecha y hora de la sesión" }),
  zoomWebinarId: z.string().trim().max(64, "Máximo 64 caracteres").nullable(),
  segundoDeLaOferta: z
    .number()
    .int("El segundo de la oferta es un número entero")
    .min(0, "El segundo de la oferta no puede ser negativo")
    .max(6 * 60 * 60, "El segundo de la oferta es de una sesión de hasta 6 horas")
    .nullable(),
});

export const datosDelLanzamientoSchema = z
  .object({
    nombre: z.string().trim().min(1, "Poné un nombre al lanzamiento").max(120, "Máximo 120 caracteres"),
    variante: z.enum(VARIANTES, "Elegí la variante"),
    moneda: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "La moneda es un código de 3 letras (USD, ARS...)"),
    precioDeLaOferta: z.number().min(0, "El precio no puede ser negativo").nullable(),
    captaDesde: fechaCalendario,
    cierraEl: fechaCalendario,
    sesiones: z.array(sesionSchema).max(MAXIMO_DE_SESIONES, `Hasta ${MAXIMO_DE_SESIONES} sesiones`),
  })
  .refine((d) => !d.captaDesde || !d.cierraEl || d.captaDesde <= d.cierraEl, {
    message: "El cierre no puede ser antes del inicio de la captación",
    path: ["cierraEl"],
  });

export const editarLanzamientoSchema = z.object({
  launchId: uuidSchema,
  datos: datosDelLanzamientoSchema,
});

export type DatosDelLanzamiento = z.output<typeof datosDelLanzamientoSchema>;
export type DatosDelLanzamientoInput = z.input<typeof datosDelLanzamientoSchema>;

/**
 * Cuántos lanzamientos puede tener una cuenta captando a la vez. **Pendiente
 * de decisión** (SCRUM-522, pregunta 6 del diseño: "¿Cuántos lanzamientos en
 * paralelo puede tener una cuenta?"). Con `null` no hay límite: no se inventa
 * una regla. Cuando se decida, se pone el número acá y la validación se aplica
 * sola (`[WEBINAR-LANZAMIENTOS-EN-PARALELO]`).
 */
export const LANZAMIENTOS_EN_PARALELO: number | null = null;

export type PeriodoDeLanzamiento = {
  id: string;
  estado: EstadoDelLanzamiento;
  captaDesde: string | null;
  cierraEl: string | null;
};

/** Si dos períodos de calendario se pisan. Sin una de las fechas, se toma abierto hacia ese lado. */
function sePisan(a: PeriodoDeLanzamiento, b: Pick<PeriodoDeLanzamiento, "captaDesde" | "cierraEl">): boolean {
  const inicioA = a.captaDesde ?? "0000-01-01";
  const finA = a.cierraEl ?? "9999-12-31";
  const inicioB = b.captaDesde ?? "0000-01-01";
  const finB = b.cierraEl ?? "9999-12-31";
  return inicioA <= finB && inicioB <= finA;
}

/**
 * Por qué no se puede guardar `nuevo` por superposición con los otros
 * lanzamientos de la cuenta, o `null` si se puede. Cuenta los que no están
 * cerrados y se pisan en fechas con `nuevo` (sin contarse a sí mismo al
 * editar). Con `maximo` `null` nunca rechaza.
 */
export function motivoDeSuperposicion(
  otros: readonly PeriodoDeLanzamiento[],
  nuevo: Pick<PeriodoDeLanzamiento, "captaDesde" | "cierraEl"> & { id?: string },
  maximo: number | null = LANZAMIENTOS_EN_PARALELO
): string | null {
  if (maximo === null) return null;
  const pisados = otros.filter((o) => o.id !== nuevo.id && o.estado !== "closed" && sePisan(o, nuevo));
  if (pisados.length < maximo) return null;
  return maximo === 1
    ? "Ya hay otro lanzamiento en esas fechas: una cuenta corre uno a la vez."
    : `Ya hay ${pisados.length} lanzamientos en esas fechas: una cuenta corre hasta ${maximo} a la vez.`;
}
