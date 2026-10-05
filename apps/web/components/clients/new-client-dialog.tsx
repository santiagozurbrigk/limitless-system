"use client";

/**
 * ⭐ Cargar un cliente a mano.
 *
 * Esto no existía. Un cliente sólo podía nacer de dos formas: cerrando una
 * llamada de venta, o importando un archivo desde una pantalla que además vive
 * detrás del permiso de Integraciones. Para el que ya tiene su cartera armada y
 * la quiere pasar al sistema, no había puerta.
 *
 * El formulario pide **lo mínimo indispensable** —nombre, fecha, monto— y
 * completa el resto con valores sensatos. Quien está cargando veinte clientes
 * seguidos no debería pelear con quince campos por cada uno; lo que falte se
 * completa después en la ficha, que ya tiene todo.
 *
 * Por eso también queda abierto después de guardar, con el formulario limpio:
 * cargar una cartera es una tanda, no una visita.
 */

import { useState, useTransition } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@ai-coo/ui";
import { UserPlus } from "lucide-react";
import { createClientAction } from "@/app/clients/actions";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import { usePlatformData } from "@/providers";
import { useToast } from "@/providers/toast-provider";
import type { Client, ClientStatus } from "@/types/clients";
import type { PaymentPlatform } from "@/types/closing";

/** El tipo de pago vive inline en `Client`; se deriva para no duplicarlo. */
type ClientPaymentType = Client["paymentType"];

const ESTADOS: { value: ClientStatus; label: string }[] = [
  { value: "pending_onboarding", label: "Falta onboarding" },
  { value: "onboarding_done", label: "Onboarding hecho" },
  { value: "active", label: "Activo" },
  { value: "success_case", label: "Caso de éxito" },
];

const TIPOS_DE_PAGO: { value: ClientPaymentType; label: string }[] = [
  { value: "upfront", label: "Pago único" },
  { value: "installments", label: "En cuotas" },
  { value: "upfront_fee", label: "Adelanto + fee" },
];

const PLATAFORMAS: { value: PaymentPlatform; label: string }[] = [
  { value: "bank_transfer", label: "Transferencia" },
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
  { value: "other", label: "Otra" },
];

/** El formulario en blanco; la fecha de alta es hoy en la organización. */
function vacio(hoy: string) {
  return {
    name: "",
    email: "",
    joinDate: hoy,
    totalAmount: "",
    status: "active" as ClientStatus,
    paymentType: "upfront" as ClientPaymentType,
    platform: "bank_transfer" as PaymentPlatform,
  };
}

export function NewClientDialog() {
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const { refreshClients } = usePlatformData();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => vacio(fechaDeHoyEnZona(zonaDeLaOrganizacion)));
  const [error, setError] = useState<string | null>(null);
  const [cargados, setCargados] = useState(0);
  const [pending, startTransition] = useTransition();

  function patch(cambios: Partial<ReturnType<typeof vacio>>) {
    setForm((actual) => ({ ...actual, ...cambios }));
  }

  function cerrar(abierto: boolean) {
    setOpen(abierto);
    if (!abierto) {
      setForm(vacio(fechaDeHoyEnZona(zonaDeLaOrganizacion)));
      setError(null);
      setCargados(0);
    }
  }

  function guardar() {
    setError(null);

    if (!form.name.trim()) {
      setError("El nombre del cliente es obligatorio.");
      return;
    }

    // Un monto vacío es cero, no un error: hay clientes que se cargan para
    // seguirlos aunque su plata haya entrado por otro lado.
    const monto = form.totalAmount.trim() === "" ? 0 : Number(form.totalAmount);
    if (!Number.isFinite(monto) || monto < 0) {
      setError("El monto tiene que ser un número. Dejalo vacío si no aplica.");
      return;
    }

    startTransition(async () => {
      try {
        await createClientAction({
          name: form.name.trim(),
          email: form.email.trim() || null,
          joinDate: form.joinDate,
          totalAmount: monto,
          status: form.status,
          paymentType: form.paymentType,
          platform: form.platform,
          // Lo que el alta no pregunta y el esquema pide.
          isSuccessCase: form.status === "success_case",
          aiInsights: [],
          linkedCalls: [],
        });

        await refreshClients();
        setCargados((n) => n + 1);
        push({ title: `"${form.name.trim()}" cargado`, variant: "success" });

        // Se limpia y queda abierto: cargar una cartera es una tanda.
        setForm(vacio(fechaDeHoyEnZona(zonaDeLaOrganizacion)));
      } catch (fallo) {
        setError(
          fallo instanceof Error ? fallo.message : "No se pudo cargar el cliente."
        );
      }
    });
  }

  return (
    <>
      <Button className="gap-2" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Nuevo cliente
      </Button>

      <Dialog open={open} onOpenChange={cerrar}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogDescription>
              Con el nombre alcanza. El resto se puede completar después en la
              ficha del cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cliente-nombre">Nombre</Label>
              <Input
                id="cliente-nombre"
                autoFocus
                value={form.name}
                onChange={(evento) => patch({ name: evento.target.value })}
                placeholder="Nombre y apellido"
                onKeyDown={(evento) => {
                  if (evento.key === "Enter" && !pending) guardar();
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cliente-email">Email (opcional)</Label>
                <Input
                  id="cliente-email"
                  type="email"
                  value={form.email}
                  onChange={(evento) => patch({ email: evento.target.value })}
                  placeholder="nombre@email.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-fecha">Desde cuándo es cliente</Label>
                <CampoFecha
                  id="cliente-fecha"
                  value={form.joinDate}
                  onChange={(fecha) => patch({ joinDate: fecha ?? "" })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cliente-monto">Monto total (opcional)</Label>
                <Input
                  id="cliente-monto"
                  inputMode="decimal"
                  value={form.totalAmount}
                  onChange={(evento) => patch({ totalAmount: evento.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-estado">Estado</Label>
                <select
                  id="cliente-estado"
                  value={form.status}
                  onChange={(evento) =>
                    patch({ status: evento.target.value as ClientStatus })
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {ESTADOS.map((estado) => (
                    <option key={estado.value} value={estado.value}>
                      {estado.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cliente-tipo-pago">Cómo paga</Label>
                <select
                  id="cliente-tipo-pago"
                  value={form.paymentType}
                  onChange={(evento) =>
                    patch({ paymentType: evento.target.value as ClientPaymentType })
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {TIPOS_DE_PAGO.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cliente-plataforma">Por dónde cobra</Label>
                <select
                  id="cliente-plataforma"
                  value={form.platform}
                  onChange={(evento) =>
                    patch({ platform: evento.target.value as PaymentPlatform })
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {PLATAFORMAS.map((plataforma) => (
                    <option key={plataforma.value} value={plataforma.value}>
                      {plataforma.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {cargados > 0
                ? `${cargados} cargado${cargados === 1 ? "" : "s"} en esta tanda`
                : "El formulario queda abierto para cargar varios seguidos"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => cerrar(false)} disabled={pending}>
                {cargados > 0 ? "Listo" : "Cancelar"}
              </Button>
              <Button onClick={guardar} disabled={pending || !form.name.trim()}>
                {pending ? "Guardando…" : "Guardar y seguir"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
