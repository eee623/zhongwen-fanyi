# Chrome Web Store 权限说明

## 权限用途

`tabCapture`: 用户点击启动后，捕获当前标签页音频，用于英语到中文的实时字幕和中文配音。不会在用户未启动时捕获音频。

`offscreen`: Manifest V3 service worker 不能直接长期处理音频。offscreen document 用于接收 tab audio stream、重新播放原声、播放中文译声并完成 Web Audio 混音。

`storage`: 保存用户设置，例如源语言、目标语言、字幕开关、配音开关、原声音量、译声音量、字幕大小、后端地址和开发凭据。

`activeTab`: 用户从当前标签页启动同传时，扩展只对当前标签页执行启动、停止、字幕注入和音频捕获生命周期管理。

`scripting`: 用于在当前播放器页面注入或恢复字幕覆盖层，确保普通 HTML5 video、YouTube、优酷、B站和全屏播放器场景能显示中文字幕。

`<all_urls>`: 第一版需要覆盖 YouTube、优酷、B站、普通 HTML5 video，以及 Chrome 可播放的本地视频页面。不同网站播放器 URL 不固定，因此需要 broad host access 才能在用户启动同传后注入字幕层、响应页面刷新或跳转，并管理当前标签页会话。该权限不会用于读取浏览历史、cookies、表单、密码或与同传无关的网页数据。

## 最小化原则

- 不申请 `cookies`、`history`、`webRequest`、`downloads`、`bookmarks`、`management` 等与核心功能无关的权限。
- 不在用户未点击启动时捕获音频。
- 不读取页面正文内容来做翻译；翻译输入来自当前标签页音频流。
- 后续如果改为 optional host permissions，需要在 popup 或 onboarding 中按站点请求权限，并同步更新合规检查。
