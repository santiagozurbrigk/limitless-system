"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, Star } from "lucide-react";
import {
  Button,
  FormField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from "@ai-coo/ui";
import { saveWeeklyInputAction } from "@/app/operations/actions";
import { correrMutacion } from "@/lib/operations/correr-accion";
import { Panel } from "@/components/shared/panel";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useToast } from "@/providers/toast-provider";
import type { Department } from "@/types/operations";

type DepartmentField = {
  weekSummary: string;
  problems: string;
  rating: number;
};

type DepartmentConfig = {
  value: Department;
  label: string;
  weekLabel: string;
  weekPlaceholder: string;
  problemsLabel: string;
  problemsPlaceholder: string;
};

const DEPARTMENTS: DepartmentConfig[] = [
  {
    value: "sales",
    label: "Ventas",
    weekLabel: "¿Cómo fue la semana?",
    weekPlaceholder: "Volumen de leads, booking rate, victorias del equipo…",
    problemsLabel: "¿Problemas detectados?",
    problemsPlaceholder: "Leads sin responder, objeciones recurrentes, cuellos de botella…",
  },
  {
    value: "delivery",
    label: "Delivery",
    weekLabel: "¿Entregas al día?",
    weekPlaceholder: "Módulos completados, entregas a tiempo, feedback de clientes…",
    problemsLabel: "¿Clientes con problemas?",
    problemsPlaceholder: "Tickets abiertos, accesos fallidos, quejas recurrentes…",
  },
  {
    value: "operations",
    label: "Operaciones",
    weekLabel: "¿Procesos rotos?",
    weekPlaceholder: "SOPs desactualizados, tareas manuales repetitivas…",
    problemsLabel: "¿Qué se repitió?",
    problemsPlaceholder: "Patrones detectados, bloqueos del equipo, dependencias del fundador…",
  },
  {
    value: "marketing",
    label: "Marketing",
    weekLabel: "¿Cómo fue el contenido y el tráfico?",
    weekPlaceholder: "Publicaciones, UTMs, leads desde YouTube/Instagram…",
    problemsLabel: "¿Qué no funcionó?",
    problemsPlaceholder: "Caída de engagement, links sin conversión, cuellos en el funnel…",
  },
  {
    value: "founder",
    label: "Founder",
    weekLabel: "¿Qué decisiones tomaste?",
    weekPlaceholder: "Prioridades de la semana, cambios de estrategia, hires o cortes…",
    problemsLabel: "¿Qué priorizás?",
    problemsPlaceholder: "Foco de la próxima semana, recursos necesarios, riesgos a mitigar…",
  },
];

const EMPTY_FIELDS: DepartmentField = {
  weekSummary: "",
  problems: "",
  rating: 0,
};

function RatingPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          aria-label={`Calificar semana con ${score} de 5`}
          onClick={() => onChange(score)}
          className="rounded-md p-1 transition-colors hover:bg-muted"
        >
          <Star
            className={cn(
              "h-5 w-5",
              score <= value
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/40"
            )}
          />
        </button>
      ))}
      <span className="ml-2 text-xs text-muted-foreground">
        {value > 0 ? `${value}/5` : "Sin calificar"}
      </span>
    </div>
  );
}

function buildContent(weekSummary: string, problems: string): string {
  const parts: string[] = [];
  if (weekSummary.trim()) parts.push(weekSummary.trim());
  if (problems.trim()) {
    parts.push(`Problemas: ${problems.trim()}`);
  }
  return parts.join("\n\n");
}

