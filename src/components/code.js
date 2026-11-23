// Code components: wc-var, wc-code-block, wc-code-group, wc-code-tab
//
// The runtime below ships as source text inside the components bundle (see components/index.js).
// Fenced code / hand-written <wc-code-block> are fully prepared at build time by
// plugins/rehype-docslit-code.js (highlighting, line marks, {{VAR}} spans); this file only renders them.

/**
 * CSS for the not-yet-upgraded elements (included once by template.js). It mirrors the final
 * geometry so the page does not move when the custom elements upgrade: same border, header
 * height, padding, font and line-height; collapsed blocks reserve their clipped height.
 */
export const codePreUpgradeCss = `/* CODE (pre-upgrade geometry; keep in sync with components/code.js) */
wc-code-block:not(:defined) {
  display: block; position: relative; box-sizing: border-box; width: 100%; margin: 0 0 20px; padding: 16px 20px; overflow-x: auto;
  background: var(--code-bg, #161616); color: var(--code-text, #e2e8f0); border: 1px solid var(--border, #2a2a2a); border-radius: var(--radius-lg, 12px);
  font: 13px/1.7 var(--font-mono, monospace); white-space: pre; tab-size: 2; font-variant-ligatures: none;
}
wc-code-block:not(:defined)[language], wc-code-block:not(:defined)[filename], wc-code-block:not(:defined)[icon] { padding-top: 56px; }
wc-code-block:not(:defined)[language]::before, wc-code-block:not(:defined)[filename]::before, wc-code-block:not(:defined)[icon]::before {
  content: attr(language); position: absolute; left: 0; right: 0; top: 0; height: 40px; box-sizing: border-box; padding: 0 14px; display: flex; align-items: center;
  background: var(--surface, #111); border-bottom: 1px solid var(--border, #2a2a2a); color: var(--text2, #a0a0a0); font: 500 12px/1 var(--font-mono, monospace); white-space: nowrap;
}
wc-code-block:not(:defined)[filename]::before { content: attr(filename); }
wc-code-block:not(:defined)[style*="--cb-ml"] { overflow-y: hidden; padding-bottom: 49px; max-height: calc(var(--cb-ml) * 22.1px + 32px + 33px + 2px); }
wc-code-block:not(:defined)[style*="--cb-ml"][language], wc-code-block:not(:defined)[style*="--cb-ml"][filename] { max-height: calc(var(--cb-ml) * 22.1px + 32px + 33px + 2px + 40px); }
wc-code-block:not(:defined)[wrap] { white-space: pre-wrap; overflow-wrap: anywhere; }
wc-code-block:not(:defined)[linenumbers] { padding-left: calc(20px + 3.5ch); }
/* code annotations: before the upgrade (or without JS) the badge is static and the list stays visible under the code */
wc-code-block:not(:defined) .code-annotation {
  display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 1.7em; height: 1.7em; margin: 0 0 0 .4em; padding: 0 .35em;
  border: 1px solid var(--accent-light, #4f98a3); border-radius: 999px; background: transparent; color: inherit; font: 600 .72em/1 var(--font-sans, system-ui, sans-serif); vertical-align: .12em;
}
wc-code-block:not(:defined) > ol[slot="annotations"] {
  display: block; margin: 16px -20px -16px; padding: 12px 20px 12px 42px; border-top: 1px solid var(--border, #2a2a2a); white-space: normal; font: 13px/1.55 var(--font-sans, system-ui, sans-serif); color: var(--text2, #a0a0a0);
}
wc-code-group:not(:defined) {
  display: block; box-sizing: border-box; margin: 0 0 20px; overflow: hidden; background: var(--code-bg, #161616); border: 1px solid var(--border, #2a2a2a); border-radius: var(--radius-lg, 12px);
  min-height: calc(var(--cb-gn, 3) * 22.1px + 32px + 40px + 2px);
}
wc-code-group:not(:defined) > * { display: none; }
@media (max-width: 640px) {
  wc-code-block:not(:defined), wc-code-group:not(:defined) { font-size: 12px; line-height: 1.65; }
  wc-code-block:not(:defined) { padding-left: 14px; padding-right: 14px; }
  wc-code-block:not(:defined)[style*="--cb-ml"] { max-height: calc(var(--cb-ml) * 19.8px + 32px + 33px + 2px); }
  wc-code-block:not(:defined)[style*="--cb-ml"][language], wc-code-block:not(:defined)[style*="--cb-ml"][filename] { max-height: calc(var(--cb-ml) * 19.8px + 32px + 33px + 2px + 40px); }
  wc-code-group:not(:defined) { min-height: calc(var(--cb-gn, 3) * 19.8px + 32px + 40px + 2px); }
}
@media (pointer: coarse) {
  wc-code-block:not(:defined)[language], wc-code-block:not(:defined)[filename], wc-code-block:not(:defined)[icon] { padding-top: 62px; }
  wc-code-block:not(:defined)[language]::before, wc-code-block:not(:defined)[filename]::before, wc-code-block:not(:defined)[icon]::before { height: 46px; }
}
`;

