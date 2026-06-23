# Real Aliyun Latency Evidence

| measuredAt | label | voiceCloneFrequency | runs | firstTextP95Ms | previewPlaybackP95Ms | firstAudioP95Ms | sentToAliToFirstAudioP95Ms | KPI | bottleneck |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 2026-06-22T19:22:10.000Z | early-streaming-baseline | always | 1 | 707 | - | 2651 | 2417 | FAIL | aliyun-audio-generation |
| 2026-06-22T19:23:32.722Z | once-low-latency-smoke | once | 1 | 693 | - | 2711 | 2492 | FAIL | aliyun-audio-generation |
| 2026-06-22T23:59:07.189Z | matrix-minimal-always-c10-s10 | always | 1 | 707 | - | 2676 | 2456 | FAIL | aliyun-audio-generation |

首字 P95 低于 1000ms 只能证明字幕链路达标；中文译声首音必须单独看 `firstAudioP95Ms`。
`previewPlaybackP95Ms` 只代表本地极速预听首声，不代表阿里原声音色克隆配音达标。
当 `sentToAliToFirstAudioP95Ms` 接近 `firstAudioP95Ms` 且超过阈值时，主要瓶颈在上游中文音频生成。

Current recommendation: Recorded Aliyun voice-clone and pacing samples miss the one-second translated-audio KPI; prioritize an alternate low-latency audio path instead of only tuning voice_clone_options.frequency or PCM pacing.
