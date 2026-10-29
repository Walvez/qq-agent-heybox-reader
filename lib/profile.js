import {fragment, imageUrl} from './parse.js';

const profileHosts=new Set(['www.xiaoheihe.cn','xiaoheihe.cn']);
const idPattern=/^[a-z0-9]{1,64}$/i;
const numericId=/^\d{1,12}$/;

const text=(value,max=500)=>fragment(typeof value==='string'?value:'').text.slice(0,max);
const count=value=>{
  const n=Number(value);
  return value!==null&&value!==''&&Number.isFinite(n)&&n>=0?n:null;
};
const hours=seconds=>{
  const n=count(seconds);
  return n===null?null:Number((n/3600).toFixed(1));
};

export function profileTarget(value){
  if(value===undefined||value===null)return {self:true,id:null,numeric:false};
  if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)return {self:false,id:String(value),numeric:true};
  if(typeof value!=='string')throw Error('INVALID_USER');
  const raw=value.trim();
  if(!raw)return {self:true,id:null,numeric:false};

  const normalized=raw.replace(/\\\//g,'/').replace(/&amp;|&#38;/g,'&');
  const found=normalized.match(/https?:\/\/[^\s"'<>，。！？）)】]+/i);
  if(found){
    let u;
    try{u=new URL(found[0]);}catch{throw Error('INVALID_USER');}
    if(!['https:','http:'].includes(u.protocol)||!profileHosts.has(u.hostname)||u.username||u.password||u.port)throw Error('INVALID_USER');
    let id=u.pathname.match(/^\/app\/user\/profile\/([a-z0-9]{1,64})\/?$/i)?.[1]||null;
    if(!id&&/^\/bbs\/user_profile_share\/?$/.test(u.pathname))id=u.searchParams.get('user_id');
    if(!idPattern.test(id||''))throw Error('INVALID_USER');
    return {self:false,id,numeric:numericId.test(id)};
  }

  if(!idPattern.test(normalized))throw Error('INVALID_USER');
  return {self:false,id:normalized,numeric:numericId.test(normalized)};
}

function readStatus(payload){
  const status=String(payload?.status||'').trim();
  const message=String(payload?.msg||'').trim();
  const blob=`${status} ${message}`;
  if(/captcha/i.test(blob))return 'CAPTCHA';
  if(/^(login|relogin|auth)$/i.test(status))return 'AUTH';
  if(/隐私|私密|权限|仅自己|不可见|隐藏|private|forbidden/i.test(blob))return 'PRIVATE';
  return 'API_REJECTED';
}

function medalRows(value){
  if(!Array.isArray(value))return [];
  return value.filter(x=>x&&typeof x==='object').map(x=>({
    id:x.medal_id===undefined?null:String(x.medal_id),
    name:text(x.name,100),
    description:text(x.description,300),
    level:count(x.level),
    achieved:Number(x.achieved)===1,
    worn:Number(x.wear)===1
  }));
}

export function normalizeProfile(payload,{requestedId=null}={}){
  if(String(payload?.status||'')!=='ok')throw Error(readStatus(payload));
  const account=payload?.result?.account_detail;
  if(!account||typeof account!=='object')throw Error('PRIVATE');
  const id=String(account.userid||'');
  if(!numericId.test(id))throw Error('PRIVATE');

  const bbs=account.bbs_info&&typeof account.bbs_info==='object'?account.bbs_info:{};
  const likes=count(bbs.awd_num), favouritesReceived=count(bbs.be_favoured_num);
  const medals=[...medalRows(account.medals),...medalRows(account.medal)];
  const achieved=medals.filter(x=>x.achieved);
  const avatar=imageUrl(account.avatar);
  return {
    userId:id,
    requestedId:requestedId===null?id:String(requestedId),
    url:`https://www.xiaoheihe.cn/app/user/profile/${id}`,
    nickname:text(account.username,100)||'未知用户',
    bio:text(account.signature,1000),
    level:count(account.level_info?.level),
    avatar,
    ipLocation:text(account.ip_location,100),
    badges:achieved.map(x=>({id:x.id,name:x.name,description:x.description,level:x.level,worn:x.worn})),
    counts:{
      following:count(bbs.follow_num),
      followers:count(bbs.fan_num),
      likes,
      favouritesReceived,
      likesAndFavourites:likes===null&&favouritesReceived===null?null:(likes||0)+(favouritesReceived||0),
      posts:count(bbs.post_link_num)
    }
  };
}

export function normalizeEvents(payload){
  if(String(payload?.status||'')!=='ok')throw Error(readStatus(payload));
  const result=payload?.result;
  if(!result||!Array.isArray(result.moments))throw Error('MALFORMED');
  const items=result.moments.map(m=>{
    if(!m||typeof m!=='object')return null;
    const id=String(m.linkid??m.link_id??'');
    if(!idPattern.test(id))return null;
    const link=m.link&&typeof m.link==='object'?m.link:m;
    const title=text(link.title||link.description||m.title||m.description,300);
    const createdAt=count(m.create_at??link.create_at);
    return {id,title,url:`https://www.xiaoheihe.cn/app/bbs/link/${id}`,createdAt,createdAtIso:createdAt===null?null:new Date(createdAt*1000).toISOString()};
  }).filter(Boolean).slice(0,10);
  return {items,cursor:String(result.lastval||''),hasMore:items.length>0&&Boolean(result.lastval)};
}

export function normalizeGames(payload,{userId}={}){
  if(String(payload?.status||'')!=='ok')throw Error(readStatus(payload));
  const result=payload?.result;
  if(!result||typeof result!=='object')throw Error('PRIVATE');
  if(!Array.isArray(result.game_list))throw Error('MALFORMED');

  const games=result.game_list.map(g=>{
    if(!g||typeof g!=='object')return null;
    const appid=String(g.appid??g.steam_appid??'');
    const name=text(g.name||g.game_name,200);
    if(!/^[a-z0-9_-]{1,64}$/i.test(appid)||!name)return null;
    const totalSeconds=count(g.playtime_forever);
    const twoWeekSeconds=count(g.playtime_2weeks);
    const achieved=count(g.achieved_count);
    const achievementTotal=count(g.achivement_count??g.achievement_count);
    return {
      appid,
      steamAppId:g.steam_appid===undefined?null:String(g.steam_appid),
      name,
      icon:imageUrl(g.appicon),
      totalSeconds,
      totalHours:hours(totalSeconds),
      twoWeekSeconds,
      twoWeekHours:hours(twoWeekSeconds),
      achievement:Number(g.has_achievement)===1&&achievementTotal!==null&&achieved!==null?{achieved,total:achievementTotal,percent:achievementTotal>0?Number((achieved/achievementTotal*100).toFixed(1)):null}:null
    };
  }).filter(Boolean).sort((a,b)=>(b.totalSeconds||0)-(a.totalSeconds||0)||a.name.localeCompare(b.name,'zh-CN')).slice(0,30);

  return {
    userId:String(userId||result.userid||''),
    url:`https://www.xiaoheihe.cn/app/user/profile/${String(userId||result.userid||'')}`,
    total:count(result.total),
    returned:games.length,
    sort:'totalTime',
    games,
    scope:'按总时长降序；最多30条。时长为接口公开值，单位小时。',
    fetchedAt:new Date().toISOString()
  };
}
