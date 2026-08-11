# Unified Settings and Onboarding Mock

Design-only HTML mocks for Peak Assistant's launch preparation. These files do not change production plugin code.

## Open directly

- `settings.html` — long-term configuration and system status
- `onboarding.html` — minimum setup followed by a real first-task handoff

Both files are self-contained local HTML artifacts and should be opened directly. They do not require a temporary localhost server.

## Shared product model

The two mocks use the same nouns and responsibility boundaries:

- **Connections** answer which services and local runtimes Peak can use.
- **Models by feature** answers which model a recognizable product surface actually uses.
- **Peak Hermes** owns Agent workflow, permissions and receipts; Codex, Claude Code and model connections supply compatible execution capability.
- **Knowledge settings** own long-term scope and quality. The Knowledge Index workspace owns a current run's progress, errors and history.
- **Onboarding** verifies only the dependencies needed for one first task. It does not duplicate full Settings.

## Settings direction

- Obsidian's own Settings sidebar stays visible. Peak does not add a competing second sidebar.
- Peak categories live in a compact header tab row, with search, save state and setup status kept nearby.
- No global `Standard / Advanced` mode. Low-frequency controls expand inside the section they affect; diagnostics remain a distinct destination.
- The default page is `Models by feature`, demonstrating the hierarchy `product feature → action group → concrete action`.
- Product actions that do not use a generative model say so explicitly.
- Connections, task defaults, readiness, privacy and maintenance keep separate owners.
- Provider and capability status uses clear states rather than assuming that saved credentials imply readiness.

## Onboarding direction

1. Choose one first outcome.
2. Verify one connection that can complete it.
3. Reuse and check the existing Vault / Index state.
4. Open the real product workspace with a safe editable starter task.

The flow distinguishes `Setup complete` from `First success`, saves progress, keeps the primary action visible, and provides direct next destinations instead of ending on an empty success page.

## Mocked interactions

### Settings

- Header tab navigation inside the native Obsidian Settings context
- Search across feature, Provider and system concepts
- Expandable model hierarchy
- Add-connection modal
- Segmented index depth and contextual advanced disclosure
- Save/effect feedback for controls

### Onboarding

- Goal selection with task-specific dependency explanation
- Progressive disclosure of connection choices
- Provider selection and verification state
- Existing index reuse and accelerated status refresh
- Back/continue with preserved choices
- Final first-task launchpad

## Truth boundary

This is a target design. Current or partially implemented capabilities must still be verified against production source before implementation. In particular, Codex and Claude Code ordinary-generation and Agent capabilities require separate verification; OpenRouter and Ollama model lists must use fresh runtime/catalog evidence; Knowledge Index readiness must not be inferred from a static preference.
