import { z } from "zod";
import { AI_BRAIN_MAX_FILE_BYTES } from "@/lib/ai-brain/file-types";
import { PERMISSION_MODULES } from "@/constants/permission-modules";
import type { PermissionModuleId } from "@/constants/permission-modules";

const noScriptPattern = /<script|javascript:|on\w+=/i;

export const textSchema = z
  .string()
  .min(1, "Campo requerido")
  .max(500, "Máximo 500 caracteres")
  .refine((val) => !noScriptPattern.test(val), "Contenido no permitido");

export const longTextSchema = z
  .string()
  .min(1, "Campo requerido")
  .max(50_000, "Máximo 50.000 caracteres")
  .refine((val) => !/<script|javascript:/i.test(val), "Contenido no permitido");

export const emailSchema = z
  .string()
  .email("Email inválido")
  .max(254, "Email demasiado largo")
  .transform((v) => v.toLowerCase());

export const apiKeySchema = z
  .string()
  .min(10, "API key demasiado corta")
  .max(256, "API key demasiado larga")
  .regex(/^[a-zA-Z0-9_\-\.:]+$/, "La API key contiene caracteres no válidos");

export const moneySchema = z
  .number()
  .min(0, "No puede ser negativo")
  .max(10_000_000, "Valor demasiado alto")
  .finite();

export const uuidSchema = z.string().uuid("ID inválido");

export const aiPromptSchema = z
  .string()
  .min(1, "Escribí algo antes de enviar")
  .max(4000, "El mensaje no puede superar los 4.000 caracteres")
  .refine((val) => val.trim().length > 0, "El mensaje no puede estar vacío")
  .refine((val) => !noScriptPattern.test(val), "Contenido no permitido");

export const orgNameSchema = z
  .string()
  .min(2, "Mínimo 2 caracteres")
  .max(100, "Máximo 100 caracteres")
  .regex(
    /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\-_\.&]+$/,
    "Solo letras, números y caracteres básicos"
  );

export const priceSchema = z.number().min(0).max(1_000_000).finite();

export const urlSchema = z
  .string()
  .url("URL inválida")
  .max(2048)
  .refine(
    (val) => val.startsWith("https://") || val.startsWith("http://"),
    "Debe ser una URL válida"
  );

/** Valores alineados con `SopDepartment` / `VALID_DEPARTMENTS` en `lib/sops/mapper.ts`. */
export const sopDepartmentSchema = z.enum([
  "sales",
  "delivery",
  "operations",
  "marketing",
  "finance",
  "general",
  "founder",
]);

const sopTagSchema = z
  .string()
  .trim()
  .min(1, "Campo requerido")
  .max(50, "Máximo 50 caracteres");

const sopOptionalContextSchema = z
  .string()
  .trim()
  .max(5000, "Máximo 5.000 caracteres")
  .optional();

export const generateSOPSchema = z.object({
  goal: textSchema,
  department: sopDepartmentSchema,
  expectedOutcome: textSchema,
  additionalContext: z
    .string()
    .trim()
    .max(4000, "Máximo 4.000 caracteres")
    .optional(),
});

export const saveSOPSchema = z.object({
  title: textSchema,
  goal: textSchema,
  department: sopDepartmentSchema,
  expectedOutcome: sopOptionalContextSchema,
  additionalContext: z
    .string()
    .trim()
    .max(4000, "Máximo 4.000 caracteres")
    .optional(),
  content: longTextSchema,
  tags: z.array(sopTagSchema).max(20).optional(),
  estimatedDurationMinutes: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .optional(),
  generatedByAI: z.boolean().optional(),
  status: z.enum(["draft", "active"]).optional(),
  draftId: z.string().trim().max(100).optional(),
});

export const updateSOPSchema = z.object({
  title: textSchema.optional(),
  content: longTextSchema.optional(),
  status: z.enum(["draft", "active", "outdated"]).optional(),
  tags: z.array(sopTagSchema).max(20).optional(),
  changeNote: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});

