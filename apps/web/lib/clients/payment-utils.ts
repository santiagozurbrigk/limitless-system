import type { ClosePaymentPayload } from "@/types/closing";

/**
 * La fecha de hoy (YYYY-MM-DD) en la zona horaria de quien registra el pago.
 * `toISOString()` da la de UTC: de noche en Argentina ya es el día siguiente
 * y el pago quedaba registrado con fecha de mañana (SCRUM-104).
 */
export function fechaDeHoyLocal(ahora: Date = new Date()): string {
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, "0");
  const d = String(ahora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getPaidAmountFromClosePayload(payment: ClosePaymentPayload): number {
  if (payment.paidAmount > 0) return payment.paidAmount;
  if (payment.paymentType === "upfront") return payment.totalAmount ?? 0;
  if (payment.paymentType === "installments") {
    // Con montos manuales por cuota, lo pagado al cerrar es la primera cuota;
    // `installmentAmount` es el promedio, que puede no coincidir con ninguna.
    return payment.customInstallmentAmounts?.[0] ?? payment.installmentAmount ?? 0;
  }
  return payment.upfrontAmount ?? 0;
}

export function getPaymentDateFromClosePayload(payment: ClosePaymentPayload): string {
  if (payment.paymentDate) return payment.paymentDate;
  if (payment.paymentType === "installments" && payment.firstInstallmentDate) {
    return payment.firstInstallmentDate;
  }
  return fechaDeHoyLocal();
}

export function installmentNumberForClosePayload(
  payment: ClosePaymentPayload
): number | null {
  return payment.paymentType === "installments" ? 1 : null;
}
