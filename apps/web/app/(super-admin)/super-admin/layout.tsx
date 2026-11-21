import { redirect } from "next/navigation";
import { isStaffUser } from "@/lib/auth/require-staff";
import { paths } from "@/routes";

export default async function SuperAdminGuardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const allowed = await isStaffUser();
  if (!allowed) {
    redirect(paths.auth.login);
  }
  return children;
}
