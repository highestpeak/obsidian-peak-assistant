# Peak Assistant — Manual Testing Checklist

> Covers all features implemented in 04-18 ~ 04-24 sessions. Test in Obsidian desktop.
> Mark each item ✅ or ❌ as you go. Add notes for failures.

---

## 0. Pre-flight

- [ ] `npm run build` passes
- [ ] Reload plugin in Obsidian (Cmd+P → "Reload app without saving")
- [ ] Open DevTools console (Cmd+Option+I) — watch for errors throughout testing

---

## 1. Provider v2 — Profile System

### 1.1 Settings UI

- [ ] Settings → Model Config → "Profile Settings" section visible
- [ ] "Agent Profile" and "Embedding Profile" dropdowns shown at top
- [ ] Both default to "-- None --" or a migrated profile

### 1.2 Create Profiles

- [ ] Click "Add Profile" → preset picker shows 4 options
- [ ] **Anthropic Direct**: creates profile with `https://api.anthropic.com`, model `claude-opus-4-6`
- [ ] **OpenRouter**: creates profile with `https://openrouter.ai/api`, model `anthropic/claude-opus-4-6`
- [ ] **LiteLLM**: creates profile with `http://localhost:4000/anthropic`
- [ ] **Custom**: creates blank profile

### 1.3 Edit Profile

- [ ] Click chevron on profile card → editor expands
- [ ] Enter API Key → confirm changes → field saves (masked)
- [ ] Change Primary Model → confirm → persisted after plugin reload
- [ ] Fill Embedding Endpoint + Embedding Model fields

### 1.4 Assign & Delete

- [ ] Assign a profile as Agent Profile via dropdown
- [ ] Assign a (different) profile as Embedding Profile
- [ ] Delete a non-active profile → card removed
- [ ] Delete the active Agent Profile → dropdown resets gracefully

### 1.5 V1 Migration (existing users only)

- [ ] If upgrading from v1: migrated profile(s) appear automatically
- [ ] Migrated profile has existing API key / auth token pre-filled
- [ ] No manual action required — just verify data is carried over

---

## 2. Chat — Core Flow

### 2.1 Send & Receive

- [ ] Open Chat sidebar → type a message → submit
- [ ] Response streams in with ThinkingIndicator (pulsing dots) during generation
- [ ] After response: MessageRoleAvatar shows (👤 user, ✨ assistant)
- [ ] MessageStyleButtons appear below assistant message (Shorter / More detail / Simpler / More formal)
- [ ] Click "Shorter" → follow-up rewrite message sent

### 2.2 Input Features

- [ ] Type `@` → ContextMenu popup appears (file/tag/folder suggestions)
- [ ] Navigate with ↑↓ → select with Enter → context inserted
- [ ] Press Escape → menu dismisses
- [ ] Type `/` → PromptMenu popup appears (saved prompts)
- [ ] Navigate and select a prompt
- [ ] `Cmd+Enter` inserts a newline (does not submit)
- [ ] `Ctrl+ArrowUp` → cycles to previous sent message
- [ ] `Ctrl+ArrowDown` → cycles forward / restores draft
- [ ] `Cmd+K` focuses the input from anywhere in the chat panel
- [ ] IME (中文/日文) 输入法回车确认不会触发提交

### 2.3 Conversation Management

- [ ] Hover on conversation in sidebar → trash icon appears
- [ ] Click trash → conversation deleted (no accidental open)
- [ ] Create new conversation via "+" button or Home page suggestion cards

### 2.4 Agent Mode

- [ ] Start an Agent conversation (via type picker or mode selector)
- [ ] Agent runs tools → ToolCallSummary shows active tool name + animation
- [ ] After completion → ToolCallSummary collapses to "⚙️ N steps" chip
- [ ] Click chip → expand step-by-step tool log with input/result details

### 2.5 Cancel

- [ ] During streaming → Submit button changes to Cancel
- [ ] Click Cancel → stream stops, partial response preserved

---

## 3. Chat UI — New Components

### 3.1 Home Page

- [ ] Open Chat with no active conversation → Home page renders
- [ ] Correct time-based greeting (Good morning / afternoon / evening)
- [ ] 2×2 suggestion cards visible (Continue last chat / Summarize / Research / Plan)
- [ ] Click "Continue last chat" → opens most recent conversation
- [ ] Click "Research a topic" → starts new Agent conversation
- [ ] Recent Conversations list shows up to 5 items
- [ ] Projects list shows with "+ New project" button

### 3.2 New Conversation Type Picker

- [ ] Click "+" for new conversation → type picker shows 4 cards
- [ ] Chat / Agent / Plan cards are clickable
- [ ] Canvas card is visually disabled
- [ ] Selecting a type starts conversation in that mode

### 3.3 Conversation List

