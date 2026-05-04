// Navigation components: wc-steps, wc-step, wc-tabs, wc-tab, wc-view, wc-view-panel

export default `
// ── WC-STEPS / WC-STEP ────────────────────────────────────────────────────
class WcSteps extends LitElement {
  static styles=css\`:host{display:block;margin:0 0 16px;counter-reset:wc-step}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-steps',WcSteps);

class WcStep extends LitElement {
  static properties={title:{type:String},n:{type:Number}};
  static styles=css\`
    :host{display:block;margin-bottom:28px;width:100%;box-sizing:border-box}
    .row{display:flex;align-items:flex-start;gap:16px;width:100%}
    .num{width:32px;height:32px;border-radius:50%;background:#01696f;color:#fff;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
    .content{flex:1;min-width:0}
    .title{font-family:'Inter',sans-serif;font-size:16px;font-weight:700;color:var(--text,#e2e8f0);margin-bottom:6px;word-break:break-word}
    .body{font-family:'Inter',sans-serif;font-size:14px;color:var(--text2,#a0a0a0);line-height:1.7;width:100%;box-sizing:border-box}
    ::slotted(*){max-width:100% !important}
    @media(max-width:640px){.num{width:28px;height:28px;font-size:12px;}.title{font-size:14px;font-weight:800;}.body{font-size:13px;}}
  \`;
  render(){
    let num=this.n;
    if(num===undefined){const parent=this.parentElement;if(parent){const siblings=Array.from(parent.children).filter(el=>el.tagName==='WC-STEP');num=siblings.indexOf(this)+1;}}
    return html\`<div class="row"><div class="num">\${num||''}</div><div class="content">\${this.title?html\`<div class="title">\${this.title}</div>\`:nothing}<div class="body"><slot></slot></div></div></div>\`;
  }
}
customElements.define('wc-step',WcStep);

// ── WC-TABS / WC-TAB ──────────────────────────────────────────────────────
class WcTabs extends LitElement {
  static properties={_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0}
    .tabbar{display:flex;border-bottom:1px solid #2a2a2a;gap:0;margin-bottom:24px;overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0;scrollbar-width:none}
    .tabbar::-webkit-scrollbar{display:none}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:10px 18px;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;color:#666;cursor:pointer;margin-bottom:-1px;transition:all .15s;white-space:nowrap;flex-shrink:0}
    button.active{color:#4f98a3;border-bottom-color:#01696f}
    button:hover{color:#a0a0a0}
    @media(max-width:640px){button{padding:8px 12px;font-size:12px;margin-bottom:0;border-bottom-width:3px;}}
  \`;
  constructor(){super();this._active=0;}
  render(){
    const tabs=Array.from(this.querySelectorAll('wc-tab'));
    tabs.forEach((t,i)=>t.toggleAttribute('active',i===this._active));
    return html\`<div class="tabbar">\${tabs.map((t,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${t.getAttribute('label')||'Tab '+(i+1)}</button>\`)}</div><slot></slot>\`;
  }
}
customElements.define('wc-tabs',WcTabs);

class WcTab extends LitElement {
  static properties={label:{type:String}};
  static styles=css\`:host{display:none}:host([active]){display:block;padding-top:4px}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-tab',WcTab);

// ── WC-VIEW / WC-VIEW-PANEL ───────────────────────────────────────────────
class WcView extends LitElement {
  static properties={_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden}
    .toolbar{display:flex;align-items:center;background:#161616;border-bottom:1px solid #2a2a2a;padding:0 16px;overflow-x:auto;-webkit-overflow-scrolling:touch;gap:2px;scrollbar-width:none}
    .toolbar::-webkit-scrollbar{display:none}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:10px 14px;font-family:'Inter',sans-serif;font-size:13px;font-weight:500;color:#666;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s;margin-bottom:-1px}
    button.active{color:#4f98a3;border-bottom-color:#01696f}
    button:hover{color:#a0a0a0}
    @media(max-width:640px){button{padding:8px 10px;font-size:12px;}}
  \`;
  constructor(){super();this._active=0;}
  render(){
    const panels=Array.from(this.querySelectorAll('wc-view-panel'));
    panels.forEach((p,i)=>p.toggleAttribute('active',i===this._active));
    return html\`<div class="toolbar">\${panels.map((p,i)=>html\`<button class="\${i===this._active?'active':''}" @click=\${()=>this._active=i}>\${p.getAttribute('label')||'Panel '+(i+1)}</button>\`)}</div><slot></slot>\`;
  }
}
customElements.define('wc-view',WcView);

class WcViewPanel extends LitElement {
  static properties={label:{type:String}};
  static styles=css\`:host{display:none}:host([active]){display:block;padding:24px}\`;
  render(){return html\`<slot></slot>\`;}
}
customElements.define('wc-view-panel',WcViewPanel);
`;
