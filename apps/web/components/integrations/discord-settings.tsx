"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Hash, Upload, VolumeX, X } from "lucide-react";
import { Badge, Button, GlassPanel } from "@ai-coo/ui";
import {
  dismissDiscordPendingLinkAction,
  linkDiscordClientManuallyAction,
  removeDiscordMonitoredChannelAction,
  addDiscordMonitoredChannelAction,
  listDiscordGuildChannelsAction,
  type DiscordChannelOption,
  updateDiscordAutoPatternAction,
  updateDiscordBotNameAction,
  updateDiscordBotAvatarAction,
  removeDiscordBotAvatarAction,
  updateDiscordBotCanSpeakAction,
  type DiscordChannelPerson,
  type DiscordTeamOption,
} from "@/app/discord/actions";
import { SwitchRow } from "@/components/shared/switch-row";
import { sugerirWins } from "@/lib/discord/channels";
import { DiscordChannelCard } from "./discord-channel-card";
import { useToast } from "@/providers/toast-provider";
import { esRechazoPorModulo, type RechazoPorModulo } from "@/lib/auth/regla-de-modulo";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getPermissionModuleLabel } from "@/constants/permission-modules";
import { useAutoRefresh } from "@/lib/hooks/use-auto-refresh";
import type {
  DiscordClientLink,
  DiscordIntegration,
  DiscordPendingLink,
  MonitoredChannel,
} from "@/types/discord";
import { brand } from "@/lib/brand";
import { MAX_NICKNAME_LENGTH } from "@/lib/discord/limits";

type Props = {
  integration: DiscordIntegration;
  linkedClients: DiscordClientLink[];
  pendingLinks: DiscordPendingLink[];
  clients: { id: string; name: string }[];
  channelClients: Record<string, string[]>;
  channelPeople: Record<string, DiscordChannelPerson[]>;
  team: DiscordTeamOption[];
};

