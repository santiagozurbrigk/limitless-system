"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  GlassPanel,
  Input,
} from "@ai-coo/ui";
import { CreditCard, Pencil, Trash2 } from "lucide-react";
import { PLATFORM_SUGGESTIONS } from "@/mocks/finance";
import { useFinanceData } from "@/providers";
import { useToast } from "@/providers/toast-provider";
import { formatMoney } from "@/lib/finance/format";
import { formatearFechaGuardada } from "@/lib/fechas/calendario";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import type { PaymentPlatformConfig } from "@/types/finance";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";

/**
 * La fecha de la última transacción, con su día. `new Date("2026-10-04")` es
 * medianoche de UTC y en Argentina se mostraba como el día anterior.
 */
function formatearUltimaTransaccion(valor: string, zona: string | null): string {
  return formatearFechaGuardada(valor, { zona, idioma: "es-ES" }) ?? valor;
}

const selectClass =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

const CURRENCIES = ["USD", "ARS", "EUR", "Other"] as const;

export function PaymentPlatformsSection() {
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const {
    paymentPlatforms,
    addPaymentPlatform,
    updatePaymentPlatform,
    removePaymentPlatform,
    totalesDePlataformasSinLeer,
  } = useFinanceData();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentPlatformConfig | null>(null);

  return (
    <section className="space-y-4">
      {totalesDePlataformasSinLeer ? (
        <AvisoDeLecturaFallida
          titulo="No se pudieron leer los pagos."
          motivo="Lo recibido por cada plataforma no está al día."
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Plataformas de pago</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cuentas donde recibe el negocio — alimentan balances en Finanzas
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          + Añadir plataforma de pago
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {paymentPlatforms.map((platform) => (
          <GlassPanel key={platform.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">{platform.name}</p>
                  <p className="text-xs text-muted-foreground">{platform.currency}</p>
                </div>
              </div>
            </div>
            {platform.accountLabel && (
              <p className="text-xs text-muted-foreground">{platform.accountLabel}</p>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Total recibido</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatMoney(platform.totalReceived, platform.currency)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Última transacción:{" "}
              {formatearUltimaTransaccion(platform.lastTransactionAt, zonaDeLaOrganizacion)}
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setEditing(platform);
                  setOpen(true);
                }}
              >
                <Pencil className="h-3 w-3" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-destructive"
                onClick={() => {
                  void removePaymentPlatform(platform.id).then((err) => {
                    if (err) {
                      push({ title: "No se pudo eliminar", description: err });
                    }
                  });
                }}
              >
                <Trash2 className="h-3 w-3" />
                Eliminar
              </Button>
            </div>
          </GlassPanel>
        ))}
      </div>

      <PlatformModal
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSave={(data) => {
          const done = (err?: string) => {
            if (err) {
              push({ title: "No se pudo guardar", description: err });
              return;
            }
            setOpen(false);
            setEditing(null);
          };
          if (editing) {
            void updatePaymentPlatform(editing.id, data).then(done);
          } else {
            void addPaymentPlatform(data).then(done);
          }
        }}
      />
    </section>
  );
}

function PlatformModal({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: PaymentPlatformConfig | null;
  onSave: (data: {
    name: string;
    currency: string;
    accountLabel?: string;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [accountLabel, setAccountLabel] = useState(initial?.accountLabel ?? "");

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && initial) {
      setName(initial.name);
      setCurrency(initial.currency);
      setAccountLabel(initial.accountLabel ?? "");
    } else if (isOpen && !initial) {
      setName("");
      setCurrency("USD");
      setAccountLabel("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogDescription className="sr-only">
            Formulario para añadir o editar una plataforma de pago.
          </DialogDescription>
          <DialogTitle>
            {initial ? "Editar plataforma" : "Añadir plataforma de pago"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <FormField label="Nombre de la plataforma">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PLATFORM_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"
                  onClick={() => setName(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Moneda">
            <select
              className={selectClass}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Etiqueta de cuenta (opcional)">
            <Input
              placeholder='ej. "Wise USD Main Account"'
              value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: name.trim() || "Plataforma",
                currency,
                accountLabel: accountLabel.trim() || undefined,
              })
            }
          >
            Guardar plataforma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
