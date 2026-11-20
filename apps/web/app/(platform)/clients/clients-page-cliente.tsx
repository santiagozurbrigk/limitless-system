"use client";

import { ClientsList } from "@/components/clients";
import { PageHeader } from "@/components/shared/page-header";
import { usePlatformData } from "@/providers";

/**
 * La lista de clientes, que lee del provider de la plataforma en el cliente.
 * La página (`page.tsx`) es de servidor para chequear antes el permiso del
 * módulo (SCRUM-540): una página de cliente no puede llamar al guardia.
 */
export function ClientsPageCliente() {
  const { clients, clientsLoading } = usePlatformData();

  return (
    <div className="space-y-6">
      <PageHeader description="Seguimiento desde el cierre hasta caso de éxito" />
      {clientsLoading ? (
        <p className="text-sm text-muted-foreground">Cargando clientes…</p>
      ) : (
        <ClientsList clients={clients} />
      )}
    </div>
  );
}
