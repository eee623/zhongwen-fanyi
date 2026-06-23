import { runAliConnectivityCheck } from "../apps/api/src/aliConnectivityCheck";

const result = await runAliConnectivityCheck({
  apiKey: process.env.DASHSCOPE_API_KEY,
  endpoint: process.env.ALI_LIVE_TRANSLATE_ENDPOINT ?? "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
});

if (result.ok) {
  console.log(`Aliyun realtime preflight passed: ${result.readyEventType} in ${result.elapsedMs}ms.`);
  process.exit(0);
}

if (result.reason === "missing_api_key") {
  console.error("Missing DASHSCOPE_API_KEY in .env. It must start with sk-.");
  process.exit(1);
}

const detail = result.code ? `${result.reason} (${result.code})` : result.reason;
console.error(`Aliyun realtime preflight failed: ${detail}.`);
if (result.message) {
  console.error(result.message);
}
process.exit(1);
