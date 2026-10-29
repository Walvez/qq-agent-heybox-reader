import test from 'node:test';
import assert from 'node:assert/strict';
import {Catalog} from '../lib/catalog.js';
import {normalizeEvents,normalizeGames,normalizeProfile,profileTarget} from '../lib/profile.js';
import {setup} from '../index.js';

const cookie='user_pkey=synthetic-secret; user_heybox_id=123';
const profilePayload={status:'ok',result:{account_detail:{username:'测试用户',signature:'公开简介',userid:90000001,avatar:'https://imgheybox.max-c.com/avatar/a.jpg',ip_location:'IP: 山东',level_info:{level:9},medals:[{medal_id:31,name:'个人认证',description:'认证说明',level:2,achieved:1,wear:1},{medal_id:44,name:'未获得',description:'未获得',level:0,achieved:0,wear:0}],bbs_info:{follow_num:10,fan_num:20,awd_num:30,be_favoured_num:40,post_link_num:5}}}};
const json=d=>new Response(JSON.stringify(d));
const moment=i=>({linkid:String(100000+i),title:`动态 ${i}`,description:`简介 ${i}`,create_at:1700000000+i,content_type:4,share_url:`https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=${i}`});

function game(i){
  return {appid:i,steam_appid:i,name:`游戏 ${i}`,appicon:'https://imgheybox.max-c.com/game/icon.png',playtime_forever:i*3600,playtime_2weeks:i===30?1800:0,has_achievement:1,achieved_count:2,achivement_count:4};
}

function gamePayload(count=35,total=count){
  return {status:'ok',result:{game_list:Array.from({length:count},(_,i)=>game(i+1)),total,is_me:false,hidden_appids:[],selected_sort:'all'}};
}

function mock(){
  const state={calls:[]};
  const fetch=async(url,options={})=>{
    const u=new URL(url);state.calls.push({u,options});
    assert.equal(u.hostname,'api.xiaoheihe.cn');
    assert.equal(options.redirect,'error');
    assert.equal(options.signal instanceof AbortSignal,true);
    const path=u.pathname;
    if(path==='/account/restore_login')return json({status:'ok',result:{profile:{heybox_id:'123',nickname:'本人'},pkey:'temporary'}});
    if(path==='/bbs/app/api/user/permission')return json({post_comment_permission:0});
    if(path==='/bbs/app/profile/user/profile'){
      const userid=u.searchParams.get('userid');
      if(userid==='abc123def456')return json(profilePayload);
      if(userid==='123')return json({...profilePayload,result:{account_detail:{...profilePayload.result.account_detail,userid:123,username:'本人'}}});
      return json(profilePayload);
    }
    if(path==='/bbs/app/profile/events'){
      const lastval=u.searchParams.get('lastval');
      if(lastval==='')return json({status:'ok',result:{moments:Array.from({length:10},(_,i)=>moment(i+1)),lastval:'cursor-1'}});
      if(lastval==='cursor-1')return json({status:'ok',result:{moments:[moment(11),moment(12)],lastval:'cursor-2'}});
      const n=Number(String(lastval).split('-')[1])||2;
      return json({status:'ok',result:{moments:[moment(12+n)],lastval:`cursor-${n+1}`}});
    }
    if(path==='/account/game_list/')return json(gamePayload());
    throw Error('unexpected path '+path);
  };
  return {state,fetch};
}

test('profile target parses self, numeric ID, profile URL, share link and embedded URL securely',()=>{
  assert.deepEqual(profileTarget(''),{self:true,id:null,numeric:false});
  assert.deepEqual(profileTarget(90000001),{self:false,id:'90000001',numeric:true});
  assert.deepEqual(profileTarget('90000001'),{self:false,id:'90000001',numeric:true});
  assert.deepEqual(profileTarget('https://www.xiaoheihe.cn/app/user/profile/90000001'),{self:false,id:'90000001',numeric:true});
  assert.deepEqual(profileTarget('看看 https://www.xiaoheihe.cn/bbs/user_profile_share?user_id=abc123def456&h_src=heyboxapp 的主页'),{self:false,id:'abc123def456',numeric:false});
  for(const x of ['https://evil.test/app/user/profile/1','https://www.xiaoheihe.cn.evil.test/app/user/profile/1','https://u:p@www.xiaoheihe.cn/app/user/profile/1','https://www.xiaoheihe.cn:8443/app/user/profile/1','https://www.xiaoheihe.cn/app/bbs/link/abc'])assert.throws(()=>profileTarget(x),/INVALID_USER/);
});

