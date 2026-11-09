const catalog = [
  ['ja','Noto Sans JP'],['ja','Noto Serif JP'],['ja','Zen Kaku Gothic New'],['ja','Zen Maru Gothic'],['ja','M PLUS 1p'],['ja','M PLUS Rounded 1c'],['ja','Kosugi Maru'],['ja','Shippori Mincho'],['ja','BIZ UDPGothic'],['ja','Kaisei Decol'],
  ['en','Inter'],['en','Roboto'],['en','Lato'],['en','Montserrat'],['en','Poppins'],['en','Raleway'],['en','Playfair Display'],['en','Merriweather'],['en','DM Sans'],['en','Libre Baskerville']
];
const available = new Set(catalog.map(([, name])=>name));
const sampleText='AirCursor 日本語 Aa';
export function fontUrl(name, sample=false) {
  if(!available.has(name)) return null;
  const url = new URL('https://fonts.googleapis.com/css2');
  url.searchParams.append('family',name+(name==='Kosugi Maru'?':wght@400':':wght@400;700'));
  url.searchParams.set('display','swap');
  if(sample)url.searchParams.set('text',sampleText);
  return url.toString();
}
export function fontLinks(families) {
  return [...new Set(families)].map(name => fontUrl(name)).filter(Boolean);
}
export function loadSelectedFonts(families) {
  for(const url of fontLinks(families)) {
    if([...document.querySelectorAll('link[data-studio-font]')].some(link=>link.href===url)) continue;
    const link=document.createElement('link');link.rel='stylesheet';link.href=url;link.dataset.studioFont='';document.head.append(link);
  }
}
export function setupFontPicker(input, getLanguage) {
  const container=document.createElement('div');container.className='font-picker';
  const button=document.createElement('button');button.type='button';button.className='font-picker-toggle';button.setAttribute('aria-expanded','false');
  const menu=document.createElement('div');menu.className='font-picker-menu';menu.hidden=true;
  function languageText(){button.textContent=getLanguage()==='ja'?'フォント一覧から選ぶ ▾':'Choose a font ▾';button.setAttribute('aria-label',getLanguage()==='ja'?'フォント一覧を開く':'Open font list');}
  button.addEventListener('click',()=>{menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden){for(const [,name] of catalog){const url=fontUrl(name,true);if(![...document.querySelectorAll('link[data-studio-font-sample]')].some(link=>link.href===url)){const link=document.createElement('link');link.rel='stylesheet';link.href=url;link.dataset.studioFontSample='';document.head.append(link);}}}});
  for(const lang of ['ja','en']){
    const group=document.createElement('div');group.className='font-group';group.dataset.group=lang;menu.append(group);
    for(const [,name] of catalog.filter(entry=>entry[0]===lang)){
      const item=document.createElement('button');item.type='button';item.className='font-option';item.style.fontFamily=`"${name}", sans-serif`;
      const nameEl=document.createElement('span');nameEl.textContent=name;const sample=document.createElement('small');sample.textContent=lang==='ja'?'日本語 Aa':'The quick brown fox';item.append(nameEl,sample);
      item.addEventListener('click',()=>{input.value=name;input.dispatchEvent(new Event('input',{bubbles:true}));menu.hidden=true;button.setAttribute('aria-expanded','false');});group.append(item);

    }
  }
  container.append(button,menu);input.insertAdjacentElement('afterend',container);languageText();
  return ()=>{languageText();for(const group of menu.querySelectorAll('.font-group'))group.dataset.label=group.dataset.group==='ja'?(getLanguage()==='ja'?'日本語向け':'Japanese'):(getLanguage()==='ja'?'英語向け':'English');};
}