- [ ] Conversations show: type icon + title + relative date
- [ ] Non-Chat types show colored type badge (Agent / Plan)
- [ ] Date grouping: Today / This Week / Older sections
- [ ] Search bar filters conversations by title

### 3.4 Date Separators

- [ ] In a conversation spanning multiple days → DateSeparator shows between days
- [ ] Labels: "Today", "Yesterday", or formatted date

### 3.5 Conversation Outline

- [ ] Toggle outline panel via chat header button
- [ ] 240px right sidebar shows messages grouped by topic
- [ ] Click a topic → scrolls to that message

---

## 4. AI Analysis (Search Modal → AI Tab)

### 4.1 Landing Page

- [ ] Open Quick Search (Cmd+O) → AI Analysis tab
- [ ] With no query: "Suggested for you" card grid appears (if patterns exist)
- [ ] Cards show icon + filled template + context tags
- [ ] Click a suggestion → input fills + analysis triggers
- [ ] "Active" section shows running background sessions (if any)
- [ ] "Recent" section shows past analyses with icon + time

### 4.2 Mode Pills

- [ ] Mode pills visible next to input (🧠 Vault / 🔗 Graph)
- [ ] Active pill: solid purple, inactive: outlined gray
- [ ] Click switches analysis mode
- [ ] `⌥↑`/`⌥↓` cycles modes via keyboard

### 4.3 Footer

- [ ] Footer shows: ↑↓ Navigate / ↵ Run / ⌥↑⌥↓ Switch mode
- [ ] Right side shows total analysis count in purple

---

## 5. Vault Search (Search Modal → Vault Search Tab)

### 5.1 Mode System

- [ ] Default mode: "vault" badge shown on right edge of input
- [ ] Type `#` → badge changes to "in-file", searches within active file
- [ ] Type `@` → badge changes to "folder", searches current folder
- [ ] Type `:42` → badge changes to "line", file jumps to line 42
- [ ] Type `?` → badge changes to "help", shows ModeHelpList
- [ ] Backspace on a lone prefix (e.g., just `#`) → returns to vault mode
- [ ] `⌥↑`/`⌥↓` cycles through modes

### 5.2 Mode Help List

- [ ] Type `?` → 5 modes listed (Vault / In-file / In-folder / Go to line / Help)
- [ ] Each shows: icon + name + description + prefix badge
- [ ] ↑↓ navigates, Enter selects (fills prefix into input)
- [ ] Click a mode → fills prefix

### 5.3 Inspector Side Panel

- [ ] Select a result → press `→` → 340px inspector panel opens on right
- [ ] Results remain visible on left (side-by-side)
- [ ] Press `←` → inspector closes
- [ ] Inspector state persists across modal open/close

### 5.4 Inspector — Connected Section

- [ ] Shows merged outgoing (→) and backlinks (←)
- [ ] Each link shows: direction icon, note name, context snippet
- [ ] Convergence badge (e.g., "14 refs") for heavily-linked notes
- [ ] With a search query active: relevant links show green ✓ + score%
- [ ] Irrelevant links appear dimmed (35% opacity)
- [ ] "See N more ↓" expands the full list

### 5.5 Inspector — Discovered Section

- [ ] Shows hidden connections: SEM (purple badge), CO-CITE (blue), UNLINKED (amber)
- [ ] Each item: note name, score%, WHY explanation
- [ ] "See N more ↓" expands

### 5.6 Inspector — AI Graph Section

- [ ] Shows most recent AI Graph analysis (if any): query, nodes/edges, time
- [ ] "New window ↗" opens the analysis in a new Obsidian window
- [ ] "Generate AI Graph" button (with "Uses AI credits" subtitle)

### 5.7 Topic Navigation

- [ ] Click a note name in the inspector → inspector updates to that note
- [ ] The clicked note becomes selected in the results list (if present)
- [ ] Search query is preserved throughout navigation

### 5.8 Search Results

- [ ] Each result shows: file icon, title (highlighted), path, snippet, time
- [ ] Relevance score badge (purple %) shows when search query is active
- [ ] Selected result: left purple accent bar + light indigo background
- [ ] First result pre-selected when no query typed
- [ ] Hover on result → ExternalLink icon appears (open in new tab)
- [ ] Click ExternalLink icon → opens in new tab (does not trigger row click)

### 5.9 Footer

- [ ] Shows: ↑↓ navigate / Enter open / → inspector / # in-file / ? modes
- [ ] Result count + search duration on right

---

## 6. Embeddings

### 6.1 Profile-Based Embedding

- [ ] Assign a profile with embedding endpoint (e.g., OpenAI or local) as Embedding Profile
- [ ] Trigger vault re-index (Search: Reindex vault command)
- [ ] Console shows embedding API calls succeeding
- [ ] No errors about missing provider/model

### 6.2 Error Cases

