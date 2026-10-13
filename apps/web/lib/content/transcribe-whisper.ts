import { ErrorEsperable } from "@/lib/server/error-esperable";

/** Límite de tamaño de archivo de la API de transcripción de OpenAI. */
const LIMITE_DE_AUDIO_EN_BYTES = 25 * 1024 * 1024;

export const AUDIO_DEMASIADO_GRANDE =
  "El audio del video supera los 25 MB que acepta la transcripción. Probá con un video más corto.";

/**
 * Transcribe el audio con Whisper. Un audio de más de 25 MB es un rechazo con
 * motivo (`ErrorEsperable`, SCRUM-502): depende del archivo y reintentar no
 * sirve. Sin `OPENAI_API_KEY` o con una respuesta fallida de OpenAI es una
 * falla.
 */
export async function transcribeAudioBuffer(audioBuffer: Buffer): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no configurada");
  }

  if (audioBuffer.byteLength > LIMITE_DE_AUDIO_EN_BYTES) {
    throw new ErrorEsperable(AUDIO_DEMASIADO_GRANDE);
  }

  const whisperForm = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" });
  whisperForm.append("file", blob, "audio.mp3");
  whisperForm.append("model", "whisper-1");
  whisperForm.append("language", "es");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: whisperForm,
  });

  if (!whisperRes.ok) {
    const body = await whisperRes.text();
    console.error("[transcribe-whisper] Whisper error:", whisperRes.status, body.slice(0, 300));
    throw new Error("Error al transcribir el audio");
  }

  const data = (await whisperRes.json()) as { text?: string };
  return data.text?.trim() ?? "";
}
