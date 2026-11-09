import { englishLabels, englishElements, translate, initialLanguage, collectTranslations, applyTranslations } from './studio-i18n.js';
const $ = (id) => document.getElementById(id);
const labelNames = { start:'開始ボタン', stop:'停止ボタン', dialogTitle:'説明の見出し', grab:'スクロールの説明', aim:'ポインターの説明', click:'クリックの説明', rightClick:'右クリックの説明', confirm:'確認チェック', showPreview:'プレビューのチェック', previewPosition:'プレビュー位置', begin:'ダイアログの開始ボタン', close:'閉じるボタンの説明', cameraError:'カメラのエラー' };
const defaults = {
  elements: {
    title: {text:'手を動かすだけで、\nWebをもっと自由に。', x:8,y:14,width:78,font:'system-ui, sans-serif',size:42,weight:700,color:'#f1f5ff',background:'#101827',transparent:true,radius:0},
    description: {text:'カメラを使って、手のジェスチャーで操作できます。',x:8,y:48,width:78,font:'system-ui, sans-serif',size:16,weight:400,color:'#b7c8df',background:'#101827',transparent:true,radius:0},
    button: {text:'ハンド操作を開始',x:8,y:70,width:28,font:'system-ui, sans-serif',size:15,weight:600,color:'#101b31',background:'#c7d9ff',transparent:false,radius:12}
  },
  canvasBackground:'#101827',dialog:{background:'#ffffff',color:'#0f172a',font:'system-ui, sans-serif',size:15,radius:12},
  labels:{start:'ハンド操作を開始',stop:'ハンド操作を停止',dialogTitle:'手でこのページを操作する',grab:'親指と人差し指をつまんで手を動かすとスクロールします。',aim:'人差し指と中指を合わせるとポインターが動きます。',click:'ポインターを出したまま親指を合わせるとクリックします。保持するとドラッグになります。',rightClick:'反対の手を握ると、次のクリックが右クリックになります。',confirm:'操作説明を確認しました',showPreview:'カメラ映像を表示する',previewPosition:'カメラ映像の位置',begin:'開始',close:'閉じる',cameraError:'カメラを開始できませんでした。カメラの使用が許可されているか確認してください。'},
  options:{dominantHand:'right',previewPosition:'bottom-right',inferenceFps:30,cameraWidth:640,cameraHeight:480,scrollGain:2.2,showPreview:false,modifierEnabled:true,regionSelectEnabled:true,horizontal:true,skipConsent:false,autoStart:false,rememberSession:true}
};
let language = initialLanguage();
const defaultsFor = lang => { const result = structuredClone(defaults); if (lang === 'en') { result.labels = { ...englishLabels }; for (const [key, text] of Object.entries(englishElements)) result.elements[key].text = text; } return result; };
let state = defaultsFor(language);
let selected = 'title';
let view = 'page';
const elementFields = ['font','size','weight','color','element-background','transparent','x','y','width','radius'];
const optionFields = ['dominantHand','previewPosition','inferenceFps','cameraWidth','cameraHeight','scrollGain','showPreview','modifierEnabled','regionSelectEnabled','horizontal','skipConsent','autoStart','rememberSession'];
const numeric = new Set(['size','weight','x','y','width','radius','inferenceFps','cameraWidth','cameraHeight','scrollGain']);
const limits = {size:[12,72],x:[0,95],y:[0,95],width:[10,100],radius:[0,100],inferenceFps:[0,60],cameraWidth:[160,3840],cameraHeight:[120,2160],scrollGain:[0.1,10]};
function safeNumber(value,key,fallback){ const n=Number(value); if(!Number.isFinite(n)||value==='') return fallback; const lim=limits[key]; return lim?Math.min(lim[1],Math.max(lim[0],n)):n; }
function layoutStyle(el) { return {position:'absolute',left:`${el.x}%`,top:`${el.y}%`,width:`${el.width}%`,fontFamily:el.font,fontSize:`${el.size}px`,fontWeight:el.weight,color:el.color,backgroundColor:el.transparent?'transparent':el.background,borderRadius:`${el.radius}px`,whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.25}; }
function createLabelFields(){ const holder=$('label-fields'); for(const [key,name] of Object.entries(labelNames)){ const label=document.createElement('label'); label.textContent=name; const field=document.createElement(key==='grab'||key==='aim'||key==='click'||key==='rightClick'?'textarea':'input'); if(field.tagName==='TEXTAREA') field.rows=2; field.id=`label-${key}`; field.addEventListener('input',()=>{state.labels[key]=field.value;if(key==='start')state.elements.button.text=field.value;render();});label.append(field);holder.append(label); } }
function renderFields(){ const e=state.elements[selected]; $('selected').value=selected;$('element-text').value=e.text; for(const id of elementFields){const key=id==='element-background'?'background':id;const field=$(id); if(field.type==='checkbox')field.checked=e[key];else field.value=e[key];} $('size-value').textContent=`${e.size}px`; $('canvas-background').value=state.canvasBackground; for(const key of ['background','color','size','radius','font']) $('dialog-'+key).value=state.dialog[key]; for(const key of optionFields){const field=$(key);if(field.type==='checkbox')field.checked=state.options[key];else field.value=state.options[key];} for(const key of Object.keys(labelNames)) $('label-'+key).value=state.labels[key]; }
function generated(){
 const e=state.elements, o=state.options, d=state.dialog;
 const labels={...state.labels,start:e.button.text};
 const props={labels,dominantHand:o.dominantHand,modifierEnabled:o.modifierEnabled,regionSelectEnabled:o.regionSelectEnabled,showPreview:o.showPreview,previewPosition:o.previewPosition,skipConsent:o.skipConsent,autoStart:o.autoStart,rememberSession:o.rememberSession,inferenceFps:o.inferenceFps,camera:{width:o.cameraWidth,height:o.cameraHeight},scroll:{gain:o.scrollGain,horizontal:o.horizontal}};
 const button=e.button;
 const css=`.aircursor-builder .aircursor-btn { width: 100%; box-sizing: border-box; font-family: inherit !important; font-size: inherit !important; font-weight: inherit !important; color: inherit !important; background: inherit !important; border-radius: inherit !important; border: 0; padding: 13px 18px; white-space: pre-wrap; }\n.aircursor-dialog { background: ${d.background} !important; color: ${d.color} !important; font-family: ${d.font.replace(/[;{}<>]/g,'')} !important; font-size: ${d.size}px !important; border-radius: ${d.radius}px !important; }`;
 const dump=x=>JSON.stringify(x,null,2);
 return `import React from 'react';\nimport AirCursor, { ${language === 'ja' ? 'jaLabels' : 'enLabels'} } from 'air-cursor';\n\n// npm install air-cursor@2.0.0\nconst labels = { ...${language === 'ja' ? 'jaLabels' : 'enLabels'}, ...${dump(labels)} };\nconst options = ${dump({...props,labels:undefined})};\nconst titleStyle = ${dump(layoutStyle(e.title))};\nconst descriptionStyle = ${dump(layoutStyle(e.description))};\nconst buttonStyle = ${dump(layoutStyle(button))};\nconst componentCss = ${JSON.stringify(css)};\n\nexport default function AirCursorUI() {\n  return (\n    <section className="aircursor-builder" style={{ position: 'relative', width: '100%', aspectRatio: '8 / 5', minHeight: 300, overflow: 'hidden', background: ${JSON.stringify(state.canvasBackground)} }}>\n      <style>{componentCss}</style>\n      <h1 style={{ ...titleStyle, margin: 0 }}>${'{'}${JSON.stringify(e.title.text)}${'}'}</h1>\n      <p style={{ ...descriptionStyle, margin: 0 }}>${'{'}${JSON.stringify(e.description.text)}${'}'}</p>\n      <div style={buttonStyle}>\n        <AirCursor {...options} labels={labels}${o.regionSelectEnabled?' onRegionSelect={(rect) => console.log("選択範囲:", rect)}':''} />\n      </div>\n    </section>\n  );\n}\n`;
}
function render(){
 $('stage').style.backgroundColor=state.canvasBackground;
 for(const [key,e] of Object.entries(state.elements)){const node=document.querySelector(`[data-element="${key}"]`);Object.assign(node.style,layoutStyle(e));node.style.setProperty('--size',`${e.size}px`);node.classList.toggle('selected',key===selected&&view==='page');if(key==='button')node.querySelector('button').textContent=e.text;else node.textContent=e.text;}
 const d=state.dialog;const card=document.querySelector('.dialog-card');Object.assign(card.style,{backgroundColor:d.background,color:d.color,fontFamily:d.font,fontSize:`${d.size}px`,borderRadius:`${d.radius}px`});
 for(const key of ['dialogTitle','grab','aim','click','rightClick','confirm','showPreview','begin']) $('pv-'+key).textContent=state.labels[key];
 $('pv-rightClick').hidden=!state.options.modifierEnabled;
 const begin=$('pv-begin');Object.assign(begin.style,{backgroundColor:'#0f172a',color:'#f8fafc'});
 $('dialog-preview').hidden=view!=='dialog';$('view-page').setAttribute('aria-pressed',String(view==='page'));$('view-dialog').setAttribute('aria-pressed',String(view==='dialog'));
 $('preview-help').textContent=view==='page'?'要素をクリックして選択、ドラッグして移動':'説明ダイアログの表示イメージ（設定で省略できます）';
 $('code').textContent=generated();renderFields();
}
createLabelFields();
collectTranslations();
applyTranslations(language);
$('language').addEventListener('change', event => { const oldDefaults=defaultsFor(language); const next=event.target.value; const nextDefaults=defaultsFor(next); for(const key of Object.keys(state.elements)) if(state.elements[key].text===oldDefaults.elements[key].text) state.elements[key].text=nextDefaults.elements[key].text; for(const key of Object.keys(state.labels)) if(state.labels[key]===oldDefaults.labels[key]) state.labels[key]=nextDefaults.labels[key]; language=next; applyTranslations(language); $('copy-status').textContent=''; render(); });
document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===btn)));document.querySelectorAll('.tab-content').forEach(panel=>panel.hidden=panel.id!==`tab-${btn.dataset.tab}`);}));
$('selected').addEventListener('change',e=>{selected=e.target.value;render();});
$('element-text').addEventListener('input',e=>{state.elements[selected].text=e.target.value;if(selected==='button')state.labels.start=e.target.value;render();});
for(const id of elementFields){const field=$(id);field.addEventListener('input',()=>{const key=id==='element-background'?'background':id;const current=state.elements[selected];current[key]=field.type==='checkbox'?field.checked:numeric.has(key)?safeNumber(field.value,key,current[key]):field.value;render();});}
$('canvas-background').addEventListener('input',e=>{state.canvasBackground=e.target.value;render();});
for(const key of ['background','color','size','radius','font']) $('dialog-'+key).addEventListener('input',e=>{const n=Number(e.target.value);state.dialog[key]=key==='size'?Math.min(32,Math.max(12,n||12)):key==='radius'?Math.min(60,Math.max(0,n||0)):e.target.value;render();});
for(const key of optionFields){const field=$(key);field.addEventListener('input',()=>{state.options[key]=field.type==='checkbox'?field.checked:numeric.has(key)?safeNumber(field.value,key,state.options[key]):field.value;render();});}
for(const node of document.querySelectorAll('[data-element]')){node.addEventListener('pointerdown',event=>{if(view!=='page')return;selected=node.dataset.element;render();node.setPointerCapture(event.pointerId);const rect=$('stage').getBoundingClientRect(), startX=event.clientX,startY=event.clientY,origX=state.elements[selected].x,origY=state.elements[selected].y;const move=ev=>{const item=state.elements[selected];item.x=Math.max(0,Math.min(100-item.width,Math.round(origX+(ev.clientX-startX)/rect.width*100)));item.y=Math.max(0,Math.min(95,Math.round(origY+(ev.clientY-startY)/rect.height*100)));render();};const end=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',end);};node.addEventListener('pointermove',move);node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);});node.addEventListener('focus',()=>{selected=node.dataset.element;render();});}
$('view-page').addEventListener('click',()=>{view='page';render();});$('view-dialog').addEventListener('click',()=>{view='dialog';render();});
async function copyText(text){try{await navigator.clipboard.writeText(text);$('copy-status').textContent='コピーしました。';}catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();try{if(!document.execCommand('copy'))throw Error();$('copy-status').textContent='コピーしました。';}catch{$('copy-status').textContent='コピーできませんでした。コードを選択してコピーしてください。';}area.remove();}}
$('copy').addEventListener('click',()=>copyText(generated()));$('copy-top').addEventListener('click',()=>copyText(generated()));$('copy-install').addEventListener('click',()=>copyText('npm install air-cursor@2.0.0'));
$('reset').addEventListener('click',()=>{state=structuredClone(defaults);selected='title';view='page';render();$('copy-status').textContent='初期設定に戻しました。';});
render();
