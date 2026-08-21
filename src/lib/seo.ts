export const SITE_TITLE = "ΗΛΕΙΑ PULSE | Social map of Ilia, Greece";
export const SITE_NAME = "ΗΛΕΙΑ PULSE";
export const SITE_DESCRIPTION =
  "Live local map of Ilia, Greece: beaches, routes, food, events, sunsets, and village nights.";
export const SITE_IMAGE = "/social/ilia-pulse-share.png";
export const SITE_IMAGE_ALT = "ΗΛΕΙΑ PULSE logo with an orange map pin over blue waves";
export const THEME_COLOR = "#fbf6ea";

export const siteMeta = [
  { title: SITE_TITLE },
  { name: "description", content: SITE_DESCRIPTION },
  { name: "application-name", content: SITE_NAME },
  { name: "author", content: SITE_NAME },
  { name: "robots", content: "index, follow" },
  { name: "theme-color", content: THEME_COLOR },
  { name: "color-scheme", content: "light" },
  { property: "og:site_name", content: SITE_NAME },
  { property: "og:title", content: SITE_TITLE },
  { property: "og:description", content: SITE_DESCRIPTION },
  { property: "og:type", content: "website" },
  { property: "og:locale", content: "el_GR" },
  { property: "og:image", content: SITE_IMAGE },
  { property: "og:image:type", content: "image/png" },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:image:alt", content: SITE_IMAGE_ALT },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: SITE_TITLE },
  { name: "twitter:description", content: SITE_DESCRIPTION },
  { name: "twitter:image", content: SITE_IMAGE },
  { name: "twitter:image:alt", content: SITE_IMAGE_ALT },
];

export const siteLinks = [
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/brand/favicon-16.png" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/brand/favicon-32.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/brand/apple-touch-icon.png" },
];
