# 隐私政策部署

Chrome Web Store 要求扩展在 Developer Dashboard 中填写公开可访问的隐私政策 URL。这个项目不能使用 `localhost`、`example.com`、占位符，不能只把隐私政策写在商店描述里，也不能部署到与本产品无关的站点。

## 构建

推荐使用统一公开站点，它会同时输出 `/privacy/` 和 `/pay/`，方便 Chrome 隐私政策 URL 与订阅收银台共用一个产品域名：

```bash
PUBLIC_SITE_BASE_URL=https://your-domain.example npm run build:public-site
```

输出目录：

```text
apps/public-site/dist
```

关键文件：

- `privacy/index.html`：Chrome Developer Dashboard 应填写的隐私政策页面。
- `pay/index.html`：API `PAYMENT_CHECKOUT_BASE_URL` 推荐指向的收银台路径。
- `index.html`：公开站点根入口，链接到隐私政策和收银台。
- `_headers`：静态托管安全头，包含 CSP、`nosniff`、`DENY` frame policy。
- `robots.txt`：允许抓取 `/privacy/`，禁止抓取 `/pay/`。

独立隐私政策站点仍可单独构建。

隐私政策源稿在 `docs/privacy-policy-public.md`，静态站点 workspace 在 `apps/privacy-site`：

```bash
npm run build -w @realtime-dubbing/privacy-site
```

输出目录：

```text
apps/privacy-site/dist
```

关键文件：

- `privacy/index.html`：Chrome Developer Dashboard 应填写的隐私政策页面。
- `_headers`：静态托管安全头，包含 CSP、`nosniff`、`DENY` frame policy。
- `robots.txt`：允许抓取 `/privacy/`，避免公开 URL 被错误隐藏。
- `index.html`：根路径跳转到 `/privacy/`。

## Netlify

若创建 Netlify 项目，推荐项目目录使用 `apps/public-site`，构建命令和发布目录为：

```text
Build command: npm run build
Publish directory: dist
```

`apps/public-site/netlify.toml` 已包含同样配置。若只部署隐私政策，项目目录也可选 `apps/privacy-site`，构建命令和发布目录为：

```text
Build command: npm run build
Publish directory: dist
```

`apps/privacy-site/netlify.toml` 已包含同样配置。也可以先本地构建，再把 `apps/public-site/dist` 或 `apps/privacy-site/dist` 作为静态目录手动部署。

当前 Netlify 账户只有一个 `maggie-okr-dashboard` 项目，它不是本产品站点，不能复用为本扩展隐私政策。创建新的 `realtime-dubbing` 或同名官网项目后，再把真实 URL 写入 Chrome 上架流程。

## 上架门

拿到公开 HTTPS URL 后运行：

```bash
CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run check:chrome-store
CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run package:chrome-store
```

`check:chrome-store` 会真实请求该 URL。只有页面可访问且包含隐私政策、音频处理、不保存原始音频、不保存声纹、账号、订阅、支付和 Limited Use 等披露时，发布门才允许通过。
