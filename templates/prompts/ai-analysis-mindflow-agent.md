# MIND FLOW ROUND ({{phase}})

## USER QUERY (subject of the thinking tree — do not ask for it)
{{{userQuery}}}

## OBSERVATION
- **Agent memory** (recent guidence and real progress; use for context):
<<<
{{#each agentMemoryMessage}}
---
{{{this}}}
{{/each}}
>>>
{{#if previousMindflowMermaid}}
- **Previous thinking diagram** (evolve this incrementally; do not replace with a completely new structure):
\`\`\`mermaid
{{{previousMindflowMermaid}}}
\`\`\`
{{/if}}
{{#if lastAttemptErrorMessages}}
- **Last attempt errors** (attempt {{attemptTimes}}): {{{lastAttemptErrorMessages}}}
{{/if}}

## DIRECTIVE
- Remember: the flowchart nodes must describe **the user's question and its exploration** (sub-questions, concepts, evidence). Never use tool names or "how to use tools" as node labels.
{{#if (eq phase "pre-thought")}}
**PRE-THOUGHT PHASE**: Plan the next exploration step before ThoughtAgent acts.
1. Analyze what has been explored so far and identify gaps.
2. Update the Mermaid flowchart via \`submit_mindflow_mermaid\` to highlight the current thinking state and proposed exploration paths (about the user query and evidence, not about tools).
3. Call \`submit_mindflow_trace\` to describe what ThoughtAgent should focus on next.
4. Call \`submit_mindflow_progress\` with:
   - estimatedCompleteness (0-100)
   - statusLabel (e.g. "Identifying next clue", "Planning exploration", "Preparing to verify")
   - goalAlignment (sub-questions + current progress on each)
   - critique (what's missing, what could go wrong)
   - decision: always "continue" in pre-thought
{{else}}
**POST-THOUGHT PHASE**: Reflect on ThoughtAgent's actions and decide whether to continue.
1. Evaluate what ThoughtAgent just discovered or concluded (about the user query and evidence).
2. Update the Mermaid flowchart via \`submit_mindflow_mermaid\` to mark verified findings, prune dead ends, and update the main path. Keep nodes about the search content, not tools.
3. Call \`submit_mindflow_trace\` to summarize the outcome of this iteration.
4. Call \`submit_mindflow_progress\` with:
   - estimatedCompleteness (0-100)
   - statusLabel (e.g. "Cross-checking evidence", "Converging main path", "Ready to conclude")
   - goalAlignment (sub-questions + whether each has a verified path)
   - critique (mandatory self-correction: what went wrong, what to fix)
   - decision: "continue" if more exploration needed, "stop" if answer is ready
{{/if}}

## MERMAID RULES (CRITICAL - MUST FOLLOW)
- First line MUST be: \`flowchart TD\`
- Node format: \`N1["label"]:::state\` where state is EXACTLY: thinking, exploring, verified, or pruned
- Node IDs: alphanumeric only (N1, N2, A, B)
- Line breaks in labels: use \`<br>\` NOT \`\\n\`
- Edge format: \`A -->|"label"| B\` or \`A --> B\`
- Main path edges: use \`main:\` prefix in label
- FORBIDDEN: subgraphs, & merge, click, style, classDef, \\n

## DIAGRAM EVOLUTION (IMPORTANT)
- Prefer **incremental updates**: when a previous diagram exists, refine it (add a few nodes, change state, prune) rather than outputting a totally new layout.
- Avoid **sudden large structural changes**: do not add many new nodes in one step; do not explode one concept into a long flat list of nodes.
- When the answer or evidence spans many items, **do not create one node per item**. Prefer a small number of summary or group nodes (e.g. one node "Key findings (N items)" or "Evidence cluster" with a short label) so the diagram stays readable and stable.

Proceed.