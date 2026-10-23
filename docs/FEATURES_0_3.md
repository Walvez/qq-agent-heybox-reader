# 0.3 搜索、游戏详情、账号密码登录、发帖与点赞

## 能力与开关

| 能力 | 工具/入口 | 默认状态 |
| --- | --- | --- |
| 帖子搜索 | `heybox-reader__search` | 开启，需有效登录态；`enableSearch=false` 可关闭 |
| 游戏详情 | `heybox-reader__game` | 开启；`enableGame=false` 可关闭 |
| 手机号+密码登录 | 管理员终端 `scripts/login.js` | 必须由管理员交互执行；不向模型暴露密码工具 |
| 新帖草稿 | `heybox-reader__draft_post` | 开启，仅本地保存 |
| 发布新帖 | `heybox-reader__publish_post` | 工具默认关闭，另需 `allowPost=true` |
| 点赞草稿 | `heybox-reader__draft_like` | 开启，仅本地保存 |
| 点赞/取消赞 | `heybox-reader__set_like` | 工具默认关闭，另需 `allowLike=true` |

已有阅读、账号检查、回复草稿和回复发布保持兼容。`allowPublish` 仍只控制评论，不会同时打开新帖或点赞。配置开关可即时读取；是否需要重载工具开关取决于宿主。

开启写入开关和工具，表示允许模型使用该小黑盒账号执行对应操作。Skill 会提示先展示草稿，但不把模型说“已确认”当作系统级管理员认证；需要每次人工确认时保持模型写工具关闭，使用下面的终端 send 命令。所有群的模型可能共享同一个宿主账号，权限范围由宿主控制。

## 聊天例子

- “帮我搜一下星露谷联机的讨论”：`search({query:"星露谷 联机",page:1})`，拿到摘要后按需 `read` 全文。
- “看看这个游戏怎么样”：`game({game:"https://www.xiaoheihe.cn/app/topic/game/pc/413150"})`。也可直接传 `413150`。支持 PC/Steam，其他平台暂未接入；不要用游戏名猜 appid，搜索结果的 `topics.gameId` 可以用于定位。
- “写一帖我们今晚联机的经历”：`draft_post({title:"今晚的联机记录",text:"完整正文",topicIds:["6958"]})`。topicIds 为小黑盒社区分区 ID，来自搜索 `topics.id` 或游戏 `topicId`，不是 Steam appid。省略时使用官方动态分区 `58144`。本版支持纯文字原创动态，公开可见；不支持媒体上传、视频、投票、付费推广或编辑旧帖。
- “给这帖点个赞”：先 `draft_like({url:"原帖子链接",liked:true})`。取消赞为 false，不是一次切换。
- 发布与点赞工具都只接收草稿 `draftId` 和 `hash`。正文修改需生成新草稿。

新帖成功返回 `postId` 和网址，仅说明平台接收，不代表审核通过。点赞会先读当前状态；已符合目标时不写入，否则设置目标状态再回读确认。这里的“点赞”是普通帖子赞，不是电池打赏、充电或评论点赞。

## 手机号+密码登录

```sh
node scripts/login.js --output /安全绝对路径/heybox.cookie
```

交互输入手机号、区号（默认+86）、密码。密码不回显、不保存、不进命令参数或环境变量；使用官方网页公布的RSA公钥加密字段，通过HTTPS固定接口发送。这个入口是手机号密码登录，不支持任意用户名。只尝试一次，不自动撞库或绕过验证码。需要验证码/二次验证时会停止，请在官方网页完成后改用 Cookie。输出文件必须不存在，父目录须已存在；保存为0600。

在宿主 Skill 设置中把 `cookieFile` 填为该文件的绝对路径，或设置 `HEYBOX_COOKIE_FILE`。文件须位于**运行QQ-agent的同一台机器**，不能填Mac路径让Linux读取。凭据来源优先级：配置cookieFile > 环境HEYBOX_COOKIE_FILE > 配置cookie > 环境HEYBOX_COOKIE。文件不存在、不是普通文件、权限过宽或内容无效会报错，不静默换账号。

Cookie仍是服务器长期使用的登录态；手机号密码只是获取登录态的可选入口，不会每次聊天重新登录。不要把密码写进Cookie框，不要把凭据发QQ或提交Git。真实密码登录尚未验收；接口/公钥变化可能需要更新。既有Cookie入口可继续用，不必重新登录。

## 本地人工执行发帖/点赞

`post.json`：
```json
{"kind":"post","title":"标题","text":"完整正文","topicIds":["58144"]}
```
`like.json`：
```json
{"kind":"like","url":"https://www.xiaoheihe.cn/app/bbs/link/帖子ID","liked":true}
```
```sh
node scripts/actions.js draft --cookie-file /安全目录/heybox.cookie --state-dir /安全目录/heybox-state --input /安全目录/post.json
node scripts/actions.js send --cookie-file /安全目录/heybox.cookie --state-dir /安全目录/heybox-state --draft 草稿ID
```

send 会展示完整草稿并要求交互输入 `SEND`。终端显式确认不依赖模型开关。草稿30分钟有效；账号变更、hash不符、过期拒绝发送。与评论共用目录时共享发送锁、每分钟1次/每天10次尝试、200条草稿上限。目录和草稿应妥善保护；额度耗尽或达到上限不会自动删除审计记录。

超时或缺少回执记为 `unknown`，不得重发；先在网页检查。服务崩溃留下 `.send-lock` 时，先检查 sending 记录和网页，再由管理员处理锁。

## 请求与资源

无新增依赖，无本地浏览器或模型。搜索/游戏共用6次操作/分钟、最多2个在途操作、32条5分钟缓存；与原帖子Reader分别计数。一次搜索可能含登录恢复、权限检查、搜索三次HTTP请求。其他账号/草稿工具不共用此只读缓存；写入另受持久化次数限制。所有JSON请求固定主机、不跟随重定向、10秒超时、响应上限1MiB。

搜索最多5页，每页最多10条，平台可能返回更少；分页用offset。游戏价格只转述接口数值，币种缺失时不推断，带获取时间。读取失败可继续正常聊天；不得编造数据。图片功能本版保持原状，实际识图问题另行处理。
