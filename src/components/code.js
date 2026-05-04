// Code components: wc-code-block, wc-code-group, wc-code-tab

export default `
// ── WC-CODE-BLOCK ──────────────────────────────────────────────────────────
class WcCodeBlock extends LitElement {
  static properties={language:{type:String},filename:{type:String}};
  static styles=css\`
    :host{display:block;margin:16px 0;width:100%;box-sizing:border-box;max-width:100%}
    .wrap{background:#161616;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden;width:100%;box-sizing:border-box}
    .header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#111;border-bottom:1px solid #2a2a2a;gap:8px;flex-wrap:wrap;width:100%;box-sizing:border-box}
    .filename{font-family:'JetBrains Mono',monospace;font-size:12px;color:#666;word-break:break-all;flex:1;min-width:0}
    .lang{font-size:11px;color:#444;font-family:'JetBrains Mono',monospace;white-space:nowrap;flex-shrink:0}
    pre{margin:0;padding:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;color:#e2e8f0;width:100%;box-sizing:border-box;max-width:100%}
    @media(max-width:640px){.header{padding:8px 12px;}.filename{font-size:11px;}.lang{font-size:10px;}pre{padding:10px 8px;font-size:12px;line-height:1.6;}}
  \`;
  render(){return html\`<div class="wrap">\${(this.filename||this.language)?html\`<div class="header"><span class="filename">\${this.filename||''}</span><span class="lang">\${this.language||''}</span></div>\`:nothing}<pre><slot></slot></pre></div>\`;}
}
customElements.define('wc-code-block',WcCodeBlock);

// ── WC-CODE-GROUP / WC-CODE-TAB ────────────────────────────────────────────
class WcCodeGroup extends LitElement {
  static properties={_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:16px 0;min-width:0;background:#161616;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden}
    .tabbar{display:flex;background:#111;border-bottom:1px solid #2a2a2a;overflow-x:auto;-webkit-overflow-scrolling:touch;gap:0}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:9px 16px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;color:#555;cursor:pointer;white-space:nowrap;flex-shrink:0;margin-bottom:-1px;transition:all .15s}
    button.active{color:#4f98a3;border-bottom-color:#01696f;background:#161616}
    button:hover{color:#a0a0a0}
    .panel{display:none}.panel.active{display:block}
    pre{margin:0;padding:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;color:#e2e8f0;max-width:100%;box-sizing:border-box}
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
