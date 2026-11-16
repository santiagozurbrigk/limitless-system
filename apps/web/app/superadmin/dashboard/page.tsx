import { redirect } from "next/navigation";
import { paths } from "@/routes";

/** Panel principal Super Admin tras login mock (Fase 0). */
export default function SuperAdminDashboardPage() {
  redirect(paths.superAdmin.organizations);
}
