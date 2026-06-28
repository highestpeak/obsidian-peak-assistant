# T11E-R Owner Note — ProfileRegistry Test Alignment

Date: 2026-06-25  
Commit reviewed: `dd6750b0` — `test(profiles): T11E-R align preset model defaults to claude-sonnet-4-6`

## Verdict

Accepted.

This was not a deletion wave. It was a small review-fix commit that cleared the two stale `profile-registry` assertions left after T11E. The codebase is green again, so the next task can return to code retirement.

## What Changed

Only one file changed:

- `test/profile-registry.test.ts`

The stale expected defaults were updated from:

- `claude-opus-4-6`
- `anthropic/claude-opus-4-6`

to the current source-of-truth defaults:

- `claude-sonnet-4-6`
- `anthropic/claude-sonnet-4-6`

No production profile catalog, template, setting, SDK path, or preset file was changed.

## Verification

Codex reran:

```bash
npm run test -- test/profile-registry.test.ts
npm run build
npm run audit:boundary
rg -n "vaultSearch\.sdkProfile|service/agents/vault-sdk/sdkProfile|DEFAULT_SDK_PROFILE|readProfileFromSettings" src test main.ts
```

Results:

- `profile-registry`: 30 passed, 0 failed.
- Build: passed.
- Boundary audit: still 358 flagged edges.
- Old sdkProfile path: no hits.

## Owner Reading Note

Do not expect deletion from this commit. `dd6750b0` is only `+2/-2` in a test file.

The next wave should be deletion-first. A fresh reachability scan shows that only four source files are clearly unreachable from `main.ts`; bigger reduction now requires product-level retirement of live but low-value surfaces.

