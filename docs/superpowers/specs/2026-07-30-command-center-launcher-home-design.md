# Peak Command Center Launcher + Home Design

Date: 2026-07-30

Status: Decided · design/spec ready · implementation pending

Owner intent: Important product integration surface

Visual prototype: [`docs/gstack/command-center-launcher-home-2026-07-30/index.html`](../../gstack/command-center-launcher-home-2026-07-30/index.html)

Research: [`docs/research/2026-07-30-command-center-launcher-home/README.md`](../../research/2026-07-30-command-center-launcher-home/README.md)

## 1. Decision

Build Peak Command Center as a curated launcher that coexists with Obsidian's native Command Palette.

One versioned board configuration drives two shells:

- **Command Center Modal** for quick, keyboard-first invocation.
- **Home View** for a pinned navigation page with commands and Vault destinations.

This design does not replace `Cmd/Ctrl + P`, intercept Obsidian hooks, or remove third-party commands. The native Palette remains the exhaustive fallback. Command Center is the user's deliberately small, spatially stable subset.

## 2. Scope correction

The repository already uses “Command Center” for an AI capability planner. That product is not the requested launcher.

| Existing concept | Current fact | Decision |
| --- | --- | --- |
| `CopilotCommandCenterModal` | Collects a goal, drafts an AI plan, then executes Command Gateway steps | Rename or retire when this feature is implemented |
| May 2026 Copilot Command Center specs | Focus on Document / Vault / Setting intent hubs and review surfaces | Remain historical Copilot background |
| July 27, 2026 ecosystem research | Proposes a curated Peak launcher + HomePage | Becomes the direct predecessor of this spec |
| Native Command Palette | Exhaustive fuzzy list across Obsidian and plugins | Keep unchanged |

This spec supersedes the user-facing launcher and Home boundaries in the older Command Center documents. It does not supersede current Composer Intelligence or Copilot review designs.

## 3. Problem

The native Command Palette has to expose every registered command. With many plugins installed, a user sees:

- unrelated command families in one list;
- many long, nearly identical variants from one plugin;
- fuzzy matches that are technically valid but operationally surprising;
- shortcuts as small trailing metadata instead of a stable navigation model.

The user does not need a better global ranking algorithm for daily work. They need a small set of destinations with stable positions, grouped by their own mental model.

## 4. Goals

### G1 · Spatial retrieval

Frequently used actions stay in a predictable two-dimensional location when search is empty.

### G2 · User curation

The user can create, name, icon, reorder and hide groups without editing JSON.

### G3 · Honest command execution

Each action keeps its real command ID, current availability and current user-configured hotkey.

### G4 · Product integration

Peak surface entry points use Command Gateway ownership. External plugin commands remain adapters, not new Peak capabilities.

### G5 · Home continuity

The same board can open as a full-tab Home View with pinned files, Bookmarks, Workspaces and selected Vault content.

### G6 · Native coexistence

The exhaustive native Command Palette stays one keystroke away.

## 5. Non-goals

- Replacing or modifying Obsidian's Command Palette.
- Hiding third-party commands from Obsidian.
- Rebuilding fuzzy search across the full command catalog.
- Building a general dashboard marketplace.
- Adding arbitrary JavaScript, shell scripts or unsandboxed HTML tiles.
- Creating another tasks, calendar, statistics or note database.
- Making AI decide the user's launcher layout.
- Auto-assigning hotkeys.
- Reusing the old AI planner modal as this product surface.

## 6. Product model

### 6.1 One board, two shells

```text
CommandCenterBoardConfig
├─ Modal shell
│  ├─ curated groups
│  ├─ filtered search state
│  └─ manage mode
└─ Home shell
   ├─ continue working
   ├─ pinned destinations
   ├─ embedded Vault content
   └─ curated command groups
```

The Modal and Home must not maintain separate copies of commands. Reordering a group updates both surfaces.

### 6.2 Action types

First implementation supports bounded, non-script action types:

```ts
// Illustrative design contract; not implementation.
type CommandCenterAction =
	| {
			kind: 'peak-command';
			commandId: string;
	  }
	| {
			kind: 'obsidian-command';
			commandId: string;
			pluginId?: string;
	  }
	| {
			kind: 'vault-target';
			path: string;
			subpath?: string;
	  }
	| {
			kind: 'bookmark';
			bookmarkId: string;
	  }
	| {
			kind: 'workspace';
			workspaceName: string;
	  }
	| {
			kind: 'view';
			viewType: string;
	  };
```

