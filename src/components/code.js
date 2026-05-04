// Code components: wc-code-block, wc-code-group, wc-code-tab

export default `
// ── WC-CODE-BLOCK ──────────────────────────────────────────────────────────
class WcCodeBlock extends LitElement {
  static properties={language:{type:String},filename:{type:String},_code:{type:String,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;width:100%;box-sizing:border-box;max-width:100%}
    .wrap{background:#161616;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;width:100%;box-sizing:border-box}
    .header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#111;border-bottom:1px solid #2a2a2a;gap:8px;flex-wrap:wrap;width:100%;box-sizing:border-box}
    .filename{font-family:'JetBrains Mono',monospace;font-size:12px;color:#666;word-break:break-all;flex:1;min-width:0}
    .lang{font-size:11px;color:#444;font-family:'JetBrains Mono',monospace;white-space:nowrap;flex-shrink:0}
    .body{display:flex;overflow:hidden;width:100%;box-sizing:border-box}
    .line-numbers{flex-shrink:0;padding:20px 0 20px 16px;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;color:#3a3a3a;text-align:right;user-select:none;background:#161616}
    .line-numbers span{display:block}
    pre{margin:0;padding:20px;flex:1;overflow:hidden;white-space:pre-wrap;word-break:break-all;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;color:#e2e8f0;width:100%;box-sizing:border-box}
    @media(max-width:640px){.header{padding:8px 12px;}.filename{font-size:11px;}.lang{font-size:10px;}.line-numbers,.line-numbers span{font-size:12px;line-height:1.6;}pre{padding:10px 8px;font-size:12px;line-height:1.6;}}
  \`;
  // Capture raw innerHTML before the shadow DOM renders — this preserves any
  // child HTML tags (e.g. <wc-callout>) as literal source text rather than
  // letting the browser upgrade and render them as components.
  connectedCallback(){
    super.connectedCallback();
    if(this._code===undefined){
      this._code=this.innerHTML.trim();
      this.innerHTML='';
    }
  }
  render(){
    const code=this._code!==undefined?this._code:'';
    const count=(code.match(/\\n/g)||[]).length+1;
    const nums=Array.from({length:count},(_,i)=>html\`<span>\${i+1}</span>\`);
    return html\`<div class="wrap">
      \${(this.filename||this.language)?html\`<div class="header"><span class="filename">\${this.filename||''}</span><span class="lang">\${this.language||''}</span></div>\`:nothing}
      <div class="body"><div class="line-numbers">\${nums}</div><pre>\${code}</pre></div>
    </div>\`;
  }
}
customElements.define('wc-code-block',WcCodeBlock);

// ── WC-CODE-GROUP / WC-CODE-TAB ────────────────────────────────────────────
class WcCodeGroup extends LitElement {
  static properties={_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0;background:#161616;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden}
    .tabbar{display:flex;background:#111;border-bottom:1px solid #2a2a2a;overflow-x:auto;-webkit-overflow-scrolling:touch;gap:0;scrollbar-width:none}
    .tabbar::-webkit-scrollbar{display:none}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:9px 16px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;color:#555;cursor:pointer;white-space:nowrap;flex-shrink:0;margin-bottom:-1px;transition:all .15s}
    button.active{color:#4f98a3;border-bottom-color:#01696f;background:#161616}
    button:hover{color:#a0a0a0}
    .panel{display:none}.panel.active{display:block}
    pre{margin:0;padding:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;color:#e2e8f0;max-width:100%;box-sizing:border-box;scrollbar-width:none}
    pre::-webkit-scrollbar{display:none}
    @media(max-width:640px){button{padding:7px 12px;font-size:11px;}pre{padding:10px 8px;font-size:12px;}}
  \`;
  constructor(){super();this._active=0;}
  render(){
    const tabs=Array.from(this.querySelectorAll('wc-code-tab'));
    return html\`<div class="tabbar">\${tabs.map((t,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${t.label||t.getAttribute('label')||'Tab '+(i+1)}</button>\`)}</div>\${tabs.map((t,i)=>html\`<div class="panel \${i===this._active?'active':''}"><pre>\${t.textContent}</pre></div>\`)}\`;
  }
}
customElements.define('wc-code-group',WcCodeGroup);

class WcCodeTab extends LitElement {
  static properties={label:{type:String}};
  static styles=css\`:host{display:none}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-code-tab',WcCodeTab);
`;
