"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  listClosingCallsAction,
  updateClosingCallAction,
} from "@/app/closing/actions";
import {
  getConnectedUnipileAccountsAction,
  getOrganizationIdAction,
  listConversationsAction,
  markConversationReadAction,
  sendConversationMessageAction,
  updateConversationTagAction,
} from "@/app/conversations/actions";
import {
  rowToConversation,
  type ConversationRow,
} from "@/lib/conversations/mapper";
import {
  shouldIncludeConversationInInbox,
  type ConnectedUnipileAccount,
} from "@/lib/sales/unipile-inbox-filter";
import { createClient } from "@/lib/supabase/client";
import { acceptsManualOutcome } from "@/lib/closing/call-status";
import {
  createClientAction,
  listClientsAction,
  updateClientAction,
} from "@/app/clients/actions";
import { datoDeLaMutacion } from "@/lib/client/correr-accion";
import { recordClientPaymentAction } from "@/app/sales/payment-actions";
import { linkLeadToClientAction } from "@/app/sales/lead-actions";
import {
  getPaidAmountFromClosePayload,
  getPaymentDateFromClosePayload,
  installmentNumberForClosePayload,
} from "@/lib/clients/payment-utils";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import { mockClosingCalls } from "@/mocks/closing";
import { mockClients } from "@/mocks/clients";
import { mockConversations } from "@/mocks/sales";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Client, ClientStatus } from "@/types/clients";
import type {
  ClosePaymentPayload,
  ClosingCall,
  NoCloseReasonId,
} from "@/types/closing";
import { deriveSalesMetrics } from "@/lib/metrics/derive-sales-metrics";
import { mockSalesMetrics } from "@/mocks/sales";
import type { Conversation, ConversationTagId, SalesMetricsData } from "@/types/sales";
import type { CustomRole } from "@/types/team";

type PlatformDataContextValue = {
  conversations: Conversation[];
  conversationsLoading: boolean;
  salesMetrics: SalesMetricsData;
  salesMetricsLoading: boolean;
  setConversationTag: (
    conversationId: string,
    tag: ConversationTagId | null
  ) => Promise<void>;
  setConversationTagByLeadName: (
    leadName: string,
    tag: ConversationTagId
  ) => Promise<void>;
  markConversationRead: (conversationId: string) => void;
  sendConversationMessage: (
    conversationId: string,
    text: string,
    attachment?: File
  ) => Promise<void>;
  closingCalls: ClosingCall[];
  closingCallsLoading: boolean;
  updateClosingCall: (id: string, patch: Partial<ClosingCall>) => Promise<void>;
  clients: Client[];
  clientsLoading: boolean;
  addClient: (client: Omit<Client, "id"> | Client) => Promise<Client>;
  updateClient: (id: string, patch: Partial<Client>) => Promise<void>;
  customRoles: CustomRole[];
  addCustomRole: (role: CustomRole) => void;
  markCallClosed: (callId: string, payment: ClosePaymentPayload) => Promise<Client>;
  markCallNotClosed: (
    callId: string,
    reason: NoCloseReasonId,
    notes?: string
  ) => Promise<void>;
  markCallNoShow: (callId: string) => Promise<void>;
  refreshClients: () => Promise<void>;
  refreshClosingCalls: () => Promise<void>;
  refreshConversations: () => Promise<void>;
};

const PlatformDataContext = createContext<PlatformDataContextValue | null>(null);

const useSupabase = isSupabaseConfigured();

function findConversationByLead(
  conversations: Conversation[],
  leadName: string
): Conversation | undefined {
  return conversations.find(
    (c) => c.leadName.toLowerCase() === leadName.toLowerCase()
  );
}

