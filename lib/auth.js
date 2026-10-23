import { generateSignature } from './signature.js';
const allowed=new Set(['user_pkey','user_heybox_id','pkey','heybox_id','x_xhh_tokenid']);
export function cookieHeader(raw='') {
  if(typeof raw!=='string'||/[\r\n]/.test(raw)||raw.length>16384)throw Error('INVALID_COOKIE');
  const values=new Map();
  for(const part of raw.split(';')){const i=part.indexOf('=');if(i<1)continue;const name=part.slice(0,i).trim(),value=part.slice(i+1).trim();if(allowed.has(name)&&value)values.set(name,value);}
  return [...values].map(([k,v])=>`${k}=${v}`).join('; ');
}
export async function apiRequest(fetcher,path,{cookie='',form=null,params={}}={}){
  if(!['/account/restore_login','/bbs/app/api/user/permission','/bbs/app/comment/create'].includes(path))throw Error('INVALID_ENDPOINT');
  const u=new URL('https://api.xiaoheihe.cn'+path);
  u.search=new URLSearchParams({app:'heybox',os_type:'web',x_app:'heybox_website',x_client_type:'web',x_os_type:'Windows',client_type:'web',web_version:'3.0',version:'999.0.4',...params,...generateSignature(path)});
  const signal=AbortSignal.timeout(10000);let r;
  try{r=await fetcher(u.href,{method:form?'POST':'GET',redirect:'error',signal,headers:{'User-Agent':'Mozilla/5.0',Referer:'https://www.xiaoheihe.cn/',Origin:'https://www.xiaoheihe.cn',Cookie:cookieHeader(cookie),...(form?{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}:{})},...(form?{body:new URLSearchParams(form).toString()}:{})});}
  catch{throw Error(form?'SEND_UNKNOWN':'NETWORK');}
  if(!r.ok)throw Error(form?'SEND_UNKNOWN':'HTTP_'+r.status);
  let n=0;const chunks=[];try{const reader=r.body.getReader();while(true){const x=await reader.read();if(x.done)break;n+=x.value.length;if(n>1048576){await reader.cancel();throw Error();}chunks.push(x.value);}}
  catch{throw Error(form?'SEND_UNKNOWN':'MALFORMED');}
  let d;try{d=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error(form?'SEND_UNKNOWN':'MALFORMED');}
  if(/captcha/i.test(d?.status||''))throw Error('CAPTCHA');
  if(/^(login|relogin|auth)$/i.test(d?.status||''))throw Error('AUTH');
  if(d?.status && d.status!=='ok')throw Error('API_REJECTED');
  return d;
}
export class Account {
  constructor(fetcher=globalThis.fetch){this.fetch=fetcher;}
  async session(raw){
    const cookie=cookieHeader(raw);if(!cookie)throw Error('AUTH');
    const d=await apiRequest(this.fetch,'/account/restore_login',{cookie});
    const profile=d.result?.profile;
    if(d.status!=='ok'||!profile?.heybox_id||!d.result?.pkey)throw Error('AUTH');
    // Returned API pkey stays in memory and is never part of model-visible status.
    const refreshed=cookieHeader(cookie.split('; ').filter(x=>!x.startsWith('pkey=')).join('; ')+'; pkey='+d.result.pkey+'; heybox_id='+profile.heybox_id);
    const permissions=await apiRequest(this.fetch,'/bbs/app/api/user/permission',{cookie:refreshed});
    const permission=(permissions.result||permissions).post_comment_permission;
    return {cookie:refreshed,public:{loggedIn:true,accountId:String(profile.heybox_id),nickname:String(profile.nickname||'').slice(0,100),canReply:permission===1||permission==='1',permissionKnown:[0,1,'0','1'].includes(permission),expiresAt:d.result.expire_at??null}};
  }
  async status(cookie){try{return (await this.session(cookie)).public;}catch(e){if(e.message==='AUTH')return {loggedIn:false,canReply:false};throw e;}}
}
