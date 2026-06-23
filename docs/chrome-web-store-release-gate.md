# Chrome Web Store 上架发布门

这个项目的发布标准是：功能可用还不够，必须严格满足 Chrome Web Store 上架要求。任何一项不满足，都不得提交审核、不得发布生产版本。

## 必须通过的本地门禁

```bash
npm test
npm run typecheck
npm run build
npm run smoke:mock
npm run check:production-config
npm run check:chrome-store
npm run package:chrome-store
```

`npm run smoke:extension:mock` 只作为 Chrome 自动化诊断脚本，不作为默认通过门。Chrome 可能要求用户主动点击扩展图标或授予站点访问权后，才允许内容脚本/程序化注入访问页面；真实 tabCapture 验证以 `npm run manual:mock` 的人工 popup 点击路径为准。

自动化诊断脚本会尝试通过 `_execute_action` 快捷键打开 popup，但 Chrome for Testing 在某些桌面自动化环境下不会暴露真实可聚焦浏览器窗口，macOS System Events 和 CDP `Input.dispatchKeyEvent` 都可能无法产生 Chrome 认可的用户 invocation。遇到 `Extension has not been invoked for the current page (see activeTab permission)` 时，不得把脚本回退改成绕过 `activeTab` 或自动捕获；应保留失败证据，并用人工点击扩展 popup 的方式完成 `tabCapture` 验收。

`npm run check:production-config` 是商业发布硬门。它会强制按生产模式解析 `.env`，拒绝 mock 翻译、开发 token 回退、内存 billing/payment/order 账本、非 HTTPS 收银台或订单状态 URL、占位域名、占位密钥、缺失订单状态签名 secret，以及缺失支付宝/微信生产验签材料的配置。
生产部署变量模板见 `docs/production.env.example`。正式环境应把这些变量放入部署平台或密钥管理系统，不要提交填好真实 secret 的文件。
可先用当前 Chrome Store 提交元数据生成一份非敏感生产环境草案：

```bash
npm run production:env:draft
```

该命令会推导公开站点、隐私政策、收银台 URL，并列出仍必须放进密钥管理系统的阿里、支付和签名材料。生成结果包含占位密钥和默认 API 域名，占位值必须让 `npm run check:production-config` 失败，直到生产密钥管理系统中全部替换为真实值。

`npm run check:chrome-store` 会读取构建后的 manifest，并检查以下审核材料是否齐全：

- `docs/chrome-web-store-listing.md`
- `docs/chrome-web-store-permissions.md`
- `docs/privacy-disclosure.md`
- `docs/privacy-policy-public.md`
- `store-assets/chrome-web-store/submission.json`
- `store-assets/chrome-web-store/icon-128.png`
- `store-assets/chrome-web-store/screenshots/*.png`
- `store-assets/chrome-web-store/promo-small-440x280.png`

门禁失败时会同时打印机器可读的审核清单，逐项显示：

- Manifest V3、权限 allowlist、CSP 和本地打包 content scripts。
- Toolbar action 是否打开打包内的 `popup.html`，以及 `_execute_action` 快捷键是否保留为用户触发入口。
- Manifest / toolbar PNG 图标是否随包输出。
- Chrome Web Store 图形素材是否齐全。
- 公开 HTTPS 隐私政策 URL 是否可访问。
- 用户数据、音频处理、保留周期和 Limited Use 披露。
- 真实源码中 `chrome.tabCapture.getMediaStreamId` 是否只通过 popup Start 按钮进入 `popup.start` 后台处理分支。
- `tabCapture`、`offscreen`、`storage`、`activeTab`、`scripting`、`<all_urls>` 权限说明。
- 单一用途、用户点击触发音频捕获和付费订阅披露。

只有所有项目都是 `PASS` 时，才允许进入 `npm run package:chrome-store`。如果只剩 `Public HTTPS privacy policy URL` 是 `BLOCKED`，说明本地代码、素材和披露文本已通过机器检查，但仍必须先部署公开 `/privacy` 页面。

`npm run package:chrome-store` 必须作为提交审核前的唯一打包入口。它会先执行 `npm run check:chrome-store`，再生成 Chrome Web Store 上传 zip，避免绕过发布门。

如果 `store-assets/chrome-web-store/submission.json` 里的 `privacyPolicyUrl` 仍是占位符，门禁必须失败。当前审核别名部署为 `https://chrome-store--realtime-dubbing-cn.netlify.app/privacy/`。切换到自有产品域名后，用环境变量覆盖：

```bash
PUBLIC_SITE_BASE_URL=https://your-domain.example npm run build:public-site
CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run package:chrome-store
```

