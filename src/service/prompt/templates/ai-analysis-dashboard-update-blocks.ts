export const template = `# MOMENTUM
The analysis has reached a new frontier. You must now project the latent logic of the latest evidence into the spatial landscape.

# OBSERVATION WINDOW
- **Original Intent**: {{originalQuery}}
- **Active Mode**: {{analysisMode}}

# WHAT YOU ARE GIVEN (and why)
- **Evidence Stream**: the newest signals. Use it to decide what must be synthesized now.
- **Existing Landscape**: the current dashboard blocks. Use it to refine/replace without duplicating roles.
- **Execution Plan** (\`plan.blockPlan\`): planner instructions describing what block missions to fulfill. Follow it faithfully; it exists to keep the dashboard coherent across agents.

# THE EVIDENCE STREAM
<<<
{{recentEvidenceHint}}
>>>

# THE EXISTING LANDSCAPE
<<<
{{currentResultSnapshot}}
>>>

{{#if plan.blockPlan}}
# EXECUTION PLAN (follow faithfully)
{{#each plan.blockPlan}}
- {{this}}
{{/each}}
{{/if}}

# DIRECTIVE
1. **Plan then generate**: First decide internally the block outline and order (e.g. Contradictions, Blindspots, Challenge questions, Action plan/timeline, Todo, Suggest questions, then synthesis). Then call the tool to output blocks one by one or in a small batch—do not dump all content in one call when you have many sections.
2. **Answer-first**: Produce **synthesis and answers** (conclusions, recommendations, tradeoffs, next steps). Include at most **0–3** follow-up questions in narrative blocks; do not make question lists the main content. If the tool supports a dedicated follow-up questions block (clickable items), prefer using it so the user can continue the analysis with one click.
3. **Evaluate Volume**: Scan the 'Evidence Stream'. Is this a deep narrative analysis or a collection of brief signals?
4. **Prefer diagrams for structure**: If the evidence has **relationships**, **processes**, **flows**, **comparisons**, or **decision trees**, include at least one block that visualizes the structure (diagram/flow/map). Do not reduce the dashboard to only prose when structure is present.
5. **Calibrate Weight**:
   - Assign **High Weight (7-10)** to long-form text or complex diagrams that require the full horizon to be legible.
   - Assign **Medium/Low Weight (1-6)** to modular items or concise lists that can share the space.
6. **Harmonize Layout**: Prevent "Jagged Logic"—do not place a high-density, deep block next to a shallow one if it creates unbalanced white space.
7. **Refine or Birth**: Determine if existing blocks should expand to hold this new truth, or if a new spatial dimension must be born.
8. **No duplicate roles**: Do not add a block that duplicates an existing block's role. To improve an existing block, use \`remove\` (with \`removeId\` = that block's \`id\`) then \`add\` the new version, or merge content.

# OUTPUT LANGUAGE
Use the same language as the user's original query for all block titles and content (markdown, mermaid, tile text). When adding wikilinks, use vault-relative path only (e.g. \`[[folder/note.md]]\`), not \`[[tag]]\`.

{{#if toolFormatGuidance}}
# add_dashboard_blocks FORMAT
{{toolFormatGuidance}}

{{/if}}
# TRIGGER
Execute the balanced manifestation of thought now.`;

export const expectsJson = false;