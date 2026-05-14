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
    :host([theme="dark"]){--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--border:#e2e2e2;--text3:#999}
    .tabbar{display:flex;border-bottom:1px solid var(--border,#2a2a2a);gap:0;margin-bottom:24px;overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0;scrollbar-width:none}
    .tabbar::-webkit-scrollbar{display:none}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:10px 18px;font-family:'Inter',sans-serif;font-size:14px;font-weight:500;color:var(--text3,#666);cursor:pointer;margin-bottom:-1px;transition:all .15s;white-space:nowrap;flex-shrink:0}
    button.active{color:#4f98a3;border-bottom-color:#01696f}
    button:hover{color:#a0a0a0}
    button:focus-visible{outline:2px solid #01696f;outline-offset:-2px;border-radius:4px 4px 0 0}
    @media(max-width:640px){button{padding:8px 12px;font-size:12px;margin-bottom:0;border-bottom-width:3px;}}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
    @media print{.tabbar{display:none}}
  \`;
  constructor(){super();this._active=0;}
  _onKey(e,i,total){
    let next=i;
    if(e.key==='ArrowRight')next=Math.min(i+1,total-1);
    else if(e.key==='ArrowLeft')next=Math.max(i-1,0);
    else if(e.key==='Home')next=0;
    else if(e.key==='End')next=total-1;
    else return;
    e.preventDefault();this._active=next;
    this.updateComplete.then(()=>{const btn=this.shadowRoot.querySelectorAll('[role=tab]')[next];if(btn)btn.focus();});
  }
  render(){
    const tabs=Array.from(this.querySelectorAll('wc-tab'));
    tabs.forEach((t,i)=>t.toggleAttribute('active',i===this._active));
    return html\`<div class="tabbar" role="tablist">\${tabs.map((t,i)=>{const label=t.getAttribute('label')||'Tab '+(i+1);const active=i===this._active;return html\`<button role="tab" aria-selected=\${active} tabindex=\${active?0:-1} class="\${active?'active':''}" @click=\${()=>this._active=i} @keydown=\${(e)=>this._onKey(e,i,tabs.length)}>\${label}</button>\`;})}</div><div role="tabpanel"><slot></slot></div>\`;
  }
}
customElements.define('wc-tabs',WcTabs);

class WcTab extends LitElement {
  static properties={label:{type:String}};
  static styles=css\`:host{display:none}:host([active]){display:block;padding-top:4px}.print-label{display:none;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:#555;margin:0 0 8px;padding:4px 0;border-bottom:1px solid #ddd}@media print{:host{display:block !important;padding-top:4px;margin-bottom:12px}.print-label{display:block}}\`;
  render(){return html\`<div class="print-label">\${this.label||''}</div><slot></slot>\`;}
}
customElements.define('wc-tab',WcTab);

// ── WC-VIEW / WC-VIEW-PANEL ───────────────────────────────────────────────
class WcView extends LitElement {
  static properties={_active:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;min-width:0;border:1px solid var(--border,#2a2a2a);border-radius:10px;overflow:hidden}
    :host([theme="dark"]){--surface2:#1a1a1a;--border:#2a2a2a;--text3:#666}
    :host([theme="light"]){--surface2:#f0f0f0;--border:#e2e2e2;--text3:#999}
    .toolbar{display:flex;align-items:center;background:var(--surface2,#1a1a1a);border-bottom:1px solid var(--border,#2a2a2a);padding:0 16px;overflow-x:auto;-webkit-overflow-scrolling:touch;gap:2px;scrollbar-width:none}
    .toolbar::-webkit-scrollbar{display:none}
    button{background:none;border:none;border-bottom:2px solid transparent;padding:10px 14px;font-family:'Inter',sans-serif;font-size:13px;font-weight:500;color:var(--text3,#666);cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s;margin-bottom:-1px}
    button.active{color:#4f98a3;border-bottom-color:#01696f}
    button:hover{color:#a0a0a0}
    button:focus-visible{outline:2px solid #01696f;outline-offset:-2px;border-radius:4px 4px 0 0}
    @media(max-width:640px){button{padding:8px 10px;font-size:12px;}}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
  \`;
  constructor(){super();this._active=0;}
  _onKey(e,i,total){
    let next=i;
    if(e.key==='ArrowRight')next=Math.min(i+1,total-1);
    else if(e.key==='ArrowLeft')next=Math.max(i-1,0);
    else if(e.key==='Home')next=0;
    else if(e.key==='End')next=total-1;
    else return;
    e.preventDefault();this._active=next;
    this.updateComplete.then(()=>{const btn=this.shadowRoot.querySelectorAll('[role=tab]')[next];if(btn)btn.focus();});
  }
  render(){
    const panels=Array.from(this.querySelectorAll('wc-view-panel'));
    panels.forEach((p,i)=>p.toggleAttribute('active',i===this._active));
    return html\`<div class="toolbar" role="tablist">\${panels.map((p,i)=>{const label=p.getAttribute('label')||'Panel '+(i+1);const active=i===this._active;return html\`<button role="tab" aria-selected=\${active} tabindex=\${active?0:-1} class="\${active?'active':''}" @click=\${()=>this._active=i} @keydown=\${(e)=>this._onKey(e,i,panels.length)}>\${label}</button>\`;})}</div><div role="tabpanel"><slot></slot></div>\`;
  }
}
customElements.define('wc-view',WcView);

class WcViewPanel extends LitElement {
  static properties={label:{type:String}};
  static styles=css\`:host{display:none}:host([active]){display:block}.inner{padding:0 24px}\`;
  render(){return html\`<div class="inner"><slot></slot></div>\`;}
}
customElements.define('wc-view-panel',WcViewPanel);
`;
