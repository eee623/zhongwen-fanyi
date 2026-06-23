import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createProductionEnvDraft,
  createProductionEnvDraftFromPrivacyPolicyUrl
} from "../apps/api/src/productionEnvDraft";

interface SubmissionMetadata {
  privacyPolicyUrl?: string;
}

const privacyPolicyUrl = process.argv[2] ?? (await readSubmissionPrivacyPolicyUrl());
const apiBaseUrl = process.argv[3] ?? process.env.PAYMENT_STATUS_BASE_URL;
const draft = privacyPolicyUrl.includes("/privacy")
  ? createProductionEnvDraftFromPrivacyPolicyUrl(privacyPolicyUrl, apiBaseUrl)
  : createProductionEnvDraft({
      publicBaseUrl: privacyPolicyUrl,
      apiBaseUrl
    });

console.log(draft.env);
console.error(`Required secrets: ${draft.requiredSecrets.join(", ")}`);

async function readSubmissionPrivacyPolicyUrl(): Promise<string> {
  const path = resolve(process.cwd(), "store-assets/chrome-web-store/submission.json");
  const metadata = JSON.parse(await readFile(path, "utf8")) as SubmissionMetadata;
  if (!metadata.privacyPolicyUrl) {
    throw new Error("Chrome Store submission metadata has no privacyPolicyUrl.");
  }
  return metadata.privacyPolicyUrl;
}
