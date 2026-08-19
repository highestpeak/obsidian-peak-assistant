# Peak Setup Assistant

## Product contract

Peak Setup is an explicit maintenance surface, not startup chrome.

- Opening Obsidian or enabling Peak must never open Setup automatically.
- The user opens Setup through the `Setup Wizard` command, Settings, or another explicit Peak action.
- Closing Setup preserves progress. Opening it again resumes an unfinished run.
- A completed setup may be opened again to review or repair the current configuration.
- Setup must not create a second index run when a usable index or active run already exists.

## Information architecture

The five required steps remain:

1. Connect AI
2. Core models
3. Prepare vault
4. System check
5. Try Peak

The step navigation shows only the complete step names and state. It does not repeat explanatory summaries, use connector lines, or truncate labels. Each screen explains its current decision in the body.

## Visual direction

Setup should feel like a compact Obsidian settings assistant:

- restrained modal width and a readable single content column;
- one quiet header, one compact step rail, one stable footer;
- 14–15 px body copy and 13 px minimum supporting copy;
- grouped rows with dividers instead of a separate bordered card for every item;
- borders only around meaningful groups; no decorative shadows or colored icon tiles;
- full-width, obvious actions for important branches such as adding another connection;
- explanations stay near the setting they affect and do not compete with the primary action.

## State and interaction rules

- An existing connection remains selectable, testable, and editable after verification.
- Opening “Connect another service” always offers a visible route back to saved connections.
- Any ready connection satisfies the first-step gate; a failed secondary connection must not block continuing.
- Model pickers show only models compatible with the role. Peak Hermes requires tool support.
- Better SQLite is repaired as a hard prerequisite.
- Full-text readiness reuses an existing index or attaches to one active run before creating a new run.
- System checks expose checking, ready, background, warning, and failed states honestly.
- The final step opens a real Peak surface rather than accepting a synthetic prompt inside Setup.

## Acceptance

- No production startup path imports or opens `HarnessOnboardingModal`.
- The command registration still opens the singleton modal.
- All five progress labels are readable without ellipsis at the supported modal width.
- Primary actions keep at least a 42 px hit target under Obsidian button resets.
- Focused onboarding tests and the production build pass.
- Real Obsidian interaction remains a separate acceptance gate when CDP is unavailable.
