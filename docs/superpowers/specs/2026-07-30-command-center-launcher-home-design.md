# Peak Command Center Launcher + Home Design

Date: 2026-07-30

Visual direction revised: 2026-08-02 · V19 destination links + command grid + overflow list

Status: Implemented in source · production build verified · real-Obsidian interaction pending

Owner intent: Important product integration surface

Visual prototype: [`docs/gstack/command-center-launcher-home-2026-07-30/index.html`](../../gstack/command-center-launcher-home-2026-07-30/index.html)

Research: [`docs/research/2026-07-30-command-center-launcher-home/README.md`](../../research/2026-07-30-command-center-launcher-home/README.md)

Implementation record: 2026-08-02. The production launcher, unified Customize directory, shared Home `ItemView`, template-backed configuration, app-owned runtime, governed command entry and focused contract tests are present. No Obsidian CDP listener was available during the implementation session, so keyboard, focus restoration, drag and visible real-app geometry remain `INTERACTION NOT VERIFIED` rather than being inferred from the static harness.

## 1. Decision

Build Peak Command Center as a curated launcher that coexists with Obsidian's native Command Palette.

One versioned collection configuration drives two focused shells:

- **Command Center Modal** for quick, keyboard-first invocation.
- **Home View** for a quiet navigation page with pinned actions and recent Vault destinations.

This design does not replace `Cmd/Ctrl + P`, intercept Obsidian hooks, or remove third-party commands. The native Palette remains the exhaustive fallback. Command Center is the user's deliberately small, grouped and order-stable subset.

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

### G1 · Stable scoped navigation

Frequently used commands and destinations stay in predictable scope tabs and grid positions when search is empty.

### G2 · User curation

The user can create, name, icon, reorder and hide groups without editing JSON.

### G3 · Honest command execution

Each action keeps its real command ID, current availability and current user-configured hotkey.

### G4 · Product integration

Peak surface entry points use Command Gateway ownership. External plugin commands remain adapters, not new Peak capabilities.

### G5 · Destination continuity

The Modal and full-tab Home View share the same bounded destination types: commands, product views, Vault files, Bookmarks and Workspaces. Home does not reproduce the Modal's exact layout.

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

### 6.1 One collection, two presentations

```text
CommandCenterBoardConfig
├─ Modal shell
│  ├─ group scope tabs
│  ├─ destination Link Matrix
│  ├─ bounded command Grid
│  ├─ command Overflow List
│  └─ explicit customize mode
└─ Home shell
   ├─ global search entry
   ├─ quick access
   ├─ continue working
   └─ pinned pages
```

The Modal and Home must not maintain separate copies of actions. They share action identity, label, icon, hotkey resolution and destination. Their composition differs:

- Modal optimizes for switching user-owned groups, searching and navigating one bounded layered projection.
- Home optimizes for returning to a small set of pinned destinations.
- Group order in the Modal does not force Home to reproduce every group.

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
		density: 'compact';
	};
	home: {
		openOnStartup: boolean;
		replaceEmptyTab: boolean;
		quickAccessActionIds: string[];
		pinnedTargetIds: string[];
	};
	groups: CommandCenterGroup[];
}

interface CommandCenterGroup {
	id: string;
	label: string;
	icon?: string;
	actionLayout: 'layered' | 'rows';
	order: number;
	actions: CommandCenterActionItem[];
}

type CommandCenterItemIcon =
	| { kind: 'lucide'; name: string }
	| { kind: 'emoji'; value: string };