function sortConversationsByRecency(list: Conversation[]): Conversation[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

function buildClientFromPayment(
  callId: string,
  payment: ClosePaymentPayload,
  /** Mail del lead del turno: es lo que hila al lead con el cliente. */
  leadEmail: string | null | undefined,
  /** Hoy en la zona de la organización: alta del cliente y fechas por defecto. */
  hoy: string
): Omit<Client, "id"> {
  // Calcular ingresos totales:
  // Para cuotas, si hay montos manuales por cuota, sumar esos; si no, usar monto uniforme × N
  const revenue =
    payment.paymentType === "upfront"
      ? payment.totalAmount ?? 0
      : payment.paymentType === "installments"
        ? payment.customInstallmentAmounts?.length
          ? payment.customInstallmentAmounts.reduce((s, a) => s + a, 0)
          : (payment.installmentAmount ?? 0) * (payment.installmentCount ?? 1)
        : (payment.upfrontAmount ?? 0) + (payment.feeAmount ?? 0);

  const installments =
    payment.paymentType === "installments" && payment.installmentCount
      ? Array.from({ length: payment.installmentCount }, (_, i) => {
          const paidAt =
            i === 0
              ? (payment.firstInstallmentDate ?? hoy)
              : undefined;
          // Monto: usa el override manual si está disponible, si no el uniforme
          const amount =
            payment.customInstallmentAmounts?.[i] ?? payment.installmentAmount ?? 0;
          return {
            id: `inst-${callId}-${i + 1}`,
            label: `Cuota ${i + 1}`,
            amount,
            status: (i === 0 ? "paid" : "pending") as "paid" | "pending",
            paidAt,
            dueDate: i === 0 ? payment.firstInstallmentDate : undefined,
          };
        })
      : undefined;

  const contextInsights = [
    payment.offeredProduct
      ? `Producto ofrecido: ${payment.offeredProduct}`
      : null,
    payment.avatar ? `Avatar / ICP: ${payment.avatar}` : null,
    payment.mainPain ? `Dolor principal: ${payment.mainPain}` : null,
    payment.objections ? `Objeciones: ${payment.objections}` : null,
    payment.feedbackNotes ? `Feedback: ${payment.feedbackNotes}` : null,
  ].filter((line): line is string => Boolean(line));

  return {
    name: payment.clientName,
    // ⭐ El mail viaja del turno al cliente. Sin esto, el hilo entre el lead y
    // el cliente en que se convirtió se corta justo en el momento del cierre.
    email: leadEmail ?? null,
    joinDate: hoy,
    paymentType: payment.paymentType,
    platform: "other",
    totalAmount: revenue,
    upfrontAmount: payment.upfrontAmount,
    feeAmount: payment.feeAmount,
    feeFrequency: payment.feeFrequency,
    status: "pending_onboarding",
    isSuccessCase: false,
    installments,
    salesFathomUrl: payment.fathomUrl,
    closingCallId: callId,
    offeredProduct: payment.offeredProduct,
    feedbackNotes: payment.feedbackNotes,
    avatar: payment.avatar,
    mainPain: payment.mainPain,
    objections: payment.objections,
    aiInsights: [
      "Cliente creado automáticamente desde Closing.",
      payment.paymentType === "upfront"
        ? "Pago upfront — seguimiento estándar de onboarding."
        : "Seguimiento de cuotas activado en el perfil del cliente.",
      ...contextInsights,
    ],
    linkedCalls: payment.fathomUrl
      ? [
          {
            id: `fc-${callId}`,
            title: `Llamada de cierre — ${payment.clientName}`,
            date: hoy,
            duration: "—",
            url: payment.fathomUrl,
          },
        ]
      : [],
    planId: payment.planId,
    selectedInstallmentSystemId: payment.selectedInstallmentSystemId,
  };
}

export function PlatformDataProvider({ children }: { children: ReactNode }) {
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    useSupabase ? [] : mockConversations.map((c) => ({ ...c }))
  );
  const [conversationsLoading, setConversationsLoading] = useState(useSupabase);
  const connectedUnipileAccountsRef = useRef<ConnectedUnipileAccount[]>([]);
  const [closingCalls, setClosingCalls] = useState<ClosingCall[]>(() =>
    useSupabase ? [] : mockClosingCalls.map((c) => ({ ...c }))
  );
  const [closingCallsLoading, setClosingCallsLoading] = useState(useSupabase);

  const salesMetricsLoading =
    useSupabase && (conversationsLoading || closingCallsLoading);

  const salesMetrics = useMemo(() => {
    if (!useSupabase) return mockSalesMetrics;
    if (salesMetricsLoading) {
      return deriveSalesMetrics([], [], []);
    }
    return deriveSalesMetrics(conversations, closingCalls);
  }, [conversations, closingCalls, salesMetricsLoading]);
  const [clients, setClients] = useState<Client[]>(() =>
    useSupabase ? [] : mockClients.map((c) => ({ ...c }))
  );
  const [clientsLoading, setClientsLoading] = useState(useSupabase);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const refreshClients = useCallback(async () => {
    if (!useSupabase) return;
    setClientsLoading(true);
    try {
      const list = await listClientsAction();
      setClients(list);
    } catch (e) {
      console.error("[PlatformDataProvider] listClients", e);
    } finally {
      setClientsLoading(false);
    }
  }, []);

  const refreshClosingCalls = useCallback(async () => {
    if (!useSupabase) return;
    setClosingCallsLoading(true);
    try {
      const list = await listClosingCallsAction();
      setClosingCalls(list);
    } catch (e) {
      console.error("[PlatformDataProvider] listClosingCalls", e);
    } finally {
      setClosingCallsLoading(false);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!useSupabase) return;
    setConversationsLoading(true);
    try {
      const [list, connectedAccounts] = await Promise.all([
        listConversationsAction(),
        getConnectedUnipileAccountsAction(),
      ]);
      connectedUnipileAccountsRef.current = connectedAccounts;
      setConversations(list);
    } catch (e) {
      console.error("[PlatformDataProvider] listConversations", e);
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!useSupabase) return;
    void (async () => {
      await refreshClients();
      await refreshClosingCalls();
      await refreshConversations();
    })();
  }, [
    refreshClients,
    refreshClosingCalls,
    refreshConversations,
  ]);

  useEffect(() => {
    if (!useSupabase) return;

    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const organizationId = await getOrganizationIdAction();
      if (!organizationId || cancelled) return;

      connectedUnipileAccountsRef.current =
        await getConnectedUnipileAccountsAction();

      const nextChannel = supabase
        .channel(`conversations:org:${organizationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "conversations",
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const row = payload.new as ConversationRow;
            if (
              !shouldIncludeConversationInInbox(
                row,
                connectedUnipileAccountsRef.current
              )
            ) {
              return;
            }
            const conversation = rowToConversation(row);
            setConversations((prev) => {
              if (prev.some((c) => c.id === conversation.id)) return prev;
              return sortConversationsByRecency([conversation, ...prev]);
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "conversations",
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const row = payload.new as ConversationRow;
            const conversation = rowToConversation(row);
            const included = shouldIncludeConversationInInbox(
              row,
              connectedUnipileAccountsRef.current
            );
            setConversations((prev) => {
              const idx = prev.findIndex((c) => c.id === conversation.id);
              if (!included) {
                if (idx === -1) return prev;
                return prev.filter((c) => c.id !== conversation.id);
              }
              if (idx === -1) {
                return sortConversationsByRecency([conversation, ...prev]);
              }
              const next = [...prev];
              next[idx] = conversation;
              return sortConversationsByRecency(next);
            });
          }
        );

      channel = nextChannel;

      if (cancelled) {
        void supabase.removeChannel(nextChannel);
        channel = null;
        return;
      }

      nextChannel.subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[PlatformDataProvider] conversations realtime", status, err);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  const persistConversationTag = useCallback(
    async (conversationId: string, tag: ConversationTagId | null) => {
      if (useSupabase) {
        const saved = await updateConversationTagAction(conversationId, tag);
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? saved : c))
        );
        return;
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, tag } : c))
      );
    },
    []
  );

  const setConversationTag = useCallback(
    (conversationId: string, tag: ConversationTagId | null) =>
      persistConversationTag(conversationId, tag),
    [persistConversationTag]
  );

  const setConversationTagByLeadName = useCallback(
    async (leadName: string, tag: ConversationTagId) => {
      const conv = findConversationByLead(conversations, leadName);
      if (conv) {
        await persistConversationTag(conv.id, tag);
        return;
      }
      setConversations((prev) => {
        const match = findConversationByLead(prev, leadName);
        if (!match) return prev;
        void persistConversationTag(match.id, tag);
        return prev.map((c) =>
          c.leadName.toLowerCase() === leadName.toLowerCase()
            ? { ...c, tag }
            : c
        );
      });
    },
    [conversations, persistConversationTag]
  );

  const markConversationRead = useCallback((conversationId: string) => {
    setConversations((prev) => {
      const conv = prev.find((c) => c.id === conversationId);
      if (!conv?.unread) return prev;
      if (useSupabase) {
        void markConversationReadAction(conversationId).catch((e) => {
          console.error("[PlatformDataProvider] markConversationRead", e);
        });
      }
      return prev.map((c) =>
        c.id === conversationId ? { ...c, unread: false } : c
      );
    });
  }, []);

  const sendConversationMessage = useCallback(
    async (conversationId: string, text: string, attachment?: File) => {
      const content =
        text.trim() || `[Adjunto: ${attachment?.name ?? "archivo"}]`;
      const timestamp = new Date().toISOString();
      const optimisticId = `optimistic-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      // Inserción optimista: el mensaje se ve al instante.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  { id: optimisticId, sender: "team" as const, content, timestamp },
                ],
                lastMessage: content,
                lastMessageAt: timestamp,
                unread: false,
              }
            : c
        )
      );

      if (!useSupabase) return;

      const formData = new FormData();
      formData.set("conversationId", conversationId);
      formData.set("text", text.trim());
      if (attachment) formData.set("attachment", attachment);

      let result: Awaited<ReturnType<typeof sendConversationMessageAction>>;
      try {
        result = await sendConversationMessageAction(formData);
      } catch (e) {
        result = {
          success: false,
          error: e instanceof Error ? e.message : "No se pudo enviar.",
        };
      }

      if (result.success) {
        const saved = result.conversation;
        setConversations((prev) =>
          sortConversationsByRecency(
            prev.map((c) => (c.id === conversationId ? saved : c))
          )
        );
        return;
      }

      // Reconciliar: quitar el mensaje optimista y propagar el error.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.filter((m) => m.id !== optimisticId),
                lastMessage:
                  c.messages.filter((m) => m.id !== optimisticId).at(-1)
                    ?.content ?? c.lastMessage,
              }
            : c
        )
      );
      throw new Error(result.error);
    },
    []
  );

  const syncConversationTagForCall = useCallback(
    async (call: ClosingCall | undefined, tag: ConversationTagId) => {
      if (!call) return;
      const conv =
        conversations.find((c) => c.id === call.conversationId) ??
        findConversationByLead(conversations, call.leadName);
      if (conv) await persistConversationTag(conv.id, tag);
    },
    [conversations, persistConversationTag]
  );

  const updateClosingCall = useCallback(
    async (id: string, patch: Partial<ClosingCall>) => {
      if (useSupabase) {
        const saved = await datoDeLaMutacion(
          () => updateClosingCallAction(id, patch),
          "[PlatformDataProvider] actualizar llamada"
        );
        setClosingCalls((prev) =>
          prev.map((c) => (c.id === id ? saved : c))
        );
        return;
      }

      setClosingCalls((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const addClient = useCallback(
    async (client: Omit<Client, "id"> | Client): Promise<Client> => {
      const payload =
        "id" in client
          ? (() => {
              const { id: _id, ...rest } = client;
              void _id;
              return rest;
            })()
          : client;

      if (useSupabase) {
        const saved = await datoDeLaMutacion(
          () => createClientAction(payload),
          "[PlatformDataProvider] crear cliente"
        );
        setClients((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)]);
        return saved;
      }

      const local: Client = {
        ...payload,
        id: `client-${Date.now()}`,
      };
      setClients((prev) => [local, ...prev]);
      return local;
    },
    []
  );

  const updateClient = useCallback(async (id: string, patch: Partial<Client>) => {
    if (useSupabase) {
      const saved = await datoDeLaMutacion(
        () => updateClientAction(id, patch),
        "[PlatformDataProvider] actualizar cliente"
      );
      setClients((prev) => prev.map((c) => (c.id === id ? saved : c)));
      return;
    }

    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }, []);

  const addCustomRole = useCallback((role: CustomRole) => {
    setCustomRoles((prev) => [...prev, role]);
  }, []);

  const markCallClosed = useCallback(
    async (callId: string, payment: ClosePaymentPayload): Promise<Client> => {
      const call = closingCalls.find((c) => c.id === callId);
      const existingClient = clients.find((c) => c.closingCallId === callId);

      if (existingClient) {
        throw new Error(
          "Esta llamada ya fue cerrada y tiene un cliente vinculado."
        );
      }
      if (call?.status === "closed") {
        throw new Error("Esta llamada ya está marcada como cerrada.");
      }
      // `attended` también acepta cierre: es una llamada que el proveedor marcó
      // como asistida y a la que todavía nadie le cargó el resultado. Con el
      // chequeo anterior —sólo `scheduled`— una llamada que GHL marcaba asistida
      // no se podía cerrar desde Limitless.
      if (call && !acceptsManualOutcome(call.status)) {
        throw new Error("Esta llamada ya tiene un resultado registrado.");
      }

      const revenue =
        payment.paymentType === "upfront"
          ? payment.totalAmount ?? 0
          : payment.paymentType === "installments"
            ? payment.customInstallmentAmounts?.length
              ? payment.customInstallmentAmounts.reduce((s, a) => s + a, 0)
              : (payment.installmentAmount ?? 0) * (payment.installmentCount ?? 1)
            : (payment.upfrontAmount ?? 0) + (payment.feeAmount ?? 0);

      await updateClosingCall(callId, {
        status: "closed",
        outcome: {
          paymentType: payment.paymentType,
          revenue,
        },
        fathomUrl: payment.fathomUrl ?? call?.fathomUrl,
        closedByName: payment.closedByName,
        paymentReceivedFrom: payment.paymentReceivedFrom,
        paymentDestinationPlatformId: payment.paymentDestinationPlatformId,
      });

      await syncConversationTagForCall(call, "closeado");

      // Un solo "hoy", el de la organización, para todo el cierre.
      const hoy = fechaDeHoyEnZona(zonaDeLaOrganizacion);
      const draft = buildClientFromPayment(callId, payment, call?.leadEmail, hoy);
      const client = await addClient(draft);

      // Cierra el ciclo lead → cliente. Sin esto el hilo se corta justo en el
      // momento en que el lead se convierte en cliente.
      // Es de mejor esfuerzo: si falla, el cierre sigue y queda en la consola
      // (también el rechazo devuelto como valor, SCRUM-504).
      if (useSupabase) {
        await linkLeadToClientAction({ callId, clientId: client.id })
          .then((resultado) => {
            if (!resultado.success) {
              console.error("[markCallClosed] link lead → cliente:", resultado.error);
            }
          })
          .catch((err) => console.error("[markCallClosed] link lead → cliente:", err));
      }

      const proof = payment.proof;
      if (useSupabase && proof) {
        // El motivo llega entero; si la acción lanzó, el texto fijo (SCRUM-504).
        await datoDeLaMutacion(
          () =>
            recordClientPaymentAction({
              clientId: client.id,
              amount: getPaidAmountFromClosePayload(payment),
              paymentDate: getPaymentDateFromClosePayload(payment, hoy),
              storagePath: proof.storagePath,
              mimeType: proof.mimeType,
              installmentNumber: installmentNumberForClosePayload(payment),
              paymentReceivedFrom: payment.paymentReceivedFrom,
              paymentDestinationPlatformId: payment.paymentDestinationPlatformId,
            }),
          "[markCallClosed] pago"
        );
        const { data: refreshed } = await listClientsAction().then((list) => ({
          data: list.find((c) => c.id === client.id) ?? client,
        }));
        setClients((prev) =>
          prev.map((c) => (c.id === client.id ? refreshed : c))
        );
        return refreshed;
      }

      return client;
    },
    [
      addClient,
      clients,
      closingCalls,
      syncConversationTagForCall,
      updateClosingCall,
      zonaDeLaOrganizacion,
    ]
  );

  const markCallNotClosed = useCallback(
    async (callId: string, reason: NoCloseReasonId, notes?: string) => {
      const call = closingCalls.find((c) => c.id === callId);
      // `attended` también acepta resultado: es una llamada que el proveedor
      // marcó como asistida y a la que todavía nadie le cargó el desenlace.
      // Con el chequeo anterior (sólo `scheduled`) esas llamadas quedaban sin
      // forma de cerrarse desde Limitless.
      if (call && !acceptsManualOutcome(call.status)) {
        throw new Error("Esta llamada ya tiene un resultado registrado.");
      }
      await updateClosingCall(callId, {
        status: "not_closed",
        outcome: { noCloseReason: reason, notes },
      });
      await syncConversationTagForCall(call, "no-closeado");
    },
    [closingCalls, syncConversationTagForCall, updateClosingCall]
  );

  const markCallNoShow = useCallback(
    async (callId: string) => {
      const call = closingCalls.find((c) => c.id === callId);
      if (call && !acceptsManualOutcome(call.status)) {
        throw new Error("Esta llamada ya tiene un resultado registrado.");
      }
      await updateClosingCall(callId, { status: "no_show" });
      await syncConversationTagForCall(call, "muy-descalificado");
    },
    [closingCalls, syncConversationTagForCall, updateClosingCall]
  );

  const value = useMemo(
    () => ({
      conversations,
      conversationsLoading,
      salesMetrics,
      salesMetricsLoading,
      setConversationTag,
      setConversationTagByLeadName,
      markConversationRead,
      sendConversationMessage,
      closingCalls,
      closingCallsLoading,
      updateClosingCall,
      clients,
      clientsLoading,
      addClient,
      updateClient,
      customRoles,
      addCustomRole,
      markCallClosed,
      markCallNotClosed,
      markCallNoShow,
      refreshClients,
      refreshClosingCalls,
      refreshConversations,
    }),
    [
      conversations,
      conversationsLoading,
      salesMetrics,
      salesMetricsLoading,
      setConversationTag,
      setConversationTagByLeadName,
      markConversationRead,
      sendConversationMessage,
      closingCalls,
      closingCallsLoading,
      updateClosingCall,
      clients,
      clientsLoading,
      addClient,
      updateClient,
      customRoles,
      addCustomRole,
      markCallClosed,
      markCallNotClosed,
      markCallNoShow,
      refreshClients,
      refreshClosingCalls,
      refreshConversations,
    ]
  );

  return (
    <PlatformDataContext.Provider value={value}>
      {children}
    </PlatformDataContext.Provider>
  );
}

export function usePlatformData(): PlatformDataContextValue {
  const ctx = useContext(PlatformDataContext);
  if (!ctx) {
    throw new Error("usePlatformData debe usarse dentro de PlatformDataProvider");
  }
  return ctx;
}

export type { ClientStatus };
