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
import { correrMutacion, leerConMotivo, type Lectura } from "@/lib/client/correr-accion";
import type { Client, ClientPayment } from "@/types/clients";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import { redondearACentavos } from "@/lib/clients/payment-utils";

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

/**
 * Rótulos del botón y del diálogo de la próxima cuota. Si los pagos no se
 * pudieron leer, la próxima pendiente se calcula sobre una lista vacía y puede
 * ser otra: se dice "la próxima cuota" sin número (el servidor elige la
 * correcta).
 */
export function rotulosDeLaProximaCuota(
  etiqueta: string | null,
  loadError: string | null
): { boton: string; dialogo: string } {
  if (loadError || !etiqueta) return { boton: "Registrar la próxima cuota", dialogo: "la próxima cuota" };
  return { boton: `Registrar cuota ${etiqueta}`, dialogo: etiqueta };
}

/** Los pagos que muestra la ficha y, si la lectura falló, por qué. */
export type EstadoDePagos = { payments: ClientPayment[]; loadError: string | null };

/**
 * Cómo queda la ficha después de leer los pagos (SCRUM-504). Toda la lógica de
 * `loadError` vive acá; el componente sólo guarda lo que devuelve.
 * - Con éxito: la lista, y sin error (si la primera lectura había fallado y
 *   ahora se leyó bien, el error no aplica más).
 * - Si falla la carga: el motivo, con lo que se veía.
 * - Si falla una relectura (después de registrar): queda todo como estaba.
 */
export function aplicarLecturaDePagos(
  actual: EstadoDePagos,
  lectura: Lectura<ClientPayment[]>,
  momento: "carga" | "relectura"
): EstadoDePagos {
  if (lectura.ok) return { payments: lectura.data, loadError: null };
  if (momento === "relectura") return actual;
  return { payments: actual.payments, loadError: lectura.motivo };
}

/** Un pago recién registrado, arriba de la lista. */
export function agregarPago(actual: EstadoDePagos, pago: ClientPayment): EstadoDePagos {
  return { ...actual, payments: [pago, ...actual.payments] };
}

/**
 * El monto de la cuota para el formulario, en centavos: el plan de cuotas
 * puede traer 333.333 y el servidor sólo acepta dos decimales (SCRUM-504).
 */
export function montoParaElFormulario(monto: number): string {
  return String(redondearACentavos(monto));
}

/** El rótulo de la cuota que el servidor registró, para el aviso. */
export function rotuloDeCuotaRegistrada(cliente: Client, pago: ClientPayment): string {
  const numero = pago.installmentNumber;
  const etiqueta = numero != null ? cliente.installments?.[numero - 1]?.label : undefined;
  return etiqueta ?? "La cuota";
}

