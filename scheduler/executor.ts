// Thin adapter so existing imports keep working. The real execution logic
// lives in src/lib/execution-core.ts and is shared with the Vercel API.
export {
  executeHttpRequest,
  buildRequestUrl,
  buildRequestBody,
  type ExecutionResult,
  type ExecutionRequestConfig,
} from "../src/lib/execution-core";