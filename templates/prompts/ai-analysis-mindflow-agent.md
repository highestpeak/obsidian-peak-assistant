# MIND FLOW ROUND ({{phase}})

## USER QUERY (subject of the thinking tree — do not ask for it)
{{{userQuery}}}

{{#if webSearchEnabled}}
## Web search
**Enabled.** You may instruct RawSearch to use web search when the query clearly needs external or live information (e.g. current events, market data). Otherwise keep search vault-only.
{{else}}
## Web search
**Disabled.** Restrict all instruction to vault-only tools. Do not add any web-search step or intent.
{{/if}}

{{#if vault_map}}
## Vault map (terrain — use for directory/keyword targets)
- **Structure (2–3 levels):**  
{{{vault_map.structure}}}
- **Top tags:** {{vault_map.topTags}}
- **Capabilities:** {{vault_map.capabilities}}
{{#if vault_map.description}}
- **User description:** {{{vault_map.description}}}
{{/if}}
{{/if}}

{{#if coverageSummary}}
## Coverage (verified paths & facts — low = high risk)
- **Verified paths:** {{coverageSummary.verifiedPathsCount}}
- **Facts:** {{coverageSummary.factCount}}
{{#if coverageSummary.samplePaths.length}}
- **Sample paths:** {{#each coverageSummary.samplePaths}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
{{/if}}

{{#if knowledge_panel}}
## Knowledge Panel (current structured evidence — use for audit and decision)
{{{knowledge_panel}}}
{{/if}}

{{#if confirmedFacts}}
## Inventory — Confirmed
{{#each confirmedFacts}}
- {{this}}
{{/each}}
{{/if}}

{{#if previousMindflowMermaid}}
## Previous thinking diagram (evolve incrementally)
\`\`\`mermaid
{{{previousMindflowMermaid}}}
\`\`\`
{{/if}}

{{#if rollingMindflowHistory}}
## Rolling MindFlow history (status + confirmed from previous rounds)
{{#each rollingMindflowHistory}}
- {{this}}
{{/each}}
{{/if}}

{{#if latestRawSearchInfo}}
## Latest RawSearch runs (last 2)
{{#each latestRawSearchInfo}}
- {{{latestLoopDelta}}}
{{/each}}
{{/if}}

{{#if lastAttemptErrorMessages}}
## Last attempt errors (attempt {{attemptTimes}})
{{{lastAttemptErrorMessages}}}
{{/if}}

---

## DIRECTIVE
{{#if (eq phase "pre-thought")}}
**Pre-thought.** (1) From the user query, derive **all** dimensions that apply using the **Dimension Library** (use only those relevant; often 5–8). (2) In **\`submit_mindflow_mermaid\`**, show **every** derived dimension as a node with state (e.g. "DimensionName – missing" or "– partial") plus at least one fallback branch. (3) In **\`submit_mindflow_progress\`**, set **gaps** to **all** missing/partial dimensions by name (same names as in the Mermaid). (4) Choose **one** dimension for this round. (5) Set **instruction** using the **Tactical Library**: instruction **must** start with one of the **ten** tactics — \`[HUB_RECON]\`, \`[BRIDGE_FINDING]\`, \`[INVENTORY_SCAN]\`, \`[SEED_EXPANSION]\`, \`[PULSE_DETECTION]\`, \`[CONFLICT_DIVE]\`, \`[GHOST_HUNTING]\`, \`[REASONING_RECOVERY]\`, \`[EDGE_CASE_PROBING]\`, \`[OMNISCIENT_RECON]\` — and specify the corresponding params; then MapSketch + ReconSequence + Deliverable. Use the Decision Framework to choose (diffuse/global query → OMNISCIENT_RECON first; full list or evaluate-all-in-zone → INVENTORY_SCAN first for full path list, then HUB_RECON/SEED_EXPANSION as needed; current state → PULSE_DETECTION; relationship/contrast → BRIDGE_FINDING; last round ZERO_RESULTS → GHOST_HUNTING; CONFLICT present → CONFLICT_DIVE; have seed → SEED_EXPANSION; what I thought before / why dropped → REASONING_RECOVERY; inspiration / non-mainstream → EDGE_CASE_PROBING; other → HUB_RECON). Do not write natural language only. Call \`submit_mindflow_trace\` → \`submit_mindflow_mermaid\` → \`submit_mindflow_progress\`. **Order**: (1) directory sniff when relevant, (2) cross-lingual concept when relevant, (3) deep search last.
{{else}}
**Post-thought.** Update coverage from RawSearch outcome and Knowledge Panel. Call the three tools in order. **Coverage**: Tag confirmed_facts and gaps by dimension. For **every** \`CONTINUE_SEARCH\`, set **instruction** with the **Tactical Library**: must start with one of the ten tactics (including \`[PULSE_DETECTION]\`, \`[CONFLICT_DIVE]\`, \`[GHOST_HUNTING]\`, \`[REASONING_RECOVERY]\`, \`[EDGE_CASE_PROBING]\`, \`[OMNISCIENT_RECON]\`) and specify params; then MapSketch + ReconSequence. If the last RawSearch round returned \`[SEARCH_COMPLETED: ZERO_RESULTS]\`, prefer **[GHOST_HUNTING]**. Use **Latest RawSearch runs** (discovered_leads, paths tried) and **gaps** to refine. Do not give a generic dimension-only or natural-language-only instruction. If evidence is from only one path/region and a dimension is still missing, pick a tactic that covers another zone (e.g. HUB_RECON with Zone B). If panel has conflicts, use \`CONTINUE_SEARCH\` with adjudication and a clear tactic. If fact count high and panel missing/stale, use \`REQUEST_COMPRESSION\`. When coverage is sufficient for Summary or timebox/saturation, use \`FINAL_ANSWER\` and, if applicable, add **REFLECTIVE_INDEXING** Suggested Links in critique.
{{/if}}

Proceed.