URL, macro and script actions are intentionally deferred. They widen permissions and error handling without helping the core navigation problem.

### 6.3 Configuration ownership

```ts
// Illustrative design contract; not implementation.
interface CommandCenterBoardConfig {
	version: 1;
	modal: {
		columnCount: 2 | 3;
		showContext: boolean;
	};
	home: {
		openOnStartup: boolean;
		replaceEmptyTab: boolean;
	};
	groups: CommandCenterGroup[];
	homeBlocks: HomeBlock[];
}

interface CommandCenterGroup {
	id: string;
	label: string;
	icon: string;
	order: number;
	actions: CommandCenterActionItem[];
}
```

Default group definitions belong in `templates/config/command-center-defaults.json` and load through TemplateManager. User layout belongs in plugin settings data. The default template must not overwrite user changes after initialization.

## 7. Information architecture

### 7.1 Command Center Modal

The modal has four persistent regions:

1. Title and current context.
2. Search field.
3. Curated group board.
4. Footer help with Manage and native Palette escape.

At the recommended desktop size, groups form a two-column board. Each group contains a compact grid of action tiles. The group is the primary visual unit; tiles do not float in one undifferentiated gallery.

### 7.2 Search state

Runtime search filters only configured actions.

Rules:

1. Match short label first.
2. Match user aliases second.
3. Match group and plugin label third.
4. Preserve group headings in results.
5. Do not include unconfigured commands.
6. Offer `Open native Command Palette` as an explicit fallback.

The full registered-command catalog appears only inside Manage → Add action. This is the main protection against the original “weird fuzzy matches” problem.

### 7.3 Home View

Home is a navigation page, not an analytics dashboard.

Default blocks:

- **Continue working**: recently active Vault files, with source path and last-opened time.
- **Pinned destinations**: files, headings, Bookmarks, Workspaces and product views.
- **Vault content**: a selected Note, Base or Canvas rendered through the owning Obsidian view.
- **Command groups**: the same groups used by the Modal, at a more relaxed density.

Tasks are shown only when the user pins a task-bearing Note or Base. Peak does not create a parallel task store.

### 7.4 Manage mode

Manage mode is explicit. Normal invocation never shows drag handles or edit controls.

Available operations:

- add / rename / delete group;
- choose group icon;
- add action from a searchable catalog;
- edit short label and aliases;
- reorder groups and actions;
- show / hide action in Modal or Home;
- remove unavailable action;
- reset only the selected group to its default.

Destructive layout reset requires confirmation and export/import support before a global reset ships.

## 8. Screen inventory

| Screen / state | Primary job | Reads | Writes | Main actions | Empty / failure state | Entry / exit |
| --- | --- | --- | --- | --- | --- | --- |
| Modal · board | Invoke a curated action without typing | Board config, context, availability, hotkeys | Recent usage only | Arrow navigation, Enter, search, open Home | Starter groups or “add first group” | Hotkey / command; closes to previous focus |
| Modal · search | Narrow configured actions | Curated action index | Query only | Type, move by arrow, Enter, clear | No curated result + native Palette fallback | Search field; returns to board on clear |
| Home View | Return to important work and destinations | Board config, recents, bookmarks, selected Vault content | Block layout and destination state | Open destination, run command, manage | Guide to pin first destination | Ribbon / command / empty tab; exits to destination |
| Manage | Curate board content | Full command catalog, plugins, hotkeys, current config | Groups, labels, aliases, order, visibility | Add, drag, edit, remove, export | Compatibility warning if catalog unavailable | Manage button; Done returns to same shell |

## 9. Visual design

### 9.1 Modal geometry

- Width: `min(980px, calc(100vw - 48px))`.
- Height: content-led up to `min(720px, calc(100vh - 72px))`.
- Group board: two columns above 780px; one column below.
- Action tile: minimum `120 × 68px`.
- Fixed icon hit target: `36 × 36px`.
- Radius: 8–10px; no pill-card wall.
- Accent: Obsidian / Peak purple only for focus, selection and primary entry.

### 9.2 Action tile anatomy

