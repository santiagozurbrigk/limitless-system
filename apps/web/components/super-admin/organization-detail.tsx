"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Textarea } from "@ai-coo/ui";
import { useToast } from "@/providers/toast-provider";
import { SparklineChart } from "@/components/charts/platform";
import { paths } from "@/routes";
import {
  addOrganizationNoteAction,
  regenerateTempPasswordAction,
  setOrganizationStatusAction,
  updateOrganizationMrrAction,
  updateOrgAddOnsAction,
} from "@/app/super-admin/actions";
import {
  deleteOrganizationAction,
  previewOrganizationDeletionAction,
} from "@/app/super-admin/delete-actions";
import { DeletionDialog } from "@/components/super-admin/deletion-dialog";
import { ADD_ON_IDS } from "@/lib/auth/add-on-ids";
import { TempCredentialsDialog } from "@/components/shared/temp-credentials-dialog";
import type { TempCredentials } from "@/lib/auth/temp-credentials";
import { formatUsd, formatUsdPrecise } from "@/lib/super-admin/org-metrics";
import type { ClientHealthTimelineItem } from "@/lib/super-admin/client-health";
import { formatOrgDateTime } from "@/lib/super-admin/format-org-datetime";
import type { AdminOrganizationDetail } from "@/types/super-admin";
import {
  ETIQUETA_DE_ESTADO_DE_ORG,
  VARIANTE_DE_ESTADO_DE_ORG,
  accionDeEstado,
} from "@/lib/super-admin/estado-de-org";
import { OrgClientHealthSection } from "@/components/super-admin/org-client-health-section";

