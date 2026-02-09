/**
 * Mermaid overview diagram prompt for AI analysis.
 * Output is normalized by normalizeMermaidForDisplay (handles fence, sanitization).
 */
export const template = `You are an expert at choosing and creating Mermaid diagrams to summarize knowledge and relationships.

## Analysis context
Original query: {{originalQuery}}

Summary: {{summary}}

{{#if topicsText}}
Topics: {{topicsText}}
{{/if}}

{{#if graphSummary}}
Knowledge graph (summary): {{graphSummary}}
{{/if}}

{{#if sourcesSummary}}
Sources (sample): {{sourcesSummary}}
{{/if}}

{{#if blocksSummary}}
Dashboard blocks (summary): {{blocksSummary}}
{{/if}}

## Task
Choose the diagram type that best fits the content (flowchart, sequenceDiagram, classDiagram, mindmap, timeline, etc.) and output valid Mermaid syntax for that type.

## CRITICAL: Node IDs and Labels
**Always use short alphanumeric node codes (A, B, C, D, E, …) as identifiers, and put display text inside brackets.**
- Format: \`NodeID[Display label text]\` — the label can contain commas, parentheses, Chinese, etc.; the bracket protects it from parse errors.
- Do NOT write raw text as node content (e.g. \`  路径: 熟悉技术栈 (Vue, 低代码)\`). Use \`A[路径: 熟悉技术栈 (Vue, 低代码)]\` instead.

## Valid syntax by type

**Flowchart**: \`flowchart TD\` then \`A[label] --> B[label]\`. Use codes: \`A[text]\`, \`B[text]\`, \`A --> B\`.

**Sequence diagram**: \`sequenceDiagram\` then \`participant A\` or \`actor A\`, arrows: \`A->>B: message\`. No colons in participant names.

**Class diagram**: \`classDiagram\` then \`class A { ... }\`, \`A --> B\`.

**Mindmap**: \`mindmap\` then \`root((Root))\`, children as \`A[Label]\`, \`B[Label]\`. Example:
\`\`\`
mindmap
  root((Topic))
    A[First branch]
    B[Second branch]
      C[Child with comma, parens]
\`\`\`

Rules:
- Use only standard Mermaid syntax for the chosen type. No invented constructs.
- Node IDs MUST be short codes (A, B, C, D…). Display text goes in brackets: \`A[Your label here]\`.
- FORBIDDEN: raw text nodes without bracket-wrapped labels; \`A from B,C,D\`; prose after \`-\` on the same line; double quotes inside node labels.
- If analysis is thin, output a minimal valid diagram (e.g. \`flowchart TD\\n    A[Summary]\`).`;

export const expectsJson = false;