- [ ] Set Embedding Profile to "-- None --" → indexing shows appropriate error
- [ ] Profile without embedding endpoint set → error "Embedding endpoint not configured"

---

## 7. Agent Trace

### 7.1 Obsidian Command

- [ ] Cmd+P → "Peak: Run Trace Scenario"
- [ ] Fuzzy modal lists scenario files (e.g., "vault-search/hub-discovery")
- [ ] Select one → "Running trace: ..." notice appears
- [ ] After completion → "Trace written: ..." notice with file path
- [ ] Check that trace file exists at reported path

### 7.2 CLI (optional, for developers)

```bash
# Set API key
export ANTHROPIC_API_KEY=sk-...

# Run a scenario
npm run trace -- scenario vault-search/hub-discovery

# Run with custom query
npm run trace -- vault-search --fixture small "my custom query"
```

- [ ] CLI runs without error
- [ ] Trace file written to `data/traces/`

---

## 8. Background Sessions

### 8.1 Detach & Restore

- [ ] Start an AI analysis → close the modal while it's streaming
- [ ] Notice appears: "Analysis moved to background"
- [ ] Re-open modal → "Active" section shows the running session
- [ ] Click the session card → restores to foreground with accumulated results

### 8.2 Multiple Sessions

- [ ] Start analysis → close → start another → close
- [ ] Both show in "Active" section
- [ ] Cancel button on hover works for each
- [ ] Plan-ready sessions show blue badge, streaming shows purple spinner

---

## 9. Analysis Doc Persistence (04-20 fix)

### 9.1 Early Save — Plan Ready

- [ ] Start AI Analysis → wait for plan to appear (Process tab shows "Report Outline")
- [ ] Check `ChatFolder/AI-Analysis/` folder → new `.md` file should exist
- [ ] Open the file → should contain:
  - [ ] Process Log callout with all completed search/read steps
  - [ ] Analysis Plan callout with the outline text
  - [ ] Numbered sections with plan metadata (missionRole, brief, contentType, sources)
- [ ] "Open in File" button (in modal footer) works at this stage

### 9.2 Final Save — After Report Generation

- [ ] Click "Generate Report" to approve the plan
- [ ] Wait for all sections + executive summary to finish
- [ ] Re-open the saved `.md` file → should now contain:
  - [ ] Full section content (replacing the brief placeholders)
  - [ ] Executive summary in the Summary section
- [ ] Verify: file was overwritten (same path), not duplicated

### 9.3 Continue Analysis — Multi-Round Preservation

- [ ] After a completed analysis, click "Continue" → type a follow-up query
- [ ] Wait for Round 1 plan to appear → approve → wait for sections
- [ ] Open saved file → should contain:
  - [ ] Round 0 sections (original analysis) with full content
  - [ ] A "Continue Analysis: [follow-up query]" separator section
  - [ ] Round 1 sections with full content
  - [ ] Process Log with round markers (`--- Round 0: ... ---`)

### 9.4 Regenerate Section

- [ ] On a completed report, click the regenerate button on any section
- [ ] Wait for regeneration to finish
- [ ] Open saved file → the regenerated section should have updated content

### 9.5 Background Session Persistence

- [ ] Start AI Analysis → close modal while streaming (before plan appears)
- [ ] Wait for "Analysis plan ready" notice
- [ ] Check saved file → should have process log + plan metadata
- [ ] Restore session → approve plan → generate report
- [ ] Check saved file → should now have full report content

### 9.6 No Frequent Writes

- [ ] During report generation (sections streaming), watch DevTools console
- [ ] Should NOT see repeated `[analysisDocPersistence]` or vault write logs
- [ ] Only see writes at: plan-ready and after generateReport completes

---

## 10. Copilot Document Intelligence (04-24)

### 10.1 Copilot: Polish Document

- [ ] Open a markdown note → Cmd+P → "Copilot: Polish Document"
- [ ] Progress notice: "Polishing document..."
- [ ] Modal opens with side-by-side diff (Before / After)
- [ ] Red dot + "Before" label on left, green dot + "After" label on right
- [ ] Word count stats visible below diff
- [ ] Click "Apply Changes" → document updated in-place
- [ ] Reopen → verify changes are saved

### 10.2 Copilot: Polish Selection

- [ ] Select a paragraph → Cmd+P → "Copilot: Polish Document"
- [ ] Scope badge shows "Selection"
- [ ] Diff shows only the selected text
- [ ] Click "Apply Changes" → only selected text replaced

### 10.3 Copilot: Review Article

- [ ] Open a note → Cmd+P → "Copilot: Review Article"
- [ ] Progress notice: "Reviewing article..."
- [ ] Modal opens with overall assessment (accent left border)
- [ ] Per-issue items with severity icons (! error red, ⚠ warning amber, ℹ info blue)
- [ ] Each item shows: title + severity badge + feedback + 💡 suggestion
- [ ] Each item has 🔧 Fix button

