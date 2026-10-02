"use client";

import React, { useEffect, useState, useTransition } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  SteppedAlert,
  Textarea,
} from "@ai-coo/ui";
import { AlertTriangle } from "lucide-react";
import {
  PaymentReceiptDropzone,
  uploadPaymentReceiptFile,
} from "@/components/sales/payment-receipt-dropzone";
import { useFinanceData } from "@/providers";
import type { ClosePaymentPayload } from "@/types/closing";
import { fechaDeHoyLocal } from "@/lib/clients/payment-utils";
import type { Plan } from "@/types/plans";
import Link from "next/link";
import { paths } from "@/routes";
import { getProfileAreaDataAction } from "@/app/profile/actions";
import { listPlansAction } from "@/app/clients/plan-actions";

const selectClass =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function platformLabel(
  id: string,
  platforms: { id: string; name: string; accountLabel?: string }[]
) {
  const p = platforms.find((x) => x.id === id);
  if (!p) return id;
  return p.accountLabel ? `${p.name} — ${p.accountLabel}` : p.name;
}

function paidAmountForType(
  paymentType: ClosePaymentPayload["paymentType"],
  values: {
    totalAmount: string;
    installmentAmount: string;
    upfrontAmount: string;
  }
): number {
  if (paymentType === "upfront") return Number(values.totalAmount) || 0;
  if (paymentType === "installments") return Number(values.installmentAmount) || 0;
  return Number(values.upfrontAmount) || 0;
}

