/**
 * Icon mapping for the MkDocs importer. Material for MkDocs icon shortcodes
 * (`:material-NAME:`, `:octicons-NAME-16:`, `:simple-NAME:`, `:fontawesome-STYLE-NAME:`) name icons from
 * Material Design Icons, Octicons, Simple Icons and Font Awesome. DocsLit bundles only Lucide and Font
 * Awesome Free (see ../icons.js), so every name is mapped to the closest bundled icon. A name with no
 * faithful match maps to nothing (the importer then removes the icon and reports it) rather than to a
 * misleading glyph. Mapping order: explicit table, then generic rules (decoration suffixes, size
 * suffixes, brand prefixes, Lucide-style `circle-X` / `square-X` swaps).
 */
import fs from 'fs';
import { resolveIcon } from '../icons.js';

let _fa;
const faData = () => (_fa ||= JSON.parse(fs.readFileSync(new URL('../icons/fa.json', import.meta.url), 'utf8')));
/** True when `name` really is a Font Awesome Free icon in `style` (resolveIcon alone would fall through to another style). */
function faHas(style, name) { const f = faData(); return Boolean(f[style]?.[name] || (f.aliases[name] && f[style]?.[f.aliases[name]])); }

// Material Design Icons -> Lucide / Font Awesome Free. A `brands:` / `regular:` prefix picks the FA style.
export const MDI_TABLE = {
  // status / feedback
  information: 'info', 'information-variant': 'info', alert: 'triangle-alert', 'alert-circle': 'circle-alert', 'alert-octagon': 'octagon-alert',
  'alert-decagram': 'badge-alert', 'check-decagram': 'badge-check', 'check-bold': 'check', 'check-all': 'check-check',
  'check-circle': 'circle-check', 'checkbox-marked-circle': 'circle-check', 'checkbox-marked': 'square-check', 'checkbox-marked-outline': 'square-check',
  'checkbox-blank': 'square', 'checkbox-blank-outline': 'square', 'checkbox-blank-circle': 'circle', 'checkbox-blank-circle-outline': 'circle',
  'radiobox-marked': 'circle-dot', 'radiobox-blank': 'circle', 'record-circle': 'circle-dot', 'circle-medium': 'circle', close: 'x', 'close-circle': 'circle-x',
  'close-box': 'square-x', 'close-thick': 'x', cancel: 'ban', help: 'circle-help', 'help-circle': 'circle-help', 'frequently-asked-questions': 'message-circle-question',
  'lightbulb-on': 'lightbulb', 'lightbulb-variant': 'lightbulb', 'thumb-up': 'thumbs-up', 'thumb-down': 'thumbs-down', 'shield-half-full': 'shield-half',
  'shield-account': 'shield-user', security: 'shield', 'shield-lock': 'shield', bell: 'bell',
  // arrows / chevrons / layout
  'arrow-top-left': 'arrow-up-left', 'arrow-top-right': 'arrow-up-right', 'arrow-bottom-left': 'arrow-down-left', 'arrow-bottom-right': 'arrow-down-right',
  'arrow-expand': 'maximize-2', 'arrow-collapse': 'minimize-2', 'arrow-expand-all': 'maximize', 'arrow-collapse-all': 'minimize',
  'chevron-double-right': 'chevrons-right', 'chevron-double-left': 'chevrons-left', 'chevron-double-up': 'chevrons-up', 'chevron-double-down': 'chevrons-down',
  'swap-horizontal': 'arrow-left-right', 'swap-vertical': 'arrow-up-down', 'open-in-new': 'external-link', 'exit-to-app': 'log-out', login: 'log-in', logout: 'log-out',
  'dots-horizontal': 'ellipsis', 'dots-vertical': 'ellipsis-vertical', 'menu-open': 'menu', 'drag-vertical': 'grip-vertical', 'drag-horizontal': 'grip-horizontal',
  'view-dashboard': 'layout-dashboard', 'view-grid': 'layout-grid', 'view-module': 'layout-grid', 'view-list': 'list', 'view-column': 'columns-3',
  'view-split-vertical': 'columns-2', 'page-layout-sidebar-left': 'panel-left', 'page-layout-sidebar-right': 'panel-right', 'page-layout-header': 'panel-top',
  'page-layout-footer': 'panel-bottom', application: 'app-window', 'application-outline': 'app-window', 'dock-window': 'app-window', tab: 'panel-top',
  grid: 'grid-3x3', 'layers-triple': 'layers', 'sort-ascending': 'arrow-up-narrow-wide', 'sort-descending': 'arrow-down-wide-narrow', tune: 'sliders-horizontal',
  'tune-vertical': 'sliders-vertical',
  // people / social
  account: 'user', 'account-circle': 'circle-user', 'account-group': 'users', 'account-multiple': 'users', 'account-plus': 'user-plus', 'account-check': 'user-check',
  'account-cog': 'user-cog', 'account-key': 'key-round', 'account-box': 'square-user', 'account-minus': 'user-minus', 'account-off': 'user-x', 'account-remove': 'user-x',
  'account-search': 'user-search', 'account-tie': 'user-round', incognito: 'user-secret', 'emoticon-happy': 'smile', 'emoticon-sad': 'frown', 'emoticon-neutral': 'meh',
  'emoticon-excited': 'laugh', 'emoticon-wink': 'smile-plus', handshake: 'handshake', 'hand-wave': 'hand', 'share-variant': 'share-2', 'share-circle': 'share-2',
  'chat-outline': 'message-circle', chat: 'message-circle', message: 'message-square', 'message-text': 'message-square-text', 'comment-text': 'message-square-text',
  comment: 'message-square', 'comment-off': 'message-square-off', forum: 'messages-square', email: 'mail', 'email-outline': 'mail', 'email-open': 'mail-open',
  // files / text
  'file-document': 'file-text', 'file-document-edit': 'file-pen', 'file-document-multiple': 'files', 'file-document-remove': 'file-x', 'file-multiple': 'files',
  'file-find': 'file-search', 'file-tree': 'folder-tree', 'file-delimited': 'file-spreadsheet', 'file-edit': 'file-pen', 'file-eye': 'file-search',
  'file-cabinet': 'archive', 'file-plus': 'file-plus', 'file-remove': 'file-x', 'folder-multiple': 'folders', 'folder-open': 'folder-open', 'zip-box': 'file-archive',
  'note-text': 'file-text', 'note-outline': 'sticky-note', note: 'sticky-note', 'text-box': 'file-text', 'script-text': 'scroll-text', clipboard: 'clipboard',
  'clipboard-text': 'clipboard-list', 'content-copy': 'copy', 'content-save': 'save', 'content-paste': 'clipboard-paste', 'content-cut': 'scissors',
  'format-bold': 'bold', 'format-italic': 'italic', 'format-underline': 'underline', 'format-strikethrough': 'strikethrough', 'format-header-1': 'heading-1',
  'format-header-2': 'heading-2', 'format-header-3': 'heading-3', 'format-title': 'heading', 'format-paragraph': 'pilcrow', 'format-quote-close': 'quote',
  'format-quote-open': 'quote', 'format-list-bulleted': 'list', 'format-list-numbered': 'list-ordered', 'format-list-checks': 'list-checks',
  'format-align-left': 'text-align-start', 'format-align-center': 'text-align-center', 'format-align-right': 'text-align-end', 'format-align-justify': 'text-align-justify',
  'format-font': 'type', 'format-text': 'type', 'format-color-fill': 'paint-bucket', 'tag-text': 'tag', 'tag-multiple': 'tags', pound: 'hash', 'book-open-page-variant': 'book-open',
  'book-open-variant': 'book-open', bookshelf: 'library', newspaper: 'newspaper', 'newspaper-variant': 'newspaper', translate: 'languages',
  // code / dev
  console: 'terminal', 'console-line': 'terminal', 'code-tags': 'code', 'code-braces': 'braces', 'code-json': 'braces', 'code-array': 'brackets', xml: 'code-xml',
  bash: 'terminal', 'source-branch': 'git-branch', 'source-commit': 'git-commit-horizontal', 'source-merge': 'git-merge', 'source-fork': 'git-fork',
  'source-pull': 'git-pull-request', 'source-repository': 'git-fork', bug: 'bug', 'bug-outline': 'bug', 'test-tube': 'flask-conical', flask: 'flask-conical',
  api: 'webhook', 'cube-outline': 'box', 'cube-send': 'package', 'package-variant': 'package', 'package-variant-closed': 'package', 'package-up': 'package',
  'package-down': 'package', webhook: 'webhook', puzzle: 'puzzle', 'puzzle-outline': 'puzzle', robot: 'bot', 'robot-outline': 'bot', 'robot-happy': 'bot', memory: 'memory-stick',
  chip: 'cpu', lan: 'network', 'lan-connect': 'network', sitemap: 'network', graph: 'network', 'graph-outline': 'network', 'server-network': 'server', connection: 'plug',
  'power-plug': 'plug', 'database-outline': 'database', 'cloud-upload': 'cloud-upload', 'cloud-download': 'cloud-download', 'chart-timeline': 'chart-gantt',
  'chart-areaspline': 'chart-area', 'chart-timeline-variant': 'chart-gantt', speedometer: 'gauge', 'progress-clock': 'loader', 'progress-check': 'circle-check',
  hook: 'webhook', 'cursor-default': 'mouse-pointer', 'cursor-pointer': 'pointer', 'button-cursor': 'mouse-pointer-click', 'toggle-switch': 'toggle-right',
  'toggle-switch-off': 'toggle-left', 'toggle-switch-outline': 'toggle-right', 'toggle-switch-off-outline': 'toggle-left',
  // actions / objects
  cog: 'settings', 'cog-outline': 'settings', cogs: 'settings', tools: 'wrench', 'hammer-wrench': 'wrench', 'lightning-bolt': 'zap', flash: 'zap', 'rocket-launch': 'rocket',
  'scale-balance': 'scale', 'clock-fast': 'clock', 'clock-outline': 'clock', 'timer-outline': 'timer', 'timer-sand': 'hourglass', 'run-fast': 'person-running',
  run: 'person-running', magnify: 'search', 'magnify-plus': 'zoom-in', 'magnify-minus': 'zoom-out', 'magnify-scan': 'scan-search', home: 'house', 'home-outline': 'house',
  web: 'globe', earth: 'globe', 'link-variant': 'link', 'link-variant-off': 'unlink', 'arrow-right-box': 'square-arrow-right', 'arrow-left-box': 'square-arrow-left',
  'arrow-up-box': 'square-arrow-up', 'arrow-down-box': 'square-arrow-down', 'arrow-right-circle': 'circle-arrow-right', 'arrow-left-circle': 'circle-arrow-left',
  'arrow-up-circle': 'circle-arrow-up', 'arrow-down-circle': 'circle-arrow-down', 'plus-circle': 'circle-plus', 'plus-box': 'square-plus', 'minus-circle': 'circle-minus',
  'minus-box': 'square-minus', 'play-circle': 'circle-play', 'pause-circle': 'circle-pause', 'stop-circle': 'circle-stop', 'chevron-right-circle': 'circle-chevron-right',
  'chevron-left-circle': 'circle-chevron-left', 'chevron-up-circle': 'circle-chevron-up', 'chevron-down-circle': 'circle-chevron-down', reload: 'rotate-cw', restart: 'rotate-cw',
  refresh: 'refresh-cw', sync: 'refresh-cw', autorenew: 'refresh-cw', update: 'refresh-cw', 'backup-restore': 'history', 'delete': 'trash-2', 'delete-outline': 'trash',
  'trash-can': 'trash-2', 'trash-can-outline': 'trash', 'map-marker': 'map-pin', 'map-marker-outline': 'map-pin', 'tag-outline': 'tag', 'star-outline': 'star',
  'star-four-points': 'sparkle', creation: 'sparkles', 'auto-fix': 'wand-sparkles', 'magic-staff': 'wand', 'lifebuoy': 'life-buoy', 'weather-sunny': 'sun',
  'white-balance-sunny': 'sun', 'weather-night': 'moon', 'brightness-7': 'sun', 'brightness-4': 'sun-moon', 'brightness-auto': 'sun-moon', 'school': 'graduation-cap',
  'palette-outline': 'palette', 'brush-variant': 'brush', 'pencil-outline': 'pencil', 'lead-pencil': 'pencil', 'fountain-pen-tip': 'pen-tool', 'qrcode': 'qr-code',
  'key-variant': 'key', 'key-outline': 'key', 'lock-outline': 'lock', 'lock-open-variant': 'lock-open', 'eye-outline': 'eye', 'eye-off-outline': 'eye-off', 'calendar-month': 'calendar-days',
  'calendar-today': 'calendar', 'timer': 'timer', 'power': 'power', 'laptop': 'laptop', 'monitor': 'monitor', 'cellphone': 'smartphone', 'tablet': 'tablet',
  'gamepad-variant': 'gamepad-2', 'gift-outline': 'gift', publish: 'arrow-up-to-line', 'hand-heart': 'hand-heart', 'heart-broken': 'heart-crack', 'heart-outline': 'heart', 'trophy-outline': 'trophy',
  'microsoft': 'brands:microsoft',
};

