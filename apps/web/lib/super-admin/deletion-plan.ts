/**
 * ⭐ Qué se lleva puesto una baja, y si se puede confirmar.
 *
 * Lógica pura: no toca base ni red. Está separada porque las dos preguntas que
 * decide son las que no se pueden probar apretando el botón —hacerlo destruye
 * los datos—:
 *
 *   1. **¿El texto que escribió la persona autoriza la baja?**
 *   2. **¿Qué hay que advertirle antes?**
 *
 * La regla de fondo: una baja irreversible no se confirma con un "sí". Se
 * confirma escribiendo el nombre exacto de lo que se va a borrar, porque eso
 * obliga a leerlo. Un diálogo de "¿estás seguro?" se contesta con el mouse en
 * piloto automático; un nombre hay que tipearlo mirando.
 */

/** Los buckets cuyos archivos están organizados por organización. */
export const BUCKETS_POR_ORGANIZACION = [
  "agent-documents",
  "avatars",
  "business-context-documents",
  "client-payment-receipts",
  "client-wins",
  "content-thumbnails",
  "sop-attachments",
  "sop-videos",
  "trial-reels",
  "workboard-task-attachments",
] as const;

/**
 * Los que **no** van, y por qué.
 *
 * `ai-brain-documents` es la biblioteca del super admin, no de una
 * organización.
 */
export const BUCKETS_FUERA_DE_ALCANCE = ["ai-brain-documents"] as const;

export type ConteoDeBaja = {
  perfiles: number;
  clientes: number;
  archivos: number;
  /** Negocios enlazados, cuando la organización es un holding. */
  negociosDelHolding: number;
};

export type Advertencia = {
  /** Para poder testear y ordenar sin depender del texto. */
  clave:
    | "holding-con-negocios"
    | "es-uno-mismo"
    | "ultimo-founder"
    | "tiene-datos"
    | "tiene-archivos";
  texto: string;
  /** `true` cuando impide la baja, no sólo avisa. */
  bloquea: boolean;
};

/**
 * Normaliza para comparar el texto de confirmación.
 *
 * Se ignoran mayúsculas y espacios de más porque un nombre copiado de la
 * pantalla trae espacios invisibles, y frenar por eso enseña a la gente a
 * pelearse con el diálogo en vez de a leerlo. Lo que **no** se ignora son los
 * acentos: "Optimiza" y "Optímiza" son nombres distintos, y acá la precisión
 * es el punto.
 */
export function normalizarConfirmacion(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").toLowerCase();
}

export function confirmacionValida(escrito: string, nombreExacto: string): boolean {
  const objetivo = normalizarConfirmacion(nombreExacto);
  // Un objetivo vacío no se puede confirmar: si no, un nombre en blanco haría
  // que cualquier texto vacío autorizara la baja.
  if (!objetivo) return false;
  return normalizarConfirmacion(escrito) === objetivo;
}

export function advertenciasDeOrganizacion(input: {
  conteo: ConteoDeBaja;
  esHolding: boolean;
  incluyeAlEjecutor: boolean;
}): Advertencia[] {
  const avisos: Advertencia[] = [];

  if (input.incluyeAlEjecutor) {
    avisos.push({
      clave: "es-uno-mismo",
      texto:
        "Tu propia cuenta pertenece a esta organización. No podés borrar la organización desde la que estás trabajando.",
      bloquea: true,
    });
  }

  if (input.esHolding && input.conteo.negociosDelHolding > 0) {
    avisos.push({
      clave: "holding-con-negocios",
      texto: `Es un holding con ${input.conteo.negociosDelHolding} ${
        input.conteo.negociosDelHolding === 1 ? "negocio enlazado" : "negocios enlazados"
      }. Los negocios NO se borran: quedan como organizaciones sueltas.`,
      bloquea: false,
    });
  }

  if (input.conteo.clientes > 0) {
    avisos.push({
      clave: "tiene-datos",
      texto: `Se borran ${input.conteo.clientes} clientes con todo su historial: pagos, llamadas, hitos y notas.`,
      bloquea: false,
    });
  }

  if (input.conteo.archivos > 0) {
    avisos.push({
      clave: "tiene-archivos",
      texto: `Se borran ${input.conteo.archivos} archivos de Storage: comprobantes, adjuntos de SOPs y documentos.`,
      bloquea: false,
    });
  }

  return avisos;
}

export function advertenciasDeUsuario(input: {
  esElEjecutor: boolean;
  esUltimoFounder: boolean;
  organizacion: string;
}): Advertencia[] {
  const avisos: Advertencia[] = [];

  if (input.esElEjecutor) {
    avisos.push({
      clave: "es-uno-mismo",
      texto: "Es tu propia cuenta. No podés borrarte a vos mismo.",
      bloquea: true,
    });
  }

  if (input.esUltimoFounder) {
    avisos.push({
      clave: "ultimo-founder",
      texto: `Es el único founder de ${input.organizacion}. La organización queda sin dueño: nadie va a poder administrar su equipo ni sus integraciones.`,
      bloquea: false,
    });
  }

  return avisos;
}

export function estaBloqueada(avisos: readonly Advertencia[]): boolean {
  return avisos.some((aviso) => aviso.bloquea);
}
