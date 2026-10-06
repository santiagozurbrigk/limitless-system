"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  GlassPanel,
  Input,
} from "@ai-coo/ui";
import { PageHeader } from "@/components/shared/page-header";
import { useFinanceData } from "@/providers";
import { getTeamMembersAction } from "@/app/team/actions";
import { TeamPayrollSection } from "@/components/finance/team-payroll-section";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion } from "@/lib/client/correr-accion";
import { formatMoney, monthlyEquivalent } from "@/lib/finance/format";
import type {
  CommissionBasis,
  ExpenseCategory,
  FixedExpense,
  Subscription,
  TeamCompensation,
} from "@/types/expenses";

const selectClass =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  infrastructure: "Infraestructura",
  professional: "Servicios profesionales",
  marketing: "Marketing",
  tools: "Herramientas y software",
  other: "Otro",
};

const SUB_SUGGESTIONS = [
  "Notion",
  "Slack",
  "Zoom",
  "Fathom",
  "Loom",
  "Airtable",
  "Make",
  "Google Workspace",
  "Calendly",
  "Este software",
];

export function ExpensesOverview() {
  const {
    expensesSummary,
    fixedExpenses,
    subscriptions,
    teamCompensation,
  } = useFinanceData();
  const s = expensesSummary;

  const fixedTotal = fixedExpenses.reduce(
    (sum, e) => sum + monthlyEquivalent(e.amount, e.frequency),
    0
  );
  const subsTotal = subscriptions.reduce(
    (sum, sub) => sum + monthlyEquivalent(sub.amount, sub.billingCycle),
    0
  );

  return (
    <div className="space-y-8">
      <PageHeader description="Configura gastos fijos, suscripciones y compensación del equipo — alimentan Cash Collected en Finanzas" />

      <GlassPanel className="p-6">
        <p className="text-sm text-muted-foreground">Total gastos este mes</p>
        <p className="text-3xl font-semibold mt-1 tabular-nums">
          {formatMoney(s.totalMonthly)}
        </p>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Gastos fijos" value={formatMoney(s.fixedMonthly)} />
          <Row label="Suscripciones" value={formatMoney(s.subscriptionsMonthly)} />
          <Row label="Equipo (fijos)" value={formatMoney(s.teamFixedMonthly)} />
          <Row
            label="Equipo (comisiones)"
            value={formatMoney(s.teamCommissionsMonthly)}
          />
        </div>
        <div className="border-t border-border mt-4 pt-3 flex justify-between font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(s.totalMonthly)}</span>
        </div>
      </GlassPanel>

      <TeamPayrollSection />

      <FixedExpensesSection
        expenses={fixedExpenses}
        totalMonthly={fixedTotal}
      />
      <SubscriptionsSection subscriptions={subscriptions} totalMonthly={subsTotal} />
      <TeamCompensationSection members={teamCompensation} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function FixedExpensesSection({
  expenses,
  totalMonthly,
}: {
  expenses: FixedExpense[];
  totalMonthly: number;
}) {
  const { addFixedExpense, updateFixedExpense, removeFixedExpense } = useFinanceData();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FixedExpense | null>(null);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Gastos fijos"
        summary={`Total gastos fijos al mes: ${formatMoney(totalMonthly)}`}
        onAdd={() => setOpen(true)}
      />
      <ExpenseTable
        columns={["Nombre", "Categoría", "Monto", "Frecuencia", "Equiv. mensual", "Estado", ""]}
        rows={expenses.map((e) => [
          e.name,
          CATEGORY_LABEL[e.category],
          formatMoney(e.amount, e.currency),
          e.frequency === "monthly" ? "Mensual" : "Anual",
          formatMoney(monthlyEquivalent(e.amount, e.frequency), e.currency),
          e.status === "active" ? (
            <Badge variant="success">Activo</Badge>
          ) : (
            <Badge variant="secondary">Pausado</Badge>
          ),
          <ActionButtons
            key={e.id}
            onEdit={() => setEditing(e)}
            onDelete={() => {
              void removeFixedExpense(e.id).then((err) => {
                if (err) push({ title: "No se pudo eliminar", description: err });
              });
            }}
          />,
        ])}
      />
      <FixedExpenseModal
        open={open || editing !== null}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false);
            setEditing(null);
          }
        }}
        title={editing ? "Editar gasto fijo" : "Añadir gasto fijo"}
        initial={editing ?? undefined}
        onSave={(data) => {
          const done = (err?: string) => {
            if (err) {
              push({ title: "No se pudo guardar", description: err });
              return;
            }
            setOpen(false);
            setEditing(null);
          };
          if (editing) {
            void updateFixedExpense(editing.id, data).then(done);
          } else {
            void addFixedExpense(data).then(done);
          }
        }}
      />
    </section>
  );
}

