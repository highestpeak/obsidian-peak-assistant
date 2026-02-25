/**
 * User prompt for review blocks. Variables: ReviewBlocksVariables & ErrorRetryInfo & toolFormatGuidance.
 */
export const template = `# OBSERVATION
- **Analysis context**: {{{agentMemoryMessage}}}

{{#if errorRetryInfo.attemptTimes}}
# RETRY (attempt {{errorRetryInfo.attemptTimes}})
Last error: {{{errorRetryInfo.lastAttemptErrorMessages}}}. Fix and try again.
{{/if}}

# CURRENT BLOCKS (snapshot)
<<<
{{{currentBlocksSnapshot}}}
>>>

# DIRECTIVE
1. Identify duplicates or near-duplicates and remove them (use remove with removeId = that block's id).
2. Merge blocks that share the same theme; remove the redundant block by removeId.
3. Drop low-value or empty blocks (remove by removeId).
4. Ensure final block count is between 4 and 8 (target 6–8).
5. Output only the necessary add_dashboard_blocks operations (remove and/or add). Use block id from the snapshot for every removeId.

{{#if toolFormatGuidance}}
# add_dashboard_blocks FORMAT
{{{toolFormatGuidance}}}
{{/if}}

Execute the review now.`;

export const expectsJson = false;
