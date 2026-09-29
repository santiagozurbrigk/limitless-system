"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import {
  actionErrorMessage,
  runMutation,
  type MutationResult,
} from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { paths } from "@/routes";
import { summarizeByClient, type ClientActivity } from "@/lib/discord/activity";
import {
  CLASSIFY_RUN_LIMIT,
  classifyDiscordMessagesForOrg,
} from "@/lib/discord/classify-run";
import {
  listGuildTextChannels,
  type DiscordGuildChannel,
} from "@/lib/discord/api";
import { applyGuildProfile, toImageDataUri } from "@/lib/discord/profile";
import {
  BOT_AVATAR_MAX_BYTES,
  DISCORD_IMAGE_MIME_TYPES,
  MAX_NICKNAME_LENGTH,
  type DiscordImageMimeType,
} from "@/lib/discord/limits";
import {
  clienteDelCanal,
  normalizarCanales,
  sugerirWins,
  type ChannelPurpose,
} from "@/lib/discord/channels";
import {
  sugerirIdentidad,
  type Sugerencia,
} from "@/lib/discord/suggest-identity";
import type {
  DiscordClientLink,
  DiscordIntegration,
  DiscordIntegrationStats,
  DiscordMessage,
  DiscordPendingLink,
  MonitoredChannel,
} from "@/types/discord";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

/**
 * La mejor sugerencia para una persona: primero el equipo, después los clientes.
 *
 * Un empate se resuelve a favor del equipo por una razón asimétrica: marcar a
 * alguien del equipo como cliente le crea una ficha fantasma que alguien va a
 * ver y va a tener que deshacer; marcar a un cliente como equipo hace que sus
 * mensajes dejen de contarse **en silencio**. El error caro es el segundo, y
 * por eso la sugerencia de equipo se muestra con su nivel de certeza a la vista
 * en vez de aplicarse sola.
 */
function sugerirPara(
  nombres: (string | null | undefined)[],
  equipo: DiscordTeamOption[],
  clientes: { id: string; nombre: string }[],
): (Sugerencia & { tipo: "team" | "client" }) | null {
  const delEquipo = sugerirIdentidad(
    nombres,
    equipo.map((persona) => ({ id: persona.id, nombre: persona.name })),
  );
  if (delEquipo) return { ...delEquipo, tipo: "team" };

  const deClientes = sugerirIdentidad(nombres, clientes);
  return deClientes ? { ...deClientes, tipo: "client" } : null;
}

function sugerenciaMemorizada(
  memoria: Map<string, (Sugerencia & { tipo: "team" | "client" }) | null>,
  discordUserId: string,
  nombres: (string | null | undefined)[],
  equipo: DiscordTeamOption[],
  clientes: { id: string; nombre: string }[],
) {
  if (!memoria.has(discordUserId)) {
    memoria.set(discordUserId, sugerirPara(nombres, equipo, clientes));
  }
  return memoria.get(discordUserId) ?? null;
}

export type DiscordIntegrationStatus = {
  connected: boolean;
  integration: DiscordIntegration | null;
  stats: DiscordIntegrationStats;
};

const EMPTY_STATS: DiscordIntegrationStats = {
  linkedClientsCount: 0,
  messagesCount: 0,
  testimonialsCount: 0,
};

