import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/lib/i18n";
import "../src/styles.css";

const AdminDashboard = lazy(() =>
  import("@/components/admin/AdminDashboard").then((module) => ({
    default: module.AdminDashboard,
  })),
);
const PulseApp = lazy(() =>
  import("@/components/hp/PulseApp").then((module) => ({ default: module.PulseApp })),
);

const isAdminRoute =
  window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <Suspense
        fallback={
          <main className="grid min-h-[100dvh] place-items-center bg-hp-bg text-sm font-semibold text-hp-muted">
            Φόρτωση ΗΛΕΙΑ PULSE…
          </main>
        }
      >
        {isAdminRoute ? (
          <AdminDashboard />
        ) : (
          <main data-hosting-target="cloudflare-pages" className="min-h-[100dvh] w-full bg-hp-bg">
            <h1 className="sr-only">ΗΛΕΙΑ PULSE - social map of Ilia, Greece</h1>
            <PulseApp />
          </main>
        )}
      </Suspense>
    </I18nProvider>
  </React.StrictMode>,
);
