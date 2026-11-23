import { z } from "zod";
import { uuidSchema } from "@/lib/validations";
import { ETAPAS_DEL_LEAD } from "@/lib/webinar/vistas/contratos";

/**
 * ⭐ Las entradas de las tres acciones simuladas de la ficha (SCRUM-545,
 * DT-12). Viven acá y no en `app/leads/actions.ts` porque un archivo
 * `"use server"` sólo exporta funciones async.
 *
 * `ETAPAS_DEL_LEAD` se usa sólo para validar la etapa recibida: el paso
 * siguiente sale del mapa explícito de `config.ts` (DT-14).
 */

export const marcarAvanceSchema = z.object({
  leadId: uuidSchema,
  launchId: uuidSchema,
  etapaActual: z.enum(ETAPAS_DEL_LEAD, "Etapa inválida"),
});

export const asignarResponsableSchema = z.object({
  leadId: uuidSchema,
  launchId: uuidSchema,
  responsableUserId: uuidSchema.nullable(),
});

export const agregarNotaSchema = z.object({
  leadId: uuidSchema,
  launchId: uuidSchema,
  texto: z
    .string()
    .trim()
    .min(1, "Escribí la nota antes de agregarla")
    .max(5000, "Máximo 5.000 caracteres"),
});

export type MarcarAvanceInput = z.input<typeof marcarAvanceSchema>;
export type AsignarResponsableInput = z.input<typeof asignarResponsableSchema>;
export type AgregarNotaInput = z.input<typeof agregarNotaSchema>;