### 10.4 Review → Fix Flow

- [ ] Click 🔧 Fix on a review item → "Generating fix..." loading
- [ ] Transitions to full-screen Polish diff view
- [ ] Header shows breadcrumb: "Fix: [issue title]" with severity badge
- [ ] Suggestion text displayed above the diff
- [ ] "← Back to review" link in footer
- [ ] Click "Accept Fix" → document updated, returns to review list
- [ ] Fixed item shows ✓ Fixed (dimmed)
- [ ] Click "Skip" → returns without applying
- [ ] "Copy Feedback" button → review as markdown in clipboard

### 10.5 Copilot: Suggest Links

- [ ] Open a note with some content → Cmd+P → "Copilot: Suggest Links"
- [ ] Progress notice: "Analyzing links..."
- [ ] Modal opens with summary bar (N links · X outgoing · Y incoming)
- [ ] Each link shows: checkbox + [[target]] (purple) + type badge (→ Out / ← In)
- [ ] Reason text explains why the link is suggested
- [ ] Context excerpt shows where the link fits (with highlight)
- [ ] Outgoing links pre-selected by default
- [ ] Toggle checkboxes → "N of M selected" counter updates
- [ ] Click "Insert N Links" → [[target]] inserted at context positions
- [ ] Verify links appear in the document at correct locations

### 10.6 Copilot: Suggest Split

- [ ] Open a long note (>500 words) → Cmd+P → "Copilot: Suggest Split"
- [ ] Progress notice: "Analyzing structure..."
- [ ] Short note (<500 words) → Notice: "Document is too short to split"
- [ ] Modal opens with reason bar (yellow left border, 📐 icon)
- [ ] Proportional color bar shows relative split sizes
- [ ] Per-split cards: numbered circle + title + word count
- [ ] Heading chips show which headings go in each split
- [ ] "Original content Lines X–Y" excerpt with gradient fade
- [ ] Click "Split into N Notes" → N new files created
- [ ] Original file: extracted sections replaced with [[new-note-title]] links
- [ ] Notice: "Split into N notes: ..." with file names

---

## 11. Search Polish (04-24)

### 11.1 Open in New Tab Button

- [ ] Hover over a vault search result → ExternalLink icon appears
- [ ] Click icon → note opens in a new tab
- [ ] Row click still opens in current tab (as before)

### 11.2 Save Graph to Vault

- [ ] Run an AI Analysis with graph mode → generate AI graph
- [ ] V2Footer shows Download icon (only when graph data exists)
- [ ] Click Download → "Graph saved: ..." notice
- [ ] Check AI-Analysis folder → `.md` file with graph JSON

### 11.3 Query Builder (External Platform)

- [ ] In chat, click the "Open in..." menu (external platforms)
- [ ] With a long conversation → query should be truncated (last 3 messages, max 500 chars)
- [ ] URL should not be excessively long

---

## 12. File Icons (04-24)

- [ ] FileChangesList shows correct icons for .md, .pdf, .xlsx, .docx, .png
- [ ] ProjectOverview ResourcesTab shows correct file type icons
- [ ] No broken icons or missing icon components

---

## 13. Regression Checks

### 13.1 Core Functions Still Work

- [ ] Vault search returns results for known keywords
- [ ] AI Analysis completes end-to-end (plan → approve → report)
- [ ] Chat streaming works (type question, get response)
- [ ] Graph generation works (AI Graph mode → generate)
- [ ] File opening from search results works (Enter on result)

### 13.2 No Console Errors

- [ ] No uncaught exceptions on plugin load
- [ ] No errors during normal search/chat/analysis usage
- [ ] No errors when switching between tabs rapidly

### 13.3 Settings Persistence

- [ ] All profile settings survive Obsidian restart
- [ ] Inspector open/close state persists across modal reopens
- [ ] Chat conversation history preserved after restart

---

## 14. Copilot Panel Expansion (05-07)

### 14.1 Picker Panel — Layout & Navigation

- [ ] Cmd+P → "Open Copilot Panel" → panel opens
- [ ] Three category sections visible: **Document** (blue icon), **Vault** (purple icon), **Writing** (green icon)
- [ ] All 15 action tiles displayed with icon + label + description
- [ ] Icon colors match category (blue/purple/green)
- [ ] Keyboard navigation ↑↓←→ works across sections
- [ ] Enter triggers selected action
- [ ] Mouse hover highlights tile + updates selection
- [ ] No file open → "Open a document first" message
- [ ] Footer shows: `↑↓←→ navigate ↵ select ★ recommended`

### 14.2 Context-Aware Recommendations (★ Star Badges)

