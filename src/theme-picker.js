// Floating "Theme" control: try every theme x palette x mode on the real content. Rendered only in the dev
// server with `docslit dev --theme-picker`, or in a build when docslit.json sets "themePicker": true.
// It only switches html[data-theme-name] / html[data-theme] and the light/dark class; all variants are
// already in the stylesheet (buildThemeCss({ all: true })). Choices persist in localStorage and in ?theme= / ?palette=.

import { listThemes, listPalettes } from './themes.js';

export function buildThemePickerHtml(resolved) {
  if (!resolved?.picker) return '';
  const data = {
    themes: listThemes().map((t) => ({ id: t.id, label: t.label, description: t.description, palette: t.palette })),
    palettes: listPalettes().map((p) => ({ id: p.id, label: p.label, accent: p.accent })),
    brand: resolved.isCustom ? { id: resolved.id, label: 'Your colours', accent: { light: resolved.light.accent, dark: resolved.dark.accent } } : null,
    initial: { theme: resolved.themeName || 'default', palette: resolved.id },
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `
<div class="dl-picker" id="dl-picker" data-print-hide>
  <button type="button" class="dl-picker-btn" id="dl-picker-btn" aria-expanded="false" aria-controls="dl-picker-panel">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8.1-9-8.1z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/></svg>
    <span>Theme</span>
  </button>
  <div class="dl-picker-panel" id="dl-picker-panel" role="dialog" aria-label="Theme picker" hidden>
    <div class="dl-picker-head"><strong>Theme</strong><button type="button" class="dl-picker-x" id="dl-picker-x" aria-label="Close theme picker">&times;</button></div>
    <div class="dl-picker-sec" id="dl-picker-themes" role="radiogroup" aria-label="Theme"></div>
    <div class="dl-picker-label">Palette</div>
    <div class="dl-picker-swatches" id="dl-picker-palettes" role="radiogroup" aria-label="Palette"></div>
    <div class="dl-picker-label">Mode</div>
    <div class="dl-picker-modes" id="dl-picker-modes" role="radiogroup" aria-label="Mode"></div>
    <div class="dl-picker-foot"><button type="button" class="dl-picker-copy" id="dl-picker-copy">Copy config</button><button type="button" class="dl-picker-reset" id="dl-picker-reset">Reset</button><span class="dl-picker-status" id="dl-picker-status" role="status" aria-live="polite"></span></div>
  </div>
</div>
<style>
.dl-picker { position: fixed; right: 16px; bottom: 16px; z-index: 900; font-family: var(--font-sans); font-size: 13px; }
.dl-picker-btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--border2); background: var(--surface); color: var(--text); font: 600 13px var(--font-sans); cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.28); }
.dl-picker-btn:hover { background: var(--surface2); }
.dl-picker-panel { position: absolute; right: 0; bottom: 52px; width: min(340px, calc(100vw - 32px)); max-height: min(78vh, 640px); overflow: auto; padding: 14px; border-radius: 14px; border: 1px solid var(--border2); background: var(--surface); color: var(--text); box-shadow: 0 24px 60px rgba(0,0,0,.4); }
.dl-picker-panel[hidden] { display: none; }
.dl-picker-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
.dl-picker-x { width: 28px; height: 28px; border: 0; background: transparent; color: var(--text2); font-size: 20px; line-height: 1; border-radius: 8px; cursor: pointer; }
.dl-picker-x:hover { background: var(--surface2); }
.dl-picker-sec { display: flex; flex-direction: column; gap: 4px; }
.dl-picker-opt { display: block; width: 100%; text-align: left; padding: 8px 10px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--text); font: inherit; cursor: pointer; }
.dl-picker-opt:hover { background: var(--surface2); }
.dl-picker-opt[aria-checked="true"] { border-color: var(--accent); background: var(--accent-dim); }
.dl-picker-opt b { display: block; font-size: 13px; font-weight: 650; }
.dl-picker-opt span { display: none; margin-top: 2px; font-size: 11.5px; line-height: 1.35; color: var(--text2); }
.dl-picker-opt[aria-checked="true"] span { display: block; }
.dl-picker-label { margin: 14px 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text3); }
.dl-picker-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.dl-sw { width: 30px; height: 30px; border-radius: 999px; border: 2px solid var(--border2); cursor: pointer; padding: 0; }
.dl-sw[aria-checked="true"] { outline: 2px solid var(--text); outline-offset: 2px; }
.dl-picker-modes { display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--surface2); }
.dl-picker-modes button { flex: 1; height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--text2); font: 600 12px var(--font-sans); cursor: pointer; text-transform: capitalize; }
.dl-picker-modes button[aria-checked="true"] { background: var(--bg); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.25); }
.dl-picker-foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.dl-picker-foot button { height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--border2); background: transparent; color: var(--text); font: 600 12px var(--font-sans); cursor: pointer; }
.dl-picker-foot button:hover { background: var(--surface2); }
.dl-picker-status { margin-left: auto; font-size: 11.5px; color: var(--text2); }
.dl-picker button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media print { .dl-picker { display: none; } }
</style>
<script>
(function(){
  var D=${json}, h=document.documentElement, $=function(i){return document.getElementById(i)};
  var st={theme:h.getAttribute('data-theme-name')||'default',palette:h.getAttribute('data-theme')||'teal'};
  function store(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function palettes(){var l=D.palettes.slice();if(D.brand)l.push(D.brand);return l}
  function apply(){
    if(st.theme==='default')h.removeAttribute('data-theme-name');else h.setAttribute('data-theme-name',st.theme);
    if(st.palette==='teal'&&st.theme==='default')h.removeAttribute('data-theme');else h.setAttribute('data-theme',st.palette);
    store('docslit-pick-theme',st.theme);store('docslit-pick-palette',st.palette);
    try{var u=new URL(location.href);u.searchParams.set('theme',st.theme);u.searchParams.set('palette',st.palette);history.replaceState(history.state,'',u)}catch(e){}
    render();
  }
  function render(){
    var tw=$('dl-picker-themes');tw.innerHTML='';
    D.themes.forEach(function(t){var b=document.createElement('button');b.type='button';b.className='dl-picker-opt';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(st.theme===t.id));
      b.innerHTML='<b></b><span></span>';b.firstChild.textContent=t.label;b.lastChild.textContent=t.description;
      b.onclick=function(){st.theme=t.id;st.palette=t.palette;apply()};tw.appendChild(b)});
    var pw=$('dl-picker-palettes');pw.innerHTML='';var light=h.classList.contains('light');
    palettes().forEach(function(p){var b=document.createElement('button');b.type='button';b.className='dl-sw';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(st.palette===p.id));b.setAttribute('aria-label',p.label);b.title=p.label;
      b.style.background=(light?p.accent.light:p.accent.dark);b.onclick=function(){st.palette=p.id;apply()};pw.appendChild(b)});
    var mw=$('dl-picker-modes');mw.innerHTML='';var cur=window.__themeMode||'system';
    ['system','light','dark'].forEach(function(m){var b=document.createElement('button');b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(cur===m));b.textContent=m;
      b.onclick=function(){window.__themeMode=m;store('docslit-theme',m);window.__applyThemeMode&&window.__applyThemeMode(m);render()};mw.appendChild(b)});
  }
  function toggle(open){var p=$('dl-picker-panel');p.hidden=!open;$('dl-picker-btn').setAttribute('aria-expanded',String(open));if(open){render();var f=p.querySelector('[aria-checked="true"]');f&&f.focus()}else $('dl-picker-btn').focus()}
  $('dl-picker-btn').onclick=function(){toggle($('dl-picker-panel').hidden)};
  $('dl-picker-x').onclick=function(){toggle(false)};
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('dl-picker-panel').hidden)toggle(false)});
  $('dl-picker-reset').onclick=function(){st.theme=D.initial.theme;st.palette=D.initial.palette;apply()};
  $('dl-picker-copy').onclick=function(){
    var sig=(D.themes.filter(function(t){return t.id===st.theme})[0]||{}).palette;
    var cfg=st.palette===sig||(st.theme==='default'&&st.palette==='teal')?'"theme": "'+st.theme+'"':'"theme": { "name": "'+st.theme+'", "palette": "'+st.palette+'" }';
    var done=function(){$('dl-picker-status').textContent='Copied'};
    try{navigator.clipboard.writeText(cfg).then(done,function(){$('dl-picker-status').textContent=cfg})}catch(e){$('dl-picker-status').textContent=cfg}
  };
  render();
})();
</script>`;
}
