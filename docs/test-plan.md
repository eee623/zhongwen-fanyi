# 测试计划

## 自动化

- `npm test`：共享配置、阿里事件映射、额度/支付、扩展音频工具。
- `npm run typecheck`：所有 TypeScript 包类型检查。
- `npm run build`：shared 声明输出、API 编译、Chrome MV3 扩展构建。
- `npm run check:aliyun`：读取 `.env`，用真实 `DASHSCOPE_API_KEY` 直连阿里 LiveTranslate WebSocket，发送产品同款 `session.update`，并等待 `session.updated`，用于证明模型 URL、鉴权和声音复刻配置被上游接受。
- `npm run smoke:aliyun`：本机生成临时英文语音，转成 16k PCM，经本地 API 发送到真实阿里 LiveTranslate，默认按约 10ms PCM chunk、10ms 发送间隔和 WebSocket open 后立即发送模拟插件端低延迟送流；必须收到中文文本和中文译声音频，并输出真实 `inputToFirstTextMs`、`inputToFirstAudioMs`、`inputToPlaybackMs` 摘要；默认使用 `voice_clone_options.frequency: "always"` 验证多人动态跟随，`ALIYUN_SMOKE_VOICE_CLONE_FREQUENCY=once npm run smoke:aliyun` 用于单人低延迟对照；用 `ALIYUN_SMOKE_RUNS=5 npm run smoke:aliyun` 可顺序采多次样本并读取 P50/P95。输出中的 `kpi` 按首字/首音 P95 低于 1000ms 评估 `<1s` 目标；`npm run smoke:aliyun:kpi` 是固定严格门禁，未达标必须失败。
- `npm run smoke:aliyun:record`：执行一次真实阿里 smoke，并把采样追加到 `docs/latency-evidence.jsonl`，同步重生成 `docs/latency-evidence.md`；用于沉淀发布前的真实首字/首音证据和瓶颈归因。
- `npm run check:latency-evidence`：检查已归档真实样本中是否至少有一次中文译声首音达成 `<1s`；当前 always/once 都未达标时必须失败，并提示最佳样本耗时。
- `npm run smoke:aliyun:matrix`：用同一段临时英文 PCM 对比真实阿里延迟矩阵，默认场景为 `always:20:20`、`once:20:20`、`always:10:10`、`once:10:10`，格式是 `声纹频率:音频chunk毫秒:发送间隔毫秒`；每个场景必须独立启动 API 并单独读取 latency summary，输出按首音 P95 排序。可用 `ALIYUN_LATENCY_MATRIX=once:10:10 ALIYUN_MATRIX_RUNS=2 npm run smoke:aliyun:matrix` 缩小或加深采样。
- `npm run smoke:aliyun:matrix:record`：执行真实阿里延迟矩阵，并把每个场景分别追加到 `docs/latency-evidence.jsonl`、同步重生成 `docs/latency-evidence.md`；可设置 `ALIYUN_MATRIX_EVIDENCE_LABEL`、`ALIYUN_MATRIX_EVIDENCE_JSONL`、`ALIYUN_MATRIX_EVIDENCE_MARKDOWN` 改写标签和输出路径。
- `npm run smoke:mock`：无需 Chrome 的本地回环，覆盖短期凭据、账号状态、WebSocket session、mock 字幕/音频回传、播放延迟回报和 latency summary。
- `npm run check:production-config`：强制按生产模式解析 `.env`，必须拒绝 mock 翻译、开发 token 回退、内存账本、非 HTTPS 支付 URL、缺失订单状态签名 secret、缺失支付宝/微信生产验签材料等发布风险。
- `npm run production:materials`：基于当前 `.env` 生成 `docs/production-launch-materials.md`，按 Cloud AI、Auth、Billing、Payments 分组列出生产上线材料状态；报告必须只显示 configured/missing/placeholder/invalid，不得打印任何 secret 值。
- `npm run manual:acceptance-template` / `npm run manual:acceptance-check`：生成并校验 Chrome 手动验收报告。报告必须覆盖 HTML5、YouTube、优酷、B站、本地 mp4/webm、本地权限拦截、mkv/avi 暂不支持、音量、全屏字幕、生命周期、声音复刻和延迟诊断；模板生成命令默认不得覆盖已有报告，只有显式传 `--force` 才能重置；未勾选 PASS、仍有 TODO，或只填写 recorded/ok/pass/done 等空泛证据时必须失败。
- `npm run check:chrome-store`：构建扩展并检查 Chrome Web Store 发布门，包括 MV3、权限 allowlist、远程代码/CSP、本地打包的 content scripts、manifest 图标、后台上架图片资产、提交元数据、公开隐私政策 URL，以及真实源码中 tab 音频捕获只能由用户点击 popup Start 后触发。
- `npm run release:status:local`：跳过真实阿里预检和严格 KPI 调用，只执行本地测试、类型检查、构建、mock smoke、已归档真实延迟证据、生产 API 配置预检、Chrome 手动验收报告和 Chrome Store gate；适合日常检查，但不能替代新的真实阿里采样。
- `npm run release:status`：顺序执行测试、类型检查、构建、mock smoke、已归档真实延迟证据、生产 API 配置预检、Chrome 手动验收报告、阿里预检、严格阿里 KPI 和 Chrome Store gate，并汇总 blockers；任何必需 gate 失败时必须失败。
- API 集成测试包含假阿里 WebSocket 和本地 mock 模式，覆盖 session update、早期音频排队、500 个 pending PCM chunk 上限、字幕/音频事件回传、延迟 P50/P95 汇总。

