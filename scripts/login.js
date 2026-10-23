// Administrator-only interactive login. Never pass a password in argv/environment.
import fs from 'node:fs';
import path from 'node:path';
import {passwordLogin} from '../lib/login.js';
import {createInterface} from 'node:readline/promises';
function hidden(prompt){
  return new Promise((resolve,reject)=>{
    const input=process.stdin;let value='';process.stdout.write(prompt);input.setRawMode(true);input.resume();input.setEncoding('utf8');
    const done=(error)=>{input.off('data',data);input.setRawMode(false);input.pause();process.stdout.write('\n');error?reject(error):resolve(value);};
    const data=chunk=>{for(const c of chunk){if(c==='\u0003')return done(Error('CANCELLED'));if(c==='\r'||c==='\n')return done();if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' ')value+=c;if(value.length>200)return done(Error('INVALID_LOGIN'));}};input.on('data',data);
  });
}
try{
  const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output'||!path.isAbsolute(args[1])||!process.stdin.isTTY||!process.stdout.isTTY)throw Error('USAGE');
  const file=args[1];if(fs.existsSync(file))throw Error('OUTPUT_EXISTS');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  const phone=(await rl.question('小黑盒手机号：')).trim(),areaCode=(await rl.question('国家区号（默认 +86）：')).trim()||'+86';rl.close();
  let password=await hidden('小黑盒密码（不回显）：');let result;
  try{result=await passwordLogin({phone,areaCode,password});}finally{password='';}
  fs.writeFileSync(file,result.cookie,{flag:'wx',mode:0o600});
  console.log('登录成功，凭据已写入指定0600文件。请通过管理员配置导入Cookie，或配置cookieFile指向此文件。密码未保存。');
}catch(e){
  const messages={USAGE:'用法：在交互终端运行 node scripts/login.js --output /绝对路径/heybox.cookie',OUTPUT_EXISTS:'输出文件已存在，请使用新路径；不会覆盖已有登录态。',CAPTCHA:'需要人机验证，请在 https://www.xiaoheihe.cn/ 完成官方登录后使用Cookie方式。',REQUIRES_2FA:'需要二次验证，请在官方网页完成登录后使用Cookie方式。',API_REJECTED:'账号密码未通过或平台拒绝登录，请在官方页面检查。'};
  console.error(messages[e.message]||'登录未完成（'+(['INVALID_LOGIN','CANCELLED','NETWORK','LOGIN_FAILED','AUTH'].includes(e.message)?e.message:'FAILED')+'），没有保存凭据。');process.exitCode=1;
}
