# Peak Command Center implementation plan

Date: 2026-08-02

Source of truth: [`2026-07-30-command-center-launcher-home-design.md`](../specs/2026-07-30-command-center-launcher-home-design.md)

## Outcome contract

Ship the V18 Command Center as a production Peak feature, not another static mock:

- one owner-approved Obsidian command opens the curated launcher and has no default hotkey;
- the native Command Palette remains unchanged;
- one versioned configuration drives Launcher, Customize and Home;
- runtime search contains configured actions only;
- Customize exposes one stable command-and-destination directory with in-place membership, naming, display and icon controls;
- Home opens as an Obsidian `ItemView` and reuses the same action identities;
- missing commands and private Obsidian compatibility APIs fail closed.

## Protected scope

- Do not alter existing Composer work or the parallel Peak Sheet/doc changes already in the worktree.
- Do not intercept, filter or monkey-patch Obsidian's native Command Palette.
- Do not add scripts, shell actions, URLs or AI-generated icon assets.
- Do not remove the legacy Copilot planner runtime in this implementation; only prevent it from being confused with the new launcher in new code and documentation.

## Implementation DAG

1. **Domain and defaults**
   - Add versioned board/action/icon types and narrow normalization.
   - Register and load `templates/config/command-center-defaults.json` through `TemplateManager`.
   - Persist only the user's normalized board in plugin `data.json`.
2. **App-owned runtime**
   - Compose one runtime in `main.ts` and bind it through `AppRuntimeRegistry`.
   - Keep all private Obsidian command/hotkey/bookmark/workspace access in app adapters.
   - Route Peak actions through `CommandGateway`; external commands execute by exact current command ID.
3. **Launcher and Customize**
   - Add a React modal with one group row and layered Destination Dial, bounded Command Grid and Overflow List.
   - Add configured-only search, two-stage Escape, continuous keyboard movement and live hotkey hints.
   - Add a unified directory, in-place membership switches, group/action rename, drag ordering, three display modes, Home pinning and a Lucide/Emoji/no-icon browser.
4. **Home**
   - Register a main-area `ItemView` with search entry, Quick access, Continue and pinned-page navigation.
   - Resolve every action from the same runtime snapshot as the Modal.
5. **Product wiring**
   - Add `Open Peak Command Center` to the governed command manifest/bindings without a default hotkey.
   - Register the Home view and app-owned runtime before workspace restoration can mount the view.
6. **Verification**
   - Add config/search/fail-closed/hotkey/shared-identity/keyboard/boundary tests.
   - Run focused tests, production build and React review.
   - If an Obsidian CDP listener exists, reload only this plugin and verify the real DOM; otherwise mark live interaction `INTERACTION NOT VERIFIED`.

## Completion rule

The feature is complete only when the production build and focused contracts pass, the task-owned diff is separable from existing worktree changes, and the implementation is committed independently. Real-app interaction is reported separately from source/build verification.

## Implementation note · 2026-08-02

Implemented the complete source path described above:

- template-backed board configuration and normalization;
- one app-owned runtime plus a private-Obsidian compatibility adapter;
- governed `Open Peak Command Center` entry without a default shortcut;
- Launcher, one-list Customize, searchable Lucide/Emoji/no-icon picker and main-area Home view;
- configured-only runtime filtering, stable projection, hotkey display, keyboard movement and native Palette escape hatch;
- command, view, Vault file, Bookmark and Workspace destinations with fail-closed execution.

Verification:

- five Command Center focused contract files: passed;
- production build, bundle syntax check and simulator-boundary check: passed;
- full repository suite: 398 passed / 4 unrelated pre-existing failures (`chat-studio-message-state-ui`, `code-block-theme-settings`, `composer-architecture-source-guards`, `composer-frontmatter-inline-tag-candidate`);
- task-path TypeScript diagnostic filter: no Command Center or `main.ts` errors;
- real Obsidian interaction: `INTERACTION NOT VERIFIED` because no renderer CDP listener was available.