/** Los pagos de un cliente, o el motivo si no se pudieron leer (SCRUM-504). */
export function cargarPagosDelCliente(clientId: string): Promise<Lectura<ClientPayment[]>> {
  return leerConMotivo(
    () => listClientPaymentsAction(clientId),
    "[ClientPaymentsSection] pagos"
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
  const [estadoDePagos, setEstadoDePagos] = useState<EstadoDePagos>({
    payments: [],
    loadError: null,
  });
  // Por qué no se pudieron leer los pagos (SCRUM-504): antes la falla se veía
  // como "Aún no hay pagos registrados".
  const { payments, loadError } = estadoDePagos;
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
    void cargarPagosDelCliente(client.id).then((lectura) => {
      if (cancelled) return;
      setEstadoDePagos((actual) => aplicarLecturaDePagos(actual, lectura, "carga"));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  /** Relee la lista después de registrar; si falla, queda lo que se ve. */
  function releerPagos() {
    void cargarPagosDelCliente(client.id).then((lectura) => {
      setEstadoDePagos((actual) => aplicarLecturaDePagos(actual, lectura, "relectura"));
    });
  }

  const rotulos = rotulosDeLaProximaCuota(nextPending?.label ?? null, loadError);

  async function openReceipt(paymentId: string) {
    setOpeningId(paymentId);
    try {
      await correrMutacion({
        accion: () => getClientPaymentReceiptUrlAction(paymentId),
        avisar: push,
        tituloError: "No se pudo abrir el comprobante",
        etiqueta: "[ClientPaymentsSection] comprobante",
        alExito: (data) => {
          window.open(data.url, "_blank", "noopener,noreferrer");
        },
      });
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
              {rotulos.boton}
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
      {!loading && !loadError && client.totalAmount > 0 ? (
        <GlassPanel className="p-4">
          <PaymentProgressBar paid={paidTotal} total={client.totalAmount} />
        </GlassPanel>
      ) : null}

      <GlassPanel className="p-5 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Cargando pagos…</p>
        ) : loadError ? (
          <p className="text-destructive" role="alert">
            No se pudieron cargar los pagos. {loadError}
          </p>
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
          installmentLabel={rotulos.dialogo}
          onSuccess={(updatedClient, newPayment) => {
            // `updateClient` lanza con el motivo (SCRUM-497): sin este catch
            // quedaba como una promesa rechazada que nadie veía.
            updateClient(updatedClient.id, {
              installments: updatedClient.installments,
            }).catch((e: unknown) => {
              push({
                title: "No se pudo actualizar el plan de cuotas",
                description: e instanceof Error ? e.message : undefined,
              });
            });
            setEstadoDePagos((actual) => agregarPago(actual, newPayment));
            releerPagos();
            void refreshClientPayments();
            push({
              title: "Cuota registrada",
              description: `${rotuloDeCuotaRegistrada(updatedClient, newPayment)} guardada con comprobante`,
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
            setEstadoDePagos((actual) => agregarPago(actual, newPayment));
            releerPagos();
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
  onSuccess: (client: Client, payment: ClientPayment) => void;
}) {
  const [amount, setAmount] = useState(montoParaElFormulario(defaultAmount));
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const [paymentDate, setPaymentDate] = useState(() =>
    fechaDeHoyEnZona(zonaDeLaOrganizacion)
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [claveIdempotencia, setClaveIdempotencia] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setAmount(montoParaElFormulario(defaultAmount));
      setPaymentDate(fechaDeHoyEnZona(zonaDeLaOrganizacion));
      setFile(null);
      setError(null);
      // Una clave por formulario abierto: si la respuesta se pierde y se
      // vuelve a guardar, el servidor no duplica el cobro (SCRUM-504).
      setClaveIdempotencia(crypto.randomUUID());
    }
  }, [open, defaultAmount, zonaDeLaOrganizacion]);

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

      const res = await leerConMotivo(
        () =>
          addInstallmentPaymentAction({
            clientId,
            amount: parsedAmount,
            paymentDate,
            storagePath,
            mimeType,
            claveIdempotencia,
          }),
        "[ClientPaymentsSection] registrar cuota"
      );

      if (!res.ok) {
        setError(res.motivo);
        return;
      }

      onSuccess(res.data.client, res.data.payment);
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
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const [paymentDate, setPaymentDate] = useState(() =>
    fechaDeHoyEnZona(zonaDeLaOrganizacion)
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [claveIdempotencia, setClaveIdempotencia] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setAmount("");
      setPaymentDate(fechaDeHoyEnZona(zonaDeLaOrganizacion));
      setFile(null);
      setError(null);
      // Una clave por formulario abierto: si la respuesta se pierde y se
      // vuelve a guardar, el servidor no duplica el cobro (SCRUM-504).
      setClaveIdempotencia(crypto.randomUUID());
    }
  }, [open, zonaDeLaOrganizacion]);

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

      const res = await leerConMotivo(
        () =>
          recordClientPaymentAction({
            clientId,
            amount: parsedAmount,
            paymentDate,
            storagePath,
            mimeType,
            claveIdempotencia,
          }),
        "[ClientPaymentsSection] registrar pago"
      );

      if (!res.ok) {
        setError(res.motivo);
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