// Material brand-style names that are the plain FA brand name once the prefix is removed.
const MDI_BRAND_PREFIX = /^(language|microsoft|google|file-document|cloud-circle)-(.+)$/;
export const MDI_LANGUAGE = { javascript: 'js', typescript: 'code', go: 'golang', python: 'python', rust: 'rust', java: 'java', markdown: 'markdown', html5: 'html5', css3: 'css3', php: 'php', swift: 'swift', ruby: 'gem' };
// Brand names (Material / Simple Icons) whose FA name differs.
export const BRAND_ALIASES = {
  microsoftwindows: 'windows', 'microsoft-windows': 'windows', twitter: 'x-twitter', x: 'x-twitter', stackoverflow: 'stack-overflow', stackexchange: 'stack-exchange',
  googlechrome: 'chrome', microsoftedge: 'edge', 'microsoft-edge': 'edge', mozillafirefox: 'firefox', firefoxbrowser: 'firefox', nodedotjs: 'node-js', nodejs: 'node-js',
  vuedotjs: 'vuejs', vue: 'vuejs', reactjs: 'react', react: 'react', amazonaws: 'aws', amazon: 'amazon', googlecloud: 'google', googledrive: 'google-drive', googleplay: 'google-play',
  cloudflarepages: 'cloudflare', cloudflareworkers: 'cloudflare', visualstudiocode: 'microsoft', 'github-circle': 'github', githubactions: 'github', githubsponsors: 'github',
  hackernews: 'hacker-news', ycombinator: 'y-combinator', internetexplorer: 'internet-explorer', 'internet-explorer': 'internet-explorer', stackoverflowlogo: 'stack-overflow',
  gitlab: 'gitlab', materialdesign: null, linkedin: 'linkedin', apple: 'apple', android: 'android', ubuntu: 'ubuntu', fedora: 'fedora', redhat: 'redhat', opensuse: 'suse', suse: 'suse',
  centos: 'centos', debian: 'debian', docker: 'docker', npm: 'npm', yarn: 'yarn', python: 'python', git: 'git', bitbucket: 'bitbucket', discord: 'discord', slack: 'slack',
  telegram: 'telegram', whatsapp: 'whatsapp', reddit: 'reddit', mastodon: 'mastodon', bluesky: 'bluesky', youtube: 'youtube', twitch: 'twitch', spotify: 'spotify', dropbox: 'dropbox',
  figma: 'figma', wordpress: 'wordpress', jira: 'jira', trello: 'trello', gitkraken: 'gitkraken', bootstrap: 'bootstrap', sass: 'sass', npmjs: 'npm', 
  rust: 'rust', golang: 'golang', go: 'golang', java: 'java', php: 'php', swift: 'swift', typescript: null, javascript: 'js', html5: 'html5', css3: 'css3', markdown: 'markdown',
  'font-awesome': 'font-awesome', fontawesome: 'font-awesome', github: 'github', 'github-alt': 'github-alt', facebook: 'facebook', instagram: 'instagram', pinterest: 'pinterest',
  medium: 'medium', patreon: 'patreon', paypal: 'paypal', stripe: 'stripe', kickstarter: 'kickstarter', mailchimp: 'mailchimp', wikipedia: 'wikipedia-w', wikipediaw: 'wikipedia-w',
  kubernetes: null, linux: 'linux', windows: 'windows', safari: 'safari', opera: 'opera', brave: null, chromium: null, chrome: 'chrome', edge: 'edge', firefox: 'firefox',
};

