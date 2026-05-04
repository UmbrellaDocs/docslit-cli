// Navigation components: wc-steps, wc-step, wc-tabs, wc-tab, wc-view, wc-view-panel

export default `
// ── WC-STEPS / WC-STEP ────────────────────────────────────────────────────
class WcSteps extends LitElement {
  static styles=css\`:host{display:block;margin:16px 0;counter-reset:wc-step}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-steps',WcSteps);

class WcStep extends LitElement {
  static properties={title:{type:String},n:{type:Number}};
  static styles=css\`
    :host{display:block;padding-left:52px;position:relative;margin-bottom:24px;width:100%;box-sizing:border-box}
    .num{position:absolute;left:0;top:2px;width:32px;height:32px;border-radius:50%;background:#01696f;color:#fff;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;counter-increment:wc-step}
    .title{font-family:'Inter',sans-serif;font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:6px;word-break:break-word}
    .body{font-family:'Inter',sans-serif;font-size:14px;color:#a0a0a0;line-height:1.7;width:100%;box-sizing:border-box;display:block;overflow:hidden;overflow-x:auto;-webkit-overflow-scrolling:touch}
    ::slotted(*){max-width:100% !important}
    ::slotted(pre){display:block !important;width:100% !important;box-sizing:border-box !important}
    ::slotted(div){width:100% !important;box-sizing:border-box !important}
    @media(max-width:640px){:host{padding-left:44px;margin-bottom:18px}.num{width:28px;height:28px;font-size:12px;top:1px;}.title{font-size:14px;margin-bottom:4px;color:#f5f5f5;font-weight:800;}.body{font-size:13px;}}
  \`;
  render(){
    let num=this.n;
    if(num===undefined){const parent=this.parentElement;if(parent){const siblings=Array.from(parent.children).filter(el=>el.tagName==='WC-STEP');num=siblings.indexOf(this)+1;}}
    return html\`<div class="num">\${num||''}</div>\${this.title?html\`<div class="title">\${this.title}</div>\`:nothing}<div class="body"><slot></slot></div>\`;
  }
}
customElements.define('wc-step',WcStep);

// ── WC-TABS / WC-TAB ──────────────────────────────────────────────────────
class WcTabs extends LitElement {
  static properties={_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:16px 0;min-width:0}
    .tabbar{display:flex;border-bottom:1px solid #2a2a2a;gap:0;margin-bottom:20px;overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:10px 18px;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;color:#666;cursor:pointer;margin-bottom:-1px;transition:all .15s;white-space:nowrap;flex-shrink:0}
    button.active{color:#4f98a3;border-bottom-color:#01696f}
    button:hover{color:#a0a0a0}
    .panel{display:none;min-width:0;overflow:hidden}.panel.active{display:block}
    ::slotted(*){max-width:100%;overflow-x:auto}
    @media(max-width:640px){button{padding:8px 12px;font-size:12px;margin-bottom:0;border-bottom-width:3px;}}
  \`;
  constructor(){super();this._active=0;}
  render(){
    const tabs=Array.from(this.querySelectorAll('wc-tab'));
    return html\`<div class="tabbar">\${tabs.map((t,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${t.label||'Tab '+(i+1)}</button>\`)}</div>\${tabs.map((t,i)=>html\`<div class="panel \${i===this._active?'active':''}">\${t.innerHTML}</div>\`)}\`;
  }
}
customElements.define('wc-tabs',WcTabs);

class WcTab extends LitElement {
  static properties={label:{type:String}};
  static styles=css\`:host{display:none}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-tab',WcTab);

// ── WC-VIEW / WC-VIEW-PANEL ───────────────────────────────────────────────
class WcView extends LitElement {
  static properties={_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:16px 0;min-width:0;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden}
    .toolbar{display:flex;align-items:center;background:#161616;border-bottom:1px solid #2a2a2a;padding:0 16px;overflow-x:auto;-webkit-overflow-scrolling:touch;gap:2px}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:10px 14px;font-family:'Inter',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s;margin-bottom:-1px}
    button.active{color:#4f98a3;border-bottom-color:#01696f}
    button:hover{color:#a0a0a0}
    .panel{display:none;padding:20px}.panel.active{display:block}
    ::slotted(*){max-width:100%;overflow-x:auto}
    @media(max-width:640px){button{padding:8px 10px;font-size:12px;}.panel{padding:14px}}
  \`;
  constructor(){super();this._active=0;}
  render(){
    const panels=Array.from(this.querySelectorAll('wc-view-panel'));
    return html\`<div class="toolbar">\${panels.map((p,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${p.label||'Panel '+(i+1)}</button>\`)}</div>\${panels.map((p,i)=>html\`<div class="panel \${i===this._active?'active':''}">\${p.innerHTML}</div>\`)}\`;
  }
}
customElements.define('wc-view',WcView);

class WcViewPanel extends LitElement {
  static properties={label:{type:String}};
  static styles=css\`:host{display:none}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-view-panel',WcViewPanel);
`;