export const getSOPsFiltersSchema = z
  .object({
    department: sopDepartmentSchema.optional(),
    status: z.enum(["draft", "active", "outdated"]).optional(),
    search: z.string().trim().max(200, "Máximo 200 caracteres").optional(),
  })
  .optional();

/** Subconjunto histórico de `saveSOPSchema` (title, content, department, goal). */
export const createSOPSchema = saveSOPSchema.pick({
  title: true,
  content: true,
  department: true,
  goal: true,
});

export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos";
}

const superAdminNameSchema = z
  .string()
  .trim()
  .min(1, "Campo requerido")
  .max(200, "Máximo 200 caracteres");

const superAdminNoteSchema = z
  .string()
  .trim()
  .min(1, "Campo requerido")
  .max(5000, "Máximo 5.000 caracteres");

const brainContentTypeSchema = z.enum([
  "document",
  "image",
  "transcript",
  "miro",
  "framework",
  "playbook",
]);

export const createFounderAccountSchema = z.object({
  organizationName: superAdminNameSchema,
  founderName: superAdminNameSchema,
  email: emailSchema,
});

export const createOrganizationFromHoldingSchema = z.object({
  name: superAdminNameSchema,
  founderEmail: emailSchema,
  plan: z.enum(["basic", "pro"]).optional(),
});

export const createHoldingOrgSchema = z.object({
  name: superAdminNameSchema,
  founderEmail: emailSchema,
});

export const setOrganizationStatusSchema = z.object({
  organizationId: uuidSchema,
  active: z.boolean(),
});

export const updateOrganizationMrrSchema = z.object({
  organizationId: uuidSchema,
  mrrUsd: moneySchema,
});

export const addOrganizationNoteSchema = z.object({
  organizationId: uuidSchema,
  note: superAdminNoteSchema,
  createdBy: z.string().trim().max(200, "Máximo 200 caracteres").optional(),
});

export const deactivateUserSchema = z.object({
  userId: uuidSchema,
});

export const prepareAiBrainFileUploadSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .max(500, "Máximo 500 caracteres"),
  fileSize: z
    .number()
    .int("El tamaño debe ser un número entero")
    .positive("El tamaño debe ser mayor a 0")
    .max(AI_BRAIN_MAX_FILE_BYTES, "Archivo demasiado grande"),
  mimeType: z.string().trim().max(200, "Máximo 200 caracteres").optional(),
});

export const createAiBrainDocumentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Campo requerido")
      .max(500, "Máximo 500 caracteres"),
    contentType: brainContentTypeSchema,
    category: z
      .string()
      .trim()
      .min(1, "Campo requerido")
      .max(100, "Máximo 100 caracteres"),
    description: z.string().trim().max(5000, "Máximo 5.000 caracteres").optional(),
    tags: z.string().trim().max(2000, "Máximo 2.000 caracteres").optional(),
    coverageAreas: z
      .string()
      .trim()
      .max(2000, "Máximo 2.000 caracteres")
      .optional(),
    uploadedBy: z.string().trim().max(200, "Máximo 200 caracteres").optional(),
    miroUrl: z.string().trim().max(2048).optional(),
    storagePath: z.string().trim().max(1000, "Máximo 1.000 caracteres").optional(),
    fileName: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
    fileSizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(AI_BRAIN_MAX_FILE_BYTES)
      .optional(),
    fileMimeType: z.string().trim().max(200, "Máximo 200 caracteres").optional(),
  })
  .superRefine((data, ctx) => {
    const hasMiro = Boolean(data.miroUrl?.trim());
    const hasFile = Boolean(data.storagePath?.trim() && data.fileName?.trim());
    if (!hasMiro && !hasFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subí un archivo o ingresá la URL de un tablero Miro.",
      });
    }
    if (data.miroUrl?.trim()) {
      const urlResult = urlSchema.safeParse(data.miroUrl.trim());
      if (!urlResult.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: firstZodError(urlResult.error),
          path: ["miroUrl"],
        });
      }
    }
  });

export const archiveAiBrainDocumentSchema = z.object({
  id: uuidSchema,
});

