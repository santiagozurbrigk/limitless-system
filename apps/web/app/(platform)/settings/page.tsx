import { SettingsForm } from "@/components/settings";
import { getSettingsInitialData } from "@/lib/settings/initial-data";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function SettingsPage() {
  const sinAcceso = await exigirModuloDeLaPagina("settings");
  if (sinAcceso) return sinAcceso;

  const initialData = await getSettingsInitialData();
  return <SettingsForm initialData={initialData} />;
}
