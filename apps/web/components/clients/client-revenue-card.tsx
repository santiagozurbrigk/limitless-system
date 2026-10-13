"use client";

/**
 * La facturación del **negocio del cliente**, mes a mes.
 *
 * ⚠️ No es lo que el cliente nos paga a nosotros — eso vive en Cobros. Esto es
 * lo que el cliente gana con su negocio, que es la medida de si el
 * acompañamiento está funcionando.
 *
 * ⭐ Se guarda por mes y no como un número suelto. Un cliente que facturaba
 * 4.000 hace seis meses no factura 4.000 hoy, y un número sin fecha se lee como
 * actual: es el mismo error que la satisfacción resolvió guardando cuándo y
 * quién. Con meses, además, se puede decir cuánto creció — que es lo que hace
 * que el dato sirva para algo más que llenar una celda.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Label, Sparkline, cn } from "@ai-coo/ui";
import {
  Loader2,
  Pencil,
  Plus,
  TrendingDown,
  TrendingUp,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  deleteClientRevenueAction,
  listClientRevenueAction,
  saveClientRevenueAction,
} from "@/app/clients/revenue-actions";
import { ACCION_DE_FILA, FichaCard } from "@/components/clients/ficha-section";
import {
  currentPeriod,
  formatPeriod,
  formatRevenue,
  revenueSeries,
  summarizeRevenue,
  type ClientRevenueEntry,
  type RevenueCurrency,
} from "@/lib/clients/revenue";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion, leerConMotivo, type Lectura } from "@/lib/client/correr-accion";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";

const CONTROL_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

function Formulario({
  clientId,
  editando,
  onSaved,
  onCancel,
}: {
  clientId: string;
  /** El mes que se está corrigiendo. `null` = se está cargando uno nuevo. */
  editando: ClientRevenueEntry | null;
  onSaved: (entry: ClientRevenueEntry, reemplazó: string | null) => void;
  onCancel: () => void;
}) {
  const { push } = useToast();
  const [amount, setAmount] = useState(() =>
    editando ? String(editando.amount) : ""
  );
  const [currency, setCurrency] = useState<RevenueCurrency>(
    editando?.currency ?? "USD"
  );
  // Al corregir, el mes que se está corrigiendo. Al cargar, el mes en curso:
  // es el que casi siempre se está cargando.
  const [period, setPeriod] = useState(() =>
    (editando?.period ?? currentPeriod()).slice(0, 7)
  );
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    const monto = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(monto)) {
      push({ title: "Ese monto no se entiende" });
      return;
    }

    setSaving(true);
    await correrMutacion({
      accion: () =>
        saveClientRevenueAction({
          clientId,
          amount: monto,
          currency,
          period,
          note: "",
          replacesEntryId: editando?.id ?? null,
        }),
      alExito: (entry) => onSaved(entry, editando?.id ?? null),
      avisar: push,
      tituloError: "No se pudo guardar",
      etiqueta: "[ClientRevenueCard] guardar",
    });
    setSaving(false);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3 dark:border-white/[0.08]">
      <div className="space-y-1.5">
        <Label htmlFor="facturacion-mes">Mes</Label>
        <input
          id="facturacion-mes"
          type="month"
          className={CONTROL_CLASS}
          value={period}
          disabled={saving}
          onChange={(event) => setPeriod(event.target.value)}
        />
      </div>

      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="facturacion-monto">Facturó</Label>
          <Input
            id="facturacion-monto"
            inputMode="decimal"
            value={amount}
            disabled={saving}
            placeholder="12000"
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && amount.trim() && !saving) guardar();
            }}
          />
        </div>
        <select
          aria-label="Moneda"
          className={cn(CONTROL_CLASS, "w-20 shrink-0")}
          value={currency}
          disabled={saving}
          onChange={(event) => setCurrency(event.target.value as RevenueCurrency)}
        >
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={guardar}
          disabled={saving || !amount.trim()}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </div>
  );
}

/**
 * La facturación del cliente, o el motivo si no se pudo leer (SCRUM-516).
 * Antes una falla se mostraba como «Sin datos todavía».
 */
export function cargarFacturacion(clientId: string): Promise<Lectura<ClientRevenueEntry[]>> {
  return leerConMotivo(() => listClientRevenueAction(clientId), "[ClientRevenueCard] listar");
}

