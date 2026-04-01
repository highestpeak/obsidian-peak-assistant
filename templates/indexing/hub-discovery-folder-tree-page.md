## Folder tree (compact)

**Columns (after `name/`):** `docs` = indexed documents in folder; `out` = doc link out-degree; `in` = doc link in-degree; `sub` = direct child folder count (after exclusions); `maxD` = max absolute depth in this folder’s subtree; `avgD` = mean absolute depth over all folders in that subtree; `ftok` / `stok` = top token stems from file basenames / direct child folder names (frequency-ranked). Optional tail: `kw` / `topic` from tag aggregates.

**Paths:** Vault-relative paths are not repeated on every line. The list is **depth-first**: infer each folder’s path by walking from the vault root following indent levels (each segment is the display name + `/`).

{{#each folderRows}}
{{indent depthMinusOne}}{{{displayName}}}/ {{docCount}} {{docOutgoing}} {{docIncoming}} {{childFolderCount}} {{subtreeMaxDepth}} {{subtreeAvgDepthDisplay}} | ftok: {{fileTokenSampleCompact}} | stok: {{subfolderTokenSampleCompact}}{{#if topKeywords.length}} | kw: {{join (take topKeywords 6) ", "}}{{/if}}{{#if topTopics.length}} | topic: {{join (take topTopics 4) ", "}}{{/if}}
{{/each}}
