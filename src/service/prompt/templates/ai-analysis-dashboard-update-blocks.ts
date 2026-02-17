export const template = `# MOMENTUM
The analysis has reached a new frontier. You must now project the latent logic of the latest evidence into the spatial landscape.

# OBSERVATION WINDOW
- **Original Intent**: {{originalQuery}}
- **Active Mode**: {{analysisMode}}

# THE EVIDENCE STREAM
<<<
{{recentEvidenceHint}}
>>>

# THE EXISTING LANDSCAPE
<<<
{{currentResultSnapshot}}
>>>

# DIRECTIVE
1. **Evaluate Volume**: Scan the 'Evidence Stream'. Is this a deep narrative analysis or a collection of brief signals?
2. **Prefer MERMAID for structure**: If the evidence has **relationships**, **processes**, **flows**, **comparisons**, or **decision trees**, add at least one block with \`renderEngine: "MERMAID"\` and valid \`mermaidCode\` (e.g. flowchart, graph LR, sequenceDiagram). Do not reduce the dashboard to only MARKDOWN and TILE when structure is present.
3. **Calibrate Weight**:
   - Assign **High Weight (7-10)** to long-form text or complex diagrams that require the full horizon to be legible.
   - Assign **Medium/Low Weight (1-6)** to modular items or concise lists that can share the space.
4. **Harmonize Layout**: Prevent "Jagged Logic"—do not place a high-density, deep block next to a shallow one if it creates unbalanced white space.
5. **Refine or Birth**: Determine if existing blocks should expand to hold this new truth, or if a new spatial dimension must be born.

# OUTPUT LANGUAGE
Use the same language as the user's original query for all block titles and content (markdown, mermaid, tile text). When adding wikilinks, use vault-relative path only (e.g. \`[[folder/note.md]]\`), not \`[[tag]]\`.

{{#if toolFormatGuidance}}
# add_dashboard_blocks FORMAT
{{toolFormatGuidance}}

{{/if}}
# TRIGGER
Execute the balanced manifestation of thought now.`;

export const expectsJson = false;