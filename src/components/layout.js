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
  static properties={caption:{type:String},border:{type:Boolean},hint:{type:String},background:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    .hint{margin:0 0 8px;font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;color:var(--text3,#737373)}
    .frame{margin:0;border-radius:var(--radius-lg,10px);overflow:hidden;background:var(--surface,#111);min-width:0}
    .frame.bordered{border:1px solid var(--border,#2a2a2a)}
    .frame.subtle{background:var(--surface2,#1a1a1a)}
    .inner{padding:24px;display:flex;align-items:center;justify-content:center;min-width:0}
    ::slotted(img),::slotted(wc-image){max-width:100%;height:auto;display:block;border-radius:var(--r-sm,6px);margin:0 !important}
    ::slotted(iframe),::slotted(wc-embed){width:100%}
    ::slotted(*){max-width:100%}
    figcaption{padding:10px 16px;font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;color:var(--text3,#737373);border-top:1px solid var(--border,#2a2a2a);text-align:center}
    figcaption a{color:var(--accent-light,#4f98a3)}
    @media(max-width:640px){.inner{padding:14px}}
  \`;
  render(){return html\`\${this.hint?html\`<div class="hint">\${unsafeHTML(_inlineMd(this.hint))}</div>\`:nothing}<figure class="frame \${this.border?'bordered':''} \${this.background==='subtle'?'subtle':''}"><div class="inner"><slot></slot></div>\${this.caption?html\`<figcaption>\${unsafeHTML(_inlineMd(this.caption))}</figcaption>\`:nothing}</figure>\`;}
}
customElements.define('wc-frame',WcFrame);

// ── WC-PANEL ───────────────────────────────────────────────────────────────
class WcPanel extends LitElement {
  static properties={title:{type:String},icon:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text:#0f0f0f;--text2:#555}
    .wrap{border:1px solid var(--border,#2a2a2a);border-radius:var(--r-lg,10px);overflow:hidden;background:var(--surface,#111)}
    .header{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--border,#2a2a2a);background:var(--surface2,#1a1a1a)}
    .icon{font-size:16px;flex-shrink:0;line-height:1;display:inline-flex;width:16px;height:16px}
    .icon ::slotted(span),.icon ::slotted(svg){display:inline-flex;width:16px;height:16px}
    .title{font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:var(--text,#f0f0f0)}
    .body{padding:16px 18px;font-family:'Inter',sans-serif;font-size:14px;color:var(--text2,#a0a0a0);line-height:1.7}
    ::slotted(*){max-width:100%}
    @media(max-width:640px){.body{padding:12px 14px}}
  \`;
  render(){return html\`<div class="wrap">\${(this.title||this.icon)?html\`<div class="header">\${this.icon?html\`<span class="icon" aria-hidden="true"><slot name="icon">\${_emojiOnly(this.icon)}</slot></span>\`:nothing}\${this.title?html\`<span class="title">\${this.title}</span>\`:nothing}</div>\`:nothing}<div class="body"><slot></slot></div></div>\`;}
}
customElements.define('wc-panel',WcPanel);

// ── WC-ACCORDION / WC-EXPANDABLE ───────────────────────────────────────────
let _discSeq=0;
class WcAccordion extends LitElement {
  static properties={title:{type:String},description:{type:String},icon:{type:String},open:{type:Boolean,reflect:true}};
  static styles=css\`
    :host{display:block;margin:0 0 12px;min-width:0}
    .wrap{border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,10px);overflow:hidden;min-width:0}
    .hdr{all:unset;box-sizing:border-box;display:flex;align-items:center;width:100%;padding:14px 18px;background:var(--surface2,#1a1a1a);cursor:pointer;user-select:none;font-family:var(--font-sans,'Inter',sans-serif);font-size:15px;font-weight:600;color:var(--text,#f0f0f0);gap:12px;min-width:0}
    .hdr:hover{background:var(--surface3,#222)}
    .hdr:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:-2px}
    .ico{display:inline-flex;width:18px;height:18px;flex-shrink:0;color:var(--text2,#a0a0a0)}
    .ico ::slotted(span),.ico ::slotted(svg){display:inline-flex;width:18px;height:18px}
    .txt{flex:1;min-width:0}
    .ttl{display:block}
    .dsc{display:block;font-size:13px;font-weight:400;color:var(--text3,#737373);margin-top:2px}
    .chevron{transition:transform .2s;color:var(--text3,#737373);font-size:11px;flex-shrink:0}
    .chevron.open{transform:rotate(180deg)}
    .body{padding:16px 18px;background:var(--surface,#111);font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;color:var(--text2,#a0a0a0);line-height:1.7;min-width:0;overflow:hidden}
    .body[hidden]{display:none}
    ::slotted(*){max-width:100%}
    ::slotted(:last-child){margin-bottom:0}
    @media(max-width:640px){.hdr{padding:12px 14px;font-size:14px}.body{padding:12px 14px;font-size:13px}}
    @media(prefers-reduced-motion:reduce){.chevron{transition:none}}
    @media print{.hdr{background:transparent !important;border-bottom:1px solid #ddd}.chevron{display:none}.body,.body[hidden]{display:block !important;content-visibility:visible !important}}
  \`;
  constructor(){super();this.open=false;this._uid='dl-disc-'+(++_discSeq);}
  connectedCallback(){
    super.connectedCallback();
    const key=this.id||_slug(this.title);
    if(key&&location.hash&&decodeURIComponent(location.hash.slice(1))===key){this.open=true;requestAnimationFrame(()=>this.scrollIntoView({block:'start'}));}
  }
  _toggle(){this.open=!this.open;}
  render(){
    return html\`<div class="wrap"><button class="hdr" type="button" id="\${this._uid}-h" aria-expanded=\${this.open?'true':'false'} aria-controls="\${this._uid}-b" @click=\${this._toggle}>\${this.icon?html\`<span class="ico" aria-hidden="true"><slot name="icon"></slot></span>\`:nothing}<span class="txt"><span class="ttl">\${unsafeHTML(_titleMd(this.title))}</span>\${this.description?html\`<span class="dsc">\${unsafeHTML(_titleMd(this.description))}</span>\`:nothing}</span><span class="chevron \${this.open?'open':''}" aria-hidden="true">▼</span></button><div class="body" id="\${this._uid}-b" role="region" aria-labelledby="\${this._uid}-h" ?hidden=\${!this.open} @beforematch=\${()=>{this.open=true;}}><slot></slot></div></div>\`;
  }
  updated(){const b=this.renderRoot.querySelector('.body');if(b){if(this.open)b.removeAttribute('hidden');else b.setAttribute('hidden','until-found');}}
}
customElements.define('wc-accordion',WcAccordion);
customElements.define('wc-expandable',class extends WcAccordion{});

// ── WC-ACCORDION-GROUP ────────────────────────────────────────────────
class WcAccordionGroup extends LitElement {
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    ::slotted(wc-accordion),::slotted(wc-expandable){margin-bottom:0 !important;border-radius:0 !important}
    ::slotted(wc-accordion:first-child),::slotted(wc-expandable:first-child){border-radius:10px 10px 0 0 !important}
    ::slotted(wc-accordion:last-child),::slotted(wc-expandable:last-child){border-radius:0 0 10px 10px !important}
    ::slotted(wc-accordion:only-child),::slotted(wc-expandable:only-child){border-radius:10px !important}
    ::slotted(wc-accordion+wc-accordion),::slotted(wc-expandable+wc-expandable),::slotted(wc-accordion+wc-expandable),::slotted(wc-expandable+wc-accordion){border-top:none !important}
  \`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-accordion-group',WcAccordionGroup);

// ── WC-ASIDE ───────────────────────────────────────────────────────────────
class WcAside extends LitElement {
  static properties={title:{type:String},sticky:{type:Boolean}};
  static styles=css\`
    :host{display:block;float:right;clear:right;width:280px;margin:0 0 20px 28px}
    :host([sticky]){position:sticky;top:calc(var(--chrome-h,60px) + 16px);z-index:1}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,10px);padding:16px 18px;font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;color:var(--text2,#a0a0a0);line-height:1.7;max-height:calc(100vh - var(--chrome-h,60px) - 40px);overflow:auto}
    .title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3,#737373);margin-bottom:8px}
    ::slotted(*){max-width:100%}
    ::slotted(:last-child){margin-bottom:0}
    @media(max-width:900px){:host,:host([sticky]){float:none;width:auto;margin:16px 0;position:static}.wrap{max-height:none}}
  \`;
  render(){return html\`<aside class="wrap" aria-label=\${this.title||'Side note'}>\${this.title?html\`<div class="title">\${this.title}</div>\`:nothing}<slot></slot></aside>\`;}
}
customElements.define('wc-aside',WcAside);
`;
