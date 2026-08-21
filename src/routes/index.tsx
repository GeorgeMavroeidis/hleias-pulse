import { createFileRoute } from "@tanstack/react-router";
import { PulseApp } from "@/components/hp/PulseApp";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="min-h-[100dvh] w-full bg-hp-bg">
      <h1 className="sr-only">ΗΛΕΙΑ PULSE — social map of Ilia, Greece</h1>
      <PulseApp />
    </main>
  );
}
