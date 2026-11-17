// Text & Callout components: wc-callout, wc-alert, wc-banner, wc-badge, wc-tooltip, wc-update

export default `
// ── WC-CALLOUT / WC-ALERT ──────────────────────────────────────────────────
// Colours come from one --c per type, mixed with the page --text so the same rule is legible
// in light and dark themes (and restyles with the theme variables).
class WcCallout extends LitElement {
  static properties={type:{type:String},title:{type:String},icon:{type:String},iconType:{type:String,attribute:'icon-type'},color:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0;--c:#3b82f6}
    :host([type="tip"]),:host([type="launch"]){--c:var(--accent,#01696f)}
    :host([type="warning"]){--c:#f59e0b}
    :host([type="error"]),:host([type="danger"]){--c:#ef4444}
    :host([type="success"]),:host([type="check"]){--c:#10b981}
    :host([type="note"]){--c:#a855f7}
    .wrap{display:flex;gap:12px;padding:16px 20px;border-radius:var(--radius-lg,10px);border:1px solid color-mix(in srgb,var(--c) 32%,transparent);background:color-mix(in srgb,var(--c) 9%,transparent);min-width:0;font-family:var(--font-sans,'Inter',sans-serif)}
    .ico{display:inline-flex;flex-shrink:0;width:20px;height:20px;margin-top:1px;font-size:20px;line-height:1;color:color-mix(in srgb,var(--c) 70%,var(--text,#f0f0f0))}
    .ico ::slotted(span),.ico ::slotted(svg){display:inline-flex;width:20px;height:20px}
    .body{flex:1;font-size:14px;line-height:1.7;min-width:0;overflow:hidden;color:var(--text2,#a0a0a0)}
    .title{font-weight:700;margin-bottom:2px;color:color-mix(in srgb,var(--c) 65%,var(--text,#f0f0f0))}
    ::slotted(*){max-width:100%}
    ::slotted(:last-child){margin-bottom:0}
    ::slotted(p){margin:0 0 8px}
    @media(max-width:640px){.wrap{gap:10px;padding:12px 14px}.body{font-size:13px}}
  \`;
  willUpdate(){if(this.color&&/^#?[0-9a-f]{3,8}$/i.test(this.color.trim()))this.style.setProperty('--c',this.color.trim().replace(/^([0-9a-f])/i,'#$1'));else if(this.color&&/^[a-z]+\\(|^[a-z]+$/i.test(this.color))this.style.setProperty('--c',this.color);}
  render(){
    const label=this.title||undefined;
    return html\`<div class="wrap" role="note" aria-label=\${label||nothing}><span class="ico" aria-hidden="true"><slot name="icon"></slot></span><div class="body">\${this.title?html\`<div class="title">\${unsafeHTML(_titleMd(this.title))}</div>\`:nothing}<slot></slot></div></div>\`;
  }
}
customElements.define('wc-callout',WcCallout);
customElements.define('wc-alert',class extends WcCallout{});

// ── WC-BANNER ──────────────────────────────────────────────────────────────
class WcBanner extends LitElement {
  static properties={type:{type:String},dismissible:{type:Boolean},color:{type:String},darkColor:{type:String,attribute:'dark-color'},icon:{type:String},_gone:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 12px;--c:#6b7280}
    :host([type="info"]){--c:#3b82f6}
    :host([type="warning"]){--c:#f59e0b}
    :host([type="error"]),:host([type="critical"]){--c:#ef4444}
    :host([type="success"]){--c:#10b981}
    .wrap{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:var(--radius,8px);border:1px solid color-mix(in srgb,var(--c) 35%,transparent);background:color-mix(in srgb,var(--c) 10%,transparent);color:var(--text,#f0f0f0);font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;line-height:1.6}
    .wrap.solid{background:var(--c);border-color:transparent;color:#fff}
    .msg{flex:1;min-width:0}
    .ico{display:inline-flex;width:16px;height:16px;flex-shrink:0;color:color-mix(in srgb,var(--c) 70%,var(--text,#f0f0f0))}
    .ico ::slotted(span),.ico ::slotted(svg){display:inline-flex;width:16px;height:16px}
    .solid .ico{color:inherit}
    .close{background:none;border:none;cursor:pointer;color:inherit;opacity:.65;font-size:16px;line-height:1;padding:4px 6px;flex-shrink:0;transition:opacity .15s;border-radius:4px}
    .close:hover{opacity:1}
    .close:focus-visible{outline:2px solid currentColor;outline-offset:1px}
    ::slotted(*){margin:0}
    @media(prefers-reduced-motion:reduce){.close{transition:none}}
  \`;
  constructor(){super();this._gone=false;}
  _key(){return 'docslit-banner:'+_hashStr((this.textContent||'').trim());}
  connectedCallback(){super.connectedCallback();if(this.dismissible){try{if(localStorage.getItem(this._key()))this._gone=true;}catch(e){}}}
  _dismiss(){this._gone=true;try{localStorage.setItem(this._key(),'1');}catch(e){}}
  willUpdate(){
    const dark=document.documentElement.classList.contains('light')?false:true;
    const c=(dark?(this.darkColor||this.color):(this.color||this.darkColor));
    if(c){this.style.setProperty('--c',c);}
  }
  render(){
    if(this._gone)return nothing;
    const solid=!!(this.color||this.darkColor);
    return html\`<div class="wrap \${solid?'solid':''}" role="region" aria-label="Announcement">\${this.icon?html\`<span class="ico" aria-hidden="true"><slot name="icon"></slot></span>\`:nothing}<div class="msg"><slot></slot></div>\${this.dismissible?html\`<button class="close" @click=\${()=>this._dismiss()} aria-label="Dismiss announcement">✕</button>\`:nothing}</div>\`;
  }
}
customElements.define('wc-banner',WcBanner);

// ── WC-BADGE ───────────────────────────────────────────────────────────────
class WcBadge extends LitElement {
  static properties={variant:{type:String},label:{type:String},size:{type:String},shape:{type:String},icon:{type:String},outlined:{type:Boolean},minimal:{type:Boolean},disabled:{type:Boolean}};
  static styles=css\`
    :host{display:inline-block;vertical-align:baseline;--c:var(--accent,#01696f)}
    :host([variant="success"]),:host([variant="check"]){--c:#10b981}
    :host([variant="warning"]){--c:#f59e0b}
    :host([variant="orange"]){--c:#f97316}
    :host([variant="danger"]),:host([variant="error"]){--c:#ef4444}
    :host([variant="info"]){--c:#3b82f6}
    :host([variant="neutral"]){--c:#9ca3af}
    :host([variant="purple"]),:host([variant="note"]){--c:#a855f7}
    :host([variant="tip"]),:host([variant="launch"]){--c:var(--accent,#01696f)}
    :host([variant="white"]){--c:var(--text,#f0f0f0)}
    :host([variant="surface"]){--c:var(--text3,#737373)}
    span{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:6px;font-family:var(--font-sans,'Inter',sans-serif);font-size:12px;line-height:1.5;font-weight:600;border:1px solid color-mix(in srgb,var(--c) 35%,transparent);background:color-mix(in srgb,var(--c) 14%,transparent);color:color-mix(in srgb,var(--c) 65%,var(--text,#f0f0f0));white-space:nowrap}
    span.pill{border-radius:100px}
    span.xs{font-size:10px;padding:0 6px}
    span.sm{font-size:11px;padding:1px 8px}
    span.lg{font-size:14px;padding:4px 14px}
    span.minimal{background:color-mix(in srgb,var(--c) 7%,transparent);border-color:transparent}
    span.outlined{background:transparent}
    span.disabled{opacity:.5}
    .ico{display:inline-flex;width:1.1em;height:1.1em}
    .ico ::slotted(span),.ico ::slotted(svg){display:inline-flex;width:1.1em;height:1.1em}
    @media(max-width:640px){span{font-size:11px;padding:1px 8px}}
  \`;
  render(){
    const cls=[this.shape==='pill'?'pill':'',this.size||'',this.minimal?'minimal':'',this.outlined?'outlined':'',this.disabled?'disabled':''].join(' ');
    return html\`<span class="\${cls}" aria-disabled=\${this.disabled?'true':nothing}>\${this.icon?html\`<span class="ico" aria-hidden="true"><slot name="icon"></slot></span>\`:nothing}\${this.label||html\`<slot></slot>\`}</span>\`;
  }
}
customElements.define('wc-badge',WcBadge);

// ── WC-TOOLTIP ─────────────────────────────────────────────────────────────
let _tipSeq=0;
class WcTooltip extends LitElement {
  static properties={text:{type:String},tip:{type:String},headline:{type:String},cta:{type:String},href:{type:String},position:{type:String},_open:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:inline}
    .trigger{cursor:help;text-decoration:underline dotted;text-decoration-color:color-mix(in srgb,var(--text3,#737373) 80%,transparent);text-underline-offset:3px;border-radius:2px}
    .trigger:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .tip{position:fixed;z-index:300;max-width:min(300px,calc(100vw - 24px));width:max-content;background:var(--surface2,#1a1a1a);border:1px solid var(--border2,#3a3a3a);border-radius:var(--radius,8px);padding:8px 12px;font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;line-height:1.5;color:var(--text,#f0f0f0);box-shadow:0 8px 24px rgba(0,0,0,.28);visibility:hidden;opacity:0;transition:opacity .12s;text-align:left;font-weight:400;text-decoration:none}
    .tip.show{visibility:visible;opacity:1}
    .hl{display:block;font-weight:700;margin-bottom:2px}
    .cta{display:inline-block;margin-top:6px;color:var(--accent-light,#4f98a3);font-weight:600;text-decoration:none}
    .cta:hover{text-decoration:underline}
    .cta:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px;border-radius:2px}
    @media(prefers-reduced-motion:reduce){.tip{transition:none}}
  \`;
  constructor(){super();this._open=false;this._id='dl-tip-'+(++_tipSeq);this._t=null;this._onKey=(e)=>{if(e.key==='Escape')this._hide(true);};}
  connectedCallback(){super.connectedCallback();window.addEventListener('scroll',this._hideNow=()=>this._hide(true),{passive:true,capture:true});window.addEventListener('resize',this._hideNow);}
  disconnectedCallback(){super.disconnectedCallback();window.removeEventListener('scroll',this._hideNow,true);window.removeEventListener('resize',this._hideNow);document.removeEventListener('keydown',this._onKey);}
  _show(){clearTimeout(this._t);if(this._open)return;this._open=true;document.addEventListener('keydown',this._onKey);this.updateComplete.then(()=>this._place());}
  _hide(now){clearTimeout(this._t);const go=()=>{this._open=false;document.removeEventListener('keydown',this._onKey);};if(now)go();else this._t=setTimeout(go,140);}
  _place(){
    const trig=this.renderRoot.querySelector('.trigger');const tip=this.renderRoot.querySelector('.tip');if(!trig||!tip)return;
    const r=trig.getBoundingClientRect();const t=tip.getBoundingClientRect();const g=8,m=8;
    let pos=this.position||'top';
    const fits={top:r.top-t.height-g>=m,bottom:r.bottom+t.height+g<=innerHeight-m,left:r.left-t.width-g>=m,right:r.right+t.width+g<=innerWidth-m};
    if(!fits[pos]){const alt={top:'bottom',bottom:'top',left:'right',right:'left'}[pos];pos=fits[alt]?alt:(fits.bottom?'bottom':'top');}
    let x,y;
    if(pos==='top'||pos==='bottom'){x=r.left+r.width/2-t.width/2;y=pos==='top'?r.top-t.height-g:r.bottom+g;}
    else{y=r.top+r.height/2-t.height/2;x=pos==='left'?r.left-t.width-g:r.right+g;}
    x=Math.max(m,Math.min(x,innerWidth-t.width-m));y=Math.max(m,Math.min(y,innerHeight-t.height-m));
    tip.style.left=x+'px';tip.style.top=y+'px';
  }
  render(){
    const body=this.tip||this.text||'';
    return html\`<span class="trigger" tabindex="0" aria-describedby=\${this._id} @mouseenter=\${()=>this._show()} @mouseleave=\${()=>this._hide()} @focusin=\${()=>this._show()} @focusout=\${()=>this._hide()} @click=\${()=>this._open?this._hide(true):this._show()}><slot></slot></span><span class="tip \${this._open?'show':''}" id=\${this._id} role="tooltip" @mouseenter=\${()=>this._show()} @mouseleave=\${()=>this._hide()}>\${this.headline?html\`<span class="hl">\${this.headline}</span>\`:nothing}\${unsafeHTML(_titleMd(body))}\${this.cta&&this.href?html\`<a class="cta" href=\${this.href}>\${this.cta}</a>\`:nothing}</span>\`;
  }
}
customElements.define('wc-tooltip',WcTooltip);

// ── WC-UPDATE ──────────────────────────────────────────────────────────────
class WcUpdate extends LitElement {
  static properties={version:{type:String},type:{type:String},date:{type:String},label:{type:String},description:{type:String},tags:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 20px;--c:var(--accent,#01696f)}
    .wrap{display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-radius:var(--radius-lg,10px);border:1px solid var(--border,#2a2a2a);background:var(--surface,#111)}
    .badge{display:inline-flex;align-items:center;padding:2px 10px;border-radius:100px;font-family:var(--font-sans,'Inter',sans-serif);font-size:11px;font-weight:700;border:1px solid color-mix(in srgb,var(--c) 35%,transparent);background:color-mix(in srgb,var(--c) 14%,transparent);color:color-mix(in srgb,var(--c) 65%,var(--text,#f0f0f0));white-space:nowrap;flex-shrink:0;text-transform:uppercase;letter-spacing:.06em;margin-top:2px}
    .added{--c:#10b981}.changed,.updated{--c:#3b82f6}.fixed{--c:#f59e0b}.removed,.deprecated{--c:#ef4444}.security{--c:#a855f7}
    .body{flex:1;min-width:0;font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;color:var(--text2,#a0a0a0);line-height:1.7}
    .meta{display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap}
    .version{font-size:13px;font-weight:600;color:var(--text,#f0f0f0)}
    .date{font-size:12px;color:var(--text3,#737373)}
    /* timeline layout (label / description / tags) */
    .tl{display:grid;grid-template-columns:minmax(120px,170px) minmax(0,1fr);gap:8px 32px;padding:8px 0 24px;border:none;background:none;border-radius:0;border-top:1px solid var(--border,#2a2a2a)}
    .side{display:flex;flex-direction:column;gap:6px;align-items:flex-start;font-family:var(--font-sans,'Inter',sans-serif)}
    .label{font-size:15px;font-weight:700;color:var(--text,#f0f0f0);text-decoration:none;border-radius:3px}
    .label:hover{color:var(--accent-light,#4f98a3)}
    .label:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .desc{font-size:13px;color:var(--text3,#737373)}
    .tags{display:flex;flex-wrap:wrap;gap:6px}
    .tag{font-size:11px;font-weight:600;padding:1px 8px;border-radius:100px;border:1px solid var(--border2,#3a3a3a);color:var(--text2,#a0a0a0);background:var(--surface,#111)}
    .tl .body{padding-top:2px}
    ::slotted(:first-child){margin-top:0}
    ::slotted(:last-child){margin-bottom:0}
    @media(max-width:700px){.tl{grid-template-columns:1fr;gap:10px}.side{flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px 12px}}
  \`;
  _tags(){return (this.tags||'').split(',').map(s=>s.trim()).filter(Boolean);}
  render(){
    if(this.label||this.description||this.tags){
      const id=this.id||_slug(this.label);
      return html\`<div class="wrap tl"><div class="side">\${this.label?html\`<a class="label" href="#\${id}">\${this.label}</a>\`:nothing}\${this.version?html\`<span class="version">v\${this.version}</span>\`:nothing}\${this.description?html\`<span class="desc">\${this.description}</span>\`:nothing}\${this._tags().length?html\`<span class="tags">\${this._tags().map(t=>html\`<span class="tag">\${t}</span>\`)}</span>\`:nothing}</div><div class="body"><slot></slot></div></div>\`;
    }
    const t=this.type||'added';
    return html\`<div class="wrap"><span class="badge \${t}">\${t}</span><div class="body"><div class="meta">\${this.version?html\`<span class="version">v\${this.version}</span>\`:nothing}\${this.date?html\`<span class="date">\${this.date}</span>\`:nothing}</div><slot></slot></div></div>\`;
  }
}
customElements.define('wc-update',WcUpdate);
`;
