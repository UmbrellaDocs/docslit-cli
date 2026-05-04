// Layout components: wc-columns, wc-frame, wc-panel, wc-expandable, wc-accordion, wc-aside

export default `
// ── WC-COLUMNS ─────────────────────────────────────────────────────────────
class WcColumns extends LitElement {
  static properties={cols:{type:Number},gap:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    .grid{display:grid;gap:var(--cols-gap,24px)}
    ::slotted(*){min-width:0}
    @media(max-width:768px){.grid{grid-template-columns:1fr !important}}
  \`;
  render(){const c=this.cols||2;const g=this.gap||'20px';return html\`<div class="grid" style="grid-template-columns:repeat(\${c},1fr);gap:\${g}"><slot></slot></div>\`;}
}
customElements.define('wc-columns',WcColumns);

// ── WC-FRAME ───────────────────────────────────────────────────────────────
class WcFrame extends LitElement {
  static properties={caption:{type:String},border:{type:Boolean}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2;--text3:#999}
    .frame{border-radius:10px;overflow:hidden;background:var(--surface,#111)}
    .bordered{border:1px solid var(--border,#2a2a2a)}
    .inner{padding:24px;display:flex;align-items:center;justify-content:center}
    ::slotted(img){max-width:100%;height:auto;display:block;border-radius:6px}
    ::slotted(*){max-width:100%}
    figcaption{padding:10px 16px;font-family:'Inter',sans-serif;font-size:13px;color:var(--text3,#666);border-top:1px solid var(--border,#2a2a2a);text-align:center}
    @media(max-width:640px){.inner{padding:16px}}
  \`;
  render(){return html\`<figure class="frame \${this.border?'bordered':''}"><div class="inner"><slot></slot></div>\${this.caption?html\`<figcaption>\${this.caption}</figcaption>\`:nothing}</figure>\`;}
}
customElements.define('wc-frame',WcFrame);

// ── WC-PANEL ───────────────────────────────────────────────────────────────
class WcPanel extends LitElement {
  static properties={title:{type:String},icon:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text:#0f0f0f;--text2:#555}
    .wrap{border:1px solid var(--border,#2a2a2a);border-radius:10px;overflow:hidden;background:var(--surface,#111)}
    .header{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--border,#2a2a2a);background:var(--surface2,#1a1a1a)}
    .icon{font-size:16px;flex-shrink:0;line-height:1}
    .title{font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:var(--text,#f0f0f0)}
    .body{padding:16px 18px;font-family:'Inter',sans-serif;font-size:14px;color:var(--text2,#a0a0a0);line-height:1.7}
    ::slotted(*){max-width:100%}
    @media(max-width:640px){.body{padding:12px 14px}}
  \`;
  render(){return html\`<div class="wrap">\${(this.title||this.icon)?html\`<div class="header">\${this.icon?html\`<span class="icon">\${this.icon}</span>\`:nothing}\${this.title?html\`<span class="title">\${this.title}</span>\`:nothing}</div>\`:nothing}<div class="body"><slot></slot></div></div>\`;}
}
customElements.define('wc-panel',WcPanel);

// ── WC-EXPANDABLE ──────────────────────────────────────────────────────────
class WcExpandable extends LitElement {
  static properties={title:{type:String},open:{type:Boolean}};
  static styles=css\`
    :host{display:block;margin:0 0 12px;min-width:0}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--surface3:#222;--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--surface3:#e8e8e8;--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#999}
    .wrap{border:1px solid var(--border,#2a2a2a);border-radius:10px;overflow:hidden;min-width:0}
    .hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--surface2,#1a1a1a);cursor:pointer;user-select:none;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;color:var(--text,#f0f0f0);gap:12px;min-width:0}
    .hdr:hover{background:var(--surface3,#222)}
    .body{padding:14px 18px;background:var(--surface,#111);font-family:'Inter',sans-serif;font-size:14px;color:var(--text2,#a0a0a0);line-height:1.7;min-width:0}
    .chevron{transition:transform .2s;color:var(--text3,#666);font-size:11px;flex-shrink:0}
    .chevron.open{transform:rotate(180deg)}
    ::slotted(*){max-width:100%;overflow-x:auto}
    @media(max-width:640px){.hdr{padding:10px 14px;}.body{padding:10px 14px;font-size:13px;}}
  \`;
  render(){return html\`<div class="wrap"><div class="hdr" @click=\${()=>this.open=!this.open} role="button" aria-expanded=\${this.open}><span>\${this.title}</span><span class="chevron \${this.open?'open':''}">▼</span></div>\${this.open?html\`<div class="body"><slot></slot></div>\`:nothing}</div>\`;}
}
customElements.define('wc-expandable',WcExpandable);

// ── WC-ACCORDION ───────────────────────────────────────────────────────────
class WcAccordion extends LitElement {
  static properties={title:{type:String},_open:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 12px;min-width:0}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#999}
    .wrap{border:1px solid var(--border,#2a2a2a);border-radius:10px;overflow:hidden;min-width:0}
    .hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--surface2,#1a1a1a);cursor:pointer;user-select:none;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:var(--text,#f0f0f0);gap:12px;min-width:0}
    .body{padding:16px 18px;background:var(--surface,#111);font-family:'Inter',sans-serif;font-size:14px;color:var(--text2,#a0a0a0);line-height:1.7;min-width:0;overflow:hidden}
    .chevron{transition:transform .2s;color:var(--text3,#666);font-size:12px;flex-shrink:0}
    .chevron.open{transform:rotate(180deg)}
    ::slotted(*){max-width:100%;overflow-x:auto}
    @media(max-width:640px){.hdr{padding:12px 14px;font-size:14px;}.body{padding:12px 14px;font-size:13px;}}
  \`;
  render(){return html\`<div class="wrap"><div class="hdr" @click=\${()=>this._open=!this._open}><span>\${this.title}</span><span class="chevron \${this._open?'open':''}">▼</span></div>\${this._open?html\`<div class="body"><slot></slot></div>\`:nothing}</div>\`;}
}
customElements.define('wc-accordion',WcAccordion);

// ── WC-ASIDE ───────────────────────────────────────────────────────────────
class WcAside extends LitElement {
  static properties={title:{type:String}};
  static styles=css\`
    :host{display:block;float:right;clear:right;width:280px;margin:0 0 20px 28px}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a;--text2:#a0a0a0;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2;--text2:#555;--text3:#999}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;padding:16px 18px;font-family:'Inter',sans-serif;font-size:13px;color:var(--text2,#a0a0a0);line-height:1.7}
    .title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3,#666);margin-bottom:8px}
    ::slotted(*){max-width:100%}
    @media(max-width:900px){:host{float:none;width:auto;margin:16px 0}}
  \`;
  render(){return html\`<div class="wrap">\${this.title?html\`<div class="title">\${this.title}</div>\`:nothing}<slot></slot></div>\`;}
}
customElements.define('wc-aside',WcAside);
`;
