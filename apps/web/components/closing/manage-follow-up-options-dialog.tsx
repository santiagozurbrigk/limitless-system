"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Lock } from "lucide-react";
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@ai-coo/ui";
import {
  setFollowUpOptionArchivedAction,
  updateFollowUpOptionAction,
} from "@/app/sales/follow-up-options-actions";
import {
  FOLLOW_UP_COLORS,
  FOLLOW_UP_COLOR_CLASS,
  type FollowUpCatalog,
  type FollowUpColor,
  type FollowUpOption,
} from "@/lib/sales/follow-up-options";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion } from "@/lib/client/correr-accion";

/**
 * Administrar los valores de seguimiento de la organización.
 *
 * Los de fábrica se ven pero no se tocan: su comportamiento sostiene el motor de
 * estados. Los propios se renombran, se recolorean y se archivan — **nunca se
 * borran**, porque hay turnos apuntando a su slug y borrarlos vaciaría ese dato
 * en silencio.
 */

const BEHAVIOR_LABEL: Record<string, string> = {
  needs_date: "Necesita fecha",
  closes_thread: "Cierra el hilo",
  neutral: "Descriptivo",
};

function OptionRow({
  option,
  onChanged,
}: {
  option: FollowUpOption;
  onChanged: (option: FollowUpOption) => void;
}) {
  const { push } = useToast();
  const [label, setLabel] = useState(option.label);
  const [isPending, startTransition] = useTransition();

  function save(patch: { label?: string; color?: FollowUpColor }) {
    if (!option.id) return;
    startTransition(() =>
      correrMutacion({
        accion: () => updateFollowUpOptionAction({ id: option.id!, ...patch }),
        // `correrMutacion` sólo avisa cuando falla: el nombre vuelve al guardado.
        avisar: (aviso) => {
          setLabel(option.label);
          push(aviso);
        },
        tituloError: "No se pudo guardar",
        etiqueta: "[ManageFollowUpOptions] guardar",
        alExito: () => onChanged({ ...option, ...patch }),
      })
    );
  }

  function toggleArchived() {
    if (!option.id) return;
    startTransition(() =>
      correrMutacion({
        accion: () =>
          setFollowUpOptionArchivedAction({ id: option.id!, archived: !option.archived }),
        avisar: push,
        tituloError: "No se pudo archivar",
        etiqueta: "[ManageFollowUpOptions] archivar",
        alExito: () => onChanged({ ...option, archived: !option.archived }),
      })
    );
  }

  if (option.builtIn) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5">
        <Badge
          variant="outline"
          className={cn("text-[10px]", FOLLOW_UP_COLOR_CLASS[option.color])}
        >
          {option.label}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {BEHAVIOR_LABEL[option.behavior]}
        </span>
        <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-1 py-1.5",
        option.archived && "opacity-60"
      )}
    >
      <Input
        value={label}
        maxLength={60}
        disabled={isPending}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          const next = label.trim();
          if (next && next !== option.label) save({ label: next });
          else setLabel(option.label);
        }}
        className="h-7 w-40 text-xs"
      />

      <div className="flex gap-1">
        {FOLLOW_UP_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            disabled={isPending}
            onClick={() => save({ color: c })}
            className={cn(
              "h-4 w-4 rounded-full border",
              FOLLOW_UP_COLOR_CLASS[c],
              option.color === c && "ring-2 ring-primary ring-offset-1"
            )}
          />
        ))}
      </div>

      <span className="text-[11px] text-muted-foreground">
        {BEHAVIOR_LABEL[option.behavior]}
      </span>

      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={toggleArchived}
        className="ml-auto h-7 gap-1 text-[11px]"
      >
        {option.archived ? (
          <>
            <ArchiveRestore className="h-3.5 w-3.5" /> Restaurar
          </>
        ) : (
          <>
            <Archive className="h-3.5 w-3.5" /> Archivar
          </>
        )}
      </Button>
    </div>
  );
}

export function ManageFollowUpOptionsDialog({
  open,
  onOpenChange,
  catalog,
  onCatalogChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: FollowUpCatalog;
  onCatalogChange: (catalog: FollowUpCatalog) => void;
}) {
  function replace(kind: "nextActions" | "qualifications", option: FollowUpOption) {
    onCatalogChange({
      ...catalog,
      [kind]: catalog[kind].map((o) => (o.id === option.id ? option : o)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Valores de seguimiento</DialogTitle>
          <DialogDescription>
            Los valores de fábrica no se editan. Los propios se archivan en vez de
            borrarse: las llamadas que ya los tienen cargados los siguen mostrando.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-1">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Próximo paso
            </h4>
            {catalog.nextActions.map((option) => (
              <OptionRow
                key={option.slug}
                option={option}
                onChanged={(next) => replace("nextActions", next)}
              />
            ))}
          </section>

          <section className="flex flex-col gap-1">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Calificación
            </h4>
            {catalog.qualifications.map((option) => (
              <OptionRow
                key={option.slug}
                option={option}
                onChanged={(next) => replace("qualifications", next)}
              />
            ))}
          </section>

          <p className="text-[11px] text-muted-foreground">
            Para crear un valor nuevo, abrí el selector en cualquier fila de la
            tabla y elegí &ldquo;Crear valor…&rdquo;.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