// Octicons (without the size suffix) -> Lucide / FA.
export const OCTICON_TABLE = {
  'mark-github': 'github', 'logo-github': 'github', 'three-bars': 'menu', smiley: 'smile', 'smiley-frown': 'frown', 'smiley-neutral': 'meh', 'smiley-grin': 'laugh',
  goal: 'target', 'light-bulb': 'lightbulb', codescan: 'scan-search', 'codescan-checkmark': 'scan-search', 'heart-fill': 'heart', 'star-fill': 'star', 'bell-fill': 'bell',
  'bookmark-fill': 'bookmark', 'home-fill': 'house', 'clock-fill': 'clock', 'inbox-fill': 'inbox', 'check-circle-fill': 'circle-check', 'x-circle-fill': 'circle-x',
  'comment-fill': 'message-square', 'comment-discussion': 'messages-square', chat: 'message-circle', 'chat-add': 'message-circle-plus', 'chat-question': 'message-circle-question',
  alert: 'triangle-alert', 'alert-fill': 'triangle-alert', 'issue-opened': 'circle-dot', 'issue-closed': 'circle-check', 'issue-reopened': 'circle-dot', 'git-pull-request-draft': 'git-pull-request-draft',
  'repo-forked': 'git-fork', repo: 'book-marked', 'repo-clone': 'book-marked', 'repo-template': 'book-marked', 'repo-push': 'book-marked', 'repo-pull': 'book-marked',
  'file-directory': 'folder', 'file-directory-fill': 'folder', 'file-directory-open-fill': 'folder-open', 'file-binary': 'file-digit', 'file-zip': 'file-archive', 'file-media': 'file-image',
  'file-added': 'file-plus', 'file-removed': 'file-minus', 'file-moved': 'file-symlink', 'file-symlink-file': 'file-symlink', 'diff-added': 'diff', 'diff-modified': 'diff', 'diff-removed': 'diff',
  'link-external': 'external-link', 'list-unordered': 'list', 'kebab-horizontal': 'ellipsis', 'paper-airplane': 'send', 'device-desktop': 'monitor', desktop: 'monitor',
  'device-mobile': 'smartphone', 'device-camera': 'camera', 'device-camera-video': 'video', browser: 'app-window', 'screen-full': 'maximize', 'screen-normal': 'minimize',
  'x-circle': 'circle-x', 'check-circle': 'circle-check', checklist: 'list-checks', tasklist: 'list-checks', 'question-bubble': 'message-circle-question', person: 'user',
  'person-fill': 'user', 'person-add': 'user-plus', people: 'users', organization: 'building-2', law: 'scale', stack: 'layers', versions: 'layers', thumbsup: 'thumbs-up',
  thumbsdown: 'thumbs-down', typography: 'type', telescope: 'telescope', 'telescope-fill': 'telescope', pin: 'pin', 'pin-slash': 'pin-off', mute: 'volume-x', unmute: 'volume-2',
  'no-entry': 'ban', blocked: 'ban', 'shield-slash': 'shield-off', 'shield-lock': 'shield', 'cloud-offline': 'cloud-off', 'key-asterisk': 'key-round', passkey: 'key-round',
  'cross-reference': 'arrow-up-right', 'arrow-switch': 'arrow-left-right', 'arrow-both': 'move-horizontal', 'move-to-top': 'arrow-up-to-line', 'move-to-bottom': 'arrow-down-to-line',
  'triangle-down': 'chevron-down', 'triangle-up': 'chevron-up', 'triangle-left': 'chevron-left', 'triangle-right': 'chevron-right', 'sidebar-collapse': 'panel-left-close',
  'sidebar-expand': 'panel-left-open', 'graph-bar-vertical': 'chart-column', 'graph-bar-horizontal': 'chart-bar', graph: 'chart-line', pulse: 'activity', log: 'scroll-text',
  note: 'sticky-note', 'sparkle-fill': 'sparkle', copilot: 'bot', agent: 'bot', 'ai-model': 'brain', mcp: 'plug', release: 'tag', project: 'kanban', 'project-roadmap': 'kanban',
  'command-palette': 'command', loop: 'repeat', mention: 'at-sign', hubot: 'bot', sponsor: 'heart', 'sponsor-tiers': 'heart', 'dot-fill': 'circle', 'square-fill': 'square',
  'git-branch-check': 'git-branch', 'code-review': 'git-pull-request', 'code-badge': 'code', cache: 'database', 'package-dependencies': 'package', 'package-dependents': 'package',
  'tab-external': 'external-link', report: 'flag', flowchart: 'workflow', 'unfold': 'unfold-vertical', 'fold': 'fold-vertical', 'fold-up': 'fold-vertical', 'fold-down': 'fold-vertical',
  'horizontal-rule': 'minus', number: 'hash', dash: 'minus', terminal: 'terminal', 'terminal-locked': 'terminal', 'git-merge-queue': 'git-merge', 'git-pull-request-locked': 'git-pull-request',
  'repo-locked': 'lock', 'book-locked': 'book-lock', 'chat-locked': 'message-circle', 'issue-locked': 'lock',
};

