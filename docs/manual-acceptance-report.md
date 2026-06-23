# Chrome 手动验收报告

生成时间：2026-06-22T19:30:28.503Z
构建版本：0.1.0
测试人员：Codex 自动预检；最终 PASS 仍需人工点击 popup 复核
Chrome 版本：Chrome for Testing 150.0.7871.24
扩展包路径：apps/extension/.output/chrome-mv3

说明：每个必测场景都需要把 `Result` 勾成 PASS，并把 TODO 替换成实际证据；不要使用 recorded、ok、pass、done 这类空泛词。若中文译声首音仍高于 1 秒，请在延迟场景中保留未达标记录，不要写成通过 KPI。

## 验收前准备
- 运行 `npm run manual:media-fixtures` 生成 Chrome 可直接播放的本地视频素材。
- 本地文件验收使用 `manual-test/generated/local-english-fixture.mp4` 和 `manual-test/generated/local-english-fixture.webm`。
- Chrome 扩展详情页开启 Allow access to file URLs 后，再打开本地视频的 `file://` 页面。
- 保留 `npm run manual:media-fixtures`、`file`、`ffprobe` 或等价工具输出作为本地文件证据。

## html5-mock - 普通 HTML5 video mock 回环
- [ ] Result: PASS
- 字幕出现: 未完成；当前 Codex GUI 环境无法点击真实 Chrome popup，仍需人工启动扩展后确认。
- 中文译声可听: 未完成；当前 Codex GUI 环境无法点击真实 Chrome popup，仍需人工启动扩展后确认。
- Chrome target check 找到测试页和扩展 service worker: PASS evidence from `PORT=8787 CHROME_DEBUG_PORT=9557 CHROME_PROFILE_DIR=/Users/lijun/Documents/中文播放软件/.tmp/chrome-manual-gui-profile-cft-staged-9557 npm run manual:mock`; found page `中文同传 HTML5 播放器测试页` and extension service worker `chrome-extension://hipglkhfjilbfpinnchgbjlaikkjolpp/background.js`.

## html5-aliyun - 普通 HTML5 video 真实阿里链路
- [ ] Result: PASS
- 字幕出现: TODO
- 中文译声可听: TODO
- 阿里 session.updated 预检通过: TODO

## youtube-aliyun - YouTube 真实网页播放器
- [ ] Result: PASS
- 用户点击启动后捕获当前标签页音频: TODO
- 中文字幕显示: TODO
- 中文配音播放: TODO

## youku-aliyun - 优酷真实网页播放器
- [ ] Result: PASS
- 中文字幕显示: TODO
- 中文配音播放: TODO
- 播放器控制条不遮挡主要字幕: TODO

## bilibili-aliyun - B站真实网页播放器
- [ ] Result: PASS
- 中文字幕显示: TODO
- 中文配音播放: TODO
- 普通页面和网页全屏可用: TODO

## local-mp4 - Chrome 可播放本地 mp4/webm
- [ ] Result: PASS
- Allow access to file URLs 已开启: TODO
- 本地视频可启动: FIXTURE evidence from `npm run manual:media-fixtures`; generated `manual-test/generated/local-english-fixture.mp4` and `manual-test/generated/local-english-fixture.webm`. `ffprobe` confirmed MP4 has H.264 video + AAC audio, and WebM has VP9 video + Opus audio.
- 字幕和译声正常: TODO

## file-access-blocked - 本地文件权限关闭拦截
- [ ] Result: PASS
- popup 显示本地文件权限未开启: TODO
- 启动按钮不可用或启动前被拦截: TODO

## unsupported-local-format - mkv/avi 暂不支持提示
- [ ] Result: PASS
- mkv/avi 被识别为第一版暂不支持: CODE evidence from `apps/extension/test/fileAccess.test.ts`; `.mkv` and `.AVI` return blocked status with message `第一版仅支持 Chrome 可直接播放的本地视频，mkv/avi 暂不支持`.
- 没有误报独立播放器支持: CODE evidence from `apps/extension/test/fileAccess.test.ts`; unrelated local files such as `.txt` and `.pdf` now return blocked status with message `第一版仅支持 Chrome 可直接播放的本地 mp4/webm 视频或 HTML5 测试页`. Final PASS still needs manual popup check.

## volume-mix - 原声/译声音量 0/50/100
- [ ] Result: PASS
- 原声音量滑块生效: TODO
- 译声音量滑块生效: TODO
- 混音无爆音: TODO

## subtitle-fullscreen - 字幕、悬浮球和全屏字幕
- [ ] Result: PASS
- 普通页面字幕: TODO
- 网页全屏字幕: TODO
- 关闭悬浮球和全屏字幕开关后行为正确: TODO

## session-lifecycle - 启动、停止、刷新、跳转、关标签
- [ ] Result: PASS
- 停止立即断流: TODO
- 刷新/跳转自动清空字幕: TODO
- 关闭标签后后端会话释放: TODO

## voice-clone - 多人声音复刻和单人低延迟对照
- [ ] Result: PASS
- 多人跟随模式记录: TODO
- 单人低延迟模式记录: TODO
- 不持久保存声纹: TODO

## low-latency-preview - 极速预听低延迟中文语音桥接
- [ ] Result: PASS
- 首段中文字幕后快速听到本地中文语音: TODO
- 关闭极速预听后不触发本地语音: TODO
- 阿里原声音色译声仍正常播放: TODO

## latency-diagnostics - 首字/首音/播放延迟诊断
- [ ] Result: PASS
- 首字/首音/播放 P50/P95: TODO
- 若首音 >1s 标记为未达标: TODO
- 记录 smoke:aliyun 或 matrix 输出: TODO
