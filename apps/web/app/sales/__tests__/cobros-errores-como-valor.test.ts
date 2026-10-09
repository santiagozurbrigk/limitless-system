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
const CLIENTE_2 = "66666666-6666-4666-8666-666666666666";
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
  rpcs: [] as Array<{ nombre: string; args: Fila }>,
  borrados: [] as string[],
  errorAlBorrar: null as { message: string } | null,
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

/**
 * `registrar_pago_de_cliente` como la función SQL (su transacción y su RLS se
 * prueban en supabase/ci/tests/95_registrar_pago_de_cliente.sql): cliente de
 * la org de la sesión o P0002, clave de idempotencia, alta y cuota marcada.
 */
function rpcFalsa(nombre: string, args: Fila) {
  expect(nombre).toBe("registrar_pago_de_cliente");
  sim.rpcs.push({ nombre, args });
  const error = sim.errores.clients ?? sim.errores.client_payments ?? sim.erroresPorOp.rpc ?? null;
  if (error) return { data: null, error };
  const cliente = (sim.tablas.clients ?? []).find((c) => c.id === args.p_client_id && c.organization_id === ORG);
  if (!cliente) return { data: null, error: { code: "P0002", message: "registrar_pago_de_cliente: cliente no encontrado" } };
  const pagos = sim.tablas.client_payments ?? [];
  if (args.p_clave_idempotencia) {
    const previo = pagos.find((p) => p.clave_idempotencia === args.p_clave_idempotencia && p.organization_id === ORG);
    if (previo) {
      const otros =
        previo.client_id !== args.p_client_id ||
        Math.round(Number(previo.amount) * 100) !== Math.round(Number(args.p_amount) * 100) ||
        previo.payment_date !== args.p_payment_date ||
        (args.p_installment_number != null && previo.installment_number !== args.p_installment_number);
      if (otros) return { data: null, error: { code: "IDM01", message: "registrar_pago_de_cliente: la clave ya se usó con otros datos" } };
      // Como la función: el comprobante que el primer guardado no tenía se suma.
      if (!previo.storage_path && args.p_storage_path) {
        previo.storage_path = args.p_storage_path;
        previo.mime_type = args.p_mime_type;
      }
      return { data: previo, error: null };
    }
  }
  const nuevo: Fila = {
    id: `pago-${pagos.length + 1}`,
    client_id: args.p_client_id,
    organization_id: ORG,
    amount: args.p_amount,
    payment_date: args.p_payment_date,
    storage_path: args.p_storage_path,
    mime_type: args.p_mime_type,
    installment_number: args.p_installment_number,
    clave_idempotencia: args.p_clave_idempotencia,
    created_at: "2026-10-08T00:00:00Z",
  };
  pagos.push(nuevo);
  sim.tablas.client_payments = pagos;
  return { data: nuevo, error: null };
}

