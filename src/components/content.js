// Content components: wc-card, wc-tile, wc-tiles, wc-button, wc-prompt

export default `
// ── WC-CARD ────────────────────────────────────────────────────────────────
class WcCard extends LitElement {
  static properties={title:{type:String},href:{type:String},icon:{type:String},iconName:{type:String,attribute:'icon-name'}};
  static styles=css\`
    :host{display:block}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a;--border2:#3a3a3a;--text:#f0f0f0;--text2:#a0a0a0}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2;--border2:#d0d0d0;--text:#0f0f0f;--text2:#555}
    .card{display:block;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:12px;padding:24px;text-decoration:none;color:inherit;transition:all .2s}
    .card:hover{border-color:var(--border2,#3a3a3a);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.15)}
    .icon-wrap{width:36px;height:36px;background:rgba(1,105,111,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;font-size:18px}
    .title{font-family:'Inter',sans-serif;font-size:16px;font-weight:700;color:var(--text,#f0f0f0);margin-bottom:8px}
    .body{font-size:14px;color:var(--text2,#a0a0a0);line-height:1.6}
    ::slotted(*){color:var(--text2,#a0a0a0);font-size:14px;line-height:1.6}
    @media(max-width:640px){.card{padding:16px;}.title{font-size:15px;}.body{font-size:13px;}}
  \`;
  render(){const _ico=this.iconName?html\`<wc-icon name="\${this.iconName}"></wc-icon>\`:this.icon;return html\`<a class="card" href="\${this.href||'#'}">\${_ico?html\`<div class="icon-wrap">\${_ico}</div>\`:nothing}\${this.title?html\`<div class="title">\${this.title}</div>\`:nothing}<div class="body"><slot></slot></div></a>\`;}
}
customElements.define('wc-card',WcCard);

// ── WC-TILE / WC-TILES ────────────────────────────────────────────────────
class WcTile extends LitElement {
  static properties={href:{type:String},icon:{type:String},iconName:{type:String,attribute:'icon-name'},title:{type:String},description:{type:String}};
  static styles=css\`
    :host{display:block}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a;--border2:#3a3a3a;--text:#f0f0f0;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2;--border2:#d0d0d0;--text:#0f0f0f;--text3:#737373}
    a{display:flex;align-items:flex-start;gap:14px;padding:16px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;text-decoration:none;color:inherit;transition:all .15s;box-sizing:border-box}
    a:hover{border-color:var(--border2,#3a3a3a);filter:brightness(1.03)}
    .icon{width:38px;height:38px;background:rgba(1,105,111,.12);border:1px solid rgba(1,105,111,.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px}
    .info{display:flex;flex-direction:column;gap:3px;min-width:0}
    .title{font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:var(--text,#f0f0f0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .desc{font-family:'Inter',sans-serif;font-size:13px;color:var(--text3,#666);line-height:1.5}
    @media(max-width:640px){a{padding:12px;gap:10px;}.icon{width:32px;height:32px;font-size:16px}.title{font-size:13px}.desc{font-size:12px}}
  \`;
  render(){const _ico=this.iconName?html\`<wc-icon name="\${this.iconName}"></wc-icon>\`:this.icon;return html\`<a href="\${this.href||'#'}">\${_ico?html\`<div class="icon">\${_ico}</div>\`:nothing}<div class="info"><div class="title">\${this.title||''}</div>\${this.description?html\`<div class="desc">\${this.description}</div>\`:nothing}</div></a>\`;}
}
customElements.define('wc-tile',WcTile);

class WcTiles extends HTMLElement {
  static get observedAttributes(){return ['cols'];}
  constructor(){super();this.attachShadow({mode:'open'});this.shadowRoot.innerHTML='<style>:host{display:grid;gap:14px;margin:0 0 20px}@media(max-width:640px){:host{grid-template-columns:1fr !important}}::slotted(*){min-width:0}</style><slot></slot>';}
  connectedCallback(){this._updateCols();}
  attributeChangedCallback(){this._updateCols();}
  _updateCols(){const c=this.getAttribute('cols');this.style.gridTemplateColumns=c?'repeat('+c+',1fr)':'repeat(auto-fill,minmax(220px,1fr))';}
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
    :host([theme="dark"]){--surface:#111;--text2:#a0a0a0}
    :host([theme="light"]){--surface:#f8f8f8;--text2:#555}
    .wrap{background:var(--surface,#111);border:1px solid rgba(168,85,247,.25);border-radius:10px;overflow:hidden}
    .header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:rgba(168,85,247,.06);border-bottom:1px solid rgba(168,85,247,.2)}
    .label{display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(168,85,247,.8)}
    .ai-icon{font-size:14px}
    .copy-btn{background:none;border:1px solid rgba(168,85,247,.25);border-radius:5px;padding:4px 10px;font-family:'Inter',sans-serif;font-size:11px;font-weight:600;color:rgba(168,85,247,.7);cursor:pointer;transition:all .15s}
    .copy-btn:hover{background:rgba(168,85,247,.1);color:#c084fc}
    .copy-btn.copied{color:#34d399;border-color:rgba(16,185,129,.3)}
    .body{padding:16px 18px;font-family:'Inter',sans-serif;font-size:14px;color:var(--text2,#a0a0a0);line-height:1.8}
    ::slotted(*){color:var(--text2,#a0a0a0);line-height:1.8}
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
