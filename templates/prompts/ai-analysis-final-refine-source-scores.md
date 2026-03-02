# CONTEXT

Use the context to better understand the user's query and purpose of the analysis.

- **Original query**: {{originalQuery}}
- **Evidence (verified facts)**:
<<<
{{{evidencePack}}}
>>>

# CURRENT SOURCES (score these)
<<<
{{{sources}}}
>>>

# TASK
Call \`update_source_scores\` with an array of { sourceId, score }.
- sourceId: use the source's id or path exactly as in the list.
- score: 0–100. Low relevance → 0–20; medium → 30–60; high → 70–100.
- No reasoning needed in this phase.