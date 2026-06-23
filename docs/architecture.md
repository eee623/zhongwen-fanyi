# 架构说明

## 组件

- `packages/shared`：扩展和 API 共用的设置、阿里会话配置、消息类型和延迟指标。
- `apps/extension`：WXT Chrome MV3 扩展。
- `apps/api`：Node.js WebSocket API，保护阿里 Key，并处理订阅额度。
- `apps/public-site`：推荐部署的公开静态站点，同时提供 `/privacy/` 隐私政策和 `/pay/` 订阅收银台。
- `apps/privacy-site`、`apps/checkout-site`：可独立部署的隐私政策站点和收银台站点，供特殊部署场景复用。

## 运行模式

- `LIVE_TRANSLATE_MODE=aliyun`：默认生产路径，必须配置 `DASHSCOPE_API_KEY`，后端连接阿里 LiveTranslate。
- `LIVE_TRANSLATE_MODE=mock`：本地开发回环，不连接阿里，收到浏览器音频 chunk 后返回模拟中文字幕和一段 16k PCM 音频，用于验证扩展捕获、字幕、译声播放和 WebSocket 管线。
- 扩展里的“开发模拟服务”只是 UI 标识；是否真正启用 mock 由后端环境变量决定，避免客户端绕过生产服务。

## 阿里会话配置

第一版固定英语到中文，默认用多人动态声音复刻：

```json
{
  "type": "session.update",
  "session": {
    "modalities": ["text", "audio"],
    "voice": "default",
    "enable_voice_clone": true,
    "voice_clone_options": {
      "frequency": "always"
    },
    "sample_rate": 16000,
    "input_audio_format": "pcm",
    "output_audio_format": "pcm",
    "input_audio_transcription": {
      "model": "qwen3-asr-flash-realtime",
      "language": "en"
    },
    "translation": {
      "language": "zh"
    }
  }
}
```

`voice_clone_options.frequency` 由扩展设置传入，默认是 `"always"`，用于多人对话时每次输出前动态跟随说话人音色；popup 的“单人低延迟”会切到 `"once"`，只用于单人演讲或延迟对照，不作为多人声音跟随验收口径。

`lowLatencyPreviewEnabled` 是浏览器端低延迟桥接开关，默认开启。它不会改变阿里 session 配置，也不会伪装成原声音色；offscreen 在首段中文文本到达且阿里 `audio.delta` 尚未开始时，用浏览器本地 `speechSynthesis` 播放一次中文预听，随后仍按原链路播放阿里返回的原声音色中文译声。

`npm run check:aliyun` 复用同一份会话配置做真实上游预检。它会连接 `ALI_LIVE_TRANSLATE_ENDPOINT` 指向的 WebSocket，URL 查询参数携带 `qwen3.5-livetranslate-flash-realtime`，使用服务端 `DASHSCOPE_API_KEY` 鉴权，发送上面的 `session.update`，并等待阿里返回 `session.updated`。这个检查不发送业务音频，也不替代 Chrome 端到端手测；它用于先排除 Key、模型 URL、WebSocket 握手和声音复刻 session 配置问题。

主 WebSocket 代理同样以 `session.updated` 作为 ready 边界，但浏览器端不会等待这个边界才发送音频。Offscreen 在后端 WebSocket open 后立即流式发送 PCM，阿里还没有确认 session 配置时，后端最多排队 500 个早到 PCM chunk；确认后才向插件返回 `session.ready` 并 flush 队列。这样既避免音频跑在声音复刻、输出音频格式或目标语言配置生效之前，也减少浏览器侧等待上游握手造成的首包延迟。

`npm run smoke:aliyun` 在这个边界之后继续发送一段本机生成的英文 PCM，等待真实阿里返回中文文本和中文音频，用来验证“session 配置通过”之外的实际翻译/配音回流。

## 延迟指标

- `audioInput`：浏览器捕获到音频 chunk。
- `sentToAli`：后端准备转发给阿里。
- `firstText`：收到第一个中文文本片段。
- `firstTranslatedAudio`：收到第一个中文音频片段。
- `playbackStarted`：offscreen 第一段中文音频到达实际计划播放时间；如果译声队列排到了未来，会等到该播放时刻再上报，且每个会话只记录一次。

后端只保存完整延迟样本，并通过 `GET /v1/latency/summary` 按用户返回 P50/P95。当前汇总字段包括：

- `inputToFirstTextMs`
- `inputToSentToAliMs`
- `inputToFirstAudioMs`
- `inputToPlaybackMs`
- `sentToAliToFirstTextMs`
- `sentToAliToFirstAudioMs`
- `sessionToFirstAudioMs`

## 支付与额度

`POST /v1/payment-orders` 由已登录用户创建待支付订单。客户端只能传 `provider` 和 `packageId`；金额、币种和购买分钟数来自服务端套餐目录，避免前端篡改价格。当前开发套餐是 `pro_20m_cny_39`，对应 20 分钟、CNY 39.00。未配置 `paymentOrderStore` 时接口返回 `payment_order_store_not_configured`，避免创建无法被生产回调校验的订单。

配置 `PAYMENT_CHECKOUT_BASE_URL=https://.../pay` 后，订单响应会带 `checkout.checkoutUrl`，并追加 `orderId`、`provider`、`packageId` 查询参数。扩展只会自动打开 HTTPS checkout URL；未配置或非 HTTPS 时只显示订单号和金额。推荐把静态收银台随 `apps/public-site` 部署到同一个产品域名，部署步骤见 `docs/public-site-deployment.md`。

