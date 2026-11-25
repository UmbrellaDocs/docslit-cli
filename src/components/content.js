// Content components: wc-card, wc-tile, wc-tiles, wc-button, wc-prompt

export default `
// ── WC-CARD ────────────────────────────────────────────────────────────────
class WcCard extends LitElement {
  static properties={title:{type:String},href:{type:String},icon:{type:String},iconName:{type:String,attribute:'icon-name'},horizontal:{type:Boolean},img:{type:String},imgPosition:{type:String,attribute:'img-position'},cta:{type:String},arrow:{type:String},type:{type:String},iconColor:{type:String,attribute:'icon-color'},iconColorDark:{type:String,attribute:'icon-color-dark'},iconPosition:{type:String,attribute:'icon-position'},iconSize:{type:Number,attribute:'icon-size'}};
  static styles=css\`
    :host{display:block;min-width:0;--c:var(--accent,#01696f)}
    :host([type="info"]){--c:#3b82f6}
    :host([type="warning"]){--c:#f59e0b}
    :host([type="danger"]){--c:#ef4444}
    :host([type="check"]){--c:#10b981}
    :host([type="note"]){--c:#a855f7}
    :host([type="tip"]){--c:var(--accent,#01696f)}
    .card{display:flex;flex-direction:column;height:100%;box-sizing:border-box;background:var(--card-bg,var(--surface,#111));border:1px solid var(--card-border,var(--border,#2a2a2a));border-radius:var(--card-radius,var(--radius-lg,12px));box-shadow:var(--card-shadow,none);overflow:hidden;text-decoration:none;color:inherit;transition:border-color .2s,transform .2s,box-shadow .2s,background-color .2s;position:relative}
    .card.typed{background:color-mix(in srgb,var(--c) 8%,var(--surface,#111));border-color:color-mix(in srgb,var(--c) 32%,transparent)}
    a.card:hover{border-color:var(--card-border-hover,var(--border2,#3a3a3a));background:var(--card-bg-hover,var(--card-bg,var(--surface,#111)));transform:translateY(var(--card-lift,-2px));box-shadow:var(--card-shadow-hover,0 8px 24px rgba(0,0,0,.15))}
    a.card:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .card.img-left,.card.img-right{flex-direction:row}
    .card.img-right{flex-direction:row-reverse}
    .card.img-bottom{flex-direction:column-reverse}
    .pic{display:block;width:100%;height:auto;max-height:200px;object-fit:cover;background:var(--surface2,#1a1a1a)}
    .img-left .pic,.img-right .pic{width:38%;max-height:none;height:auto}
    .inner{display:flex;gap:14px;padding:var(--card-pad,22px);flex:1;min-width:0;flex-direction:column;align-items:flex-start}
    .inner.row{flex-direction:row;align-items:flex-start}
    .ico{width:var(--isz,36px);height:var(--isz,36px);flex-shrink:0;background:color-mix(in srgb,var(--ic,var(--c)) 15%,transparent);color:color-mix(in srgb,var(--ic,var(--c)) 70%,var(--text,#f0f0f0));border-radius:var(--radius,8px);display:flex;align-items:center;justify-content:center;font-size:calc(var(--isz,36px) * .5)}
    .ico ::slotted(span),.ico ::slotted(svg){display:inline-flex;width:calc(var(--isz,36px) * .5);height:calc(var(--isz,36px) * .5)}
    .ico ::slotted(.dl-emoji){width:auto;height:auto;font-size:inherit}
    .text{min-width:0;flex:1}
    .title{font-family:var(--font-sans,'Inter',sans-serif);font-size:var(--card-title-fs,16px);font-weight:var(--card-title-weight,700);color:var(--text,#f0f0f0);margin-bottom:6px;line-height:1.35}
    .body{font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;color:var(--text2,#a0a0a0);line-height:1.6}
    ::slotted(*){color:var(--text2,#a0a0a0);font-size:14px;line-height:1.6;margin-top:0;margin-bottom:8px}
    ::slotted(:last-child){margin-bottom:0}
    .cta{display:inline-flex;align-items:center;gap:4px;margin-top:12px;font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;font-weight:600;color:var(--accent-light,#4f98a3)}
    .arrow{position:absolute;top:16px;right:16px;color:var(--text3,#737373);font-size:15px;line-height:1;transition:transform .2s,color .2s}
    a.card:hover .arrow{color:var(--accent-light,#4f98a3);transform:translate(2px,-2px)}
    @media(max-width:640px){.inner{padding:16px}.title{font-size:15px}.body{font-size:13px}.card.img-left,.card.img-right{flex-direction:column}.img-left .pic,.img-right .pic{width:100%;max-height:200px}}
    @media(prefers-reduced-motion:reduce){.card,.arrow{transition:none}a.card:hover{transform:none}}
  \`;
  willUpdate(){
    const light=_isLight();
    const ic=(!light&&this.iconColorDark)?this.iconColorDark:this.iconColor;
    if(ic)this.style.setProperty('--ic',ic);else this.style.removeProperty('--ic');
    if(this.iconSize)this.style.setProperty('--isz',this.iconSize+'px');else this.style.removeProperty('--isz');
  }
  connectedCallback(){super.connectedCallback();if(this.iconColorDark)_watchTheme(this);}
  disconnectedCallback(){super.disconnectedCallback();_unwatchTheme(this);}
  render(){
    const legacy=!_hasSlot(this,'icon')?_emojiOnly(this.icon):'';
    const hasIcon=_hasSlot(this,'icon')||!!legacy;
    const ext=/^https?:/i.test(this.href||'');
    const showArrow=this.href&&(this.arrow==='false'?false:(this.arrow===''||this.arrow==='true'||this.arrow==null&&ext));
    const row=this.horizontal||this.iconPosition==='left';
    const pos=this.img?('img-'+(this.imgPosition||'top')):'';
    const cls='card '+pos+(this.type?' typed':'');
    const inner=html\`<div class="inner \${row?'row':''}">\${hasIcon?html\`<div class="ico" aria-hidden="true"><slot name="icon">\${legacy}</slot></div>\`:nothing}<div class="text">\${this.title?html\`<div class="title">\${unsafeHTML(_titleMd(this.title))}</div>\`:nothing}<div class="body"><slot></slot></div>\${this.cta?html\`<span class="cta">\${this.cta} <span aria-hidden="true">→</span></span>\`:nothing}</div></div>\`;
    const pic=this.img?html\`<img class="pic" src=\${this.img} alt="" loading="lazy" decoding="async">\`:nothing;
    const arrow=showArrow?html\`<span class="arrow" aria-hidden="true">↗</span>\`:nothing;
    return this.href?html\`<a class="\${cls}" href="\${this.href}" target=\${ext?'_blank':nothing} rel=\${ext?'noopener':nothing}>\${pic}\${inner}\${arrow}</a>\`:html\`<div class="\${cls}">\${pic}\${inner}</div>\`;
  }
}
customElements.define('wc-card',_lazy(WcCard));

// ── WC-TILE / WC-TILES ────────────────────────────────────────────────────
class WcTile extends LitElement {
  static properties={href:{type:String},icon:{type:String},iconName:{type:String,attribute:'icon-name'},title:{type:String},description:{type:String}};
  static styles=css\`
    :host{display:block;min-width:0}
    a,.tile{display:flex;align-items:flex-start;gap:14px;padding:16px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,10px);text-decoration:none;color:inherit;transition:border-color .15s,background .15s;box-sizing:border-box;height:100%}
    a:hover{border-color:var(--border2,#3a3a3a);background:var(--surface2,#1a1a1a)}
    a:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .pv{flex-direction:column;gap:12px;padding:12px}
    .preview{width:100%;box-sizing:border-box;min-height:120px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--surface2,#1a1a1a);border:1px solid var(--border,#2a2a2a);border-radius:var(--radius,8px);padding:12px}
    ::slotted(img),::slotted(svg),::slotted(wc-image){max-width:100%;max-height:220px;height:auto;margin:0 !important;border-radius:var(--r-xs,4px)}
    .icon{width:38px;height:38px;background:var(--accent-dim,rgba(1,105,111,.12));border:1px solid var(--accent-dim2,rgba(1,105,111,.2));border-radius:var(--radius,8px);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;color:var(--accent-light,#4f98a3)}
    .icon ::slotted(span),.icon ::slotted(svg){display:inline-flex;width:18px;height:18px}
    .info{display:flex;flex-direction:column;gap:3px;min-width:0;padding:0 2px}
    .title{font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;font-weight:600;color:var(--text,#f0f0f0)}
    .tile:not(.pv) .title,a:not(.pv) .title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .desc{font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;color:var(--text3,#737373);line-height:1.5}
    @media(max-width:640px){a,.tile{padding:12px;gap:10px}.icon{width:32px;height:32px;font-size:16px}.title{font-size:13px}.desc{font-size:12px}}
  \`;
  _hasPreview(){return Array.from(this.children).some(c=>!c.hasAttribute('slot'));}
  render(){
    const preview=this._hasPreview();
    const legacy=!_hasSlot(this,'icon')?_emojiOnly(this.icon):'';
    const hasIcon=_hasSlot(this,'icon')||!!legacy;
    const info=html\`<div class="info"><div class="title">\${unsafeHTML(_titleMd(this.title||''))}</div>\${this.description?html\`<div class="desc">\${this.description}</div>\`:nothing}</div>\`;
    const body=preview?html\`<div class="preview"><slot></slot></div>\${info}\`:html\`\${hasIcon?html\`<div class="icon" aria-hidden="true"><slot name="icon">\${legacy}</slot></div>\`:nothing}\${info}\`;
    return this.href?html\`<a class="\${preview?'pv':''}" href="\${this.href}">\${body}</a>\`:html\`<div class="tile \${preview?'pv':''}">\${body}</div>\`;
  }
}
customElements.define('wc-tile',_lazy(WcTile));

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
  static properties={label:{type:String},variant:{type:String},href:{type:String},size:{type:String},target:{type:String},outlined:{type:Boolean},minimal:{type:Boolean},full:{type:Boolean},rounded:{type:Boolean},mono:{type:Boolean},active:{type:Boolean},disabled:{type:Boolean},icon:{type:String},rightIcon:{type:String,attribute:'right-icon'}};
  static styles=css\`
    :host{display:inline-block;--c:var(--accent,#01696f)}
    :host([full]){display:block}
    :host([variant="success"]){--c:#10b981}
    :host([variant="warning"]){--c:#f59e0b}
    :host([variant="danger"]){--c:#ef4444}
    a,button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var(--radius,8px);font-family:var(--font-sans,'Inter',sans-serif);font-weight:600;line-height:1.3;cursor:pointer;border:1px solid transparent;text-decoration:none;transition:background .15s,border-color .15s,color .15s}
    :host([full]) a,:host([full]) button{width:100%}
    a:focus-visible,button:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .sm{padding:6px 14px;font-size:13px}
    .md{padding:10px 20px;font-size:14px}
    .lg{padding:13px 26px;font-size:15px}
    .rounded{border-radius:var(--r-pill,100px)}
    .mono{font-family:var(--font-mono,'JetBrains Mono',monospace);font-weight:500}
    .primary,.success,.warning{background:var(--c);color:var(--on-accent,#fff)}
    .success{background:color-mix(in srgb,var(--c) 68%,#000);color:#fff}
    .primary:hover,.success:hover,.warning:hover{background:color-mix(in srgb,var(--c) 82%,var(--text,#f0f0f0))}
    .warning{color:#1a1203;background:var(--c)}
    .outline{background:transparent;color:var(--text,#f0f0f0);border-color:var(--border2,#3a3a3a)}
    .outline:hover{background:var(--surface2,#1a1a1a)}
    .ghost{background:transparent;color:var(--text2,#a0a0a0)}
    .ghost:hover{color:var(--text,#f0f0f0);background:var(--surface2,#1a1a1a)}
    .danger{background:color-mix(in srgb,var(--c) 15%,transparent);color:color-mix(in srgb,var(--c) 65%,var(--text,#f0f0f0));border-color:color-mix(in srgb,var(--c) 30%,transparent)}
    .danger:hover{background:color-mix(in srgb,var(--c) 25%,transparent)}
    .none{background:var(--surface2,#1a1a1a);color:var(--text,#f0f0f0);border-color:var(--border,#2a2a2a)}
    .none:hover{border-color:var(--border2,#3a3a3a)}
    .outlined{background:transparent !important;color:color-mix(in srgb,var(--c) 65%,var(--text,#f0f0f0));border-color:var(--c)}
    .outlined:hover{background:color-mix(in srgb,var(--c) 12%,transparent) !important}
    .minimal{background:color-mix(in srgb,var(--c) 10%,transparent) !important;color:color-mix(in srgb,var(--c) 65%,var(--text,#f0f0f0));border-color:transparent}
    .minimal:hover{background:color-mix(in srgb,var(--c) 20%,transparent) !important}
    .isactive{box-shadow:0 0 0 2px color-mix(in srgb,var(--c) 40%,transparent)}
    .off{opacity:.5;cursor:not-allowed;pointer-events:none}
    .ico{display:inline-flex;width:1.1em;height:1.1em}
    .ico ::slotted(span),.ico ::slotted(svg){display:inline-flex;width:1.1em;height:1.1em}
    @media(max-width:640px){.md{padding:8px 16px;font-size:13px;gap:6px}}
    @media(prefers-reduced-motion:reduce){a,button{transition:none}}
  \`;
  render(){
    const v=this.variant||'primary';
    const cls=[v,this.size||'md',this.outlined?'outlined':'',this.minimal?'minimal':'',this.rounded?'rounded':'',this.mono?'mono':'',this.active?'isactive':'',this.disabled?'off':''].join(' ');
    const inner=html\`\${_hasSlot(this,'icon')?html\`<span class="ico" aria-hidden="true"><slot name="icon"></slot></span>\`:nothing}\${this.label||html\`<slot></slot>\`}\${_hasSlot(this,'icon-right')?html\`<span class="ico" aria-hidden="true"><slot name="icon-right"></slot></span>\`:nothing}\`;
    const blank=this.target==='_blank';
    return this.href?html\`<a href="\${this.href}" class="\${cls}" target=\${this.target||nothing} rel=\${blank?'noopener noreferrer':nothing} aria-disabled=\${this.disabled?'true':nothing} tabindex=\${this.disabled?'-1':nothing}>\${inner}</a>\`:html\`<button type="button" class="\${cls}" ?disabled=\${this.disabled}>\${inner}</button>\`;
  }
}
customElements.define('wc-button',WcButton);

// ── WC-PROMPT ──────────────────────────────────────────────────────────────
class WcPrompt extends LitElement {
  static properties={title:{type:String},description:{type:String},icon:{type:String},actions:{type:String},singleLine:{type:Boolean,attribute:'single-line'},hidePrompt:{type:Boolean,attribute:'hide-prompt'},_copied:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;--c:#a855f7}
    .wrap{background:var(--surface,#111);border:1px solid color-mix(in srgb,var(--c) 28%,transparent);border-radius:var(--radius-lg,10px);overflow:hidden}
    .header{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 14px;background:color-mix(in srgb,var(--c) 7%,transparent);border-bottom:1px solid color-mix(in srgb,var(--c) 22%,transparent)}
    .wrap.nobody .header{border-bottom:none}
    .label{display:flex;align-items:center;gap:8px;min-width:0;font-family:var(--font-sans,'Inter',sans-serif);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:color-mix(in srgb,var(--c) 65%,var(--text,#f0f0f0))}
    .ico{display:inline-flex;width:15px;height:15px;flex-shrink:0}
    .ico ::slotted(span),.ico ::slotted(svg){display:inline-flex;width:15px;height:15px}
    .acts{display:flex;gap:6px;flex-wrap:wrap}
    .btn{background:none;border:1px solid color-mix(in srgb,var(--c) 30%,transparent);border-radius:var(--r-sm,6px);padding:4px 10px;font-family:var(--font-sans,'Inter',sans-serif);font-size:11px;font-weight:600;color:color-mix(in srgb,var(--c) 65%,var(--text,#f0f0f0));cursor:pointer;text-decoration:none;transition:background .15s;display:inline-flex;align-items:center}
    .btn:hover{background:color-mix(in srgb,var(--c) 12%,transparent)}
    .btn:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .btn.copied{color:#10b981;border-color:rgba(16,185,129,.4)}
    .body{padding:14px 16px;font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;color:var(--text2,#a0a0a0);line-height:1.7;max-height:9.5em;overflow:auto}
    .body.single{max-height:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .src{display:none}
    ::slotted(*){color:var(--text2,#a0a0a0);line-height:1.7}
    ::slotted(:last-child){margin-bottom:0}
    @media(max-width:640px){.body{padding:12px 14px;font-size:13px}}
    @media(prefers-reduced-motion:reduce){.btn{transition:none}}
  \`;
  constructor(){super();this._copied=false;}
  _text(){return Array.from(this.childNodes).filter(n=>!(n.nodeType===1&&n.hasAttribute('slot'))).map(n=>n.textContent).join('').trim();}
  _acts(){
    const raw=(this.actions||'').trim();if(!raw)return [];
    let list=[];
    if(raw[0]==='['){try{list=JSON.parse(raw);}catch(e){list=[];}}else list=raw.split(',').map(s=>s.trim()).filter(Boolean);
    const p=encodeURIComponent(this._text());
    const known={cursor:{label:'Open in Cursor',url:'https://cursor.com/link/prompt?text='+p},claude:{label:'Open in Claude',url:'https://claude.ai/new?q='+p},chatgpt:{label:'Open in ChatGPT',url:'https://chatgpt.com/?q='+p}};
    const out=[];
    for(const a of list){
      if(typeof a==='string'){if(known[a])out.push(known[a]);}
      else if(a&&a.label&&a.url&&/^https?:\\/\\//i.test(a.url)){out.push({label:a.label,url:a.url.indexOf('{prompt}')>=0?a.url.split('{prompt}').join(p):a.url+(a.url.indexOf('?')>=0?'&':'?')+'prompt='+p});}
    }
    return out;
  }
  async _copy(){
    try{await navigator.clipboard.writeText(this._text());this._copied=true;setTimeout(()=>this._copied=false,2000);}catch(e){}
  }
  render(){
    const hasDesc=!!this.description;
    const showBody=!this.hidePrompt;
    return html\`<div class="wrap \${showBody?'':'nobody'}"><div class="header"><span class="label"><span class="ico" aria-hidden="true">\${this.icon?html\`<slot name="icon"></slot>\`:'✦'}</span>\${this.title||'AI Prompt'}</span><span class="acts">\${this._acts().map(a=>html\`<a class="btn" href=\${a.url} target="_blank" rel="noopener noreferrer">\${a.label}</a>\`)}<button type="button" class="btn \${this._copied?'copied':''}" @click=\${this._copy.bind(this)} aria-label="Copy prompt to clipboard">\${this._copied?'✓ Copied':'Copy'}</button></span></div>\${showBody?html\`<div class="body \${this.singleLine?'single':''}">\${hasDesc?unsafeHTML(_inlineMd(this.description)):html\`<slot></slot>\`}</div>\`:nothing}\${(hasDesc||!showBody)?html\`<div class="src"><slot></slot></div>\`:nothing}</div><span aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">\${this._copied?'Copied to clipboard':''}</span>\`;
  }
}
customElements.define('wc-prompt',_lazy(WcPrompt));
`;
