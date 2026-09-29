import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { runMutation } from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { paths } from "@/routes";
import { disconnectUnipileAccount } from "@/lib/unipile/hosted-auth";
import { getUnipileIntegrationForOrg } from "@/lib/unipile/integration";
import { unipileDisconnectBodySchema } from "@/lib/unipile/schemas";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = unipileDisconnectBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "provider inválido (instagram | whatsapp)" },
      { status: 400 }
    );
  }

  const result = await runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const integration = await getUnipileIntegrationForOrg(
      organizationId,
      parsed.data.provider
    );

    if (!integration) {
      throw new Error("No hay cuenta Unipile conectada para este proveedor");
    }

    try {
      await disconnectUnipileAccount(integration.unipile_account_id);
    } catch (err) {
      console.warn("[Unipile] Error al desconectar en API:", err);
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("unipile_integrations")
      .update({
        status: "disconnected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
