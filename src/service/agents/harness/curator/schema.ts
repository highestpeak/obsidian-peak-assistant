/**
 * Zod schema for the Curator agent's structured output. Drives `generateObject`
 * so the LLM returns shape-valid JSON without prompt-side bargaining.
 *
 * Hard semantics (RAM, budget, unknown model_id) are NOT enforced here — see
 * validation.ts. Schema-level constraints only catch shape errors that don't
 * need the catalog or environment context.
 */

import { z } from 'zod';

const profileKindEnum = z.enum([
    'anthropic',
    'openai',
    'google',
    'perplexity',
    'ollama',
    'openrouter',
    'litellm',
    'custom',
]);

const capabilityBindings = z.object({
    quick: z.string().min(1, 'quick binding required'),
    deep: z.string().min(1, 'deep binding required'),
    premium: z.string().min(1, 'premium binding required'),
});

export const RecommendationSchema = z.object({
    bindings: capabilityBindings,
    cascadeEnabled: z.boolean(),
    modelsToDownload: z.array(z.string()),
    apiKeysNeeded: z.array(profileKindEnum),
    rationale: z
        .string()
        .min(10, 'rationale must explain the choice — at least one sentence in Chinese.'),
});

export type RecommendationSchemaShape = z.infer<typeof RecommendationSchema>;
