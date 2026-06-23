import { loadConfig } from "./config.js";
import { createLiveTranslationServer } from "./sessionServer.js";

const config = loadConfig();
const liveServer = createLiveTranslationServer(config);

await liveServer.listen();

console.log(`Realtime dubbing API listening on ws://localhost:${config.port}/v1/live`);

process.on("SIGINT", async () => {
  await liveServer.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await liveServer.close();
  process.exit(0);
});
