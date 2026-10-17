"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, KeyRound } from "lucide-react";
import { Button, Input, Label, cn } from "@ai-coo/ui";
import {
  crearClaveDeIngestaAction,
  revocarClaveDeIngestaAction,
} from "@/app/webinar/claves-de-ingesta-actions";
import {
  correrAccion,
  correrMutacion,
  type Aviso,
  type Lectura,
} from "@/lib/client/correr-accion";
import type { MutationResult } from "@/lib/server/action-result";
import type { ClaveDeIngestaResumen } from "@/lib/webinar/claves-de-ingesta";
import { CLAVE_DE_INGESTA_INEXISTENTE } from "@/lib/webinar/textos-de-claves";
import { useToast } from "@/providers/toast-provider";

/**
 * Integraciones → Landing (SCRUM-527): las claves de ingesta con las que la
 * landing del webinar manda registros y visitas a Limitless.
 *
 * La clave se ve una sola vez, al crearla: en la base queda sólo su hash. Por
 * eso el recuadro de la clave nueva avisa que no se vuelve a mostrar y ofrece
 * copiarla. Revocar pide confirmación acá mismo (no con el diálogo del
 * navegador): una landing con esa clave deja de poder mandar registros en el
 * acto.
 */

export const AVISO_UNA_SOLA_VEZ =
  "Copiala ahora y guardala en la configuración de la landing: no se vuelve a mostrar. Si la perdés, creá otra y revocá esta.";

export const COPIADA = "Copiada";
export const NO_SE_PUDO_COPIAR = "No se pudo copiar: seleccioná la clave y copiala a mano.";

/** La lista con una clave marcada como revocada. */
export function conClaveRevocada(
  claves: ClaveDeIngestaResumen[],
  id: string,
  revokedAt: string,
): ClaveDeIngestaResumen[] {
  return claves.map((clave) => (clave.id === id ? { ...clave, revokedAt } : clave));
}

/**
 * Copia al portapapeles. Sin portapapeles (contexto inseguro, permiso
 * denegado) es "no": el panel le dice al usuario que la copie a mano, que es
 * lo único que le queda.
 */
export async function copiarAlPortapapeles(
  texto: string,
  portapapeles: Pick<Clipboard, "writeText"> | undefined,
): Promise<"si" | "no"> {
  if (!portapapeles) return "no";
  try {
    await portapapeles.writeText(texto);
    return "si";
  } catch {
    return "no";
  }
}

/**
 * Qué hacer con la respuesta de revocar (AR pasada 1, MNR-1):
 * - éxito: cerrar la confirmación, marcarla revocada y avisar;
 * - "no encontramos esa clave o ya estaba revocada": la lista está vieja (otra
 *   pestaña ya la revocó): cerrar la confirmación, avisar y releer;
 * - otro error: avisar y dejar la confirmación abierta para reintentar.
 */
export function manejarResultadoDeRevocar(
  resultado: MutationResult<{ revokedAt: string }>,
  id: string,
  acciones: {
    cerrarConfirmacion: () => void;
    marcarRevocada: (id: string, revokedAt: string) => void;
    releer: () => void;
    avisar: (aviso: Aviso) => void;
  },
): void {
  if (resultado.success) {
    acciones.cerrarConfirmacion();
    acciones.marcarRevocada(id, resultado.data.revokedAt);
    acciones.avisar({ title: "Clave revocada", variant: "success" });
    return;
  }
  acciones.avisar({ title: "No se pudo revocar la clave", description: resultado.error });
  if (resultado.error === CLAVE_DE_INGESTA_INEXISTENTE) {
    acciones.cerrarConfirmacion();
    acciones.releer();
  }
}

/**
 * A dónde va el foco cuando cambia la confirmación (AR pasada 1, MNR-2). El
 * botón "Revocar" se desmonta al abrirla: sin esto, el foco caía en `body`.
 * - Se abre: a "Cancelar", la opción que no rompe nada.
 * - Se cierra: al "Revocar" de esa clave si sigue activa; si se revocó, a su
 *   fila.
 */
