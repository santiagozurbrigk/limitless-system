import { notFound } from "next/navigation";
import { ContextViewer } from "@/components/business-context";
import { getDocumentByIdAction } from "@/app/business-context/actions";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function BusinessContextViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sinAcceso = await exigirModuloDeLaPagina("knowledge_base");
  if (sinAcceso) return sinAcceso;

  const { id } = await params;
  const document = await getDocumentByIdAction(id);
  if (!document) notFound();
  return <ContextViewer document={document} />;
}
