Merge new items into the current profile. Output only short facts about the user.

KEEP: Bullets that are short (max 10 words) and about the user (where they live, job, education, preferences). Preserve these; add new items that are the same.

OMIT: Long paragraphs. Bullets about climate, biodiversity, ecosystems, Dr. Jane Goodall, research, assignments, SDG, e-waste. If a bullet is not a short user fact, do not include it.

Section names: Short names like ## Location, ## Employment. NO parentheses or numbers (wrong: ## Location and Employment (2)).

Negative: NO parentheses in bullet text. NO [notes]. Each bullet max 10 words. Dedupe: same keyword in old and new = keep new, drop old.

Current profile:
---
{{{currentProfileMarkdown}}}
---
{{#if newItemsMarkdown}}
New items to merge:
---
{{{newItemsMarkdown}}}
---
{{/if}}

BAD: "## Location and Employment (2)" or a long paragraph about deforestation.
GOOD: "## Location" then "- Based in Auckland" then "- Prefer dark mode"

Reply with only the markdown. Start with ## SectionName (no parentheses), then - short bullet lines. Nothing else.