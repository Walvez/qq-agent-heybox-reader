# 宿主兼容

标准 API v1：`setup(api)`、`api.registerTool`、`api.config`、`api.fetch`、`before-llm-messages`。声明 `web_fetch` 权限，不引用任何宿主私有源码。配置每次执行读取；钩子无网络或QQ操作。

原版 QQ-agent：验证版本 aa66287132ac4ca504c10fb7caa7194bd2c27921。其 orchestrator 会将工具返回的 image_url 提升为下一轮 user 多模态消息。

京玉部分版本：工具图片分支限定 `get_message_images`，其他扩展返回的 image_url 只作为JSON字符串。需宿主把此分支扩展到所有**成功的工具结果**，继续沿用原来的图片数量、字符预算和模型能力闸。不要把图直接发送QQ。该适配属于宿主，不复制京玉代码到本项目。

维护者使用的私有宿主已部署并验证此兼容修改。未适配时请关闭 attachImages，仅做文字阅读，不宣称看到了图。

分享卡片识别支持嵌套对象、OneBot json字符串及XML属性链接。模型提示扫描最近3条user输入、最多64KiB、最多3个帖子。宿主如果只留下卡片标题而丢弃URL，本扩展无法凭空恢复链接。

旧宿主还应检查通用 /api/config 的秘密脱敏：仅设置页 secret:true 不一定覆盖通用配置接口。Cookie明文不得返回配置查询；旧京玉需将cookie纳入该接口秘密字段名单（维护者实例已修复）。未修复的宿主建议使用受保护的进程环境变量提供凭据。

0.3不新增宿主私有接口：搜索、游戏、草稿、发帖、点赞均用标准工具注册。0.4的主页和游戏时长同样只使用标准工具注册及 `api.fetch`，不读取宿主私有源码，不要求浏览器或宿主提供额外登录接口；`user` 为空时由现有 `credential()` 提供 Cookie。小黑盒QQ卡片宿主应保留 `meta.news.jumpUrl` 与 `meta.detail_1.qqdocurl`；适配后链接提取有效。工具图片进入模型的模拟链路通过不等于真实识图已验收，维护者报告的识图问题仍待单独处理。
