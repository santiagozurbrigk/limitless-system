"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import {
  patchToUpdateRow,
  rowToClient,
  type ClientRow,
} from "@/lib/clients/mapper";
import {
  rowToClientPayment,
  type ClientPaymentRow,
} from "@/lib/clients/payment-mapper";
import { CLIENT_PAYMENT_RECEIPTS_BUCKET } from "@/lib/clients/constants";
import {
  isAllowedPaymentReceipt,
  sanitizeFilename,
} from "@/lib/clients/receipt-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { moneySchema, uuidSchema } from "@/lib/validations";
import { paths } from "@/routes";
import type { Client, ClientInstallment } from "@/types/clients";
import type { ClientPayment } from "@/types/clients";
import { assertOrgStoragePath } from "@/lib/storage/org-path";

const prepareReceiptUploadSchema = z.object({
  clientId: uuidSchema.optional(),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1).max(200),
});

/**
 * ⭐ El comprobante es opcional: un cobro sin comprobante sigue siendo un cobro.
 *
 * Si viene, viene entero —ruta y tipo—; si no viene, no viene ninguno de los
 * dos. Guardar una ruta sin tipo dejaría un archivo que después no se sabe
 * cómo abrir.
 */
const recordPaymentSchema = z.object({
  clientId: uuidSchema,
  amount: moneySchema,
  paymentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  storagePath: z.string().trim().min(1).nullish(),
  mimeType: z.string().trim().min(1).max(200).nullish(),
  installmentNumber: z.number().int().min(1).max(120).nullable().optional(),
  paymentReceivedFrom: z.string().trim().max(500).optional(),
  paymentDestinationPlatformId: uuidSchema.optional(),
});

const addInstallmentPaymentSchema = z.object({
  clientId: uuidSchema,
  amount: moneySchema,
  paymentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  storagePath: z.string().trim().min(1).nullish(),
  mimeType: z.string().trim().min(1).max(200).nullish(),
});

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Un pago cambia tres pantallas, no una.
 *
 * Revalidar una sola dejaba a las otras con datos viejos para quien entra por
 * URL directa. Para quien navega dentro de la app, lo que manda es
 * `refreshClientPayments` del provider — esto cubre la otra mitad.
 *
 * ⭐ La primera de las tres ya no es la ficha del cliente sino Cobros: los
 * pagos se mudaron a Ventas y la ficha no los muestra más. Revalidar la ficha
 * seguiría "funcionando" —no falla nunca— y no refrescaría nada.
 */
function revalidatePaymentScreens() {
  revalidatePath(paths.platform.sales.cobros);
  revalidatePath(paths.platform.finance.root);
  revalidatePath(paths.platform.dashboard);
}

function markInstallmentPaid(
  installments: ClientInstallment[],
  installmentNumber: number,
  paidAt: string
): ClientInstallment[] {
  const index = installmentNumber - 1;
  if (index < 0 || index >= installments.length) return installments;
  return installments.map((inst, i) =>
    i === index
      ? { ...inst, status: "paid" as const, paidAt }
      : inst
  );
}

function nextPendingInstallmentNumber(
  installments: ClientInstallment[] | undefined,
  existingPayments: ClientPayment[]
): number | null {
  if (!installments?.length) return null;
  const paidNumbers = new Set(
    existingPayments
      .map((p) => p.installmentNumber)
      .filter((n): n is number => n != null)
  );
  for (let i = 0; i < installments.length; i++) {
    const num = i + 1;
    if (installments[i]?.status === "pending" && !paidNumbers.has(num)) {
      return num;
    }
  }
  return null;
}

export async function prepareClientPaymentReceiptUploadAction(
  input: unknown
): Promise<
  MutationResult<{ storagePath: string; signedUrl: string; contentType: string }>
