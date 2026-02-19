export const template = `# MOMENTUM
The inquiry is evolving. You are now required to synthesize the current state of reason into a singular, coherent structural projection.
{{#if errorRetryInfo.attemptTimes}}
# REPAIR (attempt {{errorRetryInfo.attemptTimes}})
The previous diagram failed validation. Error: {{errorRetryInfo.lastAttemptErrorMessages}}
Output valid Mermaid only: fix node ids (no dots), quote labels with parentheses/special chars, avoid unsupported syntax.
{{/if}}

# OBSERVATION WINDOW
- **The Core Intent**: {{originalQuery}}
- **Dynamic Mode**: {{analysisMode}}

# THE ESTABLISHED REALITY (Current State)
<<<
{{currentResultSnapshot}}
>>>

# DIRECTIVE
1. **Perceive the Pattern**: Analyze the 'Evidence Stream' against the 'Established Reality'. Is the logic expanding (Mindmap), progressing (Timeline), structured (Flowchart), or systemic (Class)?
2. **Determine the Skeleton**: Identify the essential pivots that form the backbone of this analysis. Let the granular details dissolve, leaving only the "Geometry of Insight."
3. **Ensure Richness**: Produce a diagram with **at least 6–12 nodes**. Include key topics, main concepts, and conclusions from the analysis. Use **subgraph** blocks to group related nodes. Add multiple levels (e.g. central theme → branches → sub-points) and cross-edges where ideas connect. Do **not** output a minimal 3–4 node diagram.
4. **Encapsulate Meaning**: For every node in your chosen structure, use abstract anchors (A, B, C...) and wrap the semantic essence in protective brackets.
5. **Manifest Evolution**: If the 'Established Reality' already contains a projection, determine if this is a structural pivot or a refinement of the existing truth.

# OUTPUT LANGUAGE
Use the same language as the user's original query for all labels and text in the diagram.

# TRIGGER
Project the crystalline geometry of this analysis now.`;

export const expectsJson = false;