import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/core/providers/vercel/provider-factory.ts', 'utf8');
const lmStudioCase = source.slice(source.indexOf("case 'lmstudio':"), source.indexOf("case 'codex':"));

assert.match(lmStudioCase, /createOpenAI\(/, 'LM Studio must use its configured OpenAI-compatible local transport');
assert.match(lmStudioCase, /baseURL: baseUrl \|\| undefined/, 'LM Studio must preserve the configured local base URL');
assert.match(lmStudioCase, /apiKey: apiKey\?\.trim\(\) \|\| 'lm-studio-local'/, 'keyless LM Studio must satisfy the SDK without selecting another provider');
assert.match(lmStudioCase, /fetch: corsBypassFetch \?\? undefined/, 'LM Studio execution must bypass renderer CORS through the app-owned transport');
assert.match(lmStudioCase, /return provider\.chat\(resolvedModelId\)/, 'LM Studio must use chat/completions with the exact resolved model id');
assert.doesNotMatch(lmStudioCase, /return provider\(resolvedModelId\)/, 'LM Studio must not use the AI SDK default responses endpoint');
assert.doesNotMatch(lmStudioCase, /case 'openai'|case 'openrouter'/, 'the LM Studio branch must remain isolated from other provider cases');

console.log('lmstudio-keyless-runtime: exact local route contract passed');
