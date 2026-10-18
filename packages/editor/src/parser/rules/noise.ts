// Tracking (§9 layer 2) and noise scoring (layers 3–5) data.

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

// Noise scoring (§9 layers 3–5).

/** Class/id tokens that mark page furniture. Tokens are split on `-`, `_`, spaces, and camelCase. */
export const NEGATIVE_TOKENS = new Set([
  "ad", "ads", "advert", "sponsor", "promo", "share", "sharing", "social", "related", "recommended",
  "newsletter", "subscribe", "signup", "cookie", "consent", "gdpr", "popup", "modal", "comments",
  "disqus", "breadcrumb", "pagination", "toolbar", "sidebar", "widget", "menu", "skip", "outbrain", "taboola",
]);

/** Class/id tokens that mark the content itself. */
export const POSITIVE_TOKENS = new Set(["article", "content", "entry", "post", "body", "story", "text", "prose", "main"]);

/** Phrases that make up most of the text of page furniture. Matched case-insensitively. */
export const NOISE_PHRASES = [
  "share on", "follow us", "read more", "related", "sign up", "subscribe", "advertisement", "sponsored",
];

/** Elements whose content is never scored, so only whole containers are removed. */
export const PROTECTED_CONTENT = "blockquote, figure, table, pre, li";

/** Elements scored as possible page furniture. */
export const SCORED_CONTAINERS = new Set(["div", "section", "aside", "ul", "ol", "p"]);

/** Landmarks that are page furniture. `header`/`footer` only at page level. */
export const LANDMARKS = "nav, [role=navigation], [role=banner], [role=contentinfo], [role=search], header, footer";
