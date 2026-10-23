# qq-agent-heybox-reader

一个轻量 QQ-agent Skill：读小黑盒帖子，让机器人理解内容再参与讨论。MIT，Node.js 20+，无需浏览器、Python、数据库或本地模型。当前为 0.1.0 候选版，尚未公开发布。

## 能做什么

- 识别帖子网页、分享链接、QQ JSON/XML 分享卡片里的原始 URL。
- 读取标题、作者、正文、最多12张图片地址；视觉模型每次最多附3张图。
- 按需读取评论，每页最多10条、最多请求第5页；不是完整评论归档。
- 不发送 QQ 消息、不修改 JEV/唤醒规则、不自动转发全文。模型可以读完保持沉默。
- 匿名优先；可选 Cookie。接口失败只给模型错误资料，聊天仍可继续。

## 安装

在 QQ-agent 根目录的 `skills/heybox-reader/` 放入本项目完整文件（不是符号链接；部分加载器跳过符号链接目录），然后：

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

控制台 Skill 设置：`attachImages` 默认开启；`cookie` 是可选密码字段。匿名遇到登录要求时，由管理员在本地控制台填写自己的 Cookie；也支持进程环境变量 `HEYBOX_COOKIE`。不要把 Cookie 发群里、写进仓库或命令历史。配置密码字段依赖宿主的脱敏机制。

Cookie 只发到固定 `https://api.xiaoheihe.cn`，禁止重定向。不获取或绕过验证码。请求风控时退避60秒，不轮询其他接口绕过风控。清除 Cookie 请按宿主的秘密字段清除流程操作（部分宿主提交空串表示不修改）。

## 资源和限制

10秒超时，响应上限1MiB，最多2个在途请求、每分钟6次；5分钟内存缓存最多32项，同请求合并。正文最多12000字符，图片只传URL不下载、不渲染、不OCR。视觉模型自身可能产生调用费用。无后台轮询或定时器。

仅支持明确的帖子URL；不支持任意短链、游戏详情、登录、发帖、点赞或搜索。接口为非官方接口，可能变动；私密/删除帖子不会伪造成功。外部正文视为不可信资料，提示词提醒不能代替宿主权限控制。

## 开发与验证

```sh
npm ci --ignore-scripts
npm test
npm run probe -- 'https://www.xiaoheihe.cn/app/bbs/link/帖子ID'
# 可选 --comments；只读网络请求，不调用LLM/QQ
```

`QQ_AGENT_DATA_DIR=<新建空目录> node scripts/host-check.js <QQ-agent源码路径>` 验证真实加载器。不要指向生产数据。

[测试结果](docs/TEST_RESULTS.md) · [设计与开源参考](docs/DESIGN.md) · [第三方版权](THIRD_PARTY_NOTICES.md)