export function ClientRevenueCard({ clientId }: { clientId: string }) {
  const { push } = useToast();
  const [entries, setEntries] = useState<ClientRevenueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [motivo, setMotivo] = useState<string | null>(null);
  /**
   * El formulario abierto: `"nuevo"` para cargar un mes, la entrada para
   * corregirla, `null` cerrado.
   */
  const [form, setForm] = useState<"nuevo" | ClientRevenueEntry | null>(null);

  const cargar = useCallback(() => {
    let alive = true;
    void cargarFacturacion(clientId).then((lectura) => {
      if (!alive) return;
      if (lectura.ok) {
        setEntries(lectura.data);
        setMotivo(null);
      } else {
        setMotivo(lectura.motivo);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [clientId]);

  useEffect(() => cargar(), [cargar]);

  const borrar = async (entryId: string) => {
    await correrMutacion({
      accion: () => deleteClientRevenueAction(entryId),
      alExito: () => setEntries((prev) => prev.filter((entry) => entry.id !== entryId)),
      avisar: push,
      tituloError: "No se pudo borrar",
      etiqueta: "[ClientRevenueCard] borrar",
    });
  };

  if (loading) return null;

  const resumen = summarizeRevenue(entries);
  const serie = revenueSeries(entries);
  const subio = resumen.changePct != null && resumen.changePct > 0;
  const bajo = resumen.changePct != null && resumen.changePct < 0;

  return (
    <FichaCard
      icon={Wallet}
      title="Facturación del negocio"
      action={
        form ? null : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => setForm("nuevo")}
          >
            <Plus className="h-3.5 w-3.5" />
            Cargar mes
          </Button>
        )
      }
    >
      <div className="space-y-3">
        {form ? (
          <Formulario
            key={form === "nuevo" ? "nuevo" : form.id}
            clientId={clientId}
            editando={form === "nuevo" ? null : form}
            onCancel={() => setForm(null)}
            onSaved={(entry, reemplazó) => {
              setEntries((prev) =>
                [
                  entry,
                  ...prev.filter(
                    // Cargar de nuevo un mes lo corrige, no lo duplica — el
                    // upsert de la base ya lo garantiza. Y si al corregir le
                    // cambiaron el mes, la fila vieja ya no existe.
                    (item) => item.period !== entry.period && item.id !== reemplazó
                  ),
                ].sort((a, b) => b.period.localeCompare(a.period))
              );
              setForm(null);
              push({
                title: reemplazó ? "Facturación corregida" : "Facturación cargada",
                variant: "success",
              });
            }}
          />
        ) : null}

        {resumen.latest ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatRevenue(resumen.latest.amount, resumen.latest.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  en {formatPeriod(resumen.latest.period)}
                </p>
              </div>

              {resumen.changePct != null ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
                    subio && "border-success/30 text-success",
                    bajo && "border-destructive/30 text-destructive",
                    !subio && !bajo && "border-border text-muted-foreground"
                  )}
                  title={
                    resumen.previous
                      ? `contra ${formatPeriod(resumen.previous.period)}`
                      : undefined
                  }
                >
                  {subio ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : bajo ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : null}
                  {subio ? "+" : ""}
                  {resumen.changePct}%
                </span>
              ) : null}
            </div>

            {/* Con un solo mes una línea no dice nada: hacen falta dos puntos. */}
            {serie.length > 1 ? (
              <Sparkline data={serie} color="hsl(var(--primary))" />
            ) : null}

            {resumen.best && resumen.best.id !== resumen.latest.id ? (
              <p className="text-[11px] text-muted-foreground">
                Su mejor mes: {formatRevenue(resumen.best.amount, resumen.best.currency)} en{" "}
                {formatPeriod(resumen.best.period)}
              </p>
            ) : null}

            {/*
              ⭐ Desde el primer mes, no desde el segundo: con uno solo cargado
              la lista es la única forma de llegar a corregirlo o borrarlo.
            */}
            {entries.length > 0 ? (
              <details className="group">
                <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
                  {entries.length === 1
                    ? "Ver o corregir el mes cargado"
                    : `Ver o corregir los ${entries.length} meses cargados`}
                </summary>
                <ul className="mt-2 space-y-1 border-t border-border/40 pt-2">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {formatPeriod(entry.period)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="tabular-nums">
                          {formatRevenue(entry.amount, entry.currency)}
                        </span>
                        {/*
                          ⭐ Corregir un mes ya se podía —cargarlo de nuevo lo
                          pisa— pero no había cómo darse cuenta: el formulario
                          abría siempre en el mes en curso. Un lápiz al lado del
                          mes lo dice sin que haya que saberlo.
                        */}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={cn(ACCION_DE_FILA, "h-6 w-6")}
                          title={`Corregir ${formatPeriod(entry.period)}`}
                          onClick={() => setForm(entry)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={cn(ACCION_DE_FILA, "h-6 w-6 hover:text-destructive")}
                          title={`Borrar ${formatPeriod(entry.period)}`}
                          onClick={() => borrar(entry.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : form ? null : motivo ? (
          <AvisoDeLecturaFallida titulo="No se pudo cargar la facturación." motivo={motivo} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Sin datos todavía. Cargá cuánto facturó su negocio este mes y vas a
            poder ver cómo evoluciona.
          </p>
        )}
      </div>
    </FichaCard>
  );
}
