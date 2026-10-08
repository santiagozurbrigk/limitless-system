"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { leerPagosDelCliente, leerPagosDeLaOrganizacion } from "@/lib/sales/pagos";
import { rowToClient, type ClientRow } from "@/lib/clients/mapper";
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
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { moneySchema, uuidSchema } from "@/lib/validations";
import { paths } from "@/routes";
import type { Client, ClientInstallment } from "@/types/clients";
import type { ClientPayment } from "@/types/clients";
import { assertOrgStoragePath, isOrgStoragePath } from "@/lib/storage/org-path";

/*
 * SCRUM-504: las acciones de Cobros devuelven sus errores como valor
 * (`MutationResult`) con `mutacionConErroresEsperables`. Validación, sesión,
 * cliente que no es de la org, sin plan de cuotas, sin cuotas pendientes y la
 * ruta del comprobante que no es de la org vuelven con su motivo. El pago y su
 * cuota se registran juntos (`registrar_pago_de_cliente`). Un error de
 * la base (`FallaDeLaBase`), del Storage o un bug se registra, va a Sentry y
 * vuelve con el texto fijo: antes llegaba el mensaje crudo de la base, y las
 * lecturas devolvían `[]` (en Cobros y Finanzas, "sin pagos").
 */

const CLIENTE_NO_ENCONTRADO = "Cliente no encontrado";
const RUTA_INVALIDA = "La ruta del comprobante no es válida.";

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
  /** La genera la pantalla al abrir el formulario: un reintento no duplica el cobro. */
  claveIdempotencia: z.string().trim().min(8).max(100).optional(),
});

const addInstallmentPaymentSchema = z.object({
  clientId: uuidSchema,
  amount: moneySchema,
  paymentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  storagePath: z.string().trim().min(1).nullish(),
  mimeType: z.string().trim().min(1).max(200).nullish(),
  claveIdempotencia: z.string().trim().min(8).max(100).optional(),
});

