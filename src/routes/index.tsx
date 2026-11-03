import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

const PulseApp = lazy(() =>
  import("@/components/hp/PulseApp").then((module) => ({
    default: module.PulseApp,
  })),
);

const TrafficPreview = lazy(() =>
  import("@/components/hp/TrafficPreview").then((module) => ({
    default: module.TrafficPreview,
  })),
);

export const Route = createFileRoute("/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): Record<string, unknown> & { trafficPreview?: boolean } => {
    const trafficPreview = search.trafficPreview === "1" || search.trafficPreview === 1;
    return trafficPreview ? { ...search, trafficPreview } : search;
  },
  component: Index,
});

function Index() {
  const { trafficPreview } = Route.useSearch();

  if (import.meta.env.DEV && trafficPreview) {
    return (
      <ClientOnly fallback={<PreviewLoading />}>
        <LocalTrafficPreview />
      </ClientOnly>
    );
  }

  return (
    <main className="min-h-[100dvh] w-full bg-hp-bg">
      <h1 className="sr-only">ΗΛΕΙΑ PULSE — social map of Ilia, Greece</h1>
      <Suspense fallback={<PreviewLoading />}>
        <PulseApp />
      </Suspense>
    </main>
  );
}

function PreviewLoading() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-hp-bg text-sm text-hp-muted">
      Loading local traffic preview…
    </main>
  );
}

function LocalTrafficPreview() {
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]") {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-hp-bg px-4 text-center text-sm text-hp-muted">
        The traffic preview is available only on localhost.
      </main>
    );
  }

  return (
    <Suspense fallback={<PreviewLoading />}>
      <TrafficPreview />
    </Suspense>
  );
}
