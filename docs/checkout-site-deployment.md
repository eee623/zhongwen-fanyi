# 收银台部署

`apps/checkout-site` 是官网订阅收银台的静态站点。它承接 API 返回的 `checkout.checkoutUrl`，从 URL 查询参数读取 `orderId`、`provider`、`packageId`、`statusUrl`、支付入口和二维码地址，展示订单号、支付方式、套餐、金额、支付入口、二维码和订单状态。

当前页面不在前端处理支付签名、私钥、预下单或回调验签。真实支付宝/微信支付接入应在服务端完成预下单并生成安全的 HTTPS 支付入口或二维码图片，再把结果传给同一个 `/pay` 页面。

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
    "checkoutUrl": "https://your-domain.example/pay?orderId=...&provider=alipay&packageId=pro_20m_cny_39&statusUrl=...&paymentUrl=...",
    "statusUrl": "https://api.your-domain.example/v1/payment-orders/ord_.../status?token=...",
    "paymentUrl": "https://api.your-domain.example/v1/payment-orders/ord_.../pay"
  }
}
```

扩展只会自动打开 HTTPS checkout URL；非 HTTPS 或非法 URL 会被忽略，只显示订单号和金额。

收银台会额外识别这些 HTTPS 参数：

- `alipayPaymentUrl`：支付宝电脑网站支付跳转入口。
- `wechatPaymentUrl`：微信 H5 或后端托管的微信支付入口。
- `wechatQrCodeUrl`：微信 Native 支付二维码图片 URL。
- `paymentUrl`：兼容旧版本的通用支付入口。若没有按渠道返回地址，页面会回退使用它。
- `qrCodeUrl`：兼容旧版本的通用微信二维码图片。
- `statusUrl`：签名只读订单状态接口。若状态响应体后续返回上述 HTTPS 字段，页面会用最新值刷新支付操作区。

若需要让收银台查询订单状态，还要配置：

```text
PAYMENT_STATUS_BASE_URL=https://api.your-domain.example
PAYMENT_CHECKOUT_TOKEN_SECRET=random-checkout-status-signing-secret
```

`statusUrl` 是签名只读查询 URL，返回订单状态但不返回用户 ID；错误 token 或被篡改的订单号会被拒绝。

待支付订单默认 30 分钟过期。收银台状态查询可能返回 `pending`、`paid`、`canceled` 或 `refunded`；过期订单会显示为 `canceled` 并带 `cancelReason: "expired"`。

## Netlify

若创建 Netlify 项目，推荐直接导入仓库根目录。根目录 `netlify.toml` 已包含统一公开站点配置：

```text
Build command: npm run build:public-site
Publish directory: apps/public-site/dist
```

也可以把项目目录设为 `apps/public-site`，构建命令和发布目录为：

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