function formatDate(iso: string | null, timezone: string | null): string {
  return formatOrgDateTime(iso, timezone, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function onboardingField(data: Record<string, unknown> | null, key: string): string {
  if (!data) return "—";
  const v = data[key];
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function OrganizationDetailView({
  detail,
  clientHealth = [],
}: {
  detail: AdminOrganizationDetail;
  clientHealth?: ClientHealthTimelineItem[];
}) {
  const [note, setNote] = useState("");
  const [mrrInput, setMrrInput] = useState(String(detail.mrrUsd));
  const [activeAddOns, setActiveAddOns] = useState<string[]>(detail.enabledAddOns ?? []);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tempCredentials, setTempCredentials] = useState<TempCredentials | null>(
    null
  );
  const [regeneratingUserId, setRegeneratingUserId] = useState<string | null>(
    null
  );
  const [eliminando, setEliminando] = useState(false);
  const router = useRouter();
  const { push } = useToast();

  const PLAN_LABEL: Record<string, string> = {
    starter: "Starter",
    growth: "Growth",
    enterprise: "Enterprise",
  };

  const tokenSpark = detail.tokenUsage.daily.map((d) => d.costUsd);
  // Con estado desconocido no hay botón: pausar o activar sería engañoso.
  const accionEstado = accionDeEstado(detail.status);

  function runAction(fn: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      setMessage(res.success ? null : res.error ?? "Error");
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{detail.name}</h2>
          <p className="text-sm text-muted-foreground">{detail.founder.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={VARIANTE_DE_ESTADO_DE_ORG[detail.status]}>
              {ETIQUETA_DE_ESTADO_DE_ORG[detail.status]}
            </Badge>
            <Badge variant="outline">{PLAN_LABEL[detail.plan] ?? detail.plan}</Badge>
            <span className="text-xs text-muted-foreground">
              Inicio: {formatDate(detail.createdAt, detail.timezone)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {accionEstado && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                runAction(() =>
                  setOrganizationStatusAction(detail.id, accionEstado.activar)
                )
              }
            >
              {accionEstado.etiqueta}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              push({
                title: "Organización reseteada",
                description: "Mock — datos de prueba restaurados.",
                variant: "success",
              })
            }
          >
            Resetear
          </Button>
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={pending}
            onClick={() => setEliminando(true)}
          >
            Eliminar
          </Button>
        </div>
      </div>

      <DeletionDialog
        open={eliminando}
        onOpenChange={setEliminando}
        titulo={`Eliminar ${detail.name}`}
        cargarVistaPrevia={() => previewOrganizationDeletionAction(detail.id)}
        ejecutar={(confirmacion) =>
          deleteOrganizationAction({ organizationId: detail.id, confirmacion })
        }
        onEliminado={() => {
          // Esta pantalla ya no tiene qué mostrar: la organización no existe.
          push({ title: "Organización eliminada", variant: "success" });
          router.push(paths.superAdmin.organizations);
        }}
      />

      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}

      <section className="rounded-xl border border-border/60 p-6">
        <h3 className="text-sm font-semibold">Resumen del negocio</h3>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Tipo de negocio</dt>
            <dd className="text-sm">
              {onboardingField(detail.onboarding, "businessType")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rango de revenue</dt>
            <dd className="text-sm">
              {onboardingField(detail.onboarding, "revenueRange")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tamaño del equipo</dt>
            <dd className="text-sm">
              {onboardingField(detail.onboarding, "teamSize")}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Desafíos</dt>
            <dd className="text-sm">
              {onboardingField(detail.onboarding, "challenges")}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border/60 p-6">
        <h3 className="text-sm font-semibold">Métricas del mes</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Conversaciones" value={String(detail.metrics.conversationsThisMonth)} />
          <Metric label="Deals cerrados" value={String(detail.metrics.dealsClosedThisMonth)} />
          <Metric
            label="Facturación"
            value={formatUsd(detail.metrics.billingThisMonth)}
          />
          <Metric
            label="Cash collected"
            value={formatUsd(detail.metrics.cashCollectedThisMonth)}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border/60 p-6">
        <h3 className="text-sm font-semibold">MRR (USD)</h3>
        <div className="mt-3 flex max-w-xs flex-wrap gap-2">
          <Input
            type="number"
            min={0}
            step={0.01}
            value={mrrInput}
            onChange={(e) => setMrrInput(e.target.value)}
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              runAction(() =>
                updateOrganizationMrrAction(
                  detail.id,
                  Number.parseFloat(mrrInput) || 0
                )
              )
            }
          >
            Guardar MRR
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 p-6">
        <h3 className="text-sm font-semibold">Módulos add-on</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Activa o desactiva módulos adicionales para esta organización. Los cambios toman efecto en el próximo inicio de sesión del usuario.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {ADD_ON_IDS.map((addOnId) => {
            const enabled = activeAddOns.includes(addOnId);
            return (
              <button
                key={addOnId}
                type="button"
                disabled={pending}
                onClick={() => {
                  const next = enabled
                    ? activeAddOns.filter((a) => a !== addOnId)
                    : [...activeAddOns, addOnId];
                  setActiveAddOns(next);
                  runAction(() => updateOrgAddOnsAction(detail.id, next));
                }}
                className={[
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  enabled
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  pending ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                {addOnId}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border/60 p-6 dark:border-white/[0.08]">
        <h3 className="text-sm font-semibold">Usuarios</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4">Nombre</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Rol</th>
                <th className="pb-2 pr-4">Último login</th>
                <th className="pb-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {detail.users.map((user) => (
                <tr key={user.id} className="border-t border-border/40">
                  <td className="py-2 pr-4 font-medium">{user.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{user.email}</td>
                  <td className="py-2 pr-4 capitalize">{user.role}</td>
                  <td className="py-2 text-muted-foreground">
                    {formatDate(user.lastLogin, detail.timezone)}
                  </td>
                  <td className="py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={regeneratingUserId === user.id}
                      onClick={async () => {
                        setRegeneratingUserId(user.id);
                        const res = await regenerateTempPasswordAction(user.id);
                        setRegeneratingUserId(null);
                        if (res.success) {
                          setTempCredentials(res.data);
                        } else {
                          push({
                            title: "No se pudo regenerar",
                            description: res.error,
                          });
                        }
                      }}
                    >
                      Regenerar contraseña
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 p-6 dark:border-white/[0.08]">
        <h3 className="text-sm font-semibold">Integraciones activas</h3>
        <ul className="mt-4 space-y-2">
          {detail.integrations.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"
            >
              <span>{i.name}</span>
              <Badge variant={i.connected ? "success" : "secondary"}>
                {i.connected ? "Conectado" : i.detail ?? "No conectado"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <OrgClientHealthSection
        orgName={detail.name}
        timezone={detail.timezone}
        clients={clientHealth}
      />

      <section className="rounded-xl border border-border/60 p-6">
        <h3 className="text-sm font-semibold">Notas internas</h3>
        <div className="mt-4 space-y-3">
          {detail.notes.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin notas aún.</p>
          )}
          {detail.notes.map((n) => (
            <div
              key={n.id}
              className="rounded-lg border border-border/40 bg-muted/20 p-3 text-sm"
            >
              <p>{n.note}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {n.created_by ?? "—"} · {formatDate(n.created_at, detail.timezone)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <Textarea
            placeholder="Nueva nota…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <Button
            size="sm"
            disabled={pending || !note.trim()}
            onClick={() => {
              runAction(async () => {
                const res = await addOrganizationNoteAction(detail.id, note);
                if (res.success) setNote("");
                return res;
              });
            }}
          >
            Agregar nota
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 p-6 dark:border-white/[0.08]">
        <h3 className="text-sm font-semibold">Uso de IA (mes)</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Costo total: {formatUsdPrecise(detail.aiCost.totalUsd)}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CostItem label="Claude Haiku" value={detail.aiCost.haikuUsd} />
          <CostItem label="Claude Sonnet" value={detail.aiCost.sonnetUsd} />
          <CostItem label="Claude Opus" value={detail.aiCost.opusUsd} />
          <CostItem label="Embeddings" value={detail.aiCost.embeddingsUsd} />
          <CostItem label="Storage" value={detail.aiCost.storageUsd} />
          <CostItem label="Infraestructura" value={detail.aiCost.infrastructureUsd} />
        </dl>
        {tokenSpark.length > 0 && (
          <div className="mt-4 h-16 w-full max-w-md">
            <SparklineChart data={tokenSpark} color="hsl(var(--primary))" />
          </div>
        )}
      </section>

      <Button asChild variant="outline" size="sm">
        <Link href={paths.superAdmin.organizations}>← Volver al listado</Link>
      </Button>

      {tempCredentials ? (
        <TempCredentialsDialog
          open
          email={tempCredentials.email}
          tempPassword={tempCredentials.tempPassword}
          onClose={() => setTempCredentials(null)}
        />
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CostItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/20 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">
        {formatUsdPrecise(value)}
      </dd>
    </div>
  );
}
