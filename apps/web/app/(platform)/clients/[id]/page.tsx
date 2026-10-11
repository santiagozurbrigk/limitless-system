import { notFound } from "next/navigation";
import { clienteVisibleExiste } from "@/lib/clients/cliente-visible";
import { FichaDelCliente } from "./ficha-del-cliente";

/**
 * Ficha de un cliente. La existencia se resuelve acá, en el servidor
 * (SCRUM-108): un id inexistente o de otra organización llama a `notFound()`
 * y se ve el `not-found` de la plataforma, dentro de la cáscara. Antes la
 * página era un client component que llamaba a `notFound()` en el navegador y
 * la app rompía con el error #310 de React.
 */
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await clienteVisibleExiste(id))) notFound();
  return <FichaDelCliente id={id} />;
}
