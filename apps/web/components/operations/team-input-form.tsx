"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button, FormField, Textarea, cn } from "@ai-coo/ui";
import { saveWeeklyInputAction } from "@/app/operations/actions";
import { correrMutacion } from "@/lib/operations/correr-accion";
import { Panel } from "@/components/shared/panel";
import { useToast } from "@/providers/toast-provider";
import type { Department } from "@/types/operations";

const DEPARTMENTS: { value: Department; label: string }[] = [
  { value: "sales", label: "Ventas" },
  { value: "delivery", label: "Delivery" },
  { value: "operations", label: "Operaciones" },
  { value: "marketing", label: "Marketing" },
  { value: "founder", label: "Fundador" },
];

export function TeamInputForm() {
  const [text, setText] = useState("");
  const [department, setDepartment] = useState<Department>("operations");
  const [submitting, setSubmitting] = useState(false);
  const { push } = useToast();
  const router = useRouter();

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await correrMutacion({
        accion: () => saveWeeklyInputAction({ department, content: text.trim() }),
        avisar: push,
        tituloError: "No se pudo guardar el input",
        etiqueta: "[TeamInputForm] guardar",
        alExito: () => {
          setText("");
          push({
            title: "Input guardado",
            description:
              "Quedó registrado en el contexto semanal — la IA lo tendrá en cuenta en sus análisis.",
            variant: "success",
          });
          router.refresh();
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel title="Enviar input" contentClassName="space-y-4">
      <p className="text-xs text-muted-foreground">
        Información que querés que la IA y el liderazgo tengan en cuenta esta semana —
        lo que el sistema no detecta automáticamente.
      </p>

      <FormField label="Departamento">
        <div className="flex flex-wrap gap-1.5">
          {DEPARTMENTS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDepartment(d.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                department === d.value
                  ? "border-brand-500/50 bg-brand-500/10 text-brand-600 dark:text-brand-400"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Contenido">
        <Textarea
          placeholder="Algo que el equipo o la IA deba saber esta semana..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
        />
      </FormField>

      <Button
        onClick={() => void handleSubmit()}
        disabled={submitting || !text.trim()}
        className="w-full bg-brand-600 hover:bg-brand-700"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Guardando…
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Enviar input
          </>
        )}
      </Button>
    </Panel>
  );
}
