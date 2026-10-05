import { FounderOverview } from "@/components/founder";
import { getIntelligenceSnapshotAction } from "@/app/intelligence/actions";
import { getCurrentProfile } from "@/lib/auth/bootstrap";

export default async function FounderAreaPage() {
  const [snapshot, profile] = await Promise.all([
    getIntelligenceSnapshotAction(),
    getCurrentProfile(),
  ]);
  return (
    <FounderOverview
      snapshot={snapshot}
      isFounder={profile?.role === "founder"}
    />
  );
}
