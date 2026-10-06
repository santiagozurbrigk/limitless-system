"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@ai-coo/ui";
import { triggerWeeklyPipelineAction } from "@/app/executive-reports/report-generation-actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mensajeDelPipeline } from "@/lib/executive-reports/mensaje-del-pipeline";
import { correrAccion } from "@/lib/client/correr-accion";
import { useToast } from "@/providers/toast-provider";

export function GenerateWeeklyPipelineButton({
  isFounder = false,
  className,
  size = "default",
}: {
  isFounder?: boolean;
  className?: string;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const useSupabase = isSupabaseConfigured();

  if (!isFounder || !useSupabase) return null;

  function handleGenerate() {
    startTransition(async () => {
      await correrAccion({
        accion: triggerWeeklyPipelineAction,
        avisar: push,
        tituloError: "No se pudo generar",
        etiqueta: "[GenerateWeeklyPipelineButton]",
        alTerminar: (result) => {
          push(mensajeDelPipeline(result));
          router.refresh();
        },
      });
    });
  }

  return (
    <Button
      type="button"
      size={size}
      className={className ?? "bg-brand-600 hover:bg-brand-700"}
      disabled={pending}
      onClick={handleGenerate}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generando…
        </>
      ) : (
        <>
          <Sparkles className="mr-2 h-4 w-4" />
          Generar reporte ahora
        </>
      )}
    </Button>
  );
}
