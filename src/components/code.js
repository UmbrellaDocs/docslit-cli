// Code components: wc-code-block, wc-code-group, wc-code-tab

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
    .badge{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:4px;background:rgba(1,105,111,.1);border:1px solid rgba(1,105,111,.3);font-family:'JetBrains Mono',monospace;font-size:.9em;font-weight:600;font-style:italic;color:#3d7a83;cursor:pointer;transition:background .15s,border-color .15s;vertical-align:baseline;line-height:inherit}
    .badge:hover{background:rgba(1,105,111,.18);border-color:rgba(1,105,111,.5)}
    .pencil{font-style:normal;font-size:.8em;opacity:.6}
    .edit-wrap{display:inline-flex;align-items:center;gap:4px;vertical-align:baseline}
    input{font-family:'JetBrains Mono',monospace;font-size:.9em;font-weight:600;color:#3d7a83;background:rgba(1,105,111,.08);border:1px solid rgba(1,105,111,.4);border-radius:4px;padding:1px 7px;outline:none;min-width:60px;width:auto;line-height:inherit}
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
function _getCodeTheme(){return localStorage.getItem('docslit-code-theme')||'';}
function _setCodeTheme(t){
  localStorage.setItem('docslit-code-theme',t);
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

// ── WC-CODE-BLOCK ──────────────────────────────────────────────────────────
class WcCodeBlock extends LitElement {
  static properties={language:{type:String},filename:{type:String},highlighted:{type:Boolean,reflect:true},linenumbers:{type:String},_code:{type:String,state:true},_highlighted:{type:String,state:true},_copied:{type:Boolean,state:true},_menuOpen:{type:Boolean,state:true},_resolvedTheme:{type:String,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;width:100%;box-sizing:border-box;max-width:100%}
    :host([theme="dark"]),.dark-theme{--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text3:#666;--code-bg:#161616;--code-text:#e2e8f0}
    :host([theme="light"]),.light-theme{--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text3:#737373;--code-bg:#f6f8fa;--code-text:#24292f}
    .wrap{background:var(--code-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;width:100%;box-sizing:border-box}
    .header{display:flex;align-items:center;justify-content:space-between;padding:3px 3px;background:var(--surface);border-bottom:1px solid var(--border);gap:8px;flex-wrap:wrap;width:100%;box-sizing:border-box}
    .filename{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text3);word-break:break-all;flex:1;min-width:0}
    .lang{font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;white-space:nowrap;flex-shrink:0}
    .actions{display:flex;align-items:center;gap:2px;flex-shrink:0}
    .body{overflow:hidden;width:100%;box-sizing:border-box}
    .code-area{display:flex;width:100%;box-sizing:border-box}
    .line-nums{padding:20px 0 20px 16px;margin:0;text-align:right;user-select:none;-webkit-user-select:none;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;color:var(--text3);opacity:.5;flex-shrink:0;white-space:pre}
    pre{margin:0;padding:20px;overflow:hidden;white-space:pre-wrap;word-break:break-all;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;color:var(--code-text);width:100%;box-sizing:border-box;flex:1;min-width:0}
    .var-span{color:#3d7a83;font-weight:600;font-style:italic;cursor:pointer;border-bottom:1px dashed rgba(1,105,111,.4);transition:background .15s}
    .var-span:hover{background:rgba(1,105,111,.12)}
    .copy-btn{background:none;border:1px solid var(--border);border-radius:5px;padding:4px 8px;cursor:pointer;color:var(--text3);font-size:12px;font-family:'Inter',sans-serif;transition:color .15s,border-color .15s;flex-shrink:0;display:flex;align-items:center;gap:4px}
    .copy-btn:hover{color:#3d7a83;border-color:#3d7a83}
    .copy-btn:focus-visible{outline:2px solid #01696f;outline-offset:2px}
    .copy-btn.copied{color:#34d399;border-color:rgba(16,185,129,.4)}
    .menu-wrap{position:relative}
    .menu-btn{background:none;border:1px solid var(--border);border-radius:5px;padding:4px 6px;cursor:pointer;color:var(--text3);font-size:14px;line-height:1;transition:color .15s,border-color .15s;display:flex;align-items:center;justify-content:center;min-width:24px;min-height:24px}
    .menu-btn:hover{color:#3d7a83;border-color:#3d7a83}
    .menu-btn:focus-visible{outline:2px solid #01696f;outline-offset:2px}
    .menu{position:absolute;top:calc(100% + 4px);right:0;background:var(--surface,#111);border:1px solid var(--border);border-radius:8px;padding:4px;min-width:160px;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:10;font-family:'Inter',sans-serif}
    .menu-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;background:none;width:100%;cursor:pointer;font-size:13px;font-family:'Inter',sans-serif;color:var(--text3);border-radius:6px;transition:background .15s;white-space:nowrap}
    .menu-item:hover{background:var(--surface2,#1a1a1a)}
    .menu-item svg{flex-shrink:0}
    .line{display:block}
    :host(.light-shiki) .line span,:host([theme="light"]) .line span{color:var(--shiki-light) !important}
    @media(max-width:640px){.header{padding:8px 12px;}.filename{font-size:11px;}.lang{font-size:10px;}pre{padding:10px 8px;font-size:12px;line-height:1.6;}}
  \`;
  connectedCallback(){
    super.connectedCallback();
    if(this._code===undefined){
      if(this.highlighted){
        this._highlighted=this.innerHTML.trim();
        const tmp=document.createElement('div');
        tmp.innerHTML=this._highlighted;
        this._code=tmp.textContent;
      }else{
        this._code=this.innerHTML.trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      }
      this.innerHTML='';
    }
    this._copied=false;
    this._menuOpen=false;
    this._applyTheme();
    this._varListener=(e)=>{if(this._code&&this._code.includes('{{'+e.detail.name+'}}'))this.requestUpdate();};
    this._themeListener=()=>this._applyTheme();
    document.addEventListener('docslit-var-change',this._varListener);
    document.addEventListener('docslit-code-theme',this._themeListener);
    if(!this.hasAttribute('theme')){this._themeObs=new MutationObserver(()=>this._applyTheme());this._themeObs.observe(document.documentElement,{attributes:true,attributeFilter:['class']});}
    this._outsideClick=(e)=>{if(this._menuOpen&&!e.composedPath().includes(this))this._menuOpen=false;};
    document.addEventListener('click',this._outsideClick);
  }
  disconnectedCallback(){
    super.disconnectedCallback();
    document.removeEventListener('docslit-var-change',this._varListener);
    document.removeEventListener('docslit-code-theme',this._themeListener);
    document.removeEventListener('click',this._outsideClick);
    if(this._themeObs){this._themeObs.disconnect();this._themeObs=null;}
  }
  _applyTheme(){
    const t=_resolveCodeTheme(this);
    this._resolvedTheme=t;
    this.classList.toggle('light-shiki',t==='light');
  }
  _getSubstitutedText(){
    let text=this._code||'';
    const vars=window.__docslit_vars__||{};
    return text.replace(/\\{\\{([A-Z_][A-Z0-9_]*)\\}\\}/g,(_,name)=>vars[name]!==undefined?vars[name]:name);
  }
  async _copyCode(){
    try{await navigator.clipboard.writeText(this._getSubstitutedText());this._copied=true;setTimeout(()=>{this._copied=false;this.requestUpdate();},2000);this.requestUpdate();}catch(e){}
  }
  _renderCode(){
    const code=this._code||'';
    const vars=window.__docslit_vars__||{};
    const re=/\\{\\{([A-Z_][A-Z0-9_]*)\\}\\}/g;
    const parts=[];
    let last=0;
    let m;
    while((m=re.exec(code))!==null){
      if(m.index>last)parts.push(code.slice(last,m.index));
      const varName=m[1];
      const val=vars[varName]!==undefined?vars[varName]:varName;
      parts.push(html\`<span class="var-span" title="Variable: \${varName} — click to edit" @click=\${()=>this._editVar(varName)}>\${val}</span>\`);
      last=re.lastIndex;
    }
    if(last<code.length)parts.push(code.slice(last));
    return parts;
  }
  _editVar(name){
    document.dispatchEvent(new CustomEvent('docslit-var-edit',{detail:{name}}));
  }
  _toggleMenu(){this._menuOpen=!this._menuOpen;}
  _switchTheme(){this._menuOpen=false;_toggleCodeTheme();}
  _showLineNums(){
    if(this.linenumbers!=='true')return nothing;
    const code=this._code||'';
    const count=code.split('\\n').length;
    return html\`<div class="line-nums">\${Array.from({length:count},(_,i)=>i+1).join('\\n')}</div>\`;
  }
  render(){
    const hasHeader=this.filename||this.language;
    const isLight=this._resolvedTheme==='light';
    const themeLabel=isLight?'Dark code theme':'Light code theme';
    const themeSvg=isLight
      ?html\`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>\`
      :html\`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>\`;
    return html\`<div class="wrap \${isLight?'light-theme':'dark-theme'}">
      \${hasHeader?html\`<div class="header"><span class="filename">\${this.filename||''}</span><span class="lang">\${this.language||''}</span><div class="actions"><button class="copy-btn \${this._copied?'copied':''}" @click=\${this._copyCode} title="Copy code" aria-label=\${this._copied?'Copied':'Copy'}>\${this._copied?'\\u2713 Copied':'\\u29C9 Copy'}</button><div class="menu-wrap"><button class="menu-btn" @click=\${this._toggleMenu} title="More options" aria-label="More options">\\u22EE</button>\${this._menuOpen?html\`<div class="menu"><button class="menu-item" @click=\${this._switchTheme}>\${themeSvg} \${themeLabel}</button></div>\`:nothing}</div></div></div>\`:nothing}
      <div class="body"><div class="code-area">\${this._showLineNums()}<pre>\${this._highlighted?unsafeHTML(this._highlighted):this._renderCode()}</pre></div></div>
    </div>\`;
  }
}
customElements.define('wc-code-block',WcCodeBlock);

// ── WC-CODE-GROUP / WC-CODE-TAB ────────────────────────────────────────────
class WcCodeGroup extends LitElement {
  static properties={_active:{type:Number,state:true},_resolvedTheme:{type:String,state:true},_copied:{type:Boolean,state:true},_menuOpen:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0;border-radius:10px;overflow:hidden}
    :host([theme="dark"]),.dark-theme{--surface:#111;--border:#2a2a2a;--code-bg:#161616;--code-text:#e2e8f0}
    :host([theme="light"]),.light-theme{--surface:#f8f8f8;--border:#e2e2e2;--code-bg:#f6f8fa;--code-text:#24292f}
    .outer{background:var(--code-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden}
    .tabbar{display:flex;align-items:center;background:var(--surface);border-bottom:1px solid var(--border);gap:0}
    .tabs{display:flex;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
    .tabs::-webkit-scrollbar{display:none}
    .tab-btn{background:none;border:none;border-bottom:2px solid transparent;padding:9px 16px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;color:var(--text3);cursor:pointer;white-space:nowrap;flex-shrink:0;margin-bottom:-1px;transition:all .15s}
    .tab-btn.active{color:#3d7a83;border-bottom-color:#01696f;background:var(--code-bg)}
    .tab-btn:hover{color:#a0a0a0}
    .tab-btn:focus-visible{outline:2px solid #01696f;outline-offset:-2px;border-radius:4px 4px 0 0}
    .actions{display:flex;align-items:center;gap:2px;flex-shrink:0;padding:0 4px}
    .copy-btn{background:none;border:1px solid var(--border);border-radius:5px;padding:4px 8px;cursor:pointer;color:var(--text3);font-size:12px;font-family:'Inter',sans-serif;transition:color .15s,border-color .15s;flex-shrink:0;display:flex;align-items:center;gap:4px}
    .copy-btn:hover{color:#3d7a83;border-color:#3d7a83}
    .copy-btn:focus-visible{outline:2px solid #01696f;outline-offset:2px}
    .copy-btn.copied{color:#34d399;border-color:rgba(16,185,129,.4)}
    .menu-wrap{position:relative}
    .menu-btn{background:none;border:1px solid var(--border);border-radius:5px;padding:4px 6px;cursor:pointer;color:var(--text3);font-size:14px;line-height:1;transition:color .15s,border-color .15s;display:flex;align-items:center;justify-content:center;min-width:24px;min-height:24px}
    .menu-btn:hover{color:#3d7a83;border-color:#3d7a83}
    .menu-btn:focus-visible{outline:2px solid #01696f;outline-offset:2px}
    .menu{position:absolute;top:calc(100% + 4px);right:0;background:var(--surface,#111);border:1px solid var(--border);border-radius:8px;padding:4px;min-width:160px;box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:10;font-family:'Inter',sans-serif}
    .menu-item{display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;background:none;width:100%;cursor:pointer;font-size:13px;font-family:'Inter',sans-serif;color:var(--text3);border-radius:6px;transition:background .15s;white-space:nowrap}
    .menu-item:hover{background:var(--surface2,#1a1a1a)}
    .menu-item svg{flex-shrink:0}
    .panel{display:none}.panel.active{display:block}
    pre{margin:0;padding:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;color:var(--code-text);max-width:100%;box-sizing:border-box;scrollbar-width:none}
    pre::-webkit-scrollbar{display:none}
    .line{display:block}
    :host(.light-shiki) .line span,:host([theme="light"]) .line span{color:var(--shiki-light) !important}
    @media(max-width:640px){.tab-btn{padding:7px 12px;font-size:11px;}pre{padding:10px 8px;font-size:12px;}}
    @media(prefers-reduced-motion:reduce){.tab-btn{transition:none}}
  \`;
  constructor(){super();this._active=0;this._copied=false;this._menuOpen=false;}
  connectedCallback(){
    super.connectedCallback();
    this._applyTheme();
    this._themeListener=()=>this._applyTheme();
    document.addEventListener('docslit-code-theme',this._themeListener);
    if(!this.hasAttribute('theme')){this._themeObs=new MutationObserver(()=>this._applyTheme());this._themeObs.observe(document.documentElement,{attributes:true,attributeFilter:['class']});}
    this._outsideClick=(e)=>{if(this._menuOpen&&!e.composedPath().includes(this))this._menuOpen=false;};
    document.addEventListener('click',this._outsideClick);
  }
  disconnectedCallback(){
    super.disconnectedCallback();
    document.removeEventListener('docslit-code-theme',this._themeListener);
    document.removeEventListener('click',this._outsideClick);
    if(this._themeObs){this._themeObs.disconnect();this._themeObs=null;}
  }
  _applyTheme(){
    const t=_resolveCodeTheme(this);
    this._resolvedTheme=t;
    this.classList.toggle('light-shiki',t==='light');
  }
  async _copyCode(){
    const tabs=Array.from(this.querySelectorAll('wc-code-tab'));
    const tab=tabs[this._active];
    if(!tab)return;
    try{await navigator.clipboard.writeText(tab.textContent.trim());this._copied=true;setTimeout(()=>{this._copied=false;this.requestUpdate();},2000);this.requestUpdate();}catch(e){}
  }
  _toggleMenu(){this._menuOpen=!this._menuOpen;}
  _switchTheme(){this._menuOpen=false;_toggleCodeTheme();}
  _onKey(e,i,total){
    let next=i;
    if(e.key==='ArrowRight')next=Math.min(i+1,total-1);
    else if(e.key==='ArrowLeft')next=Math.max(i-1,0);
    else if(e.key==='Home')next=0;
    else if(e.key==='End')next=total-1;
    else return;
    e.preventDefault();this._active=next;
    this.updateComplete.then(()=>{const btn=this.shadowRoot.querySelectorAll('[role=tab]')[next];if(btn)btn.focus();});
  }
  render(){
    const tabs=Array.from(this.querySelectorAll('wc-code-tab'));
    const isLight=this._resolvedTheme==='light';
    const themeLabel=isLight?'Dark code theme':'Light code theme';
    const themeSvg=isLight
      ?html\`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>\`
      :html\`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>\`;
    return html\`<div class="outer \${isLight?'light-theme':'dark-theme'}"><div class="tabbar"><div class="tabs" role="tablist">\${tabs.map((t,i)=>{const label=t.label||t.getAttribute('label')||'Tab '+(i+1);const active=i===this._active;return html\`<button class="tab-btn \${active?'active':''}" role="tab" aria-selected=\${active} tabindex=\${active?0:-1} @click=\${()=>this._active=i} @keydown=\${(e)=>this._onKey(e,i,tabs.length)}>\${label}</button>\`;})}</div><div class="actions"><button class="copy-btn \${this._copied?'copied':''}" @click=\${this._copyCode} title="Copy code" aria-label=\${this._copied?'Copied':'Copy'}>\${this._copied?'\\u2713 Copied':'\\u29C9 Copy'}</button><div class="menu-wrap"><button class="menu-btn" @click=\${this._toggleMenu} title="More options" aria-label="More options">\\u22EE</button>\${this._menuOpen?html\`<div class="menu"><button class="menu-item" @click=\${this._switchTheme}>\${themeSvg} \${themeLabel}</button></div>\`:nothing}</div></div></div>\${tabs.map((t,i)=>{const inner=t.innerHTML.trim();const hl=inner.includes('<span');return html\`<div class="panel \${i===this._active?'active':''}" role="tabpanel"><pre>\${hl?unsafeHTML(inner):t.textContent}</pre></div>\`;})}</div>\`;
  }
}
customElements.define('wc-code-group',WcCodeGroup);

class WcCodeTab extends LitElement {
  static properties={label:{type:String}};
  static styles=css\`:host{display:none}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-code-tab',WcCodeTab);
`;
