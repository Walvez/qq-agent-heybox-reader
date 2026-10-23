import { Parser } from 'htmlparser2';
const hosts = new Set(['www.xiaoheihe.cn','xiaoheihe.cn','api.xiaoheihe.cn','heybox.xiaoheihe.cn']);
export function postId(url) {
  try {
    const u = new URL(url);
    if (!['https:','http:'].includes(u.protocol) || !hosts.has(u.hostname) || u.username || u.password || u.port) return null;
    let id = u.pathname.match(/^\/app\/bbs\/link\/([a-z0-9]+)\/?$/i)?.[1];
    if (/^\/(?:bbs\/post_share|v3\/bbs\/app\/api\/(?:web\/)?share)\/?$/.test(u.pathname)) id = u.searchParams.get('link_id');
    return /^[a-z0-9]{1,64}$/i.test(id || '') ? id : null;
  } catch { return null; }
}
export function links(input) {
  const out = new Map(); let budget = 65536;
  function walk(v, depth=0) {
    if (depth>8 || budget<=0 || out.size>=3) return;
    if (typeof v==='string') {
      const s=v.slice(0,budget).replace(/\\\//g,'/').replace(/&amp;|&#38;/g,'&'); budget-=s.length;
      for (const u of s.match(/https?:\/\/[^\s"'<>，。！？）)】\\]+/gi)||[]) {
        const id=postId(u); if(id) out.set(id,`https://www.xiaoheihe.cn/app/bbs/link/${id}`);
      }
    } else if (Array.isArray(v)) { for(const x of v) walk(x,depth+1); }
    else if(v && typeof v==='object') { for(const x of Object.values(v)) walk(x,depth+1); }
  }
  walk(input); return [...out.values()].slice(0,3);
}
export function imageUrl(raw) {
  try { const u=new URL(String(raw).replace(/^\/\//,'https://'));
    if(u.protocol!=='https:' || u.username || u.password || u.port) return null;
    return ['max-c.com','xiaoheihe.cn'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)) ? u.href : null;
  } catch { return null; }
}
export function fragment(html) {
  let text='', ignored=0; const images=[];
  const p=new Parser({onopentag(tag,a){
    if(['script','style','noscript'].includes(tag)) ignored++;
    if(ignored)return;
    if(['p','div','li','br','blockquote'].includes(tag)) text+='\n';
    if(tag==='img'){const url=imageUrl(a['data-original']||a['data-src']||a.src); if(url) images.push(url);}
  },ontext(t){if(!ignored)text+=t;},onclosetag(tag){if(['script','style','noscript'].includes(tag))ignored=Math.max(0,ignored-1); else if(!ignored&&['p','div','li'].includes(tag))text+='\n';}},{decodeEntities:true});
  p.end(String(html||'').slice(0,300000));
  return {text:text.replace(/\n{3,}/g,'\n\n').trim(),images};
}
export function contents(raw) {
  let blocks=raw; if(typeof raw==='string'){try{blocks=JSON.parse(raw);}catch{blocks=[{text:raw}];}}
  if(!Array.isArray(blocks)) blocks=[{text:typeof raw==='string'?raw:''}];
  let text=[]; const images=[];
  for(const b of blocks.slice(0,500)) {
    if(!b||typeof b!=='object')continue;
    if(b.type==='img'){const u=imageUrl(b.url);if(u)images.push(u);continue;}
    const f=fragment(b.text);text.push(f.text);images.push(...f.images);
  }
  const full=text.filter(Boolean).join('\n');
  return {text:full.slice(0,12000),truncated:full.length>12000,images:[...new Set(images)].slice(0,12)};
}
export function normalize(payload,id,{comments=false,page=1}={}) {
  if(payload?.status!=='ok') {
    const status=String(payload?.status||'');
    throw new Error(/captcha/i.test(status)?'CAPTCHA':/login|auth/i.test(status)?'AUTH':'API_REJECTED');
  }
  const root=payload.result, link=root?.link;
  if(!link || typeof link!=='object') throw new Error('MALFORMED');
  const body=contents(link.text);
  const rows=root.comments||root.hot_comments||root.comment_list||[];
  const flat=Array.isArray(rows)?rows.flatMap(x=>Array.isArray(x?.comment)?x.comment.map(c=>({...c,_root:x.comment[0]?.commentid})):[x]):[];
  return {id,url:`https://www.xiaoheihe.cn/app/bbs/link/${id}`,title:fragment(link.title).text.slice(0,300),author:fragment(link.user?.username||link.user?.nickname||'未知作者').text.slice(0,100),...body,
    comments:comments?flat.slice(0,10).map(c=>({commentId:String(c?.commentid||''),rootId:String(c?._root||c?.root_id||c?.commentid||''),author:fragment(c?.user?.username||'未知作者').text.slice(0,100),text:contents(c?.text||c?.content).text.slice(0,1000)})):[],
    commentPage:comments?page:null,commentsScope:comments?'仅此页最多10条，不代表全部评论':null};
}
