export interface ManualAcceptanceScenario {
  id: string;
  title: string;
  evidence: string[];
}

export interface ManualAcceptanceValidationResult {
  ready: boolean;
  errors: string[];
}

const requiredPreflightEvidence = [
  "npm run manual:media-fixtures",
  "manual-test/generated/local-english-fixture.mp4",
  "manual-test/generated/local-english-fixture.webm",
  "Allow access to file URLs"
];

export const requiredManualAcceptanceScenarios: ManualAcceptanceScenario[] = [
  {
    id: "html5-mock",
    title: "普通 HTML5 video mock 回环",
    evidence: ["字幕出现", "中文译声可听", "Chrome target check 找到测试页和扩展 service worker"]
  },
  {
    id: "html5-aliyun",
    title: "普通 HTML5 video 真实阿里链路",
    evidence: ["字幕出现", "中文译声可听", "阿里 session.updated 预检通过"]
  },
  {
    id: "youtube-aliyun",
    title: "YouTube 真实网页播放器",
    evidence: ["用户点击启动后捕获当前标签页音频", "中文字幕显示", "中文配音播放"]
  },
  {
    id: "youku-aliyun",
    title: "优酷真实网页播放器",
    evidence: ["中文字幕显示", "中文配音播放", "播放器控制条不遮挡主要字幕"]
  },
  {
    id: "bilibili-aliyun",
    title: "B站真实网页播放器",
    evidence: ["中文字幕显示", "中文配音播放", "普通页面和网页全屏可用"]
  },
  {
    id: "local-mp4",
    title: "Chrome 可播放本地 mp4/webm",
    evidence: ["Allow access to file URLs 已开启", "本地视频可启动", "字幕和译声正常"]
  },
  {
    id: "file-access-blocked",
    title: "本地文件权限关闭拦截",
    evidence: ["popup 显示本地文件权限未开启", "启动按钮不可用或启动前被拦截"]
  },
  {
    id: "unsupported-local-format",
    title: "mkv/avi 暂不支持提示",
    evidence: ["mkv/avi 被识别为第一版暂不支持", "没有误报独立播放器支持"]
  },
  {
    id: "volume-mix",
    title: "原声/译声音量 0/50/100",
    evidence: ["原声音量滑块生效", "译声音量滑块生效", "混音无爆音"]
  },
  {
    id: "subtitle-fullscreen",
    title: "字幕、悬浮球和全屏字幕",
    evidence: ["普通页面字幕", "网页全屏字幕", "关闭悬浮球和全屏字幕开关后行为正确"]
  },
  {
    id: "session-lifecycle",
    title: "启动、停止、刷新、跳转、关标签",
    evidence: ["停止立即断流", "刷新/跳转自动清空字幕", "关闭标签后后端会话释放"]
  },
  {
    id: "voice-clone",
    title: "多人声音复刻和单人低延迟对照",
    evidence: ["多人跟随模式记录", "单人低延迟模式记录", "不持久保存声纹"]
  },
  {
    id: "low-latency-preview",
    title: "极速预听低延迟中文语音桥接",
    evidence: ["首段中文字幕后快速听到本地中文语音", "关闭极速预听后不触发本地语音", "阿里原声音色译声仍正常播放"]
  },
  {
    id: "latency-diagnostics",
    title: "首字/首音/播放延迟诊断",
    evidence: ["首字/首音/播放 P50/P95", "若首音 >1s 标记为未达标", "记录 smoke:aliyun 或 matrix 输出"]
  }
];