/** Datos validados de un pago, sin el usuario que lo carga. */
type DatosDelPago = z.infer<typeof recordPaymentSchema>;

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

  return mutacionConErroresEsperables("[prepareClientPaymentReceiptUpload]", async () => {
    const organizationId = await requireOrganizationId();
    const { clientId, fileName, fileSize, mimeType } = parsed.data;

    const allowed = isAllowedPaymentReceipt(fileName, mimeType, fileSize);
    if (!allowed.ok) throw new ErrorEsperable(allowed.error);

    if (clientId) {
      const supabase = await createClient();
      const { data: client, error } = await supabase
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw new FallaDeLaBase(error);
      if (!client) throw new ErrorEsperable(CLIENTE_NO_ENCONTRADO);
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

    // Falla del Storage (o el bucket que falta): se registra con el detalle.
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

/**
 * Registra un pago ya validado. Lanza `ErrorEsperable` o la falla; la usan
 * `recordClientPaymentAction` y `addInstallmentPaymentAction` sin pasar por
 * otra server action.
 */
async function registrarPago(
  organizationId: string,
  datos: DatosDelPago
): Promise<ClientPayment> {
  const supabase = await createClient();

  // La guarda sigue valiendo, pero sólo cuando hay archivo: sin comprobante
  // no hay ruta que validar.
  if (datos.storagePath && !isOrgStoragePath(datos.storagePath, organizationId)) {
    throw new ErrorEsperable(RUTA_INVALIDA);
  }

  // Pago y cuota en una sola transacción, con la RLS y la org de la sesión, y
  // la clave de idempotencia (20261008150000_registrar_pago_de_cliente): si la
  // cuota no se puede marcar no queda el pago, y un reintento con la misma
  // clave devuelve el pago ya registrado.
  const { data, error } = await supabase.rpc("registrar_pago_de_cliente", {
    p_client_id: datos.clientId,
    p_amount: datos.amount,
    p_payment_date: datos.paymentDate,
    p_storage_path: datos.storagePath ?? null,
    p_mime_type: datos.mimeType ?? null,
    p_installment_number: datos.installmentNumber ?? null,
    p_payment_received_from: datos.paymentReceivedFrom ?? null,
    p_payment_destination_platform_id: datos.paymentDestinationPlatformId ?? null,
    p_clave_idempotencia: datos.claveIdempotencia ?? null,
  });

  if (error) {
    // P0002: el cliente no es de la org de la sesión (o no existe).
    if (error.code === "P0002") throw new ErrorEsperable(CLIENTE_NO_ENCONTRADO);
    throw new FallaDeLaBase(error);
  }
  if (!data) throw new Error("registrar_pago_de_cliente no devolvió el pago");

  revalidatePaymentScreens();
  return rowToClientPayment(data as ClientPaymentRow);
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

  return mutacionConErroresEsperables("[recordClientPayment]", async () =>
    registrarPago(await requireOrganizationId(), parsed.data)
  );
}

export async function listOrganizationPaymentsAction(): Promise<
  MutationResult<ClientPayment[]>
> {
  return mutacionConErroresEsperables("[listOrganizationPayments]", async () => {
    const organizationId = await requireOrganizationId();
    return leerPagosDeLaOrganizacion(await createClient(), organizationId);
  });
}

export async function listClientPaymentsAction(
  clientId: string
): Promise<MutationResult<ClientPayment[]>> {
  const idParsed = uuidSchema.safeParse(clientId);
  if (!idParsed.success) return { success: false, error: "Identificador inválido" };

  return mutacionConErroresEsperables("[listClientPayments]", async () => {
    const organizationId = await requireOrganizationId();
    return leerPagosDelCliente(await createClient(), organizationId, idParsed.data);
  });
}

export async function getClientPaymentReceiptUrlAction(
  paymentId: unknown
): Promise<MutationResult<{ url: string; mimeType: string | null }>> {
  const parsed = uuidSchema.safeParse(paymentId);
  if (!parsed.success) {
    return { success: false, error: "Identificador inválido" };
  }

  return mutacionConErroresEsperables("[getClientPaymentReceiptUrl]", async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    const { data: row, error } = await admin
      .from("client_payments")
      .select("storage_path, mime_type")
      .eq("organization_id", organizationId)
      .eq("id", parsed.data)
      .maybeSingle();

    if (error) throw new FallaDeLaBase(error);
    if (!row?.storage_path) throw new ErrorEsperable("Comprobante no encontrado");

    // Una ruta guardada que no es de la org es un dato roto (o escrito a mano
    // por PostgREST): se registra y no se firma.
    const { data, error: signedUrlError } = await admin.storage
      .from(CLIENT_PAYMENT_RECEIPTS_BUCKET)
      .createSignedUrl(assertOrgStoragePath(row.storage_path, organizationId), 3600);

    if (signedUrlError || !data?.signedUrl) {
      throw new Error(signedUrlError?.message ?? "No se pudo firmar la URL del comprobante");
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

  return mutacionConErroresEsperables("[addInstallmentPayment]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { clientId, amount, paymentDate, storagePath, mimeType, claveIdempotencia } =
      parsed.data;

    const { data: clientRow, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (clientError) throw new FallaDeLaBase(clientError);
    if (!clientRow) throw new ErrorEsperable(CLIENTE_NO_ENCONTRADO);
    if (clientRow.payment_type !== "installments") {
      throw new ErrorEsperable("Este cliente no tiene plan de cuotas");
    }

    // Un reintento de una cuota ya registrada (misma clave): se devuelve ese
    // pago, sin calcular otra "próxima cuota".
    if (claveIdempotencia) {
      const { data: previo, error: previoError } = await supabase
        .from("client_payments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("clave_idempotencia", claveIdempotencia)
        .maybeSingle();
      if (previoError) throw new FallaDeLaBase(previoError);
      if (previo) {
        return {
          payment: rowToClientPayment(previo as ClientPaymentRow),
          client: rowToClient(clientRow as ClientRow),
        };
      }
    }

    const existing = await leerPagosDelCliente(supabase, organizationId, clientId);
    const installmentNumber = nextPendingInstallmentNumber(
      clientRow.installments as ClientInstallment[] | undefined,
      existing
    );
    if (installmentNumber == null) {
      throw new ErrorEsperable("No hay cuotas pendientes por registrar");
    }

    const referencePayment = existing[0];
    const payment = await registrarPago(organizationId, {
      clientId,
      amount,
      paymentDate,
      storagePath,
      mimeType,
      installmentNumber,
      paymentReceivedFrom: referencePayment?.paymentReceivedFrom,
      paymentDestinationPlatformId: referencePayment?.paymentDestinationPlatformId,
      claveIdempotencia,
    });

    const { data: updatedClient, error: reloadError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .single();

    if (reloadError) throw new FallaDeLaBase(reloadError);

    revalidatePaymentScreens();
    return {
      payment,
      client: rowToClient(updatedClient as ClientRow),
    };
  });
}
