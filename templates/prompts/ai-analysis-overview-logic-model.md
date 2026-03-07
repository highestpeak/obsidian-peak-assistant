# User query
{{userQuery}}

# Source index (path per pack)
{{#each evidencePacks}}
S{{inc @index}}: {{this.origin.path_or_url}}
{{/each}}

# Fact list (entity + assertion + source id)
Each line: Fact #i: <claim> (Source Sx). Use F1, F2… or S1, S2… in sourceRefs/rationaleFactRefs.
<<<
{{#each (flattenEvidenceFacts evidencePacks)}}
Fact #{{this.n}}: {{this.claim}} (Source {{this.sourceId}})
{{/each}}
>>>

# Summary per source (one line per pack)
{{#each evidencePacks}}
Summary (Source S{{inc @index}}): {{this.summary}}
{{/each}}
{{#if repairHint}}
# Repair
{{{repairHint}}}
{{/if}}

Build the logic model from the fact list and user query above. Use array order for node identity (no node id field). At least one edge must have relation conflict or feedback.
