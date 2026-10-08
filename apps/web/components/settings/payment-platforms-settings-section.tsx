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
import { useFinanceData } from "@/providers";
import { useToast } from "@/providers/toast-provider";
import type { PaymentPlatformConfig } from "@/types/finance";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";

export function PaymentPlatformsSettingsSection() {
  const {
    paymentPlatforms,
    addPaymentPlatform,
    updatePaymentPlatform,
    removePaymentPlatform,
    totalesDePlataformasSinLeer,
    financeConfigLoading,
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
          <p className="mt-0.5 text-xs text-muted-foreground">
            Destinos donde recibe el negocio (cuenta Stripe, banco, billetera…).
            Se usan al cerrar clientes y en los balances de Finanzas.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          + Añadir plataforma
        </Button>
      </div>

      {financeConfigLoading ? (
        <p className="text-sm text-muted-foreground">Cargando plataformas…</p>
      ) : paymentPlatforms.length === 0 ? (
        <GlassPanel className="p-5 text-sm text-muted-foreground">
          Todavía no configuraste destinos de pago. Agregá al menos uno para
          registrar cierres.
        </GlassPanel>
      ) : (
        <ul className="space-y-2">
          {paymentPlatforms.map((platform) => (
            <li key={platform.id}>
              <GlassPanel className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{platform.name}</p>
                    {platform.accountLabel ? (
                      <p className="text-xs text-muted-foreground">
                        {platform.accountLabel}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
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
                          push({
                            title: "No se pudo eliminar",
                            description: err,
                          });
                        }
                      });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                    Eliminar
                  </Button>
                </div>
              </GlassPanel>
            </li>
          ))}
        </ul>
      )}

      <PlatformNameModal
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSave={(name) => {
          const done = (err?: string) => {
            if (err) {
              push({ title: "No se pudo guardar", description: err });
              return;
            }
            setOpen(false);
            setEditing(null);
            push({ title: "Plataforma guardada", variant: "success" });
          };
          if (editing) {
            void updatePaymentPlatform(editing.id, { name }).then(done);
          } else {
            void addPaymentPlatform({ name, currency: "USD" }).then(done);
          }
        }}
      />
    </section>
  );
}

function PlatformNameModal({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: PaymentPlatformConfig | null;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setName(initial?.name ?? "");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogDescription className="sr-only">
            Nombre de la plataforma o cuenta de cobro.
          </DialogDescription>
          <DialogTitle>
            {initial ? "Editar plataforma" : "Nueva plataforma de pago"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <FormField label="Nombre">
            <Input
              placeholder='Ej. "Cuenta Stripe", "Mercado Pago Negocio"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSave(name.trim() || "Plataforma")}
            disabled={!name.trim()}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
