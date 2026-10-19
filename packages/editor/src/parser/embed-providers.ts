import type { EmbedProvider } from "./embeds";

// Every capture group is a restricted character class, so templates can't be steered to other hosts.

const query = (url: string, name: string) => new URLSearchParams(url.split(/[?#]/)[1] ?? "").get(name);
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (value: string) => esc(value).replace(/"/g, "&quot;");
const absolute = (href: string) => (href.startsWith("//") ? `https:${href}` : href);
/** The snippet's first link matching `pattern`, protocol-relative ones made `https:`. */
const linkIn = (el: Element, pattern: RegExp, last = false) => {
  const links = Array.from(el.querySelectorAll("a[href]")).map((a) => absolute(a.getAttribute("href")!.trim()));
  return (last ? links.reverse() : links).find((href) => pattern.test(href)) ?? null;
};
const pixels = (value: string | null | undefined) => {
  const n = Number(value?.match(/^\s*(\d{2,4})(?:px)?\s*$/)?.[1]);
  return n >= 80 && n <= 3000 ? n : undefined;
};

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
  snippet: {
    selector: "blockquote.tiktok-embed",
    url: (el) => el.getAttribute("cite") ?? linkIn(el, /tiktok\.com\/@[\w.-]+\/video\//),
    toHTML: (url, body, m) => `<blockquote class="tiktok-embed" cite="${attr(url)}" data-video-id="${m[1]}"><section>${body}</section></blockquote>`,
    script: "https://www.tiktok.com/embed.js",
  },
  toEmbed: (_url, m) => ({ src: `https://www.tiktok.com/embed/v2/${m[1]}`, aspectRatio: "9/16", maxWidth: 325 }),
};

const INSTAGRAM_POST = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]{5,40})/;
/** The bare post URL. Embed `src`s and permalinks carry tracking queries, including the embedding page's URL (`rd`, `rp`). */
const instagramPost = (url: string | null | undefined) => {
  const m = url ? INSTAGRAM_POST.exec(url) : null;
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/` : url;
};

const instagram: EmbedProvider = {
  name: "instagram",
  label: "Instagram",
  match: [INSTAGRAM_POST],
  frameOrigins: ["https://www.instagram.com"],
  fromIframe: (src) => (/^(?:www\.)?instagram\.com$/.test(src.host) ? instagramPost(src.href) : null),
  snippet: {
    selector: "blockquote.instagram-media",
    url: (el) => instagramPost(el.getAttribute("data-instgrm-permalink") ?? linkIn(el, /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|tv)\//)),
    toHTML: (url, body) => `<blockquote class="instagram-media" data-instgrm-permalink="${attr(url)}" data-instgrm-version="14">${body}</blockquote>`,
    script: "https://www.instagram.com/embed.js",
  },
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
  snippet: {
    selector: "blockquote.twitter-tweet, blockquote.twitter-video",
    url: (el) => linkIn(el, /\/status(?:es)?\/\d/, true),
    toHTML: (_url, body) => `<blockquote class="twitter-tweet">${body}</blockquote>`,
    script: "https://platform.twitter.com/widgets.js",
  },
  toEmbed: (_url, m) => ({ src: `https://platform.twitter.com/embed/Tweet.html?id=${m[2]}`, height: 500, maxWidth: 550 }),
};

const spotify: EmbedProvider = {
  name: "spotify",
  label: "Spotify",
  match: [/^https?:\/\/open\.spotify\.com\/(?:intl-[\w-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/(\w{10,40})/],
  frameOrigins: ["https://open.spotify.com"],
  fromIframe: (src) => (src.host === "open.spotify.com" ? `https://open.spotify.com${src.pathname.replace(/^\/embed\//, "/")}` : null),
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
  fromIframe: (src) => (src.host === "codepen.io" ? `https://codepen.io${src.pathname.replace(/\/embed\/(?:preview\/)?/, "/pen/")}` : null),
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
  fromIframe: (src) => (/^(?:www\.)?dailymotion\.com$/.test(src.host) ? `https://www.dailymotion.com${src.pathname.replace(/^\/embed\/video\//, "/video/")}` : null),
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
  fromIframe: (src) => (src.host === "codesandbox.io" ? `https://codesandbox.io${src.pathname.replace(/^\/embed\//, "/s/")}` : null),
  toEmbed: (_url, m) => ({ src: `https://codesandbox.io/embed/${m[1]}`, height: 500 }),
};

const googleDocs: EmbedProvider = {
  name: "googleDocs",
  label: "Google Docs",
  match: [/^https?:\/\/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]{20,80})/],
  frameOrigins: ["https://docs.google.com"],
  fromIframe: (src) => (src.host === "docs.google.com" ? `https://docs.google.com${src.pathname.replace(/\/(?:embed|preview|pub|pubhtml)$/, "/edit")}` : null),
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
  fromIframe: (src) => (src.host === "airtable.com" ? `https://airtable.com${src.pathname.replace(/^\/embed\//, "/")}` : null),
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
  fromIframe: (src) => (src.host === "miro.com" ? `https://miro.com${src.pathname.replace(/\/live-embed\//, "/board/")}` : null),
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

const threads: EmbedProvider = {
  name: "threads",
  label: "Threads",
  match: [/^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@([\w.]{1,40})\/post\/([\w-]{5,20})/],
  // threads.com sends X-Frame-Options: DENY; the threads.net frame is the one embed.js uses.
  frameOrigins: ["https://www.threads.net"],
  fromIframe: (src) => (/^(?:www\.)?threads\.(?:net|com)$/.test(src.host) ? `https://www.threads.net${src.pathname.replace(/\/embed\/?$/, "")}` : null),
  snippet: {
    selector: "blockquote.text-post-media",
    url: (el) => el.getAttribute("data-text-post-permalink") ?? linkIn(el, /threads\.(?:net|com)\/@[\w.]+\/post\//),
    toHTML: (url, body) => `<blockquote class="text-post-media" data-text-post-permalink="${attr(url)}" data-text-post-version="0">${body}</blockquote>`,
    script: "https://www.threads.net/embed.js",
  },
  toEmbed: (_url, m) => ({ src: `https://www.threads.net/@${m[1]}/post/${m[2]}/embed/`, height: 560, maxWidth: 540 }),
};

const AT_POST = /^at:\/\/(did:(?:plc:[a-z2-7]{24}|web:[\w.-]{1,100}))\/app\.bsky\.feed\.post\/([a-z2-7]{13})$/;

const bluesky: EmbedProvider = {
  name: "bluesky",
  label: "Bluesky",
  // Only DID URLs: embed.bsky.app can't frame a handle (it answers 400), and resolving one needs a request.
  match: [/^https?:\/\/bsky\.app\/profile\/(did:(?:plc:[a-z2-7]{24}|web:[\w.-]{1,100}))\/post\/([a-z2-7]{13})/],
  frameOrigins: ["https://embed.bsky.app"],
  fromIframe: (src) => {
    const m = src.host === "embed.bsky.app" && `at:/${src.pathname.replace(/^\/embed/, "")}`.match(AT_POST);
    return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : null;
  },
  snippet: {
    selector: "blockquote.bluesky-embed",
    url: (el) => {
      const m = el.getAttribute("data-bluesky-uri")?.trim().match(AT_POST);
      return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : linkIn(el, /bsky\.app\/profile\/did:[^/]+\/post\//, true);
    },
    toHTML: (_url, body, m) => `<blockquote class="bluesky-embed" data-bluesky-uri="at://${attr(m[1])}/app.bsky.feed.post/${m[2]}">${body}</blockquote>`,
    script: "https://embed.bsky.app/static/embed.js",
  },
  toEmbed: (_url, m) => ({ src: `https://embed.bsky.app/embed/${m[1]}/app.bsky.feed.post/${m[2]}`, height: 420, maxWidth: 600 }),
};

const reddit: EmbedProvider = {
  name: "reddit",
  label: "Reddit",
  match: [/^https?:\/\/(?:www\.|old\.|new\.|sh\.)?reddit\.com\/r\/(\w{2,21})\/comments\/([a-z0-9]{3,12})(?:\/([\w%-]{1,150}))?(?:\/([a-z0-9]{3,12}))?/i],
  frameOrigins: ["https://embed.reddit.com"],
  fromIframe: (src) => (src.host === "embed.reddit.com" ? `https://www.reddit.com${src.pathname}` : null),
  snippet: {
    selector: "blockquote.reddit-embed-bq, blockquote.reddit-card",
    url: (el) => linkIn(el, /reddit\.com\/r\/\w+\/comments\//),
    size: (el) => {
      const height = pixels(el.getAttribute("data-embed-height")) ?? pixels(el.getAttribute("style")?.match(/(?:^|;)\s*height\s*:\s*([^;]+)/)?.[1]);
      return height ? { height } : undefined;
    },
    toHTML: (_url, body) => `<blockquote class="reddit-embed-bq">${body}</blockquote>`,
    script: "https://embed.reddit.com/widgets.js",
  },
  toEmbed: (_url, m) => ({
    src: `https://embed.reddit.com/r/${m[1]}/comments/${m[2]}/${m[3] ?? "_"}/${m[4] ? `${m[4]}/` : ""}?embed=true`,
    height: 400,
    maxWidth: 640,
  }),
};

const fbPage = (m: RegExpMatchArray) =>
  m[1] === "watch"
    ? `https://www.facebook.com/watch/?v=${m[2]}`
    : m[1] === "reel"
      ? `https://www.facebook.com/reel/${m[2]}`
      : m[1] === "permalink"
        ? `https://www.facebook.com/permalink.php?story_fbid=${m[2]}&id=${m[3]}`
        : `https://www.facebook.com/${m[1]}/${m[2]}/${m[3]}/`;
const fbVideo = (m: RegExpMatchArray) => m[1] === "watch" || m[1] === "reel" || m[2] === "videos";

const facebook: EmbedProvider = {
  name: "facebook",
  label: "Facebook",
  match: [
    /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/([\w.-]{1,80})\/(posts|videos)\/([\w.-]{1,80})/,
    /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/(watch)\/?\?(?:[^#]*&)?v=(\d{5,25})/,
    /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/(reel)\/(\d{5,25})/,
    /^https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/(permalink)\.php\?(?:[^#]*&)?story_fbid=([\w-]{5,60})&id=(\d{1,25})/,
  ],
  frameOrigins: ["https://www.facebook.com"],
  fromIframe: (src) => (/^(?:www\.)?facebook\.com$/.test(src.host) && /^\/plugins\/(?:post|video)\.php$/.test(src.pathname) ? src.searchParams.get("href") : null),
  snippet: {
    selector: "div.fb-post, div.fb-video, blockquote.fb-xfbml-parse-ignore",
    url: (el) => el.getAttribute("data-href") ?? el.getAttribute("cite") ?? el.querySelector("blockquote[cite]")?.getAttribute("cite"),
    toHTML: (url, body, m) =>
      `<div class="fb-${fbVideo(m) ? "video" : "post"}" data-href="${attr(url)}" data-width="500" data-show-text="true">` +
      `<blockquote cite="${attr(url)}" class="fb-xfbml-parse-ignore">${body}</blockquote></div>`,
    script: "https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v21.0",
  },
  toEmbed: (_url, m) => {
    const video = fbVideo(m);
    const src = `https://www.facebook.com/plugins/${video ? "video" : "post"}.php?href=${encodeURIComponent(fbPage(m))}&show_text=${video ? "false" : "true"}&width=500`;
    return video ? { src, aspectRatio: "16/9", maxWidth: 560 } : { src, height: 600, maxWidth: 500 };
  },
};

const pinterest: EmbedProvider = {
  name: "pinterest",
  label: "Pinterest",
  match: [/^https?:\/\/(?:[a-z]{2}\.|www\.)?pinterest\.(?:com|[a-z]{2}|co\.uk|com\.au|com\.mx)\/pin\/(?:[\w-]{0,120}--)?(\d{5,25})(?=[/?#]|$)/],
  frameOrigins: ["https://assets.pinterest.com"],
  fromIframe: (src) => {
    const id = src.host === "assets.pinterest.com" && src.pathname === "/ext/embed.html" && src.searchParams.get("id");
    return id && /^\d{5,25}$/.test(id) ? `https://www.pinterest.com/pin/${id}/` : null;
  },
  snippet: {
    selector: 'a[data-pin-do="embedPin"]',
    url: (el) => el.getAttribute("href"),
    toHTML: (url, _body, _m, lines) => `<a data-pin-do="embedPin" href="${attr(url)}">${esc(lines.join(" ") || url)}</a>`,
    script: "https://assets.pinterest.com/js/pinit.js",
  },
  toEmbed: (_url, m) => ({ src: `https://assets.pinterest.com/ext/embed.html?id=${m[1]}`, height: 620, maxWidth: 345 }),
};

const tumblr: EmbedProvider = {
  name: "tumblr",
  label: "Tumblr",
  // The frame needs the blog's key (`t:…`), which only the snippet carries, so its URL is the stored one.
  match: [/^https:\/\/embed\.tumblr\.com\/embed\/post\/([\w:-]{6,60})\/(\d{6,25})(?=[/?#]|$)/],
  frameOrigins: ["https://embed.tumblr.com"],
  fromIframe: (src) => (src.host === "embed.tumblr.com" ? `https://embed.tumblr.com${src.pathname.replace(/\/v2\/?$/, "")}` : null),
  snippet: {
    selector: "div.tumblr-post",
    url: (el) => el.getAttribute("data-href")?.replace(/[?#].*$/, "").replace(/\/v2\/?$/, ""),
    toHTML: (url, _body, _m, lines) => {
      const page = lines.find((line) => /^https:\/\/[\w.-]*tumblr\.com\/\S+$/.test(line)) ?? url;
      return `<div class="tumblr-post" data-href="${attr(url)}/v2"><a href="${attr(page)}">${esc(lines.join(" ") || page)}</a></div>`;
    },
    script: "https://assets.tumblr.com/post.js",
  },
  toEmbed: (_url, m) => ({ src: `https://embed.tumblr.com/embed/post/${m[1]}/${m[2]}/v2`, height: 500, maxWidth: 542 }),
};

/** Large Mastodon servers. Others still embed, as sandboxed generic frames, when the policy allows them. */
export const MASTODON_SERVERS = [
  "mastodon.social",
  "mastodon.online",
  "mstdn.social",
  "mas.to",
  "mastodon.world",
  "fosstodon.org",
  "hachyderm.io",
  "infosec.exchange",
  "techhub.social",
  "universeodon.com",
  "mastodon.art",
  "social.vivaldi.net",
];
const mastodonHost = MASTODON_SERVERS.map((host) => host.replace(/\./g, "\\.")).join("|");

const mastodon: EmbedProvider = {
  name: "mastodon",
  label: "Mastodon",
  match: [new RegExp(`^https://(${mastodonHost})/@([\\w.-]{1,30})/(\\d{6,25})(?=[/?#]|$)`)],
  frameOrigins: MASTODON_SERVERS.map((host) => `https://${host}`),
  fromIframe: (src) => (MASTODON_SERVERS.includes(src.host) ? `https://${src.host}${src.pathname.replace(/\/embed\/?$/, "")}` : null),
  snippet: {
    selector: "blockquote.mastodon-embed",
    url: (el) => el.getAttribute("data-embed-url")?.replace(/\/embed\/?$/, "") ?? linkIn(el, /^https:\/\/[^/]+\/@[\w.-]+\/\d+/),
    frame: (el) => el.getAttribute("data-embed-url"),
    toHTML: (url, body) => `<blockquote class="mastodon-embed" data-embed-url="${attr(url)}/embed">${body}</blockquote>`,
    script: (_url, m) => ({ src: `https://${m[1]}/embed.js`, attrs: { "data-allowed-prefixes": `https://${m[1]}/` } }),
  },
  toEmbed: (_url, m) => ({ src: `https://${m[1]}/@${m[2]}/${m[3]}/embed`, height: 420, maxWidth: 540 }),
};

const linkedin: EmbedProvider = {
  name: "linkedin",
  label: "LinkedIn",
  match: [
    /^https?:\/\/(?:www\.)?linkedin\.com\/(?:embed\/)?feed\/update\/(urn:li:(?:share|activity|ugcPost):\d{10,25})/,
    /^https?:\/\/(?:www\.)?linkedin\.com\/posts\/[\w%.-]{1,200}-(activity|share|ugcPost)-(\d{10,25})/,
  ],
  frameOrigins: ["https://www.linkedin.com"],
  fromIframe: (src) => {
    const urn = /^(?:www\.)?linkedin\.com$/.test(src.host) && src.pathname.match(/^\/embed\/feed\/update\/(urn:li:\w+:\d+)\/?$/)?.[1];
    return urn ? `https://www.linkedin.com/feed/update/${urn}/` : null;
  },
  toEmbed: (_url, m) => ({ src: `https://www.linkedin.com/embed/feed/update/${m[2] ? `urn:li:${m[1]}:${m[2]}` : m[1]}`, height: 570, maxWidth: 504 }),
};

const IMGUR_ID = /^(a\/)?([a-zA-Z0-9]{5,8})$/;

const imgur: EmbedProvider = {
  name: "imgur",
  label: "Imgur",
  // An id has a digit or capital, so pages such as /upload or /about aren't taken for images.
  match: [/^https?:\/\/(?:www\.|m\.)?imgur\.com\/(?:(a|gallery)\/)?(?:[\w-]{1,120}-)?((?=[a-z]*[A-Z0-9])[a-zA-Z0-9]{5,8})(?=[/?#.]|$)/],
  frameOrigins: ["https://imgur.com"],
  fromIframe: (src) => {
    const m = /^(?:www\.)?imgur\.com$/.test(src.host) && src.pathname.match(/^\/((?:a\/)?[a-zA-Z0-9]{5,8})\/embed\/?$/);
    return m ? `https://imgur.com/${m[1]}` : null;
  },
  snippet: {
    selector: "blockquote.imgur-embed-pub",
    url: (el) => {
      const id = el.getAttribute("data-id")?.trim();
      return id && IMGUR_ID.test(id) ? `https://imgur.com/${id}` : linkIn(el, /imgur\.com\//);
    },
    toHTML: (_url, body, m) => `<blockquote class="imgur-embed-pub" lang="en" data-id="${m[1] ? "a/" : ""}${m[2]}">${body}</blockquote>`,
    script: "https://s.imgur.com/min/embed.js",
  },
  toEmbed: (_url, m) => ({ src: `https://imgur.com/${m[1] ? "a/" : ""}${m[2]}/embed?pub=true`, height: 500, maxWidth: 540 }),
};

const flickr: EmbedProvider = {
  name: "flickr",
  label: "Flickr",
  match: [/^https?:\/\/(?:www\.)?flickr\.com\/photos\/([\w@-]{1,60})\/(\d{5,15})(?=[/?#]|$)/],
  frameOrigins: ["https://www.flickr.com"],
  fromIframe: (src) => (/^(?:www\.)?flickr\.com$/.test(src.host) ? `https://www.flickr.com${src.pathname.replace(/\/player\/?$/, "/")}` : null),
  // No `toHTML`: Flickr's script needs the photo's <img>, which isn't stored, so exports keep our player frame.
  snippet: {
    selector: 'a[data-flickr-embed="true"]',
    url: (el) => el.getAttribute("href"),
    text: (el) => el.getAttribute("title") ?? el.querySelector("img")?.getAttribute("alt") ?? "",
    size: (el) => {
      const img = el.querySelector("img");
      const width = Number(img?.getAttribute("width"));
      const height = Number(img?.getAttribute("height"));
      return width > 0 && height > 0 ? { aspectRatio: `${width}/${height}` } : undefined;
    },
  },
  toEmbed: (_url, m) => ({ src: `https://www.flickr.com/photos/${m[1]}/${m[2]}/player/`, aspectRatio: "4/3" }),
};

const giphy: EmbedProvider = {
  name: "giphy",
  label: "GIPHY",
  match: [
    /^https?:\/\/(?:www\.)?giphy\.com\/(?:gifs|clips|stickers|embed)\/(?:[\w-]{0,120}-)?([a-zA-Z0-9]{8,24})(?=[/?#]|$)/,
    /^https?:\/\/media\d?\.giphy\.com\/media\/(?:v1\.[\w.-]{1,400}\/)?([a-zA-Z0-9]{8,24})\//,
  ],
  frameOrigins: ["https://giphy.com"],
  pastedSize: true,
  fromIframe: (src) => {
    const id = /^(?:www\.)?giphy\.com$/.test(src.host) && src.pathname.match(/^\/embed\/([a-zA-Z0-9]{8,24})\/?$/)?.[1];
    return id ? `https://giphy.com/gifs/${id}` : null;
  },
  toEmbed: (_url, m) => ({ src: `https://giphy.com/embed/${m[1]}`, aspectRatio: "4/3", maxWidth: 480 }),
};

const telegram: EmbedProvider = {
  name: "telegram",
  label: "Telegram",
  match: [/^https?:\/\/t\.me\/(?:s\/)?([a-zA-Z]\w{3,31})\/(\d{1,10})(?=[/?#]|$)/],
  frameOrigins: ["https://t.me"],
  fromIframe: (src) => (src.host === "t.me" ? `https://t.me${src.pathname}` : null),
  // The snippet is a script alone: only its data-telegram-post attribute is read.
  snippet: {
    selector: "script[data-telegram-post]",
    url: (el) => {
      const post = el.getAttribute("data-telegram-post")?.trim();
      return post && /^[a-zA-Z]\w{3,31}\/\d{1,10}$/.test(post) ? `https://t.me/${post}` : null;
    },
    toHTML: (_url, body) => body,
    script: (_url, m) => ({ src: "https://telegram.org/js/telegram-widget.js?22", attrs: { "data-telegram-post": `${m[1]}/${m[2]}`, "data-width": "100%" } }),
  },
  toEmbed: (_url, m) => ({ src: `https://t.me/${m[1]}/${m[2]}?embed=1`, height: 360, maxWidth: 550 }),
};

const gist: EmbedProvider = {
  name: "gist",
  label: "GitHub Gist",
  match: [/^https:\/\/gist\.github\.com\/([\w-]{1,39})\/(\d{1,12}|[\da-f]{20,40})(?=[/?#.]|$)/],
  // Gists have no frame URL: the official script writes the gist into the page, so it runs in a sandboxed widget frame.
  render: "widget",
  frameOrigins: ["https://gist.github.com"],
  snippet: {
    selector: 'script[src^="https://gist.github.com/"]',
    url: (el) => el.getAttribute("src")?.replace(/[?#].*$/, "").replace(/\.js$/, ""),
    script: (_url, m) => ({ src: `https://gist.github.com/${m[1]}/${m[2]}.js` }),
  },
  toEmbed: (_url, m) => ({ src: `https://gist.github.com/${m[1]}/${m[2]}.js`, height: 400 }),
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
  threads,
  bluesky,
  reddit,
  facebook,
  pinterest,
  tumblr,
  mastodon,
  linkedin,
  imgur,
  flickr,
  giphy,
  telegram,
  gist,
];
