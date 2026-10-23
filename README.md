# qq-agent-heybox-reader

一个轻量 QQ-agent Skill：读小黑盒帖子，让机器人理解内容再参与讨论。MIT，Node.js 20+，无需浏览器、Python、数据库或本地模型。当前版本 0.3.1。

源码：https://github.com/Walvez/qq-agent-heybox-reader

## 能做什么

0.3 新增搜索、游戏详情、手机号密码登录、发帖和点赞，完整开关、示例与限制见 [0.3使用说明](docs/FEATURES_0_3.md)。新帖与点赞默认关闭，不会因为升级自动对外操作。

- 识别帖子网页、分享链接、QQ JSON/XML 分享卡片里的原始 URL。
- 读取标题、作者、正文、最多12张图片地址；视觉模型每次最多附3张图。
- 按需读取评论，每页最多10条、最多请求第5页；不是完整评论归档。
- 不发送 QQ 消息、不修改 JEV/唤醒规则、不自动转发全文。模型可以读完保持沉默。
- 匿名优先；支持 Cookie 登录验证、评论权限检查、帖子回复及楼中楼回复。发布默认关闭，读取失败不影响聊天。

## 安装

可在 QQ-agent 根目录运行 `git clone https://github.com/Walvez/qq-agent-heybox-reader.git skills/heybox-reader`，或在 `skills/heybox-reader/` 放入本项目完整文件（不是符号链接；部分加载器跳过符号链接目录），然后：

```sh
cd skills/heybox-reader
npm ci --omit=dev --ignore-scripts
```

在宿主控制台重新加载扩展并启用“小黑盒帖子阅读”，确保 `heybox-reader__read` 工具启用。没有热加载的版本需要按宿主流程重启。首次安装建议在测试账号验证。

识图使用宿主当前视觉模型；不包含模型 API、也不强制切换 Google。**原版 QQ-agent 已支持工具多模态输出；旧京玉可能只支持内置图片工具，需要宿主适配，见 [兼容说明](docs/COMPATIBILITY.md)。**

## 使用例子

群友：`这篇你怎么看 https://www.xiaoheihe.cn/app/bbs/link/<帖子ID>`

模型调用：`heybox-reader__read({"url":"原始帖子链接"})`，得到正文资料后自然讨论。

群友：`评论里大家什么意见？`

模型调用：`heybox-reader__read({"url":"原始帖子链接","comments":true,"page":1})`。

QQ 卡片无需另一个工具：`url` 参数也可传整张卡片 JSON。提示钩子只识别链接，不联网；实际读取由工具完成。宿主必须保留卡片原始 URL；如果宿主先丢掉了卡片链接，请复制原链接。

## 配置与凭据

控制台 Skill 设置：`attachImages` 默认开启；`cookie` 是可选密码字段。匿名遇到登录要求时，由管理员在本地控制台填写自己的 Cookie；也支持进程环境变量 `HEYBOX_COOKIE`。不要把 Cookie 发群里、写进仓库或命令历史。配置密码字段依赖宿主的脱敏机制。也可使用0600本地文件 `cookieFile` / `HEYBOX_COOKIE_FILE`（优先于Cookie字段）。

登录恢复会返回短期 API 凭据，扩展仅在内存使用，不返回给模型。浏览器中的 user_pkey 为 HttpOnly，document.cookie 可能取不到；不要误以为复制可见Cookie就足够。实测 user_pkey 与 user_heybox_id 可完成登录恢复，但不同账号或平台策略仍可能要求其他白名单字段。

Cookie 只发到固定 `https://api.xiaoheihe.cn`，禁止重定向。不获取或绕过验证码。请求风控时退避60秒，不轮询其他接口绕过风控。清除 Cookie 请按宿主的秘密字段清除流程操作（部分宿主提交空串表示不修改）。

## 资源和限制

10秒超时，响应上限1MiB，最多2个在途请求、每分钟6次；5分钟内存缓存最多32项，同请求合并。正文最多12000字符，图片只传URL不下载、不渲染、不OCR。视觉模型自身可能产生调用费用。无后台轮询或定时器。

支持帖子URL、帖子搜索和PC/Steam游戏详情；新增管理员手机号密码登录、纯文字新帖和普通帖子点赞/取消赞。仍不支持任意短链、媒体上传或其他游戏平台。接口为非官方接口，可能变动；私密/删除帖子不会伪造成功。外部正文视为不可信资料，提示词提醒不能代替宿主权限控制。

## 开发与验证

```sh
npm ci --ignore-scripts
npm test
npm run probe -- 'https://www.xiaoheihe.cn/app/bbs/link/帖子ID'
# 可选 --comments；只读网络请求，不调用LLM/QQ
```

`QQ_AGENT_DATA_DIR=<新建空目录> node scripts/host-check.js <QQ-agent源码路径>` 验证真实加载器。不要指向生产数据。

[测试结果](docs/TEST_RESULTS.md) · [设计与开源参考](docs/DESIGN.md) · [第三方版权](THIRD_PARTY_NOTICES.md)

## 登录与回复（0.2）

工具：`heybox-reader__account` 检查登录，`heybox-reader__draft_reply` 准备草稿，`heybox-reader__publish_reply` 发布。登录检查与草稿默认启用，发布工具默认关闭；管理员可单独调整。发布还需要设置 `allowPublish=true`；这是允许模型使用该账号公开发评的开关，不仅是“已登录”。不开此开关也可以阅读、验证登录及准备草稿。

草稿显示账号、目标帖子、正文、replyId/rootId和内容hash，30分钟有效。发布工具只接收草稿ID/hash，不接收临时改写的正文。楼中楼ID从读取评论结果获取。成功必须有commentId回执；网络超时或无回执标为unknown，不能自动重试或声称成功。

持久化目录使用 `HEYBOX_STATE_DIR`，未设置时使用 `QQ_AGENT_DATA_DIR/heybox-reader`；都没有则拒绝写草稿，避免误落代码目录。单进程/多进程发送锁，每分钟最多1次、每天最多10次尝试，最多200份草稿；记录中不保存Cookie原文。发生崩溃留下.send-lock时，先核对网页和sending记录，再由管理员处理锁，不能盲目重发。

也可以不启用模型发布，使用本地终端人工确认：

```sh
node scripts/account.js status --cookie-file /安全目录/heybox.cookie
node scripts/account.js draft --cookie-file /安全目录/heybox.cookie --state-dir /安全目录/heybox-state --input /安全目录/reply.json
node scripts/account.js send --cookie-file /安全目录/heybox.cookie --state-dir /安全目录/heybox-state --draft 草稿ID
```

reply.json 示例：`{"url":"原始帖子URL","text":"想回复的原文"}`。楼中楼增加 `replyId`、`rootId`。send 命令展示完整草稿，要求在交互终端输入SEND，不接受非交互自动批准。Cookie文件应为0600，不放仓库，不用命令行明文传Cookie。

目前已真实验证登录、评论权限和草稿生成；发布请求只经过模拟测试，尚未对真实帖子发送。是否在服务器可用仍需对应网络出口实测。

## 设置入口

支持 settingsUi 的宿主中，在「设置 → 插件设置 → 小黑盒」集中管理阅读、登录和对外操作开关；修改后点击保存。Cookie留空保留现有凭据。工具授权仍在「工具与扩展」管理；不支持自定义设置页的旧宿主继续使用扩展详情表单。