// Simple Icons names (lowercase, no punctuation) that are the FA brand under another name are in BRAND_ALIASES.

const DECOR = /-(outline|box|circle|variant|thick|bold|sharp|rounded|fill|filled)$/;

const faType = (t) => (t === 'brands' || t === 'regular' ? t : null);
function resolves(name, type) {
  if (!name) return false;
  if (type === 'brands' || type === 'regular') return faHas(type, name);
  try { return resolveIcon(type ? `fa-${type} fa-${name}` : name).kind === 'svg'; } catch { return false; }
}
function parseTarget(t) {
  const m = /^(brands|regular|solid):(.+)$/.exec(t);
  return m ? { name: m[2], type: faType(m[1]) } : { name: t, type: null };
}
const hit = (t) => { const r = parseTarget(t); return resolves(r.name, r.type) ? r : null; };

/** Closest bundled icon for a Material Design Icons name, or null. */
export function mapMdi(rawName) {
  let name = String(rawName).toLowerCase().replace(/_/g, '-');
  name = name.replace(/-(12|16|18|20|24|36|48)$/, '');
  const tried = new Set();
  const attempt = (n) => {
    if (!n || tried.has(n)) return null;
    tried.add(n);
    if (Object.hasOwn(MDI_TABLE, n)) { const r = hit(MDI_TABLE[n]); if (r) return r; }
    return null;
  };
  const direct = (n) => (resolves(n) ? { name: n, type: null } : null);
  // brand prefixes: language-python -> python, microsoft-windows -> windows
  const bp = MDI_BRAND_PREFIX.exec(name);
  if (bp && bp[1] !== 'file-document' && bp[1] !== 'cloud-circle') {
    const key = bp[2];
    const t = bp[1] === 'language' && Object.hasOwn(MDI_LANGUAGE, key) ? MDI_LANGUAGE[key] : BRAND_ALIASES[key] ?? key;
    const r = t && (hit(`brands:${t}`) || direct(t));
    if (r) return r;
  }
  // walk from the full name down through decoration suffixes
  let cur = name;
  for (let i = 0; i < 6; i++) {
    const swapped = [];
    const circle = /^(.+)-circle(-outline)?$/.exec(cur);
    const box = /^(.+)-box(-outline)?$/.exec(cur);
    if (circle && !/-(bold|thick)$/.test(circle[1])) swapped.push(`circle-${circle[1]}`);
    if (box && !/-(bold|thick)$/.test(box[1])) swapped.push(`square-${box[1]}`);
    const top = cur.replace(/-top-/, '-up-').replace(/-bottom-/, '-down-');
    const r = attempt(cur) || direct(cur) || (top !== cur && direct(top)) || swapped.map(direct).find(Boolean);
    if (r) return r;
    if (!DECOR.test(cur)) break;
    cur = cur.replace(DECOR, '');
  }
  // brand names written as Material icons (github, apple, linux, docker, ...)
  const b = BRAND_ALIASES[name] ?? undefined;
  if (b) { const r = hit(`brands:${b}`); if (r) return r; }
  return null;
}