export const deleteAiBrainDocumentSchema = z.object({
  id: uuidSchema,
});

export const getAiBrainSignedUrlSchema = z.object({
  storagePath: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .max(1000, "Máximo 1.000 caracteres"),
});

export const regenerateTempPasswordSchema = z.object({
  userId: uuidSchema,
});

const holdingBusinessNameSchema = z
  .string()
  .trim()
  .min(1, "Campo requerido")
  .max(200, "Máximo 200 caracteres");

export const holdingFixedFeeCurrencySchema = z.enum(["USD", "ARS"]);

export const holdingBillingModelSchema = z.enum(["revenue_share", "fixed_fee"]);

export const addBusinessToMyHoldingSchema = z.object({
  businessName: holdingBusinessNameSchema,
  revenueSharePct: z.number().min(0).max(100).optional(),
  fixedFeeAmount: z.number().positive().max(1_000_000).optional(),
  fixedFeeCurrency: holdingFixedFeeCurrencySchema.optional(),
  founderEmail: emailSchema.optional(),
});

export const enterBusinessSchema = z.object({
  businessOrgId: uuidSchema,
});

export const regenerateBusinessFounderTempPasswordSchema = z.object({
  businessOrgId: uuidSchema,
});

export const saveHoldingBillingModelSchema = z.object({
  model: holdingBillingModelSchema,
});

export const businessInOnboardingSchema = z.object({
  name: holdingBusinessNameSchema,
  revenueSharePct: z.number().min(0).max(100).optional(),
  fixedFeeAmount: z.number().positive().max(1_000_000).optional(),
  fixedFeeCurrency: holdingFixedFeeCurrencySchema.optional(),
});

export const completeHoldingOnboardingSchema = z.object({
  businesses: z.array(businessInOnboardingSchema).min(1).max(50),
});

export const teamUserRoleSchema = z.enum(["founder", "member"]);

export const permissionLevelSchema = z.enum(["none", "view", "full"]);

const permissionModuleIdSet = new Set<string>(
  PERMISSION_MODULES.map((m) => m.id)
);

export const teamPermissionsSchema = z
  .record(z.string(), permissionLevelSchema)
  .refine((perms) => Object.keys(perms).length > 0, "Definí al menos un permiso")
  .refine(
    (perms) =>
      Object.keys(perms).every((key) =>
        permissionModuleIdSet.has(key as PermissionModuleId)
      ),
    "Módulo de permiso no válido"
  );

/** El largo mínimo, en un solo lugar: lo usan el login, el reset y Configuración. */
export const PASSWORD_MIN_LENGTH = 8;

const teamPersonNameSchema = z
  .string()
  .trim()
  .min(1, "Campo requerido")
  .max(200, "Máximo 200 caracteres");

export const inviteTeamMemberSchema = z.object({
  email: emailSchema,
  fullName: teamPersonNameSchema,
  role: teamUserRoleSchema.optional().default("member"),
  customRoleId: uuidSchema,
});