test('profile normalization keeps public fields and sanitizes badges',()=>{
  const p=normalizeProfile(profilePayload,{requestedId:'abc123def456'});
  assert.equal(p.userId,'90000001');assert.equal(p.nickname,'测试用户');assert.equal(p.bio,'公开简介');assert.equal(p.level,9);assert.equal(p.counts.following,10);assert.equal(p.counts.followers,20);assert.equal(p.counts.likes,30);assert.equal(p.counts.likesAndFavourites,70);assert.equal(p.counts.posts,5);assert.equal(p.badges.length,1);assert.equal(p.badges[0].worn,true);assert.equal(p.requestedId,'abc123def456');
});

test('profile privacy and missing public account fail explicitly',()=>{
  assert.throws(()=>normalizeProfile({status:'failed',msg:'该用户设置了隐私'}),/PRIVATE/);
  assert.throws(()=>normalizeProfile({status:'ok',result:{}}),/PRIVATE/);
});

test('events are capped at ten and expose the cursor',()=>{
  const e=normalizeEvents({status:'ok',result:{moments:Array.from({length:12},(_,i)=>moment(i+1)),lastval:'next'}});
  assert.equal(e.items.length,10);assert.equal(e.cursor,'next');assert.equal(e.hasMore,true);assert.match(e.items[0].url,/app\/bbs\/link\/100001/);
});

test('games normalize, sort by total time, cap 30 and convert seconds to hours',()=>{
  const g=normalizeGames(gamePayload(),{userId:'90000001'});
  assert.equal(g.total,35);assert.equal(g.games.length,30);assert.equal(g.games[0].name,'游戏 35');assert.equal(g.games[0].totalHours,35);assert.equal(g.games[0].twoWeekHours,0);assert.equal(g.games[0].achievement.achieved,2);assert.equal(g.games[0].achievement.total,4);assert.equal(g.games.find(x=>x.name==='游戏 30').twoWeekHours,0.5);
  assert.equal(g.games.every((x,i,a)=>i===0||a[i-1].totalSeconds>=x.totalSeconds),true);
});

test('games privacy is explicit and empty libraries are not invented',()=>{
  assert.throws(()=>normalizeGames({status:'failed',msg:'游戏资料已隐藏，隐私不可见'}),/PRIVATE/);
  const empty=normalizeGames({status:'ok',result:{game_list:[],total:0}},{userId:'1'});assert.deepEqual(empty.games,[]);assert.equal(empty.total,0);
});

test('Catalog profile pages through lastval, public requests omit Cookie and cache repeats',async()=>{
  const m=mock(),c=new Catalog({fetch:m.fetch});const p=await c.profile('90000001',{page:2,cookie});
  assert.equal(p.page,2);assert.equal(p.recent.length,2);assert.equal(p.recent[0].title,'动态 11');assert.equal(p.hasMore,true);
  const profileCalls=m.state.calls.filter(x=>x.u.pathname==='/bbs/app/profile/user/profile');const eventCalls=m.state.calls.filter(x=>x.u.pathname==='/bbs/app/profile/events');
  assert.equal(profileCalls.length,1);assert.equal(eventCalls.length,2);assert.equal(eventCalls[0].u.searchParams.get('lastval'),'');assert.equal(eventCalls[1].u.searchParams.get('lastval'),'cursor-1');
  assert.equal(profileCalls[0].options.headers.Cookie,undefined);assert.equal(eventCalls[0].options.headers.Cookie,undefined);
  const before=m.state.calls.length;await c.profile('90000001',{page:2,cookie});assert.equal(m.state.calls.length,before);
});

test('Catalog profile supports page 5 and rejects page 6 before network',async()=>{
  const m=mock(),c=new Catalog({fetch:m.fetch});const p=await c.profile(90000001,{page:5});assert.equal(p.page,5);assert.equal(m.state.calls.filter(x=>x.u.pathname==='/bbs/app/profile/events').length,5);await assert.rejects(c.profile(90000001,{page:6}),/INVALID_PAGE/);assert.equal(m.state.calls.filter(x=>x.u.pathname==='/bbs/app/profile/events').length,5);
});

test('empty user resolves to the logged-in account and uses the Cookie only for self',async()=>{
  const m=mock(),c=new Catalog({fetch:m.fetch});const p=await c.profile('',{page:1,cookie});assert.equal(p.userId,'123');assert.equal(p.nickname,'本人');
  const profile=m.state.calls.find(x=>x.u.pathname==='/bbs/app/profile/user/profile');assert.match(profile.options.headers.Cookie,/user_pkey=synthetic-secret/);
  const g=await c.games('',{cookie});assert.equal(g.userId,'123');const list=m.state.calls.find(x=>x.u.pathname==='/account/game_list/');assert.match(list.options.headers.Cookie,/user_pkey=synthetic-secret/);
});

