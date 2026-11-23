"use server";

import { requireStaff } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DriveFileListItem, DriveListResult } from "@/app/marketing/content/drive-actions";

const GOOGLE_FORMS_REDIRECT = () =>
  process.env.SUPER_ADMIN_GOOGLE_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/super-admin-google/oauth/callback`;

async function getSuperAdminAccessToken(): Promise<string> {
  const user = await requireStaff();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("super_admin_google_tokens")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    throw new Error("GOOGLE_NOT_CONNECTED");
  }

  // Refresh if expired or expiring in next 60s
  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;
  if (expiresAt > 0 && expiresAt - Date.now() < 60_000) {
    if (!data.refresh_token) throw new Error("GOOGLE_NOT_CONNECTED");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("GOOGLE_NOT_CONNECTED");

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: data.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: GOOGLE_FORMS_REDIRECT(),
      }),
    });

    if (!res.ok) throw new Error("GOOGLE_INSUFFICIENT_PERMISSIONS");

    const refreshed = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!refreshed.access_token) throw new Error("GOOGLE_INSUFFICIENT_PERMISSIONS");

    const newExpiry = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : null;

    await admin.from("super_admin_google_tokens").update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiry,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    return refreshed.access_token;
  }

  return data.access_token;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function listDriveFilesForSuperAdminSafeAction(params?: {
  folderId?: string;
  mimeTypeFilter?: string;
  query?: string;
}): Promise<DriveListResult> {
  try {
    const token = await getSuperAdminAccessToken();

    let q = "trashed = false";

    if (params?.folderId) {
      q += ` and '${escapeDriveQueryValue(params.folderId)}' in parents`;
    } else {
      q += " and 'root' in parents";
    }

    if (params?.mimeTypeFilter) {
      q += ` and mimeType = '${escapeDriveQueryValue(params.mimeTypeFilter)}'`;
    }

    if (params?.query?.trim()) {
      q += ` and name contains '${escapeDriveQueryValue(params.query.trim())}'`;
    }

    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", q);
    url.searchParams.set(
      "fields",
      "files(id,name,mimeType,thumbnailLink,webViewLink,size,modifiedTime,parents)"
    );
    url.searchParams.set("orderBy", "folder,name");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, errorCode: "GOOGLE_INSUFFICIENT_PERMISSIONS", message: "Permisos insuficientes" };
      }
      return { ok: false, errorCode: "OTHER", message: `Error Google Drive (${res.status})` };
    }

    const data = (await res.json()) as { files?: DriveFileListItem[] };
    return { ok: true, files: data.files ?? [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    if (msg === "GOOGLE_NOT_CONNECTED") {
      return { ok: false, errorCode: "GOOGLE_NOT_CONNECTED", message: msg };
    }
    if (msg === "GOOGLE_INSUFFICIENT_PERMISSIONS") {
      return { ok: false, errorCode: "GOOGLE_INSUFFICIENT_PERMISSIONS", message: msg };
    }
    return { ok: false, errorCode: "OTHER", message: msg };
  }
}