export const updateMemberRoleSchema = z.object({
  memberId: uuidSchema,
  role: teamUserRoleSchema.optional(),
  customRoleId: z.union([uuidSchema, z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const deactivateMemberSchema = z.object({
  memberId: uuidSchema,
});

export const createCustomRoleSchema = z.object({
  name: teamPersonNameSchema,
  description: z.string().trim().max(1000, "Máximo 1.000 caracteres").optional(),
  permissions: teamPermissionsSchema,
});

export const deleteCustomRoleSchema = z.object({
  roleId: uuidSchema,
});

export const revokeInvitationSchema = z.object({
  invitationId: uuidSchema,
});

export const aceptarInvitacionSchema = z.object({
  token: z.string().trim().min(1, "Token inválido").max(500),
});

import {
  UNIPILE_PROXY_COUNTRY_CODES,
  type UnipileProxyCountryCode,
} from "@/lib/unipile/proxy-countries";

export const organizationTimezoneSchema = z.enum([
  "America/Argentina/Buenos_Aires",
  "America/Mexico_City",
  "America/Bogota",
  "America/Santiago",
  "America/New_York",
  "Europe/Madrid",
  "UTC",
]);

export const organizationCurrencySchema = z.enum(["USD", "ARS", "EUR"]);

export const organizationLanguageSchema = z.enum(["es", "en"]);

export const organizationCountrySchema = z.enum(
  UNIPILE_PROXY_COUNTRY_CODES as unknown as [
    UnipileProxyCountryCode,
    ...UnipileProxyCountryCode[],
  ]
);

export const updateOrganizationWebsiteSchema = z.object({
  websiteUrl: z.string().trim().max(500),
});

export const saveGeneralOrganizationSettingsSchema = z.object({
  orgName: z
    .string()
    .trim()
    .min(1, "El nombre de la empresa es obligatorio.")
    .max(200, "Máximo 200 caracteres"),
  industry: z.string().trim().max(200, "Máximo 200 caracteres").optional(),
  websiteUrl: z.string().trim().max(500),
  timezone: organizationTimezoneSchema.optional(),
  currency: organizationCurrencySchema.optional(),
  language: organizationLanguageSchema.optional(),
  country: z
    .union([organizationCountrySchema, z.literal("")])
    .optional()
    .transform((value) => (value === "" || value == null ? null : value)),
});

export const updateNotificationPreferencesSchema = z.object({
  emailWeeklyReport: z.boolean().optional(),
  emailNewConversation: z.boolean().optional(),
  emailBookingConfirmed: z.boolean().optional(),
  emailSaleClosed: z.boolean().optional(),
  emailSopSuggestion: z.boolean().optional(),
  inappNewConversation: z.boolean().optional(),
  inappBookingConfirmed: z.boolean().optional(),
  inappSaleClosed: z.boolean().optional(),
  inappGhostingAlert: z.boolean().optional(),
});

export const saveClaudeApiKeySchema = z.object({
  apiKey: z.string().trim().min(1, "Ingresá una API key").max(500),
});

// ─── Clients ────────────────────────────────────────────────────────────────

export const clientStatusSchema = z.enum([
  "pending_onboarding",
  "onboarding_done",
  "active",
  "success_case",
]);

export const installmentStatusSchema = z.enum(["paid", "pending"]);

export const paymentPlatformSchema = z.enum([
  "stripe",
  "mercadopago",
  "paypal",
  "bank_transfer",
  "other",
]);

export const clientPaymentTypeSchema = z.enum([
  "upfront",
  "installments",
  "upfront_fee",
]);

export const feeFrequencySchema = z.enum(["monthly", "weekly"]);

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

const isoTimestampSchema = z
  .string()
  .trim()
  .min(1, "Campo requerido")
  .max(50)
  .refine((val) => !Number.isNaN(Date.parse(val)), "Fecha/hora inválida");

const clientNameSchema = z
  .string()
  .trim()
  .min(1, "Campo requerido")
  .max(200, "Máximo 200 caracteres");

const optionalClientTextSchema = z
  .string()
  .trim()
  .max(5000, "Máximo 5.000 caracteres")
  .optional();

const optionalClientUrlSchema = z
  .string()
  .trim()
  .max(2048, "Máximo 2.048 caracteres")
  .optional();

const callObjectionDetailSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  category: z.enum(["closing", "setting", "marketing"]),
  handled: z.boolean(),
  resolution: z.string().trim().max(2000).optional(),
  suggestion: z.string().trim().max(2000).optional(),
});

const deepCallAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100).finite(),
  scriptAdherencePct: z.number().min(0).max(100).finite(),
  sectionScores: z.record(
    z.string(),
    z.number().min(0).max(100).finite()
  ),
  missingSteps: z.array(z.string().trim().max(500)).max(50),
  objections: z.array(callObjectionDetailSchema).max(100),
  powerPhrases: z.array(z.string().trim().max(500)).max(50),
  weakPhrases: z.array(z.string().trim().max(500)).max(50),
  fillerWordsCount: z.number().int().min(0).max(10_000),
  strengths: z.array(z.string().trim().max(500)).max(50),
  improvements: z.array(z.string().trim().max(500)).max(50),
  leadQualified: z.boolean().optional(),
  booked: z.boolean(),
  sold: z.boolean(),
  leadName: z.string().trim().max(200).optional(),
  durationMinutes: z.number().min(0).max(10_000).finite().optional(),
});

const clientLinkedCallSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(500),
  date: z.string().trim().max(50),
  duration: z.string().trim().max(50),
  url: z.string().trim().max(2048),
  fathomCallId: z.string().trim().max(200).optional(),
  closerName: z.string().trim().max(200).optional(),
  analysis: deepCallAnalysisSchema.optional(),
});

const clientInstallmentSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  amount: moneySchema,
  status: installmentStatusSchema,
  paidAt: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
});

const clientFieldsSchema = z.object({
  name: clientNameSchema,
  nickname: z.string().trim().max(100).optional(),
  // Sin declararlo acá Zod lo descarta en silencio y nunca llega a la base:
  // es lo que hila al lead con el cliente en que se convirtió.
  email: z.string().trim().email().max(320).nullable().optional(),
  joinDate: isoDateSchema,
  paymentType: clientPaymentTypeSchema,
  platform: paymentPlatformSchema,
  totalAmount: moneySchema,
  upfrontAmount: moneySchema.optional(),
  feeAmount: moneySchema.optional(),
  feeFrequency: feeFrequencySchema.optional(),
  status: clientStatusSchema,
  isSuccessCase: z.boolean(),
  installments: z.array(clientInstallmentSchema).max(120).optional(),
  salesFathomUrl: optionalClientUrlSchema,
  closingCallId: uuidSchema.optional(),
  aiInsights: z.array(z.string().trim().max(2000)).max(100),
  linkedCalls: z.array(clientLinkedCallSchema).max(100),
  offeredProduct: z.string().trim().max(500).optional(),
  feedbackNotes: optionalClientTextSchema,
  avatar: z.string().trim().max(500).optional(),
  mainPain: optionalClientTextSchema,
  objections: optionalClientTextSchema,
  planId: uuidSchema.optional(),
  selectedInstallmentSystemId: z.string().trim().max(200).optional(),
});

export const createClientSchema = clientFieldsSchema;

export const updateClientSchema = clientFieldsSchema.partial();

// ─── Closing ──────────────────────────────────────────────────────────────

export const closingCallStatusSchema = z.enum([
  "scheduled",
  "attended",
  "closed",
  "not_closed",
  "no_show",
  "cancelled",
]);

export const closingCallCancelledBySchema = z.enum(["lead", "closer", "unknown"]);

const calendlyFormAnswerSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().max(5000),
});

const closingOutcomeSchema = z.object({
  paymentType: clientPaymentTypeSchema.optional(),
  revenue: moneySchema.optional(),
  noCloseReason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
});

const closingCallFieldsSchema = z.object({
  leadName: clientNameSchema,
  scheduledAt: isoTimestampSchema,
  status: closingCallStatusSchema,
  conversationId: uuidSchema.optional(),
  formAnswers: z.array(calendlyFormAnswerSchema).max(50),
  fathomUrl: optionalClientUrlSchema,
  outcome: closingOutcomeSchema.optional(),
  closedByName: z.string().trim().max(200).optional(),
  paymentSourcePlatformId: z.string().trim().max(100).optional(),
  paymentDestinationPlatformId: z.string().trim().max(100).optional(),
  paymentReceivedFrom: z.string().trim().max(500).optional(),
  cancelledBy: closingCallCancelledBySchema.optional(),
});

export const updateClosingCallSchema = closingCallFieldsSchema.partial();

// ─── Conversations ────────────────────────────────────────────────────────

export const conversationTagIdSchema = z.enum([
  "muy-calificado",
  "calificado",
  "descalificado",
  "muy-descalificado",
  "agendado",
  "closeado",
  "no-closeado",
]);

