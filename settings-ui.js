const switches=[
 ['enableSearch','帖子搜索','按关键词搜索小黑盒讨论，需要有效登录态。',true],
 ['enableGame','游戏详情','读取 PC / Steam 游戏简介、评分和价格。',true],
 ['attachImages','附带图片','将帖子图片交给宿主视觉模型；不保证当前模型能识图。',true],
 ['allowPublish','允许发布回复','允许使用小黑盒账号公开评论；还需在「工具与扩展」启用 publish_reply。',false],
 ['allowPost','允许发布新帖','允许公开发布纯文字新帖；还需启用 publish_post 工具。',false],
 ['allowLike','允许点赞 / 取消赞','允许修改普通帖子点赞状态；还需启用 set_like 工具。',false]
];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function render(ctx){
 const response=await ctx.api('/api/skills/settings?id=heybox-reader');const settings=response.settings||{};
 return `<section class="heybox-settings" style="max-width:780px">
 <h2>小黑盒阅读与互动</h2><p>集中管理阅读、登录与互动权限。修改后点击「保存设置」。工具是否提供给模型，仍由「工具与扩展」管理。</p>
 <form data-heybox-form>
 <h3>阅读能力</h3>${switches.slice(0,3).map(x=>toggle(x,settings)).join('')}
 <h3>账号登录</h3><p>沿用已保存的 Cookie；留空不会更换账号。手机号密码登录通过管理员终端脚本完成，密码不要填写在这里。</p>
 <label style="display:block;margin:12px 0">更新 Cookie（可选）<input style="display:block;width:100%;margin-top:6px" name="cookie" type="password" autocomplete="new-password" placeholder="留空保留现有凭据" value=""></label>
 <label style="display:block;margin:12px 0">服务器 Cookie 文件路径（可选）<input style="display:block;width:100%;margin-top:6px" name="cookieFile" type="text" autocomplete="off" value="${escape(settings.cookieFile)}" placeholder="/服务器绝对路径/heybox.cookie"></label>
 <p class="hint">文件方式优先于 Cookie，文件须位于运行机器、权限0600；清空路径可恢复使用 Cookie 字段。终端登录：<code>node scripts/login.js --output /安全路径/heybox.cookie</code></p>
 <h3>对外操作权限</h3><p>开启后，模型可使用该账号执行相应公开操作。准备草稿无需开启；需要每次人工确认时保持关闭，使用终端确认发送。</p>
 ${switches.slice(3).map(x=>toggle(x,settings)).join('')}
 <button type="submit" class="btn">保存设置</button> <span data-status role="status" aria-live="polite"></span>
 </form></section>`;
}
function toggle([key,label,hint,defaultValue],s){return `<label style="display:block;margin:14px 0"><input type="checkbox" name="${key}" ${(s[key]??defaultValue)===true?'checked':''}> <strong>${label}</strong><span class="hint" style="display:block;margin-left:24px">${hint}</span></label>`;}
export function bind(root,ctx){
 const form=root.querySelector('[data-heybox-form]'),status=root.querySelector('[data-status]');let disposed=false;
 const dirty=()=>ctx.setUnsavedChanges?.(true);
 const submit=async event=>{
  event.preventDefault();const button=form.querySelector('button');if(button.disabled)return;
  const settings=Object.fromEntries(switches.map(([key])=>[key,form.elements.namedItem(key).checked]));
  settings.cookieFile=form.elements.namedItem('cookieFile').value.trim();
  const secret=form.elements.namedItem('cookie').value.trim();if(secret)settings.cookie=secret;
  button.disabled=true;status.textContent='正在保存…';
  try{const result=await ctx.save(settings);if(result?.ok===false||result?.error)throw Error();if(disposed)return;form.elements.namedItem('cookie').value='';ctx.setUnsavedChanges?.(false);status.textContent='已保存。工具授权仍在「工具与扩展」管理。';}
  catch{if(!disposed)status.textContent='保存失败，请检查连接后重试。';}
  finally{if(!disposed)button.disabled=false;}
 };
 form.addEventListener('input',dirty);form.addEventListener('change',dirty);form.addEventListener('submit',submit);
 return ()=>{disposed=true;form.removeEventListener('input',dirty);form.removeEventListener('change',dirty);form.removeEventListener('submit',submit);};
}
