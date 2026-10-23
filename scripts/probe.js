import { Reader } from '../lib/client.js';
const url=process.argv[2];
if(!url){console.error('用法: npm run probe -- <公开帖子URL>');process.exit(2);}
try { const p=await new Reader().read(url,{cookie:process.env.HEYBOX_COOKIE||'',comments:process.argv.includes('--comments')});
 console.log(JSON.stringify({ok:true,id:p.id,title:p.title,author:p.author,textChars:p.text.length,images:p.images.length,comments:p.comments.length,excerpt:p.text.slice(0,180)},null,2));
}catch(e){console.error(JSON.stringify({ok:false,code:e.message}));process.exitCode=1;}
