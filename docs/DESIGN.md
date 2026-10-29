# 设计取舍

先研究原版与京玉的扩展加载器、工具执行器、B站读取链路。原版 media.download 链路以确定性下载转发为目的；本项目不认领该能力，避免群友贴链接就转发。采用可注册工具的标准Skill，轻量链接提示 + 模型按需读取。

参考评估：

| 项目 | 价值 | 采用方式 |
|---|---|---|
| Qfxaile/astrbot_plugin_multi_parser | 拆分清晰的帖子接口、HTML正文、签名、Cookie白名单 | 参考API参数与正文结构，独立Node实现 |
| Mzkena99/nonebot_plugin_heybox_parser | 分享链接、评论树、多接口/网页解析、渲染 | 参考分享URL和评论结构；不引入Python/渲染，不采用验证码后轮询接口 |
| plasta2steel/dsh-xiaoheihe | Node签名和论坛API；带整套控制台 | 复用MIT签名模块，保留许可证；不引入控制台、登录状态管理和后台轮询 |

阅读使用 `/bbs/app/link/tree` 接口。帖子与当前评论页来自同一响应，默认隐藏评论；用户需要时请求限定页。唯一直接依赖 htmlparser2 用于HTML实体和标签解析，避免以正则充当HTML解析器。依赖锁定见package-lock。

限流/缓存是进程级，不跨进程共享；凭据哈希参与缓存键，配置变更不会混用不同登录态。未缓存错误，采用短暂退避。允许的图片CDN为 max-c.com、xiaoheihe.cn 的HTTPS子域，图片由宿主模型侧处理。

0.2增加官方网页登录恢复与权限检查，回复使用固定comment/create端点；只读与发布分离。发布不是后台任务，不重试；凭据从宿主配置读取，短期pkey留内存，发送记录存仓库外。默认发布关闭，管理员启用才允许模型发布。

## 0.3 接口依据

搜索参考 [dsh-xiaoheihe](https://github.com/plasta2steel/dsh-xiaoheihe) 的search_type=link与offset分页；游戏参考 [astrbot_plugin_multi_parser](https://github.com/Qfxaile/astrbot_plugin_multi_parser) 的get_game_detail方案，直接使用固定JSON接口，未引入其Python运行时。[nonebot_plugin_heybox_parser](https://github.com/Mzkena99/nonebot_plugin_heybox_parser) 保留作帖子解析参考。新增代码独立实现，既有签名版权说明保持。

2026-10-24核对[小黑盒官方网页](https://www.xiaoheihe.cn/)公开客户端：index-BcnLlQNw的account/login手机号/密码RSA字段；index-BSaSF8Su的bbs/app/api/link/post表单和link_id回执；index-DZNUuPXv的bbs/app/profile/award/link、award_type=0/1。没有复制官方JS bundle或任何登录态进仓库。这些均为非官方、未承诺稳定的接口。

## 0.4 主页与游戏时长

主页资料和最近动态来自 `www.xiaoheihe.cn` 当前 SPA 的 `UserProfile` 资源：`index-C2SOP9CS.js` 注册 `/app/user/profile/:userid`，`index-Cy9hK_FR.js` 声明 `/bbs/app/profile/user/profile`、`/bbs/app/profile/events` 和文章列表接口。网页“动态”标签用 `list_type=moment` 和 `lastval` 游标；文章标签才用 `list_v2` 的 offset。0.4选择动态接口，并顺序解析游标实现 page 1-5。

游戏库没有独立网页 SPA 路由；网页时长页是按游戏的 `account.game_statistic.home` H5，游戏库列表 `/account/game_list/` 通过已登录浏览器页面内的只读请求核对。`sort=all` 才按总时长排序；`playtime_forever`/`playtime_2weeks` 的单位是秒。游戏库对公开用户可由匿名请求读取；登录态查看其他用户可能返回空列表，因此指定用户时不带宿主 Cookie，只有 `user` 为空、明确表示本人时才使用登录态。

新增接口仍走 `Catalog`：固定 `api.xiaoheihe.cn`、不跟随重定向、10秒超时、1MiB上限、每分钟6次、最多2个在途请求、5分钟32项缓存。主页分享标识不能直接用于 `/account/game_list/`，先通过资料接口解析成数字 `userid`。隐私不可见统一返回 `PRIVATE`，不从空列表推断隐私或编造数据。
