# Peak Assistant — Feature Roadmap

> Last updated: 2026-04-22
> Source: vault notes (kb2-learn-prd), code audit, TASKS.md, brainstorming sessions
> Purpose: capture ALL planned features, organized by theme and phase

---

## How to Read This Document

- **Phase**: Near (next 2 waves) / Medium (3-6 months) / Long (6+ months / speculative)
- **Status**: Done / In Progress / Planned (has spec/plan) / Backlog (idea only) / Future (speculative)
- **Source**: which vault note or discussion originated this idea
- Items marked with vault note references can be traced back for full context

---

## Theme 1: Chat System

### 1.1 Architecture (Planned — Wave 3B Chat Polish)

| Feature | Phase | Status | Notes |
|---------|-------|--------|-------|
| Store restructure: 4 stores -> 2 (chatDataStore + chatViewStore) | Near | Planned | spec + plan written |
| ChatInputArea refactor: 453 -> ~150 lines (extract hooks + InputToolbar) | Near | Planned | spec + plan written |
| Delete conversation from active view (#93) | Near | Planned | in Chat Polish plan |
| Conversation modes backend — system prompt branching (#73) | Near | Planned | Level A only; upgrade to B/C post Provider v2 |
| Input history navigation Ctrl+Arrow (#81) | Near | Planned | in Chat Polish plan |
| Mock data cleanup (chatSessionStore fake file changes / prompts / tags) | Near | Planned | |
| key={index} -> key={message.id} bug fix | Near | Planned | |

### 1.2 Visual / UX Redesign (Planned — Wave 3B Chat UI Redesign)

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| Home page: contextual suggestion cards + compact recent list | Near | Designed | brainstorm session |
| ConversationType as first-class ConversationMeta field (chat/agent/plan/canvas/template/custom) | Near | Designed | brainstorm session |
| New Conversation type picker | Near | Designed | brainstorm session |
| Message list: role indicators (avatar + label) | Near | Designed | brainstorm session |
| Message list: hover-reveal actions (replace always-visible) | Near | Designed | brainstorm session |
| Message list: date separators (Today / Yesterday / date) | Near | Designed | brainstorm session |
| Message list: AI messages get subtle background | Near | Designed | brainstorm session |
| Message actions: per-message style switch buttons ("less emoji", "more formal", etc.) | Near | Backlog | `AI-peakAssistant-Chatbot.md` |
| Tool call display: Option A collapsed summary | Near | Designed | brainstorm session |
| Tool call: human-readable "thinking state" descriptions (not raw tool names) | Near | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |
| InputToolbar: dock layout (3 icons + mode pill + model badge) | Near | Designed | brainstorm session + mockup approved |
| Project Overview: inline stats + editable description + CTA empty states | Near | Designed | brainstorm session |
| Conversation List: search + date grouping + type badges | Near | Designed | brainstorm session |
| File Changes Panel: dark mode fix + style improvement | Near | Designed | brainstorm session |
| Conversation Outline: right panel for message navigation | Near | Backlog | Image 15 (existing feature, needs redesign) |
| Suggestion Actions: context-aware quick action chips | Near | Backlog | Image 16 (existing feature, needs redesign) |
| Scroll navigation: integrate into layout | Near | Backlog | Image 16 |
| Token usage display: in InputToolbar | Near | Designed | existing feature, integrated into new toolbar |
| Thinking/loading state: visual feedback while waiting for first token | Near | Backlog | `AI-peakAssistant-Chatbot.md` (3-star priority) |
| IME Enter key conflict fix (Chinese input sends message early) | Near | Backlog | `AI-peakAssistant-Chatbot.md` |

### 1.3 Input System

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| @ menu: custom React component replacing CodeMirror tooltip | Near | Backlog | code audit |
| @ menu: restore type icons, file/folder grouping, breadcrumb navigation | Near | Backlog | code audit |
| / menu: connect to real PromptService + template system | Near | Backlog | code audit |
| / menu: grouped display (built-in / user-created), description preview | Near | Backlog | code audit |
| Directory-scoped prompt rules (like .cursor rules per folder) | Medium | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |
| Voice input improvements | Medium | Backlog | existing feature |

### 1.4 Advanced Chat Features

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| AI response cards with UI components (buttons, tables, not just markdown) | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Message persistence queue (accumulate valuable info, AI auto-saves to vault) | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Conversation multi-topic detection + auto-suggest split | Medium | Backlog | `AI-peakAssistant-Chatbot.md` |
| Message branching — fork from any message point (#14) | Medium | Backlog | TASKS.md |
| Per-conversation system prompt / topic setting (#83) | Medium | Backlog | TASKS.md |
| Auto-suggest prompt improvement button per message | Medium | Backlog | `AI-peakAssistant-Chatbot.md` |
| Convert folder/notes directly into a Project | Medium | Backlog | `AI-peakAssistant-Chatbot.md` (3-star) |
| Suggest conversation -> project when it grows (#21) | Medium | Backlog | TASKS.md |
| Real-time LLM context inspector panel | Long | Backlog | `AI-peakAssistant-Context-Memory.md` |
| RAG within a single conversation (chunk + embed per-message) | Long | Backlog | `AI-peakAssistant-Context-Memory.md` |

### 1.5 Canvas Type (Future)

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| Canvas conversation type: split-pane (chat left, artifact right) | Medium | Backlog | brainstorm session (Claude Artifacts model) |
| Artifact rendering: sandboxed iframe for HTML/React/code execution | Medium | Backlog | competitive research |
| Cursor-style git diff view for document rewriting (before/after) | Medium | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |
| Tether/gravity lines from AI text mentions to graph nodes | Long | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |

### 1.6 Template System

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| Template conversation type: pre-structured with slot-filling | Medium | Backlog | brainstorm session |
| User-created templates (stored in vault as markdown) | Medium | Backlog | brainstorm session |
| Template marketplace / sharing | Long | Backlog | `AI-peakAssistant-AgentMode.md` |

---

## Theme 2: Provider & Runtime

| Feature | Phase | Status | Notes |
|---------|-------|--------|-------|
| Provider v2: delete Vercel AI SDK -> Agent SDK query() | Near | Planned | 12-task plan written, 3 sub-waves |
| Agent Trace observability: JSONL trace + CLI harness | Near | Planned | 11-task plan, gated on Provider v2 |
| Profile Registry + materialization | Near | Planned | Provider v2 Task 1 |
| Embedding helper (50-line fetch wrapper) | Near | Planned | Provider v2 Task 8 |
| Conversation modes Level B: mode controls allowedTools in query() | Medium | Backlog | post Provider v2 |
| Conversation modes Level C: distinct agent pipeline per mode | Medium | Backlog | post Provider v2 |
| Model benchmarking platform | Long | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |
| Usage tracking dashboard | Medium | Planned | Provider v2 Phase 10 |

---

## Theme 3: UI / Theme

| Feature | Phase | Status | Notes |
|---------|-------|--------|-------|
| CSS variable system (--pk-*) with Obsidian var bridge | Near | Planned | 11-task plan written |
| Style Settings integration (full color customization) | Near | Planned | in UI/Theme plan |
| Dark mode support | Near | Planned | in UI/Theme plan |
| Inline hex cleanup (~559 occurrences) | Near | Planned | in UI/Theme plan |
| Streamdown shadow host dark mode | Near | Planned | in UI/Theme plan |
| Unified FileIcon component | Near | Planned | in UI/Theme plan |
| Accent muted contrast fix | Near | Planned | mockup approved |
| Style isolation: migrate to important: '.pktw-root' | Medium | Backlog | recorded as future improvement |
| Dark theme support (#92) | Near | Planned | covered by UI/Theme plan |
| Style isolation (#77) | Near | Planned | keep current for now |
| Theme configuration (#56) | Near | Planned | Style Settings covers this |
| Consistent theming across all Obsidian themes | Near | Planned | CSS var bridge handles this |

---

## Theme 4: Search & Analysis

| Feature | Phase | Status | Notes |
|---------|-------|--------|-------|
| Query Pattern Discovery | Near | Done | 12 commits |
| Vault Search Redesign (inspector side panel) | Near | Done | 6 commits |
| Search bugs (#60) | Medium | Backlog | TASKS.md Phase 4 |
| Search score + "open in new tab" (#90) | Medium | Backlog | TASKS.md Phase 4 |
| Quick Search modes (#91) | Medium | Backlog | TASKS.md Phase 4 |
| Smart connection via graph inspector (#89) | Medium | Backlog | TASKS.md Phase 4 |
| Search intent detection module | Medium | Backlog | `AI-peak-assistant-obsidian.md` |
| Tool-call stream interceptor -> thinking state cards (analysis UI) | Medium | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |
| Graph pre-warming: scanning mode during find_path | Long | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |
| Dynamic result injection to graph during tool execution | Long | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |
| Nebula background for graph (idle: floating, active: snap to scores) | Long | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |
| Insight cards / "Inspiration Feed" (orphan notes, cross-domain leaps) | Long | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |
| "Fix Brain Gap" button (auto-generate connecting paragraph between notes) | Long | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |
| Source/Sink visual distinction (star emission vs black-hole) | Long | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |
| RRF score visualizer (blue=keyword, purple=semantic micro-bar) | Long | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |
| "Healing ray" path traversal animation | Long | Backlog | `AI-peakAssistant-AIAnalysisUI.md` |

---

## Theme 5: Copilot (Ambient Intelligence)

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| One-click document polish & format (#42) | Medium | Backlog | TASKS.md Phase 7 |
| Article reviewer (#33) | Medium | Backlog | TASKS.md Phase 7 |
| Suggest in/out links (#38) | Medium | Backlog | TASKS.md Phase 7 |
| Large doc split suggestion (#36) | Medium | Backlog | TASKS.md Phase 7 |
| Auto tag and backlink suggestions | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Principle-checking (auto-verify against user's principle files) | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Vocabulary/spelling tracking with classified error types | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Context-aware sidebar activation (auto-run prompts on matching files) | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Chat on existing document (right-click -> start chat referencing doc) | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Quick capture with auto-suggested directory | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Mess document cleanup mode (interactive AI cleanup) | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Auto daily/weekly planning from vault TODOs | Medium | Backlog | `AI-peakAssistant-Copilot.md` |
| Blog publication readiness check ("Is this appropriate to publish?") | Long | Backlog | `AI-peakAssistant-Copilot.md` |
| Git commit message auto-generation with structured format | Long | Backlog | `AI-peakAssistant-Copilot.md` |
| AI "personality" / character selection (encouraging, critic, etc.) | Long | Backlog | `AI-peakAssistant-Copilot.md` |

---

## Theme 6: Agent & Workflow

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| IFTTT workflow agent mode (#48) | Medium | Backlog | TASKS.md Phase 8, `AI-peakAssistant-AgentMode.md` |
| Multi-agent parallel mode (like Cursor) | Medium | Backlog | `AI-peakAssistant-AgentMode.md` |
| Agent marketplace (community-published agents) | Long | Backlog | `AI-peakAssistant-AgentMode.md` |
| n8n integration as flow engine | Long | Backlog | `AI-peakAssistant-AgentMode.md` |
| Daily/weekly/monthly AI summarize (#47) | Medium | Backlog | TASKS.md Phase 8 |
| Find vault tasks & solve (#44) | Medium | Backlog | TASKS.md Phase 8 |
| Task list check & apply (#43) | Medium | Backlog | TASKS.md Phase 8 |
| Extract todos from vault (#31) | Medium | Backlog | TASKS.md Phase 8 |
| Scheduled/batch background tasks | Medium | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |
| Auto weekly/monthly/yearly digest ("Wrapped") | Medium | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |

---

## Theme 7: Document & Knowledge

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| AI diagram generation (DrawIO, Mermaid, PlantUML from text) | Medium | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |
| Convert any graphic to Excalidraw/Mermaid (#51) | Medium | Backlog | TASKS.md Phase 10 |
| Office document support (docx, xlsx, pptx) | Medium | Backlog | `AI-peakAssistant-PDF-Image-Documents-Knowledge.md` |
| Obsidian Canvas file support | Medium | Backlog | same |
| Excalidraw file support | Medium | Backlog | same |
| Folder as single resource (summarize entire folder) | Medium | Backlog | same |
| Image-to-text indexing (OCR + caption during indexing) | Long | Backlog | same |
| CLIP multimodal embeddings for image search | Long | Backlog | same |
| MinerU/markitdown for high-quality PDF extraction | Medium | Backlog | same |
| Batch-generate PDF and assemble into document bundle | Long | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |

---

## Theme 8: Integrations & Platform

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| Sync from Flomo, Apple Notes, Mac Calendar | Medium | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |
| Sync ChatGPT/Gemini/Claude history into vault (#23) | Medium | Backlog | TASKS.md Phase 10 |
| GitHub.io blog sync (one-click publish) | Medium | Backlog | `AI-peakAssistant-Monetize.md` |
| Alfred/Raycast integration (global AI chat + vault history) | Medium | Backlog | `AI-peakAssistant-Monetize.md` |
| Cursor MCP bridge (collect Cursor history into Peak) | Medium | Backlog | `AI-peakAssistant-Monetize.md` |
| HTTP server inside plugin for external integrations | Long | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |
| Docker image for PDF/code interpreter (#55) | Medium | Backlog | TASKS.md Phase 6 |
| Mini-window for YouTube links (PiP + chat) | Long | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |
| Screenshot-to-chat workflow (vision model OCR) | Long | Backlog | `AI-peakAssistant-MoreFeaturesList.md` |

---

## Theme 9: Home & Dashboard

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| Home page redesign (contextual suggestions) | Near | Designed | brainstorm session |
| Startup daily dashboard (GitHub stats + vault stats + AI task plan) | Medium | Backlog | `A-2-UI-Enhance.md` |
| Mini graph window (related notes visualization) | Medium | Backlog | `A-2-UI-Enhance.md` |
| Lint panel (document quality issues with one-click fix) | Medium | Backlog | `A-2-UI-Enhance.md` |
| Command+E file switcher (like IntelliJ IDEA) | Medium | Backlog | `A-2-UI-Enhance.md` |
| Daily usage habit building (morning tasks, evening summary) | Long | Backlog | `AI-peakAssistant-Copilot.md` |

---

## Theme 10: Monetization

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| SSR prompt delivery (server-side prompt control for paid users) | Long | Backlog | `AI-peakAssistant-Monetize.md` |
| DLC module packs (visual dashboard, life map, auto-diagram) | Long | Backlog | same |
| Prompt fingerprinting (watermarks to identify leakers) | Long | Backlog | same |
| Model configuration down-delivery for subscribers | Long | Backlog | same |
| RPG community + gamified todo | Long | Backlog | same |
| Annual summary "Wrapped" product | Long | Backlog | same |
| BSL license strategy | Long | Backlog | same |
| Rename to "Apeak Assistant" | Long | Backlog | same |
| Cross-platform web sync service ($1/month) | Long | Backlog | same |

---

## Theme 11: Separate Product — Peak Graph Chat

| Feature | Phase | Status | Source |
|---------|-------|--------|--------|
| Multi-user real-time shared AI conversation canvas (Figma + Claude) | Separate track | Gate 1 passed | `peak-graph-chat/` vault folder |
| React Flow + Liveblocks CRDT + Next.js + Supabase | Separate track | Planning | same |
| 7-gate indie SaaS execution playbook | Separate track | Gate 2a next | same |

---

## Infrastructure & Housekeeping

| Feature | Phase | Status | Notes |
|---------|-------|--------|-------|
| GitHub triage: close 29 done/duplicate/outdated issues | Near | Pending | Wave 0 |
| Replace playwright + @langchain/community with fetch (-50MB) | Medium | Backlog | |
| User operations manual | Medium | Backlog | `AI-peak-assistant-obsidian.md` |
| Document type loader tests (#24) | Medium | Backlog | TASKS.md Phase 10 |
| Test all supported models (#13) | Medium | Backlog | TASKS.md Phase 10 |
| Graph inspector / AI analysis tutorial (#88) | Medium | Backlog | TASKS.md Phase 11 |
| Model selection best practice doc (#26) | Medium | Backlog | TASKS.md Phase 11 |
