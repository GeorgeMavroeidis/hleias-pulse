import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const AdminDashboard = lazy(() =>
  import("@/components/admin/AdminDashboard").then((module) => ({
    default: module.AdminDashboard,
  })),
);

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
});

function AdminRoute() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-500">
          Φόρτωση χώρου διαχείρισης…
        </main>
      }
    >
      <AdminDashboard />
    </Suspense>
  );
}