interface CommandCenterActionItem {
	id: string;
	action: CommandCenterAction;
	shortLabel: string;
	icon?: CommandCenterItemIcon;
	display: 'icon-label' | 'icon-only' | 'text-only';
	pinnedToHome: boolean;
	order: number;
}
```

Default group definitions belong in `templates/config/command-center-defaults.json` and load through TemplateManager. User layout belongs in plugin settings data. The default template must not overwrite user changes after initialization.

## 7. Information architecture

### 7.1 Command Center Modal

The modal has three persistent regions:

1. Search field and close button.
2. One group-scope row followed by one layered launcher projection.
3. Footer keyboard help and current-scope feedback.

The scope row projects user-defined groups as compact named tabs. `All` follows a quiet divider at the end. Customize lives in the footer and does not compete with group selection. Only one scope is expanded at a time, so group count does not create a long page.

There is no second type-navigation row. `AI`, `Create`, `Navigate` and `Visual` duplicate information already carried by the user group, semantic icon and label, and make the modal read like a taxonomy browser.

The projection is not command-only. It separates two recognition tasks without adding a second navigation taxonomy:

1. **Destination Link Matrix** — Home, Dashboard, Base, Canvas, Vault document, Bookmark, Workspace and registered views use compact link rows. The matrix uses up to three columns, adapts to two or one at narrow widths, and keeps approximately three visible rows before internal scrolling. Destinations no longer repeat the visual weight of the command tiles.
2. **Command Grid** — executable Peak, Obsidian and plugin commands use a compact icon-and-label grid. The default layered presentation uses five columns and never grows beyond two rows.
3. **Overflow List** — commands beyond the two-row Grid keep their configured order and continue in one dense list with icon, short name, full source label and current hotkey.

New items append inside their own layer. The system never reorders the stable destination links or the first two command rows. The Overflow List is a pressure-release layer, not the primary runtime shape and not a return to an all-command palette.

There is no permanent side rail, accordion stack, nested group card or vertically repeated group chrome.

The header does not show:

- product description;
- current file;
- capability availability summary;
- Home or edit shortcuts.

Home is an ordinary configured destination. Customize is reached from the footer action and remains a distinct editing state.

### 7.2 Search state

Runtime search filters only configured actions.

Rules:

1. Match short label first.
2. Match user aliases second.
3. Match group and plugin label third.
4. Keep group scope tabs available while filtering.
5. Show matches in the same Link Matrix / Command Grid / Overflow hierarchy; search does not switch to a different result language.
6. Do not include unconfigured commands.

The full registered-command catalog and addressable destination picker appear only inside Customize. A Vault file, Bookmark, Workspace or owner-registered view can also expose `Pin to Command Center` on its own surface. Runtime search never expands into the full command catalog; this is the main protection against the original “weird fuzzy matches” problem.

### 7.3 Home View

Home is a navigation page, not an analytics dashboard.

The default layout is fixed and deliberately sparse:

- **Search**: one centered launcher entry.
- **Quick access**: a short horizontal block of pinned actions and destinations.
- **Continue**: recent Vault files with source path and last-opened time.
- **Pinned pages**: optional, owner-rendered previews in one vertical reading path.

Pinned Notes, Bases and Canvases remain owned by their existing Obsidian views. Home can show bounded previews, but it does not create a freeform widget canvas or duplicate their state.

### 7.4 Manage mode

Customize mode is explicit. Normal invocation never shows drag handles or edit controls. Customize reuses the familiar Command Palette retrieval model instead of introducing a second card canvas:

- the header provides Back, a clear `Customize` title and Done;
- the first content row selects the group being edited and ends with a small `New group` action;
- search stays directly above the continuous directory rather than occupying the runtime-launcher header;
- the selected group's icon and name are edited directly in one compact identity row;
- every registered command and saved destination stays in one continuous directory; there are no `Added` and `Available` sections;
- every item row keeps its full label, source, applicable hotkey and one trailing membership switch;
- toggling membership changes only the switch state and keeps that command at the same directory index;
- active commands can be dragged against any row to change the group's spatial order explicitly;
- clicking an added row expands only that row's display mode and `Pin to Home` controls.

There is no group card wall, repeated `Add action` button, floating selection toolbar or permanent second inspector. Switching groups changes the membership projection inside the same stable directory surface.

Available operations:

- add / rename group;
- choose group icon;
- add / remove action with the scoped membership switch;
- add the current Vault document, Bookmark, Workspace, Base, Canvas or registered view as a destination;
- edit short label and aliases;
- reorder groups and actions;
- choose `icon + label`, `icon only` or `text only` for each action;
- pin / unpin action in Home Quick access;
- remove unavailable action.

The full command-and-destination directory appears only in Customize. It is the primary content of that state, not a temporary popover and not a permanent second column beside a group editor. Runtime Launcher and Search still filter only configured items.

Destructive layout reset requires confirmation and export/import support before a global reset ships.

## 8. Screen inventory

| Screen / state | Primary job | Reads | Writes | Main actions | Empty / failure state | Entry / exit |
| --- | --- | --- | --- | --- | --- | --- |
| Modal · launcher | Open a curated command or destination without typing | Groups, launcher items, availability, hotkeys | Recent usage only | Switch group scope, spatial navigation, Enter, search | Starter grid or “add first item” | Hotkey / command; closes to prior focus |
| Modal · search | Narrow configured commands and destinations | Curated launcher-item index | Query only | Type, retain group scope, grid navigation, Enter, clear | Empty result with clear-query guidance | Search field; returns to launcher on clear |
| Home View | Return to important work and destinations | Pinned actions, recents, bookmarks, Workspaces, pinned pages | Quick access and pin order | Search, open destination, customize | Guide to pin the first destination or page | Ribbon / command / empty tab; exits to destination |
| Customize | Curate one group's membership and order | Current config, registered command catalog and addressable destinations | Group icon/name, membership, stable directory order, display mode, Home pins | Select group, search one continuous item directory, switch membership in place, drag active rows, expand row settings, Done | Empty search result or compatibility warning in the directory | Footer action; Done returns to launcher |

## 9. Visual design

### 9.1 Modal geometry

- Width: `min(640px, calc(100vw - 48px))`.
- Height: approximately `448px`, capped by `calc(100vh - 72px)`.
- Overlay: a light neutral wash, not a dark modal scrim.
- One navigation row only: named user-owned group scopes, one quiet divider and `All`. Customize is a footer action. A group may use a trusted product mark or a user-selected system icon beside its short label. Arbitrary group colors are not an identity system.
- Destination Link Matrix: up to three columns, responsive to two or one, approximately `32px` per row and about three visible rows. Each item is a quiet inline link with a small icon, label and trailing link cue; there is no resting card fill.
- Command Grid: five columns in compact density, approximately `62px` high, limited to two rows. A row-style alternative may use three columns when command-name readability is more important than density.
- Overflow List: one `32px` row per remaining command after the stable first two Grid rows.
- Search, action title and filter label form an intentional compact type scale. Destination Links and Grid cells do not show a second provenance line; the Overflow List may show the full source label.
- Source marks render at approximately `16px`. Peak Assistant uses its trusted product mark; Workspaces and Visual use neutral semantic system icons, while Quick create demonstrates the no-icon text fallback.
- The content canvas starts immediately after the group tabs; no `All commands`, group heading or item-count row is repeated. Layers are communicated through geometry and spacing, not headings.
- Modal radius: approximately `12px`; action radius: approximately `6px`.
- Header, tabs and content share one `14–16px` left axis.
- Accent: only a trusted source mark or selected control may carry restrained accent color. Action icons stay neutral; segmented fills carry navigation state.

No group sidebar, vertical group stack, outlined card wall, gradient, availability strip, descriptive hero or dashboard statistic appears in the Modal.

### 9.2 Action tile anatomy

Every item has an action identity, accessible name and tooltip. Destination Links and Command Grid use `icon + label` consistently at first run; Overflow List adds the full source label and current hotkey. The visible anatomy remains user-selectable:

1. `icon + label`: semantic action icon, short label and an optional real hotkey;
2. `icon only`: icon with `aria-label` and tooltip, aligned within the current layer;
3. `text only`: short label without an icon, aligned within the current layer.

All three modes preserve the geometry of the item's current layer. The presentation choice changes visible content, not row rhythm or spatial position. Icon-only and text-only remain explicit customization choices rather than mixed first-run defaults. Destination Links and the Command Grid stay borderless at rest and use one restrained hover / keyboard-selection treatment. Unavailable actions keep their position and use a disabled treatment.

Long native command labels such as “Create new drawing — in the current active window” become a short tile title such as `Current window`; the tooltip preserves the full source label.

### 9.3 Icon policy

Separate source identity from action semantics, and never use AI-generated bitmap icons.

- Source identity belongs to the top scope row and is not stamped repeatedly into every action.
- Peak Assistant reuses its dedicated Peak mark in the scope row.
- A third-party plugin uses its trusted product mark only when that asset actually exists.
- A source without a trusted mark uses a user-selected system icon or a short text label; the prototype does not invent substitute brand marks.
- Every command or destination item owns its presentation icon independently from the group icon and underlying command registration.
- The default may come from the product or Lucide, but the user can override each active item through one searchable Icon Browser.
- The browser has two explicit sources: searchable Lucide names and a curated Unicode Emoji set. Switching source does not change the item label, target or hotkey.
- Emoji values are stored as Unicode text, limited to one visible grapheme sequence and rendered through the system emoji font. Peak does not upload or generate emoji artwork.
- `No icon` remains available. If an icon-only item clears its icon, it safely falls back to text-only instead of becoming an invisible cell.
- Color is reserved for trusted product identity. Shape, label and position carry the command semantics.

AI-generated icons are excluded because they are inconsistent at small sizes, hard to theme and difficult to keep semantically stable across versions.

### 9.4 Motion

- The selected group uses one restrained segmented fill. If an underline variant is evaluated, it must use one shared moving indicator rather than independent underline flashes; it is not the V19 default.
- The newly active scope panel enters with `opacity` and at most `5px` of vertical travel over approximately `180ms`.
- Query typing must not replay a full-page transition on every keystroke.
- Motion never changes layout ownership or action order and must be disabled by `prefers-reduced-motion`.

### 9.5 Customize item directory

- Geometry and typography should recall Obsidian's native Command Palette: one search field, compact continuous rows and trailing hotkeys or state controls.
- Customize may grow to approximately `560px` high so the full directory has a useful scan window; Launcher and runtime Search remain approximately `448px`.
- The directory uses neutral hover fills and separators rather than outlined command cards.
- Group selection stays above the directory. Renaming and icon choice are direct edits, not a settings form.
- The command-and-destination directory is one continuous, stable list. It never splits into `Added` and `Available` regions.
- Membership uses one binary switch scoped to the active group. It must announce `aria-checked` and an add/remove accessible label.
- Toggling membership keeps the row at the same directory index and preserves the current scroll position. A row moves only after an explicit drag.
- Active rows remain draggable inside the unified directory. Their order defines the group's Launcher order; inactive rows are stable drop anchors rather than a second section.
- Advanced action presentation is progressive disclosure: only an explicitly selected added row exposes its Icon Browser entry, display mode and Home Pin.

## 10. Keyboard and focus contract

### Global entry

Peak registers one stable command: `Open Peak Command Center`.

The project does not assign a default hotkey. The user sets it in Obsidian Settings → Hotkeys, matching Obsidian's conflict-avoidance model.

### Inside the Modal

- `/` or normal typing focuses search.
- `Esc` clears query first, then closes the modal.
- `Tab` / `Shift+Tab` cycles group scopes, including `All`.
- Left and Right move through the flattened item order and cross layer boundaries continuously.
- Up and Down use the current layer's column count; when crossing a layer boundary they preserve the nearest horizontal position.
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

Context can affect whether an action is invokable, but it does not occupy permanent launcher chrome.

Allowed:

- mark a command unavailable when its context check fails;
- explain the unavailable reason in a tooltip;
- use the exact current file only after the user invokes an action that needs it.

Not allowed:

- show current file or “capability available” summaries above the grid;
- reordering every group based on AI;
- silently hiding user-pinned actions;
- sending current file content to an AI model just to open the launcher;
- turning the default board into a recommendation feed.

The user's group order wins over dynamic optimization.

## 13. Home behavior

### Startup and empty tab

Both behaviors are opt-in and off by default:

- Open Home on startup.
- Replace an empty new tab with Home.

Opening Home must not close existing tabs or load a Workspace unless the user explicitly invokes a Workspace tile.

### Destination ownership

Quick access and Continue can point to:

- Markdown notes and subpaths;
- Bases and Canvases;
- Bookmarks and Workspaces;
- registered product views.

Home navigates to destinations and lets existing owners render bounded previews for pinned pages. It does not become a generic widget canvas or copy destination content into its own database.

## 14. Defaults

The default first-run board is intentionally small.

### Pinned

- Home;
- Usage Dashboard;
- Bookmarks collection and one user-selected Bookmark;
- one user-selected dashboard, Base or Canvas;
- up to two user-pinned Vault documents.

The Pinned group is not a second Home page. It is a compact set of direct destinations inside the same modal grid. Pinning stores stable target identity and presentation metadata; it does not copy document or dashboard content.

### Peak Assistant

- Composer
- Chat Studio
- File Atlas
- Quick Search
- Settings

Setup Wizard appears only while setup is incomplete. It does not occupy permanent first-run space after completion.

### Navigation

- Daily note
- one user-selected Workspace

The user may add third-party groups such as Excalidraw or QuickAdd during Manage mode. Peak does not assume those plugins are installed.

## 15. Alternatives

### Replace native `Cmd/Ctrl + P`

Rejected. It breaks the exhaustive discovery path, creates compatibility risk and conflicts with Obsidian muscle memory.

### Improve fuzzy ranking only

Rejected as the primary solution. Better ranking cannot give frequent actions stable user-owned groups and order.

### Build only a full Home dashboard

Rejected. It does not solve the in-context invocation problem, creates competing widgets and duplicates mature community plugins.

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
- dynamic group scope tabs;
- responsive one-to-three-column Destination Link Matrix with an approximately three-row viewport;
- bounded five-column Command Grid with a two-row cap;
- ordered command Overflow List after the cap;
- search over configured commands and destinations;
- full keyboard and focus restoration;
- close-only header.

### Track C · Manage

- in-place group and action editor;
- on-demand catalog picker;
- drag reorder;
- per-action display mode and Home pin toggle;
- invalid command handling;
- export/import.

### Track D · Home

- ItemView shell;
- centered launcher entry;
- quick access;
- continue working;
- pinned pages;
- pinned destinations through existing owners.

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
- Modal/Home resolve the same action identity, label, icon and hotkey.
- Keyboard tests across scope tabs and all three projection layers.
- Focus restoration test.
- Boundary test prevents UI or service code from reading private `app.commands` directly.
- Build and existing command gateway tests.

### Real Obsidian

Use the canonical CDP protocol.

1. Open from a user-bound hotkey.
2. Verify board geometry and computed hit targets.
3. Switch group scope and navigate Destination Links, Command Grid and Overflow List continuously in both axes.
4. Search a curated Excalidraw scope without replacing the layered projection with an unrelated result layout.
5. Execute a Peak command, open Home, open a dashboard and open a pinned Vault document.
6. Disable the third-party plugin and verify the unavailable state.
7. Close with Escape and verify active element and editor selection restoration.
8. Open Home in a new tab and return without workspace loss.
9. On one active item, choose a Lucide icon, then an Emoji, and verify Launcher, Search and Home update from the same presentation metadata.
10. Record a short clip for Icon Browser focus restoration, keyboard behavior and manage drag behavior.

If CDP is unavailable, mark these interactions `INTERACTION NOT VERIFIED`; a static prototype and green build are not acceptance.

## 18. Acceptance criteria

- Native `Cmd/Ctrl + P` behavior is unchanged.
- The user can bind one shortcut to open Peak Command Center.
- Empty query shows one selected scope as a stable layered projection.
- All first-run groups are available as stable top-row scope tabs without a permanent group sidebar.
- No second type-navigation row competes with the user-owned group scopes.
- Destination Links can open Home, registered dashboards, pinned Vault documents, Bookmarks and Workspaces.
- Command Grid remains capped at two rows; excess commands continue in stable order in the Overflow List.
- Adding an item never reorders existing destination-link positions or the first two command rows.
- Group order and action order remain stable.
- Customize presents one stable item directory, can add and reorder groups/items, and persists all three display modes.
- Every active item can choose a Lucide icon, an Emoji or no icon through one searchable browser; the result stays synchronized across Launcher, Search and Home.
- Runtime search returns only configured actions and keeps source provenance.
- Every visible shortcut matches current Obsidian hotkey configuration.
- A user can create an Excalidraw group and add a command without editing files.
- A missing plugin does not crash or silently remap an action.
- Home and Modal use one source of truth for action identity and presentation metadata.
- Pin and unpin updates Home Quick access without creating a second action definition.
- Home can pin a Vault file, Bookmark and Workspace.
- Home defaults to Search, Quick access, Continue and optional Pinned pages instead of a block dashboard.
- Home does not introduce a parallel tasks or calendar store.
- The legacy AI planner is not presented as this launcher.

## 19. Risks and stop rules

| Risk | Impact | Control |
| --- | --- | --- |
| Private command catalog API changes | Third-party picker breaks | Central adapter, startup capability check, Peak-only fallback |
| Board grows into another infinite catalog | Original problem returns | Runtime search only configured actions; bounded visible groups |
| Home becomes a widget marketplace | Product scope fragments | Fixed Search / Quick access / Continue / Pinned pages structure |
| Dynamic suggestions destroy stable order | Daily use becomes unpredictable | No automatic suggestions in the first implementation |
| Hotkey labels drift | User loses trust | Resolve live; never persist display string |
| Old and new Command Center concepts coexist | Naming and ownership confusion | Rename/retire old planner during implementation |

Stop implementation and return for owner review if:

- arbitrary command discovery cannot be isolated behind one compatibility port;
- Home requires copying Note/Base/Workspace state into a second data model;
- the first usable board needs more than four default groups;
- implementation proposes intercepting or rewriting native Command Palette behavior.