> {
  const parsed = prepareReceiptUploadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const { clientId, fileName, fileSize, mimeType } = parsed.data;

    const allowed = isAllowedPaymentReceipt(fileName, mimeType, fileSize);
    if (!allowed.ok) throw new Error(allowed.error);

    if (clientId) {
      const supabase = await createClient();
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!client) throw new Error("Cliente no encontrado");
    }

    const uploadId = crypto.randomUUID();
    const safeName = sanitizeFilename(fileName);
    const storagePath = clientId
      ? `${organizationId}/${clientId}/${uploadId}-${safeName}`
      : `${organizationId}/${uploadId}-${safeName}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(CLIENT_PAYMENT_RECEIPTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      throw new Error(
        error?.message ??
          `No se pudo preparar la subida. ¿Existe el bucket "${CLIENT_PAYMENT_RECEIPTS_BUCKET}"?`
      );
    }

    return {
      storagePath,
      signedUrl: data.signedUrl,
      contentType: allowed.mimeType,
    };
  });
}

export async function recordClientPaymentAction(
  input: unknown
): Promise<MutationResult<ClientPayment>> {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const uploadedBy = await currentUserId();
    const supabase = await createClient();
    const {
      clientId,
      amount,
      paymentDate,
      storagePath,
      mimeType,
      installmentNumber,
      paymentReceivedFrom,
      paymentDestinationPlatformId,
    } = parsed.data;

    // La guarda sigue valiendo, pero sólo cuando hay archivo: sin comprobante
    // no hay ruta que validar.
    if (storagePath) assertOrgStoragePath(storagePath, organizationId);

    const { data: clientRow, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (clientError) throw new Error(clientError.message);
    if (!clientRow) throw new Error("Cliente no encontrado");

    const { data: paymentRow, error: insertError } = await supabase
      .from("client_payments")
      .insert({
        client_id: clientId,
        organization_id: organizationId,
        amount,
        payment_date: paymentDate,
        storage_path: storagePath ?? null,
        mime_type: mimeType ?? null,
        installment_number: installmentNumber ?? null,
        payment_received_from: paymentReceivedFrom ?? null,
        payment_destination_platform_id: paymentDestinationPlatformId ?? null,
        uploaded_by: uploadedBy,
      })
      .select()
      .single();

    if (insertError || !paymentRow) {
      const msg = insertError?.message ?? "No se pudo registrar el pago";
      if (isMissingTableError(msg)) {
        throw new Error(
          "Falta la tabla client_payments. Ejecuta supabase/migrations/20260715100000_client_payments.sql en Supabase."
        );
      }
      throw new Error(msg);
    }

    if (
      installmentNumber != null &&
      clientRow.payment_type === "installments" &&
      Array.isArray(clientRow.installments)
    ) {
      const installments = markInstallmentPaid(
        clientRow.installments as ClientInstallment[],
        installmentNumber,
        paymentDate
      );
      const updateRow = patchToUpdateRow({ installments });
      await supabase
        .from("clients")
        .update(updateRow)
        .eq("id", clientId)
        .eq("organization_id", organizationId);
    }

    revalidatePaymentScreens();
    return rowToClientPayment(paymentRow as ClientPaymentRow);
  });
}

export async function listOrganizationPaymentsAction(): Promise<ClientPayment[]> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("client_payments")
      .select("*")
      .eq("organization_id", organizationId)
      .order("payment_date", { ascending: false });

    if (error) {
      if (!isMissingTableError(error.message)) {
        console.error("[listOrganizationPayments]", error.message);
      }
      return [];
    }

    return (data as ClientPaymentRow[]).map(rowToClientPayment);
  } catch {
    return [];
  }
}

export async function listClientPaymentsAction(
  clientId: string
): Promise<ClientPayment[]> {
  const idParsed = uuidSchema.safeParse(clientId);
  if (!idParsed.success) return [];

  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("client_payments")
      .select("*")
      .eq("client_id", idParsed.data)
      .eq("organization_id", organizationId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      if (!isMissingTableError(error.message)) {
        console.error("[listClientPayments]", error.message);
      }
      return [];
    }

    return (data as ClientPaymentRow[]).map(rowToClientPayment);
  } catch {
    return [];
  }
}

export async function getClientPaymentReceiptUrlAction(
  paymentId: unknown
): Promise<MutationResult<{ url: string; mimeType: string | null }>> {
  const parsed = uuidSchema.safeParse(paymentId);
  if (!parsed.success) {
    return { success: false, error: "Identificador inválido" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    const { data: row, error } = await admin
      .from("client_payments")
      .select("storage_path, mime_type")
      .eq("organization_id", organizationId)
      .eq("id", parsed.data)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row?.storage_path) throw new Error("Comprobante no encontrado");

    const { data, error: signedUrlError } = await admin.storage
      .from(CLIENT_PAYMENT_RECEIPTS_BUCKET)
      .createSignedUrl(assertOrgStoragePath(row.storage_path, organizationId), 3600);

    if (signedUrlError || !data?.signedUrl) {
      throw new Error(
        signedUrlError?.message ?? "No se pudo abrir el comprobante"
      );
    }

    return {
      url: data.signedUrl,
      mimeType: (row.mime_type as string | null) ?? null,
    };
  });
}

export async function addInstallmentPaymentAction(
  input: unknown
): Promise<MutationResult<{ payment: ClientPayment; client: Client }>> {
  const parsed = addInstallmentPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { clientId, amount, paymentDate, storagePath, mimeType } =
      parsed.data;

    const { data: clientRow, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (clientError) throw new Error(clientError.message);
    if (!clientRow) throw new Error("Cliente no encontrado");
    if (clientRow.payment_type !== "installments") {
      throw new Error("Este cliente no tiene plan de cuotas");
    }

    const existing = await listClientPaymentsAction(clientId);
    const installmentNumber = nextPendingInstallmentNumber(
      clientRow.installments as ClientInstallment[] | undefined,
      existing
    );
    if (installmentNumber == null) {
      throw new Error("No hay cuotas pendientes por registrar");
    }

    const referencePayment = existing[0];
    const recordResult = await recordClientPaymentAction({
      clientId,
      amount,
      paymentDate,
      storagePath,
      mimeType,
      installmentNumber,
      paymentReceivedFrom: referencePayment?.paymentReceivedFrom,
      paymentDestinationPlatformId:
        referencePayment?.paymentDestinationPlatformId,
    });

    if (!recordResult.success) {
      throw new Error(recordResult.error);
    }

    const { data: updatedClient, error: reloadError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .single();

    if (reloadError || !updatedClient) {
      throw new Error(reloadError?.message ?? "No se pudo recargar el cliente");
    }

    revalidatePaymentScreens();
    return {
      payment: recordResult.data,
      client: rowToClient(updatedClient as ClientRow),
    };
  });
}