`apps/public-site` 会把 `docs/privacy-policy-public.md` 构建到 `/privacy/`，并把订阅收银台构建到 `/pay/`，输出到 `apps/public-site/dist`。可用 Netlify、官网或其他公开 HTTPS 静态托管发布；不要部署到与本产品无关的现有站点。部署步骤见 `docs/public-site-deployment.md`。

## Manifest 与权限

- 必须使用 Manifest V3。
- Toolbar action 必须打开打包内的 `popup.html` 控制面板，并保留 `_execute_action` 快捷键，作为真实用户触发同传启动的入口之一。
- Manifest 必须声明 16、32、48、128 PNG 图标；toolbar action 必须声明同尺寸 `default_icon`，且这些文件必须随扩展包打包。
- 不允许加入未评审权限；当前 MVP allowlist 只有 `activeTab`、`offscreen`、`scripting`、`storage`、`tabCapture`。
- `<all_urls>` 是为了覆盖 YouTube、优酷、B站、普通 HTML5 video 和 Chrome 可播放本地视频的核心能力，必须在 Chrome Web Store 隐私与权限字段中逐项解释。
- 后续如果改成 optional host permissions，需要在 popup 或 onboarding 中明确请求站点权限，并更新合规检查。

## 隐私与用户数据

- 音频只允许在用户主动点击启动后捕获；停止按钮、标签关闭、页面刷新必须立即断流。
- `npm run check:chrome-store` 会读取 `background.ts`、popup、offscreen 和 content script 源码，确认 `tabCapture` 只从用户点击 Start 后的 `popup.start` 路径启动；任何自动启动捕获的代码都必须让门禁失败。
- 默认不保存原始音频、不保存声纹；只保留计费、额度、并发和延迟诊断所需的最小日志。
- Chrome Web Store 隐私字段必须准确披露：音频会被发送到自有后端，再由后端代理到翻译服务；阿里 API Key 不进入客户端。
- 官网或隐私政策页必须包含 Limited Use / 数据使用披露，说明数据只用于实时翻译、配音、计费和故障诊断。

## 远程代码与内容安全

- 插件包内执行的全部代码必须随扩展一起打包；不得从 CDN、后端或第三方域名下载并执行 JS。
- `content_security_policy.extension_pages` 的 `script-src` 只能允许 `'self'`，不得包含远程脚本源、`unsafe-eval` 或 `unsafe-inline`。
- 允许连接后端 WebSocket/HTTPS API，但服务端返回的数据只能作为字幕、音频或配置数据处理，不能作为可执行代码处理。

## 审核材料

- Chrome Web Store listing 需要清楚说明：本扩展会在用户点击启动后捕获当前标签页音频，用于英语到中文实时字幕和配音。
- 权限说明必须覆盖 `tabCapture`、`offscreen`、`storage`、`activeTab`、`scripting` 和 `<all_urls>` 的必要性。
- 隐私政策需要覆盖账号、订阅/支付、翻译分钟数、并发限制、延迟日志、音频转发、第三方处理方和数据保留周期。
- Chrome Developer Dashboard 的隐私政策字段必须填写公开可访问的 HTTPS URL；不能使用 localhost、example、pending 占位符，也不能只把隐私政策写在商店描述里。
- `npm run check:chrome-store` 会在填写真实 URL 后实际请求该页面；页面不可访问或内容不像隐私政策时必须失败。
- 上架图形资产必须包含 128x128 store icon、至少一张 1280x800 screenshot、440x280 small promo tile；详见 `docs/chrome-web-store-assets.md`。
- 以上材料必须通过 `npm run check:chrome-store` 的机器检查；缺少 `<all_urls>` 解释、音频处理披露或用户主动触发说明时，检查必须失败。
- 商业版上线前，支付回调必须使用 `PAYMENT_VERIFICATION_MODE=production`、支付宝公钥、微信平台证书、微信 APIv3 密钥和 `PAYMENT_ORDER_STORE_FILE`/数据库订单账本；真实支付宝/微信预下单、支付跳转/收银台、订单对账、退款/取消订阅流转和正式数据库持久化仍是发布前必补项。
- API 生产部署必须设置 `NODE_ENV=production` 或 `API_ENV=production`。此模式会禁止 mock 翻译、开发 token 直连和开发 token 签发端点，并强制要求云 Key、短期 token secret、文件持久化账本、HTTPS 收银台 URL、HTTPS 订单状态 base URL、订单状态签名 secret 和生产支付验签材料；缺失时服务必须拒绝启动。

## 官方依据

- Chrome Web Store Program Policies: https://developer.chrome.com/docs/webstore/program-policies
- Chrome Web Store privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- User data and Limited Use FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Remote hosted code guidance: https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- Content script permissions: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
