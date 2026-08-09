# 09 · GitHub Pages 自定义域名

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P2 · 可选任务，不阻塞首次公开版本
>
> 状态：待决定是否执行

## 任务目标

决定是否把当前 GitHub Pages Project Site 从默认地址迁移到自定义域名；只有 owner 明确选择域名后才执行 DNS 和 Pages 配置。

## 当前状态

GitHub Pages 对 Project Site 的默认地址结构是：

```text
https://<owner>.github.io/<repository>/
```

当前默认地址为：

```text
https://highestpeak.github.io/obsidian-peak-assistant/
```

本仓库通过 `.github/workflows/pages.yml` 使用 GitHub Actions 发布 `website/`。保持默认地址不会阻塞首次公开版本。

当前页面资源大多使用相对路径，但 `website/index.html` 中的以下 metadata 仍写死默认 Pages 地址：

- `og:url`
- `og:image`
- `twitter:image`

如果启用自定义域名，需要同步更新并验证分享预览。

## 1. 先做决策

选择一个结果：

- [ ] 继续使用默认 Project Site URL，本任务关闭。
- [ ] 使用子域名，例如 `peak.<domain>`。
- [ ] 使用子域名，例如 `assistant.<domain>`。
- [ ] 购买并使用独立根域名。

同时确认：

- [ ] 域名购买与续费 owner。
- [ ] DNS 账号 owner 和恢复方式。
- [ ] 域名是否还要承载其他网站。
- [ ] 品牌收益是否值得引入长期维护成本。

若已有其他网站使用同一根域名，优先考虑独立子域名。不要只为了“看起来更正式”阻塞发布。

## 2. 子域名实施步骤

只有选择子域名后才执行：

- [ ] 购买或选定具体域名和 DNS 服务商。
- [ ] 先在 GitHub 验证自定义域名，降低域名接管风险。
- [ ] 在仓库 **Settings → Pages → Custom domain** 填入完整子域名。
- [ ] 在 DNS 中创建 CNAME。
- [ ] CNAME 名称使用子域名前缀，例如 `peak`。
- [ ] CNAME 目标填写 `highestpeak.github.io`。
- [ ] CNAME 目标不附加 `/obsidian-peak-assistant`。
- [ ] 不使用 `*.example.com` 这类 wildcard DNS 记录。
- [ ] 使用 `dig` 或 DNS 服务商工具确认记录生效。
- [ ] DNS 生效后开启 **Enforce HTTPS**。

GitHub Actions 发布模式不需要在 `website/` 中维护 `CNAME` 文件。GitHub 官方说明：自定义 Actions workflow 不会创建该文件，现有 `CNAME` 也会被忽略。

## 3. 根域名实施步骤

只有选择根域名后才执行：

- [ ] 在 GitHub Pages 中配置根域名。
- [ ] 根据 DNS 服务商能力配置 `ALIAS` 或 `ANAME`。
- [ ] 如果服务商不支持上述记录，配置 GitHub Pages 官方 `A` 记录。
- [ ] 如需 IPv6，再配置官方 `AAAA` 记录，并保留 `A` 记录。
- [ ] 评估是否同时配置 `www`。
- [ ] 验证根域名与 `www` 的 HTTPS 和重定向。

实施时从 GitHub 官方文档复制当前 IP 地址，不把本任务记录中的旧地址当成永久配置真值。

## 4. 仓库内容更新

- [ ] 更新 `website/index.html` 的 `og:url`。
- [ ] 更新 `og:image`。
- [ ] 更新 `twitter:image`。
- [ ] 检查是否需要 canonical URL。
- [ ] 检查 README 和公开文档中的网站地址。
- [ ] 检查站内绝对链接。
- [ ] 保持静态资源链接可在自定义域名根路径加载。

## 5. 线上验证

- [ ] 自定义域名可以打开首页。
- [ ] 默认 Pages URL 正确跳转到自定义域名。
- [ ] HTTPS 有效且没有 mixed content。
- [ ] CSS、JavaScript、图片和视频正常加载。
- [ ] 页面刷新和锚点链接正常。
- [ ] Docs、GitHub 和下载链接正常。
- [ ] Open Graph 与 Twitter card 使用新域名。
- [ ] 社交分享预览显示正确标题、描述和图片。
- [ ] DNS 配置经过 `dig` 或等效工具验证。

## 6. 回滚

- [ ] 记录变更前的 Pages 设置和 DNS 记录。
- [ ] 如配置失败，从 Pages 设置移除自定义域名。
- [ ] 恢复或删除新增 DNS 记录。
- [ ] 恢复默认 Pages URL 的 metadata。
- [ ] 重新验证默认 Project Site 可访问。

## 完成条件

- [ ] 明确记录“保留默认 URL”或“启用具体域名”。
- [ ] 若启用域名，DNS、HTTPS、跳转、资源和 metadata 全部通过线上验证。
- [ ] 若暂不执行，本任务保持 P2，不影响默认 GitHub Pages 地址上线。

## 官方参考

- [GitHub Pages 的站点类型与默认 URL](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [管理 GitHub Pages 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [排查 GitHub Pages 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)

## 不要做

- 不在域名尚未选定时修改 DNS。
- 不把仓库名附加到 CNAME 目标。
- 不使用 wildcard DNS。
- 不把自定义域名升级成首次上线阻塞项。
