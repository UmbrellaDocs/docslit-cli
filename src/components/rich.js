// Rich content components: wc-embed, wc-github-repo, wc-walkthrough (+ step / substep)

export default `
// ── WC-EMBED (iframe / video, responsive, lazy, privacy-friendly facade) ────
function _embedInfo(src){
  const s=String(src||'').trim();if(!s)return null;
  let m;
  if((m=/^(?:https?:)?\\/\\/(?:www\\.)?(?:youtube(?:-nocookie)?\\.com\\/(?:embed\\/|watch\\?v=|shorts\\/)|youtu\\.be\\/)([\\w-]{6,})/i.exec(s)))return {provider:'youtube',id:m[1]};
  if((m=/^(?:https?:)?\\/\\/(?:player\\.)?vimeo\\.com\\/(?:video\\/)?(\\d+)/i.exec(s)))return {provider:'vimeo',id:m[1]};
  if((m=/^(?:https?:)?\\/\\/(?:www\\.)?loom\\.com\\/(?:embed|share)\\/(\\w+)/i.exec(s)))return {provider:'loom',id:m[1]};
  if(/\\.(mp4|webm|ogv|mov|m4v)(?:[?#].*)?$/i.test(s))return {provider:'video'};
  return {provider:'generic'};
}
class WcEmbed extends LitElement {
  static properties={src:{type:String},title:{type:String},ratio:{type:String},height:{type:String},poster:{type:String},allow:{type:String},autoplay:{type:Boolean},loop:{type:Boolean},muted:{type:Boolean},controls:{type:String},_play:{type:Boolean,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 20px;min-width:0}
    .box{position:relative;width:100%;overflow:hidden;border-radius:var(--radius-lg,10px);background:var(--surface2,#1a1a1a);border:1px solid var(--border,#2a2a2a);box-sizing:border-box}
    iframe,video{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#000}
    .fixed iframe,.fixed video{position:static;height:100%}
    .facade{all:unset;position:absolute;inset:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;box-sizing:border-box;padding:16px;text-align:center;background-size:cover;background-position:center;font-family:var(--font-sans,'Inter',sans-serif);color:var(--text,#f0f0f0)}
    .facade:focus-visible{outline:3px solid var(--accent,#01696f);outline-offset:-3px}
    .play{width:64px;height:64px;border-radius:50%;background:var(--accent,#01696f);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(0,0,0,.35);transition:transform .15s}
    .facade:hover .play{transform:scale(1.06)}
    .play svg{width:26px;height:26px;margin-left:3px}
    .ttl{font-size:15px;font-weight:600;max-width:90%;text-shadow:0 1px 6px rgba(0,0,0,.5);color:var(--text,#f0f0f0)}
    .poster .ttl,.poster .note{color:#fff}
    .note{font-size:12px;color:var(--text3,#737373)}
    @media(prefers-reduced-motion:reduce){.play{transition:none}.facade:hover .play{transform:none}}
  \`;
  constructor(){super();this._play=false;}
  _ratio(){const r=String(this.ratio||'16/9').replace(':','/').trim();return /^[0-9.]+(\\s*\\/\\s*[0-9.]+)?$/.test(r)?r:'16/9';}
  _srcFor(info){
    const s=this.src;
    if(info.provider==='youtube')return 'https://www.youtube-nocookie.com/embed/'+info.id+'?autoplay=1&rel=0';
    if(info.provider==='vimeo')return 'https://player.vimeo.com/video/'+info.id+'?autoplay=1&dnt=1';
    if(info.provider==='loom')return 'https://www.loom.com/embed/'+info.id+'?autoplay=1';
    return s;
  }
  render(){
    const info=_embedInfo(this.src);if(!info)return nothing;
    const fixed=!!this.height;
    const boxStyle=fixed?'height:'+(/^\\d+$/.test(this.height)?this.height+'px':this.height):'aspect-ratio:'+this._ratio();
    const title=this.title||'Embedded content';
    if(info.provider==='video'){
      const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const auto=this.autoplay&&this.muted&&!reduce;
      return html\`<div class="box \${fixed?'fixed':''}" style=\${boxStyle}><video src=\${this.src} poster=\${this.poster||nothing} ?controls=\${this.controls!=='false'} ?autoplay=\${auto} ?muted=\${this.muted} ?loop=\${this.loop} playsinline preload="metadata" aria-label=\${title}></video></div>\`;
    }
    if(info.provider!=='generic'&&!this._play){
      const host=info.provider==='youtube'?'YouTube':info.provider==='vimeo'?'Vimeo':'Loom';
      return html\`<div class="box \${this.poster?'poster':''}" style=\${boxStyle+(this.poster?';background-image:url('+this.poster+');background-size:cover;background-position:center':'')}><button type="button" class="facade" style=\${this.poster?'background:linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.45))':''} @click=\${()=>{this._play=true;}} aria-label=\${'Play video: '+title}><span class="play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span><span class="ttl">\${this.title||'Play video'}</span><span class="note">Loads from \${host} when you press play</span></button></div>\`;
    }
    return html\`<div class="box \${fixed?'fixed':''}" style=\${boxStyle}><iframe src=\${this._srcFor(info)} title=\${title} loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow=\${this.allow||'accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'}></iframe></div>\`;
  }
}
customElements.define('wc-embed',WcEmbed);

// ── WC-GITHUB-REPO ─────────────────────────────────────────────────────────
class WcGithubRepo extends LitElement {
  static properties={repo:{type:String},variant:{type:String},description:{type:String},stars:{type:String},forks:{type:String},language:{type:String},live:{type:String},_data:{state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 16px;max-width:520px}
    a{display:flex;gap:14px;box-sizing:border-box;min-height:112px;padding:16px 18px;background:var(--surface,#111);border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,12px);text-decoration:none;color:inherit;box-shadow:0 2px 10px rgba(0,0,0,.12);transition:border-color .15s}
    :host([variant="flat"]) a{box-shadow:none}
    a:hover{border-color:var(--border2,#3a3a3a)}
    a:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:2px}
    .mark{width:28px;height:28px;flex-shrink:0;color:var(--text,#f0f0f0);display:flex}
    .mark ::slotted(span),.mark ::slotted(svg){display:inline-flex;width:28px;height:28px}
    .main{min-width:0;flex:1;display:flex;flex-direction:column;gap:6px;font-family:var(--font-sans,'Inter',sans-serif)}
    .name{font-size:15px;color:var(--text3,#737373);overflow-wrap:anywhere}
    .name b{color:var(--text,#f0f0f0);font-weight:700}
    .desc{font-size:13px;line-height:1.5;color:var(--text2,#a0a0a0);min-height:2.6em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .meta{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:var(--text3,#737373);margin-top:auto;min-height:18px}
    .meta span{display:inline-flex;align-items:center;gap:5px}
    .dot{width:10px;height:10px;border-radius:50%;background:var(--accent,#01696f)}
    .ph{display:inline-block;min-width:2.2em;color:var(--text3,#737373)}
    @media(max-width:640px){a{padding:14px}}
    @media(prefers-reduced-motion:reduce){a{transition:none}}
  \`;
  constructor(){super();this._data=null;}
  _parse(){
    const r=String(this.repo||'').trim().replace(/^https?:\\/\\/(?:www\\.)?github\\.com\\//i,'').replace(/\\.git$/,'');
    const m=/^([\\w.-]+)\\/([\\w.-]+)/.exec(r);return m?{owner:m[1],name:m[2]}:null;
  }
  connectedCallback(){super.connectedCallback();this._load();}
  async _load(){
    const p=this._parse();if(!p||this.live==='false')return;
    const key='docslit-gh:'+p.owner+'/'+p.name;
    try{const c=JSON.parse(sessionStorage.getItem(key)||'null');if(c&&Date.now()-c.t<3600000){this._data=c.d;return;}}catch(e){}
    try{
      const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),6000);
      const res=await fetch('https://api.github.com/repos/'+p.owner+'/'+p.name,{headers:{Accept:'application/vnd.github+json'},signal:ctl.signal});clearTimeout(to);
      if(!res.ok)return;const j=await res.json();
      const d={description:j.description,stars:j.stargazers_count,forks:j.forks_count,language:j.language};
      this._data=d;try{sessionStorage.setItem(key,JSON.stringify({t:Date.now(),d}));}catch(e){}
    }catch(e){/* offline or rate limited: keep the static card */}
  }
  _n(v){const n=Number(v);if(!isFinite(n))return v;return n>=1000?(n/1000).toFixed(n>=10000?0:1).replace('.0','')+'k':String(n);}
  render(){
    const p=this._parse();if(!p)return nothing;
    const d=this._data||{};
    const desc=this.description||d.description||'';
    const stars=this.stars||d.stars;const forks=this.forks||d.forks;const lang=this.language||d.language;
    const live=this.live!=='false';
    return html\`<a href=\${'https://github.com/'+p.owner+'/'+p.name} target="_blank" rel="noopener noreferrer"><span class="mark" aria-hidden="true"><slot name="icon"></slot></span><span class="main"><span class="name">\${p.owner} / <b>\${p.name}</b></span><span class="desc">\${desc||nothing}</span><span class="meta">\${lang?html\`<span><i class="dot"></i>\${lang}</span>\`:nothing}\${(stars!==undefined&&stars!=='')?html\`<span aria-label=\${stars+' stars'}>★ \${this._n(stars)}</span>\`:(live?html\`<span class="ph" aria-hidden="true">★ …</span>\`:nothing)}\${(forks!==undefined&&forks!=='')?html\`<span aria-label=\${forks+' forks'}>⑂ \${this._n(forks)}</span>\`:nothing}</span></span></a>\`;
  }
}
customElements.define('wc-github-repo',WcGithubRepo);

// ── WC-WALKTHROUGH ─────────────────────────────────────────────────────────
// Prose steps on the left, a sticky code panel on the right that follows the reader's scroll.
// Files are <div class="wt-file" slot="files"> blocks created at build time from the fenced code inside the element.
function _wtSpec(str){
  const out=new Set();
  String(str||'').split(',').forEach(part=>{
    const m=/^\\s*(\\d+)\\s*(?:-\\s*(\\d+))?\\s*$/.exec(part);if(!m)return;
    const a=+m[1],b=m[2]?+m[2]:a;for(let i=Math.min(a,b);i<=Math.max(a,b)&&i<5000;i++)out.add(i);
  });
  return out;
}
class WcWalkthroughStep extends LitElement {
  static properties={title:{type:String},description:{type:String},file:{type:String},focus:{type:String},highlight:{type:String},startLine:{type:String,attribute:'start-line'}};
  static styles=css\`
    :host{display:block;padding:0 0 36px;transition:opacity .25s}
    .row{display:flex;gap:14px;align-items:flex-start}
    .mark{width:30px;height:30px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--accent-dim,rgba(1,105,111,.15));border:1px solid var(--accent,#01696f);color:var(--accent-light,#4f98a3);font:700 13px/1 var(--font-sans,'Inter',sans-serif)}
    :host([active]) .mark,:host([has-active]) .mark{background:var(--accent,#01696f);color:#fff}
    .c{flex:1;min-width:0;font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;line-height:1.7;color:var(--text2,#a0a0a0)}
    .t{font-size:16px;font-weight:700;color:var(--text,#f0f0f0);line-height:1.4;margin:3px 0 4px}
    .d{margin:0 0 6px;color:var(--text3,#737373)}
    ::slotted(:last-child){margin-bottom:0}
    @media(prefers-reduced-motion:reduce){:host{transition:none}}
  \`;
  render(){
    const sibs=this.parentElement?Array.from(this.parentElement.children).filter(c=>c.tagName==='WC-WALKTHROUGH-STEP'):[];
    const n=sibs.indexOf(this)+1;
    return html\`<div class="row"><span class="mark" aria-hidden="true">\${n||''}</span><div class="c">\${this.title?html\`<div class="t" role="heading" aria-level="3">\${unsafeHTML(_titleMd(this.title))}</div>\`:nothing}\${this.description?html\`<p class="d">\${unsafeHTML(_titleMd(this.description))}</p>\`:nothing}<slot></slot></div></div>\`;
  }
}
customElements.define('wc-walkthrough-step',WcWalkthroughStep);

class WcWalkthroughSubstep extends LitElement {
  static properties={title:{type:String},file:{type:String},focus:{type:String},highlight:{type:String},startLine:{type:String,attribute:'start-line'}};
  static styles=css\`
    :host{display:block;margin:10px 0 0;padding:6px 0 6px 12px;border-left:2px solid var(--border,#2a2a2a);transition:opacity .25s,border-color .2s}
    :host([active]){border-left-color:var(--accent,#01696f)}
    .t{font-weight:700;color:var(--text,#f0f0f0);font-size:14px;margin-bottom:2px}
    .c{font-family:var(--font-sans,'Inter',sans-serif);font-size:14px;line-height:1.7;color:var(--text2,#a0a0a0)}
    ::slotted(:last-child){margin-bottom:0}
    ::slotted(p){margin:0 0 6px}
    @media(prefers-reduced-motion:reduce){:host{transition:none}}
  \`;
  render(){return html\`<div class="c">\${this.title?html\`<div class="t">\${unsafeHTML(_titleMd(this.title))}</div>\`:nothing}<slot></slot></div>\`;}
}
customElements.define('wc-walkthrough-substep',WcWalkthroughSubstep);

class WcWalkthrough extends LitElement {
  static properties={layout:{type:String},panelHeight:{type:String,attribute:'panel-height'},dim:{type:String},_file:{type:Number,state:true}};
  static styles=css\`
    :host{display:block;margin:0 0 24px;min-width:0}
    .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px;align-items:start}
    :host([layout="wide"]) .grid{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
    .panel{position:sticky;top:calc(var(--chrome-h,60px) + 16px);height:var(--wt-h,min(70vh,34rem));display:flex;flex-direction:column;border:1px solid var(--border,#2a2a2a);border-radius:var(--radius-lg,10px);overflow:hidden;background:var(--code-bg,#161616)}
    .tabs{display:flex;gap:2px;padding:0 8px;border-bottom:1px solid var(--border,#2a2a2a);background:var(--surface2,#1a1a1a);overflow-x:auto;scrollbar-width:none;flex-shrink:0}
    .tabs button{background:none;border:none;border-bottom:2px solid transparent;padding:9px 12px;font:500 12px/1 var(--font-mono,'JetBrains Mono',monospace);color:var(--text3,#737373);cursor:pointer;white-space:nowrap}
    .tabs button[aria-selected="true"]{color:var(--text,#f0f0f0);border-bottom-color:var(--accent,#01696f)}
    .tabs button:hover{color:var(--text,#f0f0f0)}
    .tabs button:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:-2px}
    .code{position:relative;flex:1;overflow:auto;outline:none}
    .code:focus-visible{outline:2px solid var(--accent,#01696f);outline-offset:-2px}
    @media(max-width:900px){.grid{display:block}.panel{display:none}}
  \`;
  constructor(){super();this._file=0;this._idx=-1;this._raf=0;this._manual=false;this._onScroll=()=>{if(this._raf)return;this._raf=requestAnimationFrame(()=>{this._raf=0;this._pick();});};}
  _files(){return Array.from(this.querySelectorAll(':scope > .wt-file'));}
  _targets(){return Array.from(this.querySelectorAll('wc-walkthrough-step, wc-walkthrough-substep'));}
  connectedCallback(){super.connectedCallback();window.addEventListener('scroll',this._onScroll,{passive:true,capture:true});window.addEventListener('resize',this._onScroll);}
  disconnectedCallback(){super.disconnectedCallback();window.removeEventListener('scroll',this._onScroll,true);window.removeEventListener('resize',this._onScroll);}
  firstUpdated(){
    if(this.panelHeight)this.style.setProperty('--wt-h',this.panelHeight);
    this._build();this._pick(true);
  }
  _fileIndex(spec,fallback){
    const files=this._files();if(spec===undefined||spec===null||spec==='')return fallback;
    if(/^\\d+$/.test(spec)&&files[+spec])return +spec;
    const i=files.findIndex(f=>f.getAttribute('data-name')===spec);return i>=0?i:fallback;
  }
  _build(){
    // resolve each target's file (inherit from the previous target / parent step) and add inline code for narrow screens
    let cur=0;this._resolved=[];
    for(const t of this._targets()){
      const parentStep=t.tagName==='WC-WALKTHROUGH-SUBSTEP'?t.closest('wc-walkthrough-step'):null;
      const inherit=parentStep&&parentStep.getAttribute('file')?this._fileIndex(parentStep.getAttribute('file'),cur):cur;
      const fi=this._fileIndex(t.getAttribute('file'),inherit);cur=fi;
      const focus=_wtSpec(t.getAttribute('focus'));const hl=_wtSpec(t.getAttribute('highlight'));
      this._resolved.push({el:t,file:fi,focus,hl,start:+(t.getAttribute('start-line')||0)||0});
      this._inline(t,fi,focus,hl);
    }
  }
  _inline(t,fi,focus,hl){
    const f=this._files()[fi];if(!f||t.querySelector(':scope > .wt-inline'))return;
    const lines=Array.from(f.querySelectorAll('.wl'));const marks=new Set([...focus,...hl]);
    let from=1,to=lines.length;
    if(marks.size){from=Math.max(1,Math.min(...marks));to=Math.min(lines.length,Math.max(...marks));}
    if(to-from>24)to=from+24;
    const box=document.createElement('div');box.className='wt-inline';box.setAttribute('role','group');box.setAttribute('aria-label',(f.getAttribute('data-name')||'code')+' lines '+from+'-'+to);
    box.innerHTML='<div class="wt-inline-name">'+(f.getAttribute('data-name')||'')+'</div><pre>'+lines.slice(from-1,to).map(l=>l.outerHTML).join('')+'</pre>';
    t.appendChild(box);
  }
  _pick(force){
    if(!this._resolved||!this._resolved.length)return;
    const y=innerHeight*0.4;let idx=0;
    this._resolved.forEach((r,i)=>{if(r.el.getBoundingClientRect().top<=y)idx=i;});
    if(idx!==this._idx||force){this._idx=idx;this._manual=false;this._apply(idx);}
  }
  _apply(i){
    const r=this._resolved[i];const files=this._files();if(!r)return;
    this._file=r.file;
    const dimOn=this.dim!=='false';
    this._resolved.forEach((x,j)=>{x.el.toggleAttribute('active',j===i);if(x.el.tagName==='WC-WALKTHROUGH-STEP'){const own=j===i||this._resolved.some((y,k)=>k===i&&y.el.closest('wc-walkthrough-step')===x.el);x.el.toggleAttribute('has-active',own);x.el.style.opacity=(dimOn&&!own&&!x.el.querySelector('[active]'))?'.45':'';}});
    files.forEach((f,fi)=>{f.hidden=fi!==r.file;});
    const f=files[r.file];if(!f)return;
    const lines=Array.from(f.querySelectorAll('.wl'));
    lines.forEach((l,k)=>{const n=k+1;l.classList.toggle('dim',r.focus.size>0&&!r.focus.has(n));l.classList.toggle('hl',r.hl.has(n));});
    const first=r.start||Math.min(...[...r.focus,...r.hl,Infinity]);
    const code=this.renderRoot.querySelector('.code');
    if(code&&isFinite(first)&&lines[first-1]){
      const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const top=lines[first-1].getBoundingClientRect().top-code.getBoundingClientRect().top+code.scrollTop-36;
      code.scrollTo({top:Math.max(0,top),behavior:reduce?'auto':'smooth'});
    }else if(code)code.scrollTo({top:0});
  }
  _tab(i){this._file=i;this._manual=true;const files=this._files();files.forEach((f,fi)=>{f.hidden=fi!==i;});}
  _tabKey(e,i,n){let k=i;if(e.key==='ArrowRight')k=(i+1)%n;else if(e.key==='ArrowLeft')k=(i-1+n)%n;else return;e.preventDefault();this._tab(k);this.updateComplete.then(()=>this.renderRoot.querySelectorAll('[role=tab]')[k]?.focus());}
  render(){
    const files=this._files();
    return html\`<div class="grid"><div class="prose"><slot></slot></div><div class="panel"><div class="tabs" role="tablist" aria-label="Files">\${files.map((f,i)=>html\`<button role="tab" type="button" aria-selected=\${i===this._file?'true':'false'} tabindex=\${i===this._file?0:-1} @click=\${()=>this._tab(i)} @keydown=\${(e)=>this._tabKey(e,i,files.length)}>\${f.getAttribute('data-name')||'file '+(i+1)}</button>\`)}</div><div class="code" tabindex="0" role="region" aria-label="Code for the current step"><slot name="files"></slot></div></div></div>\`;
  }
}
customElements.define('wc-walkthrough',WcWalkthrough);
`;
