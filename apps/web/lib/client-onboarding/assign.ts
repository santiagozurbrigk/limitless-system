/**
 * Asignar un envío del link general: lo que no depende de la base.
 *
 * Lógica pura: no toca base ni red.
 */

/**
 * El growth partner que se crea desde la bandeja, con el nombre que puso el
 * equipo.
 *
 * ⭐ `clients` pide forma de pago y plataforma, y el formulario no pregunta
 * ninguna de las dos. Van los mismos valores que propone «Nuevo cliente»
 * (pago único, transferencia) con monto cero y estado *pendiente de
 * onboarding*: queda a la vista como un cliente a completar, y no suma
 * facturación inventada.
 *
 * `joinDate` es la fecha de alta (`YYYY-MM-DD`): hoy en la organización. La
 * arma quien llama con su zona; con `toISOString()` del servidor (UTC), un
 * alta de noche en Argentina quedaba con fecha de mañana (SCRUM-493).
 */
export function newClientFromOnboarding(
  organizationId: string,
  name: string,
  joinDate: string
): Record<string, unknown> {
  return {
    organization_id: organizationId,
    name: name.trim(),
    join_date: joinDate,
    payment_type: "upfront",
    platform: "bank_transfer",
    total_amount: 0,
    status: "pending_onboarding",
  };
}
