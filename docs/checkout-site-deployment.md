# 收银台部署

`apps/checkout-site` 是第一版官网订阅收银台的静态站点。它承接 API 返回的 `checkout.checkoutUrl`，从 URL 查询参数读取 `orderId`、`provider` 和 `packageId`，展示订单号、支付方式、套餐和金额。

当前页面不直接调用支付宝或微信支付 SDK。真实预下单和二维码/跳转按钮接入后，应继续复用同一个 `/pay` 路径和订单查询参数。

## 构建

推荐使用统一公开站点，它会同时输出 `/privacy/` 和 `/pay/`：

```bash
PUBLIC_SITE_BASE_URL=https://your-domain.example npm run build:public-site
```

输出目录：

```text
apps/public-site/dist
```

独立收银台站点仍可单独构建。

```bash
npm run build -w @realtime-dubbing/checkout-site
```

输出目录：

```text
apps/checkout-site/dist
```

关键文件：

- `pay/index.html`：API `PAYMENT_CHECKOUT_BASE_URL` 推荐指向的收银台路径。
- `index.html`：同一收银台页面，方便根路径预览。
- `assets/checkout.css`：本地样式，支持浅色/深色系统偏好。
- `assets/checkout.js`：本地脚本，只读取 URL 查询参数并使用 `textContent` 写入页面。
- `_headers`：静态托管安全头，包含 CSP、`nosniff`、`DENY` frame policy。
- `robots.txt`：禁止搜索引擎抓取订单页面。

## API 配置

部署到公开 HTTPS 后，在 API 环境里配置：

```text
PAYMENT_CHECKOUT_BASE_URL=https://your-domain.example/pay
```

`POST /v1/payment-orders` 会在订单响应里追加：

```json
{
  "checkout": {
    "mode": "provider_redirect_pending",
    "checkoutUrl": "https://your-domain.example/pay?orderId=...&provider=alipay&packageId=pro_20m_cny_39&statusUrl=...",
    "statusUrl": "https://api.your-domain.example/v1/payment-orders/ord_.../status?token=..."
  }
}
```

扩展只会自动打开 HTTPS checkout URL；非 HTTPS 或非法 URL 会被忽略，只显示订单号和金额。

若需要让收银台查询订单状态，还要配置：

```text
PAYMENT_STATUS_BASE_URL=https://api.your-domain.example
PAYMENT_CHECKOUT_TOKEN_SECRET=random-checkout-status-signing-secret
```

`statusUrl` 是签名只读查询 URL，返回订单状态但不返回用户 ID；错误 token 或被篡改的订单号会被拒绝。

待支付订单默认 30 分钟过期。收银台状态查询可能返回 `pending`、`paid`、`canceled` 或 `refunded`；过期订单会显示为 `canceled` 并带 `cancelReason: "expired"`。

## Netlify

若创建 Netlify 项目，推荐项目目录使用 `apps/public-site`，构建命令和发布目录为：

```text
Build command: npm run build
Publish directory: dist
```

`apps/public-site/netlify.toml` 已包含同样配置。若只部署收银台，项目目录也可选 `apps/checkout-site`，构建命令和发布目录为：

```text
Build command: npm run build
Publish directory: dist
```

`apps/checkout-site/netlify.toml` 已包含同样配置。不要把订单页部署到与本产品无关的现有站点。
