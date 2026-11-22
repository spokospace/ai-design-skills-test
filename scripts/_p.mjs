import { chromium } from 'playwright';
const B='http://127.0.0.1:4471';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:430,height:900},deviceScaleFactor:2});
const top=(id)=>p.evaluate((id)=>{const e=document.getElementById(id); return e? e.getBoundingClientRect().top+scrollY-24 : null},id);
// Shoot a range by scrolling the real viewport and stitching is overkill: resize the viewport to the range instead,
// so everything in it is on screen (the site fades and skips painting images that are off screen).
async function shot(name,url,fromId,toId,extra=0){
  await p.setViewportSize({width:430,height:900});
  await p.goto(B+url,{waitUntil:'networkidle'});
  await p.evaluate(()=>document.querySelectorAll('[class*="consent"],[id*="consent"],[class*="cookie"]').forEach(e=>e.remove()));
  const y0=fromId? await top(fromId):0; const y1=(toId? await top(toId): await p.evaluate(()=>document.documentElement.scrollHeight))+extra;
  const h=Math.min(Math.round(y1-y0), 7000);
  await p.setViewportSize({width:430,height:h});
  await p.evaluate(y=>scrollTo(0,y),y0); await p.waitForTimeout(1200);
  await p.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r})))}); await p.waitForTimeout(600);
  await p.screenshot({path:'C:/Users/spoko/AppData/Local/Temp/claude/135fd2c27e8a1a86/0cd72b7a-da38-4934-94ec-b7f9245e9a80/scratchpad/'+name+'.jpg',type:'jpeg',quality:72});
  console.log(name,h);
}
const T='/pl/blog/skille-projektowe-dla-agentow-ai-test/';
await shot('test-skilli-1',T,null,'test-jedna-spółdzielnia-piętnaście-stron');
await shot('test-skilli-2',T,'test-jedna-spółdzielnia-piętnaście-stron','impeccable-decyzje-podjęte-dla-tego-briefu');
await shot('test-skilli-3',T,'impeccable-decyzje-podjęte-dla-tego-briefu','czas-tokeny-i-waga');
await shot('test-skilli-4',T,'czas-tokeny-i-waga','faq-heading',-20);
const D='/pl/blog/projektowanie-stron-i-aplikacji-z-ai/';
await shot('projektowanie-1-poczatek',D,null,'zaczynam-od-opisu-i-obrazków');
await shot('projektowanie-2-nowa-sekcja',D,'strona-w-pięć-minut-co-powstaje-z-jednego-promptu','co-z-tego-ma-klient');
await shot('trendy-sekcja-o-skillach','/pl/blog/nowoczesna-strona-internetowa-trendy/','skille-frontendowe-dla-ai--jak-nauczyć-agenta-lepiej-projektować-interfejsy','nawigacja--ewolucja-menu',140);
await b.close();
