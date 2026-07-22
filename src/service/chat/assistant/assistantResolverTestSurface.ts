/**
 * Test-only re-exports for helpers in assistantResolver.ts.
 *
 * `mergeAssistantKnowledgeRefs` was previously duplicated here to avoid
 * exposing a private helper through the module barrel. It has since been
 * promoted to an explicit export on assistantResolver.ts (F2 fix — B2 review).
 * This shim re-exports it under the legacy name used by the tests so the
 * test import path does not need to change.
 */

export { mergeAssistantKnowledgeRefs as mergeAssistantKnowledgeRefsForTest } from './assistantResolver';
