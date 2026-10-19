"use client";

import { usePathname } from "next/navigation";
import { AgentDataProvider } from "@/providers/agent-data-provider";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function conversationIdFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "agent" || segments.length !== 2) return null;
  const id = segments[1];
  return UUID_RE.test(id) ? id : null;
}

function stageIdFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "agent" || segments[1] !== "stage" || !segments[2]) {
    return null;
  }
  return segments[2];
}

/**
 * La parte de cliente del layout del Agente: elige la conversación o la etapa
 * según la URL. El `layout.tsx` del segmento es de servidor porque antes hace
 * el bloqueo por experiencia (SCRUM-524).
 */
export function AgentLayoutCliente({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const conversationId = conversationIdFromPath(pathname);
  const filterStageId = stageIdFromPath(pathname);

  return (
    <AgentDataProvider
      conversationId={conversationId}
      filterStageId={filterStageId}
    >
      {children}
    </AgentDataProvider>
  );
}
