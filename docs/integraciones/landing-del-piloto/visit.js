/**
 * `api/visit.js` de la landing del piloto (SCRUM-530): avisa a Limitless que
 * alguien abrió la landing, con la clave del lado del servidor.
 *
 * El navegador llama a este endpoint una vez por carga, con el `visitor_id`
 * anónimo que la landing guarda en una cookie propia (por ejemplo,
 * `crypto.randomUUID()` la primera vez, con vencimiento de 1 año). Limitless
 * cuenta visitantes distintos por lanzamiento y día, así que repetir la misma
 * visita no la duplica.
 *
 * Siempre responde 204: una falla de Limitless no se le muestra a nadie.
 */
import { enviarALimitless, eventoDeVisita } from "./limitless.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  const datos = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const visitorId = typeof datos.visitor_id === "string" ? datos.visitor_id.trim().slice(0, 200) : "";
  if (visitorId) {
    const resultado = await enviarALimitless(eventoDeVisita({ visitorId }));
    console.log("[visit]", { limitless: resultado.status, intentos: resultado.intentos });
  }
  return res.status(204).end();
}
