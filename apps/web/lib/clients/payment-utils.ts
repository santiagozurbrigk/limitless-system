import type { ClosePaymentPayload } from "@/types/closing";
import { fechaDeHoyLocal } from "@/lib/fechas/calendario";

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
