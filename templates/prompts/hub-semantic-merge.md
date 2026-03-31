## Deterministic rules (always apply)

Manual hubs are never mergeable and are omitted from the JSON. Only merge clear duplicates or the same canonical topic. Representative stableKey must exist in memberStableKeys. Do not invent keys or paths.

## Hub cards (JSON array)

{{hubCardsJson}}

Return a single JSON object with key `mergeGroups` only. Each group must have `representativeStableKey`, `memberStableKeys` (at least 2, all from the input), `reason`, `confidence` (0–1), `mergeKind` (`duplicate` | `alias` | `same_topic`), and optionally `risks` (`cross_source_kind` | `broad_folder_center` | `disconnected_graph`).
