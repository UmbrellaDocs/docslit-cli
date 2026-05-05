// Utility components: wc-anchor, wc-indent, wc-visibility, wc-version, wc-versions, wc-page-meta

export default `
// ── WC-ANCHOR ──────────────────────────────────────────────────────────────
class WcAnchor extends LitElement {
  static styles=css\`
    :host{display:block}
    .wrap{display:block;position:relative}
    a.link{opacity:0;position:absolute;left:-24px;top:0;color:#555;text-decoration:none;font-size:14px;transition:opacity .15s;line-height:1}
    :host(:hover) a.link{opacity:1}
    a.link:hover{color:#4f98a3}
  \`;
  render(){const id=this.getAttribute('id')||this.textContent.toLowerCase().replace(/[^a-z0-9]+/g,'-');return html\`<div class="wrap" id="\${id}"><a class="link" href="#\${id}" aria-label="Link to section">#</a><slot></slot></div>\`;}
}
customElements.define('wc-anchor',WcAnchor);

// ── WC-INDENT ──────────────────────────────────────────────────────────────
class WcIndent extends LitElement {
  static properties={level:{type:Number},color:{type:String}};
  static styles=css\`
    :host{display:block}
    .wrap{padding-left:calc(var(--indent-level,1) * 20px);border-left:2px solid var(--indent-color,#2a2a2a);margin:4px 0}
    ::slotted(*){font-family:'Inter',sans-serif;font-size:14px;color:#a0a0a0}
    @media(max-width:640px){.wrap{padding-left:calc(var(--indent-level,1) * 14px)}}
  \`;
  render(){
    const l=this.level||1;
    const c=this.color||'#2a2a2a';
    return html\`<div class="wrap" style="--indent-level:\${l};--indent-color:\${c}"><slot></slot></div>\`;
  }
}
customElements.define('wc-indent',WcIndent);

// ── WC-VISIBILITY ──────────────────────────────────────────────────────────
class WcVisibility extends LitElement {
  static properties={version:{type:String},role:{type:String},show:{type:Boolean}};
  static styles=css\`
    :host{display:block}
    .wrap{position:relative}
    .badge{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:4px;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.25);font-family:'Inter',sans-serif;font-size:11px;color:#c084fc;margin-bottom:8px;font-weight:600}
  \`;
  render(){
    const parts=[];
    if(this.version)parts.push('v'+this.version);
    if(this.role)parts.push(this.role);
    return html\`<div class="wrap">\${parts.length?html\`<div class="badge">👁 \${parts.join(' · ')}</div>\`:nothing}<slot></slot></div>\`;
  }
}
customElements.define('wc-visibility',WcVisibility);

// ── WC-VERSION / WC-VERSIONS ───────────────────────────────────────────────
class WcVersion extends LitElement {
  static properties={name:{type:String}};
  static styles=css\`:host{display:none}:host([active]){display:block}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-version',WcVersion);

class WcVersions extends LitElement {
  static properties={default:{type:String},_active:{type:String,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    .selector{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    label{font-family:'Inter',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#666}
    .btns{display:flex;gap:4px;flex-wrap:wrap}
    button{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:5px 14px;font-family:'Inter',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer;transition:all .15s}
    button.active{background:rgba(1,105,111,.15);border-color:rgba(1,105,111,.35);color:#4f98a3}
    button:hover:not(.active){color:#a0a0a0;border-color:#333}
    button:focus-visible{outline:2px solid #01696f;outline-offset:2px}
  \`;
  connectedCallback(){
    super.connectedCallback();
    this._active=this.default||this.querySelector('wc-version')?.getAttribute('name')||'';
  }
  render(){
    const versions=Array.from(this.querySelectorAll('wc-version'));
    versions.forEach(v=>v.toggleAttribute('active',v.name===this._active));
    return html\`<div>
      <div class="selector"><label>Version</label><div class="btns" role="group" aria-label="Version selector">\${versions.map(v=>html\`<button class="\${this._active===v.name?'active':''}" aria-pressed=\${this._active===v.name} @click=\${()=>this._active=v.name}>\${v.name}</button>\`)}</div></div>
      <slot></slot>
    </div>\`;
  }
}
customElements.define('wc-versions',WcVersions);

// ── WC-PAGE-META ──────────────────────────────────────────────────────────
class WcPageMeta extends LitElement {
  static properties={tag:{type:String},component:{type:String},readtime:{type:String},lastmod:{type:String,attribute:'updated'}};
  static styles=css\`
    :host{display:block}
    .meta{display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding:0 0 28px;font-family:'Inter',sans-serif;font-size:13px;border-bottom:1px solid #2a2a2a;margin-bottom:28px;color:#666}
    .sep{color:#444;user-select:none}
    @media(max-width:640px){.meta{gap:8px;font-size:12px;padding:0 0 20px;margin-bottom:20px;}}
  \`;
  render(){
    const p=[];
    if(this.tag)p.push(html\`<span>\${this.tag}</span>\`);
    if(this.component){p.push(html\`<span class="sep">•</span>\`);p.push(html\`<span>\${this.component}</span>\`);}
    if(this.readtime){p.push(html\`<span class="sep">•</span>\`);p.push(html\`<span>\${this.readtime}</span>\`);}
    if(this.lastmod){p.push(html\`<span class="sep">•</span>\`);p.push(html\`<span>Updated \${this.lastmod}</span>\`);}
    return p.length?html\`<div class="meta">\${p}</div>\`:html\`\`;
  }
}
customElements.define('wc-page-meta',WcPageMeta);
`;