Every tile has:

1. Lucide icon.
2. Short user-facing label.
3. Optional real hotkey.
4. Availability state.
5. Tooltip with full command name and source plugin.

Long native command labels such as “Create new drawing — in the current active window” become a short tile title such as `Current window`; the tooltip preserves the full source label.

### 9.3 Icon policy

Use Lucide React, not AI-generated bitmap icons.

- Peak actions reuse existing mappings.
- Generic action semantics use Lucide.
- Plugin groups use a user-selected Lucide icon.
- Actions inherit the group icon when no clear action icon exists.
- A two-character monogram is the final fallback.
- Color is secondary; shape and label carry meaning.

AI-generated icons are excluded because they are inconsistent at small sizes, hard to theme and difficult to keep semantically stable across versions.

## 10. Keyboard and focus contract

### Global entry

Peak registers one stable command: `Open Peak Command Center`.

The project does not assign a default hotkey. The user sets it in Obsidian Settings → Hotkeys, matching Obsidian's conflict-avoidance model.

### Inside the Modal

- `/` or normal typing focuses search.
- `Esc` clears query first, then closes the modal.
- `Tab` moves between structural controls.
- Arrow keys move spatially between tiles.
- `Enter` invokes the focused tile.
- `Cmd/Ctrl + P` may close Command Center and open the native Palette.
- Closing restores the prior active element and editor selection.

### Hotkey display

The tile shows only a hotkey that the runtime can resolve from current Obsidian settings. It never displays a stale copied value from Peak config.

## 11. Runtime and architecture boundaries

### App-owned composition

The runtime is composed in the app layer:

```text
main.ts / AppContext
└─ CommandCenterRuntime
   ├─ CommandCenterBoardRepository
   ├─ ObsidianCommandCatalogPort
   ├─ CommandGateway
   ├─ VaultNavigationPort
   ├─ Bookmark / Workspace adapters
   └─ availability + hotkey snapshot
```

No service-layer module singleton is allowed.

### Peak command path

Peak actions dispatch through the existing Command Gateway bindings. The board references command IDs; it does not duplicate callbacks or import surface internals.

### External command path

Third-party commands use one app-owned compatibility adapter.

Requirements:

- no monkey patching;
- no interception of the native Palette;
- snapshot registered commands when the Modal or Manage screen opens;
- execute by exact command ID;
- re-check availability immediately before execution;
- fail closed when the command disappeared;
- record only local invocation metadata, not command arguments or Vault content.

Because Obsidian's public typings do not expose the full command catalog, this adapter is a documented compatibility boundary. A failed private API check must degrade to Peak actions and explicit plugin adapters.

## 12. Context behavior

Context helps ordering but must not make the board unstable.

Allowed:

- show current file and active view in the header;
- mark a command unavailable when its context check fails;
- optionally place up to three context suggestions in a dedicated `Suggested now` strip.

Not allowed:

- reordering every group based on AI;
- silently hiding user-pinned actions;
- sending current file content to an AI model just to open the launcher;
- turning the default board into a recommendation feed.

The user's spatial memory wins over dynamic optimization.

## 13. Home behavior

### Startup and empty tab

Both behaviors are opt-in and off by default:

- Open Home on startup.
- Replace an empty new tab with Home.

Opening Home must not close existing tabs or load a Workspace unless the user explicitly invokes a Workspace tile.

### Embedded content

Home can host content only through existing owners:

- Markdown note through Obsidian render / editor modes;
- Base through its native view;
- Canvas through its native view;
- product view through a registered view type.

Home does not copy content into its own database.

## 14. Defaults

The default first-run board is intentionally small.

### Peak Assistant

- Composer
- Chat Studio
- File Atlas
- Quick Search
- Usage Dashboard
- Settings

Setup Wizard appears only while setup is incomplete. It does not occupy permanent first-run space after completion.

### Navigation

- Home
- Current file
- Daily note
- Bookmarks

The user may add third-party groups such as Excalidraw or QuickAdd during Manage mode. Peak does not assume those plugins are installed.

## 15. Alternatives

### Replace native `Cmd/Ctrl + P`

Rejected. It breaks the exhaustive discovery path, creates compatibility risk and conflicts with Obsidian muscle memory.

### Improve fuzzy ranking only