export default `
// ── Global variable registry ──────────────────────────────────────────────
if(!window.__docslit_vars__){
  window.__docslit_vars__={};
}

// ── WC-VAR ────────────────────────────────────────────────────────────────
class WcVar extends LitElement {
  static properties={name:{type:String},default:{type:String},readonly:{type:Boolean},_editing:{type:Boolean,state:true},_value:{type:String,state:true}};
  static styles=css\`
    :host{display:inline;vertical-align:baseline}
    .badge{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:var(--r-xs,4px);background:rgba(1,105,111,.1);border:1px solid rgba(1,105,111,.3);font-family:'JetBrains Mono',monospace;font-size:.9em;font-weight:600;font-style:italic;color:var(--accent-light,#3d7a83);cursor:pointer;transition:background .15s,border-color .15s;vertical-align:baseline;line-height:inherit}
    .badge:hover{background:rgba(1,105,111,.18);border-color:rgba(1,105,111,.5)}
    .pencil{font-style:normal;font-size:.8em;opacity:.6}
    .edit-wrap{display:inline-flex;align-items:center;gap:4px;vertical-align:baseline}
    input{font-family:'JetBrains Mono',monospace;font-size:.9em;font-weight:600;color:#3d7a83;background:rgba(1,105,111,.08);border:1px solid rgba(1,105,111,.4);border-radius:var(--r-xs,4px);padding:1px 7px;outline:none;min-width:60px;width:auto;line-height:inherit}
    input:focus{border-color:#01696f;box-shadow:0 0 0 2px rgba(1,105,111,.15)}
    .clear-btn{background:none;border:none;cursor:pointer;color:#3d7a83;font-size:14px;padding:0 2px;line-height:1;opacity:.6;transition:opacity .15s}
    .clear-btn:hover{opacity:1}
  \`;
  constructor(){super();this._editing=false;this._value='';}
  connectedCallback(){
    super.connectedCallback();
    const n=this.name||'';
    if(window.__docslit_vars__[n]!==undefined){
      this._value=window.__docslit_vars__[n];
    }else{
      this._value=this.default||n;
      window.__docslit_vars__[n]=this._value;
    }
    this._listener=(e)=>{if(e.detail.name===this.name)this._value=e.detail.value;};
    document.addEventListener('docslit-var-change',this._listener);
  }
  disconnectedCallback(){
    super.disconnectedCallback();
    document.removeEventListener('docslit-var-change',this._listener);
  }
  _startEdit(){this._editing=true;this.updateComplete.then(()=>{const input=this.shadowRoot.querySelector('input');if(input){input.focus();input.select();}});}
  _commit(e){
    const val=e.target.value.trim()||this.default||this.name;
    this._value=val;
    this._editing=false;
    window.__docslit_vars__[this.name]=val;
    document.dispatchEvent(new CustomEvent('docslit-var-change',{detail:{name:this.name,value:val}}));
  }
  _onKeydown(e){if(e.key==='Enter')this._commit(e);if(e.key==='Escape'){this._editing=false;}}
  _reset(){
    const val=this.default||this.name;
    this._value=val;
    this._editing=false;
    window.__docslit_vars__[this.name]=val;
    document.dispatchEvent(new CustomEvent('docslit-var-change',{detail:{name:this.name,value:val}}));
  }
  render(){
    if(this.readonly){
      return html\`<span class="badge" style="cursor:default;border:none;background:none;padding:0">\${this._value}</span>\`;
    }
    if(this._editing){
      return html\`<span class="edit-wrap"><input .value=\${this._value} @blur=\${this._commit} @keydown=\${this._onKeydown} /><button class="clear-btn" @mousedown=\${(e)=>{e.preventDefault();this._reset();}} title="Reset to default">✕</button></span>\`;
    }
    return html\`<span class="badge" @click=\${this._startEdit} title="Click to edit \${this.name}">\${this._value}<span class="pencil">✎</span></span>\`;
  }
}
customElements.define('wc-var',WcVar);

// ── Code theme helper ─────────────────────────────────────────────────────
function _getCodeTheme(){try{return localStorage.getItem('docslit-code-theme')||'';}catch(e){return '';}}
function _setCodeTheme(t){
  try{localStorage.setItem('docslit-code-theme',t);}catch(e){}
  document.dispatchEvent(new CustomEvent('docslit-code-theme',{detail:{theme:t}}));
}
function _toggleCodeTheme(){
  const cur=_getCodeTheme();
  const pageIsLight=document.documentElement.classList.contains('light');
  const currentlyLight=cur==='light'||(cur===''&&pageIsLight);
  _setCodeTheme(currentlyLight?'dark':'light');
}
function _resolveCodeTheme(el){
  if(el.hasAttribute('theme'))return el.getAttribute('theme');
  const saved=_getCodeTheme();
  if(saved)return saved;
  return document.documentElement.classList.contains('light')?'light':'dark';
}

// ── Code block helpers (shared by wc-code-block and wc-code-group) ────────
const _CB_DEFAULT_MAX=10;
const _CB_CANON={js:'javascript',mjs:'javascript',cjs:'javascript',node:'javascript',ts:'typescript',py:'python',sh:'bash',shell:'bash',zsh:'bash',yml:'yaml',rb:'ruby',cs:'csharp','c#':'csharp',golang:'go',kt:'kotlin',rs:'rust',md:'markdown',ps1:'powershell',txt:'text',plaintext:'text'};
const _CB_NAMES={javascript:'JavaScript',typescript:'TypeScript',jsx:'JSX',tsx:'TSX',python:'Python',bash:'Bash',json:'JSON',jsonc:'JSON',yaml:'YAML',html:'HTML',css:'CSS',scss:'SCSS',go:'Go',rust:'Rust',java:'Java',kotlin:'Kotlin',swift:'Swift',ruby:'Ruby',php:'PHP',c:'C',cpp:'C++',csharp:'C#',sql:'SQL',xml:'XML',markdown:'Markdown',mdx:'MDX',diff:'Diff',toml:'TOML',dockerfile:'Dockerfile',graphql:'GraphQL',http:'HTTP',curl:'cURL',text:'Text',ini:'INI',powershell:'PowerShell',lua:'Lua',dart:'Dart',scala:'Scala',elixir:'Elixir',vue:'Vue',svelte:'Svelte',nginx:'Nginx',makefile:'Makefile',terraform:'Terraform',hcl:'HCL',proto:'Protobuf',r:'R'};
function _cbCanon(l){l=String(l||'').toLowerCase();return _CB_CANON[l]||l;}
function _cbLangName(l){if(!l)return '';const c=_cbCanon(l);return _CB_NAMES[c]||String(l);}
function _cbEsc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function _cbDecode(s){return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');}
function _cbSpec(str){
  const set=new Set();
  String(str||'').replace(/[\\[\\]{}"']/g,'').split(/[\\s,]+/).forEach(function(p){
    const m=p.match(/^(\\d+)(?:-(\\d+))?$/);
    if(!m)return;
    const a=+m[1],b=m[2]?+m[2]:a;
    for(let i=a;i<=b&&i-a<10000;i++)set.add(i);
  });
  return set;
}
// Read (once) the code a wc-code-block carries: build-time highlighted HTML, or plain text.
function _cbRead(el){
  if(el.__cbSrc)return el.__cbSrc;
  let htmlStr=null,code;
  let ol=null;
  if(el.hasAttribute('highlighted')){
    // <ol slot="annotations"> (code annotations) is not code: keep it aside, in the light DOM, unslotted = hidden
    ol=el.querySelector(':scope > ol[slot="annotations"]');
    if(ol)ol.remove();
    htmlStr=el.innerHTML.trim();
    const tmp=document.createElement('div');
    tmp.innerHTML=htmlStr;
    // the numbered badges are not part of the code that gets copied
    tmp.querySelectorAll('.code-annotation').forEach(function(b){b.remove();});
    // Shiki separates lines with real newline characters between inline .line spans
    // (do NOT make .line display:block: the newlines would then add a second break).
    // A trailing newline in the source adds an empty final .line; don't count it.
    code=tmp.textContent.replace(/\\n$/,'');
    if(ol)code=code.split('\\n').map(function(l){return l.replace(/[ \\t]+$/,'');}).join('\\n');
  }else{
    code=_cbDecode(el.innerHTML.trim());
  }
  el.__cbSrc={code:code,html:htmlStr};
  el.innerHTML='';
  if(ol)el.appendChild(ol);
  return el.__cbSrc;
}
function _cbVarify(escaped){
  return escaped.replace(/\\{\\{([A-Z_][A-Z0-9_]*)\\}\\}/g,function(_,n){return '<span class="dl-var" data-var="'+n+'">{{'+n+'}}</span>';});
}
// Fallback for blocks that did not go through the build pipeline: plain lines + highlight/focus attributes.
function _cbBuildHtml(src,el){
  const hl=_cbSpec(el.getAttribute('highlight')),fo=_cbSpec(el.getAttribute('focus'));
  return src.code.split('\\n').map(function(l,i){
    const c=['line'];
    if(hl.has(i+1))c.push('hl');
    if(fo.has(i+1))c.push('focus');
    return '<span class="'+c.join(' ')+'">'+_cbVarify(_cbEsc(l))+'</span>';
  }).join('\\n');
}
function _cbOpts(el){
  const g=function(n){return el.getAttribute(n);};
  const ln=g('linenumbers');
  const ml=parseInt(g('max-lines'),10),sl=parseInt(g('start-line'),10);
  return {
    language:g('language')||'',filename:g('filename')||'',icon:g('icon')||'',
    numbers:ln!==null&&!/^(false|0)$/i.test(ln),
    start:sl>=1?sl:1,
    wrap:el.hasAttribute('wrap'),expandable:el.hasAttribute('expandable'),
    maxLines:ml>0?ml:0,nocopy:el.hasAttribute('nocopy'),forKey:g('for')||''
  };
}
function _cbSubst(text){
  const vars=window.__docslit_vars__||{};
  return String(text).replace(/\\{\\{([A-Z_][A-Z0-9_]*)\\}\\}/g,function(_,n){return vars[n]!==undefined?vars[n]:n;});
}
function _cbFallbackCopy(text){
  return new Promise(function(res,rej){
    try{
      const t=document.createElement('textarea');
      t.value=text;t.setAttribute('readonly','');
      t.style.cssText='position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(t);t.select();
      const ok=document.execCommand('copy');
      t.remove();
      ok?res():rej(new Error('copy failed'));
    }catch(e){rej(e);}
  });
}
function _cbCopyText(text){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text).catch(function(){return _cbFallbackCopy(text);});
  }
  return _cbFallbackCopy(text);
}
// Apply current variable values to the .dl-var spans inside a rendered code block.
function _cbSyncVars(host){
  const vars=window.__docslit_vars__||{};
  host.renderRoot.querySelectorAll('.dl-var').forEach(function(s){
    const n=s.dataset.var;
    const v=vars[n]!==undefined?vars[n]:n;
    if(s.textContent!==v)s.textContent=v;
    if(!s.hasAttribute('role')){s.setAttribute('role','button');s.setAttribute('tabindex','0');s.setAttribute('title','Variable '+n+': click to edit');}
  });
}
// Scrollable code areas get a tab stop only when they actually overflow.
function _cbScrollables(host){
  host.renderRoot.querySelectorAll('.scroll').forEach(function(s){
    if(s.scrollWidth>s.clientWidth+1){s.setAttribute('tabindex','0');s.setAttribute('role','group');s.setAttribute('aria-label','Scrollable code');}
    else{s.removeAttribute('tabindex');s.removeAttribute('role');s.removeAttribute('aria-label');}
  });
}

const _cbSharedStyles=css\`
  :host{display:block;margin:0 0 20px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;--cb-fs:var(--code-block-fs,13px);--cb-lh:1.7;--cb-pady:16px;--cb-padx:20px;--cb-head:var(--code-head-h,40px);--cb-r:var(--code-radius,var(--radius-lg,12px))}
  :host([data-in-group]){display:none}
  *{box-sizing:border-box}
  .wrap{--_bg:var(--code-bg,#161616);--_fg:var(--code-text,#e2e8f0);--_bd:var(--code-border,var(--border,#2a2a2a));--_bar:var(--code-bar-bg,var(--surface,#111));--_mut:var(--text2,#a0a0a0);--_hov:var(--accent-light,#4f98a3);--_acc:var(--accent,#01696f);position:relative;width:100%;background:var(--_bg);color:var(--_fg);border:1px solid var(--_bd);box-shadow:var(--code-shadow,none);border-radius:var(--cb-r);font-family:var(--font-sans,'Inter',system-ui,sans-serif)}
  .wrap.th-dark{--_add:var(--code-add,#3fb950);--_rem:var(--code-remove,#f85149);--_warn:var(--code-warn,#d29922);--_dim:.5;color-scheme:dark}
  .wrap.th-light{--_add:var(--code-add,#1a7f37);--_rem:var(--code-remove,#cf222e);--_warn:var(--code-warn,#9a6700);--_dim:.55;color-scheme:light}
  .wrap.alt.th-dark{--_bg:var(--code-bg-dark,#161616);--_fg:var(--code-text-dark,#e2e8f0);--_bd:var(--border-dark,#2a2a2a);--_bar:var(--surface-dark,#111);--_mut:var(--text2-dark,#a0a0a0);--_hov:var(--accent-light-dark,#4f98a3);--_acc:var(--accent-dark,#01696f)}
  .wrap.alt.th-light{--_bg:var(--code-bg-light,#f6f8fa);--_fg:var(--code-text-light,#24292f);--_bd:var(--border-light,#e2e2e2);--_bar:var(--surface-light,#f8f8f8);--_mut:var(--text2-light,#555);--_hov:var(--accent-light-light,#015e63);--_acc:var(--accent-light-base,#01696f)}
  .header,.tabbar{display:flex;align-items:center;gap:8px;min-height:var(--cb-head);padding:0 6px 0 14px;background:var(--_bar);border-bottom:1px solid var(--_bd);border-radius:calc(var(--cb-r) - 1px) calc(var(--cb-r) - 1px) 0 0}
  .hd-title{display:flex;align-items:center;gap:8px;flex:1;min-width:0;font:500 12px/1.2 var(--font-mono,'JetBrains Mono',ui-monospace,monospace);color:var(--_mut)}
  .hd-title .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ico{display:inline-flex;width:16px;height:16px;flex:none;align-items:center;justify-content:center;color:var(--_mut);--icon-size:16px}
  .lang{flex:none;font:500 11px/1 var(--font-mono,'JetBrains Mono',ui-monospace,monospace);color:var(--_mut);padding:3px 8px;border:1px solid var(--_bd);border-radius:999px;white-space:nowrap}
  .actions{display:flex;align-items:center;gap:2px;flex:none}
  .btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:28px;min-width:28px;padding:0 8px;margin:0;background:transparent;border:1px solid transparent;border-radius:calc(var(--radius,8px) - 2px);color:var(--_mut);font:500 12px/1 var(--font-sans,'Inter',system-ui,sans-serif);cursor:pointer;transition:color .15s,background-color .15s,border-color .15s}
  .btn:hover{color:var(--_fg);border-color:var(--_bd)}
  .btn:focus-visible{outline:2px solid var(--_hov);outline-offset:1px}
  .btn.copied{color:var(--_add)}
  .btn svg{width:14px;height:14px;flex:none}
  .menu-wrap{position:relative;display:flex}
  .menu{position:absolute;top:calc(100% + 4px);right:0;z-index:20;min-width:176px;padding:4px;background:var(--_bar);border:1px solid var(--_bd);border-radius:var(--radius,8px);box-shadow:0 8px 24px rgba(0,0,0,.28)}
  .menu-item{appearance:none;display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:0;background:transparent;border-radius:calc(var(--radius,8px) - 2px);color:var(--_fg);font:500 13px/1 var(--font-sans,'Inter',system-ui,sans-serif);text-align:left;cursor:pointer;white-space:nowrap}
  .menu-item:hover,.menu-item:focus-visible{background:var(--_bg);outline:none}
  .menu-item:focus-visible{box-shadow:inset 0 0 0 2px var(--_hov)}
  .sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
  .float{position:absolute;top:6px;right:6px;z-index:3;display:flex;background:var(--_bar);border:1px solid var(--_bd);border-radius:calc(var(--radius,8px) - 2px);opacity:0;transition:opacity .15s}
  .wrap:hover .float,.wrap:focus-within .float,.float:has(.btn[aria-expanded="true"]){opacity:1}
  @media(hover:none){.float{opacity:1}}
  .viewport{position:relative;border-radius:0 0 calc(var(--cb-r) - 1px) calc(var(--cb-r) - 1px);overflow:hidden}
  .wrap.no-head .viewport{border-radius:calc(var(--cb-r) - 1px)}
  .scroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:var(--_bd) transparent}
  .scroll.collapsed{max-height:calc(var(--max-lines) * var(--cb-fs) * var(--cb-lh) + 2 * var(--cb-pady))}
  .scroll:focus-visible{outline:2px solid var(--_hov);outline-offset:-2px}
  pre{display:block;width:max-content;min-width:100%;margin:0;padding:var(--cb-pady) var(--cb-padx);font-family:var(--font-mono,'JetBrains Mono',ui-monospace,monospace);font-size:var(--cb-fs);line-height:var(--cb-lh);color:var(--_fg);tab-size:2;font-variant-ligatures:none;white-space:pre;text-align:left}
  pre code{font:inherit;color:inherit;background:none;border:0;padding:0}
  pre.wrap-lines{width:auto;white-space:pre-wrap;overflow-wrap:anywhere}
  .nums,.marks{counter-reset:ln var(--ln-start,0)}
  .nums .line,.marks .line{display:inline-block;vertical-align:top;position:relative;min-width:calc(100% + 2 * var(--cb-padx));min-height:calc(var(--cb-fs) * var(--cb-lh));margin:0 calc(-1 * var(--cb-padx));padding:0 var(--cb-padx)}
  .nums .line{counter-increment:ln;padding-left:calc(var(--cb-padx) + var(--ln-w,2ch) + 1.5ch);text-indent:calc(-1 * (var(--ln-w,2ch) + 1.5ch))}
  .nums .line::before{content:counter(ln);display:inline-block;width:var(--ln-w,2ch);margin-right:1.5ch;text-align:right;text-indent:0;color:var(--_mut);user-select:none;-webkit-user-select:none}
  .line.hl{background:rgba(79,152,163,.18);box-shadow:inset 2px 0 0 var(--_hov)}
  .line.add{background:rgba(63,185,80,.14);box-shadow:inset 2px 0 0 var(--_add)}
  .line.remove{background:rgba(248,81,73,.14);box-shadow:inset 2px 0 0 var(--_rem)}
  .line.error{background:rgba(248,81,73,.14);box-shadow:inset 2px 0 0 var(--_rem)}
  .line.warning{background:rgba(210,153,34,.16);box-shadow:inset 2px 0 0 var(--_warn)}
  .line.hunk{background:rgba(79,152,163,.1)}
  @supports (background:color-mix(in srgb,red 10%,transparent)){
    .line.hl{background:color-mix(in srgb,var(--_hov) 16%,transparent)}
    .line.add{background:color-mix(in srgb,var(--_add) 14%,transparent)}
    .line.remove,.line.error{background:color-mix(in srgb,var(--_rem) 14%,transparent)}
    .line.warning{background:color-mix(in srgb,var(--_warn) 16%,transparent)}
    .line.hunk{background:color-mix(in srgb,var(--_hov) 9%,transparent)}
  }
  .has-diff .line.add::after,.has-diff .line.remove::after{position:absolute;left:calc(var(--cb-padx) * .4);top:0;text-indent:0;user-select:none;-webkit-user-select:none;font-weight:600}
  .has-diff .line.add::after{content:'+';color:var(--_add)}
  .has-diff .line.remove::after{content:'−';color:var(--_rem)}
  .has-focus .line:not(.focus){opacity:var(--_dim);transition:opacity .2s}
  .wrap:hover .has-focus .line,.scroll:focus-within .has-focus .line{opacity:1}
  .dl-var{color:var(--_hov);font-weight:600;font-style:italic;border-bottom:1px dashed currentColor;cursor:pointer;border-radius:2px}
  .dl-var:hover,.dl-var:focus-visible{background:rgba(79,152,163,.2);outline:none}
  .dl-var:focus-visible{box-shadow:0 0 0 2px var(--_hov)}
  :host(.light-shiki) .line span,:host([theme="light"]) .line span{color:var(--shiki-light) !important}
  /* github-light's keyword / parameter / comment colours are below 4.5:1 on tinted code backgrounds: nudge them to AA */
  :host(.light-shiki) .line span[style*="D73A49" i],:host([theme="light"]) .line span[style*="D73A49" i]{color:#cf222e !important}
  :host(.light-shiki) .line span[style*="E36209" i],:host([theme="light"]) .line span[style*="E36209" i]{color:#a14100 !important}
  :host(.light-shiki) .line span[style*="6A737D" i],:host([theme="light"]) .line span[style*="6A737D" i]{color:#57606a !important}
  :host(.light-shiki) .line span[style*="22863A" i],:host([theme="light"]) .line span[style*="22863A" i]{color:#176c2e !important}
  :host(:not(.light-shiki):not([theme="light"])) .line span[style*="6A737D" i]{color:#8b949e !important}
  :host(.light-shiki) .line span.dl-var,:host([theme="light"]) .line span.dl-var,.line span.dl-var{color:var(--_hov) !important}
  .code-annotation{appearance:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:1.7em;height:1.7em;margin:0 0 0 .4em;padding:0 .35em;border:1px solid color-mix(in srgb,var(--_hov) 55%,transparent);border-radius:999px;background:color-mix(in srgb,var(--_hov) 16%,transparent);color:var(--_fg);font:600 .72em/1 var(--font-sans,'Inter',system-ui,sans-serif);vertical-align:.12em;cursor:pointer;user-select:none;-webkit-user-select:none;text-indent:0;transition:background-color .15s,border-color .15s}
  .code-annotation:hover,.code-annotation[aria-expanded="true"]{background:var(--_hov);border-color:var(--_hov);color:var(--_bg)}
  .code-annotation:focus-visible{outline:2px solid var(--_hov);outline-offset:2px}
  .ann-pop{position:absolute;z-index:30;transform:translateX(-50%);box-sizing:border-box;display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:var(--_bar);color:var(--_fg);border:1px solid var(--_bd);border-radius:var(--radius,8px);box-shadow:0 8px 24px rgba(0,0,0,.28);font:400 13px/1.55 var(--font-sans,'Inter',system-ui,sans-serif);white-space:normal;text-align:left}
  .ann-num{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:1.7em;height:1.7em;padding:0 .35em;border-radius:999px;background:var(--_hov);color:var(--_bg);font:600 11px/1 var(--font-sans,'Inter',system-ui,sans-serif)}
  .ann-body{min-width:0;overflow-wrap:anywhere}
  .ann-body>:first-child{margin-top:0}.ann-body>:last-child{margin-bottom:0}
  .ann-body p{margin:.4em 0}
  .ann-body code{font-family:var(--font-mono,'JetBrains Mono',ui-monospace,monospace);font-size:.92em;padding:1px 4px;border-radius:4px;background:color-mix(in srgb,var(--_fg) 10%,transparent)}
  .ann-body a{color:var(--_hov)}
  .fade{position:absolute;left:0;right:0;bottom:0;height:56px;pointer-events:none;background:linear-gradient(to bottom,transparent,var(--_bg))}
  .more{appearance:none;display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:33px;margin:0;padding:0 12px;background:var(--_bar);border:0;border-top:1px solid var(--_bd);border-radius:0 0 calc(var(--cb-r) - 1px) calc(var(--cb-r) - 1px);color:var(--_mut);font:500 12px/1 var(--font-sans,'Inter',system-ui,sans-serif);cursor:pointer}
  .more:hover{color:var(--_fg)}
  .more:focus-visible{outline:2px solid var(--_hov);outline-offset:-3px}
  .more svg{width:14px;height:14px;transition:transform .15s}
  .more[aria-expanded="true"] svg{transform:rotate(180deg)}
  @media(max-width:640px){:host{--cb-padx:14px;--cb-fs:12px;--cb-lh:1.65}}
  @media(max-width:420px){.btn-label{display:none}}
  @media(pointer:coarse){:host{--cb-head:46px}.btn{min-height:44px;min-width:44px}.more{min-height:44px}}
  @media(prefers-reduced-motion:reduce){.btn,.float,.more svg,.has-focus .line{transition:none}}
  @media print{.actions,.float,.more,.fade,.ann-pop{display:none !important}.scroll.collapsed{max-height:none !important}.wrap{border-color:#ccc}}
\`;

const _CB_SVG_COPY=html\`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>\`;
const _CB_SVG_CHECK=html\`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>\`;
const _CB_SVG_DOTS=html\`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>\`;
const _CB_SVG_CHEV=html\`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>\`;
const _CB_SVG_MOON=html\`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="14" height="14"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>\`;
const _CB_SVG_SUN=html\`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="14" height="14"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>\`;

// Behaviour shared by wc-code-block and wc-code-group: theme, copy, menu, expand, variables.
class _CbBase extends LitElement {
  static properties={_copied:{type:Boolean,state:true},_menuOpen:{type:Boolean,state:true},_resolvedTheme:{type:String,state:true},_exp:{type:Object,state:true}};
  constructor(){super();this._copied=false;this._menuOpen=false;this._exp={};this._uid='cb'+(window.__cbUid=(window.__cbUid||0)+1);}
  connectedCallback(){
    super.connectedCallback();
    this._applyTheme();
    this._themeListener=()=>this._applyTheme();
    this._varListener=()=>_cbSyncVars(this);
    document.addEventListener('docslit-code-theme',this._themeListener);
    document.addEventListener('docslit-var-change',this._varListener);
    if(!this.hasAttribute('theme')){this._themeObs=new MutationObserver(()=>this._applyTheme());this._themeObs.observe(document.documentElement,{attributes:true,attributeFilter:['class']});}
    this._outsideClick=(e)=>{if(this._menuOpen&&!e.composedPath().includes(this))this._menuOpen=false;};
    document.addEventListener('click',this._outsideClick);
    if(typeof ResizeObserver!=='undefined'){
      this._ro=new ResizeObserver(()=>{if(this._roRaf)return;this._roRaf=requestAnimationFrame(()=>{this._roRaf=0;_cbScrollables(this);});});
      this._ro.observe(this);
    }
  }
  disconnectedCallback(){
    super.disconnectedCallback();
    document.removeEventListener('docslit-code-theme',this._themeListener);
    document.removeEventListener('docslit-var-change',this._varListener);
    document.removeEventListener('click',this._outsideClick);
    if(this._themeObs){this._themeObs.disconnect();this._themeObs=null;}
    if(this._ro){this._ro.disconnect();this._ro=null;}
  }
  firstUpdated(){if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>_cbScrollables(this));}
  updated(){_cbSyncVars(this);_cbScrollables(this);}
  _applyTheme(){
    const t=_resolveCodeTheme(this);
    this._resolvedTheme=t;
    this.classList.toggle('light-shiki',t==='light');
  }
  _wrapClass(extra){
    const t=this._resolvedTheme==='light'?'light':'dark';
    const pageLight=document.documentElement.classList.contains('light');
    return 'wrap th-'+t+((t==='light')!==pageLight?' alt':'')+(extra?' '+extra:'');
  }
  async _copy(text){
    try{await _cbCopyText(_cbSubst(text));}catch(e){return;}
    this._copied=true;
    clearTimeout(this._copiedT);
    this._copiedT=setTimeout(()=>{this._copied=false;},2000);
  }
  _toggleMenu(){this._menuOpen=!this._menuOpen;}
  _switchTheme(){this._menuOpen=false;_toggleCodeTheme();}
  _menuKey(e){
    if(e.key==='Escape'&&this._menuOpen){e.stopPropagation();this._menuOpen=false;const b=this.renderRoot.querySelector('.menu-wrap .btn');if(b)b.focus();}
  }
  _toggleExp(key){
    const open=!this._exp[key];
    const top=this.getBoundingClientRect().top;
    this._exp={...this._exp,[key]:open};
    if(!open){this.updateComplete.then(()=>{if(this.getBoundingClientRect().top<0)this.scrollIntoView({block:'start'});});}
    else{this.updateComplete.then(()=>{const d=this.getBoundingClientRect().top-top;if(d)window.scrollBy(0,d);});}
  }
  _codeClick(e){
    const a=e.target&&e.target.closest?e.target.closest('.code-annotation'):null;
    if(a&&this._annToggle){e.stopPropagation();this._annToggle(a);return;}
    const v=e.target&&e.target.closest?e.target.closest('.dl-var'):null;
    if(v)document.dispatchEvent(new CustomEvent('docslit-var-edit',{detail:{name:v.dataset.var}}));
  }
  _codeKey(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    const v=e.target&&e.target.closest?e.target.closest('.dl-var'):null;
    if(v){e.preventDefault();document.dispatchEvent(new CustomEvent('docslit-var-edit',{detail:{name:v.dataset.var}}));}
  }
  _actions(nocopy,getText){
    const isLight=this._resolvedTheme==='light';
    const themeLabel=isLight?'Dark code theme':'Light code theme';
    return html\`<div class="actions" @keydown=\${(e)=>this._menuKey(e)}>
      \${nocopy?nothing:html\`<button class="btn copy \${this._copied?'copied':''}" type="button" aria-label="Copy code" @click=\${()=>this._copy(getText())}>\${this._copied?_CB_SVG_CHECK:_CB_SVG_COPY}<span class="btn-label">\${this._copied?'Copied':'Copy'}</span></button>\`}
      <div class="menu-wrap"><button class="btn" type="button" aria-label="Code options" aria-haspopup="menu" aria-expanded=\${this._menuOpen?'true':'false'} @click=\${()=>this._toggleMenu()}>\${_CB_SVG_DOTS}</button>\${this._menuOpen?html\`<div class="menu" role="menu"><button class="menu-item" role="menuitem" type="button" @click=\${()=>this._switchTheme()}>\${isLight?_CB_SVG_MOON:_CB_SVG_SUN}<span>\${themeLabel}</span></button></div>\`:nothing}</div>
      <span class="sr" role="status" aria-live="polite">\${this._copied?'Copied to clipboard':''}</span>
    </div>\`;
  }
  // One code panel: scroll area + optional collapse toggle. item = {html, code, total, opts}
  _panel(item,key){
    const o=item.opts,total=item.total;
    const max=o.maxLines||_CB_DEFAULT_MAX;
    const collapsible=(o.expandable||o.maxLines>0)&&total>max;
    const open=!!this._exp[key];
    const collapsed=collapsible&&!open;
    const digits=Math.max(2,String(o.start+total-1).length);
    const h=item.html;
    const cls=[];
    if(o.numbers)cls.push('nums');
    if(/class="line [^"]/.test(h))cls.push('marks');
    if(/class="line[^"]*\\bfocus\\b/.test(h))cls.push('has-focus');
    if(/class="line[^"]*\\b(add|remove)\\b/.test(h))cls.push('has-diff');
    if(o.wrap)cls.push('wrap-lines');
    const id=this._uid+'-'+key;
    return html\`<div class="viewport"><div class="scroll \${collapsed?'collapsed':''}" id=\${id} style="--max-lines:\${max}" @click=\${(e)=>this._codeClick(e)} @keydown=\${(e)=>this._codeKey(e)}><pre class=\${cls.join(' ')} style="--ln-w:\${digits}ch;--ln-start:\${o.start-1}"><code>\${unsafeHTML(h)}</code></pre></div>\${collapsed?html\`<div class="fade"></div>\`:nothing}</div>\${collapsible?html\`<button class="more" type="button" aria-expanded=\${open?'true':'false'} aria-controls=\${id} @click=\${()=>this._toggleExp(key)}>\${_CB_SVG_CHEV}<span>\${open?'Show less':'Show '+(total-max)+' more line'+(total-max===1?'':'s')}</span></button>\`:nothing}\`;
  }
}

// ── WC-CODE-BLOCK ──────────────────────────────────────────────────────────
class WcCodeBlock extends _CbBase {
  static properties={language:{type:String},filename:{type:String},icon:{type:String},linenumbers:{type:String},startLine:{type:Number,attribute:'start-line'},highlight:{type:String},focus:{type:String},wrap:{type:Boolean},expandable:{type:Boolean},maxLines:{type:Number,attribute:'max-lines'},nocopy:{type:Boolean},highlighted:{type:Boolean,reflect:true},_ann:{type:Object,state:true}};
  static styles=[_cbSharedStyles];
  connectedCallback(){
    this._src=_cbRead(this);
    this._inGroup=!!this.closest('wc-code-group');
    if(this._inGroup){this.setAttribute('data-in-group','');LitElement.prototype.connectedCallback.call(this);return;}
    super.connectedCallback();
    this._annOutside=(e)=>{if(this._ann&&!e.composedPath().includes(this))this._ann=null;};
    this._annOther=(e)=>{if(e.detail!==this)this._ann=null;};
    document.addEventListener('click',this._annOutside);
    document.addEventListener('docslit-annotation-open',this._annOther);
  }
  disconnectedCallback(){
    super.disconnectedCallback();
    document.removeEventListener('click',this._annOutside);
    document.removeEventListener('docslit-annotation-open',this._annOther);
  }
  // Annotation popover: the badge (a real <button> in the code) toggles the matching <li> of the slotted <ol>.
  _annToggle(btn){
    const n=btn.dataset.annotation;
    if(this._ann&&this._ann.n===n){this._ann=null;return;}
    const ol=this.querySelector(':scope > ol[slot="annotations"]');
    const li=ol&&ol.children[Number(n)-1];
    if(!li)return;
    const wrap=this.renderRoot.querySelector('.wrap');
    const wr=wrap.getBoundingClientRect(),br=btn.getBoundingClientRect();
    const half=Math.min(160,(wr.width-16)/2);
    const left=Math.max(half+8,Math.min(wr.width-half-8,br.left-wr.left+br.width/2));
    document.dispatchEvent(new CustomEvent('docslit-annotation-open',{detail:this}));
    this._annBtn=btn;
    this._ann={n:n,html:li.innerHTML,left:left,top:br.bottom-wr.top+6,w:half*2};
  }
  _annKey(e){
    if(e.key==='Escape'&&this._ann){
      e.stopPropagation();
      this._ann=null;
      if(this._annBtn&&this._annBtn.isConnected)this._annBtn.focus();
    }
  }
  updated(){
    super.updated();
    this.renderRoot.querySelectorAll('.code-annotation').forEach((b)=>{
      b.setAttribute('aria-expanded',this._ann&&this._ann.n===b.dataset.annotation?'true':'false');
    });
  }
  _item(){
    const src=this._src||_cbRead(this);
    return {html:src.html||_cbBuildHtml(src,this),code:src.code,total:src.code.split('\\n').length,opts:_cbOpts(this)};
  }
  render(){
    if(this._inGroup)return nothing;
    const item=this._item();
    const o=item.opts;
    const langName=_cbLangName(o.language);
    const hasHead=!!(o.filename||o.language||o.icon);
    const getText=()=>item.code;
    const ann=this._ann;
    return html\`<div class=\${this._wrapClass(hasHead?'':'no-head')} @keydown=\${(e)=>this._annKey(e)}>
      \${hasHead?html\`<div class="header"><div class="hd-title">\${o.icon?html\`<span class="ico"><wc-icon name=\${o.icon}></wc-icon></span>\`:nothing}<span class="name">\${o.filename||langName}</span></div>\${o.filename&&langName?html\`<span class="lang">\${langName}</span>\`:nothing}\${this._actions(o.nocopy,getText)}</div>\`:(o.nocopy?nothing:html\`<div class="float">\${this._actions(false,getText)}</div>\`)}
      \${this._panel(item,'b')}
      \${ann?html\`<div class="ann-pop" role="dialog" aria-label=\${'Annotation '+ann.n} style="left:\${ann.left}px;top:\${ann.top}px;width:\${ann.w}px"><span class="ann-num" aria-hidden="true">\${ann.n}</span><div class="ann-body">\${unsafeHTML(ann.html)}</div></div>\`:nothing}
    </div>\`;
  }
}
customElements.define('wc-code-block',WcCodeBlock);

// ── WC-CODE-GROUP / WC-CODE-TAB ────────────────────────────────────────────
const _CB_SYNC_STORE='docslit-tab-sync';
function _cbSyncRead(){try{return JSON.parse(localStorage.getItem(_CB_SYNC_STORE)||'{}')||{};}catch(e){return {};}}
function _cbMatch(items,token){
  const t=String(token||'').toLowerCase();
  if(!t)return -1;
  return items.findIndex(function(it){return it.tokens.indexOf(t)>=0;});
}

class WcCodeGroup extends _CbBase {
  static properties={_active:{type:Number,state:true}};
  static styles=[_cbSharedStyles,css\`
    .tabbar{padding-left:0}
    .tabs{display:flex;align-items:stretch;flex:1;min-width:0;align-self:stretch;overflow-x:auto;scrollbar-width:none}
    .tabs::-webkit-scrollbar{display:none}
    .tab{appearance:none;display:inline-flex;align-items:center;gap:6px;flex:none;margin:0 0 -1px;padding:0 14px;background:none;border:0;border-bottom:2px solid transparent;color:var(--_mut);font:500 12px/1 var(--font-mono,'JetBrains Mono',ui-monospace,monospace);white-space:nowrap;cursor:pointer;transition:color .15s,border-color .15s}
    .tab:hover{color:var(--_fg)}
    .tab[aria-selected="true"]{color:var(--_fg);border-bottom-color:var(--_hov)}
    .tab:focus-visible{outline:2px solid var(--_hov);outline-offset:-3px;border-radius:var(--r-xs,4px)}
    .dd-wrap{position:relative;display:inline-flex;align-items:center;flex:0 1 auto;min-width:0;margin-left:10px}
    .dd-wrap::after{content:'';position:absolute;right:11px;top:50%;width:5px;height:5px;margin-top:-4px;border:solid var(--_mut);border-width:0 1.5px 1.5px 0;transform:rotate(45deg);pointer-events:none}
    .tabbar .actions{margin-left:auto}
    .dd{appearance:none;-webkit-appearance:none;max-width:100%;min-height:28px;padding:0 28px 0 10px;background:var(--_bg);border:1px solid var(--_bd);border-radius:calc(var(--radius,8px) - 2px);color:var(--_fg);font:500 12px/1 var(--font-mono,'JetBrains Mono',ui-monospace,monospace);cursor:pointer}
    .dd:focus-visible{outline:2px solid var(--_hov);outline-offset:1px}
    @media(pointer:coarse){.dd{min-height:44px}}
    @media(prefers-reduced-motion:reduce){.tab{transition:none}}
  \`];
  constructor(){super();this._active=0;}
  _syncKey(){const k=this.getAttribute('sync');if(k===null)return 'code';return /^(off|none|false)$/i.test(k)?'':k;}
  _items(){
    const out=[];
    Array.from(this.children).forEach((ch)=>{
      const tag=ch.tagName;
      let blk=null,tab=null;
      if(tag==='WC-CODE-BLOCK')blk=ch;
      else if(tag==='WC-CODE-TAB'){tab=ch;blk=ch.querySelector('wc-code-block');}
      else return;
      let src,opts;
      if(blk){src=_cbRead(blk);opts=_cbOpts(blk);}
      else{
        const inner=tab.innerHTML.trim();
        const hl=inner.indexOf('class="line')>=0;
        const code=(hl?(function(){const d=document.createElement('div');d.innerHTML=inner;return d.textContent;})():tab.textContent).replace(/^\\n+|\\s+$/g,'');
        src={code:code,html:hl?inner:null};
        opts=_cbOpts(tab);
      }
      const g=(n)=>(tab&&tab.getAttribute(n))||'';
      const lang=opts.language||g('language');
      const label=g('label')||opts.filename||_cbLangName(lang)||'Tab '+(out.length+1);
      const forKey=g('for')||opts.forKey;
      const markup=src.html||_cbBuildHtml(src,blk||tab);
      const tokens=[forKey,label,_cbCanon(lang),_cbLangName(lang)].filter(Boolean).map(function(x){return String(x).toLowerCase();});
      out.push({label:label,icon:opts.icon||g('icon'),tokens:tokens.filter(function(x,i){return tokens.indexOf(x)===i;}),publish:forKey||_cbLangName(lang)||label,html:markup,code:src.code,total:src.code.split('\\n').length,opts:opts});
    });
    return out;
  }
  connectedCallback(){
    super.connectedCallback();
    const key=this._syncKey();
    if(key){
      const items=this._items();
      let want=_cbSyncRead()[key];
      try{const q=new URLSearchParams(location.search).get('language');if(q)want=q;}catch(e){}
      const i=_cbMatch(items,want);
      if(i>=0)this._active=i;
      this._syncListener=(e)=>{
        if(e.detail.key!==key||e.detail.source===this)return;
        const j=_cbMatch(this._items(),e.detail.label);
        if(j>=0)this._active=j;
      };
      document.addEventListener('docslit-tab-sync',this._syncListener);
    }
  }
  disconnectedCallback(){
    super.disconnectedCallback();
    if(this._syncListener){document.removeEventListener('docslit-tab-sync',this._syncListener);this._syncListener=null;}
  }
  _select(i,items){
    const key=this._syncKey();
    const top=this.getBoundingClientRect().top;
    this._active=i;
    if(!key)return;
    const label=items[i].publish;
    try{const m=_cbSyncRead();m[key]=label;localStorage.setItem(_CB_SYNC_STORE,JSON.stringify(m));}catch(e){}
    document.dispatchEvent(new CustomEvent('docslit-tab-sync',{detail:{key:key,label:label,source:this}}));
    // keep the clicked group where the reader is looking while other groups resize
    requestAnimationFrame(()=>{const d=this.getBoundingClientRect().top-top;if(d)window.scrollBy(0,d);});
  }
  _onKey(e,i,items){
    const total=items.length;
    let next=i;
    if(e.key==='ArrowRight')next=(i+1)%total;
    else if(e.key==='ArrowLeft')next=(i-1+total)%total;
    else if(e.key==='Home')next=0;
    else if(e.key==='End')next=total-1;
    else return;
    e.preventDefault();this._select(next,items);
    this.updateComplete.then(()=>{const btn=this.renderRoot.querySelectorAll('[role=tab]')[next];if(btn)btn.focus();});
  }
  render(){
    const items=this._items();
    if(!items.length)return nothing;
    const act=Math.min(this._active,items.length-1);
    const cur=items[act];
    const dropdown=this.hasAttribute('dropdown');
    const nocopy=this.hasAttribute('nocopy')||cur.opts.nocopy;
    const head=dropdown
      ?html\`<div class="dd-wrap"><select class="dd" aria-label="Choose language" @change=\${(e)=>this._select(Number(e.target.value),items)}>\${items.map((it,i)=>html\`<option value=\${i} ?selected=\${i===act}>\${it.label}</option>\`)}</select></div>\`
      :html\`<div class="tabs" role="tablist">\${items.map((it,i)=>html\`<button class="tab" type="button" role="tab" id=\${this._uid+'-t'+i} aria-selected=\${i===act?'true':'false'} aria-controls=\${this._uid+'-p'+i} tabindex=\${i===act?0:-1} @click=\${()=>this._select(i,items)} @keydown=\${(e)=>this._onKey(e,i,items)}>\${it.icon?html\`<span class="ico"><wc-icon name=\${it.icon}></wc-icon></span>\`:nothing}\${it.label}</button>\`)}</div>\`;
    return html\`<div class=\${this._wrapClass('')}>
      <div class="tabbar">\${head}\${this._actions(nocopy,()=>cur.code)}</div>
      \${items.map((it,i)=>html\`<div class="panel" id=\${this._uid+'-p'+i} role=\${dropdown?'group':'tabpanel'} aria-labelledby=\${dropdown?'':this._uid+'-t'+i} ?hidden=\${i!==act}>\${this._panel(it,'p'+i)}</div>\`)}
    </div>\`;
  }
}
customElements.define('wc-code-group',WcCodeGroup);

class WcCodeTab extends LitElement {
  static properties={label:{type:String},language:{type:String},icon:{type:String}};
  static styles=css\`:host{display:none}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-code-tab',WcCodeTab);
`;
