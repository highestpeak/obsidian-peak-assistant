# Plugin Command Gateway complete flow mock

Status: design/mock only; production implementation remains isolated in
`codex/plugin-command-gateway-20260731` and has not been forward-ported into the
owner checkout.

Open [`index.html`](./index.html) to inspect the interactive six-screen flow:

1. scan enabled third-party plugin commands;
2. request optional AI curation without granting authorization;
3. review and explicitly allow or block exact commands;
4. request an approved command from existing Chat/Copilot surfaces;
5. pass the existing Harness permission gate for edit-risk commands;
6. inspect observable effects, RunEnvelope state, and the JSONL audit receipt.

The mock deliberately separates Command Gateway from Command Center. It uses
example plugins and paths only and never invokes Obsidian or changes a Vault.

Run `node validate.mjs` from this directory for the static screen, navigation,
scope-marker, unique-ID, and inline-script contract.

Implementation source of truth:

- `docs/superpowers/specs/2026-07-31-obsidian-plugin-command-gateway-implementation-design.md`
- `docs/superpowers/plans/2026-07-31-obsidian-plugin-command-gateway-implementation-plan.md`

Verification boundary:

- static interactive artifact only;
- no real Obsidian/CDP execution proof;
- no claim that the isolated branch is compatible with the 2026-08-02 owner
  checkout until generated-output governance and current Copilot surfaces are
  re-audited.
