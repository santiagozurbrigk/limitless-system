import { CreateFounderForm } from "@/components/super-admin";

/** Alta de una cuenta desde la consola (SCRUM-551): nace en `webinar` (SCRUM-523). */
export default function OrganizacionNuevaPage() {
  return <CreateFounderForm base="consola" />;
}