function SubscriptionsSection({
  subscriptions,
  totalMonthly,
}: {
  subscriptions: Subscription[];
  totalMonthly: number;
}) {
  const { addSubscription, updateSubscription, removeSubscription } = useFinanceData();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Suscripciones"
        summary={`Total suscripciones al mes: ${formatMoney(totalMonthly)}`}
        onAdd={() => setOpen(true)}
      />
      <ExpenseTable
        columns={["Herramienta", "Monto", "Ciclo", "Equiv. mensual", ""]}
        rows={subscriptions.map((sub) => [
          <span key={sub.id} className="font-medium">
            {sub.name}
          </span>,
          formatMoney(sub.amount, sub.currency),
          sub.billingCycle === "monthly" ? "Mensual" : "Anual",
          formatMoney(monthlyEquivalent(sub.amount, sub.billingCycle), sub.currency),
          <ActionButtons
            key={sub.id}
            onEdit={() => setEditing(sub)}
            onDelete={() => {
              void removeSubscription(sub.id).then((err) => {
                if (err) push({ title: "No se pudo eliminar", description: err });
              });
            }}
          />,
        ])}
      />
      <SubscriptionModal
        open={open || editing !== null}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false);
            setEditing(null);
          }
        }}
        title={editing ? "Editar suscripción" : "Añadir suscripción"}
        initial={editing ?? undefined}
        onSave={(data) => {
          const done = (err?: string) => {
            if (err) {
              push({ title: "No se pudo guardar", description: err });
              return;
            }
            setOpen(false);
            setEditing(null);
          };
          if (editing) {
            void updateSubscription(editing.id, data).then(done);
          } else {
            void addSubscription(data).then(done);
          }
        }}
      />
    </section>
  );
}

function TeamCompensationSection({ members }: { members: TeamCompensation[] }) {
  const { updateTeamCompensation, addTeamCompensation, removeTeamCompensation } =
    useFinanceData();
  const { push } = useToast();
  const [editing, setEditing] = useState<TeamCompensation | null>(null);
  const [adding, setAdding] = useState(false);
  const fixedTotal = members.reduce(
    (s, m) => s + (m.hasFixed ? m.fixedMonthly ?? 0 : 0),
    0
  );
  const commTotal = members.reduce(
    (s, m) => s + (m.hasCommission ? m.estimatedThisMonth - (m.fixedMonthly ?? 0) : 0),
    0
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Gastos de equipo</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Total costo equipo este mes: {formatMoney(fixedTotal + commTotal)} · Fijos:{" "}
            {formatMoney(fixedTotal)} · Comisiones (desde deals cerrados):{" "}
            {formatMoney(commTotal)}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
        >
          + Añadir miembro
        </Button>
      </div>
      <div className="space-y-3">
        {members.map((m) => (
          <GlassPanel key={m.id} className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold">
              {m.memberName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{m.memberName}</p>
              <p className="text-xs text-muted-foreground">{m.roleLabel}</p>
            </div>
            <Badge variant="outline">
              {m.hasFixed && m.hasCommission
                ? "Fijo + Comisión"
                : m.hasFixed
                  ? "Fijo"
                  : "Comisión"}
            </Badge>
            {m.hasFixed && (
              <p className="text-sm tabular-nums">
                Fijo: {formatMoney(m.fixedMonthly ?? 0)}/mes
              </p>
            )}
            {m.commissionSummary && (
              <p className="text-xs text-muted-foreground">{m.commissionSummary}</p>
            )}
            <p className="text-sm font-semibold tabular-nums ml-auto">
              Est. mes: {formatMoney(m.estimatedThisMonth)}
            </p>
            <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                void removeTeamCompensation(m.id).then((err) => {
                  if (err) {
                    push({ title: "No se pudo eliminar", description: err });
                  }
                });
              }}
            >
              Eliminar
            </Button>
          </GlassPanel>
        ))}
      </div>
      <TeamCompensationModal
        open={adding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
        mode={adding ? "create" : "edit"}
        initial={editing ?? undefined}
        onSave={(patch) => {
          if (adding) {
            if (!patch.memberName?.trim() || !patch.roleLabel?.trim()) return;
            void addTeamCompensation({
              // El id del perfil cuando se eligió de la lista; sintético sólo
              // para quien no tiene usuario en la plataforma.
              memberId: patch.memberId ?? `member-${Date.now()}`,
              memberName: patch.memberName.trim(),
              roleLabel: patch.roleLabel.trim(),
              hasFixed: patch.hasFixed ?? false,
              fixedMonthly: patch.fixedMonthly,
              hasCommission: patch.hasCommission ?? false,
              commissionPercent: patch.commissionPercent,
              commissionBasis: patch.commissionBasis,
              commissionSummary: patch.commissionSummary,
              notes: patch.notes,
            }).then((err) => {
              if (err) {
                push({ title: "No se pudo crear", description: err });
                return;
              }
              setAdding(false);
            });
            return;
          }
          if (!editing) return;
          void updateTeamCompensation(editing.id, patch).then((err) => {
            if (err) {
              push({ title: "No se pudo guardar", description: err });
              return;
            }
            setEditing(null);
          });
        }}
      />
    </section>
  );
}