export async function getDiscordIntegrationStatusAction(): Promise<DiscordIntegrationStatus> {
  if (!isSupabaseConfigured()) {
    return { connected: false, integration: null, stats: EMPTY_STATS };
  }

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data: integration } = await supabase
    .from("discord_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .maybeSingle();

  if (!integration) {
    return { connected: false, integration: null, stats: EMPTY_STATS };
  }

  const [linksRes, messagesRes, testimonialsRes] = await Promise.all([
    supabase
      .from("discord_client_links")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("discord_messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("discord_messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_testimonial", true),
  ]);

  return {
    connected: true,
    integration: integration as DiscordIntegration,
    stats: {
      linkedClientsCount: linksRes.count ?? 0,
      messagesCount: messagesRes.count ?? 0,
      testimonialsCount: testimonialsRes.count ?? 0,
    },
  };
}

/** Alguien que escribió en un canal, y qué se sabe de quién es. */
export type DiscordChannelPerson = {
  discordUserId: string;
  name: string;
  messages: number;
  /** Cliente al que está vinculado, o `null`. */
  clientId: string | null;
  /** `true` si está marcado como gente del equipo. */
  isTeam: boolean;
  /** Persona del equipo a la que corresponde. `null` = equipo sin nombrar. */
  profileId: string | null;
  /** A quién se parece, si no está definido todavía. Se confirma con un clic. */
  suggestion:
    | (Sugerencia & { tipo: "team" | "client" })
    | null;
};

/** Alguien del equipo del negocio, para el desplegable. */
export type DiscordTeamOption = { id: string; name: string };

export async function getDiscordSettingsAction(): Promise<{
  integration: DiscordIntegration | null;
  linkedClients: DiscordClientLink[];
  pendingLinks: DiscordPendingLink[];
  clients: { id: string; name: string }[];
  /** Dueños de cada canal, por `channel_id`. */
  channelClients: Record<string, string[]>;
  /** Quiénes escribieron en cada canal, por `channel_id`. */
  channelPeople: Record<string, DiscordChannelPerson[]>;
  /** El equipo del negocio, para marcar equivalencias. */
  team: DiscordTeamOption[];
}> {
  if (!isSupabaseConfigured()) {
    return {
      integration: null,
      linkedClients: [],
      pendingLinks: [],
      clients: [],
      channelClients: {},
      channelPeople: {},
      team: [],
    };
  }

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const [
    integrationRes,
    linksRes,
    pendingRes,
    clientsRes,
    duenosRes,
    autoresRes,
    equipoRes,
    perfilesRes,
  ] = await Promise.all([
    supabase
      .from("discord_integrations")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("discord_client_links")
      .select("*, clients(id, name)")
      .eq("organization_id", organizationId)
      .order("linked_at", { ascending: false }),
    supabase
      .from("discord_pending_links")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("discord_channel_clients")
      .select("channel_id, client_id")
      .eq("organization_id", organizationId),
    /**
     * ⭐ Quiénes escribieron en cada canal sale de los mensajes ya guardados, no
     * de preguntarle a Discord.
     *
     * Listar los miembros de un servidor necesita el intent privilegiado
     * `GuildMembers`, que el bot **no pide a propósito** para no obligar a
     * activar un segundo permiso. Y de todos modos los que importan son los que
     * escribieron: un miembro que nunca habló no tiene actividad que atribuir.
     *
     * El tope existe para que un servidor con historia no traiga la tabla
     * entera a la pantalla; se ordena por fecha para que el corte deje afuera lo
     * viejo, que es lo que menos se necesita asociar.
     */
    supabase
      .from("discord_messages")
      .select(
        "channel_id, discord_user_id, discord_username, discord_display_name",
      )
      .eq("organization_id", organizationId)
      .order("sent_at", { ascending: false })
      .limit(2000),
    supabase
      .from("discord_team_members")
      .select("discord_user_id, profile_id")
      .eq("organization_id", organizationId),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("organization_id", organizationId)
      .order("full_name"),
  ]);

  const team: DiscordTeamOption[] = (
    (perfilesRes.data as
      | { id: string; full_name: string | null; email: string }[]
      | null) ?? []
  ).map((perfil) => ({
    id: perfil.id,
    // Sin nombre cargado queda el mail: es feo pero identifica, que es lo único
    // que esta lista tiene que hacer.
    name: perfil.full_name?.trim() || perfil.email,
  }));

  const equipoPorPersona = new Map<string, string | null>();
  for (const fila of equipoRes.data ?? []) {
    equipoPorPersona.set(fila.discord_user_id, fila.profile_id);
  }

  const channelClients: Record<string, string[]> = {};
  for (const fila of duenosRes.data ?? []) {
    (channelClients[fila.channel_id] ??= []).push(fila.client_id);
  }

  const clientePorPersona = new Map<string, string>();
  for (const link of (linksRes.data as DiscordClientLink[] | null) ?? []) {
    clientePorPersona.set(link.discord_user_id, link.client_id);
  }

  const clientesParaSugerir = (
    (clientsRes.data as { id: string; name: string }[] | null) ?? []
  ).map((cliente) => ({ id: cliente.id, nombre: cliente.name }));

  /**
   * La misma persona aparece en varios canales y su sugerencia no cambia entre
   * uno y otro. Sin esta memoria, alguien que escribió en cinco canales se
   * compara cinco veces contra los 335 clientes.
   */
  const sugerenciaPorPersona = new Map<
    string,
    (Sugerencia & { tipo: "team" | "client" }) | null
  >();

  const channelPeople: Record<string, DiscordChannelPerson[]> = {};
  for (const fila of autoresRes.data ?? []) {
    const personas = (channelPeople[fila.channel_id] ??= []);
    const existente = personas.find(
      (persona) => persona.discordUserId === fila.discord_user_id,
    );

    if (existente) {
      existente.messages += 1;
      continue;
    }

    const clientId = clientePorPersona.get(fila.discord_user_id) ?? null;
    const isTeam = equipoPorPersona.has(fila.discord_user_id);

    personas.push({
      discordUserId: fila.discord_user_id,
      name:
        fila.discord_display_name ?? fila.discord_username ?? fila.discord_user_id,
      messages: 1,
      clientId,
      isTeam,
      profileId: equipoPorPersona.get(fila.discord_user_id) ?? null,
      /**
       * ⭐ Sólo se sugiere sobre lo que **no está definido**.
       *
       * Sugerirle algo a alguien ya resuelto es ruido, y peor: invita a
       * "corregir" una decisión que alguien ya tomó a mano, que es más
       * confiable que cualquier parecido de nombres.
       *
       * El equipo se prueba primero porque es la lista chica y específica —9
       * personas contra 335 clientes—, así que una coincidencia ahí pesa mucho
       * más que la misma coincidencia contra el padrón entero de clientes.
       */
      suggestion:
        clientId || isTeam
          ? null
          : sugerenciaMemorizada(
              sugerenciaPorPersona,
              fila.discord_user_id,
              [fila.discord_display_name, fila.discord_username],
              team,
              clientesParaSugerir,
            ),
    });
  }

  // Los que más escribieron primero: son los que más urge asociar.
  for (const personas of Object.values(channelPeople)) {
    personas.sort((a, b) => b.messages - a.messages);
  }

  /**
   * ⭐ Los canales se normalizan al leerlos, no se castean.
   *
   * `monitored_channels` es JSONB: una fila escrita antes de la migración llega
   * con `purpose: "clients"` y sin `wins`, y castearla a `MonitoredChannel`
   * haría que TypeScript jure que están los campos mientras la pantalla recibe
   * `undefined`. `normalizarCanales` los completa con el valor que no atribuye
   * nada, que es lo que esa fila ya hacía.
   */
  const integration = integrationRes.data
    ? ({
        ...integrationRes.data,
        monitored_channels: normalizarCanales(
          integrationRes.data.monitored_channels,
        ),
      } as DiscordIntegration)
    : null;

  return {
    integration,
    linkedClients: (linksRes.data as DiscordClientLink[]) ?? [],
    pendingLinks: (pendingRes.data as DiscordPendingLink[]) ?? [],
    channelClients,
    channelPeople,
    team,
    clients: clientsRes.data ?? [],
  };
}

/**
 * El servidor conectado de la organización. Todas las acciones de perfil lo
 * necesitan: sin `guild_id` no hay a quién aplicarle nada.
 */
async function requireConnectedGuild(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<string> {
  const { data } = await supabase
    .from("discord_integrations")
    .select("guild_id")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .maybeSingle();

  if (!data?.guild_id) {
    throw new Error("No hay ningún servidor de Discord conectado.");
  }
  return data.guild_id as string;
}

/**
 * Aplica un cambio de perfil en Discord y **deja registrado si lo rechazó**.
 *
 * ⭐ Es la mitad que evita repetir el bug que este cambio arregla. Guardar el
 * nombre en la base no lo cambia en Discord; si el rechazo viviera nada más en
 * un toast, al recargar la pantalla volvería a decir que está guardado mientras
 * en el servidor sigue el nombre viejo. `bot_profile_error` sobrevive a la
 * recarga y la pantalla lo muestra hasta que se resuelva.
 *
 * El error se vuelve a lanzar: para el usuario esto **falló**, aunque la fila se
 * haya guardado. Lo que quería era ver el cambio en su servidor. Marcar el éxito
 * queda en manos de quien llama, que además tiene que guardar lo suyo.
 */
async function aplicarEnDiscord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  guildId: string,
  patch: { nick?: string | null; avatar?: string | null },
): Promise<void> {
  try {
    await applyGuildProfile(guildId, patch);
  } catch (error) {
    await supabase
      .from("discord_integrations")
      .update({
        bot_profile_error: actionErrorMessage(error),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);
    revalidatePath(paths.platform.integrationsDiscord);
    throw error;
  }
}

/** Lo que se escribe cuando Discord aceptó el cambio. */
function perfilAplicado(extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    bot_profile_applied_at: new Date().toISOString(),
    bot_profile_error: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * El nombre del bot, que ahora sí es el que Discord muestra.
 *
 * Antes esto sólo guardaba una fila que se usaba **dentro del texto** del saludo
 * ("Hola, soy X"): el nombre al lado del mensaje seguía siendo el de la
 * aplicación, igual para todos los clientes.
 */
export async function updateDiscordBotNameAction(
  botName: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const nick = botName.trim();
    if (!nick) throw new Error("El nombre no puede quedar vacío.");
    if (nick.length > MAX_NICKNAME_LENGTH) {
      throw new Error(
        `Discord no acepta nombres de más de ${MAX_NICKNAME_LENGTH} caracteres.`,
      );
    }

    const guildId = await requireConnectedGuild(supabase, organizationId);

    // Primero la intención, después la aplicación: si Discord rechaza, lo que
    // el usuario pidió queda guardado y el motivo del rechazo también.
    const { error } = await supabase
      .from("discord_integrations")
      .update({ bot_name: nick, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    await aplicarEnDiscord(supabase, organizationId, guildId, { nick });

    const { error: marcaError } = await supabase
      .from("discord_integrations")
      .update(perfilAplicado())
      .eq("organization_id", organizationId);
    if (marcaError) throw new Error(marcaError.message);

    revalidatePath(paths.platform.integrationsDiscord);
  });
}

const BOT_AVATAR_BUCKET = "discord-bot-avatars";

/**
 * Los tres paths que puede ocupar la foto de una organización.
 *
 * El nombre del archivo lleva la extensión, así que subir un JPG encima de un
 * PNG no lo pisa: deja el anterior colgado en el bucket y sin nadie que lo
 * referencie. Borrarlos todos antes de subir evita juntar basura.
 */
function pathsDeFoto(organizationId: string): string[] {
  return ["png", "jpg", "gif"].map((ext) => `${organizationId}/bot.${ext}`);
}

function extensionParaMime(mime: DiscordImageMimeType): string {
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/**
 * La foto del bot en el servidor de la organización.
 *
 * ⭐ Se aplica en Discord **antes** de subirla al bucket. Al revés, un rechazo
 * de Discord dejaría un archivo huérfano y una URL guardada que la pantalla
 * mostraría como si fuera la foto vigente. Así, lo que está guardado es siempre
 * lo que Discord aceptó.
 */
export async function updateDiscordBotAvatarAction(
  formData: FormData,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("No llegó ninguna imagen.");
    }
    if (
      !DISCORD_IMAGE_MIME_TYPES.includes(file.type as DiscordImageMimeType)
    ) {
      throw new Error(
        "Discord sólo acepta PNG, JPG o GIF para la foto del bot. WebP no sirve.",
      );
    }
    if (file.size > BOT_AVATAR_MAX_BYTES) {
      throw new Error("La imagen no puede superar 4 MB.");
    }

    const guildId = await requireConnectedGuild(supabase, organizationId);
    const mime = file.type as DiscordImageMimeType;
    const buffer = Buffer.from(await file.arrayBuffer());

    await aplicarEnDiscord(supabase, organizationId, guildId, {
      avatar: toImageDataUri(buffer, mime),
    });

    await supabase.storage.from(BOT_AVATAR_BUCKET).remove(pathsDeFoto(organizationId));

    const storagePath = `${organizationId}/bot.${extensionParaMime(mime)}`;
    const { error: uploadError } = await supabase.storage
      .from(BOT_AVATAR_BUCKET)
      .upload(storagePath, buffer, {
        upsert: true,
        contentType: mime,
        cacheControl: "3600",
      });

    if (uploadError) {
      throw new Error(
        uploadError.message.includes("Bucket not found")
          ? `La foto se aplicó en Discord pero no se pudo guardar la copia. ¿Existe el bucket "${BOT_AVATAR_BUCKET}"?`
          : uploadError.message,
      );
    }

    const { data: urlData } = supabase.storage
      .from(BOT_AVATAR_BUCKET)
      .getPublicUrl(storagePath);

    // El path se reescribe siempre igual, así que sin este sufijo el navegador
    // seguiría mostrando la foto anterior desde su caché.
    const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error } = await supabase
      .from("discord_integrations")
      .update(perfilAplicado({ bot_avatar_url: publicUrl }))
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

/** Vuelve a la foto de la aplicación, la misma para todos los servidores. */
export async function removeDiscordBotAvatarAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const guildId = await requireConnectedGuild(supabase, organizationId);

    await aplicarEnDiscord(supabase, organizationId, guildId, { avatar: null });

    await supabase.storage.from(BOT_AVATAR_BUCKET).remove(pathsDeFoto(organizationId));

    const { error } = await supabase
      .from("discord_integrations")
      .update(perfilAplicado({ bot_avatar_url: null }))
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

export async function updateDiscordAutoPatternAction(
  pattern: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { error } = await supabase
      .from("discord_integrations")
      .update({
        auto_monitor_pattern: pattern.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

/**
 * ⭐ Prender o apagar «el bot puede escribir en el servidor».
 *
 * Lo que cambia es sólo eso: el bot sigue leyendo los canales monitoreados,
 * midiendo silencio y proponiendo wins e hitos. Apagado, el saludo de un canal
 * nuevo no sale —el canal se agrega igual— y `!vincular` no contesta.
 */
export async function updateDiscordBotCanSpeakAction(
  canSpeak: boolean,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { error } = await supabase
      .from("discord_integrations")
      .update({
        bot_can_speak: canSpeak,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

// ─── Canales: de quién son y si ahí se buscan logros ────────────────────────

/**
 * ⭐ Recalcula de quién es cada mensaje del alcance indicado.
 *
 * Una sola rutina para los cuatro momentos en que la respuesta cambia: asignar
 * o sacar un cliente de un canal, y vincular o desvincular una persona.
 *
 * Se hace así y no con cuatro parches porque los parches se contradicen. El
 * caso que los rompe: un mensaje atribuido al dueño del canal cuyo autor se
 * vincula después a **otro** cliente. Un parche que sólo mire "mensajes sin
 * dueño" lo deja mal para siempre, y nadie lo va a notar — la ficha del cliente
 * equivocado simplemente muestra una conversación ajena.
 *
 * Recalcular desde cero la regla completa no puede quedar a mitad de camino.
 */
async function recalcularAtribucion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  alcance: { channelId?: string; discordUserId?: string },
) {
  const [{ data: links }, { data: duenos }, { data: equipo }] = await Promise.all([
    supabase
      .from("discord_client_links")
      .select("discord_user_id, client_id")
      .eq("organization_id", organizationId),
    supabase
      .from("discord_channel_clients")
      .select("channel_id, client_id")
      .eq("organization_id", organizationId),
    supabase
      .from("discord_team_members")
      .select("discord_user_id")
      .eq("organization_id", organizationId),
  ]);

  const delEquipo = new Set(
    (equipo ?? []).map((fila) => fila.discord_user_id as string),
  );

  const clientePorPersona = new Map<string, string>();
  for (const link of links ?? []) {
    clientePorPersona.set(link.discord_user_id, link.client_id);
  }

  const duenosPorCanal = new Map<string, string[]>();
  for (const fila of duenos ?? []) {
    const lista = duenosPorCanal.get(fila.channel_id) ?? [];
    lista.push(fila.client_id);
    duenosPorCanal.set(fila.channel_id, lista);
  }

  let query = supabase
    .from("discord_messages")
    .select("id, channel_id, discord_user_id, client_id, attributed_by")
    .eq("organization_id", organizationId);

  if (alcance.channelId) query = query.eq("channel_id", alcance.channelId);
  if (alcance.discordUserId) {
    query = query.eq("discord_user_id", alcance.discordUserId);
  }

  const { data: mensajes } = await query;

  for (const mensaje of mensajes ?? []) {
    /**
     * ⭐ El equipo corta antes que todo lo demás: lo que escribe el coach en el
     * canal de Juan no es actividad de Juan en ningún sentido. Misma regla que
     * `atribuirMensaje` en el bot, y por el mismo motivo.
     */
    const esEquipo = delEquipo.has(mensaje.discord_user_id);

    // El autor manda: es la única fuente que sabe **quién** escribió. El dueño
    // del canal es una deducción, y sólo sirve si el canal tiene uno solo.
    const porPersona = esEquipo
      ? null
      : (clientePorPersona.get(mensaje.discord_user_id) ?? null);
    const porCanal =
      esEquipo || porPersona
        ? null
        : clienteDelCanal(duenosPorCanal.get(mensaje.channel_id) ?? []);

    const clientId = porPersona ?? porCanal;
    const attributedBy = porPersona ? "person" : porCanal ? "channel" : null;

    if (
      mensaje.client_id === clientId &&
      mensaje.attributed_by === attributedBy
    ) {
      continue;
    }

    await supabase
      .from("discord_messages")
      .update({ client_id: clientId, attributed_by: attributedBy })
      .eq("id", mensaje.id);
  }
}

/** Cambia un canal entre «de un cliente» y «comunitario». */
export async function setDiscordChannelPurposeAction(
  channelId: string,
  purpose: ChannelPurpose,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const canales = await leerCanales(supabase, organizationId);

    const actualizados = canales.map((canal) =>
      canal.channel_id === channelId ? { ...canal, purpose } : canal,
    );

    await guardarCanales(supabase, organizationId, actualizados);

    /**
     * Pasar a comunitario saca a los dueños: un canal comunitario no atribuye
     * por canal, y dejar las filas guardadas haría que volvieran a aplicarse
     * solas si mañana se vuelve a marcar como de cliente — una atribución
     * fantasma que nadie eligió dos veces.
     */
    if (purpose === "community") {
      await supabase
        .from("discord_channel_clients")
        .delete()
        .eq("organization_id", organizationId)
        .eq("channel_id", channelId);

      await recalcularAtribucion(supabase, organizationId, { channelId });
    }

    revalidatePath(paths.platform.integrationsDiscord);
  });
}

/** Prende o apaga «acá se comparten logros» en un canal. */
export async function setDiscordChannelWinsAction(
  channelId: string,
  wins: boolean,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const canales = await leerCanales(supabase, organizationId);

    await guardarCanales(
      supabase,
      organizationId,
      canales.map((canal) =>
        canal.channel_id === channelId ? { ...canal, wins } : canal,
      ),
    );

    revalidatePath(paths.platform.integrationsDiscord);
  });
}

/** Suma un cliente como dueño de un canal. */
export async function addDiscordChannelClientAction(
  channelId: string,
  clientId: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("discord_channel_clients")
      .upsert(
        { organization_id: organizationId, channel_id: channelId, client_id: clientId },
        { onConflict: "organization_id,channel_id,client_id" },
      );

    if (error) throw new Error(error.message);

    await recalcularAtribucion(supabase, organizationId, { channelId });
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

/** Saca un cliente de un canal. */
export async function removeDiscordChannelClientAction(
  channelId: string,
  clientId: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("discord_channel_clients")
      .delete()
      .eq("organization_id", organizationId)
      .eq("channel_id", channelId)
      .eq("client_id", clientId);

    if (error) throw new Error(error.message);

    await recalcularAtribucion(supabase, organizationId, { channelId });
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

/**
 * Vincula una persona de Discord a un cliente desde la lista del canal.
 *
 * Es el mismo vínculo que crea `!vincular`, hecho desde la pantalla y sin que el
 * cliente tenga que escribir nada. Ésta es la vía que resuelve el caso real:
 * gente que ya escribió en un canal comunitario y que nadie va a lograr que
 * escriba un comando.
 */
export async function linkDiscordPersonAction(
  discordUserId: string,
  clientId: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    // El nombre sale de sus propios mensajes: es el dato más fresco que hay, y
    // evita pedirle a Discord algo que ya está guardado.
    const { data: ultimo } = await supabase
      .from("discord_messages")
      .select("discord_username, discord_display_name")
      .eq("organization_id", organizationId)
      .eq("discord_user_id", discordUserId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("discord_client_links").upsert(
      {
        organization_id: organizationId,
        client_id: clientId,
        discord_user_id: discordUserId,
        discord_username: ultimo?.discord_username ?? null,
        discord_display_name: ultimo?.discord_display_name ?? null,
        link_method: "manual",
        link_confidence: 1,
      },
      { onConflict: "organization_id,discord_user_id" },
    );

    if (error) throw new Error(error.message);

    // Una vinculación pendiente de esta misma persona ya no tiene sentido.
    await supabase
      .from("discord_pending_links")
      .update({ status: "resolved" })
      .eq("organization_id", organizationId)
      .eq("discord_user_id", discordUserId);

    // Nadie es cliente y equipo a la vez: si estaba marcado como equipo, esto
    // es una corrección y la marca vieja se va.
    await supabase
      .from("discord_team_members")
      .delete()
      .eq("organization_id", organizationId)
      .eq("discord_user_id", discordUserId);

    await recalcularAtribucion(supabase, organizationId, { discordUserId });
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

/**
 * ⭐ Marca a una persona de Discord como gente del equipo, no cliente.
 *
 * @param profileId A quién del equipo corresponde. `null` es legítimo: alguien
 *   que labura con vos y no tiene cuenta en Limitless —un editor, un
 *   asistente— igual tiene que poder marcarse, o sus mensajes siguen
 *   contándose como actividad de un cliente.
 */
export async function markDiscordPersonAsTeamAction(
  discordUserId: string,
  profileId: string | null,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    if (profileId) {
      // Que el perfil sea de esta organización no lo garantiza el `upsert`: sin
      // esto, un id de otra organización entraría y la pantalla mostraría un
      // nombre vacío sin decir por qué.
      const { data: perfil } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", profileId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (!perfil) throw new Error("Esa persona no es de tu equipo.");
    }

    const { data: ultimo } = await supabase
      .from("discord_messages")
      .select("discord_username, discord_display_name")
      .eq("organization_id", organizationId)
      .eq("discord_user_id", discordUserId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("discord_team_members").upsert(
      {
        organization_id: organizationId,
        discord_user_id: discordUserId,
        profile_id: profileId,
        discord_username: ultimo?.discord_username ?? null,
        discord_display_name: ultimo?.discord_display_name ?? null,
      },
      { onConflict: "organization_id,discord_user_id" },
    );

    if (error) throw new Error(error.message);

    // Nadie es cliente y equipo a la vez.
    await supabase
      .from("discord_client_links")
      .delete()
      .eq("organization_id", organizationId)
      .eq("discord_user_id", discordUserId);

    await supabase
      .from("discord_pending_links")
      .update({ status: "resolved" })
      .eq("organization_id", organizationId)
      .eq("discord_user_id", discordUserId);

    await recalcularAtribucion(supabase, organizationId, { discordUserId });
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

/**
 * Deja a una persona sin definir: ni cliente ni equipo.
 *
 * Borra las dos marcas aunque en teoría no puedan coexistir: es un botón de
 * "volver atrás", y uno que dejara la mitad sería peor que no tenerlo.
 */
export async function unlinkDiscordPersonAction(
  discordUserId: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const [{ error: errorCliente }, { error: errorEquipo }] = await Promise.all([
      supabase
        .from("discord_client_links")
        .delete()
        .eq("organization_id", organizationId)
        .eq("discord_user_id", discordUserId),
      supabase
        .from("discord_team_members")
        .delete()
        .eq("organization_id", organizationId)
        .eq("discord_user_id", discordUserId),
    ]);

    if (errorCliente) throw new Error(errorCliente.message);
    if (errorEquipo) throw new Error(errorEquipo.message);

    await recalcularAtribucion(supabase, organizationId, { discordUserId });
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

async function leerCanales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<MonitoredChannel[]> {
  const { data } = await supabase
    .from("discord_integrations")
    .select("monitored_channels")
    .eq("organization_id", organizationId)
    .maybeSingle();

  return normalizarCanales(data?.monitored_channels);
}

async function guardarCanales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  canales: MonitoredChannel[],
) {
  const { error } = await supabase
    .from("discord_integrations")
    .update({
      monitored_channels: canales,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
}

export type DiscordChannelOption = DiscordGuildChannel & {
  /** Ya está en la lista de monitoreados. */
  monitored: boolean;
};

/**
 * Canales del servidor conectado, marcando cuáles ya se monitorean.
 *
 * Se pide a Discord en el momento y no se guarda: la lista de canales de un
 * servidor cambia todo el tiempo, y una copia vieja ofrecería canales borrados.
 */
export async function listDiscordGuildChannelsAction(): Promise<
  { ok: true; channels: DiscordChannelOption[] } | { ok: false; error: string }
> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: integration } = await supabase
      .from("discord_integrations")
      .select("guild_id, monitored_channels")
      .eq("organization_id", organizationId)
      .eq("status", "connected")
      .maybeSingle();

    if (!integration?.guild_id) {
      return {
        ok: false,
        error: "No hay ningún servidor de Discord conectado.",
      };
    }

    const monitored = new Set(
      ((integration.monitored_channels as MonitoredChannel[]) ?? []).map(
        (channel) => channel.channel_id,
      ),
    );

    const channels = await listGuildTextChannels(
      integration.guild_id as string,
    );

    return {
      ok: true,
      channels: channels.map((channel) => ({
        ...channel,
        monitored: monitored.has(channel.id),
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron traer los canales.",
    };
  }
}

/**
 * Suma un canal existente a la lista de monitoreados.
 *
 * Antes esto no se podía: un canal sólo entraba si lo **creaba** alguien
 * después de configurar el patrón de detección automática. En un servidor que ya
 * existía —que es el caso normal— no había forma de monitorear nada.
 *
 * El nombre del canal se resuelve contra Discord y no se acepta del cliente: es
 * lo que después se muestra en la pantalla, y de paso valida que el canal exista
 * de verdad en ese servidor.
 */
export async function addDiscordMonitoredChannelAction(
  channelId: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: integration } = await supabase
      .from("discord_integrations")
      .select("guild_id, monitored_channels")
      .eq("organization_id", organizationId)
      .eq("status", "connected")
      .maybeSingle();

    if (!integration?.guild_id) throw new Error("Integración no encontrada");

    const channels =
      (integration.monitored_channels as MonitoredChannel[]) ?? [];
    if (channels.some((channel) => channel.channel_id === channelId)) return;

    const guildChannels = await listGuildTextChannels(
      integration.guild_id as string,
    );
    const channel = guildChannels.find((c) => c.id === channelId);
    if (!channel) {
      throw new Error("Ese canal no existe en el servidor conectado.");
    }

    const updated: MonitoredChannel[] = [
      ...channels,
      {
        channel_id: channel.id,
        channel_name: channel.name,
        /**
         * ⭐ Nace comunitario, que es el valor que **no atribuye nada**.
         *
         * Elegirlo de cliente por defecto repartiría los mensajes del canal
         * entre alguien que el usuario todavía no eligió. El default correcto
         * de una decisión que no se tomó es el que no hace nada.
         */
        purpose: "community",
        wins: sugerirWins(channel.name),
        added_at: new Date().toISOString(),
      },
    ];

    const { error } = await supabase
      .from("discord_integrations")
      .update({
        monitored_channels: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

/**
 * Deja de monitorear un canal.
 *
 * ⭐ También suelta a sus dueños y recalcula.
 *
 * Los mensajes ya guardados se quedan —pasaron, y borrarlos de la ficha del
 * cliente sería perder historia—, pero **atribuidos a nadie por canal**: sin
 * esto, un canal que se deja de leer y se vuelve a agregar mañana arrancaría
 * comunitario mientras sus mensajes viejos siguen contados para el dueño de
 * antes. Media ficha diciendo una cosa y media otra, sin nada que lo explique.
 */
export async function removeDiscordMonitoredChannelAction(
  channelId: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: integration } = await supabase
      .from("discord_integrations")
      .select("monitored_channels")
      .eq("organization_id", organizationId)
      .single();

    if (!integration) throw new Error("Integración no encontrada");

    const channels =
      (integration.monitored_channels as MonitoredChannel[]) ?? [];
    const updated = channels.filter((c) => c.channel_id !== channelId);

    const { error } = await supabase
      .from("discord_integrations")
      .update({
        monitored_channels: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);

    await supabase
      .from("discord_channel_clients")
      .delete()
      .eq("organization_id", organizationId)
      .eq("channel_id", channelId);

    await recalcularAtribucion(supabase, organizationId, { channelId });
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

export async function linkDiscordClientManuallyAction(
  pendingLinkId: string,
  clientId: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: pending } = await supabase
      .from("discord_pending_links")
      .select("*")
      .eq("id", pendingLinkId)
      .eq("organization_id", organizationId)
      .single();

    if (!pending) throw new Error("Vinculación pendiente no encontrada");

    const { error: linkError } = await supabase
      .from("discord_client_links")
      .upsert(
        {
          organization_id: organizationId,
          client_id: clientId,
          discord_user_id: pending.discord_user_id,
          discord_username: pending.discord_username,
          discord_display_name: pending.discord_display_name,
          link_method: "manual",
          link_confidence: 1,
        },
        { onConflict: "organization_id,discord_user_id" },
      );

    if (linkError) throw new Error(linkError.message);

    await supabase
      .from("discord_pending_links")
      .update({ status: "resolved" })
      .eq("id", pendingLinkId);

    revalidatePath(paths.platform.integrationsDiscord);
  });
}

export async function dismissDiscordPendingLinkAction(
  pendingLinkId: string,
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("discord_pending_links")
      .update({ status: "ignored" })
      .eq("id", pendingLinkId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

export async function disconnectDiscordIntegrationAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const supabase = await createClient();

    const { error } = await supabase
      .from("discord_integrations")
      .update({
        status: "disconnected",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
    revalidatePath(paths.platform.integrationsDiscord);
  });
}

export async function getClientDiscordActivityAction(
  clientId: string,
): Promise<{
  link: DiscordClientLink | null;
  messages: DiscordMessage[];
}> {
  if (!isSupabaseConfigured()) {
    return { link: null, messages: [] };
  }

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data: link } = await supabase
    .from("discord_client_links")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .maybeSingle();

  const { data: messages } = await supabase
    .from("discord_messages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("sent_at", { ascending: false })
    .limit(20);

  return {
    link: (link as DiscordClientLink | null) ?? null,
    messages: (messages as DiscordMessage[]) ?? [],
  };
}

// ─── D2 · Actividad y silencio ──────────────────────────────────────────────

/**
 * Resumen de actividad de todos los clientes vinculados, en una sola consulta.
 *
 * Es la conexión de mayor valor y la más barata del bot: no necesita IA, sale de
 * contar filas que el bot ya guarda. Se usa en la lista de clientes, así que
 * pedir el detalle de cada uno por separado no serviría.
 */
export async function getClientsDiscordActivityAction(): Promise<
  Record<string, ClientActivity>
> {
  try {
    if (!isSupabaseConfigured()) return {};
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("discord_messages")
      .select("client_id, sent_at, is_testimonial, attributed_by")
      .eq("organization_id", organizationId)
      .not("client_id", "is", null)
      // Más de 90 días atrás no cambia ninguna de las señales que se muestran.
      .gte(
        "sent_at",
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      );

    if (error) return {};

    return summarizeByClient(
      (
        data as {
          client_id: string | null;
          sent_at: string;
          is_testimonial: boolean;
          attributed_by: "person" | "channel" | null;
        }[]
      ).map((row) => ({
        clientId: row.client_id,
        sentAt: row.sent_at,
        isTestimonial: row.is_testimonial,
        attributedBy: row.attributed_by,
      })),
    );
  } catch {
    return {};
  }
}

// ─── D3 · Clasificación por lote ────────────────────────────────────────────

/**
 * Clasifica los mensajes que todavía no se clasificaron.
 *
 * Llena `ai_sentiment`, `ai_summary` y `requires_attention` —las tres columnas
 * que existían desde el día uno y nadie llenaba— y **corrige** `is_testimonial`,
 * que el bot sólo puede pre-filtrar por palabras.
 *
 * Por lote: una llamada cada 25 mensajes. El costo por mensaje no cerraría.
 */
export async function classifyDiscordMessagesAction(
  limit = CLASSIFY_RUN_LIMIT,
): Promise<MutationResult<{ clasificados: number; testimonios: number }>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const { clasificados, testimonios } = await classifyDiscordMessagesForOrg(
      organizationId,
      { limit },
    );

    revalidatePath(paths.platform.clients.root);
    return { clasificados, testimonios };
  });
}

// ─── D3 · Los candidatos, todos juntos ──────────────────────────────────────

export type WinCandidate = {
  messageId: string;
  clientId: string;
  clientName: string;
  content: string;
  aiSummary: string | null;
  channelName: string | null;
  sentAt: string;
};

/**
 * ⭐ Los testimonios que todavía no se convirtieron en win, de todos los clientes.
 *
 * La ficha de cada cliente ya los mostraba, pero de a uno: había que entrar a
 * cada cliente para descubrir si tenía algo. Esto es la misma información
 * puesta donde se trabaja con los wins — que es donde alguien se va a acordar
 * de mirarla.
 */
export async function listWinCandidatesAction(): Promise<WinCandidate[]> {
  try {
    if (!isSupabaseConfigured()) return [];
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const [messagesResult, winsResult] = await Promise.all([
      supabase
        .from("discord_messages")
        .select(
          "id, content, ai_summary, channel_name, sent_at, client_id, discord_message_id, clients(name)",
        )
        .eq("organization_id", organizationId)
        .eq("is_testimonial", true)
        .not("client_id", "is", null)
        .order("sent_at", { ascending: false })
        .limit(100),
      supabase
        .from("client_wins")
        .select("source_ref")
        .eq("organization_id", organizationId)
        .eq("source", "discord"),
    ]);

    if (messagesResult.error) return [];

    // Los que ya se convirtieron no vuelven a ofrecerse.
    const yaUsados = new Set(
      ((winsResult.data as { source_ref: string | null }[]) ?? [])
        .map((row) => row.source_ref)
        .filter((ref): ref is string => Boolean(ref)),
    );

    type Row = {
      id: string;
      content: string | null;
      ai_summary: string | null;
      channel_name: string | null;
      sent_at: string;
      client_id: string | null;
      discord_message_id: string;
      clients: { name: string } | { name: string }[] | null;
    };

    return ((messagesResult.data as Row[]) ?? [])
      .filter(
        (row) =>
          row.client_id &&
          row.content?.trim() &&
          !yaUsados.has(row.discord_message_id),
      )
      .map((row) => {
        const cliente = Array.isArray(row.clients)
          ? row.clients[0]
          : row.clients;
        return {
          messageId: row.id,
          clientId: row.client_id!,
          clientName: cliente?.name ?? "Cliente",
          content: row.content ?? "",
          aiSummary: row.ai_summary,
          channelName: row.channel_name,
          sentAt: row.sent_at,
        };
      });
  } catch {
    return [];
  }
}

/**
 * "Esto no era un testimonio."
 *
 * ⭐ No hace falta una columna nueva para descartarlo: se corrige la marca que
 * puso el clasificador, que es exactamente lo que la persona está diciendo. Y
 * la corrección vale también en la ficha del cliente, donde el mensaje deja de
 * aparecer resaltado.
 */
export async function dismissWinCandidateAction(
  messageId: string,
): Promise<MutationResult<void>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("discord_messages")
      .update({ is_testimonial: false })
      .eq("id", messageId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.clients.wins);
  });
}

// ─── D3 · Testimonio → candidato a win ──────────────────────────────────────

/**
 * Convierte un testimonio de Discord en un win del tracker (Encargo A).
 *
 * ⭐ **Lo acepta una persona.** El bot y el clasificador producen candidatos; un
 * win es una afirmación sobre el negocio de un cliente y no la hace un
 * heurístico. Por eso esto es una acción explícita y no un efecto del clasificador.
 *
 * El win queda con `source = 'discord'` y `source_ref` apuntando al mensaje, así
 * siempre se puede volver al original.
 */
export async function createWinFromTestimonialAction(
  messageId: string,
): Promise<MutationResult<{ winId: string }>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: message, error } = await supabase
      .from("discord_messages")
      .select("id, client_id, content, ai_summary, sent_at, discord_message_id")
      .eq("id", messageId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!message) throw new Error("El mensaje no existe");

    const row = message as {
      id: string;
      client_id: string | null;
      content: string;
      ai_summary: string | null;
      sent_at: string;
      discord_message_id: string;
    };

    // Sin cliente vinculado no hay a quién atribuirle el win. Vincularlo primero
    // es parte del flujo del bot.
    if (!row.client_id) {
      throw new Error(
        "Este mensaje no está vinculado a ningún cliente. Vinculá el usuario de Discord primero.",
      );
    }

    // Un mismo mensaje no puede generar dos wins.
    const { data: existing } = await supabase
      .from("client_wins")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("source", "discord")
      .eq("source_ref", row.discord_message_id)
      .maybeSingle();

    if (existing) throw new Error("Este testimonio ya se convirtió en un win.");

    // El resumen de la IA si existe; si no, el mensaje. Nunca se inventa el logro.
    const achievement = (row.ai_summary?.trim() || row.content.trim()).slice(
      0,
      500,
    );

    const { data: win, error: insertError } = await supabase
      .from("client_wins")
      .insert({
        organization_id: organizationId,
        client_id: row.client_id,
        win_date: row.sent_at.slice(0, 10),
        achievement,
        source: "discord",
        source_ref: row.discord_message_id,
        notes: row.ai_summary ? row.content.slice(0, 2000) : null,
      })
      .select("id")
      .single();

    if (insertError) throw new Error(insertError.message);

    revalidatePath(paths.platform.clients.wins);
    revalidatePath(paths.platform.clients.detail(row.client_id));
    return { winId: (win as { id: string }).id };
  });
}
