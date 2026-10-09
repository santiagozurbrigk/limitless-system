"use client";

import { useRef, useState } from "react";
import { cn } from "@ai-coo/ui";
import { Upload } from "lucide-react";
import {
  CLIENT_PAYMENT_RECEIPTS_ACCEPT,
  CLIENT_PAYMENT_RECEIPTS_MAX_BYTES,
} from "@/lib/clients/constants";
import { isAllowedPaymentReceipt } from "@/lib/clients/receipt-types";
import { falloInesperado } from "@/lib/client/correr-accion";

export function PaymentReceiptDropzone({
  file,
  onFileChange,
  disabled,
  label,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    if (!f) {
      onFileChange(null);
      setError(null);
      return;
    }
    const allowed = isAllowedPaymentReceipt(f.name, f.type, f.size);
    if (!allowed.ok) {
      setError(allowed.error);
      onFileChange(null);
      return;
    }
    setError(null);
    onFileChange(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files[0];
    if (dropped) pickFile(dropped);
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-[120px] flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-xs transition-colors",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-primary/50",
          dragOver ? "border-primary bg-primary/5" : "border-border text-muted-foreground"
        )}
      >
        <Upload className="mb-2 h-5 w-5" />
        {file ? (
          <p className="font-medium text-foreground">{file.name}</p>
        ) : (
          <p>{label ?? "Arrastrá un archivo o hacé clic para subir el comprobante"}</p>
        )}
        <p className="mt-1 text-2xs">
          PDF, PNG, JPG o WEBP — máx.{" "}
          {CLIENT_PAYMENT_RECEIPTS_MAX_BYTES / (1024 * 1024)} MB
        </p>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={CLIENT_PAYMENT_RECEIPTS_ACCEPT}
          disabled={disabled}
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {file ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            pickFile(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          Quitar archivo
        </button>
      ) : null}
    </div>
  );
}

/**
 * Sube un comprobante. Nunca rechaza (SCRUM-504): el motivo que devuelve la
 * acción, o el texto fijo si la acción o la subida lanzaron (queda en la
 * consola).
 */
export async function uploadPaymentReceiptFile(
  file: File,
  clientId?: string
): Promise<
  | { ok: true; storagePath: string; mimeType: string; fileName: string }
  | { ok: false; error: string }
> {
  try {
    return await subirComprobante(file, clientId);
  } catch (error) {
    return { ok: false, error: falloInesperado("[uploadPaymentReceiptFile]", error) };
  }
}

async function subirComprobante(
  file: File,
  clientId?: string
): Promise<
  | { ok: true; storagePath: string; mimeType: string; fileName: string }
  | { ok: false; error: string }
> {
  const { prepareClientPaymentReceiptUploadAction } = await import(
    "@/app/sales/payment-actions"
  );

  const prep = await prepareClientPaymentReceiptUploadAction({
    clientId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  });

  if (!prep.success) {
    return { ok: false, error: prep.error };
  }

  const uploadRes = await fetch(prep.data.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": prep.data.contentType },
    body: file,
  });

  if (!uploadRes.ok) {
    return {
      ok: false,
      error: `Error al subir el comprobante (${uploadRes.status}). Revisá el bucket en Supabase Storage.`,
    };
  }

  return {
    ok: true,
    storagePath: prep.data.storagePath,
    mimeType: prep.data.contentType,
    fileName: file.name,
  };
}
