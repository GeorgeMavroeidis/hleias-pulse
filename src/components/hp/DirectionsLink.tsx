import { Capacitor } from "@capacitor/core";
import { Navigation } from "lucide-react";
import { useState, type MouseEvent } from "react";
import type { RouteRoutingProfile } from "@/lib/hp-model";
import {
  googleMapsDirectionsUrl,
  openExternalNavigation,
  type NavigationDestination,
} from "@/lib/hp/route-navigation";
import { useI18n } from "@/lib/i18n";

export function DirectionsLink({
  destination,
  profile = "driving-car",
  className,
}: {
  destination: NavigationDestination;
  profile?: RouteRoutingProfile;
  className?: string;
}) {
  const { t } = useI18n();
  const href = googleMapsDirectionsUrl(destination, profile);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const browserFallback = failedUrl === href;

  function openDirections(event: MouseEvent<HTMLAnchorElement>) {
    if (
      Capacitor.getPlatform() !== "ios" ||
      browserFallback ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void openExternalNavigation("google", destination, profile).catch(() => setFailedUrl(href));
  }

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={t("Directions to {place} in Google Maps", { place: destination.label })}
        onClick={openDirections}
      >
        <Navigation size={15} aria-hidden="true" />
        {t("Directions")}
      </a>
      {browserFallback && (
        <span role="status" className="w-full text-[11px] text-hp-muted">
          {t("Could not open the app. Tap Directions to open Google Maps in your browser.")}
        </span>
      )}
    </>
  );
}