function PendingLinkCard({
  pending,
  clients,
  onResolved,
}: {
  pending: DiscordPendingLink;
  clients: { id: string; name: string }[];
  onResolved: () => void;
}) {
  const { push } = useToast();
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLink = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await linkDiscordClientManuallyAction(pending.id, clientId);
      if (!res.success) {
        push({ title: res.error, variant: "default" });
        return;
      }
      push({ title: "Cliente vinculado", variant: "success" });
      onResolved();
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    setLoading(true);
    try {
      const res = await dismissDiscordPendingLinkAction(pending.id);
      if (!res.success) {
        push({ title: res.error, variant: "default" });
        return;
      }
      onResolved();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 px-3 py-3 space-y-2">
      <div>
        <p className="text-sm font-medium">
          @{pending.discord_display_name ?? pending.discord_username}
        </p>
        {pending.email_attempted && (
          <p className="text-xs text-muted-foreground">
            Email intentado: {pending.email_attempted}
          </p>
        )}
        {pending.channel_name && (
          <p className="text-xs text-muted-foreground">
            Canal: #{pending.channel_name}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="h-8 w-48 rounded-lg border border-border/60 bg-muted/20 px-2 text-xs"
        >
          <option value="">Seleccionar cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!clientId || loading} onClick={handleLink}>
          Vincular
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={handleDismiss}
        >
          Ignorar
        </Button>
      </div>
    </div>
  );
}

export function DiscordSettings({
  integration,
  linkedClients: initialLinked,
  pendingLinks: initialPending,
  clients,
  channelClients,
  channelPeople,
  team,
}: Props) {
  const { push } = useToast();
  const [botName, setBotName] = useState(
    integration.bot_name ?? `Asistente ${brand.name}`,
  );
  const [autoPattern, setAutoPattern] = useState(
    integration.auto_monitor_pattern ?? "cliente-",
  );
  const [monitoredChannels, setMonitoredChannels] = useState<
    MonitoredChannel[]
  >(integration.monitored_channels ?? []);
  // `?? true` y no `?? false`: el campo puede no venir de una base sin migrar,
  // y ahí el bot sí habla. La pantalla tiene que mostrar lo que pasa de verdad.
  const [canSpeak, setCanSpeak] = useState(integration.bot_can_speak ?? true);
  const [linkedClients, setLinkedClients] = useState(initialLinked);
  const [pendingLinks, setPendingLinks] = useState(initialPending);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Las vinculaciones las escribe el bot desde Discord, no esta pantalla: sin
  // esto había que apretar F5 para verlas aparecer.
  useAutoRefresh();

  // Las tarjetas de canal mutan datos que llegan como props del servidor
  // (dueños, personas asociadas), así que después de guardar hay que volver a
  // pedirlos: el estado local de esta pantalla no los tiene.
  const router = useRouter();
  const refresh = () => router.refresh();

  /*
   * Las listas viven en estado local para poder actualizarlas al toque cuando la
   * acción sale de esta pantalla (agregar un canal, resolver una vinculación).
   * Pero `useState(prop)` toma el valor **una sola vez**: sin esto, refrescar
   * traía datos nuevos del servidor y la pantalla seguía mostrando los viejos —
   * o sea, el F5 tampoco se hubiera evitado.
   *
   * El servidor es la verdad: cuando llegan props nuevas, ganan.
   */
  useEffect(() => {
    setLinkedClients(initialLinked);
  }, [initialLinked]);

  useEffect(() => {
    setPendingLinks(initialPending);
  }, [initialPending]);

  useEffect(() => {
    setMonitoredChannels(integration.monitored_channels ?? []);
  }, [integration.monitored_channels]);

  // Canales del servidor, pedidos a Discord recién al abrir el selector: la
  // lista cambia todo el tiempo y no tiene sentido traerla al pintar la página.
  const [picker, setPicker] = useState<DiscordChannelOption[] | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [rechazo, setRechazo] = useState<RechazoPorModulo | null>(null);

  const openPicker = async () => {
    setLoadingPicker(true);
    setPickerError(null);
    try {
      const res = await listDiscordGuildChannelsAction();
      if (esRechazoPorModulo(res)) {
        setRechazo(res);
        return;
      }
      if (!res.ok) {
        setPickerError(res.error);
        setPicker([]);
        return;
      }
      setPicker(res.channels);
    } finally {
      setLoadingPicker(false);
    }
  };

  const addChannel = async (channel: DiscordChannelOption) => {
    setSaving(true);
    try {
      const res = await addDiscordMonitoredChannelAction(channel.id);
      if (!res.success) {
        push({ title: res.error, variant: "default" });
        return;
      }
      setMonitoredChannels((prev) => [
        ...prev,
        {
          channel_id: channel.id,
          channel_name: channel.name,
          purpose: "community",
        wins: sugerirWins(channel.name),
        },
      ]);
      setPicker(
        (prev) =>
          prev?.map((c) =>
            c.id === channel.id ? { ...c, monitored: true } : c,
          ) ?? null,
      );
      push({ title: `#${channel.name} monitoreado`, variant: "success" });
    } finally {
      setSaving(false);
    }
  };

  const saveBotName = async () => {
    setSaving(true);
    try {
      const res = await updateDiscordBotNameAction(botName);
      if (!res.success) {
        push({ title: res.error, variant: "default" });
        return;
      }
      push({ title: "Nombre aplicado en tu servidor", variant: "success" });
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await updateDiscordBotAvatarAction(form);
      if (!res.success) {
        push({ title: res.error, variant: "default" });
        return;
      }
      push({ title: "Foto aplicada en tu servidor", variant: "success" });
    } finally {
      setSaving(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeAvatar = async () => {
    setSaving(true);
    try {
      const res = await removeDiscordBotAvatarAction();
      if (!res.success) {
        push({ title: res.error, variant: "default" });
        return;
      }
      push({ title: "Foto quitada", variant: "success" });
    } finally {
      setSaving(false);
    }
  };

  const saveCanSpeak = async (valor: boolean) => {
    // Optimista: el interruptor se mueve al toque y vuelve solo si falla. Un
    // switch que tarda medio segundo en reaccionar se aprieta dos veces.
    setCanSpeak(valor);
    setSaving(true);
    try {
      const res = await updateDiscordBotCanSpeakAction(valor);
      if (!res.success) {
        setCanSpeak(!valor);
        push({ title: res.error, variant: "default" });
        return;
      }
      push({
        title: valor
          ? "El bot puede escribir en tu servidor"
          : "El bot quedó en silencio",
        variant: "success",
      });
    } finally {
      setSaving(false);
    }
  };

  const savePattern = async () => {
    setSaving(true);
    try {
      const res = await updateDiscordAutoPatternAction(autoPattern);
      if (!res.success) {
        push({ title: res.error, variant: "default" });
        return;
      }
      push({ title: "Patrón guardado", variant: "success" });
    } finally {
      setSaving(false);
    }
  };

  const removeChannel = async (channelId: string) => {
    const res = await removeDiscordMonitoredChannelAction(channelId);
    if (!res.success) {
      push({ title: res.error, variant: "default" });
      return;
    }
    setMonitoredChannels((prev) =>
      prev.filter((c) => c.channel_id !== channelId),
    );
    setPicker(
      (prev) =>
        prev?.map((c) =>
          c.id === channelId ? { ...c, monitored: false } : c,
        ) ?? null,
    );
    push({ title: "Canal removido", variant: "success" });
  };

  // Sin Integraciones la recarga vuelve rechazada: pasa si los permisos cambian
  // con la pantalla abierta (SCRUM-541).
  if (rechazo) {
    return <SinAcceso moduleLabel={getPermissionModuleLabel(rechazo.moduleId)} />;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/*
        El rechazo de Discord sobrevive a la recarga. Sin esto, guardar un nombre
        que Discord no aceptó dejaba la pantalla diciendo que estaba guardado
        mientras en el servidor seguía el viejo.
      */}
      {integration.bot_profile_error ? (
        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              El perfil del bot no se aplicó en tu servidor
            </p>
            <p className="text-sm text-muted-foreground">
              {integration.bot_profile_error}
            </p>
          </div>
        </div>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Qué puede hacer el bot</h3>

        <GlassPanel className="px-4 py-1">
          <SwitchRow
            label="El bot puede escribir en tu servidor"
            description="Apagado, el bot lee y registra pero no manda ningún mensaje."
            checked={canSpeak}
            disabled={saving}
            onChange={saveCanSpeak}
          />
        </GlassPanel>

        {/*
          ⭐ Decir qué se apaga y qué NO se apaga, en la pantalla.
          El miedo razonable de quien lo apaga es estar desconectando el bot
          entero. Si eso se aclara sólo en un documento, la mitad no lo va a
          leer y va a dejar prendido algo que no quiere.
        */}
        {!canSpeak ? (
          <div className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2.5">
            <VolumeX className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                <span className="text-foreground">Sigue funcionando:</span>{" "}
                leer los canales monitoreados, medir la actividad y el silencio
                de cada cliente, y proponer wins e hitos.
              </p>
              <p>
                <span className="text-foreground">Queda apagado:</span> el
                saludo al crearse un canal nuevo —el canal se agrega igual— y la
                respuesta a <code>!vincular</code>. Quien lo escriba no recibe
                nada: si el email es exacto se vincula solo, y si no, aparece acá
                abajo en vinculaciones pendientes.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Identidad del bot</h3>
        <p className="text-sm text-muted-foreground">
          El nombre y la foto que ve tu equipo al lado de cada mensaje del bot,
          sólo en tu servidor. En otros servidores el bot mantiene los suyos.
        </p>

        <div className="flex gap-3">
          <input
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder={`Asistente ${brand.name}`}
            maxLength={MAX_NICKNAME_LENGTH}
            className="h-9 flex-1 rounded-lg border border-border/60 bg-muted/20 px-3 text-sm"
          />
          <Button size="sm" disabled={saving} onClick={saveBotName}>
            Guardar
          </Button>
        </div>

        <GlassPanel className="flex items-center gap-4 p-4">
          {integration.bot_avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL de Supabase Storage, sin dominio configurado en next/image
            <img
              src={integration.bot_avatar_url}
              alt="Foto del bot"
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-dashed border-border/60 text-muted-foreground">
              <Upload className="h-4 w-4" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">Foto del bot</p>
            <p className="text-xs text-muted-foreground">
              PNG, JPG o GIF, hasta 4 MB. Discord no acepta WebP.
            </p>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadAvatar(file);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => fileInput.current?.click()}
          >
            {integration.bot_avatar_url ? "Cambiar" : "Subir"}
          </Button>
          {integration.bot_avatar_url ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={removeAvatar}
            >
              Quitar
            </Button>
          ) : null}
        </GlassPanel>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Canales monitoreados</h3>

        <GlassPanel className="p-4 space-y-3">
          <p className="text-sm font-medium">Detección automática</p>
          <p className="text-xs text-muted-foreground">
            El bot monitoreará automáticamente los canales nuevos que contengan
            esta palabra en su nombre
          </p>
          <div className="flex gap-3">
            <input
              value={autoPattern}
              onChange={(e) => setAutoPattern(e.target.value)}
              placeholder="cliente-"
              className="h-9 flex-1 rounded-lg border border-border/60 bg-muted/20 px-3 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={savePattern}
            >
              Guardar
            </Button>
          </div>
        </GlassPanel>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Canales que el bot lee hoy
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={loadingPicker || saving}
            onClick={openPicker}
          >
            {loadingPicker ? "Buscando…" : "Elegir canales"}
          </Button>
        </div>

        {monitoredChannels.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Ninguno todavía, así que el bot está en el servidor y no lee nada.
            Elegí los canales acá arriba: la detección automática sólo alcanza a
            los canales que se creen de ahora en más.
          </p>
        ) : (
          monitoredChannels.map((channel) => (
            <DiscordChannelCard
              key={channel.channel_id}
              channel={channel}
              clientIds={channelClients[channel.channel_id] ?? []}
              people={channelPeople[channel.channel_id] ?? []}
              clients={clients}
              team={team}
              onRemove={() => removeChannel(channel.channel_id)}
              onChanged={refresh}
            />
          ))
        )}

        {picker ? (
          <GlassPanel className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Canales del servidor</p>
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {pickerError ? (
              <p className="text-xs text-destructive">{pickerError}</p>
            ) : picker.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                El bot no ve ningún canal de texto. Si el servidor tiene canales
                privados, hay que darle acceso desde Discord.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {picker.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{channel.name}</span>
                    </span>
                    {channel.monitored ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        Ya monitoreado
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 px-2.5 text-[11px]"
                        disabled={saving}
                        onClick={() => addChannel(channel)}
                      >
                        Monitorear
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Clientes vinculados</h3>
        {linkedClients.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Ningún cliente vinculado. Los usuarios pueden usar{" "}
            <code className="text-[11px]">!vincular email@ejemplo.com</code> en
            Discord.
          </p>
        ) : (
          linkedClients.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
            >
              <div>
                <p className="text-sm">{link.clients?.name ?? "Cliente"}</p>
                <p className="text-xs text-muted-foreground">
                  @{link.discord_display_name ?? link.discord_username}
                </p>
              </div>
              <Badge variant="success" className="text-[10px]">
                {link.link_method === "email_command"
                  ? "Por email"
                  : link.link_method === "manual"
                    ? "Manual"
                    : "Por nombre"}
              </Badge>
            </div>
          ))
        )}

        {pendingLinks.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Pendientes de vincular manualmente:
            </p>
            {pendingLinks.map((pending) => (
              <PendingLinkCard
                key={pending.id}
                pending={pending}
                clients={clients}
                onResolved={() => {
                  setPendingLinks((prev) =>
                    prev.filter((p) => p.id !== pending.id),
                  );
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
