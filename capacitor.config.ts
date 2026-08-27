/// <reference types="@capacitor/status-bar" />

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.theodoros.iliapulse",
  appName: "Ilia Pulse",
  webDir: "cloudflare-static-dist",
  ios: {
    zoomEnabled: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#fff8ed",
    },
  },
};

export default config;
