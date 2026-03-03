Classify this question. Output only valid JSON matching the schema.

User question:
{{userQuery}}

{{#vaultDescription}}
Vault capability (what this knowledge base contains; use to decide which dimensions are likely answerable):
{{vaultDescription}}
{{/vaultDescription}}

{{#functionalTagsMapping}}
Functional tags (for the system: “what role in answering”). Semantic dimension → tags below. Use these as main recall for scope_constraint.tags on semantic dimensions; topic tags (“what it’s about”) are optional recall booster. Prefer tags from this list—others may not exist in the vault:
{{functionalTagsMapping}}
{{/functionalTagsMapping}}

{{#vaultSkeleton}}
Vault context (optional):
{{vaultSkeleton}}
{{/vaultSkeleton}}
