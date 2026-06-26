// T11J A1: PromptId moved to `@/core/prompt/PromptId`. This file is a
// thin re-export shim so existing `@/service/prompt/PromptId` callers keep
// working. Do not add new declarations here — extend the core module
// instead.
export * from '@/core/prompt/PromptId';
