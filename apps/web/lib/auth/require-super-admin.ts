/**
 * @deprecated Usar requireStaff/isStaffUser/isStaffEmail de require-staff (SCRUM-552). Se borra en C3 (SCRUM-553).
 */
export {
  requireStaff as requireSuperAdmin,
  isStaffUser as isSuperAdminUser,
  isStaffEmail as isSuperAdminEmail,
} from "@/lib/auth/require-staff";