export function PaymentModal({
  open,
  onOpenChange,
  defaultName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onSubmit: (payload: ClosePaymentPayload) => Promise<void>;
}) {
  const { paymentPlatforms } = useFinanceData();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [clientName, setClientName] = useState(defaultName);
  const [offeredProduct, setOfferedProduct] = useState("");
  const [avatar, setAvatar] = useState("");
  const [mainPain, setMainPain] = useState("");
  const [objections, setObjections] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [paymentReceivedFrom, setPaymentReceivedFrom] = useState("");
  const [paymentDestId, setPaymentDestId] = useState(
    paymentPlatforms[0]?.id ?? ""
  );
  const [paymentType, setPaymentType] = useState<
    "upfront" | "installments" | "upfront_fee"
  >("upfront");
  const [totalAmount, setTotalAmount] = useState("");
  const [installmentCount, setInstallmentCount] = useState("3");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [firstDate, setFirstDate] = useState("");
  const [upfrontAmount, setUpfrontAmount] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeFrequency, setFeeFrequency] = useState<"monthly" | "weekly">(
    "monthly"
  );
  const [fathomUrl, setFathomUrl] = useState("");
  const [closerName, setCloserName] = useState("");

  // ── Planes y sistemas de cuotas ──────────────────────────────────────────
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedSystemId, setSelectedSystemId] = useState<string>("");
  /** Montos manuales por cuota (un elemento por cuota del sistema seleccionado) */
  const [customInstallmentAmounts, setCustomInstallmentAmounts] = useState<string[]>([]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const selectedSystem = selectedPlan?.installmentSystems.find(
    (s) => s.id === selectedSystemId
  );

  // Cuando se elige un sistema, inicializar los montos con el default del sistema
  useEffect(() => {
    if (!selectedSystem) {
      setCustomInstallmentAmounts([]);
      return;
    }
    setInstallmentCount(String(selectedSystem.count));
    setCustomInstallmentAmounts(
      Array.from({ length: selectedSystem.count }, () =>
        String(selectedSystem.amountPerInstallment || "")
      )
    );
  }, [selectedSystem]);

  // Cuando cambia el count manualmente (sin sistema), reinicializar custom amounts
  const handleInstallmentCountChange = (val: string) => {
    setInstallmentCount(val);
    const n = Number(val) || 0;
    if (!selectedSystem) {
      // Sin sistema: distribuir el mismo monto manual en N cuotas
      setCustomInstallmentAmounts(
        Array.from({ length: n }, () => installmentAmount)
      );
    }
  };

  const updateCustomAmount = (index: number, value: string) => {
    setCustomInstallmentAmounts((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };


  useEffect(() => {
    if (open) {
      setClientName(defaultName);
      setProofFile(null);
      setError(null);
      setPaymentReceivedFrom("");
      setSelectedPlanId("");
      setSelectedSystemId("");
      setCustomInstallmentAmounts([]);
      if (!paymentDestId && paymentPlatforms[0]) {
        setPaymentDestId(paymentPlatforms[0].id);
      }
      void getProfileAreaDataAction().then((data) => {
        setCloserName(data?.userName?.trim() ?? "");
      });
      // Cargar planes
      void listPlansAction().then(setPlans);
    }
  }, [open, defaultName, paymentPlatforms, paymentDestId]);

  // Cuando se elige un plan, pre-llenar el producto ofrecido
  useEffect(() => {
    if (selectedPlan && !offeredProduct) {
      setOfferedProduct(selectedPlan.name);
    }
  }, [selectedPlan, offeredProduct]);

  // Cuando se desmarca el plan, resetear sistema
  useEffect(() => {
    setSelectedSystemId("");
    setCustomInstallmentAmounts([]);
  }, [selectedPlanId]);

  const handleSubmit = () => {
    // Validar monto
    let paidAmount: number;
    if (paymentType === "installments" && customInstallmentAmounts.length > 0) {
      paidAmount = Number(customInstallmentAmounts[0]) || 0;
    } else {
      paidAmount = paidAmountForType(paymentType, {
        totalAmount,
        installmentAmount,
        upfrontAmount,
      });
    }

    if (paidAmount <= 0) {
      setError("Ingresá el monto pagado.");
      return;
    }

    if (paymentType === "installments" && !firstDate) {
      setError("Ingresá la fecha de la primera cuota.");
      return;
    }

    if (!paymentDestId) {
      setError("Seleccioná el destino del pago.");
      return;
    }

    if (!paymentReceivedFrom.trim()) {
      setError("Indicá desde dónde recibiste el pago.");
      return;
    }

    if (!proofFile) {
      setError("El comprobante de pago es obligatorio.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const uploaded = await uploadPaymentReceiptFile(proofFile);
      if (!uploaded.ok) {
        setError(uploaded.error);
        return;
      }

      const payload: ClosePaymentPayload = {
        clientName: clientName.trim() || defaultName,
        paymentReceivedFrom: paymentReceivedFrom.trim(),
        paymentDestinationPlatformId: paymentDestId,
        closedByName: closerName.trim() || "Usuario",
        paymentType,
        paidAmount,
        paymentDate:
          paymentType === "installments" && firstDate
            ? firstDate
            : fechaDeHoyLocal(),
        proof: {
          storagePath: uploaded.storagePath,
          mimeType: uploaded.mimeType,
          fileName: uploaded.fileName,
        },
        fathomUrl: fathomUrl.trim() || undefined,
        offeredProduct: offeredProduct.trim() || undefined,
        avatar: avatar.trim() || undefined,
        mainPain: mainPain.trim() || undefined,
        objections: objections.trim() || undefined,
        feedbackNotes: feedbackNotes.trim() || undefined,
        planId: selectedPlanId || undefined,
        selectedInstallmentSystemId: selectedSystemId || undefined,
      };

      if (paymentType === "upfront") {
        payload.totalAmount = Number(totalAmount) || 0;
      } else if (paymentType === "installments") {
        const count = Number(installmentCount) || 1;
        payload.installmentCount = count;

        if (customInstallmentAmounts.length > 0) {
          // Montos manuales por cuota
          payload.customInstallmentAmounts = customInstallmentAmounts
            .slice(0, count)
            .map((v) => Number(v) || 0);
          // installmentAmount = promedio (referencia)
          const total = payload.customInstallmentAmounts.reduce((s, a) => s + a, 0);
          payload.installmentAmount = count > 0 ? total / count : 0;
        } else {
          payload.installmentAmount = Number(installmentAmount) || 0;
        }
        payload.firstInstallmentDate = firstDate;
      } else {
        payload.upfrontAmount = Number(upfrontAmount) || 0;
        payload.feeAmount = Number(feeAmount) || 0;
        payload.feeFrequency = feeFrequency;
      }

      try {
        await onSubmit(payload);
        onOpenChange(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el cierre");
      }
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  // Para cuotas con sistema seleccionado: mostrar N campos individuales
  const showCustomInstallments =
    paymentType === "installments" &&
    (selectedSystem != null || customInstallmentAmounts.length > 0);
  const installmentFieldCount = showCustomInstallments
    ? Number(installmentCount) || 1
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,820px)] w-[min(96vw,1120px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:aspect-video">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>Registrar pago y crear cliente</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
            <section className="space-y-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cliente y pago
              </p>
              <FormField label="Nombre completo del cliente">
                <Input
                  value={clientName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientName(e.target.value)}
                  disabled={pending}
                />
              </FormField>

              {/* Selector de plan (opcional) */}
              {plans.length > 0 && (
                <FormField label="Plan contratado (opcional)">
                  <select
                    className={selectClass}
                    value={selectedPlanId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedPlanId(e.target.value)}
                    disabled={pending}
                  >
                    <option value="">Sin plan específico</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.durationDays ? ` (${p.durationDays} días)` : ""}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}

              {paymentPlatforms.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Pago recibido desde">
                    <Input
                      placeholder='Ej. "Transferencia Banco Galicia", "Wise USD"'
                      value={paymentReceivedFrom}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPaymentReceivedFrom(e.target.value)}
                      disabled={pending}
                    />
                  </FormField>
                  <FormField label="Destino del pago">
                    <select
                      className={selectClass}
                      value={paymentDestId}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPaymentDestId(e.target.value)}
                      disabled={pending}
                    >
                      <option value="">Seleccionar destino…</option>
                      {paymentPlatforms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {platformLabel(p.id, paymentPlatforms)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
              ) : (
                <SteppedAlert
                  variant="warning"
                  title="Plataformas de pago sin configurar"
                  icon={<AlertTriangle className="h-4 w-4" />}
                >
                  Configurá al menos un destino de cobro en{" "}
                  <Link
                    href={paths.platform.settings}
                    className="font-medium underline"
                  >
                    Configuración → Pagos
                  </Link>{" "}
                  antes de registrar el cierre.
                </SteppedAlert>
              )}

              <FormField label="Tipo de pago">
                <select
                  className={selectClass}
                  value={paymentType}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setPaymentType(e.target.value as typeof paymentType)
                  }
                  disabled={pending}
                >
                  <option value="upfront">Pago único (upfront)</option>
                  <option value="installments">Cuotas</option>
                  <option value="upfront_fee">Upfront + fee</option>
                </select>
              </FormField>

              {paymentType === "upfront" && (
                <>
                  <FormField label="Monto total pagado">
                    <Input
                      type="number"
                      value={totalAmount}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTotalAmount(e.target.value)}
                      disabled={pending}
                    />
                  </FormField>
                  <FormField label="Comprobante de pago">
                    <PaymentReceiptDropzone
                      file={proofFile}
                      onFileChange={setProofFile}
                      disabled={pending}
                    />
                  </FormField>
                </>
              )}

              {paymentType === "installments" && (
                <div className="space-y-3">
                  {/* Si hay plan seleccionado con sistemas de cuotas, mostrar selector */}
                  {selectedPlan && selectedPlan.installmentSystems.length > 0 && (
                    <FormField label="Sistema de cuotas">
                      <select
                        className={selectClass}
                        value={selectedSystemId}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSystemId(e.target.value)}
                        disabled={pending}
                      >
                        <option value="">Elegir sistema de cuotas…</option>
                        {selectedPlan.installmentSystems.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name || `${s.count} cuotas`}
                            {s.amountPerInstallment > 0
                              ? ` — $${s.amountPerInstallment.toLocaleString("es-AR")} c/u`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Número de cuotas">
                      <Input
                        type="number"
                        value={installmentCount}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInstallmentCountChange(e.target.value)}
                        disabled={pending || !!selectedSystem}
                      />
                    </FormField>
                    <FormField label="Fecha primera cuota">
                      <Input
                        type="date"
                        value={firstDate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstDate(e.target.value)}
                        disabled={pending}
                      />
                    </FormField>
                  </div>

                  {/* Montos por cuota: si hay sistema seleccionado o ya se inicializaron */}
                  {showCustomInstallments && installmentFieldCount > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Monto acordado por cuota (podés modificar cada uno):
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {Array.from({ length: installmentFieldCount }, (_, i) => (
                          <FormField key={i} label={`Cuota ${i + 1}`}>
                            <Input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={customInstallmentAmounts[i] ?? ""}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCustomAmount(i, e.target.value)}
                              disabled={pending}
                            />
                          </FormField>
                        ))}
                      </div>
                      {installmentFieldCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Total:{" "}
                          <span className="font-medium text-foreground">
                            $
                            {customInstallmentAmounts
                              .slice(0, installmentFieldCount)
                              .reduce((s, v) => s + (Number(v) || 0), 0)
                              .toLocaleString("es-AR")}
                          </span>
                        </p>
                      )}
                    </div>
                  ) : (
                    // Sin sistema seleccionado: monto uniforme
                    <FormField label="Monto por cuota">
                      <Input
                        type="number"
                        value={installmentAmount}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInstallmentAmount(e.target.value)}
                        disabled={pending}
                      />
                    </FormField>
                  )}

                  <FormField label="Comprobante primera cuota">
                    <PaymentReceiptDropzone
                      file={proofFile}
                      onFileChange={setProofFile}
                      disabled={pending}
                      label="Subir comprobante de la primera cuota"
                    />
                  </FormField>
                </div>
              )}

              {paymentType === "upfront_fee" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Monto upfront">
                    <Input
                      type="number"
                      value={upfrontAmount}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUpfrontAmount(e.target.value)}
                      disabled={pending}
                    />
                  </FormField>
                  <FormField label="Monto fee">
                    <Input
                      type="number"
                      value={feeAmount}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFeeAmount(e.target.value)}
                      disabled={pending}
                    />
                  </FormField>
                  <FormField label="Frecuencia del fee">
                    <select
                      className={selectClass}
                      value={feeFrequency}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setFeeFrequency(e.target.value as "monthly" | "weekly")
                      }
                      disabled={pending}
                    >
                      <option value="monthly">Mensual</option>
                      <option value="weekly">Semanal</option>
                    </select>
                  </FormField>
                  <FormField label="Comprobante" className="sm:col-span-2">
                    <PaymentReceiptDropzone
                      file={proofFile}
                      onFileChange={setProofFile}
                      disabled={pending}
                    />
                  </FormField>
                </div>
              )}

              <FormField label="Enlace Fathom de la llamada (opcional)">
                <Input
                  placeholder="https://fathom.video/..."
                  value={fathomUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFathomUrl(e.target.value)}
                  disabled={pending}
                />
              </FormField>
            </section>

            <section className="space-y-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Contexto del cierre
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Producto ofrecido">
                  <Input
                    placeholder="Ej. Programa High Ticket 12 semanas"
                    value={offeredProduct}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOfferedProduct(e.target.value)}
                    disabled={pending}
                  />
                </FormField>
                <FormField label="Avatar">
                  <Input
                    placeholder="Ej. Coach 35–50 años, factura 20k/mes"
                    value={avatar}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAvatar(e.target.value)}
                    disabled={pending}
                  />
                </FormField>
              </div>
              <FormField label="Dolor principal">
                <Textarea
                  rows={3}
                  placeholder="¿Qué problema urgente quería resolver?"
                  value={mainPain}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMainPain(e.target.value)}
                  disabled={pending}
                />
              </FormField>
              <FormField label="Objeciones">
                <Textarea
                  rows={3}
                  placeholder="Precio, timing, pareja, falta de claridad…"
                  value={objections}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObjections(e.target.value)}
                  disabled={pending}
                />
              </FormField>
              <FormField label="Feedback / Notas">
                <Textarea
                  rows={4}
                  placeholder="Resumen de la llamada, próximos pasos, acuerdos…"
                  value={feedbackNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFeedbackNotes(e.target.value)}
                  disabled={pending}
                />
              </FormField>
            </section>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={pending || !proofFile}>
            {pending ? "Guardando…" : "Confirmar y añadir a Clientes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
