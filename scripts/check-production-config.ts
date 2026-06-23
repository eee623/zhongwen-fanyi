import { checkProductionConfig } from "../apps/api/src/productionConfigCheck";

const result = checkProductionConfig();

if (result.ok) {
  console.log(result.message);
  process.exit(0);
}

console.error(result.message);
for (const error of result.errors) {
  console.error(`[production-config error] ${error}`);
}
process.exit(1);
