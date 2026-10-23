import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Replies} from './replies.js';
import {apiRequest,cookieHeader} from './auth.js';
import {postId,fragment} from './parse.js';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validText=(x,max)=>typeof x==='string'&&x.trim()&&x.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(x);
export function postForm({title,text,topicIds=['58144']}){
  if(!validText(title,100)||!validText(text,10000)||!Array.isArray(topicIds)||!topicIds.length||topicIds.length>3||topicIds.some(x=>typeof x!=='string'||!/^\d{1,12}$/.test(x)))throw Error('INVALID_POST');
  return {title:title.trim(),text:JSON.stringify([{type:'text',text:text.trim()}]),desc:text.trim().slice(0,100),words_count:String(Math.ceil(text.trim().length/2)),topic_ids:topicIds.join(','),link_tag:topicIds.length===1&&topicIds[0]==='58144'?'28':'27',view_limit:'1',post_type:'1',original:'1',declaration:'0',hashtags:'[]',schedule_ts:'0'};
}
export class Actions extends Replies{
  accepts(d){return ['post','like'].includes(d.kind);}
  permission(){} // Post/like permissions differ from comment permissions; the API decides.
  preview(d){return {draftId:d.id,kind:d.kind,account:d.account,target:d.target,payload:d.payload,hash:d.hash,state:d.state,expiresAt:d.expiresAt,...d.receipt?{receipt:d.receipt}:{}};}
  async prepare(input,cookie){
    this.ensure();if(fs.readdirSync(this.directory).filter(f=>f.endsWith('.json')).length>=200)throw Error('DRAFT_LIMIT');
    let payload,target;
    if(input.kind==='post'){const f=postForm(input);payload={title:f.title,text:input.text.trim(),topicIds:f.topic_ids.split(',')};target={visibility:'公开',topicIds:payload.topicIds};}
    else if(input.kind==='like'){
      const id=postId(input.url);if(!id||typeof input.liked!=='boolean')throw Error('INVALID_LIKE');
      payload={id,liked:input.liked};target={url:`https://www.xiaoheihe.cn/app/bbs/link/${id}`};
    }else throw Error('INVALID_ACTION');
    const s=await this.account.session(cookie);
    if(input.kind==='like'){
      const link=await this.link(payload.id,s.cookie);
      payload.linkId=String(link.linkid);target.title=fragment(link.title).text.slice(0,300);
      if(!/^[a-z0-9]{1,64}$/i.test(payload.linkId))throw Error('MALFORMED');
    }
    const d={id:randomUUID(),kind:input.kind,payload,target,account:{id:s.public.accountId,nickname:s.public.nickname},credentialHash:digest(cookieHeader(cookie)),state:'draft',createdAt:this.now(),expiresAt:this.now()+1800000};
    d.hash=digest([d.kind,d.account.id,d.payload]);this.save(d);return this.preview(d);
  }
  async link(id,cookie){const d=await apiRequest(this.fetch,'/bbs/app/link/tree',{cookie,params:{link_id:id,limit:'1'}});if(!d.result?.link)throw Error('MALFORMED');return d.result.link;}
  async deliver(d,s){
    if(d.hash!==digest([d.kind,d.account.id,d.payload]))throw Error('INVALID_DRAFT');
    if(d.kind==='post'){
      const r=await apiRequest(this.fetch,'/bbs/app/api/link/post',{cookie:s.cookie,form:postForm(d.payload)}),id=r.link_id||r.result?.link_id;
      if(r.status!=='ok'||!/^[a-z0-9]{1,64}$/i.test(String(id||'')))throw Error('SEND_UNKNOWN');
      return {receipt:{postId:String(id),url:`https://www.xiaoheihe.cn/app/bbs/link/${id}`,note:'接口已接收；是否审核通过或公开可见以平台为准。'}};
    }
    const desired=d.payload.liked?1:0;
    let link=await this.link(d.payload.id,s.cookie);
    if(String(link.linkid)!==d.payload.linkId)throw Error('SEND_UNKNOWN');
    if(![0,1,'0','1'].includes(link.is_award_link))throw Error('SEND_UNKNOWN');
    if(Number(link.is_award_link)===desired)return {receipt:{liked:d.payload.liked,changed:false,verified:true}};
    const r=await apiRequest(this.fetch,'/bbs/app/profile/award/link',{cookie:s.cookie,form:{link_id:d.payload.linkId,award_type:String(desired)}});
    if(r.status!=='ok')throw Error('SEND_UNKNOWN');
    link=await this.link(d.payload.id,s.cookie);
    if(String(link.linkid)!==d.payload.linkId||Number(link.is_award_link)!==desired)throw Error('SEND_UNKNOWN');
    return {receipt:{liked:d.payload.liked,changed:true,verified:true}};
  }
}
