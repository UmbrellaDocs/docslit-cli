// Text & Callout components: wc-callout, wc-alert, wc-banner, wc-badge, wc-tooltip, wc-update

export default `
// ── WC-CALLOUT / WC-ALERT ──────────────────────────────────────────────────
class WcCallout extends LitElement {
  static properties={type:{type:String},title:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0}
    .wrap{display:flex;gap:14px;padding:18px 22px;border-radius:10px;border:1px solid;min-width:0}
    .info{background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.3);color:#93c5fd}
    .warning{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.3);color:#fcd34d}
    .error{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.3);color:#f87171}
    .success{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.3);color:#34d399}
    .tip{background:rgba(1,105,111,.1);border-color:rgba(1,105,111,.3);color:#4f98a3}
    .note{background:rgba(168,85,247,.1);border-color:rgba(168,85,247,.3);color:#c084fc}
    .body{flex:1;font-family:'Inter',sans-serif;font-size:14px;line-height:1.7;min-width:0;overflow:hidden}
    .title{font-weight:700;margin-bottom:4px}
    slot{color:#a0a0a0}
    ::slotted(*){max-width:100%;overflow-x:auto}
    @media(max-width:640px){.wrap{gap:10px;padding:12px 16px;}.body{font-size:13px;}}
  \`;
  render(){const t=this.type||'info';return html\`<div class="wrap \${t}">\${this.title?html\`<div class="body"><div class="title">\${this.title}</div><slot></slot></div>\`:html\`<div class="body"><slot></slot></div>\`}</div>\`;}
}
customElements.define('wc-callout',WcCallout);
customElements.define('wc-alert',class extends WcCallout{});

// ── WC-BANNER ──────────────────────────────────────────────────────────────
class WcBanner extends LitElement {
  static properties={type:{type:String},dismissible:{type:Boolean},_gone:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 12px}
    .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 20px;border-radius:8px;border:1px solid;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6}
    .info{background:rgba(59,130,246,.08);border-color:rgba(59,130,246,.3);color:#93c5fd}
    .warning{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.3);color:#fcd34d}
    .error{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.3);color:#f87171}
    .success{background:rgba(16,185,129,.08);border-color:rgba(16,185,129,.3);color:#34d399}
    .neutral{background:rgba(160,160,160,.06);border-color:#2a2a2a;color:#a0a0a0}
    .close{background:none;border:none;cursor:pointer;color:inherit;opacity:.5;font-size:16px;line-height:1;padding:0 0 0 8px;flex-shrink:0;transition:opacity .15s}
    .close:hover{opacity:1}
  \`;
  constructor(){super();this._gone=false;}
  render(){if(this._gone)return nothing;const t=this.type||'neutral';return html\`<div class="wrap \${t}"><slot></slot>\${this.dismissible?html\`<button class="close" @click=\${()=>this._gone=true} aria-label="Dismiss">✕</button>\`:nothing}</div>\`;}
}
customElements.define('wc-banner',WcBanner);

// ── WC-BADGE ───────────────────────────────────────────────────────────────
class WcBadge extends LitElement {
  static properties={variant:{type:String},label:{type:String}};
  static styles=css\`
    :host{display:inline-block}
    span{display:inline-flex;align-items:center;padding:2px 10px;border-radius:100px;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;border:1px solid;white-space:nowrap}
    .default{background:rgba(1,105,111,.15);color:#4f98a3;border-color:rgba(1,105,111,.3)}
    .success{background:rgba(16,185,129,.15);color:#34d399;border-color:rgba(16,185,129,.3)}
    .warning{background:rgba(245,158,11,.15);color:#fbbf24;border-color:rgba(245,158,11,.3)}
    .danger{background:rgba(239,68,68,.15);color:#f87171;border-color:rgba(239,68,68,.3)}
    .info{background:rgba(59,130,246,.15);color:#60a5fa;border-color:rgba(59,130,246,.3)}
    .neutral{background:rgba(156,163,175,.12);color:#9ca3af;border-color:rgba(156,163,175,.3)}
    .purple{background:rgba(168,85,247,.15);color:#c084fc;border-color:rgba(168,85,247,.3)}
    @media(max-width:640px){span{font-size:11px;padding:1px 8px}}
  \`;
  render(){return html\`<span class="\${this.variant||'default'}">\${this.label||html\`<slot></slot>\`}</span>\`;}
}
customElements.define('wc-badge',WcBadge);

// ── WC-TOOLTIP ─────────────────────────────────────────────────────────────
class WcTooltip extends LitElement {
  static properties={text:{type:String},position:{type:String}};
  static styles=css\`
    :host{display:inline;position:relative}
    .trigger{cursor:help;border-bottom:1px dashed rgba(160,160,160,.5);display:inline}
    .tip{position:absolute;z-index:200;background:#1c1c1c;border:1px solid #3a3a3a;border-radius:6px;padding:6px 12px;font-family:'Inter',sans-serif;font-size:12px;color:#e2e8f0;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);box-shadow:0 4px 12px rgba(0,0,0,.4)}
    .tip.bottom{bottom:auto;top:calc(100% + 8px)}
    .tip::before{content:'';position:absolute;left:50%;transform:translateX(-50%);border:5px solid transparent}
    .tip:not(.bottom)::before{top:100%;border-top-color:#3a3a3a}
    .tip.bottom::before{bottom:100%;border-bottom-color:#3a3a3a}
    :host(:hover) .tip,:host(:focus-within) .tip{opacity:1}
  \`;
  render(){const pos=this.position==='bottom'?'bottom':'';return html\`<span class="trigger"><slot></slot><span class="tip \${pos}" role="tooltip">\${this.text||''}</span></span>\`;}
}
customElements.define('wc-tooltip',WcTooltip);

// ── WC-UPDATE ──────────────────────────────────────────────────────────────
class WcUpdate extends LitElement {
  static properties={version:{type:String},type:{type:String},date:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 12px}
    .wrap{display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-radius:10px;border:1px solid #2a2a2a;background:#111}
    .badge{display:inline-flex;align-items:center;padding:2px 10px;border-radius:100px;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;border:1px solid;white-space:nowrap;flex-shrink:0;text-transform:uppercase;letter-spacing:.06em;margin-top:2px}
    .added{background:rgba(16,185,129,.15);color:#34d399;border-color:rgba(16,185,129,.3)}
    .changed,.updated{background:rgba(59,130,246,.15);color:#60a5fa;border-color:rgba(59,130,246,.3)}
    .fixed{background:rgba(245,158,11,.15);color:#fbbf24;border-color:rgba(245,158,11,.3)}
    .removed,.deprecated{background:rgba(239,68,68,.15);color:#f87171;border-color:rgba(239,68,68,.3)}
    .security{background:rgba(168,85,247,.15);color:#c084fc;border-color:rgba(168,85,247,.3)}
    .body{flex:1;font-family:'Inter',sans-serif;font-size:14px;color:#a0a0a0;line-height:1.7}
    .meta{display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap}
    .version{font-size:13px;font-weight:600;color:#e2e8f0}
    .date{font-size:12px;color:#555}
  \`;
  render(){const t=this.type||'added';return html\`<div class="wrap"><span class="badge \${t}">\${t}</span><div class="body"><div class="meta">\${this.version?html\`<span class="version">v\${this.version}</span>\`:nothing}\${this.date?html\`<span class="date">\${this.date}</span>\`:nothing}</div><slot></slot></div></div>\`;}
}
customElements.define('wc-update',WcUpdate);
`;
