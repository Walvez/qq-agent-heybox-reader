import { cookieHeader } from './auth.js';
import { createHash } from 'node:crypto';
import { generateSignature } from './signature.js';
import { postId, normalize } from './parse.js';
export class Reader {
  constructor({fetch:fetcher=globalThis.fetch,now=Date.now}={}){this.fetch=fetcher;this.now=now;this.cache=new Map();this.pending=new Map();this.requests=[];this.blockedUntil=0;}
  clear(){this.cache.clear();this.pending.clear();this.requests=[];}
  async read(url,{cookie='',comments=false,page=1}={}){
    cookie=cookieHeader(cookie);
    const id=postId(url);if(!id)throw new Error('INVALID_URL');
    page=Number(page);if(!Number.isInteger(page)||page<1||page>5)throw new Error('INVALID_PAGE');
    if(typeof cookie!=='string'||/[\r\n]/.test(cookie)||cookie.length>8192)throw new Error('INVALID_COOKIE');
    const key=createHash('sha256').update(JSON.stringify([id,cookie,comments,page])).digest('hex');
    const cached=this.cache.get(key);if(cached&&cached.until>this.now())return structuredClone(cached.data);
    if(this.pending.has(key))return structuredClone(await this.pending.get(key));
    this.requests=this.requests.filter(t=>t>this.now()-60000);
    if(this.blockedUntil>this.now())throw new Error('COOLDOWN');
    if(this.pending.size>=2||this.requests.length>=6)throw new Error('RATE_LIMIT');
    this.requests.push(this.now());
    const task=this.request(id,{cookie,comments,page}).then(data=>{
      this.cache.delete(key);this.cache.set(key,{until:this.now()+300000,data});
      while(this.cache.size>32)this.cache.delete(this.cache.keys().next().value);
      return data;
    }).catch(e=>{this.blockedUntil=this.now()+(/CAPTCHA|AUTH|HTTP_429/.test(e.message)?60000:10000);throw e;}).finally(()=>this.pending.delete(key));
    this.pending.set(key,task); return structuredClone(await task);
  }
  async request(id,{cookie,comments,page}){
    const path='/bbs/app/link/tree';
    const u=new URL('https://api.xiaoheihe.cn'+path);
    u.search=new URLSearchParams({app:'heybox',os_type:'web',x_app:'heybox_website',x_client_type:'web',x_os_type:'Windows',client_type:'web',web_version:'3.0',version:'999.0.4',link_id:id,is_first:page===1?'1':'0',page:String(page),index:String(page),limit:comments?'10':'1',owner_only:'0',...generateSignature(path)});
    const signal=AbortSignal.timeout(10000);
    let response;
    try { response=await this.fetch(u.href,{signal,redirect:'error',headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json','Referer':'https://www.xiaoheihe.cn/','Origin':'https://www.xiaoheihe.cn',...(cookie?{Cookie:cookie}:{})}}); }
    catch{throw new Error('NETWORK');}
    if(!response.ok)throw new Error('HTTP_'+response.status);
    const reader=response.body?.getReader();if(!reader)throw new Error('EMPTY');
    let size=0;const chunks=[];
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw new Error('TOO_LARGE');}chunks.push(value);}}
    catch(e){throw new Error(e.message==='TOO_LARGE'?'TOO_LARGE':'NETWORK');}
    let payload;try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('MALFORMED');}
    return normalize(payload,id,{comments,page});
  }
}