export function createManualAcceptanceReportTemplate(generatedAt = "TODO"): string {
  return [
    "# Chrome 手动验收报告",
    "",
    `生成时间：${generatedAt}`,
    "构建版本：TODO",
    "测试人员：TODO",
    "Chrome 版本：TODO",
    "扩展包路径：apps/extension/.output/chrome-mv3",
    "",
    "说明：每个必测场景都需要把 `Result` 勾成 PASS，并把 TODO 替换成实际证据；不要使用 recorded、ok、pass、done 这类空泛词。若中文译声首音仍高于 1 秒，请在延迟场景中保留未达标记录，不要写成通过 KPI。",
    "",
    "## 验收前准备",
    "- 运行 `npm run manual:media-fixtures` 生成 Chrome 可直接播放的本地视频素材。",
    "- 本地文件验收使用 `manual-test/generated/local-english-fixture.mp4` 和 `manual-test/generated/local-english-fixture.webm`。",
    "- Chrome 扩展详情页开启 Allow access to file URLs 后，再打开本地视频的 `file://` 页面。",
    "- 保留 `npm run manual:media-fixtures`、`file`、`ffprobe` 或等价工具输出作为本地文件证据。",
    "",
    ...requiredManualAcceptanceScenarios.flatMap((scenario) => [
      `## ${scenario.id} - ${scenario.title}`,
      "- [ ] Result: PASS",
      ...scenario.evidence.map((item) => `- ${item}: TODO`),
      ""
    ])
  ].join("\n");
}

export function validateManualAcceptanceReport(report: string): ManualAcceptanceValidationResult {
  const errors: string[] = [];

  validateAuditMetadata(report, errors);
  validatePreflightEvidence(report, errors);

  for (const scenario of requiredManualAcceptanceScenarios) {
    const block = scenarioBlock(report, scenario);
    if (!block) {
      errors.push(`${scenario.id} section is missing.`);
      continue;
    }
    if (!/- \[x\] Result: PASS/i.test(block)) {
      errors.push(`${scenario.id} must be marked as PASS.`);
    }
    validateScenarioEvidence(block, scenario, errors);
    if (/\bTODO\b/i.test(block)) {
      errors.push(`${scenario.id} still contains TODO placeholders.`);
    }
  }

  return {
    ready: errors.length === 0,
    errors
  };
}

function validateScenarioEvidence(block: string, scenario: ManualAcceptanceScenario, errors: string[]) {
  for (const evidence of scenario.evidence) {
    const value = scenarioEvidenceValue(block, evidence);
    if (value === undefined) {
      errors.push(`${scenario.id} evidence "${evidence}" is missing.`);
      continue;
    }
    if (isWeakEvidenceValue(value)) {
      errors.push(`${scenario.id} evidence "${evidence}" must contain a concrete observation.`);
    }
  }
}

function scenarioEvidenceValue(block: string, evidence: string): string | undefined {
  const prefix = `- ${evidence}:`;
  const line = block.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  return line?.slice(prefix.length).trim();
}

function isWeakEvidenceValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length < 12 ||
    /\bTODO\b/i.test(value) ||
    ["recorded", "pass", "passed", "ok", "done", "yes", "n/a", "na", "none", "无"].includes(normalized)
  );
}

function validateAuditMetadata(report: string, errors: string[]) {
  const fields = [
    { label: "生成时间", error: "Generated time must be recorded." },
    { label: "构建版本", error: "Build version must be recorded." },
    { label: "测试人员", error: "Tester must be recorded." },
    { label: "Chrome 版本", error: "Chrome version must be recorded." },
    { label: "扩展包路径", error: "Extension package path must be recorded." }
  ];

  for (const field of fields) {
    const value = metadataValue(report, field.label);
    if (!value || /\bTODO\b/i.test(value)) {
      errors.push(field.error);
    }
  }
}

function metadataValue(report: string, label: string): string | undefined {
  const line = report.split(/\r?\n/).find((candidate) => candidate.startsWith(`${label}：`));
  return line?.slice(label.length + 1).trim();
}

function validatePreflightEvidence(report: string, errors: string[]) {
  const heading = "## 验收前准备";
  const start = report.indexOf(heading);
  if (start === -1) {
    errors.push("Manual acceptance preflight section is missing.");
    return;
  }

  const next = report.indexOf("\n## ", start + heading.length);
  const block = next === -1 ? report.slice(start) : report.slice(start, next);
  for (const required of requiredPreflightEvidence) {
    if (!block.includes(required)) {
      errors.push(`Manual acceptance preflight section must mention ${required}.`);
    }
  }
}

function scenarioBlock(report: string, scenario: ManualAcceptanceScenario): string | undefined {
  const heading = `## ${scenario.id} - `;
  const start = report.indexOf(heading);
  if (start === -1) {
    return undefined;
  }
  const next = report.indexOf("\n## ", start + heading.length);
  return next === -1 ? report.slice(start) : report.slice(start, next);
}
