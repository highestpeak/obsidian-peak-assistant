{{#if dimensionId}}
Dimension: {{dimensionId}}
{{/if}}
{{#if intent_description}}
Intent (what to look for): {{{intent_description}}}
{{/if}}
{{#if unified_intent}}
Unified intent (what to look for): {{{unified_intent}}}
{{/if}}
{{#if coveredDimensionIds}}
Covered dimensions (this task feeds): {{coveredDimensionIds}}
{{/if}}
{{#if inventoryRequiresManifest}}
This task requires **full coverage** (manifest). If a tool returns "N of M" with M > N, call again with limit >= M. Submit every relevant path via the path-submit step; do not call request_submit_report until the list is complete or you document why not.
{{/if}}

User question: {{userQuery}}

Vault context:
{{#if vaultDescription}}Description: {{vaultDescription}}

{{/if}}{{#if vaultStructure}}Structure:
{{vaultStructure}}

{{/if}}Top tags: {{vaultTopTags}}
Capabilities: {{vaultCapabilities}}

{{#if scopePath}}
Scope path (prefer this area): {{scopePath}}
{{/if}}
{{#if scopeAnchor}}
Anchor entity: {{scopeAnchor}}
{{/if}}
{{#if scopeTags}}
Scope tags (filter/navigate by): {{scopeTags}}
{{/if}}

State your search plan in 1–2 short sentences, then call tools. After each round the system will ask you to submit paths from the tool results. When coverage is complete or you have used your rounds, call request_submit_report once.