Rejected as the primary solution. Better ranking cannot give a stable two-dimensional location to frequent actions.

### Build only a full Home dashboard

Rejected. It does not solve the in-context invocation problem and duplicates mature community plugins.

### Build only a modal

Rejected. It misses pinned documents, Workspaces and the user's request for a comfortable navigation home.

### Depend on Hearth or Buttons Panel

Rejected as the product core. They are strong general tools, but they cannot own Peak Command Gateway truth, Peak availability or a single Peak configuration across Modal and Home. Their mature widget patterns remain a scope warning: Peak should not recreate their entire surface area.

## 16. Implementation order

This is an implementation sequence, not permission to ship incomplete UI as the final feature.

### Track A · Runtime and config

- app-owned runtime;
- versioned config;
- Peak default group;
- availability and hotkey snapshots;
- external command compatibility spike.

### Track B · Modal

- React modal shell;
- two-dimensional groups;
- search over configured actions;
- full keyboard and focus restoration;
- native Palette escape.

### Track C · Manage

- group and action editor;
- full catalog picker;
- drag reorder;
- invalid command handling;
- export/import.

### Track D · Home

- ItemView shell;
- continue working;
- pinned destinations;
- embedded Vault content;
- same command groups.

### Track E · Migration and cleanup

- rename the old AI planner to `Capability Planner` if it still has an approved use;
- otherwise delete its entryless modal, service and prompt path in a separately reviewed cleanup;
- keep the Command Palette allowlist convention synchronized with the actual owner-approved set;
- remove outdated docs that call the launcher an AI planner.

## 17. Validation

### Automated

- Config migration and round-trip tests.
- Exact Peak default manifest test.
- Search excludes unconfigured commands.
- Missing command IDs fail closed.
- Hotkey resolver never persists stale display strings.
- Modal/Home render the same group order.
- Keyboard grid navigation tests.
- Focus restoration test.
- Boundary test prevents UI or service code from reading private `app.commands` directly.
- Build and existing command gateway tests.

### Real Obsidian

Use the canonical CDP protocol.

1. Open from a user-bound hotkey.
2. Verify board geometry and computed hit targets.
3. Navigate the 2D grid in all four directions.
4. Search a curated Excalidraw group.
5. Execute a Peak command and a third-party command.
6. Disable the third-party plugin and verify the unavailable state.
7. Close with Escape and verify active element and editor selection restoration.
8. Open Home in a new tab and return without workspace loss.
9. Record a short clip for focus, keyboard and manage drag behavior.

If CDP is unavailable, mark these interactions `INTERACTION NOT VERIFIED`; a static prototype and green build are not acceptance.

## 18. Acceptance criteria

- Native `Cmd/Ctrl + P` behavior is unchanged.
- The user can bind one shortcut to open Peak Command Center.
- Empty query shows grouped tiles in a two-dimensional layout.
- Runtime search returns only configured actions and keeps group provenance.
- Every visible shortcut matches current Obsidian hotkey configuration.
- A user can create an Excalidraw group and add a command without editing files.
- A missing plugin does not crash or silently remap an action.
- Home and Modal use one source of truth for groups.
- Home can pin a Vault file, Bookmark and Workspace.
- Home does not introduce a parallel tasks or calendar store.
- The legacy AI planner is not presented as this launcher.

## 19. Risks and stop rules

| Risk | Impact | Control |
| --- | --- | --- |
| Private command catalog API changes | Third-party picker breaks | Central adapter, startup capability check, Peak-only fallback |
| Board grows into another infinite catalog | Original problem returns | Runtime search only configured actions; group size guidance |
| Home becomes a widget marketplace | Product scope fragments | First-party blocks limited to navigation and existing Vault content |
| Dynamic suggestions destroy spatial memory | Daily use becomes unpredictable | Suggestions isolated; pinned positions never auto-move |
| Hotkey labels drift | User loses trust | Resolve live; never persist display string |
| Old and new Command Center concepts coexist | Naming and ownership confusion | Rename/retire old planner during implementation |

Stop implementation and return for owner review if:

- arbitrary command discovery cannot be isolated behind one compatibility port;
- Home requires copying Note/Base/Workspace state into a second data model;
- the first usable board needs more than four default groups;
- implementation proposes intercepting or rewriting native Command Palette behavior.