function clienteFalso() {
  return {
    rpc: async (nombre: string, args: Fila) => {
      if (sim.lanza) throw sim.lanza;
      return rpcFalsa(nombre, args);
    },
    auth: { getUser: async () => ({ data: { user: { id: "yo" } } }) },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (ruta: string) =>
          sim.errorStorage
            ? { data: null, error: sim.errorStorage }
            : { data: { signedUrl: `https://storage/${ruta}` }, error: null },
        remove: async (rutas: string[]) => {
          sim.borrados.push(...rutas);
          return { data: null, error: sim.errorAlBorrar };
        },
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
        limit: () => builder,
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
  sim.rpcs = [];
  sim.borrados = [];
  sim.errorAlBorrar = null;
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
      {
        id: CLIENTE_2,
        organization_id: ORG,
        name: "Beto",
        payment_type: "installments",
        installments: [{ label: "1/1", amount: 100, status: "pending" }],
      },
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
  it("lo registra con la función atómica, con los datos y la clave", async () => {
    const r = await recordClientPaymentAction({ ...registrar, installmentNumber: 1, claveIdempotencia: "clave-0001" });
    expect(r.success).toBe(true);
    expect(sim.rpcs).toEqual([
      {
        nombre: "registrar_pago_de_cliente",
        args: {
          p_client_id: CLIENTE,
          p_amount: 100,
          p_payment_date: "2026-10-08",
          p_storage_path: null,
          p_mime_type: null,
          p_installment_number: 1,
          p_payment_received_from: null,
          p_payment_destination_platform_id: null,
          p_clave_idempotencia: "clave-0001",
        },
      },
    ]);
  });

  it("⭐ un reintento con la misma clave devuelve el mismo pago, sin duplicarlo", async () => {
    const primero = await recordClientPaymentAction({ ...registrar, claveIdempotencia: "clave-0002" });
    const segundo = await recordClientPaymentAction({ ...registrar, claveIdempotencia: "clave-0002" });
    expect(primero.success && segundo.success && primero.data.id === segundo.data.id).toBe(true);
    expect(sim.tablas.client_payments.filter((p) => p.clave_idempotencia === "clave-0002")).toHaveLength(1);
  });

  it("⭐ la misma clave con otros datos (IDM01 de la función) devuelve el motivo, no el pago viejo", async () => {
    await recordClientPaymentAction({ ...registrar, claveIdempotencia: "clave-0003" });
    await expect(
      recordClientPaymentAction({ ...registrar, amount: 999, claveIdempotencia: "clave-0003" })
    ).resolves.toEqual({
      success: false,
      error: "Ese pago ya se registró con otros datos. Cerrá el formulario y volvé a abrirlo para cargar otro.",
    });
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ un cliente de otra organización (P0002 de la función) devuelve el motivo", async () => {
    await expect(recordClientPaymentAction({ ...registrar, clientId: CLIENTE_AJENO })).resolves.toEqual({
      success: false,
      error: "Cliente no encontrado",
    });
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ un comprobante con una ruta de otra organización devuelve el motivo, sin llamar a la función", async () => {
    await expect(
      recordClientPaymentAction({ ...registrar, storagePath: "otra-org/x.pdf", mimeType: "application/pdf" })
    ).resolves.toEqual({ success: false, error: "La ruta del comprobante no es válida." });
    expect(sim.rpcs).toEqual([]);
  });

  it("⭐ si la función falla (por ejemplo, al marcar la cuota) vuelve el texto fijo y se reporta", async () => {
    sim.erroresPorOp.rpc = { message: "registrar_pago_de_cliente: no se pudo marcar la cuota", code: "42501" };
    await expect(recordClientPaymentAction({ ...registrar, installmentNumber: 1 })).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(sim.reportes).toHaveLength(1);
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

  it("⭐ el reintento de una cuota con la misma clave devuelve ese pago, no otra cuota", async () => {
    sim.tablas.client_payments = [];
    const primero = await addInstallmentPaymentAction({ ...registrar, claveIdempotencia: "clave-cuota" });
    const segundo = await addInstallmentPaymentAction({ ...registrar, claveIdempotencia: "clave-cuota" });
    expect(primero.success && segundo.success).toBe(true);
    if (!primero.success || !segundo.success) return;
    expect(segundo.data.payment.id).toBe(primero.data.payment.id);
    expect(segundo.data.payment.installmentNumber).toBe(1);
    // El reintento vuelve a la función con la cuota del pago registrado (para
    // sumar el comprobante si ahora lo trae), y no queda otro pago.
    expect(sim.rpcs.map((r) => r.args.p_installment_number)).toEqual([1, 1]);
    expect(sim.tablas.client_payments.filter((p) => p.clave_idempotencia === "clave-cuota")).toHaveLength(1);
  });

  it("⭐ la misma clave de una cuota con otro monto devuelve el motivo, no el pago viejo", async () => {
    sim.tablas.client_payments = [];
    await addInstallmentPaymentAction({ ...registrar, claveIdempotencia: "clave-cuota-2" });
    await expect(
      addInstallmentPaymentAction({ ...registrar, amount: 150, claveIdempotencia: "clave-cuota-2" })
    ).resolves.toEqual({
      success: false,
      error: "Ese pago ya se registró con otros datos. Cerrá el formulario y volvé a abrirlo para cargar otro.",
    });
    expect(sim.rpcs).toHaveLength(1);
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

describe("filtro por organización (AR pasada 2, MENOR-4)", () => {
  const PAGO_AJENO = "55555555-5555-4555-8555-555555555555";

  it("⭐ no firma la subida a la carpeta de un cliente de otra organización", async () => {
    await expect(
      prepareClientPaymentReceiptUploadAction({
        clientId: CLIENTE_AJENO,
        fileName: "c.pdf",
        fileSize: 10,
        mimeType: "application/pdf",
      })
    ).resolves.toEqual({ success: false, error: "Cliente no encontrado" });
    const lectura = sim.operaciones.find((o) => o.tabla === "clients");
    expect(lectura?.filtros).toEqual([
      ["id", CLIENTE_AJENO],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ no abre el comprobante de un pago de otra organización", async () => {
    await expect(getClientPaymentReceiptUrlAction(PAGO_AJENO)).resolves.toEqual({
      success: false,
      error: "Comprobante no encontrado",
    });
    const lectura = sim.operaciones.find((o) => o.tabla === "client_payments");
    expect(lectura?.filtros).toEqual([
      ["organization_id", ORG],
      ["id", PAGO_AJENO],
    ]);
  });

  it("⭐ una fila propia con la ruta de otra organización no se firma: texto fijo y se reporta", async () => {
    (sim.tablas.client_payments[0] as Fila).storage_path = "otra-org/cliente/comprobante.pdf";
    await expect(getClientPaymentReceiptUrlAction(PAGO)).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(sim.reportes).toEqual([
      {
        error: expect.objectContaining({ message: "Ruta de almacenamiento inválida" }),
        contexto: { accion: "[getClientPaymentReceiptUrl]" },
      },
    ]);
  });
});

describe("montos y comprobantes en un reintento (AR pasada 4)", () => {
  // Rutas con la forma de una subida de comprobante (<org>/<cliente>/<uuid>-<nombre>).
  const OTRO_ARCHIVO = `${ORG}/${CLIENTE}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-dos.pdf`;
  const ARCHIVO = `${ORG}/${CLIENTE}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-uno.pdf`;

  it("⭐ un monto con más de dos decimales se rechaza con motivo, sin llamar a la función", async () => {
    await expect(recordClientPaymentAction({ ...registrar, amount: 333.333 })).resolves.toEqual({
      success: false,
      error: "El monto puede tener hasta dos decimales.",
    });
    expect(sim.rpcs).toEqual([]);
  });

  it("⭐ el ruido del punto flotante (0.1 + 0.2) se redondea a centavos y el reintento coincide", async () => {
    const primero = await recordClientPaymentAction({ ...registrar, amount: 0.1 + 0.2, claveIdempotencia: "clave-flotante" });
    const segundo = await recordClientPaymentAction({ ...registrar, amount: 0.1 + 0.2, claveIdempotencia: "clave-flotante" });
    expect(sim.rpcs.map((r) => r.args.p_amount)).toEqual([0.3, 0.3]);
    expect(primero.success && segundo.success && primero.data.id === segundo.data.id).toBe(true);
  });

  it("⭐ el reintento con el comprobante que faltaba lo suma al pago y no borra nada", async () => {
    await recordClientPaymentAction({ ...registrar, claveIdempotencia: "clave-archivo" });
    const r = await recordClientPaymentAction({
      ...registrar,
      storagePath: ARCHIVO,
      mimeType: "application/pdf",
      claveIdempotencia: "clave-archivo",
    });
    expect(r.success && r.data.storagePath).toBe(ARCHIVO);
    expect(sim.borrados).toEqual([]);
  });

  it("⭐ si el pago ya tenía comprobante, el archivo nuevo se borra para no dejarlo huérfano", async () => {
    await recordClientPaymentAction({ ...registrar, storagePath: ARCHIVO, mimeType: "application/pdf", claveIdempotencia: "clave-dos" });
    const r = await recordClientPaymentAction({
      ...registrar,
      storagePath: OTRO_ARCHIVO,
      mimeType: "application/pdf",
      claveIdempotencia: "clave-dos",
    });
    expect(r.success && r.data.storagePath).toBe(ARCHIVO);
    expect(sim.borrados).toEqual([OTRO_ARCHIVO]);
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ si no se puede borrar el sobrante, el pago sale bien y la falla se registra", async () => {
    sim.errorAlBorrar = { message: "Storage caído" };
    await recordClientPaymentAction({ ...registrar, storagePath: ARCHIVO, mimeType: "application/pdf", claveIdempotencia: "clave-tres" });
    const r = await recordClientPaymentAction({
      ...registrar,
      storagePath: OTRO_ARCHIVO,
      mimeType: "application/pdf",
      claveIdempotencia: "clave-tres",
    });
    expect(r.success).toBe(true);
    expect(sim.reportes).toEqual([
      // Un texto fijo: ni el mensaje del Storage ni la ruta.
      {
        error: expect.objectContaining({ message: "No se pudo borrar el comprobante sobrante" }),
        contexto: { accion: "[registrarPago] comprobante sobrante" },
      },
    ]);
  });

  describe("cuotas", () => {
    beforeEach(() => {
      sim.tablas.client_payments = [];
    });
    const otrosDatos = "Ese pago ya se registró con otros datos. Cerrá el formulario y volvé a abrirlo para cargar otro.";

    it("⭐ la misma clave de una cuota con otra fecha devuelve el motivo", async () => {
      await addInstallmentPaymentAction({ ...registrar, claveIdempotencia: "clave-c-fecha" });
      await expect(
        addInstallmentPaymentAction({ ...registrar, paymentDate: "2026-10-09", claveIdempotencia: "clave-c-fecha" })
      ).resolves.toEqual({ success: false, error: otrosDatos });
      // Lo decide la acción, antes de volver a la función.
      expect(sim.rpcs).toHaveLength(1);
    });

    it("⭐ la misma clave de una cuota con otro cliente devuelve el motivo", async () => {
      await addInstallmentPaymentAction({ ...registrar, claveIdempotencia: "clave-c-cliente" });
      await expect(
        addInstallmentPaymentAction({ ...registrar, clientId: CLIENTE_2, claveIdempotencia: "clave-c-cliente" })
      ).resolves.toEqual({ success: false, error: otrosDatos });
      expect(sim.tablas.client_payments.filter((p) => p.client_id === CLIENTE_2)).toEqual([]);
      expect(sim.rpcs).toHaveLength(1);
    });

    it("⭐ el reintento de una cuota con el comprobante que faltaba lo suma al mismo pago", async () => {
      const primero = await addInstallmentPaymentAction({ ...registrar, claveIdempotencia: "clave-c-archivo" });
      const segundo = await addInstallmentPaymentAction({
        ...registrar,
        storagePath: ARCHIVO,
        mimeType: "application/pdf",
        claveIdempotencia: "clave-c-archivo",
      });
      expect(primero.success && segundo.success).toBe(true);
      if (!primero.success || !segundo.success) return;
      expect(segundo.data.payment.id).toBe(primero.data.payment.id);
      expect(segundo.data.payment.storagePath).toBe(ARCHIVO);
      expect(sim.rpcs.map((r) => r.args.p_installment_number)).toEqual([1, 1]);
    });
  });
});

describe("borrar el comprobante sobrante (AR pasada 5, MAYOR-1)", () => {
  const MIO = `${ORG}/${CLIENTE}/cccccccc-cccc-4ccc-8ccc-cccccccccccc-mio.pdf`;
  const DE_OTRO_PAGO = `${ORG}/${CLIENTE_2}/dddddddd-dddd-4ddd-8ddd-dddddddddddd-comprobante-de-otro-pago.pdf`;

  it("⭐ no borra el comprobante de otro pago de la org aunque lo manden en un reintento", async () => {
    sim.tablas.client_payments.push(
      pago("77777777-7777-4777-8777-777777777777", ORG, CLIENTE_2, { storage_path: DE_OTRO_PAGO })
    );
    await recordClientPaymentAction({ ...registrar, storagePath: MIO, mimeType: "application/pdf", claveIdempotencia: "clave-propia" });
    const r = await recordClientPaymentAction({
      ...registrar,
      storagePath: DE_OTRO_PAGO,
      mimeType: "application/pdf",
      claveIdempotencia: "clave-propia",
    });
    expect(r.success && r.data.storagePath).toBe(MIO);
    expect(sim.borrados).toEqual([]);
    expect(sim.reportes).toEqual([
      {
        error: expect.objectContaining({ message: "El archivo sobrante es el comprobante de otro pago: no se borra" }),
        contexto: { accion: "[registrarPago] comprobante sobrante" },
      },
    ]);
    // Al registro no va la ruta.
    expect(JSON.stringify(sim.reportes)).not.toContain(DE_OTRO_PAGO);
  });

  it("⭐ una ruta que no es una subida de comprobante no se borra", async () => {
    const RARA = `${ORG}/${CLIENTE}/no-es-una-subida.pdf`;
    await recordClientPaymentAction({ ...registrar, storagePath: MIO, mimeType: "application/pdf", claveIdempotencia: "clave-rara" });
    await recordClientPaymentAction({ ...registrar, storagePath: RARA, mimeType: "application/pdf", claveIdempotencia: "clave-rara" });
    expect(sim.borrados).toEqual([]);
    expect(sim.reportes).toHaveLength(1);
  });

  it("si no se puede saber si la ruta está en uso, no borra y lo registra", async () => {
    await recordClientPaymentAction({ ...registrar, storagePath: MIO, mimeType: "application/pdf", claveIdempotencia: "clave-duda" });
    // Falla la consulta de si la ruta está en uso (la función simulada no la usa).
    sim.erroresPorOp["client_payments:select"] = { message: "TypeError: fetch failed" };
    const OTRO = `${ORG}/${CLIENTE}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee-otro.pdf`;
    const r = await recordClientPaymentAction({ ...registrar, storagePath: OTRO, mimeType: "application/pdf", claveIdempotencia: "clave-duda" });
    expect(r.success).toBe(true);
    expect(sim.borrados).toEqual([]);
    expect(sim.reportes).toHaveLength(1);
  });
});
