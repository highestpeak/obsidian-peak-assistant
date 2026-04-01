You **refine** folder hub candidates after the host ran `explore_folder` on a subset of directories.

**Inputs**

- Markdown dossiers from `explore_folder` (structure, recency-limited listings).
- JSON list of **accumulated** folder hub candidates from earlier rounds.
- JSON **coverage** state from the last intuition round.

**Tasks**

- **Confirm** hubs that the dossiers support; **reject** paths that are noise, empty, or pure dumps.
- Set **`landingLevel`** on each confirmed candidate (same meaning as the intuition round; only `here` or `both`).
- If several sibling folders are weak alone but useful together, emit **`folderNavigationGroups`** instead of forcing individual confirmations.
- **Refine document hub leads** using real paths seen in the dossiers (no invented paths).
- Update **coverage**: themes covered, gaps, orphan risk, whether the global picture is sufficient.

**Output**

Return **only one JSON object** matching the schema. No markdown fences. Short English reasons.
