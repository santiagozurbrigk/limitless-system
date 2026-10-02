"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input } from "@ai-coo/ui";
import {
  Bell,
  Building2,
  CreditCard,
  Globe,
  Lock,
  Palette,
  User,
} from "lucide-react";
import {
  saveGeneralOrganizationSettingsAction,
  updateNotificationPreferencesAction,
  type NotificationPreferences,
} from "@/app/settings/actions";
import { updateProfileAction } from "@/app/profile/actions";
import { ClaudeApiKeySettings } from "./claude-api-key-settings";
import { useToast } from "@/providers/toast-provider";
import { es } from "@/lib/locale/es";
import { formatRelativeTime } from "@/lib/format";
import type { SettingsInitialData } from "@/lib/settings/initial-data";
import { UNIPILE_PROXY_COUNTRY_OPTIONS } from "@/lib/unipile/proxy-countries";
import { FieldLabel } from "./field-label";
import { SwitchRow } from "@/components/shared/switch-row";
import { SectionHeader } from "@ai-coo/ui";
import { SettingsFormActions } from "./settings-form-actions";
import {
  SettingsTabNav,
  type SettingsTabId,
} from "./settings-tab-nav";
import { SignOutButton } from "./sign-out-button";
import { ChangePasswordSection } from "@/components/settings/change-password-section";
import { PaymentPlatformsSettingsSection } from "./payment-platforms-settings-section";
import {
  CURRENCY_OPTIONS,
  LANGUAGE_OPTIONS,
  TIMEZONE_OPTIONS,
} from "@/constants/organization-options";
import { CloserCalendlySettings } from "./closer-calendly-settings";
import { ThemeSelector } from "./theme-selector";
import { brandColors } from "@/lib/brand";
import { ESCONDIDO } from "@/lib/release/escondido";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}


const SETTINGS_TABS: SettingsTabId[] = [
  "general",
  "perfil",
  "notificaciones",
  "ia",
  "seguridad",
  "pagos",
  "closer-calendly",
].filter(
  // `?tab=notificaciones` cae en General mientras la pestaña está escondida.
  (tab) => !(tab === "notificaciones" && ESCONDIDO.ajustesNotificaciones)
) as SettingsTabId[];

function resolveSettingsTab(
  tab: string | null,
  isFounder: boolean,
  isCloser: boolean
): SettingsTabId {
  if (tab === "pagos" && isFounder) return "pagos";
  if (tab === "closer-calendly" && isCloser) return "closer-calendly";
  if (tab && SETTINGS_TABS.includes(tab as SettingsTabId)) {
    return tab as SettingsTabId;
  }
  return "general";
}

