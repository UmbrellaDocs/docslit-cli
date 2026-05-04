// Content components: wc-card, wc-tile, wc-tiles, wc-button, wc-prompt

export default `
// ── WC-CARD ────────────────────────────────────────────────────────────────
class WcCard extends LitElement {
  static properties={title:{type:String},href:{type:String},icon:{type:String}};
  static styles=css\`
    :host{display:block}
    .card{display:block;background:#111;border:1px solid #2a2a2a;border-radius:12px;padding:24px;text-decoration:none;color:inherit;transition:all .2s}
    .card:hover{border-color:#444;transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.3)}
    .icon-wrap{width:36px;height:36px;background:rgba(1,105,111,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;font-size:18px}
    .title{font-family:'Inter',sans-serif;font-size:16px;font-weight:700;color:#f0f0f0;margin-bottom:8px}
    .body{font-size:14px;color:#a0a0a0;line-height:1.6}
    ::slotted(*){color:#a0a0a0;font-size:14px;line-height:1.6}
    @media(max-width:640px){.card{padding:16px;}.title{font-size:15px;}.body{font-size:13px;}}
  \`;
  render(){return html\`<a class="card" href="\${this.href||'#'}">\${this.icon?html\`<div class="icon-wrap">\${this.icon}</div>\`:nothing}\${this.title?html\`<div class="title">\${this.title}</div>\`:nothing}<div class="body"><slot></slot></div></a>\`;}
}
customElements.define('wc-card',WcCard);

// ── WC-TILE / WC-TILES ────────────────────────────────────────────────────
class WcTile extends LitElement {
  static properties={href:{type:String},icon:{type:String},title:{type:String},description:{type:String}};
  static styles=css\`
    :host{display:block}
    a{display:flex;align-items:flex-start;gap:14px;padding:16px;background:#111;border:1px solid #2a2a2a;border-radius:10px;text-decoration:none;color:inherit;transition:all .15s;height:100%}
    a:hover{border-color:#444;background:#161616}
    .icon{width:38px;height:38px;background:rgba(1,105,111,.12);border:1px solid rgba(1,105,111,.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px}
    .info{display:flex;flex-direction:column;gap:3px;min-width:0}
    .title{font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .desc{font-family:'Inter',sans-serif;font-size:13px;color:#666;line-height:1.5}
    @media(max-width:640px){a{padding:12px;gap:10px;}.icon{width:32px;height:32px;font-size:16px}.title{font-size:13px}.desc{font-size:12px}}
  \`;
  render(){return html\`<a href="\${this.href||'#'}">\${this.icon?html\`<div class="icon">\${this.icon}</div>\`:nothing}<div class="info"><div class="title">\${this.title||''}</div>\${this.description?html\`<div class="desc">\${this.description}</div>\`:nothing}</div></a>\`;}
}
customElements.define('wc-tile',WcTile);

class WcTiles extends LitElement {
  static properties={cols:{type:Number}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    .grid{display:grid;gap:14px}
    @media(max-width:640px){.grid{grid-template-columns:1fr !important}}
  \`;
  render(){const c=this.cols||3;return html\`<div class="grid" style="grid-template-columns:repeat(\${c},1fr)"><slot></slot></div>\`;}
}
customElements.define('wc-tiles',WcTiles);

// ── WC-BUTTON ──────────────────────────────────────────────────────────────
class WcButton extends LitElement {
  static properties={label:{type:String},variant:{type:String},href:{type:String},size:{type:String}};
  static styles=css\`
    :host{display:inline-block}
    a,button{display:inline-flex;align-items:center;gap:8px;border-radius:8px;font-family:'Inter',sans-serif;font-weight:600;cursor:pointer;border:none;text-decoration:none;transition:all .15s}
    .sm{padding:6px 14px;font-size:13px}
    .md{padding:10px 20px;font-size:14px}
    .lg{padding:13px 26px;font-size:15px}
    .primary{background:#01696f;color:#fff;} .primary:hover{background:#4f98a3;}
    .outline{background:transparent;color:#f0f0f0;border:1px solid #333;} .outline:hover{background:#1a1a1a;border-color:#555;}
    .ghost{background:transparent;color:#a0a0a0;} .ghost:hover{color:#f0f0f0;}
    .danger{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);} .danger:hover{background:rgba(239,68,68,.25);}
    @media(max-width:640px){.md{padding:8px 16px;font-size:13px;gap:6px;}}
  \`;
  render(){
    const v=this.variant||'primary';
    const s=this.size||'md';
    const inner=html\`\${this.label||html\`<slot></slot>\`}\`;
    return this.href?html\`<a href="\${this.href}" class="\${v} \${s}">\${inner}</a>\`:html\`<button class="\${v} \${s}">\${inner}</button>\`;
  }
}
customElements.define('wc-button',WcButton);

// ── WC-PROMPT ──────────────────────────────────────────────────────────────
class WcPrompt extends LitElement {
  static properties={title:{type:String},_copied:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    .wrap{background:#111;border:1px solid rgba(168,85,247,.25);border-radius:10px;overflow:hidden}
    .header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:rgba(168,85,247,.06);border-bottom:1px solid rgba(168,85,247,.2)}
    .label{display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(168,85,247,.8)}
    .ai-icon{font-size:14px}
    .copy-btn{background:none;border:1px solid rgba(168,85,247,.25);border-radius:5px;padding:4px 10px;font-family:'Inter',sans-serif;font-size:11px;font-weight:600;color:rgba(168,85,247,.7);cursor:pointer;transition:all .15s}
    .copy-btn:hover{background:rgba(168,85,247,.1);color:#c084fc}
    .copy-btn.copied{color:#34d399;border-color:rgba(16,185,129,.3)}
    .body{padding:16px 18px;font-family:'Inter',sans-serif;font-size:14px;color:#a0a0a0;line-height:1.8}
    ::slotted(*){color:#a0a0a0;line-height:1.8}
    @media(max-width:640px){.body{padding:12px 14px;font-size:13px}}
  \`;
  constructor(){super();this._copied=false;}
  async _copy(){
    try{await navigator.clipboard.writeText(this.textContent.trim());this._copied=true;setTimeout(()=>this._copied=false,2000);}catch(e){}
  }
  render(){return html\`<div class="wrap"><div class="header"><span class="label"><span class="ai-icon">✦</span>\${this.title||'AI Prompt'}</span><button class="copy-btn \${this._copied?'copied':''}" @click=\${this._copy.bind(this)}>\${this._copied?'✓ Copied':'Copy'}</button></div><div class="body"><slot></slot></div></div>\`;}
}
customElements.define('wc-prompt',WcPrompt);
`;