export function WeeklyInputForm({
  completedDepartments = [],
  onSaved,
}: {
  completedDepartments?: Department[];
  onSaved?: () => void;
} = {}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Department>("sales");
  const [fields, setFields] = useState<Record<Department, DepartmentField>>({
    sales: { ...EMPTY_FIELDS },
    delivery: { ...EMPTY_FIELDS },
    operations: { ...EMPTY_FIELDS },
    marketing: { ...EMPTY_FIELDS },
    founder: { ...EMPTY_FIELDS },
  });
  const [submitting, setSubmitting] = useState(false);
  const { push } = useToast();
  const useSupabase = isSupabaseConfigured();

  useEffect(() => {
    setFields({
      sales: { ...EMPTY_FIELDS },
      delivery: { ...EMPTY_FIELDS },
      operations: { ...EMPTY_FIELDS },
      marketing: { ...EMPTY_FIELDS },
      founder: { ...EMPTY_FIELDS },
    });
  }, [completedDepartments.join(",")]);

  const updateField = (
    department: Department,
    key: keyof DepartmentField,
    value: string | number
  ) => {
    setFields((prev) => ({
      ...prev,
      [department]: { ...prev[department], [key]: value },
    }));
  };

  const handleSubmitTab = async (department: Department) => {
    const data = fields[department];
    const content = buildContent(data.weekSummary, data.problems);
    const hasContent = Boolean(content) || data.rating > 0;

    if (!hasContent) {
      push({
        title: "Completá al menos un campo",
        description: "Agregá un resumen, problemas o calificación antes de guardar.",
        variant: "default",
      });
      return;
    }

    const alGuardar = () => {
      onSaved?.();
      setFields((prev) => ({
        ...prev,
        [department]: { ...EMPTY_FIELDS },
      }));

      push({
        title: "Input guardado ✓",
        description: `Contexto de ${DEPARTMENTS.find((d) => d.value === department)?.label} registrado para esta semana.`,
        variant: "success",
      });

      if (useSupabase) {
        router.refresh();
      }
    };

    setSubmitting(true);
    try {
      if (!useSupabase) {
        alGuardar();
        return;
      }
      await correrMutacion({
        accion: () =>
          saveWeeklyInputAction({
            department,
            content: content || undefined,
            rating: data.rating > 0 ? data.rating : undefined,
          }),
        avisar: push,
        tituloError: "No se pudo guardar",
        etiqueta: "[WeeklyInputForm] guardar",
        alExito: alGuardar,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel
      title="Inputs semanales"
      subtitle="Menos de 2 minutos · un tab por departamento"
      contentClassName="space-y-4"
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Department)}>
        <TabsList className="flex h-auto w-full flex-wrap gap-1 bg-transparent p-0">
          {DEPARTMENTS.map((dept) => {
            const done = completedDepartments.includes(dept.value);
            return (
              <TabsTrigger
                key={dept.value}
                value={dept.value}
                className={cn(
                  "flex-1 gap-1.5 rounded-lg border text-xs sm:text-sm",
                  "data-[state=active]:border-brand-500/50 data-[state=active]:bg-brand-500/10 data-[state=active]:text-brand-600 dark:data-[state=active]:text-brand-400",
                  done && "border-emerald-500/30 bg-emerald-500/5"
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                )}
                {dept.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {DEPARTMENTS.map((dept) => {
          const data = fields[dept.value];
          const tabHasContent =
            data.weekSummary.trim() || data.problems.trim() || data.rating > 0;

          const isDone = completedDepartments.includes(dept.value);
          return (
            <TabsContent key={dept.value} value={dept.value} className="space-y-4 pt-3">
              {isDone ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ya guardaste el input de {dept.label} esta semana. Podés actualizarlo completando los campos de nuevo.
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={dept.weekLabel}>
                  <Textarea
                    placeholder={dept.weekPlaceholder}
                    value={data.weekSummary}
                    onChange={(e) =>
                      updateField(dept.value, "weekSummary", e.target.value)
                    }
                    rows={4}
                  />
                </FormField>

                <FormField label={dept.problemsLabel}>
                  <Textarea
                    placeholder={dept.problemsPlaceholder}
                    value={data.problems}
                    onChange={(e) =>
                      updateField(dept.value, "problems", e.target.value)
                    }
                    rows={4}
                  />
                </FormField>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <FormField label="Calificación de la semana (1–5)">
                  <RatingPicker
                    value={data.rating}
                    onChange={(rating) => updateField(dept.value, "rating", rating)}
                  />
                </FormField>

                <Button
                  type="button"
                  className="bg-brand-600 hover:bg-brand-700"
                  disabled={!tabHasContent || submitting}
                  onClick={() => void handleSubmitTab(dept.value)}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    `Guardar ${dept.label}`
                  )}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </Panel>
  );
}
