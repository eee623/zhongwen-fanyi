import { runMockE2eSmoke } from "./e2eSmoke.js";

const result = await runMockE2eSmoke();

console.log(JSON.stringify(result, null, 2));
