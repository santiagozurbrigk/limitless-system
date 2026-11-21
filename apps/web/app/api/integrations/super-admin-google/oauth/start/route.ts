import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireStaff } from "@/lib/auth/require-staff";
import { createGooglePkce, getGoogleEnv, googleAuthUrl } from "@/lib/google/oauth";
import { GOOGLE_FORMS_DRIVE_SCOPES } from "@/lib/google/scopes";

export const runtime = "nodejs";

const REDIRECT_URI = () =>
  process.env.SUPER_ADMIN_GOOGLE_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/super-admin-google/oauth/callback`;

export async function GET(_request: NextRequest) {
  const env = getGoogleEnv();
  if (!env) {
    return NextResponse.json({ error: "Faltan env Google" }, { status: 500 });
  }

  const user = await requireStaff();
  const state = crypto.randomBytes(18).toString("hex");
  const { codeVerifier, codeChallenge } = createGooglePkce();

  const res = NextResponse.redirect(
    googleAuthUrl({
      clientId: env.clientId,
      redirectUri: REDIRECT_URI(),
      scopes: [...GOOGLE_FORMS_DRIVE_SCOPES],
      state,
      codeChallenge,
    })
  );

  res.cookies.set(
    "super_admin_google_oauth",
    JSON.stringify({ userId: user.id, state, codeVerifier }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    }
  );

  return res;
}
