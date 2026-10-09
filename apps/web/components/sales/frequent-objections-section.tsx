"use client";

import { useEffect, useState } from "react";
import { getFrequentObjectionsAction } from "@/app/sales/actions";
import { FrequentObjectionsPanel } from "@/components/sales/frequent-objections-panel";
import type { FrequentObjectionsResult } from "@/types/sales";
import { leerConMotivo } from "@/lib/client/correr-accion";

export function FrequentObjectionsSection({
  initialData,
  initialError = null,
}: {
  initialData?: FrequentObjectionsResult;
  /** El motivo si la lectura del servidor falló: no se reintenta al montar. */
  initialError?: string | null;
}) {
  const [data, setData] = useState<FrequentObjectionsResult | null>(
    initialData ?? null
  );
  const [loading, setLoading] = useState(!initialData && !initialError);
  // Por qué no se pudieron leer (SCRUM-504): el motivo devuelto, o el texto
  // fijo si la acción lanzó.
  const [loadError, setLoadError] = useState<string | null>(initialError);

  useEffect(() => {
    if (initialData || initialError) return;

    let cancelled = false;
    void leerConMotivo(getFrequentObjectionsAction, "[FrequentObjectionsSection]").then(
      (lectura) => {
        if (cancelled) return;
        if (lectura.ok) setData(lectura.data);
        else setLoadError(lectura.motivo);
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [initialData, initialError]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Cargando objeciones frecuentes…
      </p>
    );
  }

  if (loadError) {
    return (
      <FrequentObjectionsPanel
        objections={[]}
        dataSource="empty"
        loadError={loadError}
      />
    );
  }

  if (!data) return null;

  return (
    <FrequentObjectionsPanel
      objections={data.objections}
      dataSource={data.dataSource}
    />
  );
}
