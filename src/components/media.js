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

  class WcIcon extends LitElement {
    static properties={name:{type:String},size:{type:Number},color:{type:String}};
    static styles=css\`
      :host{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle}
      span{display:flex;align-items:center;justify-content:center}
      svg{width:var(--icon-size,16px);height:var(--icon-size,16px);color:var(--icon-color,currentColor)}
    \`;
    render(){
      const svg=_ICONS[this.name]||_ICONS['file'];
      const s=this.size||16;
      const c=this.color||'currentColor';
      return html\`<span style="color:\${c};width:\${s}px;height:\${s}px" .innerHTML=\${svg.replace('<svg','<svg width="'+s+'" height="'+s+'"')}></span>\`;
    }
  }
  customElements.define('wc-icon',WcIcon);
})();

// ── WC-FILE / WC-DIR / WC-FILES ────────────────────────────────────────────
class WcFile extends LitElement {
  static properties={name:{type:String},highlight:{type:Boolean},comment:{type:String}};
  static styles=css\`
    :host{display:block}
    :host([theme="dark"]){--border:#2a2a2a;--text2:#a0a0a0;--text3:#666}
    :host([theme="light"]){--border:#e2e2e2;--text2:#555;--text3:#999}
    .row{display:flex;align-items:center;gap:8px;padding:3px 8px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text2,#a0a0a0)}
    :host([highlight]) .row{background:rgba(1,105,111,.1);color:#e2e8f0}
    .icon{color:var(--text3,#666);flex-shrink:0;font-size:14px;line-height:1}
    :host([highlight]) .icon{color:#4f98a3}
    .comment{color:var(--text3,#666);font-size:11px;margin-left:auto}
    @media(max-width:640px){.row{font-size:12px}}
  \`;
  render(){return html\`<div class="row"><span class="icon">📄</span><span>\${this.name}</span>\${this.comment?html\`<span class="comment"># \${this.comment}</span>\`:nothing}</div>\`;}
}
customElements.define('wc-file',WcFile);

class WcDir extends LitElement {
  static properties={name:{type:String},open:{type:Boolean}};
  static styles=css\`
    :host{display:block}
    :host([theme="dark"]){--border:#2a2a2a;--text:#f0f0f0;--text3:#666}
    :host([theme="light"]){--border:#e2e2e2;--text:#0f0f0f;--text3:#999}
    .row{display:flex;align-items:center;gap:8px;padding:3px 8px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text,#f0f0f0);cursor:pointer;user-select:none}
    .row:hover{background:rgba(128,128,128,.08)}
    .icon{flex-shrink:0;font-size:14px;line-height:1}
    .chevron{font-size:10px;color:var(--text3,#666);transition:transform .15s;flex-shrink:0}
    .chevron.open{transform:rotate(90deg)}
    .children{padding-left:20px;border-left:1px solid var(--border,#2a2a2a);margin:2px 0 2px 12px}
    @media(max-width:640px){.row{font-size:12px}}
  \`;
  constructor(){super();this.open=true;}
  render(){return html\`<div class="row" @click=\${()=>this.open=!this.open}><span class="chevron \${this.open?'open':''}">▶</span><span class="icon">\${this.open?'📂':'📁'}</span><span>\${this.name}</span></div>\${this.open?html\`<div class="children"><slot></slot></div>\`:nothing}\`;}
}
customElements.define('wc-dir',WcDir);

class WcFiles extends LitElement {
  static styles=css\`
    :host{display:block;margin:0 0 12px}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;padding:12px 16px;overflow-x:auto;-webkit-overflow-scrolling:touch}
  \`;
  render(){return html\`<div class="wrap"><slot></slot></div>\`;}
}
customElements.define('wc-files',WcFiles);

// ── WC-TREE-ITEM / WC-TREE ─────────────────────────────────────────────────
class WcTreeItem extends LitElement {
  static properties={label:{type:String},open:{type:Boolean},icon:{type:String}};
  static styles=css\`
    :host{display:block}
    :host([theme="dark"]){--border:#2a2a2a;--text2:#a0a0a0;--text:#f0f0f0;--text3:#666}
    :host([theme="light"]){--border:#e2e2e2;--text2:#555;--text:#0f0f0f;--text3:#999}
    .row{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:4px;font-family:'Inter',sans-serif;font-size:14px;color:var(--text2,#a0a0a0);cursor:pointer;user-select:none}
    .row:hover{color:var(--text,#f0f0f0);background:rgba(128,128,128,.08)}
    .chevron{font-size:10px;color:var(--text3,#666);transition:transform .15s;flex-shrink:0;width:12px}
    .chevron.open{transform:rotate(90deg)}
    .icon{flex-shrink:0}
    .children{padding-left:20px;border-left:1px solid var(--border,#2a2a2a);margin:2px 0 2px 10px}
    ::slotted(*){max-width:100%}
  \`;
  constructor(){super();this.open=false;}
  _hasChildren(){return this.querySelectorAll('wc-tree-item').length>0;}
  render(){
    const hasKids=this._hasChildren();
    return html\`<div class="row" @click=\${()=>hasKids&&(this.open=!this.open)}\${hasKids?'':' style="cursor:default"'}>\${hasKids?html\`<span class="chevron \${this.open?'open':''}">▶</span>\`:html\`<span class="chevron"></span>\`}\${this.icon?html\`<span class="icon">\${this.icon}</span>\`:nothing}<span>\${this.label}</span></div>\${this.open?html\`<div class="children"><slot></slot></div>\`:nothing}\`;
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
class WcDownload extends LitElement {
  static properties={href:{type:String},filename:{type:String},label:{type:String},size:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 12px}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a;--border2:#3a3a3a;--text:#f0f0f0}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2;--border2:#d0d0d0;--text:#0f0f0f}
    a{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:8px;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;color:var(--text,#f0f0f0);text-decoration:none;transition:all .15s}
    a:hover{border-color:var(--border2,#3a3a3a);background:var(--surface,#111)}
    .dl-icon{width:16px;height:16px;opacity:.7;flex-shrink:0}
    .meta{font-size:12px;color:var(--text3,#666);margin-left:4px}
  \`;
  render(){return html\`<a href="\${this.href||'#'}" download="\${this.filename||''}">\${window.__DOCSLIT_ICONS__?.download?html\`<span class="dl-icon" .innerHTML=\${window.__DOCSLIT_ICONS__.download}></span>\`:nothing}\${this.label||this.filename||'Download'}\${this.size?html\`<span class="meta">(\${this.size})</span>\`:nothing}</a>\`;}
}
customElements.define('wc-download',WcDownload);

// ── WC-COPY ────────────────────────────────────────────────────────────────
class WcCopy extends LitElement {
  static properties={text:{type:String},label:{type:String},_copied:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:inline-block}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a;--border2:#3a3a3a;--text2:#a0a0a0;--text:#f0f0f0}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2;--border2:#d0d0d0;--text2:#555;--text:#0f0f0f}
    .wrap{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text2,#a0a0a0);cursor:pointer;transition:all .15s;user-select:none}
    .wrap:hover{border-color:var(--border2,#3a3a3a);color:var(--text,#f0f0f0)}
    .wrap.copied{border-color:rgba(16,185,129,.4);color:#34d399;background:rgba(16,185,129,.06)}
    .icon{width:13px;height:13px;flex-shrink:0;opacity:.6}
    @media(max-width:640px){.wrap{font-size:12px;padding:5px 10px}}
  \`;
  constructor(){super();this._copied=false;}
  async _copy(){
    try{await navigator.clipboard.writeText(this.text||'');this._copied=true;setTimeout(()=>this._copied=false,2000);}catch(e){console.error('Copy failed',e);}
  }
  render(){return html\`<div class="wrap \${this._copied?'copied':''}" @click=\${this._copy.bind(this)} role="button" tabindex="0" aria-label="Copy to clipboard">\${window.__DOCSLIT_ICONS__?.copy?html\`<span class="icon" .innerHTML=\${window.__DOCSLIT_ICONS__.copy}></span>\`:nothing}\${this._copied?'Copied!':this.label||this.text||'Copy'}</div>\`;}
}
customElements.define('wc-copy',WcCopy);
`;
