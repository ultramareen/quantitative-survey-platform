import { InfrastructureAdminControls } from "@/components/infrastructure/admin-controls";
import type { InfrastructureAdminView } from "@/types/infrastructure";

export function AdminInfrastructurePage({
  view,
}: {
  view: InfrastructureAdminView;
}) {
  return <InfrastructureAdminControls view={view} />;
}
