/**
 * Shared domain types — aligned with SYSTEM_ARCHITECTURE.md
 * Phase 0: structural placeholders for mock data and future API contracts.
 */

/**
 * Estado de una organización, igual que el check de la base:
 * `organizations.status in ('active', 'paused', 'churned')`
 * (`supabase/migrations/20260521000000_phase1_orgs_profiles.sql`). Si se
 * agrega un estado, va primero en una migración y después aquí.
 */
export type OrganizationStatus = "active" | "paused" | "churned";

export type UserRole =
  | "founder"
  | "admin"
  | "project_manager"
  | "setter"
  | "operator"
  | "viewer";

export type ConversationStatus = "active" | "ghosted" | "booked" | "closed";

export type SopStatus = "active" | "outdated" | "draft";

export type IntegrationStatus = "connected" | "not_connected" | "syncing";

export type AiJobStatus = "pending" | "processing" | "complete" | "failed";

export type WeeklyInputType = "text" | "audio" | "form";

export type Department =
  | "sales"
  | "delivery"
  | "operations"
  | "founder";

/** Reserved — multi-workspace support (not implemented in Phase 0) */
export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  isDefault: boolean;
}
