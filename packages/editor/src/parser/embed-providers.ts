import type { EmbedProvider } from "./embeds";

// Every capture group is a restricted character class, so templates can't be steered to other hosts.

const classOf = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
const query = (url: string, name: string) => new URLSearchParams(url.split(/[?#]/)[1] ?? "").get(name);

const youtube: EmbedProvider = {
  name: "youtube",
  label: "YouTube",
  match: [
    /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{11})/,
    /^https?:\/\/youtu\.be\/([\w-]{11})/,
    /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts|live|embed)\/([\w-]{11})/,
  ],
  frameOrigins: ["https://www.youtube-nocookie.com"],
  fromIframe: (src) => {
    const id = /^(?:www\.)?youtube(?:-nocookie)?\.com$/.test(src.host) && src.pathname.match(/^\/embed\/([\w-]{11})$/)?.[1];
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  },
  toEmbed: (url, m) => {
    const start = (query(url, "t") ?? query(url, "start"))?.match(/^(\d+)s?$/)?.[1];
    const shorts = /\/shorts\//.test(url);
    return {
      src: `https://www.youtube-nocookie.com/embed/${m[1]}${start ? `?start=${start}` : ""}`,
      aspectRatio: shorts ? "9/16" : "16/9",
      maxWidth: shorts ? 360 : undefined,
    };
  },
};

const vimeo: EmbedProvider = {
  name: "vimeo",
  label: "Vimeo",
  match: [/^https?:\/\/(?:www\.)?vimeo\.com\/(?:channels\/[\w-]+\/|groups\/[\w-]+\/videos\/)?(\d+)(?:\/([\da-f]{6,20}))?(?:[/?#]|$)/],
  frameOrigins: ["https://player.vimeo.com"],
  fromIframe: (src) => {
    const id = src.host === "player.vimeo.com" && src.pathname.match(/^\/video\/(\d+)$/)?.[1];
    const hash = src.searchParams.get("h");
    return id ? `https://vimeo.com/${id}${hash && /^[\da-f]{6,20}$/.test(hash) ? `/${hash}` : ""}` : null;
  },
  toEmbed: (_url, m) => ({ src: `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ""}`, aspectRatio: "16/9" }),
};

const tiktok: EmbedProvider = {
  name: "tiktok",
  label: "TikTok",
  match: [/^https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d{8,25})/, /^https?:\/\/(?:www\.)?tiktok\.com\/embed\/(?:v2\/)?(\d{8,25})/],
  frameOrigins: ["https://www.tiktok.com"],
  fromHTML: (el) => (classOf(el).includes("tiktok-embed") ? el.getAttribute("cite") : null),
  toEmbed: (_url, m) => ({ src: `https://www.tiktok.com/embed/v2/${m[1]}`, aspectRatio: "9/16", maxWidth: 325 }),
};

const instagram: EmbedProvider = {
  name: "instagram",
  label: "Instagram",
  match: [/^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]{5,40})/],
  frameOrigins: ["https://www.instagram.com"],
  fromHTML: (el) => (classOf(el).includes("instagram-media") ? el.getAttribute("data-instgrm-permalink") : null),
  toEmbed: (_url, m) => ({ src: `https://www.instagram.com/${m[1]}/${m[2]}/embed`, height: 540, maxWidth: 540 }),
};

const twitter: EmbedProvider = {
  name: "twitter",
  label: "X",
  match: [/^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/(\w{1,15})\/status(?:es)?\/(\d{1,25})/],
  frameOrigins: ["https://platform.twitter.com"],
  fromIframe: (src) => {
    const id = src.host === "platform.twitter.com" && /^\/embed\/Tweet\.html$/.test(src.pathname) && src.searchParams.get("id");
    return id && /^\d{1,25}$/.test(id) ? `https://x.com/i/status/${id}` : null;
  },
  fromHTML: (el) => {
    if (!classOf(el).some((c) => c === "twitter-tweet" || c === "twitter-video")) return null;
    const links = [...el.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
    return links.reverse().find((href) => /\/status(?:es)?\/\d/.test(href)) ?? null;
  },
  toEmbed: (_url, m) => ({ src: `https://platform.twitter.com/embed/Tweet.html?id=${m[2]}`, height: 500, maxWidth: 550 }),
};

const spotify: EmbedProvider = {
  name: "spotify",
  label: "Spotify",
  match: [/^https?:\/\/open\.spotify\.com\/(?:intl-[\w-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/(\w{10,40})/],
  frameOrigins: ["https://open.spotify.com"],
  toEmbed: (_url, m) => ({ src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === "track" || m[1] === "episode" ? 152 : 352 }),
};

const loom: EmbedProvider = {
  name: "loom",
  label: "Loom",
  match: [/^https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([\da-f]{32})/],
  frameOrigins: ["https://www.loom.com"],
  fromIframe: (src) => (/^(?:www\.)?loom\.com$/.test(src.host) ? src.href.replace(/\/embed\//, "/share/") : null),
  toEmbed: (_url, m) => ({ src: `https://www.loom.com/embed/${m[1]}`, aspectRatio: "16/9" }),
};

const codepen: EmbedProvider = {
  name: "codepen",
  label: "CodePen",
  match: [/^https?:\/\/codepen\.io\/([\w-]{1,40})\/(?:pen|embed|embed\/preview|full|details)\/(\w{3,20})/],
  frameOrigins: ["https://codepen.io"],
  toEmbed: (_url, m) => ({ src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`, height: 400 }),
};

const figma: EmbedProvider = {
  name: "figma",
  label: "Figma",
  match: [/^https?:\/\/(?:www\.|embed\.)?figma\.com\/(file|design|proto|board|slides|deck)\/(\w{10,40})(?:\/[^?#\s]*)?/],
  frameOrigins: ["https://embed.figma.com"],
  fromIframe: (src) => {
    if (src.host === "embed.figma.com") return src.href.replace("//embed.figma.com/", "//www.figma.com/");
    if (/^(?:www\.)?figma\.com$/.test(src.host) && src.pathname === "/embed") return src.searchParams.get("url");
    return null;
  },
  toEmbed: (url, m) => {
    const node = query(url, "node-id")?.match(/^[\w:-]{1,40}$/)?.[0];
    return { src: `https://embed.figma.com/${m[1]}/${m[2]}?embed-host=genesis${node ? `&node-id=${encodeURIComponent(node)}` : ""}`, aspectRatio: "16/9" };
  },
};

const googleMaps: EmbedProvider = {
  name: "googleMaps",
  label: "Google Maps",
  match: [
    /^https:\/\/www\.google\.com\/maps\/embed\?pb=([\w!.%:*-]{10,2000})$/,
    /^https?:\/\/(?:www\.)?google\.[a-z.]{2,6}\/maps\/(?:place|search)\/([^/?#\s]{1,200})/,
    /^https?:\/\/(?:maps|www)\.google\.[a-z.]{2,6}\/maps\?(?:[^#]*&)?q=([^&#\s]{1,200})/,
  ],
  frameOrigins: ["https://www.google.com", "https://maps.google.com"],
  toEmbed: (url, m) =>
    url.includes("/maps/embed?")
      ? { src: `https://www.google.com/maps/embed?pb=${m[1]}`, aspectRatio: "4/3" }
      : { src: `https://maps.google.com/maps?q=${encodeURIComponent(decodeURIComponent(m[1].replace(/\+/g, " ")))}&output=embed`, aspectRatio: "4/3" },
};

const dailymotion: EmbedProvider = {
  name: "dailymotion",
  label: "Dailymotion",
  match: [/^https?:\/\/(?:www\.)?dailymotion\.com\/(?:embed\/)?video\/([a-z\d]{5,12})/i, /^https?:\/\/dai\.ly\/([a-z\d]{5,12})/i],
  frameOrigins: ["https://www.dailymotion.com"],
  toEmbed: (_url, m) => ({ src: `https://www.dailymotion.com/embed/video/${m[1]}`, aspectRatio: "16/9" }),
};

const soundcloud: EmbedProvider = {
  name: "soundcloud",
  label: "SoundCloud",
  match: [/^https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[\w-]{1,60}\/(?:sets\/)?[\w-]{1,120}\/?(?=[?#]|$)/, /^https:\/\/api\.soundcloud\.com\/(?:tracks|playlists)\/\d{1,15}$/],
  frameOrigins: ["https://w.soundcloud.com"],
  fromIframe: (src) => (src.host === "w.soundcloud.com" ? src.searchParams.get("url") : null),
  toEmbed: (_url, m) => ({
    src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(m[0].replace(/^http:/, "https:"))}&visual=false`,
    height: /\/sets\/|\/playlists\//.test(m[0]) ? 450 : 166,
  }),
};

const codesandbox: EmbedProvider = {
  name: "codesandbox",
  label: "CodeSandbox",
  match: [/^https?:\/\/codesandbox\.io\/(?:s|embed|p\/sandbox|p\/devbox)\/([\w-]{3,80})/],
  frameOrigins: ["https://codesandbox.io"],
  toEmbed: (_url, m) => ({ src: `https://codesandbox.io/embed/${m[1]}`, height: 500 }),
};

const googleDocs: EmbedProvider = {
  name: "googleDocs",
  label: "Google Docs",
  match: [/^https?:\/\/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]{20,80})/],
  frameOrigins: ["https://docs.google.com"],
  toEmbed: (_url, m) =>
    m[1] === "presentation"
      ? { src: `https://docs.google.com/presentation/d/${m[2]}/embed`, aspectRatio: "16/9" }
      : { src: `https://docs.google.com/${m[1]}/d/${m[2]}/preview`, height: 600 },
};

const airtable: EmbedProvider = {
  name: "airtable",
  label: "Airtable",
  match: [/^https?:\/\/airtable\.com\/(?:embed\/)?((?:app\w{10,20}\/)?shr\w{10,20})/],
  frameOrigins: ["https://airtable.com"],
  toEmbed: (_url, m) => ({ src: `https://airtable.com/embed/${m[1]}`, height: 533 }),
};

const typeform: EmbedProvider = {
  name: "typeform",
  label: "Typeform",
  match: [/^https?:\/\/[\w-]{1,60}\.typeform\.com\/to\/(\w{4,20})/],
  frameOrigins: ["https://form.typeform.com"],
  toEmbed: (_url, m) => ({ src: `https://form.typeform.com/to/${m[1]}`, height: 500 }),
};

const miro: EmbedProvider = {
  name: "miro",
  label: "Miro",
  match: [/^https?:\/\/miro\.com\/app\/(?:board|live-embed)\/([\w=-]{6,40})/],
  frameOrigins: ["https://miro.com"],
  toEmbed: (_url, m) => ({ src: `https://miro.com/app/live-embed/${m[1]}/`, aspectRatio: "4/3" }),
};

const canva: EmbedProvider = {
  name: "canva",
  label: "Canva",
  match: [/^https?:\/\/(?:www\.)?canva\.com\/design\/([\w-]{6,20})\/(?:([\w-]{6,40})\/)?(?:view|watch|edit)/],
  frameOrigins: ["https://www.canva.com"],
  toEmbed: (_url, m) => ({ src: `https://www.canva.com/design/${m[1]}/${m[2] ? `${m[2]}/` : ""}view?embed`, aspectRatio: "16/9" }),
};

const appleMusic: EmbedProvider = {
  name: "appleMusic",
  label: "Apple Music",
  match: [/^https?:\/\/(?:embed\.)?music\.apple\.com\/([a-z]{2})\/(album|playlist|song|station|music-video)\/([\w%.-]{1,120}\/)?([\w.-]{3,40})/],
  frameOrigins: ["https://embed.music.apple.com"],
  toEmbed: (url, m) => {
    const track = query(url, "i")?.match(/^\d{1,15}$/)?.[0];
    return {
      src: `https://embed.music.apple.com/${m[1]}/${m[2]}/${m[3] ?? ""}${m[4]}${track ? `?i=${track}` : ""}`,
      height: m[2] === "song" || track ? 175 : 450,
      maxWidth: 660,
    };
  },
};

const applePodcasts: EmbedProvider = {
  name: "applePodcasts",
  label: "Apple Podcasts",
  match: [/^https?:\/\/(?:embed\.)?podcasts\.apple\.com\/([a-z]{2})\/podcast\/([\w%.-]{1,120}\/)?(id\d{3,15})/],
  frameOrigins: ["https://embed.podcasts.apple.com"],
  toEmbed: (url, m) => {
    const episode = query(url, "i")?.match(/^\d{1,15}$/)?.[0];
    return {
      src: `https://embed.podcasts.apple.com/${m[1]}/podcast/${m[2] ?? ""}${m[3]}${episode ? `?i=${episode}` : ""}`,
      height: episode ? 175 : 450,
      maxWidth: 660,
    };
  },
};

/** The built-in providers, in match order. */
export const BUILT_IN_EMBED_PROVIDERS: readonly EmbedProvider[] = [
  youtube,
  vimeo,
  tiktok,
  instagram,
  twitter,
  spotify,
  loom,
  codepen,
  figma,
  googleMaps,
  dailymotion,
  soundcloud,
  codesandbox,
  googleDocs,
  airtable,
  typeform,
  miro,
  canva,
  appleMusic,
  applePodcasts,
];
