import type { ClosePaymentPayload } from "@/types/closing";

/**
 * Un monto en centavos (SCRUM-504): la columna de los pagos es numeric(12,2).
 * El ruido del punto flotante (0.1 + 0.2) se redondea; un monto con más de dos
 * decimales de verdad (333.333) devuelve `null`.
 */
export function montoACentavos(monto: number): number | null {
  if (!Number.isFinite(monto)) return null;
  if (Math.abs(monto * 100 - Math.round(monto * 100)) >= 1e-6) return null;
  return redondearACentavos(monto);
}

/**
 * El mismo monto redondeado a centavos, sin rechazarlo (333.333 → 333.33),
 * igual que la columna numeric(12,2): la mitad se redondea hacia arriba sobre
 * el decimal que se escribió. `Math.round(1.005 * 100)` da 100 (en binario
 * 1.005 * 100 es 100.49999…), pero la base guarda 1.005 como 1.01; por eso se
 * corrige el error de representación con `toPrecision(12)` antes de redondear
 * (alcanza para montos de hasta 10.000.000, el máximo de `moneySchema`).
 */
export function redondearACentavos(monto: number): number {
  return Math.round(Number((monto * 100).toPrecision(12))) / 100;
}

/**
 * Lo pagado al cerrar una venta, en centavos (SCRUM-504): el pago se registra
 * después de cerrar la llamada y crear el cliente, así que no puede rechazarse
 * por los decimales y dejar la venta cerrada a medias. Se redondea como la
 * columna (`redondearACentavos`): 333.333 → 333.33 y 1.005 → 1.01, lo mismo
 * que guardaba la base antes del límite de dos decimales.
 */
export function getPaidAmountFromClosePayload(payment: ClosePaymentPayload): number {
  return redondearACentavos(montoPagadoAlCerrar(payment));
}

function montoPagadoAlCerrar(payment: ClosePaymentPayload): number {
  if (payment.paidAmount > 0) return payment.paidAmount;
  if (payment.paymentType === "upfront") return payment.totalAmount ?? 0;
  if (payment.paymentType === "installments") {
    // Con montos manuales por cuota, lo pagado al cerrar es la primera cuota;
    // `installmentAmount` es el promedio, que puede no coincidir con ninguna.
    const primeraCuota = payment.customInstallmentAmounts?.[0];
    if (primeraCuota != null && primeraCuota > 0) return primeraCuota;
    return payment.installmentAmount ?? 0;
  }
  return payment.upfrontAmount ?? 0;
}

/**
 * La fecha del pago que se registra. Sin fecha en el payload, `hoy`: el de la
 * zona de la organización (`fechaDeHoyEnZona`), que arma quien llama. Antes
 * era el del navegador (SCRUM-104); para quien está en la zona de la org da lo
 * mismo, y así coincide para todos los miembros (SCRUM-493).
 */
export function getPaymentDateFromClosePayload(
  payment: ClosePaymentPayload,
  hoy: string
): string {
  if (payment.paymentDate) return payment.paymentDate;
  if (payment.paymentType === "installments" && payment.firstInstallmentDate) {
    return payment.firstInstallmentDate;
  }
  return hoy;
}

export function installmentNumberForClosePayload(
  payment: ClosePaymentPayload
): number | null {
  return payment.paymentType === "installments" ? 1 : null;
}
