"use client";

/**
 * C0 · Pantalla de configuración de columnas.
 *
 * Es la que convierte "hay que hacer una migración" en "hay que abrir una
 * pantalla". Tres solapas —Wins, Checkpoints y Clientes—, porque una columna
 * pertenece a una entidad y nunca a las dos.
 *
 * Las solapas salen de `FIELD_ENTITIES`: una entidad nueva aparece sola, sin
 * tocar esta pantalla.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Badge,
  Button,
  GlassPanel,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@ai-coo/ui";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Layers,
  Pencil,
  Plus,
  SlidersHorizontal,
  Table2,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import { PageHeader } from "@/components/shared/page-header";
import { useToast } from "@/providers/toast-provider";
import { useHasAddOn } from "@/providers/permissions-provider";
import type { MutationResult } from "@/lib/server/action-result";
import { correrMutacion, leerConMotivo, type Aviso } from "@/lib/client/correr-accion";
import {
  FIELD_ENTITIES,
  FIELD_SECTION_LABEL,
  type FieldDefinition,
  type FieldEntity,
} from "@/types/custom-fields";
import {
  FIELD_ENTITY_HINT,
  FIELD_ENTITY_LABEL,
  FIELD_TYPE_LABEL,
  fieldOptionColorVar,
  fieldTypeUsesOptions,
} from "@/lib/custom-fields";
import {
  createFieldDefinitionAction,
  deleteFieldDefinitionAction,
  getCustomFieldsPageDataAction,
  reorderFieldDefinitionsAction,
  seedExampleClientGoalFieldAction,
  seedExampleWinFieldAction,
  seedLimitlessClientFieldsAction,
  seedOnboardingQuestionsAction,
  setFieldDefinitionArchivedAction,
  updateFieldDefinitionAction,
} from "@/app/clients/custom-field-actions";
import {
  getClientSilenceDaysAction,
  setClientSilenceDaysAction,
} from "@/app/clients/signals-actions";
import {
  FieldDefinitionDialog,
  type FieldDefinitionDraft,
} from "@/components/clients/custom-fields/field-definition-dialog";

/**
 * Qué decir cuando una entidad no tiene ninguna columna todavía.
 *
 * Por entidad y no un texto genérico: "creá la primera columna" no explica para
 * qué sirve, y un estado vacío que no dice qué se gana es un estado vacío que
 * nadie completa.
 */
const EMPTY_HINT: Record<FieldEntity, string> = {
  win: "Creá la primera, o empezá con una propuesta de ejemplo que después vas a poder cambiar.",
  checkpoint: "Creá la primera columna: es lo que se va a pedir al registrar un checkpoint.",
  client:
    "Creá la primera columna de la ficha del cliente. Es donde vive el objetivo con el que entró, y se ve en la tabla de clientes.",
};

/**
 * Las entidades que ofrecen un punto de partida cargado.
 *
 * Checkpoints no tiene: sus métricas dependen del recorrido de cada negocio, así
 * que cualquier ejemplo sería ruido que después hay que borrar.
 */
const SEED: Partial<
  Record<FieldEntity, { label: string; action: () => Promise<MutationResult<unknown>> }>
> = {
  win: { label: 'Cargar "Tipo de win" de ejemplo', action: seedExampleWinFieldAction },
  client: {
    label: 'Cargar "Objetivo general" de ejemplo',
    action: seedExampleClientGoalFieldAction,
  },
};

/**
 * Vuelve a leer las columnas después de un cambio (SCRUM-517). Si no se pudo,
 * avisa el motivo (o el texto fijo si la acción lanzó) y devuelve `null`: la
 * pantalla se queda con lo que ya mostraba. Antes, una falla dejaba la lista
 * vacía, como si se hubieran borrado todas.
 */
export async function recargarColumnas(
  avisar: (aviso: Aviso) => void
): Promise<FieldDefinition[] | null> {
  const lectura = await leerConMotivo(
    getCustomFieldsPageDataAction,
    "[CustomFieldsPage] recargar"
  );
  if (!lectura.ok) {
    avisar({ title: "No se pudieron actualizar las columnas", description: lectura.motivo });
    return null;
  }
  return lectura.data.fields;
}

/**
 * Un cambio de las columnas desde un botón (SCRUM-517): el motivo de un
 * rechazo se avisa con `tituloError`; si la acción lanzó, el texto fijo. Con
 * éxito, `alExito` con el dato.
 */
