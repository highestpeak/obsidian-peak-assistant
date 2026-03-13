Collapse the following logical dimensions into the minimum number of physical search tasks. Output only valid JSON matching the schema.

**User question:** {{userQuery}}

**Dimensions (id, intent_description, scope_constraint):**
{{dimensionsJson}}

Return a single JSON object with key `physical_tasks`. Each element: unified_intent (synthesized search instruction merging the intent_description of covered dimensions—imperative sentence, not keyword list), covered_dimension_ids (array of dimension ids), search_priority (integer ≥ 0), scope_constraint (object with path, tags, anchor_entity, or null).
