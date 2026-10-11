"use client";

import Link from "next/link";
import { Button } from "@ai-coo/ui";
import { ClientDetail } from "@/components/clients";
import { EmptyState } from "@/components/shared/empty-state";
import { usePlatformData } from "@/providers";
import { paths } from "@/routes";

/**
 * La ficha de un cliente que el servidor ya confirmó que existe y que quien
 * mira puede ver (`page.tsx`, SCRUM-108). Los datos salen de la lista del
 * navegador, como antes.
 *
 * Nunca llama a `notFound()`: desde un client component rompía la app con el
 * error #310 de React. Si el cliente no está en la lista (lo borraron recién,
 * o la lista no se pudo leer) se muestra un aviso con la vuelta a Clientes.
 */
export function FichaDelCliente({ id }: { id: string }) {
  const { clients, clientsLoading } = usePlatformData();
  const client = clients.find((c) => c.id === id);

  if (clientsLoading) {
    return <p className="text-sm text-muted-foreground">Cargando cliente…</p>;
  }

  if (!client) {
    return (
      <EmptyState
        title="No pudimos mostrar este cliente"
        description="Puede que lo hayan eliminado recién o que la lista no se haya podido cargar. Volvé a Clientes y probá de nuevo."
        action={
          <Button asChild>
            <Link href={paths.platform.clients.root}>Ir a Clientes</Link>
          </Button>
        }
      />
    );
  }

  return <ClientDetail client={client} />;
}
