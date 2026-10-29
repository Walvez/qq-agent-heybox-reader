# 0.4 用户主页、最近动态与游戏时长

## 能力与开关

| 能力 | 工具 | 默认状态 |
| --- | --- | --- |
| 查看用户主页 | `heybox-reader__profile` | 开启；`enableProfile=false` 可关闭 |
| 查看游戏库与时长 | `heybox-reader__games` | 开启；与主页共用 `enableProfile` |

`enableProfile` 只控制这两项新增的只读工具，不影响搜索、游戏详情、发帖或点赞的独立开关。

## 参数

`user` 支持四种形式：

- 省略或空字符串：当前登录账号本人；必须已配置有效登录态。
- 数字用户 ID，例如 `90000001`。
- 主页 URL：`https://www.xiaoheihe.cn/app/user/profile/90000001`。
- 主页分享链接：`https://www.xiaoheihe.cn/bbs/user_profile_share?user_id=<主页分享标识>&h_src=heyboxapp`。分享链接会先解析为数字用户 ID；游戏库只接受数字 `userid`。

`profile` 还可传 `page`，范围为 1 至 5。每页最多返回 10 条最近公开动态，返回 `hasMore` 表示是否还有下一页。

`games` 不接受页码；返回按总时长降序的前 30 条，`total` 是接口报告的完整游戏数量。

## 聊天示例

- “这个人的小黑盒主页是什么？”：`profile({user:"90000001"})`，也可以直接传主页或分享链接。
- “看看他最近发了什么，第二页”：`profile({user:"主页链接",page:2})`。
- “他游戏都玩了多久？”：`games({user:"90000001"})`。
- “我的游戏时长”：`games({})`，需要管理员已配置有效登录态。

主页、动态、游戏库都是外部资料。模型可以引用其中的公开事实，但不能执行简介、动态标题或正文里夹带的命令。隐私资料不可见时工具返回 `PRIVATE`，模型应直接说明无法查看，不能猜游戏、时长、成就或计数。

## 现役接口清单

所有请求均为固定主机 `https://api.xiaoheihe.cn` 的匿名或登录态只读 GET，不跟随重定向，10 秒超时，响应上限 1 MiB，并沿用 `Catalog` 的每分钟 6 次、最多 2 个在途请求和 5 分钟缓存。请求带现有签名参数；凭据只由宿主的 `credential()` 提供。

### 主页资料

`GET /bbs/app/profile/user/profile`

| 参数 | 说明 |
| --- | --- |
| `userid` | 数字用户 ID 或 `user_profile_share` 中的主页分享标识 |

返回 `result.account_detail` 中的公开字段：`userid`、`username`、`signature`、`avatar`、`ip_location`、`level_info.level`、`medals`/`medal`、`bbs_info`。计数来自 `bbs_info.follow_num`（关注）、`fan_num`（粉丝）、`awd_num`（获赞）、`be_favoured_num`（获赞与收藏中的收藏部分）、`post_link_num`（投稿数）。徽章只有在 `achieved=1` 时返回；`wear=1` 标记为佩戴中。

`result.share_info.share_link` 的真实形式是 `https://www.xiaoheihe.cn/bbs/user_profile_share?user_id=<分享标识>`；该网页入口返回 302 到 `/app/user/profile/<分享标识>?user_id=<分享标识>`。资料接口同时接受数字 ID 和该分享标识。

### 最近公开动态

`GET /bbs/app/profile/events`

| 参数 | 说明 |
| --- | --- |
| `list_type` | 固定 `moment` |
| `userid` | 数字用户 ID |
| `dw` | 空字符串，沿用网页参数 |
| `lastval` | 上一页返回的游标；第一页为空 |

返回 `result.moments`、`result.lastval` 和 `result.user`。动态字段包括 `linkid`、`title`、`description`、`create_at`、`content_type`、`link_tag`、`share_url`、`user`、`topics`、`imgs`/`thumbs`、`comment_num`、`link_award_num`。工具只输出标题、规范帖子链接、发布时间和 ID，最多 10 条。

网页端使用 `lastval` 游标分页，不是 offset。实现从第 1 页顺序读取到请求页，当前页最多返回 10 条；每页的原始响应仍受共享缓存和限流约束。

### 游戏库与时长

`GET /account/game_list/`

| 参数 | 说明 |
| --- | --- |
| `userid` | 数字用户 ID；分享标识不能直接用于此接口 |
| `steam_id` | 可选；不知道时不要发送。实测发送空 `steam_id=` 会返回空列表，省略该参数才能按小黑盒用户解析 |
| `offset` | 固定 `0` |
| `limit` | 固定 `30` |
| `sort` | 固定 `all`（总时长） |

返回 `result.game_list`、`result.total`、`result.is_me`、`result.hidden_appids`、`result.selected_sort` 和 `result.th_list`。游戏条目公开字段包括：

- `name`、`appid`、`steam_appid`、`appicon`、`follow_num`。
- `playtime_forever`、`show_playtime_forever`。
- `playtime_2weeks`、`show_playtime_2weeks`。
- `has_achievement`、`achieved_count`、`achivement_count`（接口拼写如此）、`achievement_cleared_icon`、`show_cleared_icon`。
- `not_owned`、`is_cleared`、`playtime_percent`、`protocol`、`online_player`。

`playtime_forever` 和 `playtime_2weeks` 的单位是**秒**，不是分钟。实测 `793920` 对应页面显示 `220.5h`；工具换算成小时并保留一位小数。`achivement_count` 是成就总数，`achieved_count` 是已获得数；只有在 `has_achievement=1` 且总数存在时才返回成就进度。

