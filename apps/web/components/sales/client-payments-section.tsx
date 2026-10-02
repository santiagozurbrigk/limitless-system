"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  GlassPanel,
  Input,
} from "@ai-coo/ui";
import { ExternalLink, Plus } from "lucide-react";
import {
  addInstallmentPaymentAction,
  getClientPaymentReceiptUrlAction,
  listClientPaymentsAction,
  recordClientPaymentAction,
} from "@/app/sales/payment-actions";
import {
  PaymentReceiptDropzone,
  uploadPaymentReceiptFile,
} from "@/components/sales/payment-receipt-dropzone";
import { usePlatformData } from "@/providers";
import { useFinanceData } from "@/providers/finance-data-provider";
import { useToast } from "@/providers/toast-provider";
import type { Client, ClientPayment } from "@/types/clients";
import { fechaDeHoyLocal } from "@/lib/clients/payment-utils";

function formatMoney(amount: number) {
  return `$${amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function paymentLabel(payment: ClientPayment) {
  if (payment.installmentNumber != null) {
    return `Cuota ${payment.installmentNumber}`;
  }
  return "Pago único";
}

function PaymentProgressBar({ paid, total }: { paid: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.min(100, Math.round((paid / total) * 100));
  const isComplete = pct >= 100;

  let barClass = "bg-red-500";
  if (pct >= 100) barClass = "bg-green-500";
  else if (pct >= 60) barClass = "bg-primary";
  else if (pct >= 30) barClass = "bg-amber-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Progreso de cobros</span>
        <span
          className={`font-medium tabular-nums ${isComplete ? "text-green-500" : ""}`}
        >
          {formatMoney(paid)} de {formatMoney(total)} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${Math.max(pct, 0)}%` }}
        />
      </div>
    </div>
  );
}

