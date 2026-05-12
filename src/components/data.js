// Data & API components: wc-field, wc-fields, wc-response-fields, wc-color, wc-table, wc-schema, wc-mermaid, wc-endpoint, wc-runnable-endpoint

export default `
// ── WC-FIELD / WC-FIELDS ───────────────────────────────────────────────────
class WcField extends LitElement {
  static properties={name:{type:String},type:{type:String},required:{type:Boolean},description:{type:String},default:{type:String},deprecated:{type:Boolean},in:{type:String},enum:{type:String},format:{type:String},pattern:{type:String},minimum:{type:String},maximum:{type:String},collapsible:{type:Boolean},_expanded:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block}
    :host([theme="dark"]){--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666}
    :host([theme="light"]){--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#999}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:0;padding:12px 0;border-bottom:1px solid var(--border,#2a2a2a);font-family:'Inter',sans-serif;font-size:14px}
    .row:last-child{border-bottom:none}
    .left{display:flex;flex-direction:column;gap:6px;padding-right:16px}
    .name{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:var(--text,#f0f0f0);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    :host([deprecated]) .name{text-decoration:line-through;opacity:.6}
    .type-badge{font-family:'JetBrains Mono',monospace;font-size:11px;padding:1px 8px;border-radius:4px;background:rgba(1,105,111,.15);color:#4f98a3;border:1px solid rgba(1,105,111,.3);white-space:nowrap}
    .in-badge{font-family:'JetBrains Mono',monospace;font-size:10px;padding:1px 6px;border-radius:3px;background:var(--surface2,#1a1a1a);color:var(--text3,#666);border:1px solid var(--border,#2a2a2a);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
    .req{font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
    .desc{color:var(--text2,#a0a0a0);line-height:1.6;font-size:13px}
    .constraint{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text3,#666);margin-top:4px}
    .default-val{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text3,#666);margin-top:4px}
    .nested{padding-left:20px;border-left:2px solid var(--border,#2a2a2a);margin-top:8px}
    .toggle{cursor:pointer;user-select:none}
    .toggle::before{content:'▶';font-size:9px;margin-right:6px;display:inline-block;transition:transform .15s}
    .toggle.open::before{transform:rotate(90deg)}
    .collapsed{display:none}
    @media(max-width:768px){.row{grid-template-columns:1fr;gap:6px}}
  \`;
  constructor(){super();this._expanded=false;}
  _toggle(){this._expanded=!this._expanded;}
  render(){
    const typeLabel=this.format?this.type+' ('+this.format+')':this.type;
    const constraints=[];
    if(this.enum)constraints.push('one of: '+this.enum.split(',').map(s=>s.trim()).join(' | '));
    if(this.pattern)constraints.push('/'+this.pattern+'/');
    if(this.minimum!==null&&this.minimum!==undefined&&this.maximum!==null&&this.maximum!==undefined)constraints.push(this.minimum+' – '+this.maximum);
    else if(this.minimum!==null&&this.minimum!==undefined)constraints.push('≥ '+this.minimum);
    else if(this.maximum!==null&&this.maximum!==undefined)constraints.push('≤ '+this.maximum);
    return html\`<div class="row"><div class="left"><div class="name \${this.collapsible?'toggle':''}  \${this._expanded?'open':''}" @click=\${this.collapsible?this._toggle.bind(this):null}><span>\${this.name}</span>\${this.in?html\`<span class="in-badge">\${this.in}</span>\`:nothing}\${typeLabel?html\`<span class="type-badge">\${typeLabel}</span>\`:nothing}\${this.required?html\`<span class="req">required</span>\`:nothing}</div>\${constraints.length?html\`<div class="constraint">\${constraints.join(' · ')}</div>\`:nothing}\${this.default!==undefined&&this.default!==null?html\`<div class="default-val">Default: \${this.default}</div>\`:nothing}</div><div>\${this.description?html\`<div class="desc">\${this.description}</div>\`:nothing}<div class="\${this.collapsible&&!this._expanded?'collapsed':''}"><slot></slot></div></div></div>\`;}
}
customElements.define('wc-field',WcField);

class WcFields extends LitElement {
  static properties={title:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text3:#999}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;overflow:hidden}
    .header{padding:10px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);font-family:'Inter',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3,#666);display:grid;grid-template-columns:1fr 1fr;gap:0}
    .body{padding:0 16px}
    @media(max-width:768px){.header{grid-template-columns:1fr}}
  \`;
  render(){return html\`<div class="wrap"><div class="header"><span>Parameter</span><span>Description</span></div><div class="body"><slot></slot></div></div>\`;}
}
customElements.define('wc-fields',WcFields);

// ── WC-RESPONSE-FIELDS ─────────────────────────────────────────────────────
class WcResponseFields extends LitElement {
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text3:#999}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;overflow:hidden}
    .header{padding:10px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);font-family:'Inter',sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3,#666);display:grid;grid-template-columns:1fr 1fr}
    .body{padding:0 16px}
    @media(max-width:768px){.header{grid-template-columns:1fr}}
  \`;
  render(){return html\`<div class="wrap"><div class="header"><span>Field</span><span>Description</span></div><div class="body"><slot></slot></div></div>\`;}
}
customElements.define('wc-response-fields',WcResponseFields);

// ── WC-COLOR ───────────────────────────────────────────────────────────────
class WcColor extends LitElement {
  static properties={hex:{type:String},name:{type:String},variable:{type:String},_copied:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:inline-block;margin:8px 8px 8px 0}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a;--border2:#3a3a3a;--text:#f0f0f0;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2;--border2:#d0d0d0;--text:#0f0f0f;--text3:#999}
    .wrap{display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;cursor:pointer;transition:border-color .15s;font-family:'Inter',sans-serif}
    .wrap:hover{border-color:var(--border2,#3a3a3a)}
    .wrap.copied{border-color:rgba(16,185,129,.4)}
    .swatch{width:40px;height:40px;border-radius:8px;flex-shrink:0;border:1px solid rgba(128,128,128,.2)}
    .info{display:flex;flex-direction:column;gap:2px}
    .color-name{font-size:14px;font-weight:600;color:var(--text,#f0f0f0)}
    .hex{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text3,#666)}
    .var{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text3,#666)}
    .check{font-size:12px;color:#34d399;margin-left:4px}
  \`;
  constructor(){super();this._copied=false;}
  async _copy(){
    const val=this.variable||this.hex||'';
    try{await navigator.clipboard.writeText(val);this._copied=true;setTimeout(()=>this._copied=false,2000);}catch(e){}
  }
  render(){return html\`<div class="wrap \${this._copied?'copied':''}" @click=\${this._copy.bind(this)} role="button" tabindex="0" title="Click to copy"><div class="swatch" style="background:\${this.hex||'#888'}"></div><div class="info"><div class="color-name">\${this.name||this.hex}\${this._copied?html\`<span class="check">✓</span>\`:nothing}</div>\${this.hex?html\`<div class="hex">\${this.hex}</div>\`:nothing}\${this.variable?html\`<div class="var">\${this.variable}</div>\`:nothing}</div></div>\`;}
}
customElements.define('wc-color',WcColor);

// ── WC-TABLE ───────────────────────────────────────────────────────────────
class WcTable extends LitElement {
  static properties={headers:{type:String},rows:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text2:#a0a0a0;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text2:#555;--text3:#999}
    .wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border,#2a2a2a);border-radius:10px;background:var(--surface,#111)}
    table{width:100%;border-collapse:collapse;font-family:'Inter',sans-serif;font-size:14px}
    thead{position:sticky;top:0;z-index:1}
    th{text-align:left;padding:10px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3,#666);white-space:nowrap}
    td{padding:10px 16px;border-bottom:1px solid var(--border,#2a2a2a);color:var(--text2,#a0a0a0);vertical-align:top;line-height:1.6}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:rgba(128,128,128,.04)}
    code{font-family:'JetBrains Mono',monospace;font-size:12px;background:rgba(1,105,111,.1);padding:1px 6px;border-radius:3px;color:#4f98a3}
    @media(max-width:640px){th,td{padding:8px 12px;font-size:13px}}
  \`;
  render(){
    let headers=[],rows=[];
    try{headers=JSON.parse(this.headers||'[]');}catch(e){}
    try{rows=JSON.parse(this.rows||'[]');}catch(e){}
    return html\`<div class="wrap"><table><thead><tr>\${headers.map(h=>html\`<th>\${h}</th>\`)}</tr></thead><tbody>\${rows.map(row=>html\`<tr>\${row.map(cell=>html\`<td>\${cell}</td>\`)}</tr>\`)}</tbody></table></div>\`;
  }
}
customElements.define('wc-table',WcTable);

// ── WC-SCHEMA ──────────────────────────────────────────────────────────────
class WcSchema extends LitElement {
  static properties={type:{type:String},description:{type:String},extends:{type:String}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#999}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;overflow:hidden}
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
  static properties={_svg:{type:String,state:true},_error:{type:String,state:true},_expanded:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px}
    :host([theme="dark"]){--surface:#111;--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--surface:#f8f8f8;--border:#e2e2e2;--text3:#999}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;padding:24px;overflow-x:auto;text-align:center;position:relative}
    .loading{color:#555;font-family:'Inter',sans-serif;font-size:13px}
    .error{color:#f87171;font-family:'JetBrains Mono',monospace;font-size:12px;white-space:pre-wrap;text-align:left}
    .diagram{display:inline-block;max-width:100%}
    .diagram svg{max-width:100%;height:auto}
    .expand-btn{position:absolute;top:10px;right:10px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:6px;padding:5px 8px;cursor:pointer;color:var(--text3,#666);font-size:14px;line-height:1;display:flex;align-items:center;gap:4px;font-family:'Inter',sans-serif;font-size:11px;transition:color .15s,border-color .15s;z-index:1}
    .expand-btn:hover{color:#4f98a3;border-color:#4f98a3}
    .overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:32px;box-sizing:border-box}
    .modal{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:12px;padding:48px 32px 32px;width:90vw;height:90vh;overflow:auto;position:relative;display:flex;align-items:center;justify-content:center}
    .modal-diagram{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
    .modal-diagram svg{width:100%;height:100%;max-width:100%;max-height:100%}
    .close-btn{position:absolute;top:12px;right:12px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:6px;padding:6px 12px;cursor:pointer;color:var(--text3,#666);font-family:'Inter',sans-serif;font-size:12px;transition:color .15s,border-color .15s;z-index:1}
    .close-btn:hover{color:#f87171;border-color:#f87171}
  \`;
  constructor(){super();this._expanded=false;}
  connectedCallback(){super.connectedCallback();this._code=this.textContent.trim();}
  async firstUpdated(){await this._renderDiagram();}
  async _renderDiagram(){
    if(!this._code)return;
    try{
      if(!window.__mermaid__){
        const mod=await import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs');
        window.__mermaid__=mod.default;
        window.__mermaid__.initialize({startOnLoad:false,theme:'dark',themeVariables:{background:'#111',primaryColor:'#01696f',primaryTextColor:'#e2e8f0',lineColor:'#444',edgeLabelBackground:'#111'}});
      }
      const id='mermaid-'+Math.random().toString(36).slice(2);
      const{svg}=await window.__mermaid__.render(id,this._code);
      this._svg=svg;
    }catch(e){this._error=e.message;}
  }
  _open(){this._expanded=true;}
  _close(e){if(e.target===e.currentTarget||e.target.classList.contains('close-btn'))this._expanded=false;}
  render(){
    if(this._error)return html\`<div class="wrap"><pre class="error">\${this._error}</pre></div>\`;
    if(!this._svg)return html\`<div class="wrap"><div class="loading">Rendering diagram…</div></div>\`;
    return html\`<div class="wrap"><button class="expand-btn" @click=\${this._open} title="Expand diagram">\u{2922} Expand</button><div class="diagram" .innerHTML=\${this._svg}></div></div>\${this._expanded?html\`<div class="overlay" @click=\${this._close}><div class="modal"><button class="close-btn" @click=\${this._close}>✕ Close</button><div class="modal-diagram" .innerHTML=\${this._svg}></div></div></div>\`:nothing}\`;
  }
}
customElements.define('wc-mermaid',WcMermaid);

// ── WC-ENDPOINT ────────────────────────────────────────────────────────────
class WcEndpoint extends LitElement {
  static properties={method:{type:String},url:{type:String},description:{type:String},ref:{type:String},summary:{type:String},_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0}
    :host([theme="dark"]){--surface:#111;--surface2:#1a1a1a;--border:#2a2a2a;--text:#f0f0f0;--text2:#a0a0a0;--text3:#666;--code-text:#e2e8f0}
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#999;--code-text:#24292f}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;overflow:hidden}
    .url-bar{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);flex-wrap:wrap;gap:8px}
    .method{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;padding:3px 10px;border-radius:4px;flex-shrink:0;text-transform:uppercase}
    .GET{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
    .POST{background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid rgba(59,130,246,.3)}
    .PUT,.PATCH{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
    .DELETE{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3)}
    .url{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text,#f0f0f0);word-break:break-all}
    .desc{padding:10px 16px;font-family:'Inter',sans-serif;font-size:13px;color:var(--text2,#a0a0a0);border-bottom:1px solid var(--border,#2a2a2a)}
    .tabbar{display:flex;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);overflow-x:auto}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:8px 14px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text3,#666);cursor:pointer;white-space:nowrap;flex-shrink:0;margin-bottom:-1px;transition:all .15s}
    button.active{color:#4f98a3;border-bottom-color:#01696f}
    button:hover{color:#a0a0a0}
    .panel{display:none}.panel.active{display:block}
    pre{margin:0;padding:16px;overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7;color:var(--code-text,#e2e8f0)}
    @media(max-width:640px){.url{font-size:12px;}pre{font-size:11px;padding:12px 10px;}}
  \`;
  constructor(){super();this._active=0;}
  render(){
    const tabs=Array.from(this.querySelectorAll('wc-code-tab'));
    const fields=Array.from(this.querySelectorAll('wc-fields'));
    const responseFields=Array.from(this.querySelectorAll('wc-response-fields'));
    const m=(this.method||'GET').toUpperCase();
    const sections=[];
    if(fields.length)sections.push({label:'Parameters',type:'fields'});
    if(responseFields.length)sections.push({label:'Response',type:'response'});
    if(tabs.length)tabs.forEach((t,i)=>sections.push({label:t.label||t.getAttribute('label')||'Snippet '+(i+1),type:'tab',idx:i}));
    return html\`<div class="wrap">
      <div class="url-bar"><span class="method \${m}">\${m}</span><code class="url">\${this.url||''}</code></div>
      \${this.description||this.summary?html\`<div class="desc">\${this.description||this.summary}</div>\`:nothing}
      \${sections.length>1?html\`<div class="tabbar">\${sections.map((s,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${s.label}</button>\`)}</div>\`:nothing}
      <slot></slot>
      \${tabs.length&&sections.length>1?html\`\${tabs.map((t,i)=>{const si=sections.findIndex(s=>s.type==='tab'&&s.idx===i);return html\`<div class="panel \${si===this._active?'active':''}"><pre>\${t.textContent}</pre></div>\`})}\`:nothing}
      \${tabs.length&&sections.length<=1?html\`<div class="tabbar">\${tabs.map((t,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${t.label||t.getAttribute('label')||'Snippet '+(i+1)}</button>\`)}</div>\${tabs.map((t,i)=>html\`<div class="panel \${i===this._active?'active':''}"><pre>\${t.textContent}</pre></div>\`)}\`:nothing}
    </div>\`;
  }
}
customElements.define('wc-endpoint',WcEndpoint);

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
    :host([theme="light"]){--surface:#f8f8f8;--surface2:#f0f0f0;--surface3:#e8e8e8;--border:#e2e2e2;--text:#0f0f0f;--text2:#555;--text3:#999;--code-text:#24292f}
    .wrap{background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:10px;overflow:hidden;font-family:'Inter',sans-serif}
    .toolbar{display:flex;align-items:center;gap:8px;padding:12px 16px;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);flex-wrap:wrap}
    select{background:var(--surface3,#222);border:1px solid var(--border,#2a2a2a);border-radius:6px;padding:6px 10px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--text,#f0f0f0);cursor:pointer;flex-shrink:0}
    input[type=text]{flex:1;min-width:200px;background:var(--surface3,#222);border:1px solid var(--border,#2a2a2a);border-radius:6px;padding:7px 12px;font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text,#f0f0f0);outline:none}
    input[type=text]:focus{border-color:#01696f}
    button.send{background:#01696f;border:none;border-radius:6px;padding:7px 20px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:#fff;cursor:pointer;flex-shrink:0;transition:background .15s}
    button.send:hover{background:#4f98a3}
    button.send:disabled{opacity:.5;cursor:not-allowed}
    .extras{padding:12px 16px;border-bottom:1px solid var(--border,#2a2a2a);display:flex;flex-direction:column;gap:8px}
    label{font-size:12px;font-weight:600;color:var(--text3,#666);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:4px}
    textarea{width:100%;background:var(--surface3,#222);border:1px solid var(--border,#2a2a2a);border-radius:6px;padding:10px 12px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text,#f0f0f0);resize:vertical;outline:none;min-height:80px;box-sizing:border-box;line-height:1.5}
    textarea:focus{border-color:#01696f}
    .response{padding:16px}
    .status{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:10px}
    .status.ok{color:#34d399}
    .status.err{color:#f87171}
    .status.warn{color:#fbbf24}
    pre.res{background:var(--surface2,#1a1a1a);border:1px solid var(--border,#2a2a2a);border-radius:8px;padding:14px 16px;overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;color:var(--code-text,#e2e8f0);white-space:pre-wrap;word-break:break-word;max-height:400px;overflow-y:auto;margin:0}
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
`;
