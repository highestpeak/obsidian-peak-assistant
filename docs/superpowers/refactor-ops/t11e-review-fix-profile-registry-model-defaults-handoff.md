# Peak Assistant Modernization Handoff: T11E-R ProfileRegistry Model Defaults

Use this as the next Claude Code implementation prompt.

T11E was accepted, but `test/profile-registry.test.ts` still has two stale model-name assertions. Fix this before starting the next architecture wave so the canonical ProfileRegistry path is green after old `vault-sdk/sdkProfile.ts` was deleted.

## 1. Problem

Codex reran:

```bash
npm run test -- test/profile-registry.test.ts
```

Result:

```text
28 passed, 2 failed

actual:   claude-sonnet-4-6
expected: claude-opus-4-6

actual:   anthropic/claude-sonnet-4-6
expected: anthropic/claude-opus-4-6
```

Evidence:

- `src/core/profiles/presets.ts` currently defaults Anthropic to `claude-sonnet-4-6`.
- `src/core/profiles/presets.ts` currently defaults OpenRouter to `anthropic/claude-sonnet-4-6`.
- `templates/config/models/claude.json` and `templates/config/curator-catalog.json` include/currently use `claude-sonnet-4-6`.
- T11E deleted the old `src/service/agents/vault-sdk/sdkProfile.ts` path, so `core/profiles/*` is now the canonical SDK profile path.

## 2. Required Fix

Update `test/profile-registry.test.ts` so the preset default assertions match current code:

- Anthropic preset expected `primaryModel`: `claude-sonnet-4-6`.
- OpenRouter preset expected `primaryModel`: `anthropic/claude-sonnet-4-6`.

Do not change `src/core/profiles/presets.ts` back to Opus unless you find stronger current product evidence. The current code and catalog point to Sonnet.

## 3. Scope

Allowed:

- `test/profile-registry.test.ts`
- a tiny comment update if needed

Not allowed:

- Do not resurrect `src/service/agents/vault-sdk/sdkProfile.ts`.
- Do not re-add `vaultSearch.sdkProfile`.
- Do not touch `src/core/profiles/materialize.ts` unless the test reveals a real behavior bug.
- Do not change provider/model catalog files unless evidence says the code default is wrong.

## 4. Verification

Run:

```bash
npm run test -- test/profile-registry.test.ts
npm run build
```

Optional sanity:

```bash
rg -n "vaultSearch\\.sdkProfile|service/agents/vault-sdk/sdkProfile|DEFAULT_SDK_PROFILE|readProfileFromSettings" src test main.ts
```

Expected:

- `profile-registry.test.ts` passes 30/30.
- build passes.
- old sdkProfile rg remains empty.

## 5. Implementation Note

Return:

- commit hash;
- exact test assertion changes;
- verification results;
- confirmation that old sdkProfile did not return.

