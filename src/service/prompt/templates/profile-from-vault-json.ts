/**
 * Extract user profile items from vault content. Tuned for small models (e.g. Phi): atomic facts, BAD/GOOD examples, split if long.
 */
export const expectsJson = true;
export const jsonConstraint = 'Return only the JSON array, nothing else.';

export const systemPrompt = `You are a Profile Extractor. Extract ONLY facts about the user (where they live, job, education, preferences). Do NOT extract essays, assignments, or content about other people or topics like climate, biodiversity, research. Output ONLY a JSON array. NO parentheses in "text".`;

export const template = `Extract ONLY facts about the user themselves from the text below. One fact per JSON object.

ONLY extract: where the user lives, their job/employment, their education, their preferences (dark mode, tools), their family, hobbies, decisions (e.g. switched to TypeScript). Facts must be about the user (I am..., I live..., I prefer..., I work..., I study...).

DO NOT extract: content about other people (e.g. Dr. Jane Goodall), assignments, essays, climate change, biodiversity, ecosystems, invasive species, deforestation, research topics, SDG, e-waste, conferences, keynotes. If the passage is mostly about these, output [] or only the one sentence that clearly describes the user (e.g. "I am based in Auckland"). Long paragraphs about ecosystems or research = do not extract.

Negative: NO parentheses in "text". NO [notes]. "text" max 10 words; if longer, split into two objects.
Each object: "text", "category" (Location, Employment, Education, Preferences, Tools), optional "confidence" (0-1).

Content:
---
{{{vaultContent}}}
---

BAD: extracting a long paragraph about deforestation or Dr. Goodall. BAD: {"text": "Based in Auckland (8 words)", ...}
GOOD: [{"text": "Based in Auckland", "category": "Location", "confidence": 0.95}] when that is the only user fact in the passage. If no user facts, return [].

Return only the JSON array.`;
