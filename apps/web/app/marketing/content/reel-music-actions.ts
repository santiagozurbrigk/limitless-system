"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { paths } from "@/routes";
import { soloRutasDeLaOrg } from "@/lib/storage/org-path";

const STORAGE_BUCKET = "trial-reels";
const MAX_MUSIC_BYTES = 30 * 1024 * 1024; // 30 MB — más que suficiente para un track de fondo

async function requireOrgId(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id) throw new Error("Sesión no válida");
  return profile.organization_id;
}

export type ReelMusicUploadResult =
  | { ok: true; storagePath: string }
  | { ok: false; message: string };

/**
 * Sube un track de música de fondo para la variante "music" de Trial Reels.
 * Almacena en trial-reels/{org-id}/music/background.mp3 y guarda la ruta en organizations.
 */
export async function uploadReelMusicAction(
  formData: FormData
): Promise<ReelMusicUploadResult> {
  try {
    const organizationId = await requireOrgId();
    const file = formData.get("music") as File | null;

    if (!file || file.size === 0) {
      return { ok: false, message: "No se recibió ningún archivo" };
    }

    // Validar tipo y tamaño
    const isAudio = file.type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".m4a") || file.name.endsWith(".wav");
    if (!isAudio) {
      return { ok: false, message: "Solo se aceptan archivos de audio (MP3, M4A, WAV)" };
    }
    if (file.size > MAX_MUSIC_BYTES) {
      return { ok: false, message: "El archivo supera el límite de 30 MB" };
    }

    const storagePath = `${organizationId}/music/background.mp3`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const admin = createAdminClient();

    // Subir al bucket trial-reels (upsert — sobreescribir si ya existía)
    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Error al subir archivo: ${uploadError.message}`);
    }

    // Guardar la ruta en organizations
    const { error: updateError } = await admin
      .from("organizations")
      .update({ reel_music_path: storagePath })
      .eq("id", organizationId);

    if (updateError) {
      throw new Error(`Error al guardar configuración: ${updateError.message}`);
    }

    revalidatePath(paths.platform.integrations);

    return { ok: true, storagePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[ReelMusic] uploadReelMusicAction error", { message });
    return { ok: false, message };
  }
}

export type ReelMusicDeleteResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Elimina el track de música personalizado de la org.
 * Borra el archivo de Storage y limpia organizations.reel_music_path.
 */
export async function deleteReelMusicAction(): Promise<ReelMusicDeleteResult> {
  try {
    const organizationId = await requireOrgId();
    const admin = createAdminClient();

    // Leer ruta actual
    const { data: orgRow } = await admin
      .from("organizations")
      .select("reel_music_path")
      .eq("id", organizationId)
      .maybeSingle();

    const currentPath = orgRow?.reel_music_path as string | null | undefined;

    const rutas = soloRutasDeLaOrg([currentPath], organizationId, "reel-music");
    if (rutas.length > 0) {
      await admin.storage.from(STORAGE_BUCKET).remove(rutas);
    }

    // Limpiar DB
    const { error } = await admin
      .from("organizations")
      .update({ reel_music_path: null })
      .eq("id", organizationId);

    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.integrations);

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[ReelMusic] deleteReelMusicAction error", { message });
    return { ok: false, message };
  }
}

/**
 * Retorna el reel_music_path actual de la org.
 */
export async function getReelMusicPathAction(): Promise<string | null> {
  const organizationId = await requireOrgId();
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("reel_music_path")
    .eq("id", organizationId)
    .maybeSingle();
  return (data?.reel_music_path as string | null | undefined) ?? null;
}