export function cambiarColumnas<T>(
  accion: () => Promise<MutationResult<T>>,
  avisar: (aviso: Aviso) => void,
  tituloError: string,
  alExito: (data: T) => void | Promise<void>
): Promise<void> {
  return correrMutacion({
    accion,
    alExito,
    avisar,
    tituloError,
    etiqueta: "[CustomFieldsPage] cambio",
  });
}

/**
 * Lee el umbral de "sin novedades" (SCRUM-517): el dato o el motivo. Antes una
 * falla escondía el aviso entero sin decir nada.
 */
export function cargarDiasSinNovedades() {
  return leerConMotivo(getClientSilenceDaysAction, "[CustomFieldsPage] días sin novedades");
}

export function CustomFieldsPage({
  initialFields,
  canManage,
}: {
  initialFields: FieldDefinition[];
  canManage: boolean;
}) {
  const { push } = useToast();
  /** La plantilla de Marketing, Ventas y Sistemas es del add-on `growth_partners`. */
  const growthPartners = useHasAddOn("growth_partners");
  const [fields, setFields] = useState(initialFields);
  const [entity, setEntity] = useState<FieldEntity>("win");
  const [editing, setEditing] = useState<FieldDefinition | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byEntity = useMemo(
    () => fields.filter((field) => field.entity === entity),
    [fields, entity]
  );

  async function refresh() {
    const next = await recargarColumnas(push);
    if (next) setFields(next);
  }

  function run(operation: () => Promise<MutationResult<unknown>>) {
    startTransition(() => cambiarColumnas(operation, push, "No se pudo guardar", refresh));
  }

  function openCreate() {
    setEditing(null);
    setDialogError(null);
    setDialogOpen(true);
  }

  /** Carga una plantilla de campos y cuenta cuántos entraron. */
  function sembrar(
    action: () => Promise<MutationResult<{ created: number; skipped: number }>>
  ) {
    startTransition(() =>
      cambiarColumnas(action, push, "No se pudo cargar", async (data) => {
        await refresh();
        push({
          title:
            data.created === 0 ? "Ya estaban todos cargados" : `${data.created} campos cargados`,
          description:
            data.skipped > 0 ? `${data.skipped} ya existían y se saltearon.` : undefined,
          variant: "success",
        });
      })
    );
  }

  function openEdit(field: FieldDefinition) {
    setEditing(field);
    setDialogError(null);
    setDialogOpen(true);
  }

  function submitDialog(draft: FieldDefinitionDraft) {
    setDialogError(null);
    startTransition(async () => {
      const payload = {
        label: draft.label,
        description: draft.description.trim() || null,
        options: draft.options,
        unit: draft.unit.trim() || null,
        currency: draft.currency,
        // Vacío = sin aviso. Un cero tipeado también: un umbral de cero días
        // no es un aviso, es una fecha que siempre está en alerta.
        alertDaysBefore: Number(draft.alertDaysBefore) > 0
          ? Number(draft.alertDaysBefore)
          : null,
        isRequired: draft.isRequired,
        // Sólo la ficha del cliente tiene apartados y tabla; para las otras
        // entidades el diálogo no los ofrece y viajan en su valor neutro.
        section: draft.section,
        showInTable: draft.showInTable,
        // Sólo se pregunta un campo con apartado: sin él no hay dónde mostrar
        // la respuesta.
        onboarding:
          draft.inOnboarding && draft.section !== null
            ? {
                step: draft.onboardingStep,
                question: draft.onboardingQuestion.trim() || null,
                required: draft.onboardingRequired,
              }
            : null,
      };

      // Si la acción lanzó, el diálogo muestra el texto fijo (SCRUM-517).
      const result = await leerConMotivo(
        () =>
          editing
            ? updateFieldDefinitionAction({ id: editing.id, ...payload })
            : createFieldDefinitionAction({
                entity,
                fieldType: draft.fieldType,
                ...payload,
              }),
        "[CustomFieldsPage] guardar columna"
      );

      if (!result.ok) {
        setDialogError(result.motivo);
        return;
      }

      setDialogOpen(false);
      await refresh();
      push({
        title: editing ? "Columna actualizada" : "Columna creada",
        variant: "success",
      });
    });
  }

  function move(field: FieldDefinition, direction: -1 | 1) {
    const ordered = byEntity.map((entry) => entry.id);
    const from = ordered.indexOf(field.id);
    const to = from + direction;
    if (to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to] as string, ordered[from] as string];
    run(() => reorderFieldDefinitionsAction(entity, ordered));
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* El título ya lo pone el topbar: acá va sólo la bajada (ver PageHeader). */}
      <PageHeader
        description="Las columnas del tracker de wins y las métricas que se piden al registrar un checkpoint. Se definen acá, sin tocar código."
        actions={
          canManage ? (
            <Button onClick={openCreate} disabled={pending}>
              <Plus className="mr-1 h-4 w-4" />
              Nueva columna
            </Button>
          ) : undefined
        }
      />

      {!canManage ? (
        <GlassPanel className="p-4 text-sm text-muted-foreground">
          Solo el founder puede cambiar esta configuración. Podés ver cómo está armada.
        </GlassPanel>
      ) : null}

      <Tabs value={entity} onValueChange={(value) => setEntity(value as FieldEntity)}>
        <TabsList>
          {FIELD_ENTITIES.map((key) => (
            <TabsTrigger key={key} value={key}>
              {FIELD_ENTITY_LABEL[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        {FIELD_ENTITIES.map((key) => (
          <TabsContent key={key} value={key} className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">{FIELD_ENTITY_HINT[key]}</p>

            {/*
              ⭐ La plantilla de los tres apartados.
              Los 22 campos de Marketing, Ventas y Sistemas no están escritos en
              el código de la ficha: se cargan desde acá con un botón. Así
              renombrar «Método único» o agregar un sistema más es una edición,
              no un deploy. Vuelve a apretarse sin miedo: las que ya existen se
              saltean.
            */}
            {key === "client" && canManage && growthPartners ? (
              <GlassPanel className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Plantilla Limitless</p>
                  <p className="text-xs text-muted-foreground">
                    Carga los campos de Marketing, Ventas y Sistemas que usa la
                    ficha del cliente. Los que ya existen no se duplican.
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => sembrar(seedLimitlessClientFieldsAction)}
                >
                  <Layers className="mr-1 h-4 w-4" />
                  Cargar plantilla
                </Button>
              </GlassPanel>
            ) : null}

            {/*
              ⭐ Las preguntas del formulario de onboarding: la misma idea que la
              plantilla. Se cargan una vez, en la solapa «Onboarding» de la
              ficha, y desde ahí son columnas como cualquier otra.
            */}
            {key === "client" && canManage && growthPartners ? (
              <GlassPanel className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Preguntas del onboarding</p>
                  <p className="text-xs text-muted-foreground">
                    Carga las 86 preguntas del formulario que completa cada cliente
                    de un growth partner, con el estado de cada sistema. Las que
                    ya existen no se duplican.
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => sembrar(seedOnboardingQuestionsAction)}
                >
                  <ClipboardList className="mr-1 h-4 w-4" />
                  Cargar preguntas
                </Button>
              </GlassPanel>
            ) : null}

            {key === "client" && canManage && growthPartners ? <AvisoSinNovedades /> : null}

            {byEntity.length === 0 ? (
              <EmptyState
                icon={<SlidersHorizontal className="h-6 w-6" />}
                title="Todavía no hay columnas"
                description={EMPTY_HINT[key]}
                action={
                  canManage ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button onClick={openCreate} disabled={pending}>
                        <Plus className="mr-1 h-4 w-4" />
                        Nueva columna
                      </Button>
                      {SEED[key] ? (
                        <Button
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(SEED[key]!.action)}
                        >
                          {SEED[key]!.label}
                        </Button>
                      ) : null}
                    </div>
                  ) : undefined
                }
              />
            ) : (
              byEntity.map((field, index) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  canManage={canManage}
                  pending={pending}
                  isFirst={index === 0}
                  isLast={index === byEntity.length - 1}
                  onEdit={() => openEdit(field)}
                  onMove={(direction) => move(field, direction)}
                  onToggleArchive={() =>
                    run(() =>
                      setFieldDefinitionArchivedAction(field.id, field.archivedAt === null)
                    )
                  }
                  onDelete={() => run(() => deleteFieldDefinitionAction(field.id))}
                />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>

      <FieldDefinitionDialog
        open={dialogOpen}
        field={editing}
        entity={entity}
        saving={pending}
        error={dialogError}
        onClose={() => setDialogOpen(false)}
        onSubmit={submitDialog}
      />
    </div>
  );
}

function FieldRow({
  field,
  canManage,
  pending,
  isFirst,
  isLast,
  onEdit,
  onMove,
  onToggleArchive,
  onDelete,
}: {
  field: FieldDefinition;
  canManage: boolean;
  pending: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const isArchived = field.archivedAt !== null;
  const active = field.options.filter((option) => !option.archived);

  return (
    <GlassPanel className={cn("p-4", isArchived && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{field.label}</span>
            <Badge variant="outline">{FIELD_TYPE_LABEL[field.fieldType]}</Badge>
            {field.isRequired ? <Badge variant="secondary">Obligatoria</Badge> : null}
            {isArchived ? <Badge variant="warning">Archivada</Badge> : null}
            {field.optionsSource === "journey_stages" ? (
              <Badge variant="secondary">Opciones del recorrido</Badge>
            ) : null}
            {field.section ? (
              <Badge variant="outline" className="gap-1">
                <Layers className="h-3 w-3" />
                {FIELD_SECTION_LABEL[field.section]}
              </Badge>
            ) : null}
            {field.onboarding ? (
              <Badge variant="outline" className="gap-1">
                <ClipboardList className="h-3 w-3" />
                Formulario
              </Badge>
            ) : null}
            {field.entity === "client" && field.showInTable ? (
              <Badge variant="outline" className="gap-1">
                <Table2 className="h-3 w-3" />
                En la tabla
              </Badge>
            ) : null}
          </div>

          {field.description ? (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          ) : null}

          {fieldTypeUsesOptions(field.fieldType) ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {active.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Sin opciones cargadas
                </span>
              ) : (
                active.map((option) => (
                  <span
                    key={option.value}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2 py-0.5 text-xs"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: fieldOptionColorVar(option.color) }}
                    />
                    {option.label}
                  </span>
                ))
              )}
              {field.options.length > active.length ? (
                <span className="text-xs text-muted-foreground">
                  +{field.options.length - active.length} archivada
                  {field.options.length - active.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            Clave: <code className="font-mono">{field.key}</code>
          </p>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Subir"
              disabled={pending || isFirst}
              onClick={() => onMove(-1)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Bajar"
              disabled={pending || isLast}
              onClick={() => onMove(1)}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Editar"
              disabled={pending}
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={
                isArchived
                  ? "Volver a ofrecerla"
                  : "Archivar: deja de ofrecerse, los datos viejos la siguen mostrando"
              }
              disabled={pending}
              onClick={onToggleArchive}
            >
              {isArchived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Borrar (sólo si nadie la usó todavía)"
              disabled={pending}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </GlassPanel>
  );
}

/**
 * ⭐ «Avisos de hace 15 días que no tenemos update del cliente.» Los 15 son de
 * la organización: la lista de clientes marca a los que pasaron ese umbral.
 */
function AvisoSinNovedades() {
  const { push } = useToast();
  const [dias, setDias] = useState<string>("");
  const [guardado, setGuardado] = useState<number | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let vigente = true;
    void cargarDiasSinNovedades().then((lectura) => {
      if (!vigente) return;
      if (!lectura.ok) {
        setMotivo(lectura.motivo);
        return;
      }
      setGuardado(lectura.data);
      setDias(String(lectura.data));
    });
    return () => {
      vigente = false;
    };
  }, []);

  if (motivo !== null) {
    return (
      <AvisoDeLecturaFallida
        titulo="No se pudo leer el aviso de clientes sin novedades."
        motivo={motivo}
      />
    );
  }
  if (guardado === null) return null;

  const guardar = () =>
    startTransition(() =>
      cambiarColumnas(
        () => setClientSilenceDaysAction(Number(dias)),
        push,
        "No se pudo guardar",
        (valor) => {
          setGuardado(valor);
          push({ title: "Aviso actualizado", variant: "success" });
        }
      )
    );

  return (
    <GlassPanel className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">Clientes sin novedades</p>
        <p className="text-xs text-muted-foreground">
          La lista de clientes marca a quien no tiene novedades (llamadas, notas,
          mensajes, onboarding) desde hace esta cantidad de días.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          className="h-9 w-20"
          value={dias}
          onChange={(event) => setDias(event.target.value.replace(/\D/g, ""))}
          aria-label="Días sin novedades"
        />
        <span className="text-sm text-muted-foreground">días</span>
        <Button
          variant="outline"
          disabled={pending || dias === "" || Number(dias) === guardado}
          onClick={guardar}
        >
          Guardar
        </Button>
      </div>
    </GlassPanel>
  );
}
