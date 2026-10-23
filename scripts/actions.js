// Credentials are read only from a local file, never from command-line literal values.
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline/promises';
import { Actions } from '../lib/actions.js';
const [action,...args]=process.argv.slice(2);
function flag(k){const i=args.indexOf(k);return i<0?null:args[i+1];}
try{
 const cookieFile=flag('--cookie-file');if(!cookieFile)throw Error('--cookie-file required');
 if(process.platform!=='win32'&&(fs.statSync(cookieFile).mode&0o077))throw Error('Cookie file must have mode 0600');
 const cookie=fs.readFileSync(cookieFile,'utf8').trim();
 {
  const state=flag('--state-dir');if(!state||!path.isAbsolute(state))throw Error('--state-dir absolute path required');
  const replies=new Actions({directory:state});
  if(action==='draft'){
   const input=JSON.parse(fs.readFileSync(flag('--input'),'utf8'));
   console.log(JSON.stringify(await replies.prepare(input,cookie),null,2));
  }else if(action==='send'){
   const d=replies.load(flag('--draft'));
   console.log(JSON.stringify(replies.preview(d),null,2));
   if(!process.stdin.isTTY)throw Error('Interactive terminal required; model tool calls cannot approve');
   const rl=readline.createInterface({input:process.stdin,output:process.stdout});
   const answer=await rl.question('确认使用上述账号执行完整草稿所示的公开发帖/点赞操作？输入 SEND 确认：');rl.close();
   if(answer!=='SEND'){console.log('已取消，未发送。');}
   else console.log(JSON.stringify(await replies.send(d.id,d.hash,cookie,{enabled:true}),null,2));
  }else throw Error('Use draft or send');
 }
}catch(e){console.error(e.message);process.exitCode=1;}
