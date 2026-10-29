import {createHash} from 'node:crypto';
import {Account, apiRequest, cookieHeader} from './auth.js';
import {fragment, imageUrl, postId} from './parse.js';
import {normalizeEvents, normalizeGames, normalizeProfile, profileTarget} from './profile.js';
const text=(v,n=500)=>fragment(typeof v==='string'?v:'').text.slice(0,n);
export function gameId(value){
  if(typeof value!=='string')return null;
  if(/^\d{1,12}$/.test(value))return value;
  try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||!['www.xiaoheihe.cn','xiaoheihe.cn'].includes(u.hostname)||u.username||u.password||u.port)return null;
    return u.pathname.match(/^\/(?:app\/topic\/game|game)\/(?:pc|steam)\/(\d{1,12})\/?$/)?.[1]||null;
  }catch{return null;}
}
export class Catalog{
  constructor({fetch:fetcher=globalThis.fetch,now=Date.now}={}){this.fetch=fetcher;this.now=now;this.cache=new Map();this.pending=new Map();this.calls=[];this.blocked=0;}
  clear(){this.cache.clear();}
  async cached(key,run){
    const k=createHash('sha256').update(JSON.stringify(key)).digest('hex'),hit=this.cache.get(k);
    if(hit?.until>this.now())return structuredClone(hit.value);
    if(this.pending.has(k))return structuredClone(await this.pending.get(k));
    this.calls=this.calls.filter(t=>t>this.now()-60000);
    if(this.blocked>this.now())throw Error('COOLDOWN');
    if(this.calls.length>=6||this.pending.size>=2)throw Error('RATE_LIMIT');
    this.calls.push(this.now());
    const task=run().then(value=>{this.cache.set(k,{value,until:this.now()+300000});while(this.cache.size>32)this.cache.delete(this.cache.keys().next().value);return value;}).catch(e=>{if(!['PRIVATE','INVALID_USER','PROFILE_DISABLED'].includes(e.message))this.blocked=this.now()+60000;throw e;}).finally(()=>this.pending.delete(k));
    this.pending.set(k,task);return structuredClone(await task);
  }
  async search(query,{page=1,cookie=''}={}){
    if(typeof query!=='string'||!query.trim()||query.length>100)throw Error('INVALID_QUERY');
    if(!Number.isInteger(page)||page<1||page>5)throw Error('INVALID_PAGE');
    cookie=cookieHeader(cookie);query=query.trim();
    return this.cached(['search',query,page,cookie],async()=>{
      const session=await new Account(this.fetch).session(cookie);
      const d=await apiRequest(this.fetch,'/bbs/app/api/general/search/v1/web',{cookie:session.cookie,params:{q:query,search_type:'link',offset:String((page-1)*10),limit:'10'}});
      if(!Array.isArray(d.result?.items))throw Error('MALFORMED');
      const items=d.result.items.slice(0,10).map(x=>{const v=x.info||{},id=postId(v.share_url)||(/^[a-z0-9]{1,64}$/i.test(String(v.linkid||''))?String(v.linkid):null);
        return id?{id,url:`https://www.xiaoheihe.cn/app/bbs/link/${id}`,title:text(v.title,300),summary:text(v.description,600),author:text(v.user?.username||v.user?.nickname||x.user?.username,100),topics:(v.topics||[]).slice(0,5).map(t=>({id:String(t.topic_id||''),name:text(t.name,100),gameId:t.app_id?String(t.app_id):null})),createdAt:v.create_at??null}:null;
      }).filter(Boolean);
      return {query,page,items,scope:'关键词帖子搜索；当前页最多10条，非完整结果。摘要不能代替全文。',fetchedAt:new Date(this.now()).toISOString()};
    });
  }
  async game(value,{cookie=''}={}){
    const id=gameId(value);if(!id)throw Error('INVALID_GAME');cookie=cookieHeader(cookie);
    return this.cached(['game',id,cookie],async()=>{
      const d=await apiRequest(this.fetch,'/game/get_game_detail/',{cookie,params:{steam_appid:id}}),g=d.result;
      if(!g?.name||String(g.steam_appid||g.appid)!==id)throw Error('MALFORMED');
      const price={};for(const k of ['current','initial','lowest_price','discount'])if(['string','number'].includes(typeof g.price?.[k]))price[k]=g.price[k];
      return {id,url:`https://www.xiaoheihe.cn/app/topic/game/pc/${id}`,name:text(g.name,200),nameEn:text(g.name_en,200),description:text(g.about_the_game,10000),score:g.score??null,scoreDescription:text(g.score_desc),price,priceNote:'小黑盒当前接口价格；币种未返回时不推断，实际购买以商城为准。',details:(g.common_tags||[]).flatMap(x=>Array.isArray(x.detail_list)?x.detail_list:[]).slice(0,30).map(x=>({name:text(x.name,100),value:text(x.desc,300)})),images:[...new Set([g.image,g.appicon,...(g.screenshots||[]).map(x=>typeof x==='string'?x:x.url)].map(imageUrl).filter(Boolean))].slice(0,12),topicId:g.topic_detail?.topic_id?String(g.topic_detail.topic_id):null,fetchedAt:new Date(this.now()).toISOString()};
    });
  }
  async profile(value,{page=1,cookie=''}={}){
    page=Number(page);if(!Number.isInteger(page)||page<1||page>5)throw Error('INVALID_PAGE');
    cookie=cookieHeader(cookie);
    const target=profileTarget(value);
    const id=target.self?(await new Account(this.fetch).session(cookie)).public.accountId:target.id;
    const scopedCookie=target.self?cookie:'';
    const detail=await this.profileDetail(id,scopedCookie);
    const recent=await this.eventPage(detail.userId,page,scopedCookie);
    return {...detail,recent:recent.items,page,hasMore:recent.hasMore,fetchedAt:new Date(this.now()).toISOString()};
  }
  async profileDetail(id,cookie){
    return this.cached(['profile',id,cookie],async()=>{
      const d=await apiRequest(this.fetch,'/bbs/app/profile/user/profile',{cookie,params:{userid:String(id)},rawStatus:true});
      return normalizeProfile(d,{requestedId:id});
    });
  }
  async eventPage(userId,page,cookie){
    let cursor='';
    for(let index=1;index<=page;index++){
      const previous=cursor;
      const data=await this.cached(['profile-events',userId,cursor,cookie],async()=>{
        const d=await apiRequest(this.fetch,'/bbs/app/profile/events',{cookie,params:{list_type:'moment',userid:String(userId),dw:'',lastval:cursor},rawStatus:true});
        return normalizeEvents(d);
      });
      if(index===page)return {items:data.items,hasMore:data.hasMore&&data.cursor!==previous};
      if(!data.hasMore||!data.cursor||data.cursor===previous)return {items:[],hasMore:false};
      cursor=data.cursor;
    }
    return {items:[],hasMore:false};
  }
  async games(value,{cookie=''}={}){
    cookie=cookieHeader(cookie);
    const target=profileTarget(value);
    let id=target.self?(await new Account(this.fetch).session(cookie)).public.accountId:target.id;
    const scopedCookie=target.self?cookie:'';
    if(!target.self&&!target.numeric)id=(await this.profileDetail(id,scopedCookie)).userId;
    return this.cached(['games',id,scopedCookie],async()=>{
      const d=await apiRequest(this.fetch,'/account/game_list/',{cookie:scopedCookie,params:{userid:String(id),offset:'0',limit:'30',sort:'all'},rawStatus:true});
      return normalizeGames(d,{userId:id});
    });
  }
}
