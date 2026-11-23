/** Provider detection for embeds (build time: iframe upgrade, validate; runtime logic mirrors it in components/embed.js). */
const YT = /^(?:https?:)?\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/i;
const VIMEO = /^(?:https?:)?\/\/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/i;
const LOOM = /^(?:https?:)?\/\/(?:www\.)?loom\.com\/(?:embed|share)\/([\w]+)/i;
const VIDEO_FILE = /\.(mp4|webm|ogv|mov|m4v)(?:[?#].*)?$/i;

/** @returns {{provider:'youtube'|'vimeo'|'loom'|'video'|'generic',id?:string}|null} */
export function embedInfo(src) {
  const s = String(src || '').trim();
  if (!s) return null;
  let m;
  if ((m = YT.exec(s))) return { provider: 'youtube', id: m[1] };
  if ((m = VIMEO.exec(s))) return { provider: 'vimeo', id: m[1] };
  if ((m = LOOM.exec(s))) return { provider: 'loom', id: m[1] };
  if (VIDEO_FILE.test(s)) return { provider: 'video' };
  return { provider: 'generic' };
}