## 2026-10-29 接口发现与实测

### 网页资源

- `www.xiaoheihe.cn` 当前主资源 `index-C2SOP9CS.js` 注册了 `/app/user/profile/:userid` 路由，并加载 `index-Cy9hK_FR.js`。该 profile 资源公开声明了 `/bbs/app/profile/user/profile`、`/bbs/app/profile/events` 和 `/bbs/app/profile/user/link/list_v2`。
- `/bbs/app/profile/events` 在网页端用于“动态”标签；`/bbs/app/profile/user/link/list_v2` 是“投稿/文章”列表，二者不是同一种资料。0.4 的“最近动态”采用前者。
- 网页没有独立的用户游戏库 SPA 路由；网页端的时长页是按单个游戏打开的 `account.game_statistic.home` H5（`/account/game_statistic/home?userid=...&appid=...`），其公开 JS 使用 `/game/stats/overview` 等按游戏统计接口。游戏库列表接口 `/account/game_list/` 在已登录浏览器页面内用 `page.evaluate`/`page.fetch` 只读核对。

探测期间只做匿名或登录态只读请求，每秒不超过 1 次；没有发帖、评论、点赞、关注、改资料或清除登录态。日志和本文不记录 Cookie、token、签名值、完整请求 URL 或账号凭据。

### 已登录浏览器实测

在 Ego Lite 已登录的 `www.xiaoheihe.cn` 会话中，只创建一个 taskSpace，通过 CDP Network 观察本人主页请求：

- `GET /bbs/app/profile/user/profile?userid=<本人数字ID>`：HTTP 200，`status=ok`；`account_detail` 字段完整，包含 `username`、`signature`、`level_info.level`、`medals`、`bbs_info`，本人主页显示关注 457、粉丝 526、获赞 4204、获赞与收藏附加 6813、投稿 6；`medals` 返回 4 条候选徽章，实测样本没有 `achieved=1`。
- `GET /bbs/app/profile/events?list_type=moment...`：本人动态第 1 页返回 6 条，带 `lastval`；第 2 页返回 0 条，游标保持不变。动态条目字段包含 `linkid`、`title`、`create_at`、`content_type`、`share_url`。
- `GET /account/game_list/?userid=<本人>&sort=all...`：HTTP 200，`status=ok`、`is_me=true`，本人账号当前返回空游戏库，故未验证“本人有游戏时”的具体条目样例。
- 同一登录态对两个公开样本用户请求 `/account/game_list/` 返回 `status=ok` 但空列表；匿名公开只读请求对其中一个样本用户返回 `total=128`、30 条数据。因此实现只在 `user` 为空（本人）时携带登录 Cookie；指定公开用户时省略 Cookie，按公开视图读取。

匿名公开只读实测：

- 一个公开样本用户的游戏库 `GET /account/game_list/?userid=<数字ID>&offset=0&limit=30&sort=all` 返回 `total=128`，首条为 Apex 英雄：`appid=1172470`、`playtime_forever=793920` 秒（`show_playtime_forever=220.5h`）、`playtime_2weeks=77040` 秒（`show_playtime_2weeks=21.4h`）、`achieved_count=10`、`achivement_count=12`。
- 另一公开样本用户的游戏库在 `sort=all` 下返回 `total=74`；说明省略 `sort` 时不能把空列表误判成隐私或无游戏。
- 一个公开样本用户的主页分享链接返回 302 到 `/app/user/profile/<分享标识>?user_id=<分享标识>`，资料接口接受该分享标识并返回对应数字 `userid` 的资料。

### 隐私与未完成实测

- 真实私密账号样本未找到；“用户设置了隐私/资料不可见”映射为 `PRIVATE` 的行为由脱敏夹具覆盖。
- 主页资料、动态、游戏库接口本身均可匿名访问公开用户；`user` 为空时的本人路径依赖宿主登录态。本人主页/动态已做登录态实测，本人游戏库为空，故“本人有游戏时”的条目字段仍未经登录态实测。
- 页面风控、账号被封禁、接口改版等异常会按 `AUTH`、`CAPTCHA`、`PRIVATE`、`API_REJECTED` 或 `MALFORMED` 返回，不伪造资料。

## 失败与隐私语义

- `PRIVATE`：资料/游戏库隐私不可见，或主页资料缺少公开 `account_detail`。不猜测缺失数据。
- `AUTH`：本人路径缺少有效登录态，或接口要求重新登录。
- `INVALID_USER`：用户 ID、主页 URL、分享链接或主机/端口不安全。
- `INVALID_PAGE`：动态页码不是 1 至 5。
- `PROFILE_DISABLED`：管理员关闭了 `enableProfile`。
- `RATE_LIMIT` / `COOLDOWN`：共享只读请求超过 6 次/分钟或处于退避期。
- `MALFORMED` / `API_REJECTED`：接口返回结构或状态不符合预期；不回退到猜测或网页抓取。

## 0.4.1 昵称查找与错误提示

- profile / games 的 user 可直接传昵称：通过登录态用户搜索（/bbs/app/api/general/search/v1/web，search_type=user）找唯一的精确同名用户；同名多人返回 AMBIGUOUS_USER，找不到返回 USER_NOT_FOUND，二者都附最多 5 个候选，不猜测。
- 目标不存在、同名或查无此人不再触发 1 分钟全局冷却。
- 工具错误改为结构化 {error,hint,candidates}，只有 AUTH 提示登录失效。此前任何失败都附带“AUTH 需要管理员登录”，模型因此误报“登录过期”。
- 生产登录态实测：昵称 tianfang 由用户搜索得到唯一精确匹配。