export function ClientPaymentsSection({ client }: { client: Client }) {
  const { updateClient } = usePlatformData();
  /**
   * ⭐ Un pago recién cargado tiene que verse en Finanzas sin recargar.
   *
   * Los pagos viven en un contexto que cuelga del layout de toda la plataforma:
   * navegar a Finanzas no lo vuelve a montar, así que revalidar la ruta del
   * servidor no alcanzaba. Hay que pedirle al provider que los relea.
   */
  const { refreshClientPayments } = useFinanceData();
  const { push } = useToast();
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addGenericOpen, setAddGenericOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const nextPending = useMemo(() => {
    if (client.paymentType !== "installments" || !client.installments?.length) {
      return null;
    }
    const paidNumbers = new Set(
      payments
        .map((p) => p.installmentNumber)
        .filter((n): n is number => n != null)
    );
    return (
      client.installments.find(
        (inst, i) => inst.status === "pending" && !paidNumbers.has(i + 1)
      ) ?? null
    );
  }, [client, payments]);

  const paidTotal = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const showGenericButton = client.paymentType !== "installments";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listClientPaymentsAction(client.id).then((rows) => {
      if (!cancelled) {
        setPayments(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  async function openReceipt(paymentId: string) {
    setOpeningId(paymentId);
    try {
      const res = await getClientPaymentReceiptUrlAction(paymentId);
      if (!res.success) {
        push({ title: "No se pudo abrir el comprobante", description: res.error });
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Historial de pagos</h2>
        <div className="flex items-center gap-2">
          {nextPending ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Registrar cuota {nextPending.label}
            </Button>
          ) : null}
          {showGenericButton ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => setAddGenericOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Registrar pago
            </Button>
          ) : null}
        </div>
      </div>

      {/* Barra de progreso de cobros */}
      {!loading && client.totalAmount > 0 ? (
        <GlassPanel className="p-4">
          <PaymentProgressBar paid={paidTotal} total={client.totalAmount} />
        </GlassPanel>
      ) : null}

      <GlassPanel className="p-5 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Cargando pagos…</p>
        ) : payments.length === 0 ? (
          <p className="text-muted-foreground">
            Aún no hay pagos registrados para este cliente.
          </p>
        ) : (
          <ul className="space-y-3">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{paymentLabel(payment)}</p>
                  <p className="text-muted-foreground">
                    {payment.paymentDate} — {formatMoney(payment.amount)}
                  </p>
                </div>
                {/*
                  ⭐ Sin comprobante se dice, no se esconde. Cuáles faltan es
                  información operativa: son los que hay que completar después.
                */}
                {payment.storagePath ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    disabled={openingId === payment.id}
                    onClick={() => openReceipt(payment.id)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver comprobante
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin comprobante</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      {client.installments?.length ? (
        <GlassPanel className="p-5 text-sm space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Plan de cuotas</p>
          <ul className="space-y-2">
            {client.installments.map((inst) => (
              <li key={inst.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {inst.label} — {formatMoney(inst.amount)} —{" "}
                  {inst.status === "paid" ? "Pagada ✓" : "Pendiente"}
                  {inst.status === "paid" && inst.paidAt
                    ? ` — Cobrada: ${inst.paidAt}`
                    : ""}
                  {inst.status === "pending" && inst.dueDate
                    ? ` — Vence: ${inst.dueDate}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </GlassPanel>
      ) : null}

      {nextPending ? (
        <AddInstallmentPaymentDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          clientId={client.id}
          defaultAmount={nextPending.amount}
          installmentLabel={nextPending.label}
          onSuccess={(updatedClient, newPayments) => {
            void updateClient(updatedClient.id, {
              installments: updatedClient.installments,
            });
            setPayments(newPayments);
            void refreshClientPayments();
            push({
              title: "Cuota registrada",
              description: `${nextPending.label} guardada con comprobante`,
              variant: "success",
            });
          }}
        />
      ) : null}

      {showGenericButton ? (
        <AddGenericPaymentDialog
          open={addGenericOpen}
          onOpenChange={setAddGenericOpen}
          clientId={client.id}
          onSuccess={(newPayment) => {
            setPayments((prev) => [newPayment, ...prev]);
            void refreshClientPayments();
            push({
              title: "Pago registrado",
              description: "Ya aparece en Finanzas",
              variant: "success",
            });
          }}
        />
      ) : null}
    </section>
  );
}

function AddInstallmentPaymentDialog({
  open,
  onOpenChange,
  clientId,
  defaultAmount,
  installmentLabel,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  defaultAmount: number;
  installmentLabel: string;
  onSuccess: (client: Client, payments: ClientPayment[]) => void;
}) {
  const { push } = useToast();
  const [amount, setAmount] = useState(String(defaultAmount));
  const [paymentDate, setPaymentDate] = useState(
    () => fechaDeHoyLocal()
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setAmount(String(defaultAmount));
      setPaymentDate(fechaDeHoyLocal());
      setFile(null);
      setError(null);
    }
  }, [open, defaultAmount]);

  function handleSubmit() {
    // ⭐ El comprobante es opcional: un cobro sin comprobante sigue siendo un
    // cobro, y obligarlo empujaba a subir cualquier archivo con tal de guardar.
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    if (!paymentDate) {
      setError("Ingresá la fecha del pago.");
      return;
    }

    setError(null);
    startTransition(async () => {
      let storagePath: string | null = null;
      let mimeType: string | null = null;

      if (file) {
        const uploaded = await uploadPaymentReceiptFile(file, clientId);
        if (!uploaded.ok) {
          setError(uploaded.error);
          return;
        }
        storagePath = uploaded.storagePath;
        mimeType = uploaded.mimeType;
      }

      const res = await addInstallmentPaymentAction({
        clientId,
        amount: parsedAmount,
        paymentDate,
        storagePath,
        mimeType,
      });

      if (!res.success) {
        setError(res.error);
        return;
      }

      const refreshed = await listClientPaymentsAction(clientId);
      onSuccess(res.data.client, refreshed);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar {installmentLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <FormField label="Monto pagado">
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
            />
          </FormField>
          <FormField label="Fecha del pago">
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              disabled={pending}
            />
          </FormField>
          <FormField label="Comprobante de pago (opcional)">
            <PaymentReceiptDropzone
              file={file}
              onFileChange={setFile}
              disabled={pending}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Guardando…" : "Confirmar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddGenericPaymentDialog({
  open,
  onOpenChange,
  clientId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onSuccess: (payment: ClientPayment) => void;
}) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    () => fechaDeHoyLocal()
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setAmount("");
      setPaymentDate(fechaDeHoyLocal());
      setFile(null);
      setError(null);
    }
  }, [open]);

  function handleSubmit() {
    // ⭐ El comprobante es opcional: un cobro sin comprobante sigue siendo un
    // cobro, y obligarlo empujaba a subir cualquier archivo con tal de guardar.
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    if (!paymentDate) {
      setError("Ingresá la fecha del pago.");
      return;
    }

    setError(null);
    startTransition(async () => {
      let storagePath: string | null = null;
      let mimeType: string | null = null;

      if (file) {
        const uploaded = await uploadPaymentReceiptFile(file, clientId);
        if (!uploaded.ok) {
          setError(uploaded.error);
          return;
        }
        storagePath = uploaded.storagePath;
        mimeType = uploaded.mimeType;
      }

      const res = await recordClientPaymentAction({
        clientId,
        amount: parsedAmount,
        paymentDate,
        storagePath,
        mimeType,
      });

      if (!res.success) {
        setError(res.error);
        return;
      }

      onSuccess(res.data);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <FormField label="Monto pagado">
            <Input
              type="number"
              value={amount}
              placeholder="0"
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
            />
          </FormField>
          <FormField label="Fecha del pago">
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              disabled={pending}
            />
          </FormField>
          <FormField label="Comprobante de pago (opcional)">
            <PaymentReceiptDropzone
              file={file}
              onFileChange={setFile}
              disabled={pending}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Guardando…" : "Confirmar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
