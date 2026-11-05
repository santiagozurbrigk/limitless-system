import { redirect } from "next/navigation";
import { paths } from "@/routes";

/** Panel principal Super Admin tras login mock (Fase 0): desde SCRUM-553, la consola. */
export default function SuperAdminDashboardPage() {
  redirect(paths.platform.consola.organizaciones);
}