- [ ] Open a document with **no tags** → `Suggest Tags` has gold ★ badge + border highlight
- [ ] Open a document with **>2000 words** → `Suggest Split` has ★
- [ ] Open an **orphan document** (no backlinks) → `Find Related` has ★
- [ ] Open a document with **>1500 words** → `Summarize` has ★
- [ ] **Select text** → reopen Copilot → `Rewrite Selection` has ★, `Polish` has ★
- [ ] Open a well-linked, well-tagged doc → no ★ on tags/links actions (low relevance)

### 14.3 Existing Actions Regression (via Registry)

- [ ] **Suggest Tags** → results show (verify TagSuggestionEngine multi-signal: should see "content analysis, graph neighbors, and folder history" in summary)
- [ ] **Suggest Links** → link suggestions with checkbox + Insert
- [ ] **Suggest Split** → split cards + execute (needs >500 word doc)
- [ ] **Suggest Split** guard: <500 word doc → Notice "Document is too short to split"
- [ ] **Review Article** → severity feedback list + Fix sub-flow → PolishPanel
- [ ] **Polish Document** → streaming output + Apply Changes

### 14.4 New Document Actions

- [ ] **Summarize** → streaming text output in result modal
- [ ] Summarize → "Copy" button copies to clipboard
- [ ] Summarize → "Insert at Top" inserts as `> [!summary]` callout after frontmatter
- [ ] Summarize guard: <100 word doc → Notice
- [ ] **Extract Concepts** → concept cards with term (bold) + definition + optional category badge
- [ ] Extract Concepts → check/uncheck concepts with checkbox
- [ ] Extract Concepts → "Create N Notes" creates `.md` files in same folder (verify: content = definition + `Extracted from: [[source]]`)
- [ ] Extract Concepts guard: <100 word doc → Notice
- [ ] **Translate** → streaming output + before/after side-by-side comparison
- [ ] Translate → auto-detect: CJK content → translates to English; Latin content → translates to 中文
- [ ] Translate → "Apply Translation" replaces selection or full document
- [ ] Translate on selected text → scope = selection

### 14.5 New Vault Actions

- [ ] **Find Related** → list of similar notes with similarity % badge + excerpt
- [ ] Find Related → responds quickly (no LLM, pure vector search)
- [ ] Find Related → click a note → opens in Obsidian
- [ ] Find Related → excludes current document from results
- [ ] **Knowledge Gaps** → gap cards with priority icons (AlertTriangle red / AlertCircle amber / Info blue)
- [ ] Knowledge Gaps → each card shows topic + description + suggested title
- [ ] Knowledge Gaps → "Create" button creates new note with suggested title + description
- [ ] **Synthesize Topic** → progress: "Searching vault..." → "Found N notes. Synthesizing..."
- [ ] Synthesize Topic → streaming synthesis article displays
- [ ] Synthesize Topic → collapsible "Sources" section at bottom with clickable note links
- [ ] Synthesize Topic → "Create as New Note" saves synthesis as new `.md`
- [ ] Synthesize Topic guard: <50 word doc → Notice
- [ ] **Vault Health** → progress: "Scanning vault metadata..." → "Analyzing N notes..."
- [ ] Vault Health → 4 tabs: Orphans / Duplicates / Stale / Tags
- [ ] Vault Health → tab bar shows count per category
- [ ] Vault Health → click an item → opens note in Obsidian
- [ ] Vault Health → works regardless of current document (global action)

### 14.6 New Writing Actions

- [ ] **Continue Writing** → streaming continuation text with left border accent
- [ ] Continue Writing → "Insert at End" appends to document
- [ ] Continue Writing → "Discard" closes without changing document
- [ ] Continue Writing guard: empty doc → Notice "Document is empty — write something first"
- [ ] **Rewrite Selection** → requires selected text
- [ ] Rewrite Selection guard: no selection → Notice "Select text to rewrite"
- [ ] Rewrite Selection → before/after side-by-side (original vs rewritten)
- [ ] Rewrite Selection → "Apply" replaces selected text in editor
- [ ] **Add Evidence** → progress: "Searching vault..." → "Found N sources. Selecting..."
- [ ] Add Evidence → evidence cards with source title (clickable) + italic quote + relevance %
- [ ] Add Evidence → check/uncheck evidence items
- [ ] Add Evidence → "Insert N Items" inserts at cursor position
- [ ] Add Evidence guard: <50 word doc → Notice

### 14.7 Error Handling

- [ ] No valid API key configured → error view with "Something went wrong" + "Open Settings" button
- [ ] Network timeout during any action → error view displays, no crash
- [ ] Cancel/close result modal during streaming → no lingering processes or errors in console

---

## 15. Copilot Agent Loop (05-10)

### 15.1 Agent Loop — Step Timeline