export const updateConversationTagSchema = z.object({
  id: uuidSchema,
  tag: conversationTagIdSchema.nullable(),
});

// ─── Product ────────────────────────────────────────────────────────────────

const productStringListSchema = z
  .array(z.string().trim().max(500, "Máximo 500 caracteres"))
  .max(30);

export const productTypeSchema = z.enum([
  "curso",
  "mentoria",
  "consultoria",
  "comunidad",
  "evento",
  "otro",
]);

export const productBillingTypeSchema = z.enum([
  "unico",
  "mensual",
  "anual",
  "personalizado",
]);

export const salesFrameworkTypeSchema = z.enum([
  "script",
  "objeciones",
  "followup",
  "onboarding",
  "otro",
]);

export const saveAvatarSchema = z.object({
  id: uuidSchema.optional(),
  name: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .max(200, "Máximo 200 caracteres"),
  ageRange: z.string().trim().max(100).optional(),
  occupation: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  incomeRange: z.string().trim().max(100).optional(),
  mainPain: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .max(2000, "Máximo 2.000 caracteres"),
  secondaryPains: productStringListSchema.optional(),
  desires: productStringListSchema.optional(),
  fears: productStringListSchema.optional(),
  objections: productStringListSchema.optional(),
  whereTheyHang: z.string().trim().max(500).optional(),
  languageTheyUse: z.string().trim().max(2000).optional(),
  isPrimary: z.boolean().optional(),
  /**
   * ⭐ Pisa el avatar principal que ya exista en vez de sumar otro.
   *
   * Lo usa el asistente de alta: ahí "el cliente ideal" es un único avatar que
   * se está definiendo, no uno más de una lista. Sin esto, cada reintento del
   * paso final dejaba un duplicado.
   */
  replacePrimary: z.boolean().optional(),
});

export const saveProductSchema = z.object({
  id: uuidSchema.optional(),
  name: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .max(200, "Máximo 200 caracteres"),
  description: z.string().trim().max(5000, "Máximo 5.000 caracteres").optional(),
  type: productTypeSchema.optional(),
  price: moneySchema.optional(),
  currency: z.string().trim().max(10).optional(),
  billingType: productBillingTypeSchema.optional(),
  valueLadderPosition: z.number().int().min(1).max(20).optional(),
  bonuses: productStringListSchema.optional(),
  guarantee: z.string().trim().max(2000).optional(),
  targetAvatarId: uuidSchema.optional(),
  isActive: z.boolean().optional(),
  isCoreOffer: z.boolean().optional(),
});

export const saveValuePropositionSchema = z.object({
  avatar: z.string().trim().max(500),
  result: z.string().trim().max(500),
  painRemoved: z.string().trim().max(500),
  timeframe: z.string().trim().max(200),
});

export const reorderValueLadderSchema = z.object({
  productIds: z.array(uuidSchema).min(1).max(20),
});

export const updateValueLadderStepSchema = z.object({
  productId: uuidSchema,
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  price: moneySchema.optional(),
  billingType: productBillingTypeSchema.optional(),
});

export const saveSalesFrameworkSchema = z.object({
  id: uuidSchema.optional(),
  name: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .max(200, "Máximo 200 caracteres"),
  description: z.string().trim().max(2000).optional(),
  content: longTextSchema,
  type: salesFrameworkTypeSchema.optional(),
});

const suggestedAvatarSchema = z
  .object({
    name: z.string().trim().max(200).optional(),
    main_pain: z.string().trim().max(2000).optional(),
    secondary_pains: productStringListSchema.optional(),
    desires: productStringListSchema.optional(),
    fears: productStringListSchema.optional(),
    objections: productStringListSchema.optional(),
    where_they_hang: z.string().trim().max(500).optional(),
    language_they_use: z.string().trim().max(2000).optional(),
  })
  .optional()
  .nullable();

const suggestedProductSchema = z.object({
  name: z.string().trim().max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  type: productTypeSchema.optional(),
  price: moneySchema.nullable().optional(),
  billing_type: productBillingTypeSchema.optional(),
});

