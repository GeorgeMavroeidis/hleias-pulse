import React from "react";
import { createRoot } from "react-dom/client";
import { PulseApp } from "@/components/hp/PulseApp";
import "../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main data-hosting-target="cloudflare-pages" className="min-h-[100dvh] w-full bg-hp-bg">
      <h1 className="sr-only">ΗΛΕΙΑ PULSE - social map of Ilia, Greece</h1>
      <PulseApp />
    </main>
  </React.StrictMode>,
);
