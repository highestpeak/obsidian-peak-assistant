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

## Notes

_Record any issues, unexpected behavior, or suggestions here:_

```
-
-
-
```
