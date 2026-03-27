# HubDoc pipeline

## Settings

- `ai.rootFolder`: only configurable folder; Hub path is derived as `{rootFolder}/Hub-Summaries` (default `ChatFolder/Hub-Summaries`).
- **User-authored hubs**: put markdown notes in `{hubSummaryFolder}/Manual/` (see `getAIManualHubFolder()` in `src/app/settings/types.ts`). Each `.md` file is a first-class manual hub candidate: the plugin **does not overwrite** these bodies during hub maintenance; it only indexes them and uses them in discovery / graph assembly.
- **Auto-generated hubs**: maintenance still materializes `Hub-{hash}.md` under `{hubSummaryFolder}/` (not inside `Manual/`).
- Optional YAML on manual hubs (read-only hints): `hub_role`, `hub_source_paths` — see `MANUAL_HUB_FRONTMATTER_KEYS` in `src/core/constant.ts`; parsed during manual hub candidate discovery in `src/service/search/index/helper/hub/hubDiscover.ts`.
- Index tenant: paths under `Hub-Summaries` use the **vault** SQLite index even when nested under `ai.rootFolder`. Indexed notes there get `mobius_node.type = hub_doc`.

## Commands

- **Generate / refresh Hub summaries**: discovers candidates, writes or updates auto `Hub-*.md` stubs (with LLM fill when configured), re-indexes auto hubs, and **re-indexes** `Manual/*.md` without changing their file contents.

## Migration

- If you used the old `Hub-Manual.md` manifest, move those targets into real notes under `Hub-Summaries/Manual/` (or add `hub_source_paths` on a manual hub for extra coverage hints).
- If Hub files were previously indexed under the chat tenant, run **Index Search** (full or incremental) after updating settings so paths are re-evaluated with `getIndexTenantForPath`.
