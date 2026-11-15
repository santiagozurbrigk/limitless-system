"use client";

import { useEffect, useState } from "react";
import {
  connectMemberFathomAction,
  disconnectMemberFathomAction,
  listFathomMemberStatusesAction,
  syncMemberFathomAction,
  type FathomMemberStatus,
} from "@/app/fathom/member-actions";
import { Button, Input, Label } from "@ai-coo/ui";
import { useToast } from "@/providers/toast-provider";
import { esRechazoPorModulo, type RechazoPorModulo } from "@/lib/auth/regla-de-modulo";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getPermissionModuleLabel } from "@/constants/permission-modules";

export function FathomMemberAccountsSection({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const { push } = useToast();
  const [members, setMembers] = useState<FathomMemberStatus[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [rechazo, setRechazo] = useState<RechazoPorModulo | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await listFathomMemberStatusesAction();
      if (esRechazoPorModulo(rows)) {
        setRechazo(rows);
        return;
      }
      setMembers(rows);
    } catch (error) {
      push({
        title: "No se pudo cargar cuentas Fathom",
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const currentMember = members.find((member) => member.userId === currentUserId);

  const handleConnect = async () => {
    setPending(true);
    try {
      const result = await connectMemberFathomAction(apiKey);
      if (!result.ok) throw new Error(result.error ?? "No se pudo conectar");
      setApiKey("");
      push({ title: "Fathom conectado", variant: "success" });
      await refresh();
    } catch (error) {
      push({
        title: "Error al conectar Fathom",
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setPending(false);
    }
  };

  const handleDisconnect = async () => {
    setPending(true);
    try {
      await disconnectMemberFathomAction();
      push({ title: "Fathom desconectado", variant: "success" });
      await refresh();
    } catch (error) {
      push({
        title: "Error al desconectar",
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setPending(false);
    }
  };

  const handleSync = async () => {
    setPending(true);
    try {
      const respuesta = await syncMemberFathomAction();

      // El motivo real llega acá, no en un throw: ver el comentario de la
      // acción. Antes cualquier falla se veía como un párrafo en inglés.
      if (!respuesta.success) {
        push({ title: "No se pudo sincronizar", description: respuesta.error });
        return;
      }
      const result = respuesta.data;

      /**
       * ⭐ "Completado" sólo si algo entró.
       *
       * Antes esto cantaba éxito en verde con cero llamadas, sin mirar nada.
       * Cero llamadas puede ser normal —no hubo grabaciones nuevas— pero
       * cero **con fallas** no lo es, y hay que decirlo.
       */
      if (result.fallidas > 0) {
        push({
          title: "Sync con problemas",
          description: `${result.synced} guardada(s), ${result.fallidas} fallaron`,
        });
      } else {
        push({
          title: result.synced > 0 ? "Sync completado" : "Sin llamadas nuevas",
          description:
            result.synced > 0
              ? `${result.synced} llamada(s) sincronizada(s)`
              : "Fathom no devolvió grabaciones nuevas desde el último sync",
          variant: "success",
        });
      }
      await refresh();
    } catch (error) {
      push({
        title: "Error al sincronizar",
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setPending(false);
    }
  };

  // Sin Integraciones la recarga vuelve rechazada: pasa si los permisos cambian
  // con la pantalla abierta (SCRUM-541).
  if (rechazo) {
    return <SinAcceso moduleLabel={getPermissionModuleLabel(rechazo.moduleId)} />;
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Cuentas conectadas por miembro
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate">{member.name}</span>
              <span
                className={
                  member.connected
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                }
              >
                {member.connected ? "Conectado" : "No conectado"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {currentMember && !currentMember.connected ? (
        <div className="space-y-2 border-t pt-3">
          <Label htmlFor="member-fathom-key" className="text-xs">
            Tu API key de Fathom
          </Label>
          <Input
            id="member-fathom-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Pegá tu API key"
          />
          <Button
            size="sm"
            onClick={() => void handleConnect()}
            disabled={pending || !apiKey.trim()}
          >
            Conectar mi cuenta
          </Button>
        </div>
      ) : null}

      {currentMember?.connected ? (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSync()}
            disabled={pending}
          >
            Sincronizar mis llamadas
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handleDisconnect()}
            disabled={pending}
          >
            Desconectar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
