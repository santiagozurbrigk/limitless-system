import type { ClosePaymentPayload } from "@/types/closing";

export function getPaidAmountFromClosePayload(payment: ClosePaymentPayload): number {
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
