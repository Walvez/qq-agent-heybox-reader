import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Catalog,gameId} from '../lib/catalog.js';
import {Actions,postForm} from '../lib/actions.js';
import {Replies} from '../lib/replies.js';
import {passwordLogin,encryptedLoginForm} from '../lib/login.js';
import {setup} from '../index.js';
const cookie='user_pkey=synthetic; user_heybox_id=123';
const response=d=>new Response(JSON.stringify(d));
function mock(){
 const state={calls:[],writes:[],liked:0,fail:false,noReceipt:false};
 const fetch=async(url,options)=>{
  const u=new URL(url),p=u.pathname;state.calls.push({u,options});
  if(p==='/account/restore_login')return response({status:'ok',result:{profile:{heybox_id:'123',nickname:'Test'},pkey:'refreshed'}});
  if(p==='/bbs/app/api/user/permission')return response({post_comment_permission:0});
  if(p==='/bbs/app/link/tree')return response({status:'ok',result:{link:{linkid:987,title:'Target',is_award_link:state.liked}}});
  if(p==='/bbs/app/api/general/search/v1/web')return response({status:'ok',result:{items:[{info:{linkid:987,share_url:'https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=abc123',title:'<em>Game</em>',description:'<script>bad</script>summary',topics:[{topic_id:55,app_id:413150,name:'Game'}]}}]}});
  if(p==='/game/get_game_detail/')return response({status:'ok',result:{steam_appid:413150,name:'Game',about_the_game:'<p>Intro</p>',score:'9.9',price:{current:'48'},screenshots:[],common_tags:[]}});
  assert.equal(options.method,'POST');state.writes.push({p,form:new URLSearchParams(options.body)});
  if(state.fail)throw Error('timeout');
  if(p==='/bbs/app/api/link/post')return response({status:'ok',result:state.noReceipt?{}:{link_id:'new123'}});
  if(p==='/bbs/app/profile/award/link'){state.liked=Number(new URLSearchParams(options.body).get('award_type'));return response({status:'ok'});}
  if(p==='/account/login/')return response({status:'ok',result:{profile:{heybox_id:'123',nickname:'Test'},pkey:'login-key'}});
  throw Error('unexpected path');
 };return {state,fetch};
}
function temp(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'heybox-actions-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('search uses offset and sanitized share links; cache and game validation',async()=>{
 const m=mock(),c=new Catalog({fetch:m.fetch});const a=await c.search('game',{page:2,cookie});assert.equal(a.items[0].id,'abc123');assert.equal(a.items[0].title,'Game');assert.equal(a.items[0].summary,'summary');assert.equal(a.items[0].topics[0].gameId,'413150');
 assert.equal(m.state.calls.at(-1).u.searchParams.get('offset'),'10');const n=m.state.calls.length;await c.search('game',{page:2,cookie});assert.equal(m.state.calls.length,n);
 const g=await c.game('https://www.xiaoheihe.cn/app/topic/game/pc/413150');assert.equal(g.description,'Intro');assert.equal(g.price.current,'48');
 for(const x of ['https://evil.test/game/pc/413150','https://www.xiaoheihe.cn.evil.test/game/pc/413150','https://u@www.xiaoheihe.cn/game/pc/413150','https://www.xiaoheihe.cn:8443/game/pc/413150','x'])assert.equal(gameId(x),null,x);
 await assert.rejects(c.search('game',{page:6,cookie}),/INVALID_PAGE/);assert.equal(m.state.writes.length,0);
});
test('search login failures cooldown and bounded requests',async()=>{
 let n=0;const c=new Catalog({fetch:async()=>{n++;return response({status:'captcha'});}});
 await assert.rejects(c.search('a',{cookie}),/CAPTCHA/);await assert.rejects(c.search('b',{cookie}),/COOLDOWN/);assert.equal(n,1);
 const m=mock(),other=new Catalog({fetch:m.fetch});for(let i=0;i<6;i++)await other.search('q'+i,{cookie});await assert.rejects(other.search('too much',{cookie}),/RATE_LIMIT/);
});
test('password fields use randomized RSA and login returns only expected credentials',async()=>{
 const input={phone:'13800000000',password:'synthetic-password'};const a=encryptedLoginForm(input),b=encryptedLoginForm(input);assert.notEqual(a.pwd,b.pwd);assert.equal(Buffer.from(a.pwd,'base64').length,128);assert(!JSON.stringify(a).includes(input.password));
 const m=mock(),r=await passwordLogin(input,{fetch:m.fetch});assert.equal(r.account.id,'123');assert(r.cookie.includes('user_pkey=login-key'));assert(!JSON.stringify(m.state.calls).includes(input.password));
 await assert.rejects(passwordLogin(input,{fetch:async()=>response({status:'need_google_check'})}),/REQUIRES_2FA/);
 assert.throws(()=>encryptedLoginForm({phone:'bad',password:'x'}),/INVALID_LOGIN/);
});
test('post draft is exact, default off; disabled reply permission does not block posts',async t=>{
 const m=mock(),a=new Actions({directory:temp(t),fetch:m.fetch});const d=await a.prepare({kind:'post',title:'Hello',text:'a & b\n中文'},cookie);assert.equal(m.state.writes.length,0);
 await assert.rejects(a.send(d.draftId,d.hash,cookie),/DISABLED/);assert.equal(m.state.writes.length,0);
 const r=await a.send(d.draftId,d.hash,cookie,{enabled:true});assert.equal(r.receipt.postId,'new123');const f=m.state.writes[0].form;assert.equal(f.get('topic_ids'),'58144');assert.equal(f.get('link_tag'),'28');assert.equal(JSON.parse(f.get('text'))[0].text,'a & b\n中文');
 await assert.rejects(a.send(d.draftId,d.hash,cookie,{enabled:true}),/INVALID_DRAFT/);assert.equal(m.state.writes.length,1);
});
test('like sets intended state and verifies it; already liked makes no write',async t=>{
 const m=mock(),a=new Actions({directory:temp(t),fetch:m.fetch});const d=await a.prepare({kind:'like',url:'https://www.xiaoheihe.cn/app/bbs/link/abc123',liked:true},cookie);const r=await a.send(d.draftId,d.hash,cookie,{enabled:true});assert.equal(r.receipt.verified,true);assert.equal(m.state.writes[0].form.get('link_id'),'987');assert.equal(m.state.writes[0].form.get('award_type'),'1');
 const b=new Actions({directory:temp(t),fetch:m.fetch});const d2=await b.prepare({kind:'like',url:d.target.url,liked:true},cookie);const r2=await b.send(d2.draftId,d2.hash,cookie,{enabled:true});assert.equal(r2.receipt.changed,false);assert.equal(m.state.writes.length,1);
});
test('ambiguous post cannot be resent and action drafts cannot enter reply tool',async t=>{
 const m=mock(),directory=temp(t),a=new Actions({directory,fetch:m.fetch});const d=await a.prepare({kind:'post',title:'Hello',text:'Body'},cookie);
 await assert.rejects(new Replies({directory,fetch:m.fetch}).send(d.draftId,d.hash,cookie,{enabled:true}),/INVALID_DRAFT/);m.state.noReceipt=true;
 await assert.rejects(a.send(d.draftId,d.hash,cookie,{enabled:true}),/SEND_UNKNOWN/);assert.equal(a.load(d.draftId).state,'unknown');await assert.rejects(a.send(d.draftId,d.hash,cookie,{enabled:true}),/INVALID_DRAFT/);assert.equal(m.state.writes.length,1);
});
test('new write tools disabled by default and independent config gates block all network',async()=>{
 const tools=[];let calls=0;setup({config:()=>({}),fetch:async()=>{calls++;throw Error('unexpected');},registerTool:t=>tools.push(t)});
 for(const id of ['publish_post','set_like']){const tool=tools.find(x=>x.id===id);assert.equal(tool.defaultEnabled,false);assert.equal((await tool.execute({},{})).isError,true);}
 assert.equal(calls,0);assert.equal(tools.length,10);
});
test('post schema refuses invalid topic, huge payload and control characters',()=>{
 assert.throws(()=>postForm({title:'x',text:'ok',topicIds:['evil']}),/INVALID_POST/);
 assert.throws(()=>postForm({title:'x',text:'x'.repeat(10001)}),/INVALID_POST/);
 assert.throws(()=>postForm({title:'x',text:'a\0b'}),/INVALID_POST/);
});
