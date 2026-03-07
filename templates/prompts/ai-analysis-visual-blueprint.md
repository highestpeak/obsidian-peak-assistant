# USER'S ORIGINAL QUERY
{{originalQuery}}

# OVERVIEW MERMAID (already generated; for reference)
{{#if overviewMermaid}}
<<<
{{{overviewMermaid}}}
>>>
{{else}}
(Not yet generated.)
{{/if}}

# CONFIRMED FACTS (lightweight sample; evidence type hints only)
{{#if (nonEmpty confirmedFacts)}}
Total confirmed facts: {{confirmedFacts.length}}. Showing up to 5 representative items:
<<<
{{#each (take confirmedFacts 5)}}
- {{{this}}}
{{/each}}
>>>
{{/if}}

# TASK
Produce a **visual prescription** for each report block (body + appendices; skip summary). For each block:
1. Decide data type, task type, audience precision.
2. Set needVisual and, if true, primary (and optional secondary) with diagramType, reason, dataMapping, mermaidDirectiveCard.
3. Call `submit_prescription_and_get_next` with blockId, title, prescription (or prescriptionMarkdown), and status "final" when done with that block.

Process blocks in tool-returned order. Continue until the tool returns done: true.

{{#if firstBlockId}}
Start with this block: {{firstBlockId}}
{{firstBlockRequirements}}
{{/if}}
