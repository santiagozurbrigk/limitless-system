import type { UserRole } from "@ai-coo/types";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "active" | "away" | "inactive";
  lastLogin: string | null;
  hourlyRate?: number;
  hourlyRateCurrency?: string;
  avatarUrl?: string;
  customRoleId?: string | null;
  customRoleName?: string | null;
  isActive?: boolean;
};

export type RoleDefinition = {
  role: UserRole;
  label: string;
  description: string;
  permissions: string[];
};

export type PermissionLevel = "none" | "view" | "full";

export type CustomRole = {
  id: string;
  name: string;
  description?: string;
  permissions: Record<string, PermissionLevel>;
  isDefault?: boolean;
};

export type TeamMemberWithRole = TeamMember & {
  customRoleId?: string | null;
};

export type TeamInvitation = {
  id: string;
  email: string;
  role: UserRole;
  status: "pending" | "accepted" | "expired";
  expiresAt: string;
  createdAt: string;
  customRoleId: string | null;
  customRoleName: string | null;
  invitedByName: string | null;
};
