import ComentariosPageContent from "@/components/comentarios/comentarios-page-content";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function ComentariosPage() {
  const sinAcceso = await exigirModuloDeLaPagina("marketing");
  if (sinAcceso) return sinAcceso;

  return <ComentariosPageContent />;
}
