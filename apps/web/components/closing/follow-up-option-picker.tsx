"use client";

import { useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@ai-coo/ui";
import { createFollowUpOptionAction } from "@/app/sales/follow-up-options-actions";
import {
  FOLLOW_UP_COLORS,
  FOLLOW_UP_COLOR_CLASS,
  findOption,
  optionLabel,
  selectableOptions,
  type FollowUpBehavior,
  type FollowUpColor,
  type FollowUpKind,
  type FollowUpOption,
} from "@/lib/sales/follow-up-options";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion } from "@/lib/client/correr-accion";

/**
 * Celda editable de un valor de seguimiento.
 *
 * ⭐ **El valor se crea acá, no en una pantalla de configuración.** El momento en
 * que hace falta "Esperando pago" es justo cuando el closer está cargando el
 * seguimiento; mandarlo a otra pantalla es lo que hacía que esa información
 * terminara en las notas, donde no se puede filtrar ni contar.
 */

const BEHAVIOR_HELP: Record<Exclude<FollowUpBehavior, "neutral">, string> = {
  needs_date: "Pide fecha y vuelve a la cola cuando vence",
  closes_thread: "Cierra el hilo del lead, sin fecha",
};

export function FollowUpChip({
  option,
  label,
  className,
}: {
  option: FollowUpOption | null;
  label: string | null;
  className?: string;
}) {
  if (!label) {
    return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "max-w-full truncate text-[10px] font-medium",
        FOLLOW_UP_COLOR_CLASS[option?.color ?? "slate"],
        // Un valor archivado —o uno que ya no está en el catálogo— se muestra
        // igual, atenuado. Nunca se blanquea el dato.
        option?.archived && "opacity-60 line-through",
        className
      )}
    >
      {label}
    </Badge>
  );
}

export function FollowUpOptionPicker({
  kind,
  options,
  value,
  disabled,
  placeholder = "Elegir…",
  onSelect,
  onCreated,
}: {
  kind: FollowUpKind;
  options: FollowUpOption[];
  value: string | null;
  disabled?: boolean;
  placeholder?: string;
  onSelect: (slug: string | null) => void;
  /** El valor recién creado, para que la tabla lo sume al catálogo sin recargar. */
  onCreated?: (option: FollowUpOption) => void;
}) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<FollowUpColor>("slate");
  const [behavior, setBehavior] = useState<Exclude<FollowUpBehavior, "neutral">>(
    "needs_date"
  );
  const [isPending, startTransition] = useTransition();

  const current = findOption(options, value);
  const selectable = selectableOptions(options);

  function reset() {
    setCreating(false);
    setLabel("");
    setColor("slate");
    setBehavior("needs_date");
  }

  function handleCreate() {
    const trimmed = label.trim();
    if (!trimmed) return;
    startTransition(() =>
      correrMutacion({
        accion: () =>
          createFollowUpOptionAction({
            kind,
            label: trimmed,
            color,
            behavior: kind === "qualification" ? "neutral" : behavior,
          }),
        avisar: push,
        tituloError: "No se pudo crear el valor",
        etiqueta: "[FollowUpOptionPicker] crear",
        alExito: (option) => {
          onCreated?.(option);
          onSelect(option.slug);
          reset();
          setOpen(false);
        },
      })
    );
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors",
            !disabled && "hover:bg-muted/60",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          {value ? (
            <FollowUpChip option={current} label={optionLabel(options, value)} />
          ) : (
            <span className="text-xs text-muted-foreground">{placeholder}</span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        {selectable.map((option) => (
          <DropdownMenuItem
            key={option.slug}
            onSelect={() => onSelect(option.slug)}
            className="gap-2 text-xs"
          >
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full border",
                FOLLOW_UP_COLOR_CLASS[option.color]
              )}
            />
            <span className="flex-1 truncate">{option.label}</span>
            {option.slug === value && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}

        {value && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onSelect(null)}
              className="gap-2 text-xs text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Quitar valor
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        {creating ? (
          <div
            className="flex flex-col gap-2 p-2"
            // El formulario vive dentro del menú: cualquier tecla o click acá no
            // tiene que cerrarlo.
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Input
              autoFocus
              value={label}
              maxLength={60}
              placeholder="Nombre del valor"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              className="h-8 text-xs"
            />

            <div className="flex flex-wrap gap-1">
              {FOLLOW_UP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-5 w-5 rounded-full border",
                    FOLLOW_UP_COLOR_CLASS[c],
                    color === c && "ring-2 ring-primary ring-offset-1"
                  )}
                />
              ))}
            </div>

            {kind === "next_action" && (
              <div className="flex flex-col gap-1">
                {(["needs_date", "closes_thread"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBehavior(b)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-left text-[11px] transition-colors",
                      behavior === b
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    {b === "needs_date" ? "Necesita fecha" : "Cierra el hilo"}
                    <span className="block text-[10px] opacity-70">
                      {BEHAVIOR_HELP[b]}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-1">
              <Button
                size="sm"
                className="h-7 flex-1 text-xs"
                disabled={isPending || !label.trim()}
                onClick={handleCreate}
              >
                Crear
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={reset}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setCreating(true);
            }}
            className="gap-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Crear valor…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
