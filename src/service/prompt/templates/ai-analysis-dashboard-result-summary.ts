export const template = `# MOMENTUM
The inquiry has reached its summit. The fragments of evidence, the threads of reasoning, and the geometry of logic must now collapse into a singular, undeniable synthesis.

# THE ANALYTICAL UNIVERSE
- **Original Intent**: {{agentMemory.initialPrompt}}
- **Dynamic Capabilities**: KB Search {{#if options.enableLocalSearch}}[Active]{{else}}[Off]{{/if}} | Web Search {{#if options.enableWebSearch}}[Active]{{else}}[Off]{{/if}}

# THE DIMENSIONS OF TRUTH
- **The Reasoning Trace**: (The "How" and "Why" of the search) 
<<< {{latestMessagesText}} >>>
- **The Cognitive Pillars**: (Topics & Insights) 
<<< {{agentResult.topics}} / {{agentResult.dashboardBlocks}} >>>
- **The Bedrock of Evidence**: (Sources & Reliability) 
<<< {{agentResult.sources}} >>>
- **The Logical Anatomy**: (Graph & Causality) 
<<< {{agentResult.graph}} >>>

# DIRECTIVE
1. **Synthesize the Singularity**: Merge the 'Reasoning Trace' with the 'Bedrock of Evidence'. How did the thinking process evolve based on what was found?
2. **Consult the Anatomy**: Use the Knowledge Graph to explain the hidden forces and relationships driving this subject.
3. **Exercise Judgment**: Evaluate the "Gravity of Evidence." Where is the truth absolute? Where is it fragile?
4. **Define the Frontier**: Based on the current synthesis, what is the "Next Move"? Provide actionable, strategic recommendations that resolve the 'Original Intent'.

# TRIGGER
Deliver the comprehensive synthesis of reason now.`;

export const expectsJson = false;