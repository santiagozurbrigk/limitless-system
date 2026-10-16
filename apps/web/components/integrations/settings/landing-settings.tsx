"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, KeyRound } from "lucide-react";
import { Button, Input, Label, cn } from "@ai-coo/ui";
import {
  crearClaveDeIngestaAction,
  revocarClaveDeIngestaAction,
} from "@/app/webinar/claves-de-ingesta-actions";
import { correrMutacion, type Lectura } from "@/lib/client/correr-accion";
import type { ClaveDeIngestaResumen } from "@/lib/webinar/claves-de-ingesta";
import { useToast } from "@/providers/toast-provider";

/**
 * Integraciones → Landing (SCRUM-527): las claves de ingesta con las que la
 * landing del webinar manda registros y visitas a Limitless.
 *
 * La clave se ve una sola vez, al crearla: en la base queda sólo su hash. Por
 * eso el recuadro de la clave nueva avisa que no se vuelve a mostrar y ofrece
 * copiarla. Revocar pide confirmación acá mismo (no con el diálogo del
 * navegador): una
 * landing con esa clave deja de poder mandar registros en el acto.
 */

export const AVISO_UNA_SOLA_VEZ =
  "Copiala ahora y guardala en la configuración de la landing: no se vuelve a mostrar. Si la perdés, creá otra y revocá esta.";

/** La lista con una clave marcada como revocada. */
export function conClaveRevocada(
  claves: ClaveDeIngestaResumen[],
  id: string,
  revokedAt: string,
): ClaveDeIngestaResumen[] {
  return claves.map((clave) => (clave.id === id ? { ...clave, revokedAt } : clave));
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function LandingSettings({
  lectura,
}: {
  lectura: Lectura<ClaveDeIngestaResumen[]>;
}) {
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [claves, setClaves] = useState<ClaveDeIngestaResumen[]>(
    lectura.ok ? lectura.data : [],
  );
  const [nombre, setNombre] = useState("");
  const [nueva, setNueva] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);

  if (!lectura.ok) {
    return <p className="text-sm text-destructive">{lectura.motivo}</p>;
  }

  function crear() {
    startTransition(() =>
      correrMutacion({
        accion: () => crearClaveDeIngestaAction(nombre),
        tituloError: "No se pudo crear la clave",
        etiqueta: "[LandingSettings] crear clave de ingesta",
        avisar: push,
        alExito: ({ clave, resumen }) => {
          setNueva(clave);
          setNombre("");
          setClaves((actuales) => [resumen, ...actuales]);
        },
      }),
    );
  }

  function revocar(id: string) {
    startTransition(() =>
      correrMutacion({
        accion: () => revocarClaveDeIngestaAction(id),
        tituloError: "No se pudo revocar la clave",
        etiqueta: "[LandingSettings] revocar clave de ingesta",
        avisar: push,
        alExito: ({ revokedAt }) => {
          setAConfirmar(null);
          setClaves((actuales) => conClaveRevocada(actuales, id, revokedAt));
          push({ title: "Clave revocada", variant: "success" });
        },
      }),
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        La landing manda cada registro y cada visita con una de estas claves.
        Creá una por landing: así podés revocar una sin cortar las demás.
      </p>

      {nueva ? (
        <ClaveRecienCreada clave={nueva} onListo={() => setNueva(null)} />
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label htmlFor="landing-clave-nombre" className="text-xs">
            Nombre de la clave
          </Label>
          <Input
            id="landing-clave-nombre"
            value={nombre}
            maxLength={100}
            placeholder="Por ejemplo, Landing del lanzamiento de noviembre"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNombre(e.target.value)}
          />
        </div>
        <Button size="sm" disabled={isPending || !nombre.trim()} onClick={crear}>
          <KeyRound className="mr-2 h-4 w-4" />
          Crear clave
        </Button>
      </div>

      <ListaDeClaves
        claves={claves}
        aConfirmar={aConfirmar}
        ocupado={isPending}
        onPedirRevocar={setAConfirmar}
        onCancelar={() => setAConfirmar(null)}
        onConfirmar={revocar}
      />
    </div>
  );
}

/** La clave recién creada, con copiar y el aviso de que no se vuelve a ver. */
export function ClaveRecienCreada({
  clave,
  onListo,
}: {
  clave: string;
  onListo: () => void;
}) {
  const [copiada, setCopiada] = useState<"si" | "no" | null>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada("si");
    } catch {
      setCopiada("no");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <p className="flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {AVISO_UNA_SOLA_VEZ}
      </p>
      <code className="block select-all break-all rounded-md bg-background/80 px-3 py-2 font-mono text-xs">
        {clave}
      </code>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={copiar}>
          {copiada === "si" ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          {copiada === "si" ? "Copiada" : "Copiar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onListo}>
          Ya la guardé
        </Button>
        {copiada === "no" ? (
          <span className="text-xs text-muted-foreground">
            No se pudo copiar: seleccioná la clave y copiala a mano.
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** La lista de claves, con la confirmación de revocar dentro de la fila. */
export function ListaDeClaves({
  claves,
  aConfirmar,
  ocupado,
  onPedirRevocar,
  onCancelar,
  onConfirmar,
}: {
  claves: ClaveDeIngestaResumen[];
  aConfirmar: string | null;
  ocupado: boolean;
  onPedirRevocar: (id: string) => void;
  onCancelar: () => void;
  onConfirmar: (id: string) => void;
}) {
  if (claves.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Todavía no creaste ninguna clave.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {claves.map((clave) => {
        const revocada = clave.revokedAt !== null;
        return (
          <li
            key={clave.id}
            className={cn(
              "space-y-2 rounded-lg border border-border/60 px-3 py-2 text-xs",
              revocada && "opacity-60",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">{clave.label}</p>
                <p className="text-muted-foreground" suppressHydrationWarning>
                  Creada el {fecha(clave.createdAt)} · Último uso:{" "}
                  {clave.lastUsedAt ? fecha(clave.lastUsedAt) : "nunca"}
                  {clave.revokedAt ? ` · Revocada el ${fecha(clave.revokedAt)}` : ""}
                </p>
              </div>
              {revocada ? (
                <span className="text-muted-foreground">Revocada</span>
              ) : aConfirmar === clave.id ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ocupado}
                  onClick={() => onPedirRevocar(clave.id)}
                  className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                >
                  Revocar
                </Button>
              )}
            </div>
            {!revocada && aConfirmar === clave.id ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                <span className="flex-1">
                  ¿Revocar «{clave.label}»? La landing que la use deja de poder
                  mandar registros en el acto. No se puede deshacer.
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={ocupado}
                  onClick={() => onConfirmar(clave.id)}
                >
                  Sí, revocar
                </Button>
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={onCancelar}>
                  Cancelar
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