## 上架合规

- Chrome Web Store 合规是硬性发布门；任何一项未满足，都不得提交审核或发布生产版本。
- 发布前必须复核 `docs/chrome-web-store-release-gate.md`，并确保隐私政策、权限说明、数据使用披露和用户主动触发音频捕获都与实现一致。
- 上架图片资产必须通过 `docs/chrome-web-store-assets.md` 的尺寸和内容复核；截图、store icon 或 small promo tile 缺失时 `npm run package:chrome-store` 必须失败。
- 未配置真实公开隐私政策 URL 时，`npm run check:chrome-store` 和 `npm run package:chrome-store` 必须失败；部署后用 `CHROME_STORE_PRIVACY_POLICY_URL=https://.../privacy` 重新运行。
- 统一公开站点必须通过 `npm run build:public-site` 生成 `/privacy/` 隐私政策、`/pay/` 收银台、本地 CSS/JS、安全头和面向审核的 `robots.txt`；独立收银台仍可通过 `npm run build -w @realtime-dubbing/checkout-site` 单独验证。

## 手动场景

- 网页播放器：YouTube、优酷、B站、普通 HTML5 video。
- 本地文件：先运行 `npm run manual:media-fixtures` 生成 `manual-test/generated/local-english-fixture.mp4` 和 `.webm`，再在 `manual:mock` 打开的 Chrome profile 里验证 Chrome 可直接播放的 mp4/webm 和本地 HTML5 测试页；mkv/avi 和无关本地文件必须提示暂不支持。
- 本地文件权限：关闭扩展的 `file://` 访问后打开本地 mp4/html 测试页，确认 popup 显示本地文件权限未开启、启动按钮不可用或启动前被拦截；开启后重新检查可启动。
- 本地测试页：`manual-test/html5-player.html`，覆盖 `file://` 权限、HTML5 video、tab 音频捕获、暂停/跳转、全屏字幕。
- 音量：原声 0/50/100，译声 0/50/100。
- 译声实时性：如果中文译声音频队列已经落后 1 秒以上，新到的译声 chunk 应被丢弃直到队列追上，避免中文配音越播越晚；字幕仍应继续更新。
- 声纹策略：默认“多人跟随”必须保持不同说话人动态原声复刻；“单人低延迟”只用于单人演讲延迟对照，切换后必须重新启动会话并记录首字/首音延迟。
- 极速预听：开启后首段中文字幕出现时应快速听到浏览器本地中文语音；关闭后不得触发本地语音；该路径只能作为低延迟桥接，不能替代阿里原声音色译声 KPI。
- 字幕：普通页面、网页全屏、浏览器全屏、字幕关闭、字幕大小 14/24/40；关闭“悬浮球”时普通页面字幕隐藏，关闭“全屏字幕”时播放器全屏字幕隐藏。
- 会话：启动、停止、刷新页面、页面跳转、关闭标签页、切换标签页；刷新或跳转当前捕获标签时应自动停止并清空字幕。
- 异常：API 未启动、`DASHSCOPE_API_KEY` 缺失、额度耗尽、并发超限、阿里断线；不可重试错误出现后应立即停止 tab 音频捕获、断开 WebSocket，并在 popup 展示错误。
- 真实阿里预检：执行 `npm run check:aliyun`，缺 Key 时必须清楚提示 `DASHSCOPE_API_KEY`；Key 或上游错误时必须返回非 0 并输出阿里错误码/消息；成功时必须显示 `session.updated` 和耗时。
- 真实阿里音频 smoke：执行 `npm run smoke:aliyun`，必须收到 `receivedTranslation: true` 和 `receivedAudio: true`；再执行 `ALIYUN_SMOKE_VOICE_CLONE_FREQUENCY=once npm run smoke:aliyun` 采集单人低延迟对照样本；需要定位首音瓶颈时执行 `npm run smoke:aliyun:matrix` 或自定义 `ALIYUN_LATENCY_MATRIX`，记录不同声纹频率、chunk 时长和发送间隔下的首文本、首音频和实际播放延迟；要把矩阵纳入发布证据时执行 `npm run smoke:aliyun:matrix:record`。若中文首声高于 1 秒，按实测结果进入低延迟优化，不得把它标成达标。
- 本地回环：`LIVE_TRANSLATE_MODE=mock npm run dev:api`，扩展选择“开发模拟服务”，打开任意有声音的视频标签页后启动。
- Chrome 手测：运行 `npm run manual:mock` 启动本地 Mock API，并优先用 Chrome for Testing/Chromium 打开独立 Chrome profile；启动器会把 `apps/extension/.output/chrome-mv3` staging 到临时目录后加载，并进入 `manual-test/html5-player.html`；确认终端打印 Chrome target check 找到测试页，且 Chrome extension check 找到扩展 service worker；开启扩展的 `Allow access to file URLs` 后，点击“准备媒体 / 播放”，再从 popup 启动同传。
- 真实阿里 Chrome 手测：运行 `npm run manual:aliyun`，脚本必须先完成 `session.updated` 预检，再启动真实 API 和测试页；从 popup 选择“阿里百炼 LiveTranslate”启动后，记录字幕、译声、混音和延迟诊断结果。
- Chrome 自动 smoke：运行 `npm run smoke:extension:mock` 前应安装 Chrome for Testing 或 Chromium，或设置 `CHROME_FOR_TESTING`/`CHROMIUM_PATH`。普通 Google Chrome 137+ 不再支持 `--load-extension` 自动加载未打包扩展；脚本必须清楚提示这个限制，不能误把 Chrome 内置 extension service worker 当成本扩展。
- 延迟：连续播放多段英语视频后，在 popup 点击“延迟诊断 / 刷新”或查询 `GET /v1/latency/summary`，记录 `inputToFirstAudioMs` 和 `inputToPlaybackMs` 的 P50/P95。
- 账号：在 popup 账号区点击刷新，确认套餐、剩余分钟、并发占用和不可启动原因与 `GET /v1/account/status` 一致；额度耗尽或并发已满时确认启动按钮禁用，启动前 fresh preflight 不放行。
- 支付订单：`POST /v1/payment-orders` 必须要求登录 token；未配置订单账本时必须返回 `payment_order_store_not_configured`；未知套餐必须拒绝；客户端传入的金额或分钟数不得影响服务端订单金额和分钟数；配置 `PAYMENT_CHECKOUT_BASE_URL` 后响应必须包含 HTTPS checkout URL；配置 `PAYMENT_STATUS_BASE_URL` 和 `PAYMENT_CHECKOUT_TOKEN_SECRET` 后响应必须包含签名只读订单状态 URL，篡改 token 必须拒绝；待支付订单过期或用户取消后必须变为 `canceled`，后续支付 webhook 不得入账；popup 顶部“订阅”按钮应创建 `pro_20m_cny_39` 待支付订单，显示订单号和金额，并只自动打开 HTTPS 收银台 URL。
- 支付：配置 `PAYMENT_WEBHOOK_SECRET` 后，未带 `x-realtime-dubbing-signature` 或签名错误的回调应被拒绝；同一个 `paymentId` 的支付宝/微信回调重复发送时只入账一次；订单账本已为 `paid` 且 `paymentId` 相同的回调即使支付幂等账本为空也必须返回 duplicate 且不再加分钟；`subscription.refunded` 回调必须只把已支付订单标记为 `refunded`，不得增加分钟；同一订阅的新 `paymentId` 续费应继续增加分钟数。
- 生产支付：配置 `PAYMENT_VERIFICATION_MODE=production` 后，支付宝异步通知必须通过 RSA/RSA2 验签且 `trade_status` 为 `TRADE_SUCCESS` 或 `TRADE_FINISHED`；微信支付 API v3 通知必须通过平台证书验签、用 APIv3 密钥解密 `resource`，且 `trade_state` 为 `SUCCESS`；两者都必须匹配订单账本中的用户、渠道、金额、币种和购买分钟数后才能入账。
- 生产配置：`NODE_ENV=production` 或 `API_ENV=production` 时必须拒绝缺少云 Key、短期 token secret、持久化账本、HTTPS 收银台 URL、HTTPS 订单状态 base URL、订单状态签名 secret、生产支付验签材料、占位密钥或占位域名的配置；必须禁用开发 token 回退和 `/v1/auth/client-token` 开发签发端点。
- 生产配置预检：执行 `npm run check:production-config`，当前 `.env` 缺任一生产必需项或仍含 `replace-with`、`change-me`、`your-domain.example` 等占位值时必须非 0 退出，并逐项打印 `[production-config error]`；生产环境补齐后必须输出 `Production API configuration gate passed.`。
- 生产材料报告：执行 `npm run production:materials`，生成的 `docs/production-launch-materials.md` 必须把阿里 Key、短期 token、持久化账本、HTTPS 收银台/状态 URL、支付宝公钥、微信平台证书和 APIv3 Key 分组列出状态；报告不得包含实际 secret 值。
- 持久化：配置 `BILLING_STORE_FILE`、`PAYMENT_LEDGER_FILE` 和 `PAYMENT_ORDER_STORE_FILE` 后，充值、扣减、待支付订单、paid 状态和已处理支付 ID 应在 API 重启后保留；重启后不应恢复旧的活动会话占用。
