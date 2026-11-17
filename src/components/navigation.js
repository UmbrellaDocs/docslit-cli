// Navigation components: wc-steps, wc-step, wc-tabs, wc-tab, wc-view, wc-view-panel

export default `
// ── WC-STEPS / WC-STEP ────────────────────────────────────────────────────
class WcSteps extends LitElement {
  static properties={titleSize:{type:String,attribute:'title-size'}};
  static styles=css\`:host{display:block;margin:0 0 16px;counter-reset:wc-step}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-steps',WcSteps);

class WcStep extends LitElement {
  static properties={title:{type:String},n:{type:Number},icon:{type:String},titleSize:{type:String,attribute:'title-size'},noAnchor:{type:Boolean,attribute:'no-anchor'}};
  static styles=css\`
    :host{display:block;width:100%;box-sizing:border-box;position:relative}
    .row{display:flex;align-items:flex-start;gap:16px;width:100%;padding-bottom:28px;box-sizing:border-box}
    :host(:last-child) .row{padding-bottom:0}
    .rail{display:flex;flex-direction:column;align-items:center;align-self:stretch;margin-bottom:-28px;flex-shrink:0;width:32px}
    .num{width:32px;height:32px;border-radius:50%;background:var(--accent-dim,rgba(1,105,111,.15));border:1px solid var(--accent,#01696f);color:var(--accent-light,#4f98a3);font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:0}
    .num ::slotted(span),.num ::slotted(svg){display:inline-flex;width:16px;height:16px}
    .line{flex:1;width:2px;margin-top:6px;margin-bottom:6px;background:var(--border,#2a2a2a);border-radius:1px;min-height:12px}
    :host(:last-child) .line{display:none}
    .content{flex:1;min-width:0;padding-top:3px}
    .titlebar{display:flex;align-items:baseline;gap:8px;margin-bottom:6px;min-width:0}
    .title{font-family:var(--font-sans,'Inter',sans-serif);font-size:16px;font-weight:700;color:var(--text,#e2e8f0);word-break:break-word;line-height:1.4}
    ::slotted([slot="title"]){margin:0;padding:0;border:0;font:inherit;font-weight:700;color:var(--text,#e2e8f0);line-height:1.4}
    .anchor{opacity:0;color:var(--text3,#737373);text-decoration:none;font-size:14px;border-radius:var(--r-xs,3px);transition:opacity .15s}
    :host(:hover) .anchor,.anchor:focus-visible{opacity:1}
    .anchor:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .body{font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;color:var(--text2,#a0a0a0);line-height:1.7;width:100%;box-sizing:border-box;min-width:0}
    ::slotted(*){max-width:100% !important}
    @media(max-width:640px){.rail{width:28px}.num{width:28px;height:28px;font-size:12px}.row{gap:12px}.title{font-size:15px}.body{font-size:13px}}
    @media(prefers-reduced-motion:reduce){.anchor{transition:none}}
  \`;
  render(){
    let num=this.n;
    if(num===undefined||num===null){const parent=this.parentElement;if(parent){const siblings=Array.from(parent.children).filter(el=>el.tagName==='WC-STEP');num=siblings.indexOf(this)+1;}}
    const hasTitleSlot=_hasSlot(this,'title');
    const anchor=this.getAttribute('data-anchor')||this.id;
    const lvl=this.getAttribute('data-title-level');
    return html\`<div class="row"><div class="rail"><div class="num" aria-hidden="true">\${this.icon?html\`<slot name="icon">\${num||''}</slot>\`:(num||'')}</div><div class="line" aria-hidden="true"></div></div><div class="content">\${(this.title||hasTitleSlot)?html\`<div class="titlebar">\${hasTitleSlot?html\`<slot name="title"></slot>\`:html\`<span class="title">\${unsafeHTML(_titleMd(this.title))}</span>\`}\${(anchor&&!this.noAnchor&&!lvl)?html\`<a class="anchor" href="#\${anchor}" aria-label="Link to this step">#</a>\`:nothing}</div>\`:nothing}<div class="body"><slot></slot></div></div></div>\`;
  }
}
customElements.define('wc-step',WcStep);

// ── Synced tabs (sync="key" on wc-tabs / wc-code-group) ───────────────────
const _TAB_SYNC_STORE='docslit-tab-sync';
function _tabSyncRead(){try{return JSON.parse(localStorage.getItem(_TAB_SYNC_STORE)||'{}')||{};}catch(e){return {};}}
function _tabSyncConnect(el,getLabels){
  const key=el.getAttribute('sync');
  if(!key)return;
  const saved=_tabSyncRead()[key];
  if(saved!==undefined){const i=getLabels().indexOf(saved);if(i>=0)el._active=i;}
  el._syncListener=(e)=>{
    if(e.detail.key!==key||e.detail.source===el)return;
    const i=getLabels().indexOf(e.detail.label);
    if(i>=0)el._active=i;
  };
  document.addEventListener('docslit-tab-sync',el._syncListener);
}
function _tabSyncDisconnect(el){
  if(el._syncListener){document.removeEventListener('docslit-tab-sync',el._syncListener);el._syncListener=null;}
}
function _tabSelect(el,i,getLabels){
  const key=el.getAttribute('sync');
  if(!key){el._active=i;return;}
  const top=el.getBoundingClientRect().top;
  el._active=i;
  const label=getLabels()[i];
  try{const m=_tabSyncRead();m[key]=label;localStorage.setItem(_TAB_SYNC_STORE,JSON.stringify(m));}catch(e){}
  document.dispatchEvent(new CustomEvent('docslit-tab-sync',{detail:{key,label,source:el}}));
  // keep the clicked group where the reader is looking while other groups resize
  requestAnimationFrame(()=>{const d=el.getBoundingClientRect().top-top;if(d)window.scrollBy(0,d);});
}

// ── WC-TABS / WC-TAB ──────────────────────────────────────────────────────
let _tabSeq=0;
class WcTabs extends LitElement {
  static properties={defaultTab:{type:Number,attribute:'default-tab'},borderBottom:{type:Boolean,attribute:'border-bottom'},_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0}
    :host([border-bottom]){border-bottom:1px solid var(--border,#2a2a2a);padding-bottom:20px;margin-bottom:24px}
    .tabbar{display:flex;border-bottom:var(--tabbar-line-w,1px) solid var(--border,#2a2a2a);gap:var(--tabbar-gap,0);margin-bottom:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0;scrollbar-width:none}
    .tabbar::-webkit-scrollbar{display:none}
    button{background:var(--tabbtn-bg,none);border:none;border-bottom:var(--tabbtn-bar-w,2px) solid transparent;border-radius:var(--tabbtn-radius,0);padding:10px 18px;font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;font-weight:500;color:var(--text3,#737373);cursor:pointer;margin-bottom:-1px;transition:color .15s,border-color .15s;white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;gap:8px}
    button.active{color:var(--tabbtn-active-fg,var(--accent-light,#4f98a3));border-bottom-color:var(--tabbtn-active-bar,var(--accent,#01696f));background:var(--tabbtn-active-bg,var(--tabbtn-bg,none))}
    button:hover{color:var(--text,#f0f0f0)}
    button:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:-2px;border-radius:4px 4px 0 0}
    .ico{display:inline-flex;width:15px;height:15px}
    .ico svg{width:15px;height:15px}
    .panel{outline:none}
    .panel:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:4px;border-radius:var(--r-xs,4px)}
    @media(max-width:640px){button{padding:8px 12px;font-size:12px;margin-bottom:0;border-bottom-width:3px}}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
    @media print{.tabbar{display:none}}
  \`;
  constructor(){super();this._active=0;this._uid='dl-tabs-'+(++_tabSeq);}
  _tabs(){return Array.from(this.querySelectorAll(':scope > wc-tab'));}
  _labels(){return this._tabs().map((t,i)=>t.getAttribute('label')||'Tab '+(i+1));}
  connectedCallback(){
    super.connectedCallback();
    if(this.defaultTab>0)this._active=this.defaultTab;
    _tabSyncConnect(this,()=>this._labels());
    // deep link: #tab-id opens that tab
    const h=location.hash?decodeURIComponent(location.hash.slice(1)):'';
    if(h){const i=this._tabs().findIndex(t=>(t.id||_slug(t.getAttribute('label')))===h);if(i>=0){this._active=i;requestAnimationFrame(()=>this.scrollIntoView({block:'start'}));}}
  }
  disconnectedCallback(){super.disconnectedCallback();_tabSyncDisconnect(this);}
  _onKey(e,i,total){
    let next=i;
    if(e.key==='ArrowRight')next=(i+1)%total;
    else if(e.key==='ArrowLeft')next=(i-1+total)%total;
    else if(e.key==='Home')next=0;
    else if(e.key==='End')next=total-1;
    else return;
    e.preventDefault();_tabSelect(this,next,()=>this._labels());
    this.updateComplete.then(()=>{const btn=this.shadowRoot.querySelectorAll('[role=tab]')[next];if(btn)btn.focus();});
  }
  render(){
    const tabs=this._tabs();
    tabs.forEach((t,i)=>{t.toggleAttribute('active',i===this._active);});
    return html\`<div class="tabbar" role="tablist">\${tabs.map((t,i)=>{const label=t.getAttribute('label')||'Tab '+(i+1);const active=i===this._active;const ico=_iconMarkup(t);return html\`<button role="tab" id="\${this._uid}-t\${i}" aria-controls="\${this._uid}-p" aria-selected=\${active} tabindex=\${active?0:-1} class="\${active?'active':''}" @click=\${()=>_tabSelect(this,i,()=>this._labels())} @keydown=\${(e)=>this._onKey(e,i,tabs.length)}>\${ico?html\`<span class="ico" aria-hidden="true">\${unsafeHTML(ico)}</span>\`:nothing}<span>\${unsafeHTML(_titleMd(label))}</span></button>\`;})}</div><div class="panel" role="tabpanel" id="\${this._uid}-p" aria-labelledby="\${this._uid}-t\${this._active}"><slot></slot></div>\`;
  }
}
customElements.define('wc-tabs',WcTabs);

class WcTab extends LitElement {
  static properties={label:{type:String},icon:{type:String}};
  static styles=css\`:host{display:none}:host([active]){display:block;padding-top:4px}.print-label{display:none;font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;font-weight:600;color:#555;margin:0 0 8px;padding:4px 0;border-bottom:1px solid #ddd}@media print{:host{display:block !important;padding-top:4px;margin-bottom:12px}.print-label{display:block}}\`;
  render(){return html\`<div class="print-label">\${this.label||''}</div><slot></slot>\`;}
}
customElements.define('wc-tab',WcTab);

// ── WC-VIEW / WC-VIEW-PANEL ───────────────────────────────────────────────
class WcView extends LitElement {
  static properties={_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0;border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,10px);overflow:hidden}
    .toolbar{display:flex;align-items:center;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);padding:0 16px;overflow-x:auto;-webkit-overflow-scrolling:touch;gap:2px;scrollbar-width:none}
    .toolbar::-webkit-scrollbar{display:none}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:10px 14px;font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;font-weight:500;color:var(--text3,#737373);cursor:pointer;white-space:nowrap;flex-shrink:0;transition:color .15s,border-color .15s;margin-bottom:-1px;display:inline-flex;align-items:center;gap:8px}
    button.active{color:var(--tabbtn-active-fg,var(--accent-light,#4f98a3));border-bottom-color:var(--tabbtn-active-bar,var(--accent,#01696f));background:var(--tabbtn-active-bg,var(--tabbtn-bg,none))}
    button:hover{color:var(--text,#f0f0f0)}
    button:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:-2px;border-radius:4px 4px 0 0}
    .ico{display:inline-flex;width:14px;height:14px}
    .ico svg{width:14px;height:14px}
    @media(max-width:640px){button{padding:8px 10px;font-size:12px}}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
    @media print{.toolbar{display:none}}
  \`;
  constructor(){super();this._active=0;}
  _panels(){return Array.from(this.querySelectorAll(':scope > wc-view-panel'));}
  _labels(){return this._panels().map((p,i)=>p.getAttribute('label')||'Panel '+(i+1));}
  connectedCallback(){super.connectedCallback();_tabSyncConnect(this,()=>this._labels());}
  disconnectedCallback(){super.disconnectedCallback();_tabSyncDisconnect(this);}
  _onKey(e,i,total){
    let next=i;
    if(e.key==='ArrowRight')next=(i+1)%total;
    else if(e.key==='ArrowLeft')next=(i-1+total)%total;
    else if(e.key==='Home')next=0;
    else if(e.key==='End')next=total-1;
    else return;
    e.preventDefault();_tabSelect(this,next,()=>this._labels());
    this.updateComplete.then(()=>{const btn=this.shadowRoot.querySelectorAll('[role=tab]')[next];if(btn)btn.focus();});
  }
  render(){
    const panels=this._panels();
    panels.forEach((p,i)=>p.toggleAttribute('active',i===this._active));
    return html\`<div class="toolbar" role="tablist">\${panels.map((p,i)=>{const label=p.getAttribute('label')||'Panel '+(i+1);const active=i===this._active;const ico=_iconMarkup(p);return html\`<button role="tab" aria-selected=\${active} tabindex=\${active?0:-1} class="\${active?'active':''}" @click=\${()=>_tabSelect(this,i,()=>this._labels())} @keydown=\${(e)=>this._onKey(e,i,panels.length)}>\${ico?html\`<span class="ico" aria-hidden="true">\${unsafeHTML(ico)}</span>\`:nothing}<span>\${label}</span></button>\`;})}</div><div role="tabpanel"><slot></slot></div>\`;
  }
}
customElements.define('wc-view',WcView);

class WcViewPanel extends LitElement {
  static properties={label:{type:String},icon:{type:String}};
  static styles=css\`:host{display:none}:host([active]){display:block}.inner{padding:14px 24px}.print-label{display:none;font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;font-weight:600;color:#555;margin:0 0 8px;padding:4px 0;border-bottom:1px solid #ddd}@media print{:host{display:block !important;padding-top:4px;margin-bottom:12px}.print-label{display:block}}\`;
  render(){return html\`<div class="print-label">\${this.label||''}</div><div class="inner"><slot></slot></div>\`;}
}
customElements.define('wc-view-panel',WcViewPanel);
`;
