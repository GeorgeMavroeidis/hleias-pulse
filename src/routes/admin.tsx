import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
});

function AdminRoute() {
  return <AdminDashboard />;
}
