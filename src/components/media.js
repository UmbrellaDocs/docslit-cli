// Media & Files components: wc-icon, wc-file, wc-dir, wc-files, wc-tree-item, wc-tree, wc-download, wc-copy

export default `
// ── WC-ICON ────────────────────────────────────────────────────────────────
(function(){
  const _ICONS = {
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    warning:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    error:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    'arrow-right':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    'arrow-left':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    'arrow-up':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    'arrow-down':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
    'chevron-right':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    'chevron-down':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    'external-link':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
    copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
    download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    code:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    terminal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',
    folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    zap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
    package:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    cpu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  };
  window.__DOCSLIT_ICONS__ = _ICONS;

  const _FA_BRANDS = new Set(['github','git','docker','npm','node-js','node','python','java','react','angular','vue-js','aws','google','apple','windows','linux','slack','discord','twitter','x-twitter','facebook','youtube','instagram','stripe','shopify','wordpress','php','rust','golang','swift','android','chrome','firefox','safari','edge','figma','bitbucket','gitlab','jira','confluence','stack-overflow','dev','medium','codepen','css3','html5','js','sass','bootstrap','markdown','digital-ocean','cloudflare','microsoft','ubuntu','debian','fedora','redhat','centos','freebsd','raspberry-pi','usb','bluetooth','paypal','cc-visa','cc-mastercard','cc-amex']);
  const _faCache={};
  const _faPending={};

  // Accepts a bare name ("github", "zap") or Font Awesome classes
  // ("fa-brands fa-github", "fa-solid fa-gear", "fas fa-user", "far fa-star").
  // Returns { key, style, slug } where style is brands|solid|regular and slug the SVG file name.
  const _FA_STYLE={'fa-solid':'solid','fas':'solid','fa':'solid','fa-regular':'regular','far':'regular','fa-brands':'brands','fab':'brands'};
  const _FA_MODS=/^fa-(?:xs|sm|lg|xl|2xs|2xl|[1-9]x|10x|fw|spin|pulse|beat|fade|bounce|flip|shake|spin-pulse|spin-reverse|rotate-\\d+|flip-(?:horizontal|vertical|both)|inverse|border|pull-(?:left|right)|stack|ul|li)$/;
  function _resolveIcon(raw){
    const n=String(raw||'').trim();
    if(!n)return {key:'',style:'',slug:''};
    const parts=n.split(/\\s+/);
    let style='',slug='';
    for(const p of parts){
      if(_FA_STYLE[p]){style=_FA_STYLE[p];continue;}
      if(_FA_MODS.test(p))continue;
      if(p.indexOf('fa-')===0)slug=p.slice(3);
      else if(!slug)slug=p;
    }
    if(!slug)return {key:'',style:'',slug:''};
    if(!style&&parts.length===1&&_ICONS[slug])return {key:slug,style:'',slug:slug};
    if(!style)style=_FA_BRANDS.has(slug)?'brands':'solid';
    return {key:style+'/'+slug,style:style,slug:slug};
  }

  class WcIcon extends LitElement {
    static properties={name:{type:String},iconType:{type:String,attribute:'icon-type'},size:{type:Number},color:{type:String},src:{type:String},label:{type:String}};
    static styles=css\`
      :host{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;line-height:0}
      span{display:flex;align-items:center;justify-content:center}
      ::slotted(svg),::slotted(img){width:100%;height:100%;display:block;object-fit:contain}
      svg{width:100%;height:100%}
    \`;
    // Icons are normally resolved at BUILD time (inline SVG child). This runtime lookup only serves
    // wc-icon elements created without one (JS-built DOM); it never fetches over file:// / offline.
    _needsFetch(){if(location.protocol==='file:')return null;const r=_resolveIcon(this.name);return !!r.slug&&!!r.style&&!_faCache[r.key]?r:null;}
    connectedCallback(){super.connectedCallback();const r=this._needsFetch();if(r)this._fetchFa(r);}
    updated(changed){if(changed.has('name')){const r=this._needsFetch();if(r)this._fetchFa(r);}}
    async _fetchFa(r){
      const k=r.key;
      if(_faPending[k]){_faPending[k].then(()=>this.requestUpdate());return;}
      _faPending[k]=fetch('https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/svgs/'+r.style+'/'+r.slug+'.svg')
        .then(res=>res.ok?res.text():null)
        .then(svg=>{if(svg){_faCache[k]=svg;}delete _faPending[k];})
        .catch(()=>{delete _faPending[k];});
      await _faPending[k];
      this.requestUpdate();
    }
    render(){
      const s=this.size||16;
      const c=this.color||'currentColor';
      const a11y=this.label?html\`role="img" aria-label=\${this.label}\`:nothing;
      const box='color:'+c+';width:'+s+'px;height:'+s+'px';
      if(this.querySelector(':scope > svg, :scope > img')){
        return html\`<span style=\${box} aria-hidden=\${this.label?nothing:'true'} role=\${this.label?'img':nothing} aria-label=\${this.label||nothing}><slot></slot></span>\`;
      }
      const r=_resolveIcon(this.name);
      const svg=r.style?_faCache[r.key]:_ICONS[r.key];
      if(svg){
        return html\`<span style=\${box} aria-hidden="true" .innerHTML=\${svg.replace(/<svg/,'<svg width="'+s+'" height="'+s+'" fill="currentColor"')}></span>\`;
      }
      return html\`<span style=\${box} aria-hidden="true"></span>\`;
    }
  }
  customElements.define('wc-icon',WcIcon);
})();

// ── WC-FILE / WC-DIR / WC-FILES ────────────────────────────────────────────
class WcFile extends LitElement {
  static properties={name:{type:String},highlight:{type:Boolean},comment:{type:String},href:{type:String}};
  static styles=css\`
    :host{display:block}
    .row{display:flex;align-items:center;gap:8px;padding:3px 8px;border-radius:4px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;color:var(--text2,#a0a0a0)}
    :host([highlight]) .row{background:var(--accent-dim,rgba(1,105,111,.1));color:var(--text,#0f0f0f)}
    .icon{color:var(--text3,#737373);flex-shrink:0;display:inline-flex;width:15px;height:15px;line-height:1;font-size:14px}
    .icon ::slotted(span),.icon ::slotted(svg){display:inline-flex;width:15px;height:15px}
    :host([highlight]) .icon{color:var(--accent-light,#4f98a3)}
    a{color:inherit;text-decoration:underline;text-decoration-color:var(--text3,#737373);text-underline-offset:3px}
    a:hover{color:var(--accent-light,#4f98a3)}
    a:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px;border-radius:2px}
    .comment{color:var(--text3,#737373);font-size:11px;margin-left:auto;padding-left:12px}
    @media(max-width:640px){.row{font-size:12px}}
  \`;
  render(){return html\`<div class="row"><span class="icon" aria-hidden="true"><slot name="icon">📄</slot></span>\${this.href?html\`<a href=\${this.href}>\${this.name}</a>\`:html\`<span>\${this.name}</span>\`}\${this.comment?html\`<span class="comment"># \${String(this.comment).replace(/^#\\s*/,'')}</span>\`:nothing}</div>\`;}
}
customElements.define('wc-file',WcFile);

class WcDir extends LitElement {
  static properties={name:{type:String},open:{type:Boolean},collapsed:{type:Boolean},href:{type:String},comment:{type:String},highlight:{type:Boolean},openable:{type:String}};
  static styles=css\`
    :host{display:block}
    .row{display:flex;align-items:center;gap:8px;padding:3px 8px;border-radius:4px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;color:var(--text,#f0f0f0);cursor:pointer;user-select:none;width:100%;box-sizing:border-box;background:none;border:none;text-align:left}
    .row.static{cursor:default}
    .row:hover{background:rgba(128,128,128,.08)}
    .row.hl{background:var(--accent-dim,rgba(1,105,111,.1))}
    .row:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:-2px}
    .icon{flex-shrink:0;display:inline-flex;width:15px;height:15px;line-height:1;font-size:14px;color:var(--text3,#737373)}
    .icon ::slotted(span),.icon ::slotted(svg){display:inline-flex;width:15px;height:15px}
    .chevron{font-size:10px;color:var(--text3,#737373);transition:transform .15s;flex-shrink:0}
    .chevron.open{transform:rotate(90deg)}
    .comment{color:var(--text3,#737373);font-size:11px;margin-left:auto;padding-left:12px}
    .children{padding-left:20px;border-left:1px solid var(--border,#2a2a2a);margin:2px 0 2px 12px}
    .tg{all:unset;display:inline-flex;align-items:center;gap:8px;cursor:pointer;border-radius:3px}
    .tg:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    a{color:inherit;text-decoration:underline;text-decoration-color:var(--text3,#737373);text-underline-offset:3px}
    @media(max-width:640px){.row{font-size:12px}}
    @media(prefers-reduced-motion:reduce){.chevron{transition:none}}
  \`;
  constructor(){super();this.open=true;}
  connectedCallback(){super.connectedCallback();if(this.hasAttribute('collapsed'))this.open=false;}
  _static(){return this.openable==='false';}
  _toggle(){if(!this._static())this.open=!this.open;}
  render(){
    const st=this._static();
    const chev=st?nothing:html\`<span class="chevron \${this.open?'open':''}" aria-hidden="true">▶</span>\`;
    const ico=html\`<span class="icon" aria-hidden="true">\${this.open?html\`<slot name="icon-open">📂</slot>\`:html\`<slot name="icon">📁</slot>\`}</span>\`;
    const cmt=this.comment?html\`<span class="comment"># \${String(this.comment).replace(/^#\\s*/,'')}</span>\`:nothing;
    const cls='row '+(st?'static ':'')+(this.highlight?'hl':'');
    const head=this.href
      ?html\`<div class="\${cls}"><button type="button" class="tg" aria-expanded=\${st?nothing:String(this.open)} aria-label=\${'Toggle '+this.name} @click=\${this._toggle}>\${chev}\${ico}</button><a href=\${this.href}>\${this.name}</a>\${cmt}</div>\`
      :html\`<button type="button" class="\${cls}" aria-expanded=\${st?nothing:String(this.open)} @click=\${this._toggle}>\${chev}\${ico}<span>\${this.name}</span>\${cmt}</button>\`;
    return html\`\${head}\${this.open?html\`<div class="children" role="group"><slot></slot></div>\`:nothing}\`;
  }
}
customElements.define('wc-dir',WcDir);

class WcFiles extends LitElement {
  static styles=css\`
    :host{display:block;margin:0 0 12px}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,10px);padding:12px 16px;overflow-x:auto;-webkit-overflow-scrolling:touch}
  \`;
  render(){return html\`<div class="wrap"><slot></slot></div>\`;}
}
customElements.define('wc-files',WcFiles);

// ── WC-TREE-ITEM / WC-TREE ─────────────────────────────────────────────────
class WcTreeItem extends LitElement {
  static properties={label:{type:String},title:{type:String},open:{type:Boolean},icon:{type:String}};
  static styles=css\`
    :host{display:block}
    :host([theme="dark"]){--border:#2a2a2a;--text2:#a0a0a0;--text:#f0f0f0;--text3:#666}
    :host([theme="light"]){--border:#e2e2e2;--text2:#555;--text:#0f0f0f;--text3:#737373}
    .row{display:flex;align-items:center;gap:8px;padding:0 8px;line-height:1.15;border-radius:4px;font-family:'JetBrains Mono','Courier New',monospace;font-size:13px;color:var(--text2,#a0a0a0);cursor:pointer;user-select:none}
    .row:hover{color:var(--text,#f0f0f0);background:rgba(128,128,128,.08)}
    .row:focus-visible{outline:2px solid #01696f;outline-offset:-2px}
    .chevron{font-size:10px;color:var(--text3,#666);transition:transform .15s;flex-shrink:0;width:12px}
    .chevron.open{transform:rotate(90deg)}
    .icon{flex-shrink:0}
    .children{padding-left:20px;border-left:1px solid var(--border,#2a2a2a);margin:2px 0 2px 10px}
    ::slotted(*){max-width:100%}
    @media(prefers-reduced-motion:reduce){.chevron{transition:none}}
  \`;
  constructor(){super();this.open=false;}
  _hasChildren(){return this.querySelectorAll('wc-tree-item').length>0;}
  _toggle(){if(this._hasChildren())this.open=!this.open;}
  _onKey(e){if(this._hasChildren()&&(e.key==='Enter'||e.key===' ')){e.preventDefault();this._toggle();}}
  render(){
    const hasKids=this._hasChildren();
    return html\`<div class="row" style="\${hasKids?'':'cursor:default'}" tabindex=\${hasKids?0:-1} role=\${hasKids?'button':'treeitem'} aria-expanded=\${hasKids?this.open:nothing} @click=\${this._toggle} @keydown=\${this._onKey}>\${hasKids?html\`<span class="chevron \${this.open?'open':''}" aria-hidden="true">▶</span>\`:html\`<span class="chevron"></span>\`}\${this.icon?html\`<span class="icon" aria-hidden="true">\${this.icon}</span>\`:nothing}<span>\${this.label||this.title}</span></div>\${this.open?html\`<div class="children" role="group"><slot></slot></div>\`:nothing}\`;
  }
}
customElements.define('wc-tree-item',WcTreeItem);

class WcTree extends LitElement {
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;padding:12px 16px}
  \`;
  render(){return html\`<div class="wrap"><slot></slot></div>\`;}
}
customElements.define('wc-tree',WcTree);

// ── WC-DOWNLOAD ────────────────────────────────────────────────────────────
// Store-only ZIP writer (no compression, no dependency) for multi-file downloads.
const _crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function _crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=_crcTable[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function _zipStore(files){
  const enc=new TextEncoder();const parts=[];const central=[];let offset=0;
  for(const f of files){
    const name=enc.encode(f.name);const crc=_crc32(f.data);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);lh.setUint16(10,0,true);lh.setUint16(12,0x21,true);
    lh.setUint32(14,crc,true);lh.setUint32(18,f.data.length,true);lh.setUint32(22,f.data.length,true);lh.setUint16(26,name.length,true);lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer),name,f.data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);ch.setUint16(12,0,true);ch.setUint16(14,0x21,true);
    ch.setUint32(16,crc,true);ch.setUint32(20,f.data.length,true);ch.setUint32(24,f.data.length,true);ch.setUint16(28,name.length,true);ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer),name);
    offset+=30+name.length+f.data.length;
  }
  const cdSize=central.reduce((n,x)=>n+x.length,0);
  const end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cdSize,true);end.setUint32(16,offset,true);
  return new Blob([...parts,...central,new Uint8Array(end.buffer)],{type:'application/zip'});
}
class WcDownload extends LitElement {
  static properties={href:{type:String},filename:{type:String},label:{type:String},size:{type:String},sources:{type:String},_busy:{type:Boolean,state:true},_err:{type:String,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 12px}
    a,button{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--radius,8px);font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;font-weight:500;color:var(--text,#f0f0f0);text-decoration:none;transition:border-color .15s,background .15s;cursor:pointer}
    a:hover,button:hover{border-color:var(--border2,#3a3a3a);background:var(--surface2,#1a1a1a)}
    a:focus-visible,button:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    button:disabled{opacity:.6;cursor:progress}
    .dl-icon{width:16px;height:16px;opacity:.7;flex-shrink:0;display:inline-flex}
    .dl-icon svg{width:16px;height:16px}
    .meta{font-size:12px;color:var(--text3,#737373);margin-left:4px}
    .err{margin-top:6px;font-size:12px;color:#ef4444;font-family:var(--font-sans,'Inter',sans-serif)}
    @media(prefers-reduced-motion:reduce){a,button{transition:none}}
  \`;
  _list(){const raw=(this.sources||'').trim();if(!raw)return [];if(raw[0]==='['){try{return JSON.parse(raw).map(String);}catch(e){return [];}}return raw.split(/[\\s,]+/).filter(Boolean);}
  async _zip(){
    const urls=this._list();this._busy=true;this._err='';
    try{
      if(urls.length===1){const a=document.createElement('a');a.href=urls[0];a.download=this.filename||'';document.body.appendChild(a);a.click();a.remove();return;}
      const files=[];
      for(const u of urls){const r=await fetch(u);if(!r.ok)throw new Error(u+' ('+r.status+')');files.push({name:decodeURIComponent((u.split('?')[0].split('/').pop())||'file'),data:new Uint8Array(await r.arrayBuffer())});}
      const blob=_zipStore(files);const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=this.filename||'download.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    }catch(e){this._err='Download failed: '+(e&&e.message?e.message:e)+'. The files must be served from a CORS-enabled origin.';}
    finally{this._busy=false;}
  }
  render(){
    const dlIcon=window.__DOCSLIT_ICONS__?.download?html\`<span class="dl-icon" aria-hidden="true" .innerHTML=\${window.__DOCSLIT_ICONS__.download}></span>\`:nothing;
    const text=this.label||(this.textContent||'').trim()||this.filename||'Download';
    const meta=this.size?html\`<span class="meta">(\${this.size})</span>\`:nothing;
    if(this._list().length){return html\`<button type="button" ?disabled=\${this._busy} @click=\${this._zip}>\${dlIcon}\${text}\${meta}</button>\${this._err?html\`<div class="err" role="alert">\${this._err}</div>\`:nothing}\`;}
    return html\`<a href="\${this.href||'#'}" download="\${this.filename||''}">\${dlIcon}\${text}\${meta}</a>\`;
  }
}
customElements.define('wc-download',WcDownload);

// ── WC-COPY ────────────────────────────────────────────────────────────────
class WcCopy extends LitElement {
  static properties={text:{type:String},label:{type:String},clipboard:{type:String},_copied:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:inline-block}
    .wrap{display:inline-flex;align-items:center;gap:8px;padding:3px 10px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:6px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;color:var(--text2,#a0a0a0);cursor:pointer;transition:border-color .15s,color .15s;user-select:none;line-height:1.5}
    .wrap:hover{border-color:var(--border2,#3a3a3a);color:var(--text,#f0f0f0)}
    .wrap:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .wrap.copied{border-color:rgba(16,185,129,.5);color:#10b981;background:rgba(16,185,129,.06)}
    .icon{width:13px;height:13px;flex-shrink:0;opacity:.6;display:inline-flex}
    .icon svg{width:13px;height:13px}
    @media(max-width:640px){.wrap{font-size:12px;padding:3px 8px}}
    @media(prefers-reduced-motion:reduce){.wrap{transition:none}}
  \`;
  constructor(){super();this._copied=false;}
  _value(){return this.clipboard||this.text||(this.textContent||'').trim()||'';}
  async _copy(){
    try{await navigator.clipboard.writeText(this._value());this._copied=true;setTimeout(()=>this._copied=false,2000);}catch(e){console.error('Copy failed',e);}
  }
  _onKey(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();this._copy();}}
  render(){
    const shown=this.label||(this.textContent||'').trim()||this.text||'Copy';
    return html\`<span class="wrap \${this._copied?'copied':''}" @click=\${this._copy.bind(this)} @keydown=\${this._onKey} role="button" tabindex="0" aria-label=\${(this._copied?'Copied: ':'Copy: ')+(this._value()||shown)}>\${window.__DOCSLIT_ICONS__?.copy?html\`<span class="icon" aria-hidden="true" .innerHTML=\${window.__DOCSLIT_ICONS__.copy}></span>\`:nothing}\${this._copied?'Copied!':shown}</span><span aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">\${this._copied?'Copied to clipboard':''}</span>\`;
  }
}
customElements.define('wc-copy',WcCopy);

// ── WC-IMAGE (lazy, dark-src, lightbox) ────────────────────────────────────
class WcImage extends LitElement {
  static properties={src:{type:String},alt:{type:String},darkSrc:{type:String,'dark-src':{type:String,attribute:'dark-src'}},width:{type:Number},height:{type:Number},noZoom:{type:Boolean,attribute:'no-zoom'},_open:{type:Boolean,state:true},_isDark:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:1rem 0}
    img{max-width:100%;height:auto;border-radius:var(--radius,8px);display:block}
    .zoom{all:unset;display:block;max-width:100%;cursor:zoom-in;border-radius:var(--radius,8px)}
    .zoom:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:3px}
    .lb{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;padding:24px;border:none;width:100%;height:100%}
    .lb:focus-visible{outline:2px solid #fff;outline-offset:-6px}
    .lb img{max-width:95vw;max-height:95vh;cursor:zoom-out;border-radius:4px;width:auto}
  \`;
  constructor(){super();this.alt='';this._open=false;this._isDark=false;}
  connectedCallback(){
    super.connectedCallback();
    this._isDark=document.documentElement.classList.contains('dark');
    this._mq=window.matchMedia('(prefers-color-scheme: dark)');
    this._onTheme=()=>{this._isDark=document.documentElement.classList.contains('dark')||(!document.documentElement.classList.contains('light')&&this._mq.matches);};
    this._mq.addEventListener?.('change',this._onTheme);
    this._obs=new MutationObserver(this._onTheme);this._obs.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    this._onKey=(e)=>{if(e.key==='Escape'&&this._open)this._close();};
    document.addEventListener('keydown',this._onKey);
  }
  disconnectedCallback(){super.disconnectedCallback();this._obs?.disconnect();document.removeEventListener('keydown',this._onKey);this._mq?.removeEventListener?.('change',this._onTheme);}
  get _effectiveSrc(){
    const dark=this.darkSrc||this['dark-src'];
    return (this._isDark&&dark)?dark:this.src;
  }
  _openLb(){this._open=true;this.updateComplete.then(()=>this.renderRoot.querySelector('.lb')?.focus());}
  _close(){this._open=false;this.updateComplete.then(()=>this.renderRoot.querySelector('.zoom')?.focus());}
  render(){
    const src=this._effectiveSrc;
    const img=html\`<img src=\${src||''} alt=\${this.alt||''} loading="lazy" decoding="async" width=\${this.width||nothing} height=\${this.height||nothing} />\`;
    if(this.noZoom)return img;
    return html\`<button type="button" class="zoom" aria-label=\${'Enlarge image'+(this.alt?': '+this.alt:'')} @click=\${this._openLb}>\${img}</button>\${this._open?html\`<button type="button" class="lb" @click=\${this._close} role="dialog" aria-modal="true" aria-label="Image preview (press Escape to close)"><img src=\${src||''} alt=\${this.alt||''} /></button>\`:nothing}\`;
  }
}
customElements.define('wc-image',WcImage);
`;
