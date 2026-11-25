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

// ── Deferred rendering ─────────────────────────────────────────────────────
// Block components wrapped in _lazy() render only when they come within one
// viewport of the screen. Until then they stay in the light DOM, styled by the
// pre-upgrade CSS (which matches [data-dl-defer] as well as :not(:defined)), so
// a long page pays only for the components the reader can see.
const _dlIO=typeof IntersectionObserver==='function'?new IntersectionObserver(function(entries){
  for(const e of entries)if(e.isIntersecting)_dlWake(e.target);
},{rootMargin:'100% 0px 100% 0px'}):null;
let _dlEager=!_dlIO;
function _dlWake(el){
  if(!el.__dlDeferred)return;
  el.__dlDeferred=false;
  if(_dlIO)_dlIO.unobserve(el);
  el.removeAttribute('data-dl-defer');
  el.__dlConnect();
}
function _dlWakeAll(){_dlEager=true;document.querySelectorAll('[data-dl-defer]').forEach(_dlWake);}
// The element a #hash points at, or null. Components keyed by a slug (accordion
// titles, tab labels) have no element with that id: then every block may be the target.
function _dlHashTarget(){
  let h=location.hash?location.hash.slice(1):'';
  if(!h)return null;
  try{h=decodeURIComponent(h);}catch(e){}
  return document.getElementById(h)||'any';
}
// True when el sits before target in the page or contains it, i.e. el's height moves target.
function _dlAbove(el,t){return el===t||!!(el.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING);}
// Render every deferred block above (or around) target, so its position is final before
// anything scrolls to it. Resolves once those blocks have rendered.
function _dlRenderBefore(t){
  const woken=[];
  document.querySelectorAll('[data-dl-defer]').forEach(function(el){if(_dlAbove(el,t)){_dlWake(el);woken.push(el);}});
  return Promise.all(woken.map(function(el){return el.updateComplete;})).then(function(){});
}
function _dlWakeForHash(){
  const t=_dlHashTarget();
  if(!t)return;
  if(t==='any'){document.querySelectorAll('wc-accordion[data-dl-defer],wc-expandable[data-dl-defer],wc-tabs[data-dl-defer]').forEach(_dlWake);return;}
  _dlRenderBefore(t);
}
if(typeof window!=='undefined'){
  window.addEventListener('beforeprint',_dlWakeAll);
  window.addEventListener('hashchange',_dlWakeForHash);
  window.__docslitRenderAll=_dlWakeAll;
  window.__docslitRenderBefore=_dlRenderBefore;
}
function _lazy(Base){
  return class extends Base{
    connectedCallback(){
      if(this.__dlDeferred)return;
      if(!_dlEager&&this.getRootNode()===document){
        const t=_dlHashTarget();
        const targeted=t&&(t==='any'?/^wc-(accordion|expandable|tabs)$/.test(this.localName):_dlAbove(this,t));
        if(!targeted){this.__dlDeferred=true;this.setAttribute('data-dl-defer','');_dlIO.observe(this);return;}
      }
      super.connectedCallback();
    }
    __dlConnect(){if(this.isConnected)super.connectedCallback();}
    disconnectedCallback(){
      if(this.__dlDeferred){this.__dlDeferred=false;_dlIO.unobserve(this);this.removeAttribute('data-dl-defer');return;}
      super.disconnectedCallback();
    }
  };
}
`;
