// Data & API components: wc-field, wc-fields, wc-response-fields, wc-color, wc-table, wc-asciidoc-table, wc-schema, wc-mermaid, wc-endpoint, wc-runnable-endpoint

export default `
// ── WC-FIELD / WC-FIELDS ───────────────────────────────────────────────────
class WcField extends LitElement {
  static properties={name:{type:String},type:{type:String},required:{type:Boolean},description:{type:String},default:{type:String},deprecated:{type:Boolean},in:{type:String},enum:{type:String},format:{type:String},pattern:{type:String},minimum:{type:String},maximum:{type:String},maxlength:{type:String},minlength:{type:String},example:{type:String},collapsible:{type:Boolean},pre:{type:String},post:{type:String},placeholder:{type:String},_expanded:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block}
    :host([theme="dark"]){--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666;--surface2:#1a1a1a}
    :host([theme="light"]){--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#737373;--surface2:#f5f5f5}
    .row{padding:14px 0;border-bottom:1px solid var(--border,#2a2a2a);font-family:'Inter',sans-serif;font-size:14px}
    .row:last-child{border-bottom:none}
    .name-line{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
    .name{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:var(--text,#f0f0f0)}
    :host([deprecated]) .name{text-decoration:line-through;opacity:.6}
    .type-label{font-family:'Inter',sans-serif;font-size:12px;color:var(--text3,#666)}
    .in-badge{font-family:'JetBrains Mono',monospace;font-size:10px;padding:1px 6px;border-radius:var(--r-xs,3px);background:var(--surface2,#1a1a1a);color:var(--text3,#666);border:1px solid var(--border,#2a2a2a);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
    .lbl{font-family:var(--font-sans,'Inter',sans-serif);font-size:10px;font-weight:600;padding:1px 6px;border-radius:var(--r-xs,3px);background:var(--accent-dim,rgba(1,105,111,.15));color:var(--accent-light,#4f98a3);border:1px solid var(--accent-dim2,rgba(1,105,111,.25));white-space:nowrap}
    .req{font-size:10px;font-weight:700;padding:1px 6px;border-radius:var(--r-xs,3px);background:rgba(239,68,68,.15);color:color-mix(in srgb,#ef4444 46%,var(--text,#f0f0f0));border:1px solid rgba(239,68,68,.3);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
    .desc{color:var(--text2,#a0a0a0);line-height:1.6;font-size:13px;margin-top:6px}
    .desc code{font-family:'JetBrains Mono',monospace;font-size:12px;background:rgba(1,105,111,.1);padding:1px 4px;border-radius:var(--r-xs,3px);color:var(--accent-light,#4f98a3)}
    .desc a{color:var(--accent-light,#4f98a3);text-decoration:none}
    .desc a:hover{text-decoration:underline}
    .constraint{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text3,#666);margin-top:4px}
    .default-val{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text3,#666);margin-top:4px}
    .example-val{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text3,#666);margin-top:4px}
    .example-val code{font-size:11px;background:rgba(1,105,111,.1);padding:1px 4px;border-radius:var(--r-xs,3px);color:var(--accent-light,#4f98a3)}
    .enum-box{margin-top:10px;border:1px solid var(--border,#2a2a2a);border-radius:var(--r-md,8px);overflow:hidden}
    .enum-title{font-size:12px;font-weight:600;color:var(--text,#f0f0f0);padding:10px 14px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a)}
    .enum-item{padding:10px 14px;border-bottom:1px solid var(--border,#2a2a2a)}
    .enum-item:last-child{border-bottom:none}
    .enum-val{font-family:'JetBrains Mono',monospace;font-size:12px;padding:2px 8px;border-radius:var(--r-xs,4px);background:rgba(1,105,111,.1);color:var(--accent-light,#4f98a3);display:inline-block}
    .toggle-btn{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:6px 14px;border:1px solid var(--border,#2a2a2a);border-radius:20px;background:transparent;font-family:'Inter',sans-serif;font-size:12px;color:var(--text2,#a0a0a0);cursor:pointer;transition:all .15s;user-select:none}
    .toggle-btn:hover{border-color:var(--text3,#666);color:var(--text,#f0f0f0)}
    .toggle-icon{font-size:10px;line-height:1}
    .children{margin-top:10px;border:1px solid var(--border,#2a2a2a);border-radius:var(--r-md,8px);overflow:hidden}
    .children-header{display:flex;align-items:center;gap:6px;padding:8px 14px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);font-family:'Inter',sans-serif;font-size:12px;color:var(--text2,#a0a0a0);cursor:pointer;user-select:none;transition:color .15s}
    .children-header:hover{color:var(--text,#f0f0f0)}
    .children-header .icon{font-size:11px}
    .children-body{padding:0 14px}
    .collapsed{display:none}
  \`;
  constructor(){super();this._expanded=false;}
  _toggle(){this._expanded=!this._expanded;}
  render(){
    const typeLabel=this.format?this.type+' ('+this.format+')':this.type;
    const constraints=[];
    const enumValues=this.enum?this.enum.split(',').map(s=>s.trim()):[];
    if(this.pattern)constraints.push('/'+this.pattern+'/');
    if(this.minimum!==null&&this.minimum!==undefined&&this.maximum!==null&&this.maximum!==undefined)constraints.push(this.minimum+' – '+this.maximum);
    else if(this.minimum!==null&&this.minimum!==undefined)constraints.push('≥ '+this.minimum);
    else if(this.maximum!==null&&this.maximum!==undefined)constraints.push('≤ '+this.maximum);
    if(this.maxlength)constraints.push('≤ '+this.maxlength+' characters');
    if(this.minlength)constraints.push('≥ '+this.minlength+' characters');
    return html\`<div class="row">
      <div class="name-line">
        \${(this.pre||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>html\`<span class="lbl">\${x}</span>\`)}
        <span class="name">\${this.name}</span>
        \${this.in?html\`<span class="in-badge">\${this.in}</span>\`:nothing}
        \${typeLabel?html\`<span class="type-label">\${typeLabel}</span>\`:nothing}
        \${this.required?html\`<span class="req">required</span>\`:nothing}
        \${(this.post||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>html\`<span class="lbl">\${x}</span>\`)}
      </div>
      \${this.description?html\`<div class="desc"><span .innerHTML=\${_inlineMd(this.description)}></span></div>\`:nothing}
      \${constraints.length?html\`<div class="constraint">\${constraints.join(' · ')}</div>\`:nothing}
      \${this.default!==undefined&&this.default!==null?html\`<div class="default-val">Default: \${this.default}</div>\`:nothing}
      \${this.placeholder?html\`<div class="example-val">Placeholder: <code>\${this.placeholder}</code></div>\`:nothing}
      \${this.example!==undefined&&this.example!==null?html\`<div class="example-val">Example: <code>\${this.example}</code></div>\`:nothing}
      \${enumValues.length?html\`<div class="enum-box"><div class="enum-title">Possible enum values</div>\${enumValues.map(v=>html\`<div class="enum-item"><span class="enum-val">\${v}</span></div>\`)}</div>\`:nothing}
      \${this.collapsible?html\`
        \${!this._expanded?html\`<button class="toggle-btn" @click=\${this._toggle.bind(this)}><span class="toggle-icon">+</span> Show child attributes</button>\`:nothing}
        \${this._expanded?html\`<div class="children">
          <div class="children-header" @click=\${this._toggle.bind(this)}><span class="icon">✕</span> Hide child attributes</div>
          <div class="children-body"><slot></slot></div>
        </div>\`:nothing}
      \`:html\`<slot></slot>\`}
    </div>\`;}
}
customElements.define('wc-field',WcField);

class WcFields extends LitElement {
  static properties={title:{type:String},header:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text3:#737373}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-lg,10px);overflow:hidden}
    .header{padding:10px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);font-family:'Inter',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3,#666)}
    .body{padding:0 16px}
  \`;
  render(){return html\`<div class="wrap"><div class="header">\${this.title||this.header||'Parameters'}</div><div class="body"><slot></slot></div></div>\`;}
}
customElements.define('wc-fields',WcFields);

// ── WC-RESPONSE-FIELDS ─────────────────────────────────────────────────────
class WcResponseFields extends LitElement {
  static properties={title:{type:String},header:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text3:#737373}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-lg,10px);overflow:hidden}
    .header{padding:10px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);font-family:'Inter',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3,#666)}
    .body{padding:0 16px}
  \`;
  render(){return html\`<div class="wrap"><div class="header">\${this.title||this.header||'Response'}</div><div class="body"><slot></slot></div></div>\`;}
}
customElements.define('wc-response-fields',WcResponseFields);

// ── WC-RESPONSE / WC-RESPONSES ────────────────────────────────────────────
class WcResponse extends LitElement {
  static properties={code:{type:String},description:{type:String},'content-type':{type:String}};
  static styles=css\`
    :host{display:block}
    :host([theme="dark"]){--border:#2a2a2a;--text2:#a0a0a0;--text3:#666}
    :host([theme="light"]){--border:#e2e2e2;--text2:#555;--text3:#737373}
    .row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border,#2a2a2a);font-family:'Inter',sans-serif;font-size:13px}
    .row:last-child{border-bottom:none}
    .code{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;padding:2px 8px;border-radius:var(--r-xs,4px);white-space:nowrap}
    .c2{background:rgba(16,185,129,.15);color:color-mix(in srgb,#10b981 46%,var(--text,#f0f0f0));border:1px solid rgba(16,185,129,.3)}
    .c3{background:rgba(59,130,246,.15);color:color-mix(in srgb,#3b82f6 46%,var(--text,#f0f0f0));border:1px solid rgba(59,130,246,.3)}
    .c4{background:rgba(245,158,11,.15);color:color-mix(in srgb,#f59e0b 46%,var(--text,#f0f0f0));border:1px solid rgba(245,158,11,.3)}
    .c5{background:rgba(239,68,68,.15);color:color-mix(in srgb,#ef4444 46%,var(--text,#f0f0f0));border:1px solid rgba(239,68,68,.3)}
    .desc{color:var(--text2,#a0a0a0)}
    .ct{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text3,#666);margin-left:auto}
  \`;
  render(){
    const c=this.code||'';
    const cls='c'+c[0];
    return html\`<div class="row"><span class="code \${cls}">\${c}</span><span class="desc">\${this.description||''}</span>\${this['content-type']?html\`<span class="ct">\${this['content-type']}</span>\`:nothing}</div>\`;
  }
}
customElements.define('wc-response',WcResponse);

class WcResponses extends LitElement {
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text3:#737373}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-lg,10px);overflow:hidden}
    .header{padding:10px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);font-family:'Inter',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3,#666)}
    .body{padding:0 16px}
  \`;
  render(){return html\`<div class="wrap"><div class="header">Status codes</div><div class="body"><slot></slot></div></div>\`;}
}
customElements.define('wc-responses',WcResponses);

// ── WC-COLOR ───────────────────────────────────────────────────────────────
class WcColor extends LitElement {
  static properties={hex:{type:String},value:{type:String},light:{type:String},dark:{type:String},name:{type:String},variable:{type:String},_copied:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:inline-block;margin:8px 8px 8px 0;min-width:0}
    :host([data-v]){display:block;margin:0}
    .wrap{display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,10px);cursor:pointer;transition:border-color .15s;font-family:var(--font-sans,'Inter',sans-serif);text-align:left;width:100%;box-sizing:border-box}
    .wrap:hover{border-color:var(--border2,#3a3a3a)}
    .wrap:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .wrap.copied{border-color:rgba(16,185,129,.5)}
    .swatch{width:40px;height:40px;border-radius:var(--radius,8px);flex-shrink:0;border:1px solid rgba(128,128,128,.3)}
    :host([data-v="compact"]) .wrap{flex-direction:column;align-items:stretch;gap:10px;padding:10px}
    :host([data-v="compact"]) .swatch{width:100%;height:56px}
    :host([data-v="table"]) .wrap{border:none;background:none;padding:6px 0;gap:10px;width:auto}
    :host([data-v="table"]) .swatch{width:48px;height:48px}
    .info{display:flex;flex-direction:column;gap:2px;min-width:0}
    .color-name{font-size:14px;font-weight:600;color:var(--text,#f0f0f0);overflow-wrap:anywhere}
    .hex{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:var(--text3,#737373);overflow-wrap:anywhere}
    .var{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:11px;color:var(--text3,#737373)}
    .check{font-size:12px;color:#10b981;margin-left:4px}
    @media(prefers-reduced-motion:reduce){.wrap{transition:none}}
  \`;
  constructor(){super();this._copied=false;}
  connectedCallback(){super.connectedCallback();if(this.light||this.dark)_watchTheme(this);}
  disconnectedCallback(){super.disconnectedCallback();_unwatchTheme(this);}
  _val(){const base=this.value||this.hex||'';if(!this.light&&!this.dark)return base;return _isLight()?(this.light||this.dark||base):(this.dark||this.light||base);}
  async _copy(){
    const val=this.variable||this._val()||'';
    try{await navigator.clipboard.writeText(val);this._copied=true;setTimeout(()=>this._copied=false,2000);}catch(e){}
  }
  _onKey(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();this._copy();}}
  render(){
    const v=this._val();
    return html\`<div class="wrap \${this._copied?'copied':''}" @click=\${this._copy.bind(this)} @keydown=\${this._onKey} role="button" tabindex="0" aria-label=\${'Copy '+(this.variable||v)+(this.name?' ('+this.name+')':'')}><div class="swatch" style="background:\${v||'#888'}"></div><div class="info"><div class="color-name">\${this.name||v}\${this._copied?html\`<span class="check" role="status">Copied</span>\`:nothing}</div>\${this.name?html\`<div class="hex">\${v}</div>\`:nothing}\${this.variable?html\`<div class="var">\${this.variable}</div>\`:nothing}</div></div>\`;
  }
}
customElements.define('wc-color',WcColor);

// ── WC-COLORS / WC-COLOR-ROW ───────────────────────────────────────────────
class WcColors extends LitElement {
  static properties={variant:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
    .table{display:flex;flex-direction:column;border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,10px);overflow:hidden;background:var(--surface,#111)}
  \`;
  _sync(){const v=this.variant==='table'?'table':'compact';this.querySelectorAll('wc-color').forEach(c=>c.setAttribute('data-v',v));this.querySelectorAll('wc-color-row').forEach(c=>c.setAttribute('data-v',v));}
  render(){return html\`<div class="\${this.variant==='table'?'table':'grid'}" role="group"><slot @slotchange=\${()=>this._sync()}></slot></div>\`;}
  updated(){this._sync();}
}
customElements.define('wc-colors',WcColors);

class WcColorRow extends LitElement {
  static properties={title:{type:String}};
  static styles=css\`
    :host{display:flex;gap:16px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border,#2a2a2a);flex-wrap:wrap}
    :host(:last-child){border-bottom:none}
    .t{flex:0 0 140px;font-family:var(--font-sans,'Inter',sans-serif);font-size:13px;font-weight:700;color:var(--text,#f0f0f0);min-width:0}
    .items{display:flex;flex-wrap:wrap;gap:8px 20px;flex:1;min-width:0}
    @media(max-width:640px){.t{flex-basis:100%}}
  \`;
  render(){return html\`<div class="t">\${unsafeHTML(_titleMd(this.title))}</div><div class="items"><slot></slot></div>\`;}
  updated(){this.querySelectorAll('wc-color').forEach(c=>c.setAttribute('data-v','table'));}
}
customElements.define('wc-color-row',WcColorRow);

// ── WC-TABLE ───────────────────────────────────────────────────────────────
class WcTable extends LitElement {
  static properties={headers:{type:String},rows:{type:String},sticky:{type:Boolean},searchable:{type:Boolean},placeholder:{type:String},maxHeight:{type:String,attribute:'max-height'},_q:{type:String,state:true},_shown:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    .wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,10px);background:var(--surface,#111)}
    .scroll{overflow:auto;max-height:var(--tbl-h,none)}
    :host([sticky]) .scroll{max-height:var(--tbl-h,70vh)}
    table{width:100%;border-collapse:collapse;font-family:var(--font-sans,'Inter',sans-serif);font-size:14px}
    thead{position:sticky;top:0;z-index:1}
    th{text-align:left;padding:10px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);border-right:1px solid var(--border,#2a2a2a);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3,#737373);white-space:nowrap}
    td{padding:10px 16px;border-bottom:1px solid var(--border,#2a2a2a);border-right:1px solid var(--border,#2a2a2a);color:var(--text2,#a0a0a0);vertical-align:top;line-height:1.6}
    th:last-child,td:last-child{border-right:none}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:rgba(128,128,128,.04)}
    code{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;background:var(--accent-dim,rgba(1,105,111,.1));padding:1px 6px;border-radius:var(--r-xs,3px);color:var(--accent-light,#4f98a3)}
    .bar{display:flex;align-items:center;gap:12px;margin:0 0 10px}
    input{flex:1;max-width:380px;box-sizing:border-box;padding:8px 12px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--radius,8px);color:var(--text,#f0f0f0);font-family:var(--font-sans,'Inter',sans-serif);font-size:14px}
    input:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:1px}
    .count{font-size:12px;color:var(--text3,#737373);font-family:var(--font-sans,'Inter',sans-serif)}
    @media(max-width:640px){th,td{padding:8px 12px;font-size:13px}}
  \`;
  constructor(){super();this._q='';this._shown=-1;}
  _native(){return this.querySelector('table');}
  _filter(e){
    this._q=e.target.value;const q=this._q.trim().toLowerCase();const t=this._native();if(!t)return;
    let n=0;t.querySelectorAll('tbody tr').forEach(tr=>{const hit=!q||tr.textContent.toLowerCase().indexOf(q)>=0;tr.hidden=!hit;if(hit)n++;});
    this._shown=n;
  }
  updated(){const t=this._native();if(t&&this.maxHeight)this.style.setProperty('--tbl-h',this.maxHeight);}
  render(){
    const t=this._native();
    if(t){
      const total=t.querySelectorAll('tbody tr').length;
      return html\`\${this.searchable?html\`<div class="bar"><input type="search" .value=\${this._q} placeholder=\${this.placeholder||'Filter rows…'} aria-label=\${this.placeholder||'Filter table rows'} @input=\${this._filter.bind(this)}><span class="count" role="status" aria-live="polite">\${this._q?(this._shown<0?total:this._shown)+' of '+total+' rows':''}</span></div>\`:nothing}<div class="wrap"><div class="scroll"><slot></slot></div></div>\`;
    }
    let headers=[],rows=[];
    try{headers=JSON.parse(this.headers||'[]');}catch(e){}
    try{rows=JSON.parse(this.rows||'[]');}catch(e){}
    return html\`<div class="wrap"><table><thead><tr>\${headers.map(h=>html\`<th>\${h}</th>\`)}</tr></thead><tbody>\${rows.map(row=>html\`<tr>\${row.map(cell=>html\`<td>\${cell}</td>\`)}</tr>\`)}</tbody></table></div>\`;
  }
}
customElements.define('wc-table',WcTable);

// ── WC-ASCIIDOC-TABLE ──────────────────────────────────────────────────────
// AsciiDoc table source is pre-rendered to a real <table> at build/dev time.
// This component supplies overflow chrome; cell styles come from document CSS
// (slotted light-DOM descendants are not styleable from shadow CSS).
class WcAsciidocTable extends LitElement {
  static properties={caption:{type:String},cols:{type:String},options:{type:String},format:{type:String},separator:{type:String},frame:{type:String},grid:{type:String},stripes:{type:String},width:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--adoc-border:#2a2a2a;--adoc-surface:#111}
    :host([theme="light"]){--adoc-border:#e2e2e2;--adoc-surface:#f8f8f8}
    .wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--adoc-border,var(--border,#2a2a2a));border-radius:var(--r-lg,10px);background:var(--adoc-surface,var(--surface,#111))}
    ::slotted(.adoc-table-wrap){display:block}
  \`;
  render(){return html\`<div class="wrap"><slot></slot></div>\`;}
}
customElements.define('wc-asciidoc-table',WcAsciidocTable);

// ── WC-SCHEMA ──────────────────────────────────────────────────────────────
class WcSchema extends LitElement {
  static properties={type:{type:String},description:{type:String},extends:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#737373}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-lg,10px);overflow:hidden}
    .header{padding:14px 18px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .type-name{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;color:var(--text,#f0f0f0)}
    .extends{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text3,#666)}
    .desc{font-family:'Inter',sans-serif;font-size:13px;color:var(--text2,#a0a0a0);margin-top:4px;padding:0 18px 14px;border-bottom:1px solid var(--border,#2a2a2a)}
    .body{padding:0 16px}
    @media(max-width:640px){.type-name{font-size:13px}}
  \`;
  render(){return html\`<div class="wrap"><div class="header"><span class="type-name">\${this.type||'Type'}</span>\${this.extends?html\`<span class="extends">extends \${this.extends}</span>\`:nothing}</div>\${this.description?html\`<div class="desc">\${this.description}</div>\`:nothing}<div class="body"><slot></slot></div></div>\`;}
}
customElements.define('wc-schema',WcSchema);

// ── WC-MERMAID ─────────────────────────────────────────────────────────────
class WcMermaid extends LitElement {
  static properties={_svg:{type:String,state:true},_error:{type:String,state:true},_offline:{type:Boolean,state:true},_expanded:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2;--text3:#737373}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-lg,10px);padding:24px;overflow-x:auto;text-align:center;position:relative}
    .loading{color:var(--text3,#777);font-family:'Inter',sans-serif;font-size:13px}
    .error{color:#f87171;font-family:'JetBrains Mono',monospace;font-size:12px;white-space:pre-wrap;text-align:left}
    .offline{color:var(--text3,#666);font-family:'Inter',sans-serif;font-size:12px;text-align:left;margin-bottom:8px}
    .src{margin:0;text-align:left;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.55;color:var(--text2,#999);white-space:pre;overflow-x:auto}
    .diagram{display:inline-block;max-width:100%}
    .diagram svg{max-width:100%;height:auto}
    .expand-btn{position:absolute;top:10px;right:10px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-sm,6px);padding:5px 8px;cursor:pointer;color:var(--text3,#666);font-size:14px;line-height:1;display:flex;align-items:center;gap:4px;font-family:'Inter',sans-serif;font-size:11px;transition:color .15s,border-color .15s;z-index:1}
    .expand-btn:hover{color:#4f98a3;border-color:#4f98a3}
    .overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:32px;box-sizing:border-box}
    .modal{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-xl,12px);padding:48px 32px 32px;width:90vw;height:90vh;overflow:auto;position:relative;display:flex;align-items:center;justify-content:center}
    .modal-diagram{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
    .modal-diagram svg{width:100%;height:100%;max-width:100%;max-height:100%}
    .close-btn{position:absolute;top:12px;right:12px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-sm,6px);padding:6px 12px;cursor:pointer;color:var(--text3,#666);font-family:'Inter',sans-serif;font-size:12px;transition:color .15s,border-color .15s;z-index:1}
    .close-btn:hover{color:#f87171;border-color:#f87171}
  \`;
  constructor(){super();this._expanded=false;}
  connectedCallback(){super.connectedCallback();this._code=this.textContent.trim();}
  async firstUpdated(){await this._renderDiagram();}
  disconnectedCallback(){super.disconnectedCallback();if(this._mo){this._mo.disconnect();this._mo=null;}}
  _isLight(){return document.documentElement.classList.contains('light');}
  async _renderDiagram(){
    if(!this._code)return;
    try{
      // Mermaid is large (and ESM-only), so it is loaded lazily from a CDN the first time a diagram appears.
      // Offline or blocked networks fall back to showing the diagram source (see render()).
      if(!window.__mermaid__){
        window.__mermaid__=(await import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs')).default;
      }
      const light=this._isLight();
      window.__mermaid__.initialize(light
        ?{startOnLoad:false,theme:'base',themeVariables:{background:'#f8f8f8',primaryColor:'#e6f4f1',primaryBorderColor:'#01696f',primaryTextColor:'#1a1a1a',lineColor:'#6b7280',edgeLabelBackground:'#f8f8f8'}}
        :{startOnLoad:false,theme:'dark',themeVariables:{background:'#111',primaryColor:'#01696f',primaryTextColor:'#e2e8f0',lineColor:'#444',edgeLabelBackground:'#111'}});
      const id='mermaid-'+Math.random().toString(36).slice(2);
      const{svg}=await window.__mermaid__.render(id,this._code);
      this._svg=svg;this._error=null;this._offline=false;
      if(!this._mo){this._mo=new MutationObserver(()=>{if(this._lastLight!==this._isLight())this._renderDiagram();});this._mo.observe(document.documentElement,{attributes:true,attributeFilter:['class']});}
      this._lastLight=light;
    }catch(e){
      // a failed import (offline, CSP, CDN down) is not a syntax error: keep the source readable
      if(!window.__mermaid__){this._offline=true;this._error=null;}else this._error=e.message;
    }
  }
  _open(){this._expanded=true;}
  _close(e){if(e.target===e.currentTarget||e.target.classList.contains('close-btn'))this._expanded=false;}
  render(){
    if(this._offline)return html\`<div class="wrap"><div class="offline">Diagram unavailable: the Mermaid renderer could not be loaded (offline or blocked network). Source:</div><pre class="src">\${this._code}</pre></div>\`;
    if(this._error)return html\`<div class="wrap"><pre class="error">\${this._error}</pre></div>\`;
    if(!this._svg)return html\`<div class="wrap"><div class="loading">Rendering diagram…</div></div>\`;
    return html\`<div class="wrap"><button class="expand-btn" @click=\${this._open} title="Expand diagram">\u{2922} Expand</button><div class="diagram" .innerHTML=\${this._svg}></div></div>\${this._expanded?html\`<div class="overlay" @click=\${this._close}><div class="modal"><button class="close-btn" @click=\${this._close}>✕ Close</button><div class="modal-diagram" .innerHTML=\${this._svg}></div></div></div>\`:nothing}\`;
  }
}
customElements.define('wc-mermaid',WcMermaid);

// ── WC-ENDPOINT ────────────────────────────────────────────────────────────
class WcEndpoint extends LitElement {
  static properties={method:{type:String},url:{type:String},description:{type:String},ref:{type:String},summary:{type:String},security:{type:String},_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666;--code-text:#e2e8f0}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#737373;--code-text:#24292f}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-lg,10px);overflow:hidden}
    .url-bar{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);flex-wrap:wrap;gap:8px}
    .method{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;padding:3px 10px;border-radius:var(--r-xs,4px);flex-shrink:0;text-transform:uppercase}
    .GET{background:rgba(16,185,129,.15);color:color-mix(in srgb,#10b981 46%,var(--text,#f0f0f0));border:1px solid rgba(16,185,129,.3)}
    .POST{background:rgba(59,130,246,.15);color:color-mix(in srgb,#3b82f6 46%,var(--text,#f0f0f0));border:1px solid rgba(59,130,246,.3)}
    .PUT,.PATCH{background:rgba(245,158,11,.15);color:color-mix(in srgb,#f59e0b 46%,var(--text,#f0f0f0));border:1px solid rgba(245,158,11,.3)}
    .DELETE{background:rgba(239,68,68,.15);color:color-mix(in srgb,#ef4444 46%,var(--text,#f0f0f0));border:1px solid rgba(239,68,68,.3)}
    .url{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text,#f0f0f0);word-break:break-all}
    .security{display:flex;gap:6px;padding:8px 16px;border-bottom:1px solid var(--border,#2a2a2a);flex-wrap:wrap;align-items:center;font-family:'Inter',sans-serif;font-size:11px}
    .security-label{color:var(--text3,#666);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-right:2px}
    .security-badge{font-family:'JetBrains Mono',monospace;font-size:11px;padding:2px 8px;border-radius:var(--r-xs,4px);background:rgba(245,158,11,.12);color:color-mix(in srgb,#f59e0b 46%,var(--text,#f0f0f0));border:1px solid rgba(245,158,11,.25)}
    .security-badge.open{background:rgba(16,185,129,.12);color:color-mix(in srgb,#10b981 46%,var(--text,#f0f0f0));border-color:rgba(16,185,129,.25)}
    .summary{padding:10px 16px 4px;font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:var(--text,#f0f0f0)}
    .summary+.desc{padding-top:4px}
    .desc{padding:10px 16px;font-family:'Inter',sans-serif;font-size:13px;color:var(--text2,#a0a0a0);border-bottom:1px solid var(--border,#2a2a2a);line-height:1.6}
    .desc code{font-family:'JetBrains Mono',monospace;font-size:12px;background:rgba(1,105,111,.1);padding:1px 4px;border-radius:var(--r-xs,3px);color:var(--accent-light,#4f98a3)}
    .desc a{color:var(--accent-light,#4f98a3);text-decoration:none}
    .desc a:hover{text-decoration:underline}
    .tabbar{display:flex;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);overflow-x:auto}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:8px 14px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text3,#666);cursor:pointer;white-space:nowrap;flex-shrink:0;margin-bottom:-1px;transition:all .15s}
    button.active{color:var(--accent-light,#4f98a3);border-bottom-color:#01696f}
    button:hover{color:#a0a0a0}
    .panel{display:none}.panel.active{display:block}
    pre{margin:0;padding:16px;overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7;color:var(--code-text,#e2e8f0)}
    @media(max-width:640px){.url{font-size:12px;}pre{font-size:11px;padding:12px 10px;}}
  \`;
  constructor(){super();this._active=0;}
  _renderSecurity(){
    if(!this.security)return nothing;
    try{
      const schemes=JSON.parse(this.security);
      if(!schemes.length)return html\`<div class="security"><span class="security-label">Auth:</span><span class="security-badge open">None required</span></div>\`;
      return html\`<div class="security"><span class="security-label">Auth:</span>\${schemes.map(s=>{const name=Object.keys(s)[0];return html\`<span class="security-badge">\${name}</span>\`;})}</div>\`;
    }catch(e){return nothing;}
  }
  _syncVisibility(){
    const sections=this._sections||[];
    if(sections.length<=1)return;
    const active=sections[this._active];
    const fields=Array.from(this.querySelectorAll('wc-fields'));
    const responses=Array.from(this.querySelectorAll('wc-responses'));
    const responseFields=Array.from(this.querySelectorAll('wc-response-fields'));
    const codeTabs=Array.from(this.querySelectorAll('wc-code-tab'));
    fields.forEach(el=>el.style.display=active?.type==='fields'?'':'none');
    responses.forEach(el=>el.style.display=active?.type==='responses'?'':'none');
    responseFields.forEach(el=>el.style.display=active?.type==='response'?'':'none');
    codeTabs.forEach(el=>el.style.display='none');
  }
  updated(){this._syncVisibility();}
  render(){
    const tabs=Array.from(this.querySelectorAll('wc-code-tab'));
    const fields=Array.from(this.querySelectorAll('wc-fields'));
    const responseFields=Array.from(this.querySelectorAll('wc-response-fields'));
    const responses=Array.from(this.querySelectorAll('wc-responses'));
    const m=(this.method||'GET').toUpperCase();
    const sections=[];
    if(fields.length)sections.push({label:'Parameters',type:'fields'});
    if(responses.length)sections.push({label:'Status codes',type:'responses'});
    if(responseFields.length)sections.push({label:'Response',type:'response'});
    if(tabs.length)tabs.forEach((t,i)=>sections.push({label:t.label||t.getAttribute('label')||'Snippet '+(i+1),type:'tab',idx:i}));
    this._sections=sections;
    return html\`<div class="wrap">
      <div class="url-bar"><span class="method \${m}">\${m}</span><code class="url">\${this.url||''}</code></div>
      \${this._renderSecurity()}
      \${this.summary&&this.description?html\`<div class="summary">\${this.summary}</div><div class="desc"><span .innerHTML=\${_inlineMd(this.description)}></span></div>\`:this.summary?html\`<div class="desc">\${this.summary}</div>\`:this.description?html\`<div class="desc"><span .innerHTML=\${_inlineMd(this.description)}></span></div>\`:nothing}
      \${sections.length>1?html\`<div class="tabbar">\${sections.map((s,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${s.label}</button>\`)}</div>\`:nothing}
      <slot></slot>
      \${tabs.length&&sections.length>1?html\`\${tabs.map((t,i)=>{const si=sections.findIndex(s=>s.type==='tab'&&s.idx===i);return html\`<div class="panel \${si===this._active?'active':''}"><pre>\${t.textContent}</pre></div>\`})}\`:nothing}
      \${tabs.length&&sections.length<=1?html\`<div class="tabbar">\${tabs.map((t,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${t.label||t.getAttribute('label')||'Snippet '+(i+1)}</button>\`)}</div>\${tabs.map((t,i)=>html\`<div class="panel \${i===this._active?'active':''}"><pre>\${t.textContent}</pre></div>\`)}\`:nothing}
    </div>\`;
  }
}
customElements.define('wc-endpoint',WcEndpoint);

// ── WC-API-EXAMPLES ───────────────────────────────────────────────────────
class WcApiExamples extends LitElement {
  static properties={ref:{type:String},method:{type:String},url:{type:String},data:{type:String},_activeStatus:{type:Number,state:true},_activeExample:{type:Number,state:true},_activeReqExample:{type:Number,state:true},_parsed:{type:Object,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 24px;--ex-bg:#0d0d0d;--ex-bg2:#161616;--ex-border:#2a2a2a;--ex-text:#f0f0f0;--ex-text2:#a0a0a0;--ex-text3:#888;--ex-code:#e2e8f0}
    .wrap{background:var(--ex-bg);border:1px solid var(--ex-border);border-radius:var(--r-lg,10px);overflow:hidden}
    .header{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--ex-bg2);border-bottom:1px solid var(--ex-border);flex-wrap:wrap}
    .method{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;padding:2px 8px;border-radius:var(--r-xs,4px);text-transform:uppercase}
    .GET{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
    .POST{background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.3)}
    .PUT,.PATCH{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
    .DELETE{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3)}
    .ep-url{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ex-text);word-break:break-all}
    .section-title{font-family:'Inter',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ex-text3);padding:12px 14px 6px}
    .status-tabs{display:flex;gap:4px;padding:0 14px 8px}
    .status-tab{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;padding:4px 12px;border-radius:var(--r-xs,4px);cursor:pointer;border:1px solid var(--ex-border);background:transparent;color:var(--ex-text3);transition:all .15s}
    .status-tab.active{background:rgba(16,185,129,.15);color:#34d399;border-color:rgba(16,185,129,.3)}
    .status-tab.c4.active{background:rgba(245,158,11,.15);color:#fbbf24;border-color:rgba(245,158,11,.3)}
    .status-tab.c5.active{background:rgba(239,68,68,.15);color:#f87171;border-color:rgba(239,68,68,.3)}
    .meta{padding:4px 14px;font-family:'Inter',sans-serif;font-size:11px;color:var(--ex-text3)}
    .example-select{padding:4px 14px 8px}
    .example-select select{background:var(--ex-bg2);border:1px solid var(--ex-border);border-radius:var(--r-xs,4px);padding:4px 8px;font-family:'Inter',sans-serif;font-size:12px;color:var(--ex-text2);cursor:pointer;width:100%}
    pre.code{margin:0;padding:14px;overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;color:var(--ex-code);background:var(--ex-bg2);max-height:400px;overflow-y:auto}
    .empty{padding:14px;color:var(--ex-text3);font-family:'Inter',sans-serif;font-size:12px}
  \`;
  constructor(){super();this._activeStatus=0;this._activeExample=0;this._activeReqExample=0;this._parsed=null;}
  updated(changed){if(changed.has('data')&&this.data){try{this._parsed=JSON.parse(this.data);}catch(e){this._parsed=null;}}}
  _renderResponses(){
    if(!this._parsed?.responses?.length)return nothing;
    const resps=this._parsed.responses;
    const active=resps[this._activeStatus]||resps[0];
    const content=active?.content?.[0];
    const examples=content?.examples||[];
    const ex=examples[this._activeExample]||examples[0];
    return html\`
      <div class="section-title">Response samples</div>
      <div class="status-tabs">\${resps.map((r,i)=>html\`<button class="status-tab \${i===this._activeStatus?'active':''} c\${r.code[0]}" @click=\${()=>{this._activeStatus=i;this._activeExample=0;}}>\${r.code}</button>\`)}</div>
      \${content?html\`<div class="meta">Content type: \${content.mediaType}</div>\`:nothing}
      \${examples.length>1?html\`<div class="example-select"><select @change=\${(e)=>this._activeExample=parseInt(e.target.value)}>\${examples.map((ex,i)=>html\`<option value="\${i}" ?selected=\${i===this._activeExample}>\${ex.summary||ex.name}</option>\`)}</select></div>\`:nothing}
      \${ex?.value!==undefined?html\`<pre class="code">\${typeof ex.value==='string'?ex.value:JSON.stringify(ex.value,null,2)}</pre>\`:html\`<div class="empty">No example available</div>\`}
    \`;
  }
  _renderRequestBody(){
    if(!this._parsed?.requestBody?.length)return nothing;
    const rb=this._parsed.requestBody[0];
    const examples=rb?.examples||[];
    const ex=examples[this._activeReqExample]||examples[0];
    if(!ex)return nothing;
    return html\`
      <div class="section-title">Request body</div>
      \${rb.mediaType?html\`<div class="meta">Content type: \${rb.mediaType}</div>\`:nothing}
      \${examples.length>1?html\`<div class="example-select"><select @change=\${(e)=>this._activeReqExample=parseInt(e.target.value)}>\${examples.map((ex,i)=>html\`<option value="\${i}" ?selected=\${i===this._activeReqExample}>\${ex.summary||ex.name}</option>\`)}</select></div>\`:nothing}
      \${ex?.value!==undefined?html\`<pre class="code">\${typeof ex.value==='string'?ex.value:JSON.stringify(ex.value,null,2)}</pre>\`:nothing}
    \`;
  }
  render(){
    const m=(this.method||'GET').toUpperCase();
    return html\`<div class="wrap">
      <div class="header"><span class="method \${m}">\${m}</span><span class="ep-url">\${this.url||''}</span></div>
      \${this._renderResponses()}
      \${this._renderRequestBody()}
    </div>\`;
  }
}
customElements.define('wc-api-examples',WcApiExamples);

// ── WC-RUNNABLE-ENDPOINT ───────────────────────────────────────────────────
class WcRunnableEndpoint extends LitElement {
  static properties={
    method:{type:String},url:{type:String},
    _method:{type:String,state:true},_url:{type:String,state:true},
    _body:{type:String,state:true},_headers:{type:String,state:true},
    _loading:{type:Boolean,state:true},_status:{type:Number,state:true},
    _response:{type:String,state:true},_error:{type:String,state:true}
  };
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--surface3:#222;--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666;--code-text:#e2e8f0}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--surface3:#e8e8e8;--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#737373;--code-text:#24292f}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-lg,10px);overflow:hidden;font-family:'Inter',sans-serif}
    .toolbar{display:flex;align-items:center;gap:8px;padding:12px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);flex-wrap:wrap}
    select{background:var(--surface3,#222);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-sm,6px);padding:6px 10px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--text,#f0f0f0);cursor:pointer;flex-shrink:0}
    input[type=text]{flex:1;min-width:200px;background:var(--surface3,#222);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-sm,6px);padding:7px 12px;font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text,#f0f0f0);outline:none}
    input[type=text]:focus{border-color:#01696f}
    button.send{background:#01696f;border:none;border-radius:var(--r-sm,6px);padding:7px 20px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;flex-shrink:0;transition:background .15s}
    button.send:hover{background:#4f98a3}
    button.send:disabled{opacity:.5;cursor:not-allowed}
    .extras{padding:12px 16px;border-bottom:1px solid var(--border,#2a2a2a);display:flex;flex-direction:column;gap:8px}
    label{font-size:12px;font-weight:600;color:var(--text3,#666);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px}
    textarea{width:100%;background:var(--surface3,#222);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-sm,6px);padding:10px 12px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text,#f0f0f0);resize:vertical;outline:none;min-height:80px;box-sizing:border-box;line-height:1.5}
    textarea:focus{border-color:#01696f}
    .response{padding:16px}
    .status{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:10px}
    .status.ok{color:#34d399}
    .status.err{color:#f87171}
    .status.warn{color:#fbbf24}
    pre.res{background:var(--surface2,#1a1a1a);border:1px solid var(--border,#2a2a2a);border-radius:var(--r-md,8px);padding:14px 16px;overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;color:var(--code-text,#e2e8f0);white-space:pre-wrap;word-break:break-word;max-height:400px;overflow-y:auto;margin:0}
    .empty{color:var(--text3,#666);font-size:13px;padding:16px}
    @media(max-width:640px){.toolbar{gap:6px;}input[type=text]{min-width:120px;font-size:12px;}}
  \`;
  constructor(){super();this._method='GET';this._url='';this._body='';this._headers='';this._loading=false;this._status=null;this._response='';this._error='';}
  connectedCallback(){super.connectedCallback();if(this.method)this._method=this.method.toUpperCase();if(this.url)this._url=this.url;}
  async _send(){
    this._loading=true;this._status=null;this._response='';this._error='';
    try{
      const opts={method:this._method,headers:{'Content-Type':'application/json'}};
      if(this._headers.trim()){try{Object.assign(opts.headers,JSON.parse(this._headers));}catch(e){}}
      if(this._body.trim()&&this._method!=='GET'&&this._method!=='HEAD')opts.body=this._body;
      const res=await fetch(this._url,opts);
      this._status=res.status;
      const ct=res.headers.get('content-type')||'';
      const text=await res.text();
      this._response=ct.includes('json')?JSON.stringify(JSON.parse(text),null,2):text;
    }catch(e){this._error=e.message;}finally{this._loading=false;}
  }
  _statusClass(){if(!this._status)return'';return this._status<300?'ok':this._status<500?'warn':'err';}
  render(){
    const methods=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
    return html\`<div class="wrap">
      <div class="toolbar">
        <select @change=\${e=>this._method=e.target.value} .value=\${this._method}>\${methods.map(m=>html\`<option value="\${m}" ?selected=\${this._method===m}>\${m}</option>\`)}</select>
        <input type="text" placeholder="https://api.example.com/endpoint" .value=\${this._url} @input=\${e=>this._url=e.target.value} />
        <button class="send" @click=\${this._send.bind(this)} ?disabled=\${this._loading||!this._url}>\${this._loading?'Sending…':'Send'}</button>
      </div>
      <div class="extras">
        <div><label>Headers (JSON)</label><textarea rows="2" placeholder='{"Authorization":"Bearer token"}' .value=\${this._headers} @input=\${e=>this._headers=e.target.value}></textarea></div>
        \${this._method!=='GET'&&this._method!=='HEAD'?html\`<div><label>Body (JSON)</label><textarea rows="3" placeholder='{"key":"value"}' .value=\${this._body} @input=\${e=>this._body=e.target.value}></textarea></div>\`:nothing}
      </div>
      <div class="response">
        \${this._error?html\`<div class="status err">⚠ \${this._error}</div>\`:nothing}
        \${this._status?html\`<div class="status \${this._statusClass()}">\${this._status} \${this._status<300?'OK':this._status<500?'Client Error':'Server Error'}</div>\`:nothing}
        \${this._response?html\`<pre class="res">\${this._response}</pre>\`:html\`<div class="empty">Send a request to see the response</div>\`}
      </div>
    </div>\`;
  }
}
customElements.define('wc-runnable-endpoint',WcRunnableEndpoint);

// ── WC-PLAYGROUND (OpenAPI Try-it) ─────────────────────────────────────────
class WcPlayground extends LitElement {
  static properties={
    method:{type:String},url:{type:String},server:{type:String},proxy:{type:String},
    params:{type:String},auth:{type:String},
    _method:{type:String,state:true},_path:{type:String,state:true},_server:{type:String,state:true},
    _query:{},_headers:{},_pathParams:{},_body:{type:String,state:true},_authValue:{type:String,state:true},
    _loading:{type:Boolean,state:true},_status:{type:Number,state:true},_response:{type:String,state:true},_error:{type:String,state:true},_offline:{type:Boolean,state:true}
  };
  static styles=css\`
    :host{display:block;margin:0 0 20px}
    .wrap{border:1px solid var(--dl-border,var(--border,rgba(255,255,255,.08)));border-radius:var(--r-lg,10px);overflow:hidden;background:var(--dl-surface,var(--surface,#111));color:var(--text,#f0f0f0)}
    .head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dl-border,var(--border,rgba(255,255,255,.08)));flex-wrap:wrap}
    .method{font-family:ui-monospace,monospace;font-size:11px;font-weight:700;padding:3px 8px;border-radius:var(--r-xs,4px);background:rgba(16,185,129,.15);color:color-mix(in srgb,#10b981 46%,var(--text,#f0f0f0))}
    .path{font-family:ui-monospace,monospace;font-size:13px;flex:1;min-width:160px}
    button.go{background:var(--dl-accent,#01696f);color:#fff;border:none;border-radius:var(--r-sm,6px);padding:7px 16px;font-weight:600;cursor:pointer}
    button.go:disabled{opacity:.5;cursor:not-allowed}
    .body{padding:12px 14px;display:grid;gap:10px}
    label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;opacity:.7;display:block;margin-bottom:4px}
    input,textarea{width:100%;box-sizing:border-box;border-radius:var(--r-sm,6px);border:1px solid var(--dl-border,var(--border2,rgba(255,255,255,.12)));background:transparent;color:inherit;padding:8px 10px;font-family:ui-monospace,monospace;font-size:12px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    @media(max-width:700px){.grid{grid-template-columns:1fr}}
    pre{margin:0;padding:12px;border-radius:var(--r-md,8px);background:var(--surface2,rgba(0,0,0,.25));overflow:auto;max-height:360px;font-size:12px;white-space:pre-wrap}
    .note{font-size:12px;opacity:.7;padding:0 14px 12px}
    .err{color:color-mix(in srgb,#ef4444 46%,var(--text,#f0f0f0))}
  \`;
  constructor(){
    super();this.method='GET';this.url='/';this.server='';this.proxy='';
    this._method='GET';this._path='/';this._server='';this._query={};this._headers={};this._pathParams={};
    this._body='{}';this._authValue='';this._loading=false;this._status=null;this._response='';this._error='';
    this._offline=typeof location!=='undefined'&&location.protocol==='file:';
  }
  connectedCallback(){
    super.connectedCallback();
    this._method=(this.method||'GET').toUpperCase();
    this._path=this.url||'/';
    this._server=this.server||'';
    try{
      const params=this.params?JSON.parse(this.params):[];
      for(const p of params){
        if(p.in==='path')this._pathParams[p.name]=p.example??'';
        else if(p.in==='query')this._query[p.name]=p.example??'';
        else if(p.in==='header')this._headers[p.name]=p.example??'';
      }
    }catch(e){}
    if(window.__DOCSLIT_PLAYGROUND_PROXY__&&!this.proxy)this.proxy=window.__DOCSLIT_PLAYGROUND_PROXY__;
  }
  _buildUrl(){
    let p=this._path;
    for(const [k,v] of Object.entries(this._pathParams))p=p.replace(new RegExp('\\\\{'+k+'\\\\}','g'),encodeURIComponent(v||''));
    const qs=Object.entries(this._query).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
    const base=(this._server||'').replace(/\\/$/,'');
    return base+p+(qs?('?'+qs):'');
  }
  async _send(){
    if(this._offline){this._error='Playground requires network access (not available offline).';return;}
    this._loading=true;this._error='';this._response='';this._status=null;
    try{
      const target=this._buildUrl();
      const fetchUrl=this.proxy?String(this.proxy).replace(/\\/$/,'')+'?url='+encodeURIComponent(target):target;
      const headers={...this._headers};
      if(this._authValue){
        try{
          const auth=this.auth?JSON.parse(this.auth):{type:'bearer'};
          if(auth.type==='apiKey'&&auth.in==='header'&&auth.name)headers[auth.name]=this._authValue;
          else headers.Authorization=(auth.type==='basic'?'Basic ':'Bearer ')+this._authValue;
        }catch(e){headers.Authorization='Bearer '+this._authValue;}
      }
      const opts={method:this._method,headers};
      if(!['GET','HEAD'].includes(this._method)&&this._body.trim()){
        opts.body=this._body;if(!headers['Content-Type']&&!headers['content-type'])headers['Content-Type']='application/json';
      }
      const res=await fetch(fetchUrl,opts);
      this._status=res.status;
      const text=await res.text();
      try{this._response=JSON.stringify(JSON.parse(text),null,2);}catch(e){this._response=text;}
    }catch(e){this._error=e.message+(this.proxy?'':' — If this is a CORS error, set playground.proxyUrl in docslit.json');}
    finally{this._loading=false;}
  }
  render(){
    const pathKeys=Object.keys(this._pathParams);
    const queryKeys=Object.keys(this._query);
    return html\`<div class="wrap">
      <div class="head">
        <span class="method">\${this._method}</span>
        <input class="path" .value=\${this._server} @input=\${e=>this._server=e.target.value} placeholder="https://api.example.com" />
        <span class="path">\${this._path}</span>
        <button class="go" @click=\${this._send.bind(this)} ?disabled=\${this._loading||this._offline}>\${this._loading?'Sending…':'Try it'}</button>
      </div>
      <div class="body">
        \${pathKeys.length?html\`<div class="grid">\${pathKeys.map(k=>html\`<div><label>Path: \${k}</label><input .value=\${this._pathParams[k]||''} @input=\${e=>{this._pathParams={...this._pathParams,[k]:e.target.value};}} /></div>\`)}</div>\`:nothing}
        \${queryKeys.length?html\`<div class="grid">\${queryKeys.map(k=>html\`<div><label>Query: \${k}</label><input .value=\${this._query[k]||''} @input=\${e=>{this._query={...this._query,[k]:e.target.value};}} /></div>\`)}</div>\`:nothing}
        <div><label>Auth</label><input placeholder="token / api key" .value=\${this._authValue} @input=\${e=>this._authValue=e.target.value} /></div>
        \${!['GET','HEAD'].includes(this._method)?html\`<div><label>Body</label><textarea rows="4" .value=\${this._body} @input=\${e=>this._body=e.target.value}></textarea></div>\`:nothing}
        \${this._error?html\`<div class="err">\${this._error}</div>\`:nothing}
        \${this._status!=null?html\`<div>Status: \${this._status}</div>\`:nothing}
        \${this._response?html\`<pre>\${this._response}</pre>\`:nothing}
      </div>
      \${this._offline?html\`<div class="note">Offline builds cannot execute live requests.</div>\`:nothing}
    </div>\`;
  }
}
customElements.define('wc-playground',WcPlayground);
`;