- [ ] **Suggest Links** → loading spinner → step timeline appears (vault_grep / vault_read_note / submit_result)
- [ ] Running step: purple spinner + tool display name + "..."
- [ ] Completed step: green check + tool display name + summary (e.g. "5 hits") + elapsed time (e.g. "1.2s")
- [ ] Consecutive `vault_read_note` calls collapse into BatchRow ("Reading N notes in depth")
- [ ] **Knowledge Gaps** → step timeline → knowledge gap cards with priority
- [ ] **Synthesize Topic** → step timeline → synthesis text + sources
- [ ] **Add Evidence** → step timeline → evidence cards with quotes

### 15.2 Step Collapse on Completion

- [ ] After agent finishes → steps collapse to summary row: "[check] N steps completed · Xs"
- [ ] Click collapsed row → expands to full step list
- [ ] Click "collapse" header → collapses back
- [ ] Result panel renders below the collapsed steps

### 15.3 Cancel & Error Handling

- [ ] During agent loop, click Cancel → stream stops, "Cancelled" view shown
- [ ] Click "Back to Copilot" → returns to picker
- [ ] No agent profile configured → error panel + "Open Settings" button
- [ ] Agent hits max turns (20) → graceful completion with partial results

### 15.4 Single-Turn Action Regression

- [ ] **Polish** → streams text normally (no step timeline, just loading → result)
- [ ] **Review** → structured result (no step timeline, loading → result)
- [ ] **Find Related** → instant vector search result (no LLM call)
- [ ] **Summarize** → streaming text with progress preview
- [ ] **Translate** → streaming text, auto-detect language direction
- [ ] **Suggest Tags** → multi-signal suggestions (content + graph + history)

---

## 16. Ambient Push Phase 4 — Morning Briefing (Session 27)

### 16.1 Startup Trigger

- [ ] Close Obsidian, wait >4 hours (or manually set `last_session_end` in index_state), reopen
- [ ] Morning Briefing modal appears ~3 seconds after startup
- [ ] Modal does NOT appear if re-opened within 4 hours

### 16.2 Briefing Content

- [ ] Three sections visible: Unresolved Connections, Changed Hubs, Decaying Engagement
- [ ] Each card shows note title + reason text + category icon
- [ ] Cards sorted by score within each section
- [ ] Empty sections are hidden (not shown with "no items")

### 16.3 Card Actions

- [ ] Hover on a card → Open + Dismiss buttons appear
- [ ] Click Open → note opens in Obsidian, modal stays open
- [ ] Click Dismiss → card removed from list
- [ ] When all cards dismissed → modal auto-closes

---

## 17. Provider MCP Phase 4-5 — Skills + Usage (Session 27)

### 17.1 Skill Picker

- [ ] Cmd+P → "Peak: Run Skill" → Skill Picker modal opens
- [ ] 3 built-in skills visible: weekly-report, literature-review, vault-health-check
- [ ] Search bar filters skills by name/tag
- [ ] Click a skill → input form appears for required inputs
- [ ] Submit → skill executes via agent loop

### 17.2 Custom Skills from Vault

- [ ] Create `_skills/test-skill.md` with YAML frontmatter (name, description, tools, prompt)
- [ ] Reopen Skill Picker → custom skill appears
- [ ] Rename/delete the file → skill updates in registry (hot reload)

### 17.3 Model Registry Sync

- [ ] Settings → Provider → model list reflects JSON registry data
- [ ] No console errors about missing model metadata

---

## 18. S2 — Vault X-Ray (Session 28)

### 18.1 Vault X-Ray View

- [ ] Cmd+P → "Peak: Vault X-Ray" → dedicated leaf opens
- [ ] Score Ring shows overall health score (0-100) with color gradient
- [ ] 5 Dimension Bars: Structural, Content Quality, Tagging, Cohesion, Freshness
- [ ] Priority Actions list sorted by severity (high → low)

### 18.2 Signal Detection

- [ ] S-ORPHAN: orphan notes detected (no inlinks/outlinks)
- [ ] S-BROKEN-LINK: broken `[[links]]` to non-existent notes detected
- [ ] C-EMPTY: empty files detected
- [ ] C-STUB: very short files (<50 words) detected
- [ ] G-UNTAGGED: notes without tags detected

### 18.3 Interactivity

- [ ] Click a finding → opens the affected note
- [ ] Dismiss a finding → removed from list, persisted in SQLite

---

## 19. S3 — Cascade Update (Session 28)

### 19.1 Hub Invalidation

- [ ] Edit a note that is a hub constituent → hub marked stale (check `hub_stale_since` in SQLite)
- [ ] `hub_regen` debt enqueued (visible in `cascade_debt` table)

### 19.2 Folder Stats

- [ ] Edit a note → ancestor folder stats updated (check `mobius_node` folder rows)

---

