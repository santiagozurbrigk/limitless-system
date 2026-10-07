import { AuthShell } from "@/components/auth/auth-shell";

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
