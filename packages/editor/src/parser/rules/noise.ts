// Tracking layer (§9 layer 2). Noise scoring (layers 3–5) is phase 2.

/** Image and iframe hosts that are trackers or ad servers. */
export const TRACKER_HOSTS = [
  "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com",
  "googletagmanager.com", "googletagservices.com", "scorecardresearch.com", "quantserve.com",
  "amazon-adsystem.com", "taboola.com", "outbrain.com", "adnxs.com", "criteo.com", "criteo.net",
  "moatads.com", "pixel.wp.com", "stats.wp.com", "bat.bing.com", "analytics.twitter.com",
  "ads-twitter.com", "ct.pinterest.com", "px.ads.linkedin.com", "pubmatic.com", "rubiconproject.com",
  "chartbeat.com", "chartbeat.net", "parsely.com", "hotjar.com", "mc.yandex.ru",
];

/** Tracker paths on otherwise normal hosts. */
export const TRACKER_PATHS = [/facebook\.com\/tr\b/i, /t\.co\/i\/adsct/i, /\/pixel(\.gif|\.png)?(\?|$)/i];

/** Link query parameters removed from every `href`. */
export const TRACKING_PARAMS = /^(utm_[a-z_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|mkt_tok)$/i;

/** `data-*` attributes used for analytics. */
export const TRACKING_DATA_ATTRIBUTE = /^data-(ga|gtm|track|tracking|analytics|event)/i;

/** Redirect wrappers unwrapped to their target: host + path, and the parameter holding the target. */
export const REDIRECT_WRAPPERS: { host: RegExp; path: RegExp; param: string }[] = [
  { host: /(^|\.)google\.[a-z.]+$/i, path: /^\/url$/, param: "q" },
  { host: /^l\.facebook\.com$/i, path: /^\/l\.php$/, param: "u" },
  { host: /^lm\.facebook\.com$/i, path: /^\/l\.php$/, param: "u" },
  { host: /^out\.reddit\.com$/i, path: /^\//, param: "url" },
  { host: /^(www\.)?linkedin\.com$/i, path: /^\/redir\/redirect/, param: "url" },
];

/** `src` values that are lazy-loading placeholders, not the image. */
export const PLACEHOLDER_SRC =
  /^data:image\/(gif|png|svg\+xml)[;,].{0,300}$|(^|\/)(blank|spacer|pixel|transparent|placeholder|lazy[-_]?placeholder|grey|gray)\.(gif|png|svg)(\?|$)/i;

/** Attributes that hold the real image URL on lazy-loaded images, in priority order. */
export const LAZY_SRC_ATTRIBUTES = ["data-src", "data-lazy-src", "data-original", "data-orig-src", "data-hi-res-src"];
export const LAZY_SRCSET_ATTRIBUTES = ["data-srcset", "data-lazy-srcset"];
