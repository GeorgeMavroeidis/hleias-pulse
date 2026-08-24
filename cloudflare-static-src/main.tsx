import React from "react";
import { createRoot } from "react-dom/client";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { PulseApp } from "@/components/hp/PulseApp";
import "../src/styles.css";

const isAdminRoute =
  window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <AdminDashboard />
    ) : (
      <main data-hosting-target="cloudflare-pages" className="min-h-[100dvh] w-full bg-hp-bg">
        <h1 className="sr-only">ΗΛΕΙΑ PULSE - social map of Ilia, Greece</h1>
        <PulseApp />
      </main>
    )}
  </React.StrictMode>,
);
