# 公开站点上线部署

`apps/public-site` 是生产官网静态站点。它包含：

- `/`：产品首页、套餐入口和备案信息。
- `/privacy/`：公开隐私政策，供 Chrome Web Store 填写。
- `/pay/`：订阅收银台，承接 API 返回的 `checkout.checkoutUrl`。

构建产物会自动包含本地 CSS/JS、产品截图、`robots.txt`、`sitemap.xml`、安全响应头和备案号 `蜀ICP备2026033716号`。

## 从 GitHub 拉取后构建

```bash
git clone https://github.com/eee623/zhongwen-fanyi.git
cd zhongwen-fanyi
npm ci
PUBLIC_SITE_BASE_URL=https://your-real-domain.com npm run build:public-site
```

输出目录：

```text
apps/public-site/dist
```

正式上线时必须把 `PUBLIC_SITE_BASE_URL` 换成真实 HTTPS 产品域名。这个值会写入首页 canonical、隐私政策 canonical、`robots.txt` 的 Sitemap 行和 `sitemap.xml`。

## Netlify 从 GitHub 部署

仓库根目录已经提供 `netlify.toml`，导入 GitHub 仓库后使用默认根目录即可：

```text
Build command: npm run build:public-site
Publish directory: apps/public-site/dist
Node version: 22
```

在 Netlify 环境变量中设置：

```text
PUBLIC_SITE_BASE_URL=https://your-real-domain.com
```

部署后检查：

```text
https://your-real-domain.com/
https://your-real-domain.com/privacy/
https://your-real-domain.com/pay/
https://your-real-domain.com/sitemap.xml
```

## 生产 API 必填配置

官网上线只需要静态托管；真实扣费和额度入账还需要生产 API。API 至少需要：

```text
API_ENV=production
LIVE_TRANSLATE_MODE=aliyun
DASHSCOPE_API_KEY=...
CLIENT_TOKEN_SECRET=...
BILLING_STORE_FILE=/var/lib/realtime-dubbing/billing.json
PAYMENT_LEDGER_FILE=/var/lib/realtime-dubbing/payment-ledger.json
PAYMENT_ORDER_STORE_FILE=/var/lib/realtime-dubbing/payment-orders.json
PAYMENT_CHECKOUT_BASE_URL=https://your-real-domain.com/pay
PAYMENT_STATUS_BASE_URL=https://api.your-real-domain.com
PAYMENT_CHECKOUT_TOKEN_SECRET=...
PAYMENT_VERIFICATION_MODE=production
ALIPAY_PUBLIC_KEY_FILE=/etc/realtime-dubbing/alipay-public.pem
WECHATPAY_PLATFORM_CERT_SERIAL=...
WECHATPAY_PLATFORM_CERT_FILE=/etc/realtime-dubbing/wechatpay-platform.pem
WECHATPAY_API_V3_KEY=...
```

完整模板见 `docs/production.env.example`。发布前运行：

```bash
npm run check:production-config
```

这个命令会阻止 mock 翻译、开发 token、内存账本、非 HTTPS 支付 URL、占位域名、短 secret 和缺失的支付宝/微信验签材料进入生产。

## 支付联调边界

收银台默认展示支付宝，也允许用户切换微信支付。页面只接受 HTTPS 支付入口和二维码地址：

- 支付宝：服务端创建支付宝电脑网站支付订单后，把可跳转支付入口返回给收银台。
- 微信支付：服务端创建微信 Native 或 H5 支付订单后，把支付入口或二维码图片返回给收银台。
- 订单状态：服务端返回签名只读 `statusUrl`，收银台轮询订单状态，支付成功后显示到账结果。

API 当前已经具备订单创建、签名状态查询、订单过期/取消、生产 webhook 验签、订单金额匹配、幂等入账和持久化文件账本。正式收款前，需要在服务端接入真实支付宝预下单和微信预下单，并把生成的支付入口或二维码地址写回订单状态响应。

## Chrome Web Store

站点部署完成后设置：

```text
CHROME_STORE_PRIVACY_POLICY_URL=https://your-real-domain.com/privacy/
PAYMENT_CHECKOUT_BASE_URL=https://your-real-domain.com/pay
```

发布前运行：

```bash
CHROME_STORE_PRIVACY_POLICY_URL=https://your-real-domain.com/privacy/ npm run check:chrome-store
CHROME_STORE_PRIVACY_POLICY_URL=https://your-real-domain.com/privacy/ npm run package:chrome-store
```

`check:chrome-store` 会真实请求公开隐私政策 URL，并确认页面包含音频处理、不保存原始音频、不保存声纹、账号、订阅、支付和 Limited Use 等披露。