const suggestedFrameworkSchema = z.object({
  name: z.string().trim().max(200).optional(),
  type: salesFrameworkTypeSchema.optional(),
  content: z.string().trim().max(50_000, "Máximo 50.000 caracteres").optional(),
});

export const applySuggestedProductContextSchema = z.object({
  avatar: suggestedAvatarSchema,
  products: z.array(suggestedProductSchema).max(20).optional(),
  frameworks: z.array(suggestedFrameworkSchema).max(20).optional(),
  proposition: saveValuePropositionSchema.optional(),
});

// ─── Operations ─────────────────────────────────────────────────────────────

export const weeklyDepartmentSchema = z.enum([
  "sales",
  "delivery",
  "operations",
  "marketing",
  "founder",
]);

export const saveWeeklyInputSchema = z
  .object({
    department: weeklyDepartmentSchema,
    content: z.string().trim().max(10_000, "Máximo 10.000 caracteres").optional(),
    rating: z.number().int().min(1).max(5).optional(),
  })
  .refine((data) => Boolean(data.content?.trim()) || data.rating != null, {
    message: "Completá al menos un campo antes de guardar.",
  });

// ─── Launches ───────────────────────────────────────────────────────────────

export const launchStatusSchema = z.enum([
  "planning",
  "active",
  "completed",
  "cancelled",
]);

export const launchDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const launchTagSchema = z
  .string()
  .trim()
  .min(1, "Campo requerido")
  .max(50, "Máximo 50 caracteres");

const optionalLaunchDateSchema = launchDateSchema.optional();

export const createLaunchSchema = z.object({
  name: textSchema,
  description: z.string().trim().max(5000, "Máximo 5.000 caracteres").optional(),
  launchDate: optionalLaunchDateSchema,
  endDate: optionalLaunchDateSchema,
  goalRevenue: moneySchema.optional(),
  goalClients: z.number().int().min(0, "No puede ser negativo").max(1_000_000).optional(),
  productId: uuidSchema.optional(),
  tags: z.array(launchTagSchema).max(20).optional(),
});

export const updateLaunchPatchSchema = z
  .object({
    name: textSchema.optional(),
    description: z.string().trim().max(5000, "Máximo 5.000 caracteres").optional(),
    status: launchStatusSchema.optional(),
    launchDate: launchDateSchema.optional(),
    endDate: launchDateSchema.optional(),
    goalRevenue: moneySchema.optional(),
    actualRevenue: moneySchema.optional(),
    goalClients: z.number().int().min(0, "No puede ser negativo").max(1_000_000).optional(),
    actualClients: z.number().int().min(0, "No puede ser negativo").max(1_000_000).optional(),
    productId: z.union([uuidSchema, z.null()]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Sin cambios para guardar",
  });

export const recordLaunchMetricDataSchema = z.object({
  date: launchDateSchema,
  revenue: moneySchema,
  newClients: z.number().int().min(0, "No puede ser negativo"),
  conversationsStarted: z.number().int().min(0, "No puede ser negativo").optional(),
  bookings: z.number().int().min(0, "No puede ser negativo").optional(),
});

// ─── Workboard ──────────────────────────────────────────────────────────────

export const taskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "review",
  "done",
]);

export const taskAreaSchema = z.enum([
  "marketing",
  "ventas",
  "operaciones",
  "finanzas",
  "clientes",
  "general",
]);

export const taskPrioritySchema = z.enum(["low", "medium", "high"]);

export const sprintAreaFocusSchema = z.enum([
  "ventas",
  "marketing",
  "operaciones",
  "delivery",
  "producto",
  "general",
]);

export const sprintStatusSchema = z.enum(["planning", "active", "completed"]);

const workboardTagSchema = z
  .string()
  .trim()
  .min(1, "Campo requerido")
  .max(50, "Máximo 50 caracteres");

const nullableUuidSchema = z.union([uuidSchema, z.null()]);

