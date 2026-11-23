// Shared helpers used by several component files (concatenated into the same module scope).

export default `
// ── Shared helpers ─────────────────────────────────────────────────────────
// Inline-markdown for attribute values (titles, descriptions): like _inlineMd but never emits links,
// so it is safe inside <a>/<button> headers.
function _titleMd(text){
  if(text===undefined||text===null||text==='')return '';
  return String(text)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\\\`([^\\\`]+)\\\`/g,'<code>$1</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>')
    .replace(/(?<![\\w*])\\*([^*]+)\\*(?![\\w*])/g,'<em>$1</em>')
    .replace(/(?<![\\w])_([^_]+)_(?![\\w])/g,'<em>$1</em>')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'$1');
}
function _slug(s){return String(s||'').toLowerCase().replace(/[^a-z0-9\\u00c0-\\uffff]+/g,'-').replace(/^-+|-+$/g,'');}
// The build step resolves icon names to inline SVG and attaches them as a child with slot="icon".
// Returns that markup (or '') so components that draw labels inside their own shadow DOM can reuse it.
function _iconMarkup(host,slot){
  const n=host&&host.querySelector?host.querySelector(':scope > [slot="'+(slot||'icon')+'"]'):null;
  return n?n.innerHTML:'';
}
function _hasSlot(host,slot){return !!(host&&host.querySelector&&host.querySelector(':scope > [slot="'+slot+'"]'));}
// Tracks the page theme (html.light / html.dark / system preference) so components that pick
// light/dark values in JS re-render when the reader toggles it. Returns true when light.
function _isLight(){const c=document.documentElement.classList;return c.contains('light')||(!c.contains('dark')&&matchMedia('(prefers-color-scheme: light)').matches);}
function _watchTheme(el){
  if(el._themeObs)return;
  el._themeObs=new MutationObserver(()=>el.requestUpdate());
  el._themeObs.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
}
function _unwatchTheme(el){if(el._themeObs){el._themeObs.disconnect();el._themeObs=null;}}
function _emojiOnly(v){return /[^\\x00-\\x7f]/.test(v||'')?v:'';}
const _hashStr=(s)=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);};
`;
