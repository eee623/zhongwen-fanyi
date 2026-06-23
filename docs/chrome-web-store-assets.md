# Chrome Web Store 上架资产

这些文件不是扩展 zip 内的运行时代码，而是提交 Chrome Web Store 后台时必须上传或填写的素材。它们仍然进入本地发布门，避免扩展包能打出来但后台审核材料不完整。

## 当前资产

- Store icon: `store-assets/chrome-web-store/icon-128.png`，128x128 PNG。
- Screenshot: `store-assets/chrome-web-store/screenshots/popup-and-subtitles-1280x800.png`，1280x800 PNG。
- Small promo tile: `store-assets/chrome-web-store/promo-small-440x280.png`，440x280 PNG。
- Submission metadata: `store-assets/chrome-web-store/submission.json`，包含隐私政策 URL、订阅/内购披露和单一用途声明。
- Public privacy policy source: `docs/privacy-policy-public.md`。
- Deployable public site: `apps/public-site`，构建后输出 `apps/public-site/dist/privacy/index.html` 和 `apps/public-site/dist/pay/index.html`，正式发布前必须部署到公开 HTTPS 产品域名。

## 机器门禁

`npm run check:chrome-store` 会扫描 `store-assets/chrome-web-store` 并要求：

- 至少一个 128x128 PNG store icon。
- 至少一张 1280x800 PNG 或 JPEG screenshot。
- 一个 440x280 PNG 或 JPEG small promo tile。
- 一个公开 HTTPS 隐私政策 URL，不能是 localhost、example、pending 占位符或非隐私政策路径。
- 如果填写了真实 URL，脚本会请求该 URL；页面打不开、返回错误状态或内容不像隐私政策时，发布门仍然失败。
- `docs/privacy-policy-public.md` 必须披露音频、账号、订阅、支付、第三方处理方、数据保留和 Limited Use。

缺失或尺寸不匹配时，`npm run package:chrome-store` 会失败，不能生成提交审核用 zip。

正式发布前，将隐私政策部署到官网或托管站点后运行：

```bash
PUBLIC_SITE_BASE_URL=https://your-domain.example npm run build:public-site
CHROME_STORE_PRIVACY_POLICY_URL=https://your-domain.example/privacy npm run package:chrome-store
```

## 人工复核

- 截图必须展示真实产品体验：用户主动启动、当前标签页音频捕获、中文字幕、中文配音和隐私提示。
- 图片文案必须与 `docs/chrome-web-store-listing.md`、`docs/chrome-web-store-permissions.md`、`docs/privacy-disclosure.md` 保持一致。
- Chrome Developer Dashboard 的隐私政策字段必须填写真实公开 URL，不能只写在商店描述里。
- 如果 UI、权限、数据处理或产品范围变化，必须同步更新截图和推广图。