const optionalDueDateSchema = z
  .union([launchDateSchema, z.literal(""), z.null()])
  .optional();

export const createWorkboardTaskSchema = z.object({
  title: textSchema,
  description: z.string().trim().max(5000, "Máximo 5.000 caracteres").optional(),
  status: taskStatusSchema,
  area: taskAreaSchema,
  priority: taskPrioritySchema,
  assigneeId: nullableUuidSchema.optional(),
  /**
   * ⭐ Varios responsables. Un tope de 20 para que un error de la pantalla no
   * pueda meter una lista arbitrariamente larga.
   */
  assigneeIds: z.array(uuidSchema).max(20).optional(),
  dueDate: optionalDueDateSchema,
  tags: z.array(workboardTagSchema).max(20).optional(),
  sprintId: nullableUuidSchema.optional(),
  launchId: nullableUuidSchema.optional(),
  sopId: nullableUuidSchema.optional(),
  documentIds: z.array(uuidSchema).max(20).optional(),
});

export const moveWorkboardTaskSchema = z.object({
  taskId: uuidSchema,
  status: taskStatusSchema,
});

export const updateWorkboardTaskSchema = z
  .object({
    taskId: uuidSchema,
    title: textSchema.optional(),
    description: z.string().trim().max(5000, "Máximo 5.000 caracteres").optional(),
    status: taskStatusSchema.optional(),
    area: taskAreaSchema.optional(),
    priority: taskPrioritySchema.optional(),
    assigneeId: nullableUuidSchema.optional(),
  /**
   * ⭐ Varios responsables. Un tope de 20 para que un error de la pantalla no
   * pueda meter una lista arbitrariamente larga.
   */
  assigneeIds: z.array(uuidSchema).max(20).optional(),
    dueDate: optionalDueDateSchema,
    tags: z.array(workboardTagSchema).max(20).optional(),
    estimatedMinutes: z.number().int().min(0, "No puede ser negativo").max(100_000).optional(),
    launchId: nullableUuidSchema.optional(),
  })
  .refine(
    (data) =>
      Object.keys(data).some((key) => key !== "taskId" && data[key as keyof typeof data] !== undefined),
    { message: "Sin cambios para guardar" }
  );

export const assignTaskToLaunchSchema = z.object({
  taskId: uuidSchema,
  launchId: nullableUuidSchema,
});

export const logTaskTimeSchema = z.object({
  taskId: uuidSchema,
  actualMinutes: z.number().min(0, "No puede ser negativo").max(100_000),
  estimatedMinutes: z.number().int().min(0, "No puede ser negativo").max(100_000).optional(),
  note: z.string().trim().max(2000, "Máximo 2.000 caracteres").optional(),
});

export const memberHourlyRateCurrencySchema = z.enum(["USD", "ARS"]);

export const setMemberHourlyRateSchema = z.object({
  memberId: uuidSchema,
  hourlyRate: moneySchema,
  currency: memberHourlyRateCurrencySchema,
});

export const createSprintSchema = z.object({
  name: textSchema,
  goal: z.string().trim().max(2000, "Máximo 2.000 caracteres").optional(),
  areaFocus: sprintAreaFocusSchema.optional(),
  startDate: launchDateSchema,
  endDate: launchDateSchema,
});

export const updateSprintPatchSchema = z
  .object({
    name: textSchema.optional(),
    goal: z.string().trim().max(2000, "Máximo 2.000 caracteres").optional(),
    areaFocus: sprintAreaFocusSchema.optional(),
    startDate: launchDateSchema.optional(),
    endDate: launchDateSchema.optional(),
    status: sprintStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Sin cambios para guardar",
  });

export const assignTaskToSprintSchema = z.object({
  taskId: uuidSchema,
  sprintId: nullableUuidSchema,
});

// ─── Mercado Pago ───────────────────────────────────────────────────────────

export const mercadoPagoPaymentIdSchema = z.union([
  z.string().trim().min(1, "ID inválido"),
  z.number().int().positive("ID inválido"),
]);

export const mercadoPagoTransactionsQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});
