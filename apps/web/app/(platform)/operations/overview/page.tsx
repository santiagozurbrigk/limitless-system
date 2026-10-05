import { unstable_rethrow } from "next/navigation";
import { getWeeklyReportAction } from "@/app/operations/actions";
import { getCurrentProfile, requireOrganizationId } from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { computeDepartmentStatuses } from "@/lib/executive-reports/compute-departments";
import { departmentStatusesToOperationsDepartments } from "@/lib/operations/map-weekly-report";
import { mockOperationsOverview } from "@/mocks/operations-overview";
import { OperationsOverview } from "@/components/operations/operations-overview";
import { PageHeader } from "@/components/shared/page-header";
import type { OperationsDepartment } from "@/types/operations-overview";

async function loadDepartments(): Promise<OperationsDepartment[]> {
  if (!isSupabaseConfigured()) {
    return mockOperationsOverview.departments;
  }

  try {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();
    const statuses = await computeDepartmentStatuses(admin, organizationId);
    return departmentStatusesToOperationsDepartments(statuses);
  } catch (error) {
    // El error con el que Next marca la ruta como dinámica (y los de redirect o
    // notFound) no es una falla: se relanza para que Next lo maneje.
    unstable_rethrow(error);
    console.error("[OperationsOverviewPage] loadDepartments", error);
    return [];
  }
}

export default async function OperationsOverviewPage() {
  const [weeklyReport, departments, profile] = await Promise.all([
    getWeeklyReportAction(),
    loadDepartments(),
    getCurrentProfile(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader description="Salud operativa y capacidad del equipo" />
      <OperationsOverview
        weeklyReport={weeklyReport}
        departments={departments}
        isFounder={profile?.role === "founder"}
      />
    </div>
  );
}
