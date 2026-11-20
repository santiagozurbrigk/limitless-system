import { DriveAdminView } from "@/components/marketing/drive-admin-view";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function AdministrarPage() {
  const sinAcceso = await exigirModuloDeLaPagina("marketing");
  if (sinAcceso) return sinAcceso;

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[560px] flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Administrar contenido</h1>
          <p className="text-sm text-muted-foreground">
            Carpetas y archivos de tu Google Drive
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <DriveAdminView />
      </div>
    </div>
  );
}
