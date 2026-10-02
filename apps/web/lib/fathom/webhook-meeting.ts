import { mapFathomMeeting, type FathomMeetingRecord } from "@/lib/fathom/api";

/**
 * La reunión que trae un webhook `new-meeting-content-ready` de Fathom.
 *
 * ⚠️ La doc de Fathom no detalla el cuerpo (`docs/external-apis/fathom/
 * RESUMEN-LIMITLESS.md`). Se asume la forma de `GET /meetings`, en la raíz o
 * anidada bajo `meeting`/`recording`/`data`, y se mapea con el mismo parser que
 * la sincronización. Sin id de grabación devuelve `null`: la ruta deja la
 * entrega guardada con el motivo, no inventa una llamada.
 */
export function leerReunionDelWebhook(payload: unknown): FathomMeetingRecord | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const cuerpo = payload as Record<string, unknown>;

  // Con `recording_id` en la raíz, la raíz es la reunión (forma de `/meetings`).
  if (cuerpo.recording_id != null) return mapFathomMeeting(cuerpo);

  // Si viene envuelta, el `id` de la raíz sería el del evento, no el de la
  // grabación: primero se busca adentro.
  for (const key of ["meeting", "recording", "data"]) {
    const reunion = mapFathomMeeting(cuerpo[key]);
    if (reunion) return reunion;
  }
  return mapFathomMeeting(cuerpo);
}
