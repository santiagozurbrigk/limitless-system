import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504 (AR, MAYOR-2): las acciones de Cobros (`payment-actions.ts`)
 * devuelven sus errores como valor. Antes, con `runMutation`, un error de la
 * base llegaba crudo al formulario ("TypeError: fetch failed") y las lecturas
 * devolvían `[]` ante cualquier falla: Cobros y Finanzas veían "sin pagos",
 * que en montos es todo adeudado y nada cobrado.
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";
const ORG = "11111111-1111-4111-8111-111111111111";
const CLIENTE = "22222222-2222-4222-8222-222222222222";
const CLIENTE_AJENO = "33333333-3333-4333-8333-333333333333";
const PAGO = "44444444-4444-4444-8444-444444444444";

type Fila = Record<string, unknown>;
type ErrorDeLaBase = { message: string; code?: string } | null;
type Operacion = { tabla: string; op: string; valores?: unknown; filtros: Array<[string, unknown]> };

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  sesion: true,
  tablas: {} as Record<string, Fila[]>,
  errores: {} as Record<string, ErrorDeLaBase>,
  erroresPorOp: {} as Record<string, ErrorDeLaBase>,
  lanza: null as unknown,
  operaciones: [] as Operacion[],
  errorStorage: null as { message: string } | null,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
    isMissingTableError: (msg: string) => msg.includes("does not exist"),
  };
});

function clienteFalso() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "yo" } } }) },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (ruta: string) =>
          sim.errorStorage
            ? { data: null, error: sim.errorStorage }
            : { data: { signedUrl: `https://storage/${ruta}` }, error: null },
        createSignedUrl: async (ruta: string) =>
          sim.errorStorage
            ? { data: null, error: sim.errorStorage }
            : { data: { signedUrl: `https://storage/${ruta}?firmada` }, error: null },
      }),
    },
    from(tabla: string) {
      if (sim.lanza) throw sim.lanza;
      const operacion: Operacion = { tabla, op: "select", filtros: [] };
      const ejecutar = () => {
        sim.operaciones.push(operacion);
        const error = sim.errores[tabla] ?? sim.erroresPorOp[`${tabla}:${operacion.op}`] ?? null;
        if (error) return { data: null, error };
        const filas = sim.tablas[tabla] ?? [];
        if (operacion.op === "insert") {
          const nueva = { id: PAGO, created_at: "2026-10-08T00:00:00Z", ...(operacion.valores as Fila) };
          filas.push(nueva);
          return { data: [nueva], error: null };
        }
        const coincidentes = filas.filter((f) => operacion.filtros.every(([c, v]) => f[c] === v));
        if (operacion.op === "update") coincidentes.forEach((f) => Object.assign(f, operacion.valores));
        return { data: coincidentes, error: null };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        insert(valores: unknown) {
          operacion.op = "insert";
          operacion.valores = valores;
          return builder;
        },
        update(valores: unknown) {
          operacion.op = "update";
          operacion.valores = valores;
          return builder;
        },
        eq(columna: string, valor: unknown) {
          operacion.filtros.push([columna, valor]);
          return builder;
        },
        maybeSingle: async () => {
          const { data, error } = ejecutar();
          return { data: data?.[0] ?? null, error };
        },
        single: async () => {
          const { data, error } = ejecutar();
          return { data: data?.[0] ?? null, error };
        },
        then(resolver: (r: unknown) => void) {
          resolver(ejecutar());
        },
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => clienteFalso() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteFalso() }));

import {
  addInstallmentPaymentAction,
  getClientPaymentReceiptUrlAction,
  listClientPaymentsAction,
  listOrganizationPaymentsAction,
  prepareClientPaymentReceiptUploadAction,
  recordClientPaymentAction,
} from "../payment-actions";

