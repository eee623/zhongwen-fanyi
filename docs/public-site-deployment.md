# 公开站点部署

`apps/public-site` 是推荐的生产静态站点。它把 Chrome Web Store 需要的公开隐私政策和官网订阅收银台放到同一个产品域名下：

- `/privacy/`：公开隐私政策，供 Chrome Developer Dashboard 填写。
- `/pay/`：订阅收银台，承接 API 返回的 `checkout.checkoutUrl`。
- `/`：根入口，链接到隐私政策和订阅收银台。

## 构建

```bash
PUBLIC_SITE_BASE_URL=https://your-domain.example npm run build:public-site
```

输出目录：

```text
apps/public-site/dist
```

`PUBLIC_SITE_BASE_URL` 会写入隐私政策 canonical URL。正式发布时应使用真实产品域名，不要使用 `localhost`、`example.com`、占位符或与本产品无关的站点。

## 静态托管

Netlify 项目目录可选 `apps/public-site`：

```text
Build command: npm run build
Publish directory: dist
```

`apps/public-site/netlify.toml` 已包含同样配置。也可以先本地构建，再把 `apps/public-site/dist` 作为静态目录手动部署到任何公开 HTTPS 静态托管。

## 上线配置

当前 Chrome Web Store 审核别名：

```text
https://chrome-store--realtime-dubbing-cn.netlify.app/privacy/
```

部署完成后，在 Chrome 上架和 API 环境中使用同一个域名：

```text
CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy
PAYMENT_CHECKOUT_BASE_URL=https://your-domain.example/pay
```

部署拿到公开 HTTPS 域名后，可以先生成审核和支付环境变量：

```bash
npm run public-site:release-urls -- https://your-domain.example
```

也可以从 Chrome Store submission metadata 里的隐私政策 URL 生成生产 API 草案：

```bash
npm run production:env:draft
```

发布前运行：

```bash
CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run check:chrome-store
CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run package:chrome-store
```

`check:chrome-store` 会真实请求隐私政策 URL。只有页面可访问且包含隐私政策、音频处理、不保存原始音频、不保存声纹、账号、订阅、支付和 Limited Use 等披露时，发布门才允许通过。
