// Accounts, groups and daily price history, stored in SQLite (node:sqlite, built in to Node 22.13+).
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');
const dir=process.env.DATA_DIR||__dirname;fs.mkdirSync(dir,{recursive:true});
const db=new DatabaseSync(process.env.DB||path.join(dir,'crateplay.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(name TEXT PRIMARY KEY,salt TEXT,hash TEXT,state TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,name TEXT,created INTEGER);
CREATE TABLE IF NOT EXISTS groups(code TEXT PRIMARY KEY,name TEXT);
CREATE TABLE IF NOT EXISTS members(code TEXT,name TEXT,PRIMARY KEY(code,name));
CREATE TABLE IF NOT EXISTS prices(id INTEGER,day TEXT,price REAL,PRIMARY KEY(id,day));`);
const get=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
const DAY=864e5;run('DELETE FROM sessions WHERE created<?',Date.now()-30*DAY);
const hash=(p,s)=>crypto.scryptSync(p,s,32);
const body=q=>new Promise(res=>{let b='';q.on('data',c=>{b+=c;if(b.length>2e4)q.destroy()});q.on('end',()=>{try{res(JSON.parse(b||'{}'))}catch(e){res({})}})});
const send=(r,c,o)=>{r.statusCode=c;r.setHeader('content-type','application/json');r.end(JSON.stringify(o))};
const tok=q=>(q.headers.authorization||'').replace('Bearer ','');
const ids=a=>Array.isArray(a)?[...new Set(a.map(Number).filter(n=>n>0&&n<1000))].slice(0,200):[];
const state=n=>{const u=get('SELECT state FROM users WHERE name=?',n);return u?JSON.parse(u.state):{cart:[],lib:[],wish:[]}};
const hits=new Map(); // simple login rate limit: 10 tries per 15 minutes per IP
const limited=k=>{const now=Date.now(),h=hits.get(k)||{n:0,t:now};if(now-h.t>9e5){h.n=0;h.t=now}h.n++;hits.set(k,h);return h.n>10};
const login=(r,name)=>{const t=crypto.randomBytes(16).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',t,name,Date.now());send(r,200,{token:t,name,state:state(name)})};
function record(data){
  const d=new Date().toISOString().slice(0,10);
  for(const [id,x] of Object.entries(data))if(x.p!=null)run('INSERT INTO prices VALUES(?,?,?) ON CONFLICT(id,day) DO UPDATE SET price=excluded.price',+id,d,x.p);
}
async function handle(q,r){
  const u=q.url.split('?')[0];
  if(!u.startsWith('/api/')||u=='/api/games')return false;
  const b=q.method=='POST'||q.method=='PUT'?await body(q):{};
  const s=get('SELECT name FROM sessions WHERE token=?',tok(q)),me=s&&s.name,ip=q.socket.remoteAddress;
  if(u.startsWith('/api/history/'))return send(r,200,all('SELECT day,price FROM prices WHERE id=? ORDER BY day',+u.split('/').pop()).map(x=>[x.day,x.price])),true;
  if(u=='/api/signup'||u=='/api/login'){
    if(limited(ip))return send(r,429,{error:'Too many attempts. Try again in 15 minutes.'}),true;
    const n=String(b.username||'').toLowerCase(),p=String(b.password||'');
    if(u=='/api/signup'){
      if(!/^[a-z0-9_]{3,20}$/.test(n))return send(r,400,{error:'Username: 3-20 letters, numbers or _'}),true;
      if(p.length<6||p.length>100)return send(r,400,{error:'Password must be 6+ characters'}),true;
      if(get('SELECT 1 x FROM users WHERE name=?',n))return send(r,409,{error:'Username taken'}),true;
      const salt=crypto.randomBytes(16).toString('hex');
      run('INSERT INTO users VALUES(?,?,?,?)',n,salt,hash(p,salt).toString('hex'),JSON.stringify({cart:[],lib:[],wish:[]}));
      return login(r,n),true;
    }
    const x=get('SELECT * FROM users WHERE name=?',n);
    if(x&&crypto.timingSafeEqual(hash(p,x.salt),Buffer.from(x.hash,'hex'))){hits.delete(ip);return login(r,n),true}
    return send(r,401,{error:'Wrong username or password'}),true;
  }
  if(!me)return send(r,401,{error:'Sign in first'}),true;
  if(u=='/api/logout'){run('DELETE FROM sessions WHERE token=?',tok(q));return send(r,200,{}),true}
  if(u=='/api/me')return send(r,200,{name:me,state:state(me)}),true;
  if(u=='/api/state'){run('UPDATE users SET state=? WHERE name=?',JSON.stringify({cart:ids(b.cart),lib:ids(b.lib),wish:ids(b.wish)}),me);return send(r,200,{}),true}
  if(u=='/api/groups'&&q.method=='POST'){
    const name=String(b.name||'').trim().slice(0,30);if(!name)return send(r,400,{error:'Give the group a name'}),true;
    let code;do code=crypto.randomBytes(4).toString('hex').slice(0,5).toUpperCase();while(get('SELECT 1 x FROM groups WHERE code=?',code));
    run('INSERT INTO groups VALUES(?,?)',code,name);run('INSERT INTO members VALUES(?,?)',code,me);return send(r,200,{code}),true;
  }
  if(u=='/api/groups/join'){
    const code=String(b.code||'').toUpperCase();
    if(!get('SELECT 1 x FROM groups WHERE code=?',code))return send(r,404,{error:'No group with that code'}),true;
    if(get('SELECT COUNT(*) c FROM members WHERE code=?',code).c>=20)return send(r,400,{error:'Group is full'}),true;
    run('INSERT OR IGNORE INTO members VALUES(?,?)',code,me);return send(r,200,{}),true;
  }
  if(u=='/api/groups')return send(r,200,all('SELECT g.code,g.name FROM groups g JOIN members m ON m.code=g.code WHERE m.name=?',me).map(g=>({...g,members:all('SELECT name FROM members WHERE code=?',g.code).map(m=>({name:m.name,wish:state(m.name).wish}))}))),true;
  return send(r,404,{error:'Not found'}),true;
}
handle.record=record;module.exports=handle;