function pago(id: string, org: string, clientId: string, extra: Fila = {}): Fila {
  return {
    id,
    organization_id: org,
    client_id: clientId,
    amount: 100,
    payment_date: "2026-10-01",
    storage_path: `${org}/${clientId}/comprobante.pdf`,
    mime_type: "application/pdf",
    installment_number: null,
    created_at: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  sim.sesion = true;
  sim.lanza = null;
  sim.errores = {};
  sim.erroresPorOp = {};
  sim.operaciones = [];
  sim.errorStorage = null;
  sim.tablas = {
    clients: [
      {
        id: CLIENTE,
        organization_id: ORG,
        name: "Ana",
        payment_type: "installments",
        installments: [
          { label: "1/2", amount: 100, status: "pending" },
          { label: "2/2", amount: 100, status: "pending" },
        ],
      },
      { id: CLIENTE_AJENO, organization_id: "otra-org", name: "Ajeno", payment_type: "single" },
    ],
    client_payments: [
      pago(PAGO, ORG, CLIENTE),
      pago("55555555-5555-4555-8555-555555555555", "otra-org", CLIENTE_AJENO),
    ],
  };
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

const registrar = { clientId: CLIENTE, amount: 100, paymentDate: "2026-10-08" };

const casos: Array<{
  nombre: string;
  etiqueta: string;
  tabla: string;
  llamar: () => Promise<{ success: boolean }>;
}> = [
  { nombre: "prepareClientPaymentReceiptUploadAction", etiqueta: "[prepareClientPaymentReceiptUpload]", tabla: "clients", llamar: () => prepareClientPaymentReceiptUploadAction({ clientId: CLIENTE, fileName: "c.pdf", fileSize: 10, mimeType: "application/pdf" }) },
  { nombre: "recordClientPaymentAction", etiqueta: "[recordClientPayment]", tabla: "clients", llamar: () => recordClientPaymentAction(registrar) },
  { nombre: "listOrganizationPaymentsAction", etiqueta: "[listOrganizationPayments]", tabla: "client_payments", llamar: () => listOrganizationPaymentsAction() },
  { nombre: "listClientPaymentsAction", etiqueta: "[listClientPayments]", tabla: "client_payments", llamar: () => listClientPaymentsAction(CLIENTE) },
  { nombre: "getClientPaymentReceiptUrlAction", etiqueta: "[getClientPaymentReceiptUrl]", tabla: "client_payments", llamar: () => getClientPaymentReceiptUrlAction(PAGO) },
  { nombre: "addInstallmentPaymentAction", etiqueta: "[addInstallmentPayment]", tabla: "clients", llamar: () => addInstallmentPaymentAction(registrar) },
];

describe.each(casos)("$nombre", ({ etiqueta, tabla, llamar }) => {
  it("⭐ sin sesión devuelve el motivo como valor y no lo reporta", async () => {
    sim.sesion = false;
    await expect(llamar()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
  });

  it("⭐ una excepción de la red vuelve con el texto fijo, a la consola y a Sentry", async () => {
    sim.lanza = new TypeError("fetch failed");
    await expect(llamar()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    expect(consola).toHaveBeenCalledWith(etiqueta, sim.lanza);
    expect(sim.reportes).toEqual([{ error: sim.lanza, contexto: { accion: etiqueta } }]);
  });

  it("⭐ un error de la base que supabase-js devuelve como valor no llega crudo ni como lista vacía", async () => {
    sim.errores[tabla] = { message: "TypeError: fetch failed" };
    const r = await llamar();
    expect(r).toEqual({ success: false, error: ERROR_INESPERADO });
    const detalle = expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" });
    expect(consola).toHaveBeenCalledWith(etiqueta, detalle);
    expect(sim.reportes).toEqual([{ error: detalle, contexto: { accion: etiqueta } }]);
  });
});

describe("lecturas de pagos", () => {
  it("la de la organización trae sólo sus pagos", async () => {
    const r = await listOrganizationPaymentsAction();
    expect(r.success && r.data.map((p) => p.id)).toEqual([PAGO]);
  });

  it("si falta la tabla no hay pagos, como antes", async () => {
    sim.errores.client_payments = { message: 'relation "client_payments" does not exist' };
    await expect(listOrganizationPaymentsAction()).resolves.toEqual({ success: true, data: [] });
    expect(sim.reportes).toEqual([]);
  });

  it("la de un cliente de otra organización no trae nada", async () => {
    await expect(listClientPaymentsAction(CLIENTE_AJENO)).resolves.toEqual({ success: true, data: [] });
  });

  it("⭐ un id de cliente inválido devuelve el motivo", async () => {
    await expect(listClientPaymentsAction("no-es-un-id")).resolves.toEqual({
      success: false,
      error: "Identificador inválido",
    });
  });
});

describe("registrar un pago", () => {
  it("lo guarda en la organización de la sesión", async () => {
    const r = await recordClientPaymentAction(registrar);
    expect(r.success).toBe(true);
    const alta = sim.operaciones.find((o) => o.op === "insert");
    expect((alta?.valores as Fila).organization_id).toBe(ORG);
  });

  it("⭐ un cliente de otra organización devuelve el motivo", async () => {
    await expect(recordClientPaymentAction({ ...registrar, clientId: CLIENTE_AJENO })).resolves.toEqual({
      success: false,
      error: "Cliente no encontrado",
    });
  });

  it("⭐ un comprobante con una ruta de otra organización devuelve el motivo", async () => {
    await expect(
      recordClientPaymentAction({ ...registrar, storagePath: "otra-org/x.pdf", mimeType: "application/pdf" })
    ).resolves.toEqual({ success: false, error: "La ruta del comprobante no es válida." });
    expect(sim.operaciones.some((o) => o.op === "insert")).toBe(false);
  });

  it("⭐ un error al insertar vuelve con el texto fijo, no con el mensaje de la base", async () => {
    sim.erroresPorOp["client_payments:insert"] = { message: "duplicate key value violates unique constraint" };
    await expect(recordClientPaymentAction(registrar)).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(sim.reportes).toHaveLength(1);
  });

  it("si la cuota no se puede marcar, el pago queda y la falla se reporta", async () => {
    sim.erroresPorOp["clients:update"] = { message: "TypeError: fetch failed" };
    const r = await recordClientPaymentAction({ ...registrar, installmentNumber: 1 });
    expect(r.success).toBe(true);
    expect(sim.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase" }),
        contexto: { accion: "[recordClientPayment] cuota" },
      },
    ]);
  });

  it("⭐ datos inválidos devuelven el motivo de la validación", async () => {
    const r = await recordClientPaymentAction({ ...registrar, paymentDate: "ayer" });
    expect(r.success).toBe(false);
  });
});

describe("registrar una cuota", () => {
  it("registra la próxima cuota pendiente sin pasar por otra server action", async () => {
    sim.tablas.client_payments = [];
    const r = await addInstallmentPaymentAction(registrar);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.payment.installmentNumber).toBe(1);
    expect(r.data.client.id).toBe(CLIENTE);
  });

  it("⭐ un cliente sin plan de cuotas devuelve el motivo", async () => {
    (sim.tablas.clients[0] as Fila).payment_type = "single";
    await expect(addInstallmentPaymentAction(registrar)).resolves.toEqual({
      success: false,
      error: "Este cliente no tiene plan de cuotas",
    });
  });

  it("⭐ sin cuotas pendientes devuelve el motivo", async () => {
    sim.tablas.client_payments = [
      pago("a", ORG, CLIENTE, { installment_number: 1 }),
      pago("b", ORG, CLIENTE, { installment_number: 2 }),
    ];
    await expect(addInstallmentPaymentAction(registrar)).resolves.toEqual({
      success: false,
      error: "No hay cuotas pendientes por registrar",
    });
  });

  it("⭐ si los pagos del cliente no se pueden leer, texto fijo (antes se tomaban como ninguno)", async () => {
    sim.errores.client_payments = { message: "TypeError: fetch failed" };
    await expect(addInstallmentPaymentAction(registrar)).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
  });
});

describe("comprobantes", () => {
  it("firma la subida en la carpeta de la organización", async () => {
    const r = await prepareClientPaymentReceiptUploadAction({
      clientId: CLIENTE,
      fileName: "c.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
    });
    expect(r.success && r.data.storagePath.startsWith(`${ORG}/${CLIENTE}/`)).toBe(true);
  });

  it("⭐ un archivo no permitido devuelve el motivo", async () => {
    const r = await prepareClientPaymentReceiptUploadAction({
      clientId: CLIENTE,
      fileName: "virus.exe",
      fileSize: 10,
      mimeType: "application/x-msdownload",
    });
    expect(r.success).toBe(false);
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ una falla del Storage vuelve con el texto fijo y se reporta", async () => {
    sim.errorStorage = { message: "Bucket not found" };
    await expect(
      prepareClientPaymentReceiptUploadAction({ fileName: "c.pdf", fileSize: 10, mimeType: "application/pdf" })
    ).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    expect(sim.reportes).toHaveLength(1);
  });

  it("abre el comprobante de un pago de la organización", async () => {
    const r = await getClientPaymentReceiptUrlAction(PAGO);
    expect(r.success && r.data.url).toContain("firmada");
  });

  it("⭐ un pago sin comprobante devuelve el motivo", async () => {
    (sim.tablas.client_payments[0] as Fila).storage_path = null;
    await expect(getClientPaymentReceiptUrlAction(PAGO)).resolves.toEqual({
      success: false,
      error: "Comprobante no encontrado",
    });
  });
});