## 20. S4 — Structural Hole / Gap Analysis (Session 28)

### 20.1 Gap Analysis View

- [x] T11G retired the standalone `Peak: Open Gap Analysis` view/command
- [ ] Settings → Advanced → Maintenance → recompute gap analysis still runs structural analysis
- [ ] Structural MCP / graph inspector tools can still read structural analysis results

### 20.2 Gap Actions

- [x] T11G retired standalone Gap Analysis view buttons ("Add Link", "Create Bridge Note", "Refresh")
- [ ] Confirm retained structural recommendations surface through current graph/search/Copilot tooling, not the retired standalone Gap view
- [ ] Confirm manual recompute remains available through Settings → Advanced → Maintenance

### 20.3 MultiLensGraph Integration

- [ ] In AI Analysis graph → "Gap Analysis" lens tab available (Layers icon)
- [ ] Gap analysis layout shows community circles + dashed gap arcs

---

## 21. S5 — PPR Tuning (Session 28)

### 21.1 Settings

- [ ] Settings → Search → "Graph Search" section visible
- [ ] PPR toggle switch works (enable/disable)
- [ ] Setting persists after reload

### 21.2 Evaluation

- [ ] Cmd+P → "Peak: Compare Search Results" → runs both pipelines
- [ ] Console shows PPR evaluation report (rank displacement, discovery count)
- [ ] Notice shows summary metrics

---

## 22. S6 — Precompiled Knowledge (Session 28)

### 22.1 Hub Regeneration

- [ ] Edit hub constituent notes → stale hubs detected
- [ ] After 30s debounce → HubRegenService processes queue (check console)
- [ ] Cmd+P → "Peak: Refresh Hub Summaries" → manually triggers regen

### 22.2 Reranker Boost

- [ ] Search for a topic with hub docs → hub_doc results get subtle boost
- [ ] Hub docs appear slightly higher in results than pure similarity would suggest

---

## 23. S7 — Auto-tag (Session 28)

### 23.1 Single Document

- [ ] Open Copilot → "Suggest Tags" action
- [ ] Tags displayed with confidence tiers (high/medium/low)
- [ ] Accept individual tags → applied to frontmatter
- [ ] "Accept High Confidence" button → bulk accept high-tier tags
- [ ] Feedback recorded in `tag_suggestion` table

### 23.2 Batch Mode

- [x] T11G retired the standalone `Copilot: Batch Tag Suggestions` modal/command
- [ ] Confirm Copilot → "Suggest Tags" still opens the single-document tag suggestion panel
- [ ] Confirm Vault Lint tag-related findings still point to the retained `suggest-tags` action

---

## 24. Chat System Enhancements (Session 28)

### 24.1 Conversation Modes (#73)

- [ ] Mode selector shows 3 options: Chat / Agent / Plan
- [ ] Chat mode: no tools sent to LLM
- [ ] Agent mode: tools available (web search, etc.)
- [ ] Plan mode: planning system prompt prepended
- [ ] Mode persists per-conversation

### 24.2 Work Focus (#57)

- [ ] Chat header → click folder icon → folder picker opens
- [ ] Select folder → blue focus badge appears in header
- [ ] Focus affects system prompt context
- [ ] Click X on badge → focus cleared

### 24.3 Message Branching (#14)

- [ ] Hover on assistant message → GitBranch icon appears
- [ ] Click → new conversation created with messages up to that point
- [ ] New conversation opens with "Branch: ..." title

### 24.4 Message Lifecycle (#2)

- [ ] During sending: spinner indicator visible
- [ ] After 60s with no response: timeout status shown
- [ ] On error: error icon + label shown
- [ ] Completed messages: no indicator (clean)

### 24.5 Delete Conversation (#93)

- [ ] Hover on conversation tab → trash icon appears
- [ ] Click trash → confirmation popover: "Delete this conversation?"
- [ ] Confirm → conversation deleted, switches to next

### 24.6 Suggest Convert to Project (#21)

- [ ] After >10 messages in a conversation → subtle "Convert to project?" banner appears
- [ ] Click Convert → conversation moved to a project
- [ ] Dismiss X → banner hidden

### 24.7 Per-Conversation System Prompt (#83)

- [ ] Chat header → system prompt button → popover with textarea
- [ ] Enter custom prompt → save → accent dot indicator shows
- [ ] Custom prompt prepended to default in LLM requests
- [ ] Clear → removes custom prompt

### 24.8 Prompt Enhance (#12)

- [ ] Type a short message (<20 chars) → "Enhance prompt?" suggestion appears after ~1s
- [ ] Click → prompt rewritten via LLM, replaces input text
- [ ] Messages starting with `/` or `@` → no suggestion shown

### 24.9 Input History (#81)

- [ ] Send a few messages → Ctrl+Up recalls previous message
- [ ] Ctrl+Down goes forward / restores draft