function SectionHeader({
  title,
  summary,
  onAdd,
}: {
  title: string;
  summary: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{summary}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onAdd}>
        + Añadir
      </Button>
    </div>
  );
}

function ExpenseTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {columns.map((c) => (
              <th key={c} className="px-4 py-3">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionButtons({
  onEdit,
  onDelete,
}: {
  onEdit?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={onEdit}>
        Editar
      </Button>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
        Eliminar
      </Button>
    </div>
  );
}

function FixedExpenseModal({
  open,
  onOpenChange,
  onSave,
  initial,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (e: Omit<FixedExpense, "id">) => void;
  initial?: FixedExpense;
  title: string;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("other");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "annual">("monthly");
  const [status, setStatus] = useState<"active" | "paused">("active");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNameError(null);
    if (initial) {
      setName(initial.name);
      setCategory(initial.category);
      setAmount(String(initial.amount));
      setFrequency(initial.frequency);
      setStatus(initial.status);
    } else {
      setName("");
      setCategory("other");
      setAmount("");
      setFrequency("monthly");
      setStatus("active");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogDescription className="sr-only">
            Formulario para registrar un gasto fijo recurrente.
          </DialogDescription>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <FormField label="Nombre" required error={nameError ?? undefined}>
            <Input value={name} onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }} />
          </FormField>
          <FormField label="Categoría">
            <select
              className={selectClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Monto (USD)">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Frecuencia">
            <select
              className={selectClass}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            >
              <option value="monthly">Mensual</option>
              <option value="annual">Anual</option>
            </select>
          </FormField>
          <FormField label="Estado">
            <select
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="active">Activo</option>
              <option value="paused">Pausado</option>
            </select>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              const trimmed = name.trim();
              if (!trimmed) {
                setNameError("El nombre es obligatorio");
                return;
              }
              onSave({
                name: trimmed,
                category,
                amount: Number(amount) || 0,
                currency: initial?.currency ?? "USD",
                frequency,
                status,
              });
            }}
          >
            Guardar gasto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubscriptionModal({
  open,
  onOpenChange,
  onSave,
  initial,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (s: Omit<Subscription, "id">) => void;
  initial?: Subscription;
  title: string;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNameError(null);
    if (initial) {
      setName(initial.name);
      setAmount(String(initial.amount));
      setBillingCycle(initial.billingCycle);
    } else {
      setName("");
      setAmount("");
      setBillingCycle("monthly");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogDescription className="sr-only">
            Formulario para registrar una suscripción de software o servicio.
          </DialogDescription>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <FormField label="Nombre" required error={nameError ?? undefined}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {SUB_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="text-xs rounded border px-2 py-0.5 hover:bg-muted"
                  onClick={() => setName(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Monto">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Ciclo de facturación">
            <select
              className={selectClass}
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value as typeof billingCycle)}
            >
              <option value="monthly">Mensual</option>
              <option value="annual">Anual</option>
            </select>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              const trimmed = name.trim();
              if (!trimmed) {
                setNameError("El nombre es obligatorio");
                return;
              }
              onSave({
                name: trimmed,
                amount: Number(amount) || 0,
                currency: initial?.currency ?? "USD",
                billingCycle,
                icon: initial?.icon,
              });
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COMMISSION_BASIS_LABEL: Record<CommissionBasis, string> = {
  per_deal: "% por deal cerrado (closer)",
  monthly_revenue: "% sobre MRR total (CSM)",
  upsells: "% sobre clientes nuevos (CSM/ventas)",
  per_booking: "Monto fijo por llamada agendada (setter)",
  custom: "Estimación manual",
};

function TeamCompensationModal({
  open,
  onOpenChange,
  onSave,
  initial,
  mode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (patch: Partial<TeamCompensation>) => void;
  initial?: TeamCompensation;
  mode: "create" | "edit";
}) {
  const [memberName, setMemberName] = useState("");
  /**
   * ⭐ A quién se le paga, elegido de una lista y no tipeado.
   *
   * El nombre no era una etiqueta: era la clave con la que se cruzan las
   * comisiones. Un espacio de más o un acento distinto daba comisión cero, en
   * silencio, hasta que alguien reclamaba su plata.
   *
   * `""` significa "otro": alguien que cobra y no tiene usuario en la
   * plataforma —un editor freelance— existe, y obligarlo a tener cuenta sería
   * peor que dejar el nombre libre para ese caso.
   */
  const [memberId, setMemberId] = useState<string>("");
  const [equipo, setEquipo] = useState<{ id: string; name: string }[]>([]);
  const { push } = useToast();
  const [roleLabel, setRoleLabel] = useState("");
  const [hasFixed, setHasFixed] = useState(false);
  const [fixedMonthly, setFixedMonthly] = useState("");
  const [hasCommission, setHasCommission] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState("");
  const [commissionFixedPerEvent, setCommissionFixedPerEvent] = useState("");
  const [commissionBasis, setCommissionBasis] = useState<CommissionBasis>("per_deal");
  const [commissionSummary, setCommissionSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Sin la lista se puede seguir con "otro" y el nombre libre; se avisa
    // para que no parezca que el equipo está vacío.
    void correrMutacion({
      accion: () => getTeamMembersAction(),
      alExito: (miembros) =>
        setEquipo(miembros.map((m) => ({ id: m.id, name: m.name }))),
      avisar: push,
      tituloError: "No se pudo cargar el equipo",
      etiqueta: "[TeamCompensationModal] cargar equipo",
    });
  }, [open, push]);

  useEffect(() => {
    if (!open) return;
    setNameError(null);
    setRoleError(null);
    if (mode === "edit" && initial) {
      setMemberName(initial.memberName);
      // Los ids viejos eran sintéticos (`member-1699...`), no de un perfil real.
      setMemberId(initial.memberId?.startsWith("member-") ? "" : (initial.memberId ?? ""));
      setRoleLabel(initial.roleLabel);
      setHasFixed(initial.hasFixed);
      setFixedMonthly(initial.fixedMonthly != null ? String(initial.fixedMonthly) : "");
      setHasCommission(initial.hasCommission);
      setCommissionPercent(
        initial.commissionPercent != null ? String(initial.commissionPercent) : ""
      );
      setCommissionFixedPerEvent(
        initial.commissionFixedPerEvent != null ? String(initial.commissionFixedPerEvent) : ""
      );
      setCommissionBasis(initial.commissionBasis ?? "per_deal");
      setCommissionSummary(initial.commissionSummary ?? "");
      setNotes(initial.notes ?? "");
      return;
    }
    setMemberName("");
    setMemberId("");
    setRoleLabel("");
    setHasFixed(false);
    setFixedMonthly("");
    setHasCommission(false);
    setCommissionPercent("");
    setCommissionFixedPerEvent("");
    setCommissionBasis("per_deal");
    setCommissionSummary("");
    setNotes("");
  }, [open, initial, mode]);

  const handleSave = () => {
    const trimmedName = memberName.trim();
    const trimmedRole = roleLabel.trim();
    let hasError = false;
    if (!trimmedName) {
      setNameError("El nombre es obligatorio");
      hasError = true;
    }
    if (!trimmedRole) {
      setRoleError("El rol es obligatorio");
      hasError = true;
    }
    if (hasError) return;

    onSave({
      memberId: memberId || undefined,
      memberName: trimmedName,
      roleLabel: trimmedRole,
      hasFixed,
      fixedMonthly: hasFixed ? Number(fixedMonthly) || 0 : undefined,
      hasCommission,
      commissionPercent: hasCommission && commissionBasis !== "per_booking"
        ? Number(commissionPercent) || 0
        : undefined,
      commissionFixedPerEvent: hasCommission && commissionBasis === "per_booking"
        ? Number(commissionFixedPerEvent) || 0
        : undefined,
      commissionBasis: hasCommission ? commissionBasis : undefined,
      commissionSummary: commissionSummary.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogDescription className="sr-only">
            {mode === "create"
              ? "Formulario para añadir un miembro al equipo."
              : "Editar compensación del miembro del equipo."}
          </DialogDescription>
          <DialogTitle>
            {mode === "create"
              ? "Añadir miembro al equipo"
              : `Editar compensación — ${initial?.memberName ?? ""}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          <FormField label="Miembro" required error={nameError ?? undefined}>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={memberId}
              onChange={(e) => {
                const elegido = e.target.value;
                setMemberId(elegido);
                const miembro = equipo.find((m) => m.id === elegido);
                if (miembro) setMemberName(miembro.name);
                if (nameError) setNameError(null);
              }}
            >
              <option value="">Otro — escribir el nombre</option>
              {equipo.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {/*
              Sólo se escribe a mano cuando la persona no está en la plataforma.
              Con un miembro elegido, el nombre sale de su perfil y no se puede
              desincronizar.
            */}
            {memberId === "" ? (
              <Input
                className="mt-2"
                placeholder="Nombre de quien cobra"
                value={memberName}
                onChange={(e) => {
                  setMemberName(e.target.value);
                  if (nameError) setNameError(null);
                }}
              />
            ) : null}
          </FormField>
          <FormField label="Rol" required error={roleError ?? undefined}>
            <Input
              value={roleLabel}
              onChange={(e) => {
                setRoleLabel(e.target.value);
                if (roleError) setRoleError(null);
              }}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasFixed}
              onChange={(e) => setHasFixed(e.target.checked)}
            />
            Salario fijo mensual
          </label>
          {hasFixed && (
            <FormField label="Monto fijo (USD/mes)">
              <Input
                type="number"
                value={fixedMonthly}
                onChange={(e) => setFixedMonthly(e.target.value)}
              />
            </FormField>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasCommission}
              onChange={(e) => setHasCommission(e.target.checked)}
            />
            Comisión
          </label>
          {hasCommission && (
            <>
              <FormField label="Base de comisión">
                <select
                  className={selectClass}
                  value={commissionBasis}
                  onChange={(e) =>
                    setCommissionBasis(e.target.value as CommissionBasis)
                  }
                >
                  {Object.entries(COMMISSION_BASIS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>

              {commissionBasis === "per_booking" ? (
                <FormField label="Monto fijo por llamada agendada (USD)">
                  <Input
                    type="number"
                    placeholder="Ej: 50"
                    value={commissionFixedPerEvent}
                    onChange={(e) => setCommissionFixedPerEvent(e.target.value)}
                  />
                </FormField>
              ) : commissionBasis !== "custom" ? (
                <FormField label="Porcentaje (%)">
                  <Input
                    type="number"
                    placeholder="Ej: 10"
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(e.target.value)}
                  />
                </FormField>
              ) : null}

              <FormField label="Nota (opcional)">
                <Input
                  value={commissionSummary}
                  placeholder="Ej: 10% sobre revenue de deals cerrados"
                  onChange={(e) => setCommissionSummary(e.target.value)}
                />
              </FormField>
            </>
          )}
          <FormField label="Notas">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <p className="text-xs text-muted-foreground">
            La estimación del mes se calcula automáticamente desde los deals cerrados en
            Closing (nombre del closer debe coincidir).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            {mode === "create" ? "Añadir miembro" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