/** Closest bundled icon for an Octicons name (size suffix optional), or null. */
export function mapOcticon(rawName) {
  const name = String(rawName).toLowerCase().replace(/-(12|16|24|32|48|96)$/, '');
  if (Object.hasOwn(OCTICON_TABLE, name)) { const r = hit(OCTICON_TABLE[name]); if (r) return r; }
  for (const n of [name, name.replace(/-(fill|filled)$/, ''), name.replace(/^x-circle$/, 'circle-x')]) if (resolves(n)) return { name: n, type: null };
  return null;
}

/** Closest bundled icon for a Simple Icons (brand) name, or null. FA brands first, then generic names. */
export function mapSimple(rawName) {
  const name = String(rawName).toLowerCase().replace(/_/g, '-');
  const cands = [BRAND_ALIASES[name], name, name.replace(/dotjs$/, '-js'), name.replace(/dotjs$|js$/, ''), name.replace(/^(.*)(?:logo|app)$/, '$1')].filter(Boolean);
  for (const c of cands) { const r = hit(`brands:${c}`); if (r) return { name: r.name, type: 'brands' }; }
  return null;
}

/** Font Awesome shortcode: keep the style when the icon exists in it, else any style, else Lucide. */
export function mapFontAwesome(style, rawName) {
  const name = String(rawName).toLowerCase();
  const type = faType(style);
  if (resolves(name, style === 'solid' ? null : style)) return { name, type };
  if (resolves(name)) return { name, type: null };
  return mapMdi(name);
}

/** Icon for a `:set-name:` shortcode. @returns {{name:string,type:'brands'|'regular'|null}|null} */
export function mapShortcodeIcon(set, name) {
  if (set === 'material') return mapMdi(name);
  if (set === 'octicons') return mapOcticon(name);
  if (set === 'simple') return mapSimple(name);
  if (set === 'fontawesome') {
    const m = /^(solid|regular|brands)-(.+)$/.exec(name);
    return m ? mapFontAwesome(m[1], m[2]) : mapFontAwesome('solid', name);
  }
  return null;
}

/** Front matter `icon: material/information-outline` (also `fontawesome/brands/github`, `octicons/…`, `simple/…`) -> bundled icon name or null. */
export function mapFrontmatterIcon(value) {
  const v = String(value).trim().replace(/^:|:$/g, '');
  const fa = /^fontawesome\/(solid|regular|brands)\/(.+)$/.exec(v);
  let r;
  if (fa) r = mapFontAwesome(fa[1], fa[2]);
  else {
    const m = /^(material|octicons|simple|fontawesome)[/-](.+)$/.exec(v);
    r = m ? mapShortcodeIcon(m[1], m[2]) : resolves(v) ? { name: v, type: null } : null;
  }
  return r ? r.name : null;
}