test('share link resolves to numeric ID before game_list; public games omit Cookie',async()=>{
  const m=mock(),c=new Catalog({fetch:m.fetch});const g=await c.games('https://www.xiaoheihe.cn/bbs/user_profile_share?user_id=abc123def456',{cookie});
  assert.equal(g.userId,'90000001');assert.equal(g.games.length,30);const list=m.state.calls.find(x=>x.u.pathname==='/account/game_list/');assert.equal(list.u.searchParams.get('userid'),'90000001');assert.equal(list.u.searchParams.get('sort'),'all');assert.equal(list.u.searchParams.get('limit'),'30');assert.equal(list.u.searchParams.has('steam_id'),false);assert.equal(list.options.headers.Cookie,undefined);
});

test('profile and games tools are enabled by default and enableProfile gates both without network',async()=>{
  const m=mock(),tools=[];setup({config:()=>({cookie}),fetch:m.fetch,registerTool:t=>tools.push(t)});
  const profile=tools.find(x=>x.id==='profile'),games=tools.find(x=>x.id==='games');assert.equal(profile.defaultEnabled,true);assert.equal(games.defaultEnabled,true);
  const out=await profile.execute({},{user:'90000001'});const body=JSON.parse(out.content);assert.equal(body.nickname,'测试用户');assert(!out.content.includes('synthetic-secret'));
  const gs=await games.execute({},{user:'90000001'});assert.equal(JSON.parse(gs.content).games.length,30);assert(!gs.content.includes('synthetic-secret'));
  let calls=0;const blocked=[];setup({config:()=>({enableProfile:false}),fetch:async()=>{calls++;throw Error('unexpected');},registerTool:t=>blocked.push(t)});
  const disabled=await blocked.find(x=>x.id==='profile').execute({},{user:'90000001'});assert.equal(disabled.isError,true);assert.match(disabled.content,/PROFILE_DISABLED/);assert.equal(calls,0);
});

function nameMock(users,{rejectId=null}={}){
  const base=mock();const calls=base.state.calls;
  const fetch=async(url,options={})=>{
    const u=new URL(url);
    if(u.pathname==='/bbs/app/api/general/search/v1/web'){calls.push({u,options});assert.equal(u.searchParams.get('search_type'),'user');return json({status:'ok',result:{items:users.map(x=>({info:x}))}});}
    if(rejectId&&u.pathname==='/bbs/app/profile/user/profile'&&u.searchParams.get('userid')===rejectId){calls.push({u,options});return json({status:'failed',msg:'参数错误'});}
    return base.fetch(url,options);
  };
  return {state:base.state,fetch};
}

test('a nickname resolves through user search to the single exact match', async () => {
  const m=nameMock([{userid:90000002,username:'TianFang'},{userid:90000003,username:'Tianfang 天放'}]);
  const c=new Catalog({fetch:m.fetch});
  const g=await c.games('tianfang',{cookie});
  const list=m.state.calls.find(x=>x.u.pathname==='/account/game_list/');
  assert.equal(list.u.searchParams.get('userid'),'90000002');
  assert.equal(g.userId,'90000002');
});

test('ambiguous and unknown nicknames return candidates and never start the global cooldown', async () => {
  const twin=nameMock([{userid:90000004,username:'小鱼'},{userid:90000005,username:'小鱼'}]);
  const c=new Catalog({fetch:twin.fetch});
  await assert.rejects(c.games('小鱼',{cookie}),e=>e.message==='AMBIGUOUS_USER'&&e.candidates.length===2);
  const none=nameMock([{userid:90000006,username:'别人'}],{rejectId:'nobody'});
  const c2=new Catalog({fetch:none.fetch});
  await assert.rejects(c2.profile('nobody',{cookie}),e=>e.message==='USER_NOT_FOUND'&&e.candidates[0].nickname==='别人');
  const p=await c2.profile('90000001',{cookie});
  assert.equal(p.userId,'90000001','a failed lookup must not block the next request');
});

test('tool errors name the real cause and only AUTH mentions login', async () => {
  const tools=[];const m=nameMock([],{rejectId:'ghost'});
  setup({config:()=>({cookie}),fetch:m.fetch,registerTool:t=>tools.push(t)});
  const games=tools.find(t=>t.id==='games');
  const out=await games.execute({},{user:'ghost'});
  assert.equal(out.isError,true);
  const body=JSON.parse(out.content);
  assert.equal(body.error,'USER_NOT_FOUND');
  assert.doesNotMatch(out.content,/登录/);
});

