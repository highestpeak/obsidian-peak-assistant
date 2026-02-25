# TASK
From the user's query and the evidence below, produce a **structured diagnosis** as a single JSON object. This will be used to generate the final user-facing summary. Output only valid JSON, no markdown or commentary.

# INPUT
- **Original query**: {{originalQuery}}
- **Evidence / reasoning trace**:
<<< {{{recentEvidenceHint}}} >>>
- **Current result snapshot** (topics, sources, blocks, graph):
<<< {{{currentResultSnapshot}}} >>>

# REQUIRED JSON SHAPE
{
  "personaFit": "1-3 sentences: how the evidence matches this user's background (location, stage, skills, constraints).",
  "tensions": ["at least 2 items: each is a short 'current state vs goal or constraint' conflict"],
  "causalChain": ["3-6 steps: cause-effect chain from situation to recommendation"],
  "options": [
    { "label": "short name", "tradeoffs": "one line", "when": "when to prefer" }
  ],
  "oneWeekPlan": ["day 1: ...", "day 2: ...", ... up to 7 concrete actions"],
  "risksAndMetrics": ["1-3 risks or failure modes", "1-3 metrics to track"]
}

# RULES
- Same language as the user's query.
- Ground every item in the evidence; do not invent. Use paths from the snapshot as [[path]] when citing.
- If evidence is thin, still output the structure with "Uncertain" or "Need more evidence" where appropriate.
- Return only the JSON object.