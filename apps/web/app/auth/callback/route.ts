import { NextResponse } from "next/server";
import { ensureUserBootstrap } from "@/lib/auth/bootstrap";
import { DESTINO_DEL_STAFF, isStaffEmail } from "@/lib/auth/require-staff";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import { destinoSeguro } from "@/lib/auth/redirect-seguro";
import { LINK_RECUPERACION_VENCIDO_QUERY } from "@/lib/auth/recuperar-contrasena";
import { destinoDeInvitacion } from "@/lib/team/invitacion";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // SCRUM-2: sólo un path interno; si no, al dashboard (open redirect).
  const next = destinoSeguro(searchParams.get("next"), origin, paths.platform.dashboard);
  const supabase = await createClient();

  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (!error) {
      return NextResponse.redirect(`${origin}${paths.auth.updatePassword}`);
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}${paths.auth.updatePassword}`);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && !next.includes("/invite")) {
        await ensureUserBootstrap(user);
      }

      // Mismo orden que `signInAction` (`postAuthRedirect`): la invitación de
      // equipo gana sobre el destino del staff (SCRUM-552).
      const invitacion = destinoDeInvitacion(searchParams.get("next"));
      const destination =
        invitacion ??
        (user?.email && (await isStaffEmail(user.email))
          ? DESTINO_DEL_STAFF
          : next);

      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  // Un link de recuperación vencido o ya usado tiene su propio aviso (SCRUM-16).
  const motivo = type === "recovery" ? LINK_RECUPERACION_VENCIDO_QUERY : "auth_callback";
  return NextResponse.redirect(`${origin}${paths.auth.login}?error=${motivo}`);
}