export type DestinoDelFoco =
  | { a: "cancelar" }
  | { a: "revocar"; id: string }
  | { a: "fila"; id: string }
  | null;

export function destinoDelFoco(
  anterior: string | null,
  actual: string | null,
  claves: ClaveDeIngestaResumen[],
): DestinoDelFoco {
  if (actual !== null && actual !== anterior) return { a: "cancelar" };
  if (actual === null && anterior !== null) {
    const clave = claves.find((c) => c.id === anterior);
    if (!clave) return null;
    return clave.revokedAt === null ? { a: "revocar", id: clave.id } : { a: "fila", id: clave.id };
  }
  return null;
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
  const router = useRouter();
  const { push } = useToast();
  const [isPending, startTransition] = useTransition();
  const [claves, setClaves] = useState<ClaveDeIngestaResumen[]>(
    lectura.ok ? lectura.data : [],
  );
  const [nombre, setNombre] = useState("");
  const [nueva, setNueva] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);

  // Después de releer (router.refresh), la página trae la lista nueva.
  useEffect(() => {
    if (lectura.ok) setClaves(lectura.data);
  }, [lectura]);

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
      correrAccion({
        accion: () => revocarClaveDeIngestaAction(id),
        tituloError: "No se pudo revocar la clave",
        etiqueta: "[LandingSettings] revocar clave de ingesta",
        avisar: push,
        alTerminar: (resultado) =>
          manejarResultadoDeRevocar(resultado, id, {
            cerrarConfirmacion: () => setAConfirmar(null),
            marcarRevocada: (idRevocada, revokedAt) =>
              setClaves((actuales) => conClaveRevocada(actuales, idRevocada, revokedAt)),
            releer: () => router.refresh(),
            avisar: push,
          }),
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

/** El resultado de copiar, anunciado a los lectores de pantalla. */
export function AvisoDeCopiado({ estado }: { estado: "si" | "no" | null }) {
  return (
    <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
      {estado === "si" ? COPIADA : estado === "no" ? NO_SE_PUDO_COPIAR : ""}
    </span>
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
    setCopiada(await copiarAlPortapapeles(clave, navigator.clipboard));
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
          Copiar
        </Button>
        <Button size="sm" variant="ghost" onClick={onListo}>
          Ya la guardé
        </Button>
        <AvisoDeCopiado estado={copiada} />
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
  const cancelar = useRef<HTMLButtonElement | null>(null);
  const botonesRevocar = useRef(new Map<string, HTMLButtonElement>());
  const filas = useRef(new Map<string, HTMLLIElement>());
  const anterior = useRef<string | null>(aConfirmar);

  useEffect(() => {
    const destino = destinoDelFoco(anterior.current, aConfirmar, claves);
    anterior.current = aConfirmar;
    if (!destino) return;
    if (destino.a === "cancelar") cancelar.current?.focus();
    else if (destino.a === "revocar") botonesRevocar.current.get(destino.id)?.focus();
    else filas.current.get(destino.id)?.focus();
  }, [aConfirmar, claves]);

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
            tabIndex={-1}
            ref={(nodo) => {
              if (nodo) filas.current.set(clave.id, nodo);
              else filas.current.delete(clave.id);
            }}
            className={cn(
              "space-y-2 rounded-lg border border-border/60 px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
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
                  aria-label={`Revocar la clave «${clave.label}»`}
                  ref={(nodo: HTMLButtonElement | null) => {
                    if (nodo) botonesRevocar.current.set(clave.id, nodo);
                    else botonesRevocar.current.delete(clave.id);
                  }}
                  onClick={() => onPedirRevocar(clave.id)}
                  className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                >
                  Revocar
                </Button>
              )}
            </div>
            {!revocada && aConfirmar === clave.id ? (
              <div
                role="group"
                aria-label={`Confirmar que querés revocar la clave «${clave.label}»`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2"
              >
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
                <Button
                  ref={cancelar}
                  size="sm"
                  variant="ghost"
                  disabled={ocupado}
                  onClick={onCancelar}
                >
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
