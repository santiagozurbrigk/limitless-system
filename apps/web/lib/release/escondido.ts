/**
 * Lo que se esconde para el release de octubre (SCRUM-490).
 *
 * ⭐ Regla de la planificación: lo que está roto y no entra en el release se
 * esconde, no se borra. Nada de esto toca lógica ni datos: cada pieza sigue en
 * el código y su pendiente sigue abierto en `PENDIENTES.md`. Para volver a
 * mostrar algo, se pone su bandera en `false`.
 *
 * El detalle de cada ítem (por qué está roto y qué pendiente lo arregla) está
 * en `docs/FUNCIONAL.md` § "Escondido para el release de octubre".
 */
export const ESCONDIDO = {
  /** Login: "¿Olvidaste tu contraseña?". Funciona desde SCRUM-16 (mail por el SMTP de Resend). */
  olvideContrasena: false,
  /** Ajustes → Notificaciones: 9 interruptores que no mandan nada. */
  ajustesNotificaciones: true,
  /** Closing → Equipo: el ranking de closers sale siempre vacío ([CLOSER-AMOUNT-CLOSED]). */
  closingEquipo: true,
  /** Recuadro "Vista previa" de Fathom en el turno: placeholder sin contenido. */
  vistaPreviaFathomEnTurno: true,
  /** Marketing → Overview: lee la integración vieja de Instagram, casi siempre vacía. */
  marketingOverview: true,
  /** Marketing → Conexión con Ventas y "Atribución de ventas" de una pieza: siempre vacías. */
  marketingConexionVentas: true,
  /** Marketing → Administrar → "Nueva carpeta": siempre da error. */
  marketingNuevaCarpeta: true,
  /** Lead Magnets: canales que no registran leads (Typeform, Google Forms, Landing, ManyChat). */
  leadMagnetsCanalesSinCaptura: true,
  /** Integraciones → ManyChat: lo que trae va a una bandeja que ninguna pantalla muestra. */
  integracionManyChat: true,
  /** `/redesign-preview`, `/demo` y `/design-system`: pantallas internas o maquetas. */
  pantallasInternas: true,
  /** `/lanzamientos`: "Próximamente", sin lanzamientos cargados. */
  lanzamientos: true,
} as const;