配置 `PAYMENT_STATUS_BASE_URL=https://api.example.com` 和 `PAYMENT_CHECKOUT_TOKEN_SECRET` 后，订单响应还会带签名只读 `checkout.statusUrl`，并把它追加进收银台 URL。`GET /v1/payment-orders/:orderId/status?token=...` 只返回订单号、渠道、套餐、金额、分钟数、状态、创建/过期/支付时间和支付 ID，不返回用户 ID；token 与订单号 HMAC 绑定，篡改订单号或 token 会被拒绝。

待支付订单创建时会设置 30 分钟过期时间。状态查询和支付 webhook 校验会先按 `expiresAt` 自动把过期待支付订单标记为 `canceled`，`cancelReason` 为 `expired`；`POST /v1/payment-orders/:orderId/cancel` 允许订单所属用户主动取消 pending 订单，`cancelReason` 为 `user`。非 pending 订单不会再次取消，取消或过期订单不会被支付 webhook 入账。

`/v1/payments/alipay/webhook` 和 `/v1/payments/wechat/webhook` 接收订阅成功事件后给用户增加分钟数。开发模式下，配置 `PAYMENT_WEBHOOK_SECRET` 后，回调必须带 `x-realtime-dubbing-signature: sha256=<hex>`，签名内容是原始 JSON body 的 HMAC-SHA256。

生产模式使用 `PAYMENT_VERIFICATION_MODE=production`：

- 支付宝：读取 `ALIPAY_PUBLIC_KEY_PEM` 或 `ALIPAY_PUBLIC_KEY_FILE`，对异步通知表单参数排除 `sign`、`sign_type` 后按字典序拼接，并按 `RSA2`/`RSA` 验签；只有 `trade_status` 为 `TRADE_SUCCESS` 或 `TRADE_FINISHED` 才能继续入账。
- 微信支付：读取 `WECHATPAY_PLATFORM_CERT_SERIAL` + `WECHATPAY_PLATFORM_CERT_PEM` 或 `WECHATPAY_PLATFORM_CERT_FILE`，使用 `Wechatpay-Serial`、`Wechatpay-Signature`、`Wechatpay-Timestamp`、`Wechatpay-Nonce` 和原始 body 验 API v3 RSA-SHA256 签名；读取 `WECHATPAY_API_V3_KEY` 解密 `resource` 的 `AEAD_AES_256_GCM` 密文；只有解密后的 `trade_state` 为 `SUCCESS` 才能继续入账。

生产回调必须匹配订单账本。配置 `PAYMENT_ORDER_STORE_FILE` 后，服务端会按 `out_trade_no`/订单号查找预创建订单，并校验支付渠道、用户、金额、币种和购买分钟数；匹配成功后才入账，并把订单标记为 `paid`。回调体需要包含稳定的 `paymentId`，服务端用 `provider + paymentId` 做幂等，避免支付平台重试时重复入账；如果订单账本已经是 `paid` 且 `paymentId` 相同，服务端会直接返回 duplicate 并补标支付幂等账本，不再给用户加分钟；同一订阅的下一次续费应使用新的 `paymentId`。

`subscription.refunded` 回调会校验订单、渠道、用户和原支付 ID，只允许已支付订单流转为 `refunded`，并记录 `refundedAt`。当前实现不自动扣回已发分钟，退款后额度回收、部分退款和人工对账策略需要在正式支付渠道接入时按运营规则补齐。

默认额度、支付幂等记录和待支付订单保存在内存里。配置 `BILLING_STORE_FILE` 后，用户套餐、剩余秒数和扣减结果会写入 JSON 文件；配置 `PAYMENT_LEDGER_FILE` 后，已处理支付 ID 会跨服务重启保留；配置 `PAYMENT_ORDER_STORE_FILE` 后，待支付订单和 paid 状态会跨服务重启保留。活动会话占用只保存在当前进程内，重启后不会恢复旧的并发占用。

当前实现已经覆盖内部待支付订单创建、可配置 HTTPS checkout URL、签名订单状态查询、订单过期/取消、退款状态流转、生产验签入口、订单金额匹配和 JSON 文件订单账本；生产环境还必须补真实支付宝/微信预下单、支付收银台二维码/跳转、数据库订单账本、订单对账、真实退款通知字段映射和取消订阅策略。

## 账号与短期凭据

`POST /v1/auth/client-token` 用当前开发发行凭据换取短期 WebSocket 凭据。后端用 `CLIENT_TOKEN_SECRET` 做 HMAC 签名，TTL 由 `CLIENT_TOKEN_TTL_SECONDS` 控制；短期凭据只用于连接 `/v1/live`，不能再调用签发入口续期。

本地未配置 `CLIENT_TOKEN_SECRET` 时，签发入口返回 `client_token_secret_not_configured`，插件会回退到 `DEV_CLIENT_TOKEN`，方便无账号系统时调试。生产环境应关闭这种开发发行凭据路径，改为真实账号登录、订阅状态校验、设备/并发风控和刷新令牌。

当 `NODE_ENV=production` 或 `API_ENV=production` 时，`loadConfig` 会启用生产安全闸：开发 token 回退和 `/v1/auth/client-token` 开发签发端点都会关闭；服务必须配置 `DASHSCOPE_API_KEY`、`CLIENT_TOKEN_SECRET`、文件持久化账本、HTTPS 收银台 URL、HTTPS 订单状态 base URL、订单状态签名 secret 和生产支付验签材料，否则拒绝启动。短期 token 可以继续由未来的真实登录服务或上游认证服务使用同一个 `CLIENT_TOKEN_SECRET` 签发。
