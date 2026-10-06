/**
 * Un rechazo que se conoce y se le explica al usuario: validación, sesión,
 * permiso, recurso inexistente o de otra organización, configuración que
 * falta. Las server actions lo lanzan dentro de `runMutation` o
 * `mutacionConErroresEsperables` (`lib/server/action-result.ts`) y vuelve como
 * el `error` del `MutationResult`, sin registrarse como falla.
 *
 * Todo lo demás es inesperado (una caída de la red o de la base, una RLS que
 * rechaza, un bug) y se registra en el servidor y en Sentry.
 *
 * Vive en un módulo sin dependencias para que lo puedan lanzar los helpers
 * compartidos (`requireOrganizationId`, `requireOrgRole`) sin arrastrar Sentry.
 */
export class ErrorEsperable extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorEsperable";
  }
}

export function esErrorEsperable(error: unknown): error is ErrorEsperable {
  return error instanceof ErrorEsperable;
}
