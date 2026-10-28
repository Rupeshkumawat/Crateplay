const extra=require('./store'),http=require('http'),fs=require('fs'),path=require('path');
// Crateplay game id -> Steam app id (games not on Steam are left out)
const APPS={1:1245620,2:1091500,3:292030,4:1174180,5:1145360,6:367520,7:413150,8:504230,9:620,10:570,11:730,14:1172470,15:230410,17:1097150,18:1551360,19:289070,20:105600};
const j=async u=>{const r=await fetch(u,{headers:{'user-agent':'crateplay-demo'}});if(!r.ok)throw new Error(r.status);return r.json()};
const clean=s=>(s||'').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
async function load(app){
  const out={};
  const [s,c]=await Promise.allSettled([
    j(`https://store.steampowered.com/api/appdetails?appids=${app}&cc=in&l=en`),
    j(`https://www.cheapshark.com/api/1.0/games?steamAppID=${app}`).then(a=>a[0]&&j(`https://www.cheapshark.com/api/1.0/games?id=${a[0].gameID}`))]);
  const d=s.value&&s.value[app]&&s.value[app].data;
  if(d){
    out.img=d.header_image;out.d=clean(d.short_description).slice(0,220);
    if(d.price_overview){out.p=d.price_overview.final/100;out.o=d.price_overview.initial/100}else if(d.is_free){out.p=0;out.o=0}
    const m=clean(d.pc_requirements&&d.pc_requirements.minimum);out.req=m.slice(0,300);
    const r=/(\d+)\s*GB\s*RAM/i.exec(m);if(r)out.ram=+r[1];
  }
  const g=c.value;
  if(g&&g.cheapestPriceEver){
    out.lowUsd=+g.cheapestPriceEver.price;out.lowDate=g.cheapestPriceEver.date*1000;
    const now=Math.min(...(g.deals||[]).map(x=>+x.price));if(isFinite(now))out.nowUsd=now;
  }
  return out;
}
let cache=null,at=0;
async function all(){
  if(cache&&Date.now()-at<36e5)return cache;
  const ids=Object.keys(APPS);
  const res=await Promise.all(ids.map(id=>load(APPS[id]).catch(()=>({}))));
  cache=Object.fromEntries(ids.map((id,i)=>[id,res[i]]));at=Date.now();extra.record(cache);return cache;
}
const PUB=path.join(__dirname,'public');
http.createServer(async(q,r)=>{
  if(await extra(q,r))return;
  if(q.url=='/api/games'){
    r.setHeader('content-type','application/json');
    try{r.end(JSON.stringify(await all()))}catch(e){r.statusCode=502;r.end('{}')}
    return;
  }
  const f=path.join(PUB,q.url=='/'?'index.html':decodeURIComponent(q.url.split('?')[0]));
  if(!f.startsWith(PUB)){r.statusCode=403;return r.end()}
  fs.readFile(f,(e,b)=>{
    if(e){r.statusCode=404;return r.end('Not found')}
    r.setHeader('content-type',f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');r.end(b);
  });
}).listen(process.env.PORT||3000,()=>console.log('Crateplay running at http://localhost:'+(process.env.PORT||3000)));
// refresh every 6 hours so daily price history builds up even with no visitors
setInterval(()=>{cache=null;all().catch(()=>{})},6*36e5);all().catch(()=>{});
