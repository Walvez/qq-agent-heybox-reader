import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Account, apiRequest, cookieHeader } from './auth.js';
import { postId } from './parse.js';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export class Replies {
  constructor({directory,fetch:fetcher=globalThis.fetch,now=Date.now}={}){this.directory=directory;this.fetch=fetcher;this.now=now;this.account=new Account(fetcher);this.busy=false;}
  ensure(){if(!this.directory||!path.isAbsolute(this.directory))throw Error('REPLY_STORAGE_REQUIRED');fs.mkdirSync(this.directory,{recursive:true,mode:0o700});}
  file(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('INVALID_DRAFT');return path.join(this.directory,id+'.json');}
  save(d){this.ensure();const f=this.file(d.id),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(d),{mode:0o600});fs.renameSync(tmp,f);}
  load(id){this.ensure();try{return JSON.parse(fs.readFileSync(this.file(id),'utf8'));}catch{throw Error('INVALID_DRAFT');}}
  preview(d){return {draftId:d.id,url:d.url,account:d.account,text:d.text,replyId:d.replyId,rootId:d.rootId,hash:d.hash,state:d.state,expiresAt:d.expiresAt};}
  async prepare({url,text,replyId='-1',rootId='-1'},cookie){
    this.ensure();if(fs.readdirSync(this.directory).filter(f=>f.endsWith('.json')).length>=200)throw Error('DRAFT_LIMIT');const id=postId(url);if(!id)throw Error('INVALID_URL');
    if(typeof text!=='string'||!text.trim()||text.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw Error('INVALID_REPLY');
    if(!/^(-1|[a-z0-9]{1,64})$/i.test(replyId)||!/^(-1|[a-z0-9]{1,64})$/i.test(rootId)||(replyId==='-1')!==(rootId==='-1'))throw Error('INVALID_REPLY_TARGET');
    const s=await this.account.session(cookie);if(!s.public.canReply)throw Error('REPLY_FORBIDDEN');
    const d={id:randomUUID(),url:`https://www.xiaoheihe.cn/app/bbs/link/${id}`,linkId:id,text:text.trim(),replyId,rootId,account:{id:s.public.accountId,nickname:s.public.nickname},credentialHash:digest(cookieHeader(cookie)),state:'draft',createdAt:this.now(),expiresAt:this.now()+1800000};
    d.hash=digest([d.url,d.account.id,d.text,d.replyId,d.rootId]);this.save(d);return this.preview(d);
  }
  async send(id,hash,cookie,{enabled=false}={}){
    if(!enabled)throw Error('REPLY_DISABLED');if(this.busy)throw Error('REPLY_BUSY');this.busy=true;let d,attempted=false,lock;
    try{
      this.ensure();try{lock=fs.openSync(path.join(this.directory,'.send-lock'),'wx',0o600);}catch{throw Error('REPLY_BUSY');}
      d=this.load(id);if(d.hash!==hash||d.state!=='draft'||d.expiresAt<this.now())throw Error('INVALID_DRAFT');
      if(d.credentialHash!==digest(cookieHeader(cookie)))throw Error('ACCOUNT_CHANGED');
      const files=fs.readdirSync(this.directory).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f));
      const old=files.map(f=>JSON.parse(fs.readFileSync(path.join(this.directory,f),'utf8'))).filter(x=>x.attemptedAt!==undefined);
      if(old.some(x=>x.hash===hash)||old.some(x=>x.attemptedAt>this.now()-60000)||old.filter(x=>x.attemptedAt>this.now()-86400000).length>=10)throw Error('REPLY_LIMIT');
      const s=await this.account.session(cookie);if(s.public.accountId!==d.account.id)throw Error('ACCOUNT_CHANGED');if(!s.public.canReply)throw Error('REPLY_FORBIDDEN');
      d.state='sending';d.attemptedAt=this.now();this.save(d);attempted=true;
      const result=await apiRequest(this.fetch,'/bbs/app/comment/create',{cookie:s.cookie,params:{rnd:'15'},form:{is_cy:'0',link_id:d.linkId,reply_id:d.replyId,root_id:d.rootId,text:d.text}});
      const comments=Array.isArray(result.result?.comment)?result.result.comment:result.result?.comment?.comment;
      const receipt=comments?.find(c=>c?.commentid);
      if(result.status!=='ok'||!receipt)throw Error('SEND_UNKNOWN');
      d.state='sent';d.commentId=String(receipt.commentid);this.save(d);return {...this.preview(d),commentId:d.commentId};
    }catch(e){if(attempted){d.state=['AUTH','CAPTCHA','API_REJECTED'].includes(e.message)?'rejected':'unknown';this.save(d);}throw e;}
    finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(path.join(this.directory,'.send-lock'));}this.busy=false;}
  }
}
