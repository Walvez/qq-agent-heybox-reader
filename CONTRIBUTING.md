# Contributing

先运行 npm ci --ignore-scripts 和 npm test。回归测试使用合成数据，禁止提交Cookie、账号资料、真实群聊和宿主配置。新接口需提供公开协议来源、失败处理和资源上限，避免后台抓取、浏览器依赖或自动发群消息。

网络probe属于可选手动测试，不放进CI。报告问题请提供宿主版本、扩展版本、错误类别和可公开的最小复现，不附请求头。上游签名更新必须保留MIT许可证与来源版本。

首次发布由维护者检查 git ls-files、npm pack --dry-run 和依赖审计，再明确批准公开仓库。package.json 保留 private:true，防止误发npm；GitHub开源不受该字段影响。