export function SettingsForm({
  initialData,
}: {
  initialData: SettingsInitialData;
}) {
  const { push } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(() =>
    resolveSettingsTab(searchParams.get("tab"), initialData.isFounder, initialData.isCloser)
  );

  const [orgName, setOrgName] = useState(initialData.orgName);
  const [industry, setIndustry] = useState(initialData.industry);
  const [websiteUrl, setWebsiteUrl] = useState(initialData.websiteUrl);
  const [timezone, setTimezone] = useState(initialData.timezone);
  const [currency, setCurrency] = useState(initialData.currency);
  const [language, setLanguage] = useState(initialData.language);
  const [country, setCountry] = useState(initialData.country);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [displayName, setDisplayName] = useState(initialData.displayName);
  const [email, setEmail] = useState(initialData.email);
  const [avatarUrl, setAvatarUrl] = useState(initialData.avatarUrl);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [savingProfile, startProfileSave] = useTransition();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [notifications, setNotifications] = useState<NotificationPreferences>(
    initialData.notificationPreferences
  );
  const [savingNotification, startNotificationSave] = useTransition();

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const resetForm = () => {
    setOrgName(initialData.orgName);
    setIndustry(initialData.industry);
    setWebsiteUrl(initialData.websiteUrl);
    setTimezone(initialData.timezone);
    setCurrency(initialData.currency);
    setLanguage(initialData.language);
    setCountry(initialData.country);
    setSaveError(null);
    setDisplayName(initialData.displayName);
    setEmail(initialData.email);
    setAvatarUrl(initialData.avatarUrl);
    setAvatarFile(null);
    setProfileSaveError(null);
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl(null);
    setNotifications(initialData.notificationPreferences);
  };

  const handleAvatarSelect = (file: File | null) => {
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    if (!file) {
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
      return;
    }
    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  };

  const handleProfileSave = () => {
    setProfileSaveError(null);
    startProfileSave(async () => {
      const formData = new FormData();
      formData.set("fullName", displayName.trim());
      formData.set("email", email.trim());
      if (avatarFile) {
        formData.set("avatar", avatarFile);
      }

      const result = await updateProfileAction(formData);
      if (result.success) {
        setDisplayName(result.data.fullName);
        setEmail(result.data.email);
        setAvatarUrl(result.data.avatarUrl);
        setAvatarFile(null);
        if (avatarPreviewUrl) {
          URL.revokeObjectURL(avatarPreviewUrl);
        }
        setAvatarPreviewUrl(null);
        push({
          title: "Perfil actualizado",
          description: "Tus datos se guardaron correctamente.",
          variant: "success",
        });
        router.refresh();
      } else {
        setProfileSaveError(result.error);
        push({
          title: "No se guardó el perfil",
          description: result.error,
        });
      }
    });
  };

  const handleSave = () => {
    setSaveError(null);
    startSave(async () => {
      const result = await saveGeneralOrganizationSettingsAction({
        orgName,
        industry,
        websiteUrl,
        timezone,
        currency,
        language,
        country,
      });
      if (result.success) {
        push({
          title: es.flow.settingsSaved,
          description: es.flow.settingsSavedDesc,
          variant: "success",
        });
      } else {
        setSaveError(result.error);
        push({
          title: "No se guardaron los cambios",
          description: result.error,
        });
      }
    });
  };

  const handleNotificationChange = (
    key: keyof NotificationPreferences,
    checked: boolean
  ) => {
    const next = { ...notifications, [key]: checked };
    setNotifications(next);
    startNotificationSave(async () => {
      const result = await updateNotificationPreferencesAction({ [key]: checked });
      if (result.success) {
        push({
          title: "Preferencias guardadas",
          variant: "success",
        });
      } else {
        setNotifications(notifications);
        push({
          title: "No se guardaron las preferencias",
          description: result.error,
        });
      }
    });
  };

  const lastAccessLabel = initialData.lastSignInAt
    ? formatRelativeTime(initialData.lastSignInAt)
    : "hace unos minutos";

  return (
    <div className="max-w-2xl space-y-8">
      <SettingsTabNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showPaymentsTab={initialData.isFounder}
        showCloserCalendlyTab={initialData.isCloser}
      />

      {activeTab === "general" && (
        <div className="space-y-8 pt-2">
          <section>
            <SectionHeader icon={Building2} title="Organización" variant="settings" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="org-name">Nombre de la empresa</FieldLabel>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="industry">Industria</FieldLabel>
                <Input
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <FieldLabel htmlFor="timezone">Zona horaria</FieldLabel>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="currency">Moneda</FieldLabel>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="language">Idioma</FieldLabel>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="country">País</FieldLabel>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Sin seleccionar</option>
                  {UNIPILE_PROXY_COUNTRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Usado para el proxy al conectar Instagram DMs o WhatsApp vía
                  Unipile.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-1.5">
              <label
                htmlFor="website-url"
                className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                URL de tu sitio web / landing
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="website-url"
                  placeholder="https://tudominio.com"
                  className="pl-9"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Se usa como base para generar tus links de UTM en Marketing. Si
                no la configurás, los links van a apuntar a
                optimizatucontrol.com.
              </p>
            </div>
            {saveError ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                {saveError}
              </p>
            ) : null}
          </section>

          <section>
            <SectionHeader icon={Palette} title="Apariencia" variant="settings" />
            <ThemeSelector />
          </section>

          <SettingsFormActions
            onSave={handleSave}
            onCancel={resetForm}
            isPending={saving}
          />
        </div>
      )}

      {activeTab === "perfil" && (
        <div className="space-y-8 pt-2">
          <section>
            <SectionHeader icon={User} title="Perfil" variant="settings" />
            <div className="mb-6 flex items-center gap-4">
              {avatarPreviewUrl || avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreviewUrl ?? avatarUrl ?? ""}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-brand-500/20"
                />
              ) : (
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
                  style={{ backgroundColor: brandColors.primary }}
                >
                  {getInitials(displayName)}
                </div>
              )}
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {displayName}
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG o JPG · mín. 400×400px · máx. 5 MB
                </p>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    handleAvatarSelect(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={savingProfile}
                >
                  Subir foto
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="display-name">
                  Nombre para mostrar
                </FieldLabel>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            {profileSaveError ? (
              <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">
                {profileSaveError}
              </p>
            ) : null}
          </section>

          <SettingsFormActions
            onSave={handleProfileSave}
            onCancel={resetForm}
            isPending={savingProfile}
          />
        </div>
      )}

      {activeTab === "notificaciones" && (
        <div className="pt-2">
          <SectionHeader icon={Bell} title="Notificaciones" variant="settings" />
          <p className="mb-4 text-xs text-muted-foreground">
            Email
          </p>
          <SwitchRow
            label="Reporte semanal listo"
            description="Recibís un email cuando el reporte operacional esté generado"
            checked={notifications.emailWeeklyReport}
            disabled={savingNotification}
            onChange={(checked) =>
              handleNotificationChange("emailWeeklyReport", checked)
            }
          />
          <SwitchRow
            label="Nueva conversación"
            description="Cuando llega un lead nuevo al inbox de ventas"
            checked={notifications.emailNewConversation}
            disabled={savingNotification}
            onChange={(checked) =>
              handleNotificationChange("emailNewConversation", checked)
            }
          />
          <SwitchRow
            label="Booking confirmado"
            description="Cuando se confirma una llamada de cierre"
            checked={notifications.emailBookingConfirmed}
            disabled={savingNotification}
            onChange={(checked) =>
              handleNotificationChange("emailBookingConfirmed", checked)
            }
          />
          <SwitchRow
            label="Venta cerrada"
            description="Cuando se registra un cierre en Closing"
            checked={notifications.emailSaleClosed}
            disabled={savingNotification}
            onChange={(checked) =>
              handleNotificationChange("emailSaleClosed", checked)
            }
          />
          <SwitchRow
            label="Sugerencia de SOP"
            description="Cuando la IA sugiere un nuevo procedimiento"
            checked={notifications.emailSopSuggestion}
            disabled={savingNotification}
            onChange={(checked) =>
              handleNotificationChange("emailSopSuggestion", checked)
            }
          />
          <p className="mb-4 mt-6 text-xs text-muted-foreground">
            En la app
          </p>
          <SwitchRow
            label="Nueva conversación"
            description="Alerta en tiempo real en el inbox"
            checked={notifications.inappNewConversation}
            disabled={savingNotification}
            onChange={(checked) =>
              handleNotificationChange("inappNewConversation", checked)
            }
          />
          <SwitchRow
            label="Booking confirmado"
            description="Notificación al agendar una llamada"
            checked={notifications.inappBookingConfirmed}
            disabled={savingNotification}
            onChange={(checked) =>
              handleNotificationChange("inappBookingConfirmed", checked)
            }
          />
          <SwitchRow
            label="Venta cerrada"
            description="Cuando un closer marca un cierre"
            checked={notifications.inappSaleClosed}
            disabled={savingNotification}
            onChange={(checked) =>
              handleNotificationChange("inappSaleClosed", checked)
            }
          />
          <SwitchRow
            label="Alerta de ghosting"
            description="Cuando un lead deja de responder"
            checked={notifications.inappGhostingAlert}
            disabled={savingNotification}
            onChange={(checked) =>
              handleNotificationChange("inappGhostingAlert", checked)
            }
          />
        </div>
      )}

      {activeTab === "ia" && (
        <div className="space-y-8 pt-2">
          <ClaudeApiKeySettings initialStatus={initialData.claudeApiKeyStatus} />
        </div>
      )}

      {activeTab === "pagos" && initialData.isFounder && (
        <div className="space-y-8 pt-2">
          <section>
            <SectionHeader
              icon={CreditCard}
              title="Cobros"
              variant="settings"
            />
            <PaymentPlatformsSettingsSection />
          </section>
        </div>
      )}

      {activeTab === "closer-calendly" && initialData.isCloser && (
        <div className="space-y-6 pt-2">
          <CloserCalendlySettings />
        </div>
      )}

      {activeTab === "seguridad" && (
        <div className="space-y-8 pt-2">
          <section>
            <SectionHeader icon={Lock} title="Sesión activa" variant="settings" />
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/40 px-4 py-4 dark:border-glass dark:bg-glass dark:backdrop-blur-md">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  Sesión activa
                </p>
                <p className="text-xs text-muted-foreground">
                  {email} · último acceso {lastAccessLabel}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Activa
              </span>
            </div>
          </section>

          <ChangePasswordSection email={email} />

          <section className="border-t border-red-500/20 pt-8">
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-red-500">
              Zona de peligro
            </p>
            <SignOutButton variant="danger" />
          </section>
        </div>
      )}
    </div>
  );
}
