import { redirect } from "next/navigation";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function TeamMembersRedirectPage() {
  const sinAcceso = await exigirModuloDeLaPagina("team");
  if (sinAcceso) return sinAcceso;

  redirect(`${paths.platform.team.root}#miembros`);
}
