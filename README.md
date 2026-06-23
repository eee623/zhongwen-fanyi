# 中文同传 Dubbing

## 最简单部署方式：静态前端，不需要 Node.js

如果你只是要官网能打开，服务器上什么都不用装。仓库根目录已经放好了正式前端静态文件：

```text
index.html
privacy/index.html
pay/index.html
assets/public.css
assets/checkout.css
assets/checkout.js
assets/product/*.png
favicon.svg
robots.txt
```

部署方法：

1. 打开仓库：[https://github.com/eee623/zhongwen-fanyi](https://github.com/eee623/zhongwen-fanyi)
2. 点 `Code`，下载 ZIP。
3. 解压。
4. 把解压后的整个文件夹上传到服务器的网站根目录，例如宝塔的 `wwwroot/你的域名/`。
5. 访问你的域名即可打开。

不要在服务器上运行 `npm install`，不要运行 `npm run build`。服务器只需要托管这些静态文件。

如果用 Netlify，直接导入 GitHub 仓库即可。当前 `netlify.toml` 是无构建配置：

```text
Publish directory: .
Build command: 留空
```

根目录静态页面只是官网展示和收银台前端。`assets/checkout.js` 是浏览器端脚本，服务器不需要安装任何依赖。真实同传服务、真实支付宝/微信扣款、额度入账仍需要后端 API 和商户密钥；如果暂时只要“网站能打开”，不用管后端。

## 工程源码说明

Chrome 浏览器实时同传插件 MVP：捕获当前标签页音频，将英语实时翻译成中文字幕和中文配音，并通过阿里百炼 `qwen3.5-livetranslate-flash-realtime` 开启动态声音复刻。

## 当前能力

- Chrome MV3 扩展：popup 控制面板、tab 音频捕获、offscreen 音频处理、页面/全屏字幕覆盖。
- 自有 Node.js API：客户端短期 token 鉴权、阿里 WebSocket 代理、字幕/音频事件映射、并发和额度控制。
- 低延迟桥接：可开启“极速预听”，在首段中文文本到达后用浏览器本地中文语音先发声；阿里原声音色中文译声仍作为高保真通道播放。
- 商业骨架：登录后创建待支付订单、支付宝/微信 webhook 路由、订阅成功后给用户增加翻译分钟数；可用 JSON 文件持久化开发环境额度、支付幂等账本和订单账本。
- 本地文件范围：支持 Chrome 能直接播放的本地 mp4/webm 视频和本地 HTML5 测试页；mkv/avi、VLC/IINA/QuickTime 不在第一版范围。

## 本地运行

```bash
npm install
npm run dev:api
npm run dev:extension
```

本地 API 常用环境变量：

```text
PORT=8787
DASHSCOPE_API_KEY=your_dashscope_api_key
ALI_LIVE_TRANSLATE_ENDPOINT=wss://dashscope.aliyuncs.com/api-ws/v1/realtime
LIVE_TRANSLATE_MODE=aliyun
DEV_CLIENT_TOKEN=dev-client-token
DEV_USER_ID=user_1
CLIENT_TOKEN_SECRET=local-signing-secret
CLIENT_TOKEN_TTL_SECONDS=900
PAYMENT_WEBHOOK_SECRET=local-payment-webhook-secret
PAYMENT_VERIFICATION_MODE=development
ALIPAY_PUBLIC_KEY_FILE=/secure/alipay-public.pem
WECHATPAY_PLATFORM_CERT_SERIAL=wechatpay_platform_cert_serial
WECHATPAY_PLATFORM_CERT_FILE=/secure/wechatpay-platform.pem
WECHATPAY_API_V3_KEY=32-byte-wechatpay-api-v3-key
DEV_REMAINING_SECONDS=3600
DEV_MAX_CONCURRENT_SESSIONS=1
BILLING_STORE_FILE=.data/billing.json
PAYMENT_LEDGER_FILE=.data/payment-ledger.json
PAYMENT_ORDER_STORE_FILE=.data/payment-orders.json
PAYMENT_CHECKOUT_BASE_URL=https://your-domain.example/pay
PAYMENT_STATUS_BASE_URL=https://api.your-domain.example
PAYMENT_CHECKOUT_TOKEN_SECRET=random-checkout-status-signing-secret
```

生产 API 运行时设置 `NODE_ENV=production` 或 `API_ENV=production` 会启用硬性安全闸：禁止 `LIVE_TRANSLATE_MODE=mock`，禁止开发 token 直连和开发 token 签发端点，并要求配置 `DASHSCOPE_API_KEY`、`CLIENT_TOKEN_SECRET`、`BILLING_STORE_FILE`、`PAYMENT_LEDGER_FILE`、`PAYMENT_ORDER_STORE_FILE`、HTTPS `PAYMENT_CHECKOUT_BASE_URL`、HTTPS `PAYMENT_STATUS_BASE_URL`、`PAYMENT_CHECKOUT_TOKEN_SECRET`、`PAYMENT_VERIFICATION_MODE=production`、支付宝公钥、微信支付平台证书和微信 APIv3 Key。缺任意一项时服务会拒绝启动，避免把本地开发凭据带进线上。

Chrome 加载扩展目录：

```text
apps/extension/.output/chrome-mv3
```

扩展默认连接：

```text
ws://localhost:8787/v1/live
```

默认开发 token：

```text
dev-client-token
```

配置 `CLIENT_TOKEN_SECRET` 后，插件启动前会调用后端换取短期 WebSocket 凭据：

```bash
curl -X POST http://localhost:8787/v1/auth/client-token \
  -H "Authorization: Bearer dev-client-token"
```

本地未配置 `CLIENT_TOKEN_SECRET` 时，插件会继续使用 `DEV_CLIENT_TOKEN` 直连，方便无登录系统的开发调试。生产模式会关闭这条回退路径，客户端必须使用真实登录系统或上游认证服务签发的短期 token。

无云 Key 本地演示：

```bash
LIVE_TRANSLATE_MODE=mock npm run dev:api
npm run dev:extension
```

然后在扩展里选择“开发模拟服务”。这个模式只用于验证扩展捕获、WebSocket、字幕和译声回流链路，不代表真实翻译质量或延迟。

真实阿里链路预检：

```bash
npm run check:aliyun
```

该命令会读取 `.env` 中的 `DASHSCOPE_API_KEY` 和可选 `ALI_LIVE_TRANSLATE_ENDPOINT`，直连阿里 LiveTranslate WebSocket，发送与产品主链路一致的 `session.update`，并严格等待 `session.updated`。它用于在打开 Chrome 手测前确认模型 URL、鉴权和内置声音复刻配置已被上游接受；没有 Key 或上游返回 `error` 时会以非 0 状态退出并打印结构化原因。

真实阿里音频 smoke：

```bash
npm run smoke:aliyun
ALIYUN_SMOKE_VOICE_CLONE_FREQUENCY=once npm run smoke:aliyun
npm run smoke:aliyun:matrix
ALIYUN_MATRIX_RECORD_EVIDENCE=1 npm run smoke:aliyun:matrix
ALIYUN_LATENCY_MATRIX=always:20:20,once:10:10 ALIYUN_MATRIX_RUNS=2 npm run smoke:aliyun:matrix
```

该命令会用本机 `say` 生成一段临时英文语音，通过 `ffmpeg` 转成 16k PCM，启动本地 API 并走真实阿里 LiveTranslate 链路，直到收到中文字幕和中文译声音频。默认使用约 10ms PCM chunk 和 10ms 发送间隔，并在后端 WebSocket open 后立即发送音频，贴近插件端 512 帧 capture buffer 与 early streaming 的低延迟送流；默认 `voice_clone_options.frequency: "always"`，保持多人对话时的动态原声跟随；需要比较单人演讲低延迟表现时，可设置 `ALIYUN_SMOKE_VOICE_CLONE_FREQUENCY=once`。脚本会输出 `inputToFirstTextMs`、`inputToFirstAudioMs`、`sentToAliToFirstAudioMs`、`inputToPlaybackMs` 等延迟摘要；临时音频文件会在脚本结束时删除。
`npm run smoke:aliyun:matrix` 会连续跑真实阿里延迟矩阵，默认对比 `always:20:20`、`once:20:20`、`always:10:10`、`once:10:10` 四个场景，格式是 `声纹频率:音频chunk毫秒:发送间隔毫秒`。输出会按首音 P95 排序，便于判断首音瓶颈到底来自声纹策略、chunk 发送节奏，还是上游译声生成。`npm run smoke:aliyun:matrix:record` 会把每个矩阵场景分别追加到 `docs/latency-evidence.jsonl` 并重生成 `docs/latency-evidence.md`；也可以设置 `ALIYUN_MATRIX_RECORD_EVIDENCE=1` 配合自定义矩阵。矩阵命令会消耗多次真实阿里调用额度；需要缩小范围时，用 `ALIYUN_LATENCY_MATRIX=once:10:10` 指定场景，用 `ALIYUN_MATRIX_RUNS=2` 指定每个场景采样次数。

Chrome 手动验证页：

```text
manual-test/html5-player.html
```

推荐用一键 mock 手测会话，它会启动本地 Mock API 并打开独立 Chrome profile：

```bash
npm run manual:mock
```

启动器会通过本地 Chrome DevTools 端口确认 `manual-test/html5-player.html` 和扩展 service worker 都已经出现在 Chrome target 列表里；默认端口是 `9222`，可用 `CHROME_DEBUG_PORT=9333 npm run manual:mock` 改掉。首次运行仍需在 `chrome://extensions` 给扩展开启 `Allow access to file URLs`，这是 Chrome 对本地文件页面的权限要求。然后在测试页点击“准备媒体 / 播放”，打开扩展 popup，选择“开发模拟服务”并点击“启动”。

本地 mp4/webm 手测素材可以一键生成：

```bash
npm run manual:media-fixtures
```

该命令会使用 macOS `say` 生成一段英文语音，再用 `ffmpeg` 合成 `manual-test/generated/local-english-fixture.mp4` 和 `manual-test/generated/local-english-fixture.webm`。生成目录已被 `.gitignore` 忽略；真实验收时在 `manual:mock` 打开的 Chrome profile 里打开这两个文件，播放后从 popup 启动同传。

如果 target check 显示播放器页存在但扩展 service worker 缺失，通常是旧的手测 Chrome profile 还在运行，新启动参数没有生效。关闭旧手测窗口，或换一个新 profile 和端口：

```bash
CHROME_DEBUG_PORT=9334 CHROME_PROFILE_DIR=.tmp/chrome-mock-debug-profile-fresh npm run manual:mock
```

如果你已经有 API 在跑，只想打开带扩展的 Chrome 和测试页，也可以用：

```bash
npm run manual:chrome
```

真实阿里手测会话：

```bash
npm run manual:aliyun
```

它会先执行阿里 LiveTranslate session 预检，确认 `DASHSCOPE_API_KEY`、模型 URL 和声音复刻配置被上游接受，再启动真实 API 并打开独立 Chrome profile 和 `manual-test/html5-player.html`。如果普通 Chrome 没有自动加载未打包扩展，按终端提示打开 `chrome://extensions` 手动加载 `apps/extension/.output/chrome-mv3`，再从 popup 选择“阿里百炼 LiveTranslate”启动。

这些手测命令都会先构建扩展，再用 `apps/extension/.output/chrome-mv3` 启动 Chrome，并打开 `manual-test/html5-player.html`。页面会生成带音频的 HTML5 video 流，可用于验证 tabCapture、字幕覆盖、译声播放、暂停/跳转和播放器全屏字幕表现。
Popup 里的“悬浮球”和“全屏字幕”是两个独立开关：关闭悬浮球后普通页面字幕隐藏，关闭全屏字幕后播放器全屏时字幕隐藏。
如果当前标签页是本地文件而权限未开启，popup 的“本地文件”区域会显示扩展详情页地址，启动链路也会在后台拦截；如果打开的是 mkv/avi，本地文件区域和启动前检查会提示第一版暂不支持该格式，避免误以为独立播放器或非 Chrome 可播格式已经工作。

## 验证命令

```bash
npm test
npm run typecheck
npm run build
npm run check:production-config
npm run production:materials
npm run check:latency-evidence
npm run check:aliyun
npm run smoke:aliyun
npm run smoke:aliyun:record
ALIYUN_SMOKE_VOICE_CLONE_FREQUENCY=once npm run smoke:aliyun
npm run smoke:aliyun:matrix
npm run smoke:aliyun:matrix:record
ALIYUN_SMOKE_RUNS=5 npm run smoke:aliyun
ALIYUN_SMOKE_RUNS=5 ALIYUN_SMOKE_STRICT_KPI=1 npm run smoke:aliyun
npm run smoke:aliyun:kpi
npm run smoke:mock
npm run build:public-site
npm run public-site:release-urls -- https://your-domain.example
CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run check:chrome-store
CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run package:chrome-store
npm run manual:mock
npm run manual:aliyun
npm run manual:chrome
npm run manual:acceptance-template
npm run manual:acceptance-check
npm run release:status:local
npm run release:status
```

`npm run smoke:aliyun` 默认跑 1 次真实阿里链路；需要观察首字/首音 P50/P95 波动时，可用 `ALIYUN_SMOKE_RUNS=5 npm run smoke:aliyun` 顺序跑多次并读取同一个延迟汇总。`npm run smoke:aliyun:record` 会额外把真实采样追加到 `docs/latency-evidence.jsonl`，并重生成 `docs/latency-evidence.md`。`npm run check:latency-evidence` 会检查已归档样本里是否至少有一次中文译声首音达成 `<1s`，当前 always/once 样本都未达标时必须失败。Popup 和 smoke 默认使用“多人跟随”声纹策略，即 `voice_clone_options.frequency: "always"`；`ALIYUN_SMOKE_VOICE_CLONE_FREQUENCY=once npm run smoke:aliyun` 可切到“单人低延迟”策略做对照，但不能替代多人声音跟随验收。脚本会输出 `kpi`，按首字/首音 P95 低于 1000ms 评估 `<1s` 目标；默认只报告不失败，设置 `ALIYUN_SMOKE_STRICT_KPI=1` 后未达标会退出失败。`npm run smoke:aliyun:kpi` 是固定的严格门禁命令，当前阿里首音 P95 未达标时应失败，不能当成发布通过。
`npm run smoke:aliyun:matrix` 用同一段英文 PCM 逐个启动独立 API 会话，分别统计每个场景的 P50/P95，避免不同场景延迟样本混在一起。默认矩阵会跑 4 个真实场景；如果只想快速确认一个假设，用 `ALIYUN_LATENCY_MATRIX=always:10:10 npm run smoke:aliyun:matrix`。需要把矩阵写入发布证据时，执行 `npm run smoke:aliyun:matrix:record`，或用 `ALIYUN_MATRIX_EVIDENCE_LABEL=early-streaming npm run smoke:aliyun:matrix:record` 给本轮实验加标签前缀。
`npm run smoke:mock` 会启动内存 mock API，自动完成短期凭据签发、账号状态查询、WebSocket 会话、模拟中文字幕/译声回传、播放延迟回报和 P50/P95 汇总查询。它不需要打开 Chrome，用来快速确认主服务链路没有断。
`npm run check:production-config` 会强制按 `API_ENV=production` 解析 `.env`，确保生产 API 不会带着 mock 翻译、开发 token、内存账本、非 HTTPS 支付 URL、占位域名、占位密钥或开发支付验签上线。它要求云 Key、短期 token secret、持久化 billing/payment/order 文件或等价持久化路径、真实 HTTPS 收银台和订单状态 URL、订单状态签名 secret、支付宝公钥、微信平台证书和微信 APIv3 Key。
`npm run production:materials` 会基于当前 `.env` 生成 `docs/production-launch-materials.md`，按 Cloud AI、Auth、Billing、Payments 分组列出生产上线还缺哪些材料；报告只显示 configured/missing/placeholder/invalid，不打印任何 secret 值。
生产部署变量模板在 `docs/production.env.example`。把它复制到生产密钥管理或部署平台后，填入真实域名、账本路径和支付宝/微信验签材料，再运行 `npm run check:production-config`；模板里的 `replace-with`、`change-me` 和 `your-domain.example` 必须保持失败，直到全部替换。不要提交填好真实 secret 的 `.env`。
`npm run manual:mock` 会启动真实本地 API 进程，并优先使用 Chrome for Testing/Chromium 打开独立 profile 和本地 HTML5 播放器页。启动器会把构建后的扩展复制到临时目录再用 `--load-extension` 加载，避免中文路径或普通 Chrome 137+ 限制影响验收；终端必须打印测试页和“中文同传 Dubbing”service worker 都已找到后，再从扩展 popup 启动一次真实 tabCapture mock 手测。
`npm run manual:acceptance-template` 会生成 `docs/manual-acceptance-report.md` 手动验收报告模板，覆盖 HTML5、YouTube、优酷、B站、本地 mp4/webm、本地权限拦截、mkv/avi 暂不支持、音量、全屏字幕、生命周期、声音复刻和延迟诊断。若报告已经存在，命令会拒绝覆盖，避免抹掉已记录的验收证据；确实要重置时显式运行 `npm run manual:acceptance-template -- --force`。真实验收后把每个场景的 `Result` 勾成 PASS 并替换 TODO，再运行 `npm run manual:acceptance-check`；未填写证据，或只填写 recorded/ok/pass/done 这类空泛证据时该命令必须失败。
`npm run smoke:extension:mock` 是 Chrome CDP 诊断脚本，会尝试自动启动 mock API、HTTP 测试页和扩展链路。Chrome 137+ 的普通 Google Chrome 已移除通过 `--load-extension` 自动加载未打包扩展的能力；该脚本会优先查找 Chrome for Testing 或 Chromium，并可通过 `CHROME_FOR_TESTING=/path/to/browser` 或 `CHROMIUM_PATH=/path/to/browser` 指定。没有可用浏览器时，脚本会在构建后清楚失败；这时应以 `manual:mock` 的人工 popup 点击为准，或安装 Chrome for Testing 后重跑自动 smoke。
`npm run release:status:local` 会跳过真实阿里预检和严格 KPI 调用，只执行本地测试、类型检查、构建、mock smoke、已归档真实延迟证据、生产 API 配置预检、Chrome 手动验收报告和 Chrome Store gate，适合日常反复检查且不会消耗阿里 API。它不能替代新的真实阿里采样；如果 `docs/latency-evidence.jsonl` 没有任何首音达标样本，也会把 `<1s` 译声目标标成 blocker。
`npm run release:status` 会顺序执行发布必需 gate：测试、类型检查、构建、mock smoke、生产 API 配置预检、Chrome 手动验收报告、阿里预检、严格阿里 KPI 和 Chrome Store gate，并在最后汇总 blockers。当前生产支付/持久化配置未齐、手动验收报告未填、阿里首音 P95 未达 `<1s` 或真实公开隐私政策 URL 未配置时，该命令应失败，不能作为已发布状态。

可用项目脚本安装 Chrome for Testing 到本地 `.tmp/`，慢网络下会复用半截 zip 继续下载：

```bash
npm run install:chrome-for-testing
# 成功后按输出设置：
# CHROME_FOR_TESTING=/absolute/path/to/Google Chrome for Testing
```

Chrome 上架是硬性发布门，详见 `docs/chrome-web-store-release-gate.md` 和 `docs/chrome-web-store-assets.md`。任何 Chrome Web Store 合规项未满足，都不得提交审核或发布生产版本。
`npm run package:chrome-store` 会先执行合规门，再生成 Chrome Web Store 上传 zip，输出位置在 `apps/extension/.output/`。
正式商业发布前使用自有产品域名构建并部署 `apps/public-site`，把 `/privacy` 和 `/pay` 放到同一个公开 HTTPS 产品域名下，再通过 `CHROME_STORE_PRIVACY_POLICY_URL` 覆盖真实隐私政策 URL。

统一公开站点：

```bash
PUBLIC_SITE_BASE_URL=https://your-real-domain.com npm run build:public-site
npm run public-site:release-urls -- https://your-real-domain.com
# 输出目录：apps/public-site/dist
```

部署后使用：

```text
CHROME_STORE_PRIVACY_POLICY_URL=https://your-real-domain.com/privacy/
PAYMENT_CHECKOUT_BASE_URL=https://your-real-domain.com/pay/
```

也可以直接从 Chrome Store 提交元数据生成生产环境草案：

```bash
npm run production:env:draft
```

如果 API 已有公开域名，可把订单状态域名作为第二个参数：

```bash
npm run production:env:draft -- https://your-real-domain.com/privacy/ https://api.your-real-domain.com
```

统一部署细节见 `docs/public-site-deployment.md`。`apps/privacy-site` 和 `apps/checkout-site` 仍可独立构建，分别用于只部署隐私政策或只部署收银台的场景。

隐私政策独立站点：

```bash
npm run build -w @realtime-dubbing/privacy-site
# 输出目录：apps/privacy-site/dist
```

收银台独立站点：

```bash
npm run build -w @realtime-dubbing/checkout-site
# 输出目录：apps/checkout-site/dist
```

部署后把 API 环境变量指向公开 HTTPS `/pay` 路径：

```text
PAYMENT_CHECKOUT_BASE_URL=https://your-domain.example/pay
```

独立部署细节见 `docs/privacy-policy-deployment.md` 和 `docs/checkout-site-deployment.md`。

## 关键链路

1. Popup 点击启动后，background 调用 `chrome.tabCapture.getMediaStreamId` 获取当前标签页音频流 ID。
2. Background 创建 `offscreen.html`，把 stream ID、设置、client token 发给 offscreen document。
3. Offscreen 用 `getUserMedia` 打开 tab 音频，Web Audio 重新播放原声并按滑块调音量。
4. Offscreen 将音频降采样为 16k PCM16，在后端 WebSocket open 后立即发出；不等待阿里 `session.updated`，减少启动握手带来的首包延迟。
5. 后端用 `DASHSCOPE_API_KEY` 连接阿里 LiveTranslate，发送 `session.update`，开启 `modalities: ["text","audio"]` 和内置声音复刻；默认 `voice_clone_options.frequency: "always"` 用于多人动态跟随，popup 的“单人低延迟”会切到 `"once"` 做单人场景对照。收到阿里 `session.updated` 前，后端最多排队 500 个早到 PCM chunk；确认后才向插件发送 `session.ready` 并 flush 队列。
6. 后端把阿里的 `response.audio_transcript.*`、`response.audio.delta`、`response.done` 映射回扩展。
7. Content script 负责页面字幕覆盖；offscreen 负责播放中文译声，并把实际播放开始时间回报给后端。
8. 后端按用户汇总完整会话延迟样本，提供 P50/P95 诊断数据。

查询延迟汇总：

```bash
curl http://localhost:8787/v1/latency/summary \
  -H "Authorization: Bearer dev-client-token"
```

插件 popup 里的“延迟诊断”也会调用同一个接口，显示四个指标的 `P50/P95ms`。

查询账号状态：

```bash
curl http://localhost:8787/v1/account/status \
  -H "Authorization: Bearer dev-client-token"
```

插件 popup 的账号区会显示套餐、剩余分钟数、并发占用和当前是否可启动。
启动前会刷新一次账号状态；额度耗尽或并发已满时，启动按钮会禁用或直接阻止启动。

创建待支付订单：

```bash
curl -X POST http://localhost:8787/v1/payment-orders \
  -H "Authorization: Bearer dev-client-token" \
  -H "Content-Type: application/json" \
  -d '{"provider":"alipay","packageId":"pro_20m_cny_39"}'
```

订单金额和分钟数由服务端套餐目录决定；客户端传入的金额或分钟数会被忽略。当前可用开发套餐：

- `pro_20m_cny_39`：20 分钟，CNY 39.00。

插件 popup 顶部“订阅”按钮会使用当前账号凭据创建同一个支付宝待支付订单，并在状态栏显示订单号和金额。配置 `PAYMENT_CHECKOUT_BASE_URL` 后，API 会在订单响应中返回 HTTPS checkout URL，popup 会自动打开收银台；未配置时只创建内部订单并等待后续支付接入。
同时配置 `PAYMENT_STATUS_BASE_URL` 和 `PAYMENT_CHECKOUT_TOKEN_SECRET` 后，订单响应会包含签名只读 `checkout.statusUrl`，并把它追加到收银台 URL。收银台可用它查询订单状态；错误 token 会被拒绝，返回内容不包含用户身份字段。
待支付订单默认 30 分钟后过期。状态查询会自动把过期待支付订单标记为 `canceled`，并带 `cancelReason: "expired"`；用户也可以调用取消接口把仍在 pending 的订单标记为 `canceled`。取消或过期后的订单不会被支付 webhook 入账。
如果订单账本已经是 `paid` 且收到相同 `paymentId` 的重复回调，API 会直接返回 duplicate、补标支付幂等账本，并且不再增加分钟数，避免账本恢复不一致时重复入账。
`subscription.refunded` 回调会把已支付订单标记为 `refunded` 并记录 `refundedAt`，不会增加分钟；是否扣回已发分钟、部分退款和人工对账策略留给正式支付渠道接入时确定。

默认情况下，开发额度、支付幂等记录和待支付订单保存在内存里。配置 `BILLING_STORE_FILE` 后，用户套餐、剩余秒数和扣减结果会写入 JSON 文件；配置 `PAYMENT_LEDGER_FILE` 后，已处理的 `provider + paymentId` 会跨服务重启保留；配置 `PAYMENT_ORDER_STORE_FILE` 后，待支付订单和 paid 状态会写入 JSON 文件。活动会话占用只保存在当前进程内，服务重启后不会恢复旧的并发占用。

返回字段：

- `inputToFirstTextMs`：浏览器音频进入插件到首个中文文本。
- `inputToSentToAliMs`：浏览器音频进入插件到后端首包转发给阿里。
- `inputToFirstAudioMs`：浏览器音频进入插件到首个中文音频片段。
- `inputToPlaybackMs`：浏览器音频进入插件到中文译声实际开始播放。
- `sentToAliToFirstTextMs`：后端首包转发给阿里到首个中文文本。
- `sentToAliToFirstAudioMs`：后端首包转发给阿里到首个中文音频片段。
- `sessionToFirstAudioMs`：会话启动到首个中文音频片段。

## 生产化缺口

- 支付生产模式已支持登录后创建内部待支付订单、可配置 HTTPS checkout URL、签名订单状态查询、待支付订单过期/取消、退款状态流转、支付宝 RSA/RSA2 异步通知验签、支付宝成功交易状态校验、微信支付 API v3 平台证书验签、resource AES-256-GCM 解密、微信成功交易状态校验、订单金额匹配和 paid 状态落账；上线前仍需接入真实支付宝/微信预下单、支付收银台二维码/跳转、数据库订单账本、真实退款通知字段映射、取消订阅策略和对账。
- 登录系统目前仍是开发凭据签发短期 token；生产模式已经会关闭开发 token 直连和开发签发端点，商业版还需要接入真实账号登录、服务端刷新和风控。
- `<1 秒中文首声` 已有后端 P50/P95 汇总出口；真实阿里原声音色译声当前记录仍未达标，极速预听只能作为本地中文语音桥接，不能当成原声音色 KPI 已通过。
- 默认不保存原始音频和声纹；隐私政策源稿和可部署静态站点已经在仓库内，正式上架前还需要绑定公开 HTTPS URL、补用户授权文案、补日志脱敏策略并核对真实数据保留周期。
