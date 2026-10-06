"use client";

import { useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ai-coo/ui";
import { Upload } from "lucide-react";
import {
  importClientsAction,
  type ImportClientsRowError,
} from "@/app/clients/actions";
import { correrMutacion } from "@/lib/client/correr-accion";
import {
  CLIENT_IMPORT_REQUIRED_HEADERS,
  CLIENT_IMPORT_TEMPLATE,
  parseClientsImportFile,
} from "@/lib/clients/parse-client-import";
import { usePlatformData } from "@/providers";
import { useToast } from "@/providers/toast-provider";
import type { Client } from "@/types/clients";

export function ImportClientsDialog() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { refreshClients } = usePlatformData();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Omit<Client, "id">[]>([]);
  const [errors, setErrors] = useState<ImportClientsRowError[]>([]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFileName(null);
    setRows([]);
    setErrors([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File | null) => {
    setFileName(file?.name ?? null);
    setRows([]);
    setErrors([]);
    if (!file) return;

    const parsed = await parseClientsImportFile(file);
    setRows(parsed.rows);
    setErrors(parsed.errors);
  };

  const handleImport = async () => {
    setSaving(true);
    try {
      await correrMutacion({
        accion: () => importClientsAction(rows),
        alExito: async (result) => {
          // Los errores por fila del archivo vienen en el dato, no como error.
          if (result.errors.length > 0) {
            setErrors(result.errors);
            return;
          }
          await refreshClients();
          push({
            title: "Clientes importados",
            description: `${result.insertedCount} clientes cargados correctamente.`,
            variant: "success",
          });
          setOpen(false);
          resetForm();
        },
        avisar: push,
        tituloError: "No se pudieron importar los clientes",
        etiqueta: "[ImportClientsDialog] importar clientes",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Cargar clientes
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,720px)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Cargar clientes</DialogTitle>
            <DialogDescription>
              Importá clientes desde CSV o Excel (.xlsx) con las columnas requeridas.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
            <div className="rounded-lg bg-muted/20 p-3">
              <p className="font-medium">Formato requerido</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Columnas obligatorias: {CLIENT_IMPORT_REQUIRED_HEADERS.join(", ")}.
                Valores válidos: paymentType = upfront, installments, upfront_fee;
                platform = stripe, mercadopago, paypal, bank_transfer, other.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 text-xs text-muted-foreground">
                {CLIENT_IMPORT_TEMPLATE}
              </pre>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
            />

            {fileName ? (
              <p className="text-xs text-muted-foreground">
                Archivo: {fileName} · Filas detectadas: {rows.length}
              </p>
            ) : null}

            {errors.length > 0 ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive">
                  Revisá estas filas antes de importar
                </p>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-destructive">
                  {errors.map((error, index) => (
                    <li key={`${error.row}-${index}`}>
                      Fila {error.row}: {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleImport()}
              disabled={saving || rows.length === 0 || errors.length > 0}
            >
              {saving ? "Importando…" : "Importar clientes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
