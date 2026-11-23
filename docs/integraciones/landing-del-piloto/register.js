/**
 * `api/register.js` de la landing del piloto (SCRUM-530): manda el registro a
 * GoHighLevel, como hoy, y además a Limitless, en paralelo.
 *
 * Reglas (requerimientos técnicos, sección 5.1):
 *   - `Promise.allSettled([GHL, Limitless])`: si uno falla, el otro sigue. La
 *     respuesta al navegador depende SÓLO de GHL, como hoy: Limitless no puede
 *     romper la landing.
 *   - Timeout de 3 s por destino (el de Limitless está en `limitless.js`).
 *   - Un único reintento a Limitless, al segundo, si responde 500.
 *
 * ADAPTAR: `enviarAGhl` es la llamada que la landing ya tiene hoy. Reemplazar
 * su cuerpo por el código existente, sin cambiar lo que hace.
 */
import { randomUUID } from "node:crypto";
import { enviarALimitless, eventoDeRegistro } from "./limitless.js";

const TIMEOUT_GHL_MS = 3000;

/** La llamada a GHL que ya existe (ADAPTAR). Tiene que lanzar si GHL falla. */
async function enviarAGhl(datos) {
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_GHL_MS);
  try {
    // ADAPTAR: pegar acá el fetch actual a GoHighLevel con `signal: controlador.signal`.
    throw new Error("Falta pegar la llamada actual a GoHighLevel");
  } finally {
    clearTimeout(corte);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }
  const datos = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // Un id por registro, generado acá y reusado sólo en el reintento.
  const evento = eventoDeRegistro({
    clientRegistrationId: randomUUID(),
    nombre: datos.name,
    email: datos.email,
    telefono: datos.phone,
    datos,
    variante: datos.ab_variant,
    calificacion: datos.qualification,
  });

  const [ghl, limitless] = await Promise.allSettled([enviarAGhl(datos), enviarALimitless(evento)]);

  // Log sin datos personales: sólo estados.
  console.log("[register]", {
    ghl: ghl.status,
    limitless: limitless.status === "fulfilled" ? limitless.value.status : "rejected",
    intentosLimitless: limitless.status === "fulfilled" ? limitless.value.intentos : 0,
  });

  if (ghl.status === "rejected") {
    return res.status(502).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
}