---

## 25. Search Enhancements (Session 28)

### 25.1 Ctrl+Click New Tab (#90)

- [ ] In vault search, Ctrl/Cmd+click a result → opens in new tab
- [ ] Ctrl/Cmd+Enter → opens selected result in new tab
- [ ] Normal click still opens in current tab

### 25.2 Recent Queries (#67)

- [ ] Focus empty search input → recent queries dropdown appears
- [ ] Click a query → re-executes it
- [ ] "Clear" button removes all recent queries

### 25.3 Search Mode Picker (#91)

- [ ] Pill buttons visible: All / Folder / Heading / Line
- [ ] Click a mode → query prefix changes
- [ ] Active mode visually highlighted

### 25.4 Search Highlights (#60)

- [ ] In-file search highlights preserve original casing
- [ ] Score badge shows post-rerank finalScore

### 25.5 Popover Position (#79)

- [ ] Open menu near bottom of viewport → popover flips above
- [ ] Open menu near top → popover shows below
- [ ] No overflow outside viewport

---

## 26. New Copilot Actions (Session 28)

### 26.1 Format Polish (#42)

- [ ] Open Copilot → "Format Polish" action
- [ ] Shows diff with Accept/Reject

### 26.2 Semantic Link Suggestions (#38)

- [ ] Open Copilot → "Suggest Semantic Links"
- [ ] Shows unlinked semantic neighbors with similarity %
- [ ] One-click insert adds Related Notes section

### 26.3 Content Correction (#39)

- [ ] Open Copilot → "Correct Content"
- [ ] Per-correction accept/reject with before/after + severity badge

### 26.4 Vault Summary (#47)

- [ ] Open Copilot → "Vault Summary"
- [ ] Groups modified notes by topic, narrative summary
- [ ] "Save as Note" button works

### 26.5 Write Article (#32)

- [ ] Open Copilot → "Write Article" → enter topic
- [ ] Draft with [[citations]] from vault notes
- [ ] "Save as Note" works

### 26.6 Detect & File (#34)

- [ ] Select text → Open Copilot → "Detect & File"
- [ ] Content type identified + destination suggestions
- [ ] "Append Here" inserts to selected note

### 26.7 Custom Prompts (#40)

- [ ] Create `_prompts/my-prompt.md` with frontmatter (label, description, category)
- [ ] Copilot Picker shows custom prompt tile
- [ ] Note with `prompts: [my-prompt]` in frontmatter → that prompt ranked higher

### 26.8 Task Check (#43)

- [ ] Open doc with `- [ ]` items → Copilot → "Check Task List"
- [ ] Priority analysis + recommendations shown

### 26.9 Prompt Audit (#29)

- [ ] Open Copilot → "Prompt Audit"
- [ ] Rates each template 1-10 with expand/collapse details

### 26.10 Dedup Scan (#20)

- [ ] Open Copilot → "Duplicate Scan"
- [ ] Groups identical-content files with delete/merge options

### 26.11 Find & Solve Tasks (#44)

- [ ] Open Copilot → "Find & Solve Tasks"
- [ ] Finds open tasks with answers from vault
- [ ] "Mark Done" appends answer

### 26.12 Smart Connections (#89)

- [ ] Open Copilot → "Smart Connections"
- [ ] Shows semantically similar unlinked notes
- [ ] One-click insert [[link]]

### 26.13 Workflow Runner (#48)

- [ ] Open Copilot → "Run Workflow" → describe workflow
- [ ] Steps execute sequentially with status indicators
- [ ] Final output with copy/save

---

## 27. UI Theme (Session 28)

### 27.1 Dark Theme (#92)

- [ ] Switch Obsidian to dark theme → plugin UI follows
- [ ] All text readable (no white-on-white or black-on-black)
- [ ] Borders and surfaces use appropriate dark palette
- [ ] Switch back to light → plugin reverts correctly

### 27.2 Style Isolation (#77)

- [ ] Plugin UI doesn't leak styles into Obsidian native elements
- [ ] Obsidian headings/links don't break inside plugin panels

### 27.3 FileIcon (#74)

- [ ] Various file types show correct Lucide icons (md, pdf, png, xlsx, json, etc.)
- [ ] No broken or missing icon placeholders

---

## 28. Infrastructure (Session 28)

### 28.1 Save Graph to Vault (#76)

- [ ] In AI graph → Save button → graph saved as markdown in vault
- [ ] File contains mermaid code block + metadata

### 28.2 Desktop Mocks (#58)

- [ ] `npm run test` passes with expanded mock coverage
- [ ] Mock workspace.openLinkText, vault.create/modify, metadataCache.getFileCache all functional

---

## Notes

_Record any issues, unexpected behavior, or suggestions here:_

```
-
-
-
```
