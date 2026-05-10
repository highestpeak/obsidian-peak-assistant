var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// test/stubs/obsidian-stub.cjs
var require_obsidian_stub = __commonJS({
  "test/stubs/obsidian-stub.cjs"(exports2, module2) {
    "use strict";
    function normalizePath5(p) {
      return String(p ?? "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
    }
    var TAbstractFile = class {
    };
    var TFile7 = class extends TAbstractFile {
      constructor() {
        super();
        this.extension = "md";
      }
    };
    var TFolder5 = class extends TAbstractFile {
      constructor() {
        super();
        this.children = [];
      }
    };
    module2.exports = { normalizePath: normalizePath5, TAbstractFile, TFile: TFile7, TFolder: TFolder5 };
  }
});

// src/core/providers/types.ts
function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}
function mergeTokenUsage(usage1, usage2) {
  const u1 = usage1 ?? EMPTY_USAGE;
  const u2 = usage2 ?? EMPTY_USAGE;
  return {
    inputTokens: (u1.inputTokens ?? 0) + (u2.inputTokens ?? 0) || void 0,
    outputTokens: (u1.outputTokens ?? 0) + (u2.outputTokens ?? 0) || void 0,
    totalTokens: (u1.totalTokens ?? 0) + (u2.totalTokens ?? 0) || void 0,
    reasoningTokens: (u1.reasoningTokens ?? 0) + (u2.reasoningTokens ?? 0) || void 0,
    cachedInputTokens: (u1.cachedInputTokens ?? 0) + (u2.cachedInputTokens ?? 0) || void 0
  };
}
function buildPromptTraceDebugEvent(triggerName, system, prompt) {
  return {
    type: "pk-debug",
    debugName: "prompt-trace",
    triggerName,
    extra: {
      prompt: prompt ?? "undefined",
      systemLen: system?.length ?? "undefined",
      promptLen: prompt?.length ?? "undefined"
    }
  };
}
var ModelType, EMPTY_USAGE, DELTA_EVENT_TYPES;
var init_types = __esm({
  "src/core/providers/types.ts"() {
    ModelType = /* @__PURE__ */ ((ModelType2) => {
      ModelType2["LLM"] = "llm";
      ModelType2["EMBEDDING"] = "embedding";
      ModelType2["IMAGE"] = "image";
      ModelType2["VIDEO"] = "video";
      ModelType2["SOUND"] = "sound";
      return ModelType2;
    })(ModelType || {});
    EMPTY_USAGE = emptyUsage();
    DELTA_EVENT_TYPES = /* @__PURE__ */ new Set(["text-delta", "reasoning-delta", "prompt-stream-delta", "tool-input-delta", "ui-step-delta"]);
  }
});

// src/ui/view/quick-search/store/v2SessionTypes.ts
var V2_INITIAL_STATE;
var init_v2SessionTypes = __esm({
  "src/ui/view/quick-search/store/v2SessionTypes.ts"() {
    V2_INITIAL_STATE = {
      v2Active: false,
      v2View: "process",
      v2Steps: [],
      v2ReportChunks: [],
      v2ReportComplete: false,
      v2ToolCallIndex: /* @__PURE__ */ new Map(),
      v2Timeline: [],
      v2FinalReportStartIndex: -1,
      v2Sources: [],
      v2FollowUpQuestions: [],
      v2ProposedOutline: null,
      v2PlanSections: [],
      v2PlanApproved: false,
      v2UserInsights: [],
      v2Summary: "",
      v2SummaryStreaming: false,
      rounds: [],
      currentRoundIndex: 0,
      continueMode: false
    };
  }
});

// src/ui/view/quick-search/store/sessionSnapshot.ts
function cloneStep(step) {
  return { ...step, input: { ...step.input } };
}
function cloneTimelineItem(item) {
  if (item.kind === "text") {
    return { kind: "text", id: item.id, text: item.text, complete: item.complete };
  }
  return { kind: "tool", step: cloneStep(item.step) };
}
function cloneSection(sec) {
  return {
    ...sec,
    evidencePaths: [...sec.evidencePaths],
    streamingText: sec.streamingText,
    generations: sec.generations.map((g) => ({ ...g }))
  };
}
function cloneRound(round) {
  return {
    ...round,
    sections: round.sections.map(cloneSection),
    sources: round.sources.map((s) => ({ ...s })),
    steps: round.steps.map(cloneStep),
    timeline: round.timeline.map(cloneTimelineItem),
    followUpQuestions: [...round.followUpQuestions],
    annotations: round.annotations.map((a) => ({ ...a })),
    usage: round.usage ? { ...round.usage } : null
  };
}
function snapshotFromState(state) {
  return {
    // Session identity
    id: state.id,
    query: state.query,
    title: state.title,
    status: state.status,
    startedAt: state.startedAt,
    // V2 state
    v2Active: state.v2Active,
    v2View: state.v2View,
    v2Steps: state.v2Steps.map(cloneStep),
    v2ReportChunks: [...state.v2ReportChunks],
    v2ReportComplete: state.v2ReportComplete,
    v2ToolCallIndex: new Map(state.v2ToolCallIndex),
    v2Timeline: state.v2Timeline.map(cloneTimelineItem),
    v2FinalReportStartIndex: state.v2FinalReportStartIndex,
    v2Sources: state.v2Sources.map((s) => ({ ...s })),
    v2FollowUpQuestions: [...state.v2FollowUpQuestions],
    v2ProposedOutline: state.v2ProposedOutline,
    v2PlanSections: state.v2PlanSections.map(cloneSection),
    v2PlanApproved: state.v2PlanApproved,
    v2UserInsights: [...state.v2UserInsights],
    v2Summary: state.v2Summary,
    v2SummaryStreaming: state.v2SummaryStreaming,
    rounds: state.rounds.map(cloneRound),
    currentRoundIndex: state.currentRoundIndex,
    continueMode: state.continueMode,
    // Metadata
    duration: state.duration,
    usage: state.usage ? { ...state.usage } : null,
    phaseUsages: state.phaseUsages.map((p) => ({ ...p })),
    agentDebugLog: state.agentDebugLog.map((e) => ({ ...e, data: { ...e.data } })),
    error: state.error,
    analysisMode: state.analysisMode,
    runAnalysisMode: state.runAnalysisMode,
    webEnabled: state.webEnabled,
    hasStartedStreaming: state.hasStartedStreaming,
    hasAnalyzed: state.hasAnalyzed,
    hitlState: state.hitlState ? {
      ...state.hitlState,
      snapshot: {
        ...state.hitlState.snapshot,
        evidence: state.hitlState.snapshot.evidence.map((e) => ({ ...e })),
        suggestedSections: [...state.hitlState.snapshot.suggestedSections],
        discoveryGroups: state.hitlState.snapshot.discoveryGroups?.map((g) => ({ ...g, keyNotes: [...g.keyNotes] })),
        coverageGaps: state.hitlState.snapshot.coverageGaps ? [...state.hitlState.snapshot.coverageGaps] : void 0
      }
    } : null,
    autoSaveState: { ...state.autoSaveState },
    dashboardUpdatedLine: state.dashboardUpdatedLine
  };
}
var init_sessionSnapshot = __esm({
  "src/ui/view/quick-search/store/sessionSnapshot.ts"() {
  }
});

// src/ui/view/quick-search/store/searchSessionStore.ts
var searchSessionStore_exports = {};
__export(searchSessionStore_exports, {
  useSearchSessionStore: () => useSearchSessionStore
});
function _flushTimelineBuffer(set) {
  if (_tlBuf.raf !== null) {
    cancelAnimationFrame(_tlBuf.raf);
    _tlBuf.raf = null;
  }
  if (!_tlBuf.text) return;
  const text = _tlBuf.text;
  const id = _tlBuf.id;
  set((s) => {
    const timeline = [...s.v2Timeline];
    const last = timeline[timeline.length - 1];
    if (last && last.kind === "text" && !last.complete) {
      timeline[timeline.length - 1] = { ...last, text };
    } else {
      timeline.push({ kind: "text", id, text, complete: false });
    }
    return { v2Timeline: timeline };
  });
}
function _resetTimelineBuffer() {
  if (_tlBuf.raf !== null) {
    cancelAnimationFrame(_tlBuf.raf);
    _tlBuf.raf = null;
  }
  _tlBuf.text = "";
  _tlBuf.id = "";
}
function _flushSectionBuffers(set) {
  if (_secRaf !== null) {
    cancelAnimationFrame(_secRaf);
    _secRaf = null;
  }
  if (_secBufs.size === 0) return;
  const snapshot = new Map(_secBufs);
  set((s) => ({
    v2PlanSections: s.v2PlanSections.map((sec) => {
      const buffered = snapshot.get(sec.id);
      return buffered !== void 0 ? { ...sec, streamingText: buffered } : sec;
    })
  }));
}
function _resetSectionBuffers() {
  if (_secRaf !== null) {
    cancelAnimationFrame(_secRaf);
    _secRaf = null;
  }
  _secBufs.clear();
}
var import_zustand, _tlBuf, _secBufs, _secRaf, INITIAL_STATE, useSearchSessionStore;
var init_searchSessionStore = __esm({
  "src/ui/view/quick-search/store/searchSessionStore.ts"() {
    import_zustand = require("zustand");
    init_types();
    init_v2SessionTypes();
    init_sessionSnapshot();
    _tlBuf = { text: "", id: "", raf: null };
    _secBufs = /* @__PURE__ */ new Map();
    _secRaf = null;
    INITIAL_STATE = {
      id: null,
      query: "",
      status: "idle",
      startedAt: null,
      duration: null,
      usage: null,
      phaseUsages: [],
      agentDebugLog: [],
      title: null,
      error: null,
      analysisMode: "vaultFull",
      runAnalysisMode: null,
      webEnabled: false,
      isInputFrozen: false,
      hasStartedStreaming: false,
      hasAnalyzed: false,
      // V2 state from v2SessionTypes.ts
      ...V2_INITIAL_STATE,
      triggerAnalysis: 0,
      hitlState: null,
      hitlFeedbackCallback: null,
      autoSaveState: { lastRunId: null, lastSavedSummaryHash: null, lastSavedPath: null },
      restoredFromHistory: false,
      restoredFromVaultPath: null,
      aiModalOpen: false,
      dashboardUpdatedLine: "",
      sourcesViewMode: "list"
    };
    useSearchSessionStore = (0, import_zustand.create)((set, get) => ({
      ...INITIAL_STATE,
      // -----------------------------------------------------------------------
      // Session lifecycle
      // -----------------------------------------------------------------------
      incrementTriggerAnalysis: () => set((s) => ({ triggerAnalysis: s.triggerAnalysis + 1 })),
      startSession: (query2) => {
        _resetTimelineBuffer();
        _resetSectionBuffers();
        const ts = Date.now();
        const { analysisMode, webEnabled } = get();
        set({
          id: `run:${ts}`,
          query: query2,
          status: "starting",
          startedAt: ts,
          duration: null,
          usage: null,
          title: null,
          error: null,
          runAnalysisMode: analysisMode,
          isInputFrozen: true,
          hasStartedStreaming: false,
          restoredFromHistory: false,
          restoredFromVaultPath: null,
          autoSaveState: { ...get().autoSaveState, lastSavedPath: null },
          hitlState: null,
          hitlFeedbackCallback: null,
          dashboardUpdatedLine: "",
          sourcesViewMode: "list",
          v2Active: false,
          v2Steps: [],
          v2ReportChunks: [],
          v2ReportComplete: false,
          v2ToolCallIndex: /* @__PURE__ */ new Map(),
          v2Timeline: [],
          v2FinalReportStartIndex: -1,
          v2Sources: [],
          v2FollowUpQuestions: [],
          v2ProposedOutline: null,
          v2PlanSections: [],
          v2PlanApproved: false,
          v2UserInsights: [],
          v2Summary: "",
          v2SummaryStreaming: false,
          rounds: [],
          currentRoundIndex: 0,
          // Preserve analysisMode and webEnabled (already in closure)
          analysisMode,
          webEnabled
        });
      },
      startStreaming: () => set({ status: "streaming", hasStartedStreaming: true }),
      markCompleted: () => {
        _flushTimelineBuffer(set);
        _resetTimelineBuffer();
        _flushSectionBuffers(set);
        _resetSectionBuffers();
        return set((s) => {
          const now = Date.now();
          const completedV2Steps = s.v2Steps.map((step) => {
            if (step.status !== "running") return step;
            return { ...step, status: "done", endedAt: now };
          });
          const completedTimeline = s.v2Timeline.map((item) => {
            if (item.kind === "tool" && item.step.status === "running") {
              return { ...item, step: { ...item.step, status: "done", endedAt: now } };
            }
            if (item.kind === "text" && !item.complete) {
              return { ...item, complete: true };
            }
            return item;
          });
          let finalIdx = -1;
          for (let i = completedTimeline.length - 1; i >= 0; i--) {
            if (completedTimeline[i].kind === "tool") {
              for (let j = i + 1; j < completedTimeline.length; j++) {
                if (completedTimeline[j].kind === "text") {
                  finalIdx = j;
                  break;
                }
              }
              break;
            }
          }
          let extractedSummary = s.v2Summary;
          if (s.v2PlanSections.length === 0) {
            const startIdx = finalIdx >= 0 ? finalIdx : 0;
            const reportText = completedTimeline.slice(startIdx).filter((item) => item.kind === "text").map((item) => item.text).join("");
            if (reportText.trim()) {
              extractedSummary = reportText;
            }
          }
          const hasSections = s.v2PlanApproved && s.v2PlanSections.length > 0 && s.v2PlanSections.every((sec) => sec.status === "done");
          const hasDirectReport = s.v2PlanSections.length === 0 && !!extractedSummary;
          return {
            status: "completed",
            isInputFrozen: false,
            hasStartedStreaming: false,
            v2Steps: completedV2Steps,
            v2Timeline: completedTimeline,
            v2FinalReportStartIndex: finalIdx,
            v2Summary: extractedSummary,
            v2View: s.v2Active && (hasSections || hasDirectReport) ? "report" : s.v2View
          };
        });
      },
      recordError: (error) => set({ status: "error", error, isInputFrozen: false }),
      // -----------------------------------------------------------------------
      // Metadata
      // -----------------------------------------------------------------------
      setTitle: (title) => set({ title }),
      setUsage: (usage) => set({ usage }),
      accumulateUsage: (usage) => set((s) => ({ usage: mergeTokenUsage(s.usage, usage) })),
      addPhaseUsage: (usage) => set((s) => ({ phaseUsages: [...s.phaseUsages, usage] })),
      appendAgentDebugLog: (entry) => {
        const now = Date.now();
        if (entry.type === "reasoning") {
          const log = get().agentDebugLog;
          const last = log.length > 0 ? log[log.length - 1] : null;
          if (last && now - last.ts < 50) return;
        }
        set((s) => {
          const log = s.agentDebugLog;
          const trimmed = log.length >= 2e3 ? log.slice(log.length - 1999) : log;
          return { agentDebugLog: [...trimmed, { ts: now, ...entry }] };
        });
      },
      setDuration: (duration) => set({ duration }),
      setHasAnalyzed: (v) => set({ hasAnalyzed: v }),
      setDashboardUpdatedLine: (line) => set({ dashboardUpdatedLine: line ?? "" }),
      setAiModalOpen: (open) => set({ aiModalOpen: open }),
      setAnalysisMode: (mode) => set({ analysisMode: mode }),
      toggleWeb: (currentQuery) => {
        if (currentQuery.includes("@web@")) {
          set({ webEnabled: false });
          return currentQuery.replace(/@web@\s*/g, "").trim();
        }
        set({ webEnabled: true });
        return currentQuery + (currentQuery.trim() ? " @web@" : "@web@");
      },
      updateWebFromQuery: (query2) => set({ webEnabled: query2.trim().includes("@web@") }),
      setAutoSaveState: (s) => set((prev) => ({
        autoSaveState: {
          lastRunId: s.lastRunId !== void 0 ? s.lastRunId : prev.autoSaveState.lastRunId,
          lastSavedSummaryHash: s.lastSavedSummaryHash !== void 0 ? s.lastSavedSummaryHash : prev.autoSaveState.lastSavedSummaryHash,
          lastSavedPath: s.lastSavedPath !== void 0 ? s.lastSavedPath : prev.autoSaveState.lastSavedPath
        }
      })),
      // -----------------------------------------------------------------------
      // V2 step management
      // -----------------------------------------------------------------------
      setV2Active: (active) => set({ v2Active: active }),
      setV2View: (view) => set({ v2View: view }),
      setSourcesViewMode: (mode) => set({ sourcesViewMode: mode }),
      pushV2Step: (step) => set((s) => ({ v2Steps: [...s.v2Steps, step] })),
      updateV2Step: (id, updater) => set((s) => {
        const idx = s.v2Steps.findIndex((st) => st.id === id);
        if (idx === -1) return s;
        const next = [...s.v2Steps];
        next[idx] = updater({ ...next[idx] });
        return { v2Steps: next };
      }),
      appendV2ReportChunk: (chunk) => set((s) => ({
        v2ReportChunks: [...s.v2ReportChunks, chunk]
      })),
      markV2ReportComplete: () => set({ v2ReportComplete: true }),
      registerV2ToolCall: (id, toolName) => set((s) => {
        const next = new Map(s.v2ToolCallIndex);
        next.set(id, toolName);
        return { v2ToolCallIndex: next };
      }),
      resolveV2ToolName: (id) => get().v2ToolCallIndex.get(id) ?? "unknown",
      // V2 timeline management — RAF-throttled to prevent O(n²) copies and excessive re-renders
      pushV2TimelineText: (id, chunk) => {
        _tlBuf.text += chunk;
        _tlBuf.id = id;
        if (_tlBuf.raf === null) {
          _tlBuf.raf = requestAnimationFrame(() => {
            _tlBuf.raf = null;
            _flushTimelineBuffer(set);
          });
        }
      },
      pushV2TimelineTool: (step) => {
        _flushTimelineBuffer(set);
        const bufferedText = _tlBuf.text;
        _tlBuf.text = "";
        set((s) => {
          const timeline = [...s.v2Timeline];
          const last = timeline[timeline.length - 1];
          if (last && last.kind === "text" && !last.complete) {
            timeline[timeline.length - 1] = { ...last, text: bufferedText || last.text, complete: true };
          }
          timeline.push({ kind: "tool", step });
          return { v2Timeline: timeline };
        });
      },
      updateV2TimelineTool: (id, updater) => set((s) => {
        const idx = s.v2Timeline.findIndex((item2) => item2.kind === "tool" && item2.step.id === id);
        if (idx === -1) return s;
        const timeline = [...s.v2Timeline];
        const item = timeline[idx];
        timeline[idx] = { kind: "tool", step: updater({ ...item.step }) };
        return { v2Timeline: timeline };
      }),
      completeV2TimelineText: (id) => {
        _flushTimelineBuffer(set);
        const bufferedText = _tlBuf.text;
        _tlBuf.text = "";
        set((s) => {
          const idx = s.v2Timeline.findIndex((item2) => item2.kind === "text" && item2.id === id);
          if (idx === -1) return s;
          const timeline = [...s.v2Timeline];
          const item = timeline[idx];
          timeline[idx] = { ...item, text: bufferedText || item.text, complete: true };
          return { v2Timeline: timeline };
        });
      },
      addV2Source: (source) => set((s) => {
        if (s.v2Sources.some((src) => src.path === source.path)) return s;
        return { v2Sources: [...s.v2Sources, source] };
      }),
      // -----------------------------------------------------------------------
      // Plan & section generation
      // -----------------------------------------------------------------------
      approvePlan: () => set({ v2PlanApproved: true }),
      addUserInsight: (insight) => set((s) => ({ v2UserInsights: [...s.v2UserInsights, insight] })),
      removeUserInsight: (index) => set((s) => ({ v2UserInsights: s.v2UserInsights.filter((_, i) => i !== index) })),
      setPlanSections: (sections) => set({ v2PlanSections: sections }),
      updatePlanSection: (id, updater) => set((s) => ({
        v2PlanSections: s.v2PlanSections.map((sec) => sec.id === id ? updater(sec) : sec)
      })),
      reorderPlanSections: (ids) => set((s) => {
        const map = new Map(s.v2PlanSections.map((sec) => [sec.id, sec]));
        return { v2PlanSections: ids.map((id) => map.get(id)).filter(Boolean) };
      }),
      removePlanSection: (id) => set((s) => ({
        v2PlanSections: s.v2PlanSections.filter((sec) => sec.id !== id)
      })),
      addPlanSection: (missionRole) => set((s) => {
        const newId = `user-${Date.now()}`;
        const newSection = {
          id: newId,
          title: "New section",
          contentType: "analysis",
          visualType: "none",
          evidencePaths: [],
          brief: "",
          weight: 5,
          missionRole,
          status: "pending",
          content: "",
          streamingText: "",
          generations: []
        };
        return { v2PlanSections: [...s.v2PlanSections, newSection] };
      }),
      appendSectionChunk: (id, chunk) => {
        const prev = _secBufs.get(id) ?? "";
        _secBufs.set(id, prev + chunk);
        if (_secRaf === null) {
          _secRaf = requestAnimationFrame(() => {
            _secRaf = null;
            _flushSectionBuffers(set);
          });
        }
      },
      completeSectionContent: (id, content) => {
        _secBufs.delete(id);
        set((s) => ({
          v2PlanSections: s.v2PlanSections.map(
            (sec) => sec.id === id ? { ...sec, status: "done", content, streamingText: "" } : sec
          )
        }));
      },
      failSection: (id, error) => set((s) => ({
        v2PlanSections: s.v2PlanSections.map(
          (sec) => sec.id === id ? { ...sec, status: "error", error } : sec
        )
      })),
      startSectionRegenerate: (id) => set((s) => ({
        v2PlanSections: s.v2PlanSections.map((sec) => {
          if (sec.id !== id) return sec;
          const prev = sec.content ? { content: sec.content, timestamp: Date.now() } : null;
          return {
            ...sec,
            status: "generating",
            content: "",
            streamingText: "",
            error: void 0,
            generations: prev ? [...sec.generations, prev] : sec.generations
          };
        })
      })),
      setSummary: (text) => set({ v2Summary: text }),
      setSummaryStreaming: (streaming) => set({ v2SummaryStreaming: streaming }),
      // -----------------------------------------------------------------------
      // Round management (Continue Append Mode)
      // -----------------------------------------------------------------------
      freezeCurrentRound: () => set((s) => {
        if (!s.v2Active) return {};
        const round = {
          index: s.currentRoundIndex,
          query: s.query,
          sections: [...s.v2PlanSections],
          summary: s.v2Summary,
          summaryStreaming: false,
          sources: [...s.v2Sources],
          steps: [...s.v2Steps],
          timeline: [...s.v2Timeline],
          followUpQuestions: [...s.v2FollowUpQuestions],
          proposedOutline: s.v2ProposedOutline,
          annotations: [],
          usage: s.usage,
          duration: s.duration
        };
        return {
          rounds: [...s.rounds, round],
          currentRoundIndex: s.currentRoundIndex + 1
        };
      }),
      startContinueRound: (followUpQuery) => set(() => ({
        query: followUpQuery,
        status: "starting",
        hasStartedStreaming: false,
        v2Steps: [],
        v2Timeline: [],
        v2ReportChunks: [],
        v2ReportComplete: false,
        v2ToolCallIndex: /* @__PURE__ */ new Map(),
        v2PlanSections: [],
        v2PlanApproved: false,
        v2ProposedOutline: null,
        v2Summary: "",
        v2SummaryStreaming: false,
        v2FollowUpQuestions: [],
        v2View: "process"
        // Preserve: rounds, currentRoundIndex, v2Active, v2Sources (accumulate)
      })),
      addAnnotation: (annotation) => set((s) => {
        const rounds = [...s.rounds];
        if (annotation.roundIndex < rounds.length) {
          rounds[annotation.roundIndex] = {
            ...rounds[annotation.roundIndex],
            annotations: [...rounds[annotation.roundIndex].annotations, annotation]
          };
        }
        return { rounds };
      }),
      replaceSynthesized: (summary, sections) => set((s) => {
        const synthesizedRound = {
          index: 0,
          query: s.rounds[0]?.query ?? s.query,
          sections: sections.map((sec, i) => ({
            id: `synth-${i}`,
            title: sec.title,
            contentType: "narrative",
            visualType: "none",
            evidencePaths: [],
            brief: "",
            weight: 5,
            missionRole: "synthesis",
            status: "done",
            content: sec.content,
            streamingText: "",
            generations: [{ content: sec.content, timestamp: Date.now() }]
          })),
          summary,
          summaryStreaming: false,
          sources: s.rounds.flatMap((r) => r.sources),
          steps: [],
          timeline: [],
          followUpQuestions: [],
          proposedOutline: null,
          annotations: []
        };
        return {
          rounds: [synthesizedRound],
          currentRoundIndex: 1,
          v2PlanSections: [],
          v2Summary: summary
        };
      }),
      // -----------------------------------------------------------------------
      // HITL
      // -----------------------------------------------------------------------
      setHitlPause: (state) => set({ hitlState: { isPaused: true, ...state } }),
      clearHitlPause: () => set({ hitlState: null }),
      setHitlFeedbackCallback: (cb) => set({ hitlFeedbackCallback: cb }),
      // -----------------------------------------------------------------------
      // History
      // -----------------------------------------------------------------------
      setRestoredFromHistory: (restored, vaultPath) => set({
        restoredFromHistory: restored,
        restoredFromVaultPath: vaultPath ?? null
      }),
      // -----------------------------------------------------------------------
      // Snapshot / Restore
      // -----------------------------------------------------------------------
      snapshotState: () => snapshotFromState(get()),
      restoreFromSnapshot: (snapshot) => set({
        // Write all snapshot fields into the store
        ...snapshot,
        // Reset runtime-only fields
        restoredFromHistory: false,
        restoredFromVaultPath: null,
        isInputFrozen: false,
        // Clear function refs (not serializable)
        hitlFeedbackCallback: null,
        // Preserve UI-only fields at their defaults
        aiModalOpen: false,
        triggerAnalysis: 0,
        sourcesViewMode: "list"
      }),
      // -----------------------------------------------------------------------
      // Reset
      // -----------------------------------------------------------------------
      resetAll: () => {
        const { analysisMode, webEnabled } = get();
        set({
          ...INITIAL_STATE,
          analysisMode,
          webEnabled
        });
      },
      // -----------------------------------------------------------------------
      // Computed
      // -----------------------------------------------------------------------
      getIsCompleted: () => get().status === "completed"
    }));
  }
});

// test/ambient-push.test.ts
var import_node_assert = require("node:assert");

// src/service/ambient/ContextExtractor.ts
var import_obsidian = __toESM(require_obsidian_stub());
function extractParagraphAtLine(lines, lineIndex) {
  if (lineIndex < 0 || lineIndex >= lines.length) return "";
  const line = lines[lineIndex];
  if (line.trim() === "") return "";
  if (/^#{1,6}\s+/.test(line)) return line;
  let start = lineIndex;
  while (start > 0) {
    const prev = lines[start - 1];
    if (prev.trim() === "" || /^#{1,6}\s+/.test(prev)) break;
    start--;
  }
  let end = lineIndex;
  while (end < lines.length - 1) {
    const next = lines[end + 1];
    if (next.trim() === "" || /^#{1,6}\s+/.test(next)) break;
    end++;
  }
  return lines.slice(start, end + 1).join("\n");
}
function extractOutlinks(text) {
  const regex = /\[\[([^\]]+)\]\]/g;
  const results = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    let target = match[1];
    const hashIndex = target.indexOf("#");
    if (hashIndex !== -1) target = target.slice(0, hashIndex);
    const pipeIndex = target.indexOf("|");
    if (pipeIndex !== -1) target = target.slice(0, pipeIndex);
    const trimmed = target.trim();
    if (trimmed && !results.includes(trimmed)) {
      results.push(trimmed);
    }
  }
  return results;
}
function extractHeadings(lines) {
  const headings = [];
  const headingRegex = /^(#{1,3})\s+(.+)$/;
  for (const line of lines) {
    const match = headingRegex.exec(line);
    if (match) {
      headings.push(match[2].trim());
    }
  }
  return headings;
}
function getCursorSection(lines, lineIndex) {
  const headingRegex = /^(#{1,6})\s+(.+)$/;
  const stack = [];
  const end = Math.min(lineIndex, lines.length - 1);
  for (let i = 0; i <= end; i++) {
    const match = headingRegex.exec(lines[i]);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      stack.push({ level, text });
    }
  }
  return stack.map((h) => h.text).join(" > ");
}

// src/service/ambient/RelevanceExplainer.ts
var SIGNAL_PRIORITY = [
  "graph_neighbor",
  "co_citation",
  "hub_member",
  "shared_tag",
  "recency",
  "text_overlap"
];
function formatSignal(signal) {
  switch (signal.type) {
    case "shared_tag":
      return `Both tagged with #${signal.tag}`;
    case "graph_neighbor":
      if (signal.hop === 1) return "Directly linked";
      if (signal.hop === 2 && signal.via) return `Connected via [[${signal.via}]]`;
      return `${signal.hop}-hop graph neighbor`;
    case "co_citation":
      return `Co-cited in [[${signal.citingNote}]]`;
    case "hub_member":
      return `Both in "${signal.hubName}" cluster`;
    case "text_overlap":
      return `Similar discussion of ${signal.terms.map((t) => `"${t}"`).join(", ")}`;
    case "recency":
      return `Edited ${signal.editedDaysAgo} days ago in a related session`;
  }
}
function generateExplanation(signals) {
  if (signals.length === 0) return "Related content";
  let best;
  let bestPriority = SIGNAL_PRIORITY.length;
  for (const signal of signals) {
    const priority = SIGNAL_PRIORITY.indexOf(signal.type);
    if (priority !== -1 && priority < bestPriority) {
      bestPriority = priority;
      best = signal;
    }
  }
  if (!best) return "Related content";
  return formatSignal(best);
}

// src/core/errors.ts
var BusinessError = class extends Error {
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.name = "BusinessError";
    if (cause) {
      this.stack = cause.stack;
    }
  }
};

// src/core/eventBus.ts
var ViewEvent = class {
  constructor(type) {
    this.type = type;
    this.timestamp = Date.now();
  }
};
var UsageRecordedViewEvent = class extends ViewEvent {
  constructor(payload) {
    super("peak:usage-recorded" /* USAGE_RECORDED */);
    this.payload = payload;
  }
};
var EventBus = class _EventBus {
  constructor(app) {
    /** All active unsubscribe fns; cleared and invoked in offAll() so workspace refs are released. */
    this.subscribers = [];
    this.app = app;
  }
  static {
    this.instance = null;
  }
  /**
   * Get singleton instance
   */
  static getInstance(app) {
    if (!_EventBus.instance) {
      _EventBus.instance = new _EventBus(app);
    }
    return _EventBus.instance;
  }
  /**
   * Remove all subscriptions from workspace, then clear singleton.
   * Call from plugin onunload so old refs are released and next load gets a fresh instance.
   */
  static destroyInstance() {
    if (_EventBus.instance) {
      _EventBus.instance.offAll();
      _EventBus.instance = null;
    }
  }
  /** Unregister every subscription so workspace no longer holds refs to plugin closures. */
  offAll() {
    const list = this.subscribers;
    this.subscribers.length = 0;
    for (const fn of list) {
      try {
        fn();
      } catch (e) {
        console.warn("[EventBus] offAll: unsubscribe threw", e);
      }
    }
  }
  /**
   * Dispatch an event
   */
  dispatch(event) {
    this.app.workspace.trigger(event.type, event);
  }
  on(eventType, callback) {
    const ref = this.app.workspace.on(eventType, callback);
    const unsubscribe = () => this.app.workspace.offref(ref);
    this.subscribers.push(unsubscribe);
    return () => {
      const i = this.subscribers.indexOf(unsubscribe);
      if (i !== -1) this.subscribers.splice(i, 1);
      unsubscribe();
    };
  }
};

// src/core/schemas/zod-types.ts
var import_v3 = require("zod/v3");
var ZodError = import_v3.z.ZodError;

// src/core/schemas/tools/searchGraphInspector.ts
var import_v32 = require("zod/v3");
var SorterOption = import_v32.z.enum([
  "result_rank_desc",
  "result_rank_asc",
  "created_desc",
  "created_asc",
  "modified_desc",
  "modified_asc",
  "total_links_count_desc",
  "total_links_count_asc",
  "backlinks_count_desc",
  "backlinks_count_asc",
  "outlinks_count_desc",
  "outlinks_count_asc"
]);
var TIME_WITHIN_VALUES = [
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_3_months",
  "this_year"
];
var TimeWithinEnum = import_v32.z.enum(TIME_WITHIN_VALUES);
var TIME_WITHIN_NORMALIZE = {
  last_3_years: "this_year",
  last_2_years: "this_year",
  last_year: "this_year",
  last_6_months: "last_3_months",
  last_month: "this_month",
  last_week: "this_week",
  recent: "this_month"
};
var timeWithinNormalizeMap = { ...TIME_WITHIN_NORMALIZE };
function normalizeTimeWithin(val) {
  if (val == null) return null;
  const s = String(val).trim().toLowerCase();
  if (TIME_WITHIN_VALUES.includes(s))
    return s;
  return timeWithinNormalizeMap[s] ?? "this_year";
}
var FilterOption = import_v32.z.object({
  // tag_category_boolean_expression: z
  // 	.string()
  // 	.nullable()
  // 	.describe(
  // 		"Complex boolean expression for filtering. Use only tag:value, category:value, AND, OR, NOT, and parentheses. " +
  // 			"Each value must be a single word (no spaces, no special characters). " +
  // 			"Example: tag:javascript AND category:programming or (tag:react OR tag:vue) AND category:frontend."
  // 	),
  type: import_v32.z.enum(["note", "folder", "file", "all"]).nullable().default("all").describe(
    "note (markdown only), file (attachments), folder, or all (everything). Default is 'all'."
  ),
  path: import_v32.z.string().nullable().describe("Regex or prefix for file paths"),
  modified_within: import_v32.z.preprocess((val) => normalizeTimeWithin(val), TimeWithinEnum.nullable()),
  created_within: import_v32.z.preprocess((val) => normalizeTimeWithin(val), TimeWithinEnum.nullable())
});
var NullableFilterOption = import_v32.z.preprocess(
  (v) => v === null || v === void 0 || typeof v === "object" && !Array.isArray(v) ? v : null,
  FilterOption.nullable()
);
var SemanticFilter = import_v32.z.object({
  query: import_v32.z.string().describe(
    "A descriptive phrase of the concept you're looking for. Example: 'advanced machine learning optimization' (don't use single keywords)."
  ),
  topK: import_v32.z.number().min(1).max(30).default(20).describe("Number of top similar nodes to keep")
});
var ResponseFormat = import_v32.z.object({
  response_format: import_v32.z.enum(["structured", "markdown", "hybrid"]).default("hybrid").describe(
    "Choose 'markdown' if you need to reason about relationships, summarize content, or present findings. Choose 'structured' if you are performing multi-step operations for programmatic piping (e.g., getting IDs for another tool). Choose 'hybrid' if you need to get both data and context."
  )
});
var BaseLimit = import_v32.z.object({
  limit: import_v32.z.number().min(1).max(100).nullable().default(20).describe(
    "Maximum number of results returned to the agent."
  )
});
var SemanticOptions = import_v32.z.object({
  include_semantic_paths: import_v32.z.boolean().nullable().default(true).describe(
    "Include document semantic connection paths (vector-similar neighbors). Prefer true for richer discovery; set false only when you need physical links only."
  ),
  semantic_filter: SemanticFilter.nullable().describe(
    "Semantic pruning/relevance filtering. The conceptual anchor for filtering. Instead of 'AI', use 'Large language model architecture and training' to ensure vector relevance."
  )
});
var inspectNoteContextInputSchema = import_v32.z.object({
  note_path: import_v32.z.string().min(1, "note_path must be a non-empty vault path \u2014 retry with a valid path")
}).merge(BaseLimit).extend({
  grep_pattern: import_v32.z.string().nullable().describe(
    "Grep-like path filter. If set, only keep neighbor document nodes whose vault path matches this pattern (regex, case-insensitive; falls back to substring when regex is invalid)."
  ),
  include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
  response_format: ResponseFormat.shape.response_format.default("structured")
});
var graphTraversalInputSchema = import_v32.z.object({
  start_note_path: import_v32.z.string().min(1, "start_note_path must be a non-empty vault path \u2014 retry with a valid path"),
  hops: import_v32.z.number().min(1).max(3).default(1).describe(
    "3 hops is usually enough to cover a vast knowledge cluster. start with 1-2 hops. Only escalate to 3 hops if the results are too sparse."
  )
}).merge(SemanticOptions).extend({
  grep_pattern: import_v32.z.string().nullable().describe(
    "Grep-like path filter. If set, traversal prunes document nodes whose vault path does NOT match this pattern (regex, case-insensitive; falls back to substring when regex is invalid). Start node is always kept."
  ),
  filters: NullableFilterOption.describe(
    "Only filter document nodes in each level."
  ),
  sorter: SorterOption.nullable().describe("Only sort document nodes in each level."),
  response_format: ResponseFormat.shape.response_format.default("structured"),
  limit: import_v32.z.number().min(1).max(100).nullable().default(15).describe(
    "Maximum number of document nodes returned per depth level."
  )
});
var hubLocalGraphInputSchema = import_v32.z.object({
  center_note_path: import_v32.z.string().describe("Vault-relative note path used as hub center."),
  max_depth: import_v32.z.number().min(1).max(6).nullable().default(4).describe(
    "Maximum local expansion depth for the hub neighborhood. Start with 2-4 and only increase when the graph is too sparse."
  )
}).extend({
  response_format: ResponseFormat.shape.response_format.default("structured")
});
var findPathInputSchema = import_v32.z.object({
  start_note_path: import_v32.z.string().min(1, "start_note_path must be a non-empty vault path \u2014 retry with a valid path"),
  end_note_path: import_v32.z.string().min(1, "end_note_path must be a non-empty vault path \u2014 retry with a valid path"),
  strategy: import_v32.z.enum(["reliable", "fastTrack", "brainstorm"]).default("reliable").describe(
    "Path-finding strategy:\n- 'reliable' \u2014 bidirectional BFS on physical links only. Fast, deterministic. Use when you need the shortest actual wiki-link chain between two notes.\n- 'fastTrack' \u2014 A* guided by semantic gravity. Finds conceptually coherent paths even if physically longer. Use when direct links are sparse.\n- 'brainstorm' \u2014 forces cross-domain jumps to surface unexpected bridges between concepts. Use for creative discovery, not for precise relationship mapping."
  ),
  max_paths: import_v32.z.number().min(1).max(5).default(3).describe("Maximum number of distinct paths to return. Higher values increase computation time."),
  filters: NullableFilterOption,
  include_semantic_paths: SemanticOptions.shape.include_semantic_paths,
  response_format: ResponseFormat.shape.response_format.default("structured")
});
var findKeyNodesInputSchema = import_v32.z.object({}).merge(BaseLimit).extend({
  filters: NullableFilterOption,
  sorter: SorterOption.nullable().default("backlinks_count_desc"),
  semantic_filter: SemanticOptions.shape.semantic_filter.nullable(),
  response_format: ResponseFormat.shape.response_format.default("markdown")
});
var findOrphansInputSchema = import_v32.z.object({}).extend({
  limit: import_v32.z.number().min(1).max(1e3).nullable().default(50).describe("Maximum number of results."),
  filters: NullableFilterOption,
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("markdown")
});
var searchByDimensionsInputSchema = import_v32.z.object({
  boolean_expression: import_v32.z.string().describe(
    "Complex boolean expression for filtering. Use only tag:value, functional:value, AND, OR, NOT, and parentheses. Each value must be a single word (no spaces, no special characters). Example: tag:javascript AND functional:programming or (tag:react OR tag:vue) AND functional:frontend. If no results are found, try relaxing the boolean constraints or switching to OR logic."
  )
}).merge(BaseLimit).extend({
  filters: FilterOption.nullable(),
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("structured")
});
var exploreFolderInputSchema = import_v32.z.object({
  folderPath: import_v32.z.string().default("/").describe(
    "Folder path to inspect (relative to vault root, use '/' for root)"
  ),
  recursive: import_v32.z.boolean().default(true),
  max_depth: import_v32.z.number().min(1).max(3).nullable().default(2).describe(
    "Only active when recursive: true. Use max_depth: 1 for quick navigation, use max_depth: 3 only for deep structure mapping."
  )
}).merge(BaseLimit).extend({
  limit: import_v32.z.number().min(1).max(100).nullable().default(50).describe("Per-folder item cap; use \u226550 for inventory/full-list breadth."),
  filters: NullableFilterOption,
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("markdown")
});
var grepFileTreeInputSchema = import_v32.z.object({
  pattern: import_v32.z.string().min(1).describe("Search pattern (substring or regex) to match against vault file paths. Use to find anchor paths or folder names quickly."),
  limit: import_v32.z.number().min(1).max(500).nullable().default(200).describe("Max number of matching paths to return (default 200).")
});
var recentChangesWholeVaultInputSchema = import_v32.z.object({}).merge(BaseLimit).extend({
  filters: NullableFilterOption,
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("markdown")
});
var localSearchWholeVaultInputSchema = import_v32.z.object({
  query: import_v32.z.string().describe("The query to search for"),
  searchMode: import_v32.z.enum(["fulltext", "vector", "hybrid"]).nullable().default("fulltext").describe(
    "Search mode: 'fulltext' (text only), 'vector' (embedding-based), or 'hybrid' (combine both)."
  ),
  scopeMode: import_v32.z.enum(["vault", "inFile", "inFolder", "limitIdsSet"]).nullable().default("vault").describe(
    "Scope of search: 'vault' (entire vault), 'inFile' (current file), 'inFolder' (a folder and its subnotes), or 'limitIdsSet' (specific note ids set)."
  ),
  current_file_path: import_v32.z.string().nullable().describe(
    "Current file path (if any). Used for inFile mode and directory boost."
  ),
  folder_path: import_v32.z.string().nullable().describe("Folder path (if inFolder mode)."),
  limit_ids_set: import_v32.z.array(import_v32.z.string()).nullable().describe(
    "Set of note/document ids to limit search within (if limitIdsSet mode)."
  ),
  limit: import_v32.z.number().min(1).max(100).nullable().default(20).describe(
    "Maximum number of results. Use 15-25 for broader coverage; 8-12 for fast narrow search."
  )
}).extend({
  filters: NullableFilterOption,
  sorter: SorterOption.nullable(),
  response_format: ResponseFormat.shape.response_format.default("structured")
});

// src/core/schemas/tools/contentReader.ts
var import_v33 = require("zod/v3");

// src/core/schemas/tools/searchMemoryStore.ts
var import_v34 = require("zod/v3");
var searchMemoryStoreInputSchema = import_v34.z.object({
  query: import_v34.z.string().describe("Search query (keyword or phrase)"),
  maxChars: import_v34.z.number().min(100).max(8e3).nullable().describe("Max chars to return (default 4000)")
});
var getAnalysisMessageCountInputSchema = import_v34.z.object({});

// src/core/schemas/tools/submitFinalAnswer.ts
var import_v35 = require("zod/v3");
var submitFinalAnswerInputSchema = import_v35.z.object({});

// src/core/schemas/tools/contextDiscovery.ts
var import_v36 = require("zod/v3");
var getActivityDetailInputSchema = import_v36.z.object({
  activityId: import_v36.z.string().describe('Activity ID from the recent activity index, e.g. "A1"')
});
var getRecentAnalysisResultInputSchema = import_v36.z.object({
  query: import_v36.z.string().optional().describe("Search query to match against recent analyses"),
  limit: import_v36.z.number().default(1).describe("Number of results to return")
});
var getWorkingThemeInputSchema = import_v36.z.object({});

// src/core/schemas/agents/knowledgeIntuition.ts
var import_v37 = require("zod/v3");
var intuitionPartitionSchema = import_v37.z.object({
  label: import_v37.z.string(),
  purpose: import_v37.z.string(),
  /** 1–2 vault-relative folder prefixes to start browsing this area. */
  entryPaths: import_v37.z.array(import_v37.z.string()).max(2)
});
var intuitionEntitySchema = import_v37.z.object({
  name: import_v37.z.string(),
  description: import_v37.z.string(),
  location: import_v37.z.string(),
  whyItMatters: import_v37.z.string()
});
var intuitionEntryPointSchema = import_v37.z.object({
  intent: import_v37.z.string(),
  startPaths: import_v37.z.array(import_v37.z.string()).max(2),
  whatYouWillFind: import_v37.z.string()
});
var intuitionTopologySchema = import_v37.z.object({
  from: import_v37.z.string(),
  to: import_v37.z.string(),
  relation: import_v37.z.string()
});
var knowledgeIntuitionSubmitSchema = import_v37.z.object({
  findingsSummary: import_v37.z.string(),
  theme: import_v37.z.string().optional(),
  partitions: import_v37.z.array(intuitionPartitionSchema).max(6),
  coreEntities: import_v37.z.array(intuitionEntitySchema).max(8),
  topology: import_v37.z.array(intuitionTopologySchema).max(8),
  evolution: import_v37.z.string(),
  entryPoints: import_v37.z.array(intuitionEntryPointSchema).max(24),
  openQuestions: import_v37.z.array(import_v37.z.string()).max(6).optional(),
  should_stop: import_v37.z.boolean()
});

// src/core/schemas/ai-graph-schemas.ts
var import_v38 = require("zod/v3");
var lensNodeSchema = import_v38.z.object({
  id: import_v38.z.string(),
  label: import_v38.z.string(),
  path: import_v38.z.string(),
  role: import_v38.z.enum(["root", "hub", "bridge", "leaf", "orphan"]).optional(),
  group: import_v38.z.string().optional(),
  createdAt: import_v38.z.number().optional(),
  modifiedAt: import_v38.z.number().optional(),
  level: import_v38.z.number().optional(),
  parentId: import_v38.z.string().optional(),
  summary: import_v38.z.string().optional(),
  score: import_v38.z.number().optional()
});
var lensEdgeSchema = import_v38.z.object({
  source: import_v38.z.string(),
  target: import_v38.z.string(),
  kind: import_v38.z.enum(["link", "semantic", "derives", "temporal", "cross-domain"]),
  weight: import_v38.z.number().optional(),
  label: import_v38.z.string().optional()
});
var aiGraphDocSchema = import_v38.z.object({
  nodes: import_v38.z.array(lensNodeSchema),
  edges: import_v38.z.array(lensEdgeSchema),
  lensHint: import_v38.z.enum(["topology", "thinking-tree", "bridge", "timeline"]).optional()
});

// src/core/po/graph.po.ts
var GraphNodeType = {
  TopicTag: "topic_tag",
  FunctionalTag: "functional_tag",
  KeywordTag: "keyword_tag",
  /** LLM time/geo/person context tags (prefix labels Time* / Geo* / Person*). */
  ContextTag: "context_tag",
  Document: "document",
  /** Non-note vault entities (e.g. file attachments as graph nodes). Distinct from {@link Folder}. */
  Resource: "resource",
  /** Vault folder path node for hierarchy `contains` edges (parent folder → child or document). */
  Folder: "folder",
  HubDoc: "hub_doc"
};
var GraphEdgeType = {
  /** Vault wiki link to a doc-like target (note / hub markdown / canvas / excalidraw per indexing policy). */
  References: "references",
  /** Vault wiki link to a non-doc attachment target (image, pdf, office, etc.). */
  ReferencesResource: "references_resource",
  /**
   * Inferred / rule-based / LLM-derived doc→doc relation (not a wiki link).
   * Distinct from {@link References}; use `attributes_json` for provenance.
   */
  SemanticRelated: "semantic_related",
  TaggedTopic: "tagged_topic",
  TaggedFunctional: "tagged_functional",
  TaggedKeyword: "tagged_keyword",
  TaggedContext: "tagged_context",
  Contains: "contains"
};
var GRAPH_TAGGED_EDGE_TYPES = [
  GraphEdgeType.TaggedTopic,
  GraphEdgeType.TaggedFunctional,
  GraphEdgeType.TaggedKeyword,
  GraphEdgeType.TaggedContext
];
var GRAPH_WIKI_REFERENCE_EDGE_TYPES = [
  GraphEdgeType.References,
  GraphEdgeType.ReferencesResource
];
var GRAPH_SEMANTIC_DOC_EDGE_TYPES = [GraphEdgeType.SemanticRelated];
var GRAPH_INDEXED_NOTE_NODE_TYPES = [
  GraphNodeType.Document,
  GraphNodeType.HubDoc
];
var GRAPH_DOCUMENT_LIKE_NODE_TYPES = [
  GraphNodeType.Document,
  GraphNodeType.HubDoc
];
var GRAPH_TAG_NODE_TYPES = [
  GraphNodeType.TopicTag,
  GraphNodeType.FunctionalTag,
  GraphNodeType.KeywordTag,
  GraphNodeType.ContextTag
];
function isIndexedNoteNodeType(type) {
  return type === GraphNodeType.Document || type === GraphNodeType.HubDoc;
}

// src/core/template-engine-helper.ts
var import_handlebars = __toESM(require("handlebars"));

// src/core/utils/date-utils.ts
function humanReadableTime(timestamp) {
  const now = Date.now();
  const dateObj = new Date(timestamp);
  const nowDate = new Date(now);
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const isBeforeToday = timestamp < today.getTime();
  if (isBeforeToday) {
    const tsMidnight = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
    const diffDays = Math.round((today.getTime() - tsMidnight) / (1e3 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    if (diffDays === 1) {
      return "yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffWeeks < 4) {
      return `${diffWeeks} ${diffWeeks === 1 ? "week" : "weeks"} ago`;
    } else if (diffMonths < 12) {
      return `${diffMonths} ${diffMonths === 1 ? "month" : "months"} ago`;
    } else {
      return "more than one year ago";
    }
  } else {
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1e3);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffSeconds < 60) {
      return "just now";
    } else if (diffMinutes < 60) {
      return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
    } else {
      return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
    }
  }
}
function parseSemanticDateRange(semantic) {
  const now = /* @__PURE__ */ new Date();
  switch (semantic) {
    case "today": {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    case "yesterday": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - 1);
      return d;
    }
    case "this_week": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = d.getDay();
      d.setDate(d.getDate() - dayOfWeek);
      return d;
    }
    case "this_month": {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    case "last_3_months": {
      return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    }
    case "this_year": {
      return new Date(now.getFullYear(), 0, 1);
    }
    default: {
      throw new Error("Unknown semantic date filter: " + semantic);
    }
  }
}
function parseLooseTimestampToMs(value) {
  if (value == null) return void 0;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    if (value < 1e10) return Math.round(value * 1e3);
    return Math.round(value);
  }
  if (typeof value === "string") {
    const compact = parseInferCreatedAtStringToMs(value);
    if (compact !== void 0) return compact;
    const t = Date.parse(value.trim());
    if (!Number.isNaN(t)) return t;
  }
  return void 0;
}
function parseInferCreatedAtStringToMs(raw) {
  const s = raw.trim();
  if (!s) return void 0;
  const m = s.match(
    /^(\d{4})(\d{2})(\d{2})(?:[\sT]?(\d{2})(\d{2})(\d{2}))?$/
  );
  if (!m) return void 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return void 0;
  const hh = m[4] !== void 0 ? Number(m[4]) : 0;
  const mm = m[5] !== void 0 ? Number(m[5]) : 0;
  const ss = m[6] !== void 0 ? Number(m[6]) : 0;
  if (hh > 23 || mm > 59 || ss > 59) return void 0;
  const dt = new Date(y, mo - 1, d, hh, mm, ss, 0);
  const t = dt.getTime();
  return Number.isNaN(t) ? void 0 : t;
}

// src/core/template-engine-helper.ts
var import_js_yaml = __toESM(require("js-yaml"));
function compileTemplate(template) {
  registerTemplateEngineHelpers();
  return import_handlebars.default.compile(template);
}
var MAX_COMPILE_CACHE = 64;
var buildResponseCompileCache = /* @__PURE__ */ new Map();
function getCompiledBounded(template) {
  let fn = buildResponseCompileCache.get(template);
  if (!fn) {
    if (buildResponseCompileCache.size >= MAX_COMPILE_CACHE) {
      const firstKey = buildResponseCompileCache.keys().next().value;
      if (firstKey !== void 0) buildResponseCompileCache.delete(firstKey);
    }
    fn = compileTemplate(template);
    buildResponseCompileCache.set(template, fn);
  }
  return fn;
}
var helpersRegistered = false;
function registerTemplateEngineHelpers() {
  if (helpersRegistered) return;
  helpersRegistered = true;
  import_handlebars.default.registerHelper(
    "join",
    (array, separator) => Array.isArray(array) ? array.join(separator ?? ",") : String(array ?? "")
  );
  import_handlebars.default.registerHelper("take", (arr, n) => {
    if (!Array.isArray(arr)) return [];
    const limit = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    return arr.slice(0, limit);
  });
  import_handlebars.default.registerHelper("truncate", (str, maxLen) => {
    const s = typeof str === "string" ? str : String(str ?? "");
    const len = typeof maxLen === "number" ? maxLen : 300;
    if (s.length <= len) return s;
    return s.slice(0, len) + "...";
  });
  import_handlebars.default.registerHelper("toJson", (value) => {
    if (value === void 0 || value === null) return "";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  });
  import_handlebars.default.registerHelper("humanReadableTime", function(timestamp) {
    return timestamp ? humanReadableTime(timestamp) : "N/A";
  });
  import_handlebars.default.registerHelper("eq", function(a, b) {
    return a === b;
  });
  import_handlebars.default.registerHelper("gt", function(a, b) {
    return a > b;
  });
  import_handlebars.default.registerHelper("lt", function(a, b) {
    return a < b;
  });
  import_handlebars.default.registerHelper("gte", function(a, b) {
    return a >= b;
  });
  import_handlebars.default.registerHelper("lte", function(a, b) {
    return a <= b;
  });
  import_handlebars.default.registerHelper("similarLabel", function(count) {
    const n = typeof count === "number" ? count : 0;
    return n > 1 ? ` _(${n} similar)_` : "";
  });
  import_handlebars.default.registerHelper("lookup", function(obj, key) {
    return obj != null && typeof obj === "object" && key != null ? obj[key] : void 0;
  });
  import_handlebars.default.registerHelper("nonEmpty", (arr) => Array.isArray(arr) && arr.length > 0);
  import_handlebars.default.registerHelper("flattenEvidenceFacts", (packs) => {
    if (!Array.isArray(packs)) return [];
    const out = [];
    let n = 0;
    for (let i = 0; i < packs.length; i++) {
      const p = packs[i];
      const sourceId = `S${i + 1}`;
      const facts = Array.isArray(p?.facts) ? p.facts : [];
      for (const f of facts) {
        n++;
        const claim = (f?.claim ?? "").trim();
        out.push({ n, claim, sourceId });
      }
    }
    return out;
  });
  import_handlebars.default.registerHelper("formatNodeLabel", function(label, type) {
    switch (type) {
      case GraphNodeType.TopicTag:
        return `#${label}`;
      case GraphNodeType.FunctionalTag:
        return `\u{1F4C1}${label}`;
      case GraphNodeType.Document:
      default:
        return `[[${label}]]`;
    }
  });
  import_handlebars.default.registerHelper("hasNodeType", function(nodes, nodeType) {
    return nodes.some((node) => node.nodeType === nodeType);
  });
  import_handlebars.default.registerHelper("inc", function(value) {
    return parseInt(value) + 1;
  });
  import_handlebars.default.registerHelper("indent", function(depth) {
    const d = Number(depth) || 0;
    return " ".repeat(4 * d);
  });
  import_handlebars.default.registerHelper("toYaml", (jsonStr, baseIndent) => {
    try {
      const obj = JSON.parse(jsonStr);
      const rawYaml = import_js_yaml.default.dump(obj, {
        indent: 2,
        skipInvalid: true,
        // disable automatic wrapping
        lineWidth: -1,
        noRefs: true,
        // force double quotes instead of block mode
        quotingType: '"'
      }).trim();
      const spaces = " ".repeat(typeof baseIndent === "number" ? baseIndent : 0);
      return rawYaml.split("\n").map((line) => `${spaces}${line}`).join("\n");
    } catch {
      return jsonStr;
    }
  });
}

// src/core/template/TemplateRegistry.ts
var ToolTemplateId = {
  LocalSearch: "local-search",
  SearchByDimensions: "search-by-dimensions",
  RecentChanges: "recent-changes",
  GraphPathFinding: "graph-path-finding",
  InspectNoteContext: "inspect-note-context",
  ExploreFolder: "explore-folder",
  OrphanNotes: "orphan-notes",
  FindKeyNodes: "find-key-nodes",
  GraphTraversal: "graph-traversal"
};
var AgentTemplateId = {
  ResultSnapshot: "result-snapshot",
  EvidenceHint: "evidence-hint",
  EvidenceGroupSharedContext: "evidence-group-shared-context",
  /** Weaved context from recon merged paths (structure + mesh). */
  WeavePathsContext: "weave-paths-context",
  ReportBlockBlueprintLine: "report-block-blueprint-line"
};
var IndexingTemplateId = {
  CodeStopwords: "indexing-code-stopwords",
  /** Weak title/filename tokens filtered in cluster hub title token extraction. */
  ClusterHubWeakTitleTokens: "indexing-cluster-hub-weak-title-tokens",
  /** Hub discovery agent: one page of folder tree for LLM (`folderRows` + Handlebars; no path mapping block). */
  HubDiscoveryFolderTreePage: "indexing-hub-discovery-folder-tree-page",
  /** Hub discovery: empty-folder-tree placeholder Markdown. */
  HubDiscoveryFolderTreeEmpty: "indexing-hub-discovery-folder-tree-empty",
  /** Hub discovery agent: default `userGoal` when caller omits `options.userGoal` (plain text; Handlebars optional). */
  HubDiscoveryDefaultUserGoal: "indexing-hub-discovery-default-user-goal",
  /** Hub discovery agent: `agentPipelineBudget.note` in world metrics JSON (plain text for the LLM). */
  HubDiscoveryPipelineBudgetNote: "indexing-hub-discovery-pipeline-budget-note",
  /** Knowledge intuition agent: default `userGoal` when caller omits `options.userGoal` (plain text). */
  KnowledgeIntuitionDefaultUserGoal: "indexing-knowledge-intuition-default-user-goal",
  /** Knowledge intuition agent: rendered vault skeleton Markdown (Handlebars; English). */
  KnowledgeIntuitionSkeletonMarkdown: "indexing-knowledge-intuition-skeleton-markdown",
  /** Knowledge intuition agent: prep-only output when `stopAt: prep` (Handlebars; English). */
  KnowledgeIntuitionPrepOnlyMarkdown: "indexing-knowledge-intuition-prep-only-markdown"
};
var StopwordTemplateId = {
  Common: "stopwords-common",
  English: "stopwords-en",
  Chinese: "stopwords-zh"
};
var ConfigTemplateId = {
  TimeWithinNormalize: "time-within-normalize"
};
var CATEGORY_PREFIX = {
  prompts: "templates/prompts",
  tools: "templates/tools",
  agents: "templates/agents",
  ui: "templates/ui",
  indexing: "templates/indexing",
  stopwords: "templates/stopwords",
  config: "templates/config"
};
function meta(category, fileStem, opts) {
  const ext = category === "config" ? "json" : "md";
  return {
    category,
    path: `${CATEGORY_PREFIX[category]}/${fileStem}.${ext}`,
    ...opts
  };
}
var TEMPLATE_METADATA = {
  // --- Prompts (category prompts) ---
  "conversation-system": meta("prompts", "conversation-system", { label: "Chat System Prompt", description: "Core system instruction for all conversations. Defines AI persona, capabilities, and response style.", group: "chat" }),
  "conversation-summary-short": meta("prompts", "conversation-summary-short", { label: "Conversation Summary (Short)", description: "Generates a concise one-line summary for the sidebar list.", group: "chat" }),
  "conversation-summary-full": meta("prompts", "conversation-summary-full", { label: "Conversation Summary (Full)", description: "Generates a detailed summary preserving key decisions and context.", group: "chat" }),
  "project-summary-short": meta("prompts", "project-summary-short", { label: "Project Summary (Short)", description: "One-line project summary for project list display.", group: "chat" }),
  "project-summary-full": meta("prompts", "project-summary-full", { label: "Project Summary (Full)", description: "Detailed project summary with decisions, goals, and context.", group: "chat" }),
  "search-rerank-rank-gpt": meta("prompts", "search-rerank-rank-gpt", { label: "Search Rerank (RankGPT)", description: "LLM-based reranker that reorders search results by relevance.", group: "chat" }),
  "application-generate-title": meta("prompts", "application-generate-title", { label: "Generate Title", description: "Auto-generates a conversation title from the first few messages.", group: "chat" }),
  "memory-extract-candidates-json": meta("prompts", "memory-extract-candidates-json", { expectsJson: true, jsonConstraint: "Return only the JSON array, nothing else.", label: "Memory Extraction", description: "Identifies facts worth remembering from conversation messages.", group: "userProfile" }),
  "doc-summary-short": meta("prompts", "doc-summary-short", { label: "Doc Summary (Short)", description: "One-sentence summary for indexing and embeddings.", group: "indexing" }),
  "doc-summary-full": meta("prompts", "doc-summary-full", { label: "Doc Summary (Full)", description: "Detailed summary using short summary + TextRank anchors.", group: "indexing" }),
  "image-description": meta("prompts", "image-description", { label: "Image Description", description: "Generates a text description of an image for indexing.", group: "indexing" }),
  "image-summary": meta("prompts", "image-summary", { label: "Image Summary", description: "Generates a concise summary of image content.", group: "indexing" }),
  "ai-analysis-followup": meta("prompts", "ai-analysis-followup", { label: "Follow-up Chat", description: "User prompt for follow-up questions on search results.", group: "searchAnalysis" }),
  "ai-analysis-followup-system": meta("prompts", "ai-analysis-followup-system", { label: "Follow-up Chat (System)", description: "System prompt for follow-up conversations.", group: "searchAnalysis" }),
  "ai-analysis-title": meta("prompts", "ai-analysis-dashboard-title", { label: "Analysis Title", description: "Generates a title for search analysis results.", group: "searchAnalysis" }),
  "ai-analysis-doc-simple-scope": meta("prompts", "ai-analysis-doc-simple-scope", { label: "Doc Simple Scope", description: "Scope prefix for single-file Q&A mode.", group: "searchAnalysis" }),
  "ai-analysis-doc-simple-system": meta("prompts", "ai-analysis-doc-simple-system", { label: "Doc Simple (System)", description: "System prompt for single-file Q&A agent.", group: "searchAnalysis" }),
  "ai-analysis-mermaid-fix-system": meta("prompts", "ai-analysis-mermaid-fix-system", { label: "Mermaid Fix (System)", description: "System prompt for fixing mermaid syntax errors.", group: "searchAnalysis" }),
  "ai-analysis-mermaid-fix": meta("prompts", "ai-analysis-mermaid-fix", { label: "Mermaid Fix", description: "Fixes broken mermaid diagram syntax in reports.", group: "searchAnalysis" }),
  "ai-analysis-save-filename": meta("prompts", "ai-analysis-save-filename", { label: "Save Filename", description: "Suggests a filename when saving analysis results.", group: "searchAnalysis" }),
  "ai-analysis-save-folder": meta("prompts", "ai-analysis-save-folder", { label: "Save Folder", description: "Suggests a folder path when saving analysis results.", group: "searchAnalysis" }),
  "ai-analysis-vault-report-summary-system": meta("prompts", "ai-analysis-vault-report-summary-system", { label: "Report Summary (System)", description: "System prompt for vault report executive summaries.", group: "searchAnalysis" }),
  "ai-analysis-vault-report-summary": meta("prompts", "ai-analysis-vault-report-summary", { systemPromptId: "ai-analysis-vault-report-summary-system", label: "Report Summary", description: "Generates an executive summary for vault search reports.", group: "searchAnalysis" }),
  "ai-analysis-vault-sdk-playbook": meta("prompts", "ai-analysis-vault-sdk-playbook", { label: "Vault SDK Playbook", description: "System prompt for the SDK-based vault search agent.", group: "searchAnalysis" }),
  "ai-analysis-continue-system": meta("prompts", "ai-analysis-continue-system", { label: "Continue Analysis (System)", description: "System prompt for follow-up analysis rounds.", group: "searchAnalysis" }),
  "ai-analysis-continue": meta("prompts", "ai-analysis-continue", { systemPromptId: "ai-analysis-continue-system", label: "Continue Analysis", description: "Continues analysis with context from previous rounds.", group: "searchAnalysis" }),
  "ai-analysis-synthesize-system": meta("prompts", "ai-analysis-synthesize-system", { label: "Synthesize Rounds (System)", description: "System prompt for merging analysis rounds.", group: "searchAnalysis" }),
  "ai-analysis-synthesize": meta("prompts", "ai-analysis-synthesize", { systemPromptId: "ai-analysis-synthesize-system", label: "Synthesize Rounds", description: "Merges all analysis rounds into one cohesive report.", group: "searchAnalysis" }),
  "ai-analysis-report-section-system": meta("prompts", "ai-analysis-report-section-system", { label: "Report Section (System)", description: "System prompt for generating report sections.", group: "searchAnalysis" }),
  "ai-analysis-report-section": meta("prompts", "ai-analysis-report-section", { systemPromptId: "ai-analysis-report-section-system", label: "Report Section", description: "Generates a single section of the vault search report.", group: "searchAnalysis" }),
  "doc-tag-generate-json": meta("prompts", "doc-tag-generate-json", {
    expectsJson: true,
    jsonConstraint: "Return only the JSON object with topicTagEntries, functionalTagEntries (1\u20135 ids from closed list, never empty), context tag arrays, optional inferCreatedAt, and optional docType/docTypeConfidence/docTypeReasoning (folded into functional labels server-side), nothing else.",
    label: "Tag Generation",
    description: "Generates topic, functional, and context tags for a document.",
    group: "indexing"
  }),
  "hub-doc-summary-system": meta("prompts", "hub-doc-summary-system", { label: "Hub Doc Summary (System)", description: "System prompt for hub document summarization.", group: "indexing" }),
  "hub-doc-summary": meta("prompts", "hub-doc-summary", {
    expectsJson: true,
    jsonConstraint: "Return exactly one JSON object with keys shortSummary, fullSummary, coreFacts, queryAnchors, tagTopicDistribution, timeDimension, keyPatterns. No markdown fences.",
    systemPromptId: "hub-doc-summary-system",
    label: "Hub Doc Summary",
    description: "Structured summary for hub discovery.",
    group: "indexing"
  }),
  "hub-semantic-merge-system": meta("prompts", "hub-semantic-merge-system", { label: "Hub Semantic Merge (System)", description: "System prompt for merging similar hub nodes.", group: "indexing" }),
  "hub-semantic-merge": meta("prompts", "hub-semantic-merge", {
    expectsJson: true,
    jsonConstraint: "Return only JSON: mergeGroups (array of objects with representativeStableKey, memberStableKeys, reason, confidence 0-1, mergeKind duplicate|alias|same_topic, optional risks array). No markdown fences.",
    systemPromptId: "hub-semantic-merge-system",
    label: "Hub Semantic Merge",
    description: "Identifies and merges duplicate/alias hub entries.",
    group: "indexing"
  }),
  "knowledge-intuition-plan-system": meta("prompts", "knowledge-intuition-plan-system", { label: "Knowledge Intuition Plan (System)", description: "System prompt for knowledge intuition planning step.", group: "indexing" }),
  "knowledge-intuition-plan": meta("prompts", "knowledge-intuition-plan", {
    systemPromptId: "knowledge-intuition-plan-system",
    label: "Knowledge Intuition Plan",
    description: "Plans knowledge exploration using backbone + folder digest.",
    group: "indexing"
  }),
  "knowledge-intuition-submit": meta("prompts", "knowledge-intuition-submit", {
    expectsJson: true,
    jsonConstraint: "Return only one JSON object: findingsSummary, optional theme, partitions (max 6, entryPaths max 2 each), coreEntities (max 8, whyItMatters each), topology (max 8), evolution, entryPoints (max 24; count N from Vault scale in user prompt; intent, startPaths max 2, rich whatYouWillFind), optional openQuestions (max 6), should_stop.",
    systemPromptId: "knowledge-intuition-submit-system",
    label: "Knowledge Intuition Submit",
    description: "Submits intuition results with findings, entities, and topology.",
    group: "indexing"
  }),
  "pattern-discovery": meta("prompts", "pattern-discovery", { expectsJson: true, jsonConstraint: "Return only the JSON object with newPatterns and deprecateIds, no markdown or explanation.", label: "Pattern Discovery", description: "Analyzes query history to discover new query template patterns.", group: "indexing" }),
  "context-memory": meta("prompts", "context-memory", { label: "Context Memory", description: "Renders long-term memory entries into the conversation context.", group: "userProfile" }),
  "user-profile-context": meta("prompts", "user-profile-context", { label: "User Profile Context", description: "Renders the user profile into the conversation context window.", group: "userProfile" }),
  "profile-from-vault-json": meta("prompts", "profile-from-vault-json", { expectsJson: true, jsonConstraint: "Return only the JSON array, nothing else.", label: "Profile Extraction", description: "Extracts structured user profile data from vault notes.", group: "userProfile" }),
  "user-profile-organize-markdown": meta("prompts", "user-profile-organize-markdown", { label: "Profile Organize", description: "Organizes raw profile data into a clean markdown format.", group: "userProfile" }),
  "message-resources": meta("prompts", "message-resources", { label: "Message Resources", description: "Formats attached resources for inclusion in messages.", group: "ambientContext" }),
  // Copilot Document Intelligence
  "doc-polish": meta("prompts", "doc-polish", { systemPromptId: "doc-polish-system", label: "Document Polish", description: "Polishes writing for clarity, grammar, and flow.", group: "copilot" }),
  "doc-polish-system": meta("prompts", "doc-polish-system", { label: "Document Polish (System)", description: "System instructions for the document polish action.", group: "copilot" }),
  "doc-review": meta("prompts", "doc-review", { expectsJson: true, systemPromptId: "doc-review-system", label: "Document Review", description: "Structured feedback on document quality with severity-ranked issues.", group: "copilot" }),
  "doc-review-system": meta("prompts", "doc-review-system", { label: "Document Review (System)", description: "System instructions for the document review action.", group: "copilot" }),
  "doc-split-suggestion": meta("prompts", "doc-split-suggestion", { expectsJson: true, systemPromptId: "doc-split-suggestion-system", label: "Split Suggestion", description: "Analyzes document structure and suggests how to split into smaller notes.", group: "copilot" }),
  "doc-split-suggestion-system": meta("prompts", "doc-split-suggestion-system", { label: "Split Suggestion (System)", description: "System instructions for the split suggestion action.", group: "copilot" }),
  "doc-suggest-tags": meta("prompts", "doc-suggest-tags", { expectsJson: true, systemPromptId: "doc-suggest-tags-system", label: "Suggest Tags", description: "Suggests tags based on content and existing vault tags.", group: "copilot" }),
  "doc-suggest-tags-system": meta("prompts", "doc-suggest-tags-system", { label: "Suggest Tags (System)", description: "System instructions for the tag suggestion action.", group: "copilot" }),
  "doc-summarize": meta("prompts", "doc-summarize", { systemPromptId: "doc-summarize-system", label: "Summarize", description: "Generates a concise summary of the document content.", group: "copilot" }),
  "doc-summarize-system": meta("prompts", "doc-summarize-system", { label: "Summarize (System)", description: "System instructions for the summarize action.", group: "copilot" }),
  "doc-extract-concepts": meta("prompts", "doc-extract-concepts", { expectsJson: true, systemPromptId: "doc-extract-concepts-system", label: "Extract Concepts", description: "Identifies and extracts key concepts from the document.", group: "copilot" }),
  "doc-extract-concepts-system": meta("prompts", "doc-extract-concepts-system", { label: "Extract Concepts (System)", description: "System instructions for concept extraction.", group: "copilot" }),
  "doc-translate": meta("prompts", "doc-translate", { systemPromptId: "doc-translate-system", label: "Translate", description: "Translates document content. Auto-detects CJK to choose target language.", group: "copilot" }),
  "doc-translate-system": meta("prompts", "doc-translate-system", { label: "Translate (System)", description: "System instructions for the translate action.", group: "copilot" }),
  // Copilot Vault Intelligence
  "vault-health": meta("prompts", "vault-health", { expectsJson: true, systemPromptId: "vault-health-system", label: "Vault Health", description: "Analyzes vault structure for orphans, duplicates, stale notes, and tag issues.", group: "copilot" }),
  "vault-health-system": meta("prompts", "vault-health-system", { label: "Vault Health (System)", description: "System instructions for vault health analysis.", group: "copilot" }),
  // Copilot Writing Assistance
  "writing-continue": meta("prompts", "writing-continue", { systemPromptId: "writing-continue-system", label: "Continue Writing", description: "Continues writing from the current cursor position.", group: "copilot" }),
  "writing-continue-system": meta("prompts", "writing-continue-system", { label: "Continue Writing (System)", description: "System instructions for continue writing.", group: "copilot" }),
  "writing-rewrite": meta("prompts", "writing-rewrite", { systemPromptId: "writing-rewrite-system", label: "Rewrite Selection", description: "Rewrites selected text with improved clarity and style.", group: "copilot" }),
  "writing-rewrite-system": meta("prompts", "writing-rewrite-system", { label: "Rewrite Selection (System)", description: "System instructions for rewrite selection.", group: "copilot" }),
  // Copilot Agent Playbooks (system prompts for agent loop actions)
  "copilot-agent-suggest-links": meta("prompts", "copilot-agent-suggest-links", { label: "Suggest Links (Agent)", description: "Agent playbook that searches vault and suggests wiki-links.", group: "copilot" }),
  "copilot-agent-knowledge-gaps": meta("prompts", "copilot-agent-knowledge-gaps", { label: "Knowledge Gaps (Agent)", description: "Agent playbook that identifies knowledge gaps in vault coverage.", group: "copilot" }),
  "copilot-agent-synthesize-topic": meta("prompts", "copilot-agent-synthesize-topic", { label: "Synthesize Topic (Agent)", description: "Agent playbook that synthesizes information across vault notes.", group: "copilot" }),
  "copilot-agent-add-evidence": meta("prompts", "copilot-agent-add-evidence", { label: "Add Evidence (Agent)", description: "Agent playbook that finds and ranks supporting evidence.", group: "copilot" }),
  // Chat intelligence
  "chat-topic-aggregation": meta("prompts", "chat-topic-aggregation", {
    expectsJson: true,
    jsonConstraint: "Return only the JSON array of topic groups, nothing else.",
    label: "Topic Aggregation",
    description: "Groups conversation messages into topic clusters for the sidebar.",
    group: "chat"
  }),
  "chat-suggest-followups": meta("prompts", "chat-suggest-followups", {
    expectsJson: true,
    jsonConstraint: "Return only the JSON array of suggestion strings, nothing else.",
    label: "Suggest Follow-ups",
    description: "Generates 3 suggested follow-up questions shown below the last message.",
    group: "chat"
  }),
  "chat-suggest-actions": meta("prompts", "chat-suggest-actions", {
    expectsJson: true,
    jsonConstraint: "Return only the JSON array of action objects, nothing else.",
    label: "Suggest Actions",
    description: "Generates contextual action suggestions for the conversation.",
    group: "chat"
  }),
  // Ambient context / session intelligence
  "working-theme-inference": meta("prompts", "working-theme-inference", { expectsJson: true, jsonConstraint: "Return only the JSON object with summary and relatedFiles, nothing else.", label: "Working Theme Inference", description: "Infers the current working theme from recent activity.", group: "ambientContext" }),
  "working-context-render": meta("prompts", "working-context-render", { label: "Working Context Render", description: "Renders working context into conversation context.", group: "ambientContext" }),
  "activity-index-render": meta("prompts", "activity-index-render", { label: "Activity Index Render", description: "Renders recent vault activity into conversation context.", group: "ambientContext" }),
  "message-chunk-summarize": meta("prompts", "message-chunk-summarize", { label: "Message Chunk Summarize", description: "Summarizes a chunk of messages for context compression.", group: "ambientContext" }),
  // --- Tools ---
  [ToolTemplateId.LocalSearch]: meta("tools", "local-search"),
  [ToolTemplateId.SearchByDimensions]: meta("tools", "search-by-dimensions"),
  [ToolTemplateId.RecentChanges]: meta("tools", "recent-changes"),
  [ToolTemplateId.GraphPathFinding]: meta("tools", "graph-path-finding"),
  [ToolTemplateId.InspectNoteContext]: meta("tools", "inspect-note-context"),
  [ToolTemplateId.ExploreFolder]: meta("tools", "explore-folder"),
  [ToolTemplateId.OrphanNotes]: meta("tools", "orphan-notes"),
  [ToolTemplateId.FindKeyNodes]: meta("tools", "find-key-nodes"),
  [ToolTemplateId.GraphTraversal]: meta("tools", "graph-traversal"),
  // --- Agents ---
  [AgentTemplateId.ResultSnapshot]: meta("agents", "result-snapshot"),
  [AgentTemplateId.EvidenceHint]: meta("agents", "evidence-hint"),
  [AgentTemplateId.EvidenceGroupSharedContext]: meta("agents", "evidence-group-shared-context"),
  [AgentTemplateId.WeavePathsContext]: meta("agents", "weave-paths-context"),
  [AgentTemplateId.ReportBlockBlueprintLine]: meta("agents", "report-block-blueprint-line"),
  // --- Indexing (Handlebars; loaded at plugin boot for markdown chunking helpers) ---
  [IndexingTemplateId.CodeStopwords]: meta("indexing", "code-stopwords"),
  [IndexingTemplateId.ClusterHubWeakTitleTokens]: meta("indexing", "cluster-hub-weak-title-tokens"),
  [IndexingTemplateId.HubDiscoveryFolderTreePage]: meta("indexing", "hub-discovery-folder-tree-page"),
  [IndexingTemplateId.HubDiscoveryFolderTreeEmpty]: meta("indexing", "hub-discovery-folder-tree-empty"),
  [IndexingTemplateId.HubDiscoveryDefaultUserGoal]: meta("indexing", "hub-discovery-default-user-goal"),
  [IndexingTemplateId.HubDiscoveryPipelineBudgetNote]: meta("indexing", "hub-discovery-pipeline-budget-note"),
  [IndexingTemplateId.KnowledgeIntuitionDefaultUserGoal]: meta("indexing", "knowledge-intuition-default-user-goal"),
  [IndexingTemplateId.KnowledgeIntuitionSkeletonMarkdown]: meta("indexing", "knowledge-intuition-skeleton-markdown"),
  [IndexingTemplateId.KnowledgeIntuitionPrepOnlyMarkdown]: meta("indexing", "knowledge-intuition-prep-only-markdown"),
  [StopwordTemplateId.Common]: meta("stopwords", "common"),
  [StopwordTemplateId.English]: meta("stopwords", "en"),
  [StopwordTemplateId.Chinese]: meta("stopwords", "zh"),
  // --- Config (runtime-editable JSON) ---
  [ConfigTemplateId.TimeWithinNormalize]: meta("config", "time-within-normalize", { expectsJson: true })
};

// src/service/tools/types.ts
var TOOL_TEMPLATE_IDS = new Set(Object.values(ToolTemplateId));
function isToolTemplateId(s) {
  return TOOL_TEMPLATE_IDS.has(s);
}
function safeAgentTool(tool4) {
  return {
    description: tool4.description,
    inputSchema: tool4.inputSchema,
    execute: async (parameters) => {
      const start = Date.now();
      try {
        const parsedParameters = parameters ? tool4.inputSchema.parse(parameters) : void 0;
        return {
          result: await tool4.execute(parsedParameters),
          durationMs: Date.now() - start
        };
      } catch (error) {
        if (error instanceof ZodError) {
          const details = error.errors.map((e) => e.message).join("; ");
          return {
            error: "FAILED: Invalid or missing parameters. " + details + " Fix and re-run the tool with the required fields.",
            durationMs: Date.now() - start
          };
        }
        console.error("[Tool Safe Wrapper] Unknown internal error: ", error);
        return {
          error: "[Tool Safe Wrapper] Unknown internal error: " + error.message,
          durationMs: Date.now() - start
        };
      }
    }
  };
}
async function withTimeoutMessage(operation, timeoutMs, operationName = "Operation") {
  return Promise.race([
    operation.then((data) => ({ success: true, data })),
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: false,
          message: `${operationName} timed out after ${timeoutMs}ms. The operation took too long to complete.`
        });
      }, timeoutMs);
    })
  ]);
}
async function buildResponse(responseFormat, templateOrId, result, options) {
  if (responseFormat === "structured") {
    return result;
  }
  let rendered;
  if (templateOrId !== void 0) {
    const useTemplateManager = typeof templateOrId === "string" ? isToolTemplateId(templateOrId) : true;
    if (useTemplateManager) {
      const tm = options?.templateManager ?? AppContext.getInstance().manager.getTemplateManager?.();
      if (tm) {
        rendered = await tm.render(templateOrId, result);
      }
    } else {
      rendered = getCompiledBounded(templateOrId)(result);
    }
  }
  switch (responseFormat) {
    case "markdown":
      return rendered ?? result;
    case "hybrid":
      return { data: result, template: rendered ?? result };
    default:
      throw new Error(`Invalid response format: ${responseFormat}`);
  }
}

// src/core/storage/sqlite/SqliteStoreManager.ts
var import_obsidian4 = __toESM(require_obsidian_stub());
var import_path = __toESM(require("path"));

// src/core/storage/sqlite/ddl.ts
function migrateSqliteSchema(db) {
  db.exec(`
		CREATE TABLE IF NOT EXISTS index_state (
			key TEXT PRIMARY KEY,
			value TEXT
		);
		CREATE TABLE IF NOT EXISTS embedding (
			id TEXT PRIMARY KEY,
			doc_id TEXT NOT NULL,
			chunk_id TEXT,
			chunk_index INTEGER,
			chunk_type TEXT,
			content_hash TEXT NOT NULL,
			ctime INTEGER NOT NULL,
			mtime INTEGER NOT NULL,
			embedding BLOB NOT NULL,
			embedding_model TEXT NOT NULL,
			embedding_len INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_embedding_doc_id ON embedding(doc_id);
		CREATE INDEX IF NOT EXISTS idx_embedding_chunk_id ON embedding(chunk_id);
		CREATE INDEX IF NOT EXISTS idx_embedding_content_hash ON embedding(content_hash);
		CREATE TABLE IF NOT EXISTS user_profile_processed_hash (
			content_hash TEXT PRIMARY KEY,
			processed_at INTEGER NOT NULL
		);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS doc_chunk (
			chunk_id TEXT PRIMARY KEY,
			doc_id TEXT NOT NULL,
			chunk_index INTEGER NOT NULL,
			chunk_type TEXT NOT NULL DEFAULT 'body_raw',
			chunk_meta_json TEXT,
			title TEXT,
			mtime INTEGER,
			content_raw TEXT,
			content_fts_norm TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_doc_chunk_doc_id ON doc_chunk(doc_id);
		CREATE INDEX IF NOT EXISTS idx_doc_chunk_doc_id_chunk ON doc_chunk(doc_id, chunk_index);
	`);
  db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
			chunk_id UNINDEXED,
			doc_id UNINDEXED,
			content
		);
	`);
  db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts_stem USING fts5(
			chunk_id UNINDEXED,
			doc_id UNINDEXED,
			content
		);
	`);
  try {
    const cols = db.prepare?.(`PRAGMA table_info(doc_meta_fts)`)?.all();
    if (cols && cols.length > 0 && !cols.some((c) => c.name === "tags")) {
      db.exec(`DROP TABLE IF EXISTS doc_meta_fts;`);
    }
  } catch {
  }
  db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS doc_meta_fts USING fts5(
			doc_id UNINDEXED,
			path,
			title,
			tags
		);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS search_click (
			query_stems TEXT NOT NULL,
			path TEXT NOT NULL,
			rank INTEGER NOT NULL,
			ts INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_search_click_query ON search_click(query_stems);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS chat_project (
			project_id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			folder_rel_path TEXT NOT NULL UNIQUE,
			created_at_ts INTEGER NOT NULL,
			updated_at_ts INTEGER NOT NULL,
			archived_rel_path TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_project_folder_path ON chat_project(folder_rel_path);
		CREATE INDEX IF NOT EXISTS idx_chat_project_updated_at ON chat_project(updated_at_ts);
		CREATE TABLE IF NOT EXISTS chat_conversation (
			conversation_id TEXT PRIMARY KEY,
			project_id TEXT,
			title TEXT NOT NULL,
			file_rel_path TEXT NOT NULL UNIQUE,
			created_at_ts INTEGER NOT NULL,
			updated_at_ts INTEGER NOT NULL,
		active_model TEXT,
		active_provider TEXT,
		token_usage_total INTEGER,
		title_manually_edited INTEGER NOT NULL DEFAULT 0,
		title_auto_updated INTEGER NOT NULL DEFAULT 0,
		context_last_updated_ts INTEGER,
		context_last_message_index INTEGER,
		archived_rel_path TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_conversation_project_id ON chat_conversation(project_id);
		CREATE INDEX IF NOT EXISTS idx_chat_conversation_file_path ON chat_conversation(file_rel_path);
		CREATE INDEX IF NOT EXISTS idx_chat_conversation_updated_at ON chat_conversation(updated_at_ts);
		CREATE TABLE IF NOT EXISTS chat_message (
			message_id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL,
			role TEXT NOT NULL,
			content_hash TEXT,
			created_at_ts INTEGER NOT NULL,
			created_at_zone TEXT,
			model TEXT,
			provider TEXT,
			starred INTEGER NOT NULL DEFAULT 0,
			is_error INTEGER NOT NULL DEFAULT 0,
			is_visible INTEGER NOT NULL DEFAULT 1,
			gen_time_ms INTEGER,
			token_usage_json TEXT,
			thinking TEXT,
			content_preview TEXT,
			attachment_summary TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_message_conversation_id ON chat_message(conversation_id);
		CREATE INDEX IF NOT EXISTS idx_chat_message_created_at ON chat_message(created_at_ts);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS chat_message_resource (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL,
			source TEXT NOT NULL,
			kind TEXT,
			summary_note_rel_path TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_chat_message_resource_message_id ON chat_message_resource(message_id);
		CREATE TABLE IF NOT EXISTS chat_star (
			source_message_id TEXT PRIMARY KEY,
			id TEXT NOT NULL,
			conversation_id TEXT NOT NULL,
			project_id TEXT,
			created_at_ts INTEGER NOT NULL,
			active INTEGER NOT NULL DEFAULT 1
		);
		CREATE INDEX IF NOT EXISTS idx_chat_star_active ON chat_star(active);
		CREATE INDEX IF NOT EXISTS idx_chat_star_conversation_id ON chat_star(conversation_id);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS ai_analysis_record (
			id TEXT PRIMARY KEY,
			vault_rel_path TEXT NOT NULL UNIQUE,
			query TEXT,
			title TEXT,
			created_at_ts INTEGER NOT NULL,
			web_enabled INTEGER NOT NULL DEFAULT 0,
			estimated_tokens INTEGER,
			sources_count INTEGER,
			topics_count INTEGER,
			graph_nodes_count INTEGER,
			graph_edges_count INTEGER,
			duration INTEGER,
			analysis_preset TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_ai_analysis_record_created_at ON ai_analysis_record(created_at_ts);
		CREATE INDEX IF NOT EXISTS idx_ai_analysis_record_vault_path ON ai_analysis_record(vault_rel_path);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS query_pattern (
			id              TEXT PRIMARY KEY,
			template        TEXT NOT NULL,
			variables       TEXT NOT NULL,
			conditions      TEXT NOT NULL,
			source          TEXT NOT NULL,
			confidence      REAL DEFAULT 1.0,
			usage_count     INTEGER DEFAULT 0,
			discovered_at   INTEGER NOT NULL,
			last_used_at    INTEGER,
			deprecated      INTEGER DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_query_pattern_deprecated ON query_pattern(deprecated);
		CREATE INDEX IF NOT EXISTS idx_query_pattern_source ON query_pattern(source);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS mobius_node (
			node_id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			label TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			infer_created_at INTEGER,
			updated_at INTEGER NOT NULL,
			last_open_ts INTEGER,
			open_count INTEGER,
			path TEXT UNIQUE,
			title TEXT,
			size INTEGER,
			mtime INTEGER,
			ctime INTEGER,
			content_hash TEXT,
			summary TEXT,
			tags_json TEXT,
			word_count INTEGER,
			char_count INTEGER,
			language TEXT,
			richness_score REAL,
			doc_incoming_cnt INTEGER,
			doc_outgoing_cnt INTEGER,
			other_incoming_cnt INTEGER,
			other_outgoing_cnt INTEGER,
			tag_doc_count INTEGER,
			pagerank REAL,
			pagerank_updated_at INTEGER,
			pagerank_version INTEGER,
			semantic_pagerank REAL,
			semantic_pagerank_updated_at INTEGER,
			semantic_pagerank_version INTEGER,
			folder_cohesion_score REAL,
			hub_stale_since INTEGER,
			semantic_edges_version INTEGER DEFAULT 0,
			attributes_json TEXT NOT NULL DEFAULT '{}'
		);
		CREATE INDEX IF NOT EXISTS idx_mobius_node_type_node_id ON mobius_node(type, node_id);
		CREATE INDEX IF NOT EXISTS idx_mobius_node_path ON mobius_node(path);
		CREATE INDEX IF NOT EXISTS idx_mobius_node_updated_at ON mobius_node(updated_at);
		CREATE TABLE IF NOT EXISTS mobius_edge (
			id TEXT PRIMARY KEY,
			from_node_id TEXT NOT NULL,
			to_node_id TEXT NOT NULL,
			type TEXT NOT NULL,
			label TEXT,
			weight REAL NOT NULL DEFAULT 1.0,
			attributes_json TEXT NOT NULL DEFAULT '{}',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_from_type ON mobius_edge(from_node_id, type);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_to_type ON mobius_edge(to_node_id, type);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_type_to ON mobius_edge(type, to_node_id);
		CREATE INDEX IF NOT EXISTS idx_mobius_edge_from_to_type ON mobius_edge(from_node_id, to_node_id, type);
		CREATE TABLE IF NOT EXISTS mobius_operation (
			id TEXT PRIMARY KEY,
			operation_type TEXT NOT NULL,
			operation_desc TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			related_kind TEXT,
			related_id TEXT,
			important_level INTEGER,
			continuous_group_id TEXT,
			meta_json TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_mobius_operation_created_at ON mobius_operation(created_at);
		CREATE INDEX IF NOT EXISTS idx_mobius_operation_type_created_at ON mobius_operation(operation_type, created_at);
		CREATE INDEX IF NOT EXISTS idx_mobius_operation_group ON mobius_operation(continuous_group_id);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS ambient_push_log (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp        INTEGER NOT NULL,
			trigger_type     TEXT NOT NULL,
			source_file_path TEXT NOT NULL,
			context_paragraph TEXT,
			pushed_file_path TEXT NOT NULL,
			pushed_score     REAL NOT NULL,
			explanation_type TEXT NOT NULL,
			explanation_text TEXT NOT NULL,
			user_action      TEXT,
			user_action_ts   INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_ambient_push_source ON ambient_push_log(source_file_path, timestamp);
		CREATE INDEX IF NOT EXISTS idx_ambient_push_pushed ON ambient_push_log(pushed_file_path, timestamp);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS cascade_debt (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			tenant          TEXT    NOT NULL DEFAULT 'vault',
			source_path     TEXT    NOT NULL,
			target_id       TEXT    NOT NULL,
			debt_type       TEXT    NOT NULL,
			priority        INTEGER NOT NULL DEFAULT 5,
			change_magnitude REAL,
			created_at      INTEGER NOT NULL,
			processed_at    INTEGER
		);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_cascade_debt_dedup ON cascade_debt(tenant, target_id, debt_type) WHERE processed_at IS NULL;
		CREATE INDEX IF NOT EXISTS idx_cascade_debt_pending ON cascade_debt(tenant, processed_at, priority);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS vault_lint_scan (
			id             TEXT PRIMARY KEY,
			scan_type      TEXT NOT NULL,
			started_at     INTEGER NOT NULL,
			completed_at   INTEGER,
			duration_ms    INTEGER,
			total_notes    INTEGER NOT NULL,
			health_score   INTEGER,
			dim_structural INTEGER,
			dim_content    INTEGER,
			dim_temporal   INTEGER,
			dim_semantic   INTEGER,
			dim_tags       INTEGER,
			signal_counts  TEXT NOT NULL DEFAULT '{}',
			config_hash    TEXT
		);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS vault_lint_finding (
			id           TEXT PRIMARY KEY,
			scan_id      TEXT NOT NULL REFERENCES vault_lint_scan(id),
			signal_id    TEXT NOT NULL,
			severity     TEXT NOT NULL,
			file_path    TEXT,
			title        TEXT NOT NULL,
			description  TEXT,
			fix_actions  TEXT NOT NULL DEFAULT '[]',
			metadata     TEXT NOT NULL DEFAULT '{}',
			status       TEXT NOT NULL DEFAULT 'open',
			dismissed_at INTEGER,
			fixed_at     INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_lint_finding_scan ON vault_lint_finding(scan_id);
		CREATE INDEX IF NOT EXISTS idx_lint_finding_signal ON vault_lint_finding(signal_id);
		CREATE INDEX IF NOT EXISTS idx_lint_finding_status ON vault_lint_finding(status);
		CREATE INDEX IF NOT EXISTS idx_lint_finding_path ON vault_lint_finding(file_path);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS vault_lint_dismissal (
			signal_id    TEXT NOT NULL,
			file_path    TEXT NOT NULL,
			dismissed_at INTEGER NOT NULL,
			reason       TEXT,
			snooze_until INTEGER,
			PRIMARY KEY (signal_id, file_path)
		);
	`);
  db.exec(`
		CREATE TABLE IF NOT EXISTS usage_log (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id      TEXT NOT NULL,
			feature         TEXT NOT NULL,
			action          TEXT NOT NULL,
			provider        TEXT NOT NULL,
			model           TEXT NOT NULL,
			input_tokens    INTEGER NOT NULL DEFAULT 0,
			output_tokens   INTEGER NOT NULL DEFAULT 0,
			cached_tokens   INTEGER DEFAULT 0,
			reasoning_tokens INTEGER DEFAULT 0,
			cost_usd        REAL NOT NULL DEFAULT 0,
			duration_ms     INTEGER NOT NULL DEFAULT 0,
			is_streaming    INTEGER NOT NULL DEFAULT 0,
			created_at      INTEGER NOT NULL,
			metadata_json   TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON usage_log(created_at);
		CREATE INDEX IF NOT EXISTS idx_usage_log_feature ON usage_log(feature);
		CREATE INDEX IF NOT EXISTS idx_usage_log_session ON usage_log(session_id);

		CREATE TABLE IF NOT EXISTS usage_daily (
			id                     INTEGER PRIMARY KEY AUTOINCREMENT,
			date                   TEXT NOT NULL,
			feature                TEXT NOT NULL,
			action                 TEXT NOT NULL,
			provider               TEXT NOT NULL,
			model                  TEXT NOT NULL,
			call_count             INTEGER NOT NULL DEFAULT 0,
			total_input_tokens     INTEGER NOT NULL DEFAULT 0,
			total_output_tokens    INTEGER NOT NULL DEFAULT 0,
			total_cached_tokens    INTEGER NOT NULL DEFAULT 0,
			total_reasoning_tokens INTEGER NOT NULL DEFAULT 0,
			total_cost_usd         REAL NOT NULL DEFAULT 0,
			avg_duration_ms        REAL NOT NULL DEFAULT 0,
			max_duration_ms        INTEGER NOT NULL DEFAULT 0,
			UNIQUE(date, feature, action, provider, model)
		);
		CREATE INDEX IF NOT EXISTS idx_usage_daily_date ON usage_daily(date);
	`);
  try {
    db.exec("ALTER TABLE chat_message ADD COLUMN topic TEXT");
  } catch {
  }
}

// src/core/storage/sqlite/better-sqlite3-adapter/BetterSqliteStore.ts
var import_kysely = require("kysely");
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/core/storage/sqlite/NativeModuleManager.ts
var import_obsidian2 = __toESM(require_obsidian_stub());
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var zlib = __toESM(require("zlib"));
var NATIVE_DIR = "native";
var METADATA_FILE = "native-modules.json";
var BS3_DIR = "better-sqlite3";
var BS3_PINNED_VERSION = "11.10.0";
var BS3_PREBUILT_URL = (version, runtime, abi, platform, arch) => `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/better-sqlite3-v${version}-${runtime}-v${abi}-${platform}-${arch}.tar.gz`;
var BS3_NPM_URL = (version) => `https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-${version}.tgz`;
var NativeModuleManager = class _NativeModuleManager {
  constructor() {
    /** Absolute path to the plugin directory */
    this.pluginDir = "";
  }
  static {
    this.instance = null;
  }
  static getInstance() {
    if (!_NativeModuleManager.instance) {
      _NativeModuleManager.instance = new _NativeModuleManager();
    }
    return _NativeModuleManager.instance;
  }
  static clearInstance() {
    _NativeModuleManager.instance = null;
  }
  setPluginDir(pluginDir) {
    this.pluginDir = pluginDir;
  }
  // -- Paths --
  /** Root directory for managed native modules */
  get nativeDir() {
    return path.join(this.pluginDir, NATIVE_DIR);
  }
  /** Metadata JSON path */
  get metadataPath() {
    return path.join(this.nativeDir, METADATA_FILE);
  }
  /** Managed better-sqlite3 module directory */
  get bs3Dir() {
    return path.join(this.nativeDir, BS3_DIR);
  }
  // -- Public API --
  /**
   * Returns the absolute path to the managed better-sqlite3 directory,
   * or null if no managed copy exists.
   * This path can be passed to `require()` or used in `getPossiblePaths()`.
   */
  getManagedModulePath() {
    const pkgPath = path.join(this.bs3Dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      return this.bs3Dir;
    }
    return null;
  }
  /**
   * Detect the current Electron/Node runtime ABI, platform, and architecture.
   */
  detectRuntime() {
    return {
      abi: process.versions.modules,
      platform: process.platform,
      arch: process.arch
    };
  }
  /**
   * Check whether the managed binary is compatible with the current runtime.
   */
  isCompatible() {
    const metadata = this.readMetadata();
    if (!metadata?.betterSqlite3) return false;
    const runtime = this.detectRuntime();
    return metadata.betterSqlite3.abi === runtime.abi && metadata.betterSqlite3.platform === runtime.platform && metadata.betterSqlite3.arch === runtime.arch;
  }
  /**
   * Main entry point.  Ensures a compatible better-sqlite3 binary is available.
   *
   * If the managed copy is already up-to-date this is a fast no-op (one JSON read).
   * Otherwise it downloads the correct prebuilt binary (and JS wrapper if needed)
   * from GitHub / npm and installs it under {pluginDir}/native/.
   *
   * Also checks the node_modules copy — if it already works, skips the download.
   */
  async ensureCompatible() {
    if (!this.pluginDir) {
      console.warn("[NativeModuleManager] pluginDir not set, skipping");
      return;
    }
    if (this.isCompatible()) {
      return;
    }
    if (this.isNodeModulesBinaryWorking()) {
      return;
    }
    const runtime = this.detectRuntime();
    const version = this.resolveVersion();
    console.log(
      `[NativeModuleManager] Native module incompatible or missing.`,
      `Runtime: ABI=${runtime.abi} ${runtime.platform}-${runtime.arch}.`,
      `Will download better-sqlite3@${version} prebuilt.`
    );
    const notice = new import_obsidian2.Notice(
      `Peak Assistant: downloading SQLite component...`,
      0
      // persistent until dismissed
    );
    try {
      await this.setupBetterSqlite3(version, runtime);
      notice.setMessage("Peak Assistant: SQLite component ready");
      setTimeout(() => notice.hide(), 3e3);
    } catch (error) {
      notice.hide();
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[NativeModuleManager] Failed to set up better-sqlite3:", msg);
      new import_obsidian2.Notice(
        `Peak Assistant: SQLite component download failed.
Please check your network and restart Obsidian.
Or manually run: cd "${this.pluginDir}" && npm install better-sqlite3`,
        15e3
      );
    }
  }
  // -- Download & Install --
  /**
   * Full setup: download JS wrapper from npm + prebuilt binary from GitHub.
   */
  async setupBetterSqlite3(version, runtime) {
    this.ensureDir(this.nativeDir);
    this.ensureDir(this.bs3Dir);
    const jsReady = fs.existsSync(path.join(this.bs3Dir, "lib", "index.js"));
    const existingMeta = this.readMetadata();
    const versionChanged = existingMeta?.betterSqlite3?.version !== version;
    if (!jsReady || versionChanged) {
      await this.downloadAndExtractNpmPackage(version);
    }
    await this.downloadAndExtractPrebuilt(version, runtime);
    const binaryPath = path.join(this.bs3Dir, "build", "Release", "better_sqlite3.node");
    if (!this.verifyBinaryWorks(binaryPath)) {
      try {
        fs.unlinkSync(binaryPath);
      } catch {
      }
      throw new Error(
        `Downloaded binary failed verification (ABI mismatch). Runtime ABI=${runtime.abi}, but the prebuilt may have been compiled for a different version. Try: cd "${this.pluginDir}" && npx @electron/rebuild -f -w better-sqlite3`
      );
    }
    this.writeMetadata({
      betterSqlite3: {
        version,
        abi: runtime.abi,
        platform: runtime.platform,
        arch: runtime.arch,
        installedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
  /**
   * Download the npm package tarball and extract JS files to bs3Dir.
   * npm tarballs have structure: package/<files>
   */
  async downloadAndExtractNpmPackage(version) {
    const url = BS3_NPM_URL(version);
    const data = await this.downloadBuffer(url);
    const decompressed = zlib.gunzipSync(Buffer.from(data));
    const entries = parseTar(decompressed);
    const libDir = path.join(this.bs3Dir, "lib");
    if (fs.existsSync(libDir)) {
      fs.rmSync(libDir, { recursive: true, force: true });
    }
    for (const entry of entries) {
      if (!entry.name.startsWith("package/")) continue;
      const relativePath = entry.name.slice("package/".length);
      if (!relativePath.startsWith("lib/") && relativePath !== "package.json" && relativePath !== "LICENSE") {
        continue;
      }
      if (entry.type === "directory") {
        this.ensureDir(path.join(this.bs3Dir, relativePath));
        continue;
      }
      const targetPath = path.join(this.bs3Dir, relativePath);
      this.ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, entry.data);
    }
  }
  /**
   * Download the prebuilt .node binary from GitHub Releases.
   * Tries electron runtime first (correct for Obsidian), then node runtime.
   * If both fail, falls back to compiling from source via node-gyp.
   */
  async downloadAndExtractPrebuilt(version, runtime) {
    const targetDir = path.join(this.bs3Dir, "build", "Release");
    this.ensureDir(targetDir);
    const targetPath = path.join(targetDir, "better_sqlite3.node");
    for (const rt of ["electron", "node"]) {
      const url = BS3_PREBUILT_URL(version, rt, runtime.abi, runtime.platform, runtime.arch);
      try {
        const data = await this.downloadBuffer(url);
        const decompressed = zlib.gunzipSync(Buffer.from(data));
        const entries = parseTar(decompressed);
        const nodeEntry = entries.find(
          (e) => e.name.endsWith("better_sqlite3.node") && e.type === "file"
        );
        if (nodeEntry) {
          fs.writeFileSync(targetPath, nodeEntry.data);
          return;
        }
      } catch (e) {
        console.warn(`[NativeModuleManager] ${rt} prebuilt failed:`, e instanceof Error ? e.message : e);
      }
    }
    throw new Error(
      `No prebuilt binary for better-sqlite3@${version} (Electron ${process.versions.electron}, ABI=${runtime.abi}, ${runtime.platform}-${runtime.arch}). Fix: cd "${this.pluginDir}" && npm install @electron/rebuild && npx @electron/rebuild -f -w better-sqlite3`
    );
  }
  // -- Helpers --
  /**
   * Download a URL and return the raw ArrayBuffer.
   * Uses Obsidian's requestUrl which respects system proxy settings.
   */
  async downloadBuffer(url) {
    const response = await (0, import_obsidian2.requestUrl)({
      url,
      method: "GET",
      throw: true
      // throw on non-2xx
    });
    return response.arrayBuffer;
  }
  /**
   * Verify a .node binary can actually be loaded by the current runtime.
   * Tries to require() the managed module and open a :memory: DB.
   */
  verifyBinaryWorks(binaryPath) {
    try {
      const managedMainPath = path.join(this.bs3Dir, "lib", "index.js");
      for (const key in require.cache) {
        if (key.startsWith(this.bs3Dir)) {
          delete require.cache[key];
        }
      }
      const bs3 = require(managedMainPath);
      const Database = bs3.default || bs3;
      if (typeof Database !== "function") return false;
      const testDb = new Database(":memory:");
      testDb.close();
      return true;
    } catch (e) {
      console.warn("[NativeModuleManager] Binary verification failed:", e instanceof Error ? e.message : e);
      return false;
    }
  }
  /**
   * Try to load better-sqlite3 from node_modules and open a :memory: DB.
   * Returns true if it works (no ABI mismatch).
   */
  isNodeModulesBinaryWorking() {
    try {
      const bs3 = require("better-sqlite3");
      const Database = bs3.default || bs3;
      if (typeof Database !== "function") return false;
      const testDb = new Database(":memory:");
      testDb.close();
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Determine which version of better-sqlite3 to download.
   * Prefers the version from node_modules/better-sqlite3/package.json,
   * falls back to the pinned constant.
   */
  resolveVersion() {
    try {
      const nmPkg = path.join(this.pluginDir, "node_modules", "better-sqlite3", "package.json");
      if (fs.existsSync(nmPkg)) {
        const pkg = JSON.parse(fs.readFileSync(nmPkg, "utf8"));
        if (pkg.version) return pkg.version;
      }
    } catch {
    }
    return BS3_PINNED_VERSION;
  }
  readMetadata() {
    try {
      if (fs.existsSync(this.metadataPath)) {
        return JSON.parse(fs.readFileSync(this.metadataPath, "utf8"));
      }
    } catch {
    }
    return null;
  }
  writeMetadata(metadata) {
    this.ensureDir(this.nativeDir);
    fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  }
  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};
function parseTar(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    let name = readString(header, 0, 100);
    const magic = readString(header, 257, 6);
    if (magic.startsWith("ustar")) {
      const prefix = readString(header, 345, 155);
      if (prefix) {
        name = prefix + "/" + name;
      }
    }
    const sizeStr = readString(header, 124, 12).trim();
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    const typeFlag = header[156];
    const type = typeFlag === 53 ? "directory" : "file";
    offset += 512;
    const data = type === "file" && size > 0 ? Buffer.from(buffer.subarray(offset, offset + size)) : Buffer.alloc(0);
    offset += Math.ceil(size / 512) * 512;
    if (!name) continue;
    entries.push({ name, type, data });
  }
  return entries;
}
function readString(buffer, offset, length) {
  const slice = buffer.subarray(offset, offset + length);
  const nullIdx = slice.indexOf(0);
  const end = nullIdx === -1 ? length : nullIdx;
  return slice.subarray(0, end).toString("ascii");
}

// src/core/storage/sqlite/better-sqlite3-adapter/BetterSqliteStore.ts
var CustomSqliteDriver = class {
  constructor(adapter) {
    this.adapter = adapter;
  }
  async init() {
  }
  async acquireConnection() {
    return {
      executeQuery: this.executeQuery.bind(this),
      streamQuery: this.streamQuery.bind(this)
    };
  }
  async beginTransaction() {
    this.adapter.exec("BEGIN TRANSACTION");
  }
  async commitTransaction() {
    this.adapter.exec("COMMIT");
  }
  async rollbackTransaction() {
    this.adapter.exec("ROLLBACK");
  }
  async releaseConnection() {
  }
  async destroy() {
  }
  async executeQuery(compiledQuery) {
    const { sql: sql6, parameters } = compiledQuery;
    const stmt = this.adapter.prepare(sql6);
    let result;
    if (parameters && parameters.length > 0) {
      if (stmt.reader) {
        result = stmt.all(...parameters);
      } else {
        result = stmt.run(...parameters);
      }
    } else {
      if (stmt.reader) {
        result = stmt.all();
      } else {
        result = stmt.run();
      }
    }
    if (Array.isArray(result)) {
      return {
        rows: result,
        insertId: void 0,
        numAffectedRows: void 0
      };
    } else {
      return {
        rows: [],
        insertId: result.lastInsertRowid ? BigInt(result.lastInsertRowid) : void 0,
        numAffectedRows: result.changes ? BigInt(result.changes) : void 0
      };
    }
  }
  async *streamQuery(compiledQuery, chunkSize) {
    const result = await this.executeQuery(compiledQuery);
    if (result.rows && Array.isArray(result.rows)) {
      if (chunkSize && chunkSize > 0) {
        for (let i = 0; i < result.rows.length; i += chunkSize) {
          const chunk = result.rows.slice(i, i + chunkSize);
          yield { ...result, rows: chunk };
        }
      } else {
        yield result;
      }
    } else {
      yield result;
    }
  }
};
var CustomSqliteDialect = class {
  constructor(db) {
    this.db = db;
  }
  createDriver() {
    return new CustomSqliteDriver({
      exec: (sql6) => this.db.exec(sql6),
      prepare: (sql6) => this.db.prepare(sql6)
    });
  }
  createQueryCompiler() {
    return new import_kysely.SqliteQueryCompiler();
  }
  createAdapter() {
    return new import_kysely.SqliteAdapter();
  }
  createIntrospector(db) {
    return new import_kysely.SqliteIntrospector(db);
  }
};
var BetterSqliteStore = class _BetterSqliteStore {
  static {
    // Cache for better-sqlite3 module if successfully loaded
    this.cachedBetterSqlite3 = null;
  }
  /**
   * Clear the cached better-sqlite3 module.
   * Call from plugin onunload to release memory.
   */
  static clearInstance() {
    _BetterSqliteStore.cachedBetterSqlite3 = null;
    _BetterSqliteStore.nativeModuleChecked = false;
  }
  constructor(db) {
    this.db = db;
    this.kyselyInstance = new import_kysely.Kysely({
      dialect: new CustomSqliteDialect(db)
    });
  }
  static {
    /**
     * Check if better-sqlite3 is available and working.
     * 
     * Note: In Obsidian (Electron) environment, better-sqlite3 may fail to load
     * if the native module (.node file) is not compatible with Electron's Node.js version.
     * 
     * @param app - Obsidian app instance (optional, used for vault path resolution)
     * @returns Promise resolving to true if better-sqlite3 is available and working
     */
    /** Tracks whether ensureCompatible() has already run this session (avoid duplicate downloads). */
    this.nativeModuleChecked = false;
  }
  static async checkAvailable(app) {
    try {
      if (!_BetterSqliteStore.nativeModuleChecked) {
        _BetterSqliteStore.nativeModuleChecked = true;
        try {
          await NativeModuleManager.getInstance().ensureCompatible();
        } catch (e) {
          console.warn("[BetterSqliteStore] NativeModuleManager.ensureCompatible() failed:", e);
        }
      }
      let betterSqlite3;
      try {
        betterSqlite3 = require("better-sqlite3");
      } catch (requireError) {
        console.warn(
          "[BetterSqliteStore] Failed to require better-sqlite3. Trying to load from possible paths...",
          "Error message:",
          requireError.message,
          "Code:",
          requireError.code
        );
        if (requireError.code === "MODULE_NOT_FOUND") {
          const possiblePaths = _BetterSqliteStore.getPossiblePaths(app);
          for (const modulePath of possiblePaths) {
            betterSqlite3 = _BetterSqliteStore.loadFromPath(modulePath);
            if (betterSqlite3) {
              console.log(`[BetterSqliteStore] Loaded better-sqlite3 from: ${modulePath}`);
              break;
            }
          }
          if (!betterSqlite3) {
            console.warn(
              [
                "[BetterSqliteStore] better-sqlite3 is not installed or not accessible.",
                `Tried paths: ${JSON.stringify(possiblePaths)}`,
                "To use better-sqlite3:",
                "1. Navigate to: .obsidian/plugins/obsidian-peak-assistant/",
                "2. Run: npm install better-sqlite3",
                "3. Rebuild for Electron (see README.md for details)",
                "better-sqlite3 is required for this plugin."
              ].join("\n")
            );
            return false;
          }
        } else {
          return false;
        }
      }
      const Database = betterSqlite3.default || betterSqlite3;
      if (typeof Database !== "function") {
        console.warn("[BetterSqliteStore] better-sqlite3 is not a function");
        return false;
      }
      try {
        const testDb = new Database(":memory:");
        testDb.close();
        _BetterSqliteStore.cachedBetterSqlite3 = betterSqlite3;
        return true;
      } catch (error) {
        console.warn(
          `[BetterSqliteStore] better-sqlite3 module found but native binding failed. This is usually because the native module (.node file) is incompatible with Electron's Node.js version (ABI ${process.versions.modules}). NativeModuleManager should have handled this automatically. If the problem persists, try restarting Obsidian or reinstalling the plugin.`,
          error
        );
        return false;
      }
    } catch (error) {
      console.warn("[BetterSqliteStore] Unexpected error checking better-sqlite3:", error);
      return false;
    }
  }
  /**
   * Get possible paths to better-sqlite3 module.
   * Tries multiple strategies to find the plugin's node_modules directory.
   */
  static getPossiblePaths(app) {
    const paths = [];
    const managedPath = NativeModuleManager.getInstance().getManagedModulePath();
    if (managedPath) {
      paths.push(managedPath);
    }
    if (app) {
      const basePath = app.vault.adapter?.basePath;
      if (basePath) {
        paths.push(path2.join(basePath, ".obsidian", "plugins", "obsidian-peak-assistant", "node_modules", "better-sqlite3"));
      }
    }
    if (typeof process !== "undefined" && process.cwd) {
      const cwd = process.cwd();
      if (cwd && cwd !== "/") {
        paths.push(path2.join(cwd, "node_modules", "better-sqlite3"));
      }
    }
    if (typeof process !== "undefined" && process.env) {
      if (process.env.HOME) {
        paths.push(path2.join(process.env.HOME, ".obsidian", "plugins", "obsidian-peak-assistant", "node_modules", "better-sqlite3"));
      }
      if (process.env.USERPROFILE) {
        paths.push(path2.join(process.env.USERPROFILE, ".obsidian", "plugins", "obsidian-peak-assistant", "node_modules", "better-sqlite3"));
      }
    }
    return paths;
  }
  /**
   * Load better-sqlite3 from a specific path.
   * Returns the module if successful, null otherwise.
   */
  static loadFromPath(modulePath) {
    try {
      const packageJsonPath = path2.join(modulePath, "package.json");
      if (!fs2.existsSync(packageJsonPath)) {
        return null;
      }
      const packageJson = JSON.parse(fs2.readFileSync(packageJsonPath, "utf8"));
      const mainFile = packageJson.main || "index.js";
      const mainPath = path2.join(modulePath, mainFile);
      if (fs2.existsSync(mainPath)) {
        return require(mainPath);
      }
    } catch (error) {
    }
    return null;
  }
  /**
   * Dynamically load better-sqlite3 module.
   * Uses cached module if available, then normal require, then absolute path fallback.
   */
  static loadBetterSqlite3(app) {
    if (_BetterSqliteStore.cachedBetterSqlite3) {
      return _BetterSqliteStore.cachedBetterSqlite3;
    }
    try {
      const module2 = require("better-sqlite3");
      _BetterSqliteStore.cachedBetterSqlite3 = module2;
      return module2;
    } catch (requireError) {
      if (requireError.code === "MODULE_NOT_FOUND") {
        const possiblePaths = _BetterSqliteStore.getPossiblePaths(app);
        for (const modulePath of possiblePaths) {
          const betterSqlite3 = _BetterSqliteStore.loadFromPath(modulePath);
          if (betterSqlite3) {
            _BetterSqliteStore.cachedBetterSqlite3 = betterSqlite3;
            return betterSqlite3;
          }
        }
        throw new Error(
          "better-sqlite3 is not installed or not accessible. Please install it in the plugin directory: .obsidian/plugins/obsidian-peak-assistant/ Run: npm install better-sqlite3"
        );
      }
      throw requireError;
    }
  }
  /**
   * Open a new database connection.
   * 
   * @param params - Database parameters
   * @param params.dbFilePath - Path to the SQLite database file
   * @returns Promise resolving to object with store instance and sqliteVecAvailable flag
   * @throws Error if better-sqlite3 native module cannot be loaded
   */
  static async open(params) {
    const BetterSqlite3 = _BetterSqliteStore.loadBetterSqlite3(params.app);
    const Database = BetterSqlite3.default || BetterSqlite3;
    let db;
    try {
      db = new Database(params.dbFilePath, {
        // Enable WAL mode for better concurrency
        // This is the default, but we make it explicit
      });
      try {
        db.pragma("wal_checkpoint(TRUNCATE)");
      } catch (checkpointError) {
        console.warn("[BetterSqliteStore] Initial WAL checkpoint failed:", checkpointError);
      }
    } catch (error) {
      if (error instanceof Error && (error.message.includes("indexOf") || error.message.includes("bindings"))) {
        throw new Error(
          `better-sqlite3 native module failed to load. This usually means the .node file is missing or incompatible. Please ensure better-sqlite3 is properly installed in the plugin directory, Install and rebuild better-sqlite3 in the plugin directory. Original error: ${error.message}`
        );
      }
      throw error;
    }
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch (error) {
      console.warn("[BetterSqliteStore] WAL checkpoint failed (may be normal):", error);
    }
    const sqliteVecAvailable = _BetterSqliteStore.tryLoadSqliteVec(db, params.app);
    migrateSqliteSchema(db);
    return { store: new _BetterSqliteStore(db), sqliteVecAvailable };
  }
  /**
   * Finds the path to sqlite-vec extension file.
   * Tries getLoadablePath() first, then falls back to manual path resolution.
   */
  static findSqliteVecExtensionPath(sqliteVec, app) {
    if (sqliteVec.getLoadablePath && typeof sqliteVec.getLoadablePath === "function") {
      try {
        const extensionPath = sqliteVec.getLoadablePath();
        if (fs2.existsSync(extensionPath)) {
          return extensionPath;
        }
      } catch (pathError) {
      }
    }
    const platform = process.platform;
    const arch = process.arch;
    let packageName;
    let fileExt;
    if (platform === "darwin") {
      packageName = arch === "arm64" ? "sqlite-vec-darwin-arm64" : "sqlite-vec-darwin-x64";
      fileExt = "dylib";
    } else if (platform === "linux") {
      packageName = arch === "arm64" ? "sqlite-vec-linux-arm64" : "sqlite-vec-linux-x64";
      fileExt = "so";
    } else if (platform === "win32") {
      packageName = "sqlite-vec-windows-x64";
      fileExt = "dll";
    } else {
      throw new Error(`Unsupported platform: ${platform}-${arch}`);
    }
    const possiblePaths = [];
    if (app) {
      const basePath = app.vault.adapter?.basePath;
      if (basePath) {
        possiblePaths.push(
          path2.join(basePath, ".obsidian", "plugins", "obsidian-peak-assistant", "node_modules", packageName, `vec0.${fileExt}`)
        );
      }
    }
    try {
      possiblePaths.push(
        path2.join(process.cwd(), "node_modules", packageName, `vec0.${fileExt}`)
      );
    } catch {
    }
    for (const altPath of possiblePaths) {
      if (fs2.existsSync(altPath)) {
        return altPath;
      }
    }
    return null;
  }
  /**
   * Attempts to manually load sqlite-vec extension using db.loadExtension().
   */
  static tryManualLoadExtension(db, sqliteVec, app) {
    if (!db.loadExtension) {
      return false;
    }
    try {
      const extensionPath = this.findSqliteVecExtensionPath(sqliteVec, app);
      if (!extensionPath) {
        console.warn(`[BetterSqliteStore] Could not find extension file.`);
        return false;
      }
      db.loadExtension(extensionPath);
      const versionResult = db.prepare("SELECT vec_version() as version").get();
      if (versionResult) {
        return true;
      }
      return false;
    } catch (manualError) {
      console.warn(`[BetterSqliteStore] Manual loading failed: ${manualError instanceof Error ? manualError.message : String(manualError)}`);
      return false;
    }
  }
  /**
   * Try to load sqlite-vec extension for vector similarity search.
   * If loading fails, returns false but doesn't throw error.
   * This allows database to work without vector search (fulltext search still works).
   * 
   * @param db - Database instance to load extension into
   * @returns true if extension loaded successfully, false otherwise
   */
  static tryLoadSqliteVec(db, app) {
    try {
      const sqliteVec = require("sqlite-vec");
      const loadFn = sqliteVec.load || sqliteVec.default?.load;
      if (typeof loadFn !== "function") {
        console.warn(
          "[BetterSqliteStore] sqlite-vec.load function not found. Vector similarity search will not be available."
        );
        return false;
      }
      try {
        loadFn(db);
        const versionResult = db.prepare("SELECT vec_version() as version").get();
        if (versionResult) {
          return true;
        }
        console.warn("[BetterSqliteStore] sqlite-vec.load() succeeded but vec_version() failed. Extension may not be fully loaded.");
      } catch (loadError) {
        const errorMsg = loadError instanceof Error ? loadError.message : String(loadError);
        if (this.tryManualLoadExtension(db, sqliteVec, app)) {
          return true;
        }
        console.warn(
          `[BetterSqliteStore] Failed to load sqlite-vec extension. Vector similarity search will not be available. According to sqlite-vec docs, platform packages should be automatically handled. If this error persists, ensure sqlite-vec and platform-specific packages are installed. Error: ${errorMsg}. Fulltext search will still work.`
        );
      }
      return false;
    } catch (requireError) {
      if (requireError.code === "MODULE_NOT_FOUND") {
        console.warn(
          "[BetterSqliteStore] sqlite-vec extension is not installed. Vector similarity search will not be available. To enable it, install: npm install sqlite-vec"
        );
      } else {
        const errorMsg = requireError instanceof Error ? requireError.message : String(requireError);
        console.warn(
          `[BetterSqliteStore] Failed to require sqlite-vec. Vector similarity search will not be available. Error: ${errorMsg}. Fulltext search will still work.`
        );
      }
      return false;
    }
  }
  /**
   * Close the database connection and release resources.
   */
  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {
        console.warn("[BetterSqliteStore] Error closing database:", e);
      }
      this.db = null;
    }
    if (this.kyselyInstance) {
      this.kyselyInstance = null;
    }
  }
  /**
   * Check if the database is open.
   */
  isOpen() {
    return this.db !== null && this.db.open;
  }
  exec(sql6) {
    this.db.exec(sql6);
  }
  prepare(sql6) {
    return this.db.prepare(sql6);
  }
  kysely() {
    return this.kyselyInstance;
  }
  databaseType() {
    return "better-sqlite3";
  }
};

// src/core/utils/vault-utils.ts
var import_obsidian3 = __toESM(require_obsidian_stub());
function resolveApp(app) {
  return app ?? AppContext.getApp();
}
async function ensureFolderRecursive(folderPath, app) {
  const targetApp = resolveApp(app);
  const parts = folderPath.split("/").filter((p) => p.length > 0);
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let existing = targetApp.vault.getAbstractFileByPath(currentPath);
    if (!existing) {
      try {
        await targetApp.vault.createFolder(currentPath);
        console.log(`[vault-utils] Created folder: ${currentPath}`);
      } catch (error) {
        existing = targetApp.vault.getAbstractFileByPath(currentPath);
        if (existing instanceof import_obsidian3.TFolder) {
          continue;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isAlreadyExistsError = errorMessage.includes("already exist");
        if (isAlreadyExistsError) {
          existing = targetApp.vault.getAbstractFileByPath(currentPath);
          if (existing instanceof import_obsidian3.TFolder) {
            console.log(`[vault-utils] Folder already exists (caught error): ${currentPath}`);
            continue;
          }
        }
        console.error(`[vault-utils] Failed to create folder: ${currentPath}`, {
          error: errorMessage,
          isAlreadyExistsError,
          path: currentPath
        });
        throw error;
      }
    } else if (!(existing instanceof import_obsidian3.TFolder)) {
      throw new Error(`Path exists but is not a folder: ${currentPath}`);
    }
  }
}

// src/core/storage/sqlite/repositories/IndexedDocumentRepo.ts
var import_kysely2 = require("kysely");

// src/core/utils/vault-path-utils.ts
function normalizeVaultPath(path4) {
  return path4.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
function pathSegments(path4) {
  const n = normalizeVaultPath(path4);
  if (!n) return [];
  return n.split("/").filter(Boolean);
}
function parentDirPath(path4) {
  const segs = pathSegments(path4);
  if (segs.length <= 1) return "";
  return segs.slice(0, -1).join("/");
}
function pathLcaDepth(a, b) {
  const sa = pathSegments(a);
  const sb = pathSegments(b);
  let i = 0;
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) {
    i++;
  }
  return i;
}
function crossesTopLevelFolder(a, b) {
  const sa = pathSegments(a);
  const sb = pathSegments(b);
  if (!sa.length || !sb.length) return false;
  return sa[0] !== sb[0];
}

// src/core/storage/sqlite/repositories/IndexedDocumentRepo.ts
var INDEXED_NOTE_ROW_TYPES = [GraphNodeType.Document, GraphNodeType.HubDoc];
var IndexedDocumentRepo = class {
  constructor(db) {
    this.db = db;
  }
  parseDocAttrs(json) {
    try {
      return JSON.parse(json || "{}");
    } catch {
      return {};
    }
  }
  /** Merge indexed-document fields into `attributes_json` (ddl-backed document attrs). */
  buildDocumentAttributesJson(params) {
    const prev = this.parseDocAttrs(params.existingJson ?? "{}");
    const patch = {};
    for (const key of Object.keys(params)) {
      if (key === "existingJson") continue;
      if (params[key] !== void 0) patch[key] = params[key];
    }
    return JSON.stringify({ ...prev, ...patch });
  }
  /** Build {@link IndexedDocumentRecord} from a document `mobius_node` row. */
  rowToIndexedDocument(row) {
    if (!isIndexedNoteNodeType(row.type) || !row.path) return null;
    const extra = this.parseDocAttrs(row.attributes_json);
    return {
      id: row.node_id,
      path: row.path,
      type: extra.docType ?? null,
      title: row.title,
      size: row.size,
      mtime: row.mtime,
      ctime: row.ctime,
      infer_created_at: row.infer_created_at,
      content_hash: row.content_hash,
      summary: row.summary,
      full_summary: extra.full_summary ?? null,
      tags: row.tags_json,
      last_processed_at: extra.last_processed_at ?? null,
      frontmatter_json: extra.frontmatter_json ?? null
    };
  }
  docNodeQuery() {
    return this.db.selectFrom("mobius_node").where("type", "in", [...INDEXED_NOTE_ROW_TYPES]);
  }
  async existsByPath(path4) {
    const row = await this.docNodeQuery().select("node_id").where("path", "=", path4).executeTakeFirst();
    return row !== void 0;
  }
  async insert(doc) {
    const now = Date.now();
    const rowUpdatedAt = doc.row_updated_at ?? now;
    const attrs = this.buildDocumentAttributesJson({
      docType: doc.type,
      frontmatter_json: doc.frontmatter_json ?? null,
      last_processed_at: doc.last_processed_at,
      path: doc.path,
      full_summary: doc.full_summary ?? null
    });
    const graphType = doc.mobiusGraphNodeType === GraphNodeType.HubDoc ? GraphNodeType.HubDoc : GraphNodeType.Document;
    await this.db.insertInto("mobius_node").values({
      node_id: doc.id,
      type: graphType,
      label: doc.title ?? doc.path,
      created_at: now,
      infer_created_at: doc.infer_created_at ?? null,
      updated_at: rowUpdatedAt,
      last_open_ts: doc.last_open_ts ?? null,
      open_count: null,
      path: doc.path,
      title: doc.title,
      size: doc.size,
      mtime: doc.mtime,
      ctime: doc.ctime,
      content_hash: doc.content_hash,
      summary: doc.summary,
      tags_json: doc.tags,
      word_count: doc.word_count ?? null,
      char_count: doc.char_count ?? null,
      language: null,
      richness_score: null,
      doc_incoming_cnt: null,
      doc_outgoing_cnt: null,
      other_incoming_cnt: null,
      other_outgoing_cnt: null,
      tag_doc_count: null,
      pagerank: null,
      pagerank_updated_at: null,
      pagerank_version: null,
      semantic_pagerank: null,
      semantic_pagerank_updated_at: null,
      semantic_pagerank_version: null,
      folder_cohesion_score: null,
      hub_stale_since: null,
      semantic_edges_version: 0,
      attributes_json: attrs
    }).execute();
  }
  async updateById(id, updates) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).executeTakeFirst();
    if (!row) return;
    const nextAttrs = this.buildDocumentAttributesJson({
      existingJson: row.attributes_json,
      docType: updates.type,
      frontmatter_json: updates.frontmatter_json,
      last_processed_at: updates.last_processed_at,
      full_summary: updates.full_summary
    });
    const nextUpdatedAt = updates.row_updated_at !== void 0 ? updates.row_updated_at ?? Date.now() : Date.now();
    await this.db.updateTable("mobius_node").set({
      title: updates.title !== void 0 ? updates.title : row.title,
      size: updates.size !== void 0 ? updates.size : row.size,
      mtime: updates.mtime !== void 0 ? updates.mtime : row.mtime,
      ctime: updates.ctime !== void 0 ? updates.ctime : row.ctime,
      content_hash: updates.content_hash !== void 0 ? updates.content_hash : row.content_hash,
      summary: updates.summary !== void 0 ? updates.summary : row.summary,
      tags_json: updates.tags !== void 0 ? updates.tags : row.tags_json,
      label: updates.title !== void 0 ? updates.title ?? row.path ?? row.label : row.label,
      attributes_json: nextAttrs,
      updated_at: nextUpdatedAt,
      word_count: updates.word_count !== void 0 ? updates.word_count : row.word_count,
      char_count: updates.char_count !== void 0 ? updates.char_count : row.char_count,
      last_open_ts: updates.last_open_ts !== void 0 ? updates.last_open_ts : row.last_open_ts,
      infer_created_at: updates.infer_created_at !== void 0 ? updates.infer_created_at : row.infer_created_at
    }).where("node_id", "=", id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  async updatePathById(id, newPath) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).executeTakeFirst();
    if (!row) return;
    const attrs = this.buildDocumentAttributesJson({
      existingJson: row.attributes_json,
      path: newPath
    });
    const title = row.title;
    await this.db.updateTable("mobius_node").set({
      path: newPath,
      attributes_json: attrs,
      label: title ?? newPath,
      updated_at: Date.now()
    }).where("node_id", "=", id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  async upsert(doc) {
    if (!doc.id) {
      throw new Error(`doc.id is required for IndexedDocumentRepo.upsert. Path: ${doc.path}`);
    }
    const exists = await this.existsByPath(doc.path);
    if (exists) {
      await this.updateById(doc.id, {
        type: doc.type ?? null,
        title: doc.title ?? null,
        size: doc.size ?? null,
        mtime: doc.mtime ?? null,
        ctime: doc.ctime ?? null,
        content_hash: doc.content_hash ?? null,
        // Preserve LLM/indexed summary when the loader did not produce one (e.g. genCacheContent index path).
        summary: doc.summary !== void 0 && doc.summary !== null ? doc.summary : void 0,
        full_summary: doc.full_summary !== void 0 ? doc.full_summary : void 0,
        tags: doc.tags !== void 0 ? doc.tags : void 0,
        last_processed_at: doc.last_processed_at ?? null,
        frontmatter_json: doc.frontmatter_json ?? null,
        word_count: doc.word_count,
        char_count: doc.char_count,
        last_open_ts: doc.last_open_ts,
        row_updated_at: doc.row_updated_at,
        ...doc.infer_created_at !== void 0 ? { infer_created_at: doc.infer_created_at } : {}
      });
      const patch = {
        path: doc.path,
        updated_at: doc.row_updated_at ?? Date.now()
      };
      if (doc.mobiusGraphNodeType === GraphNodeType.HubDoc || doc.mobiusGraphNodeType === GraphNodeType.Document) {
        patch.type = doc.mobiusGraphNodeType;
      }
      await this.db.updateTable("mobius_node").set(patch).where("node_id", "=", doc.id).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
    } else {
      await this.insert({
        id: doc.id,
        path: doc.path,
        type: doc.type ?? null,
        title: doc.title ?? null,
        size: doc.size ?? null,
        mtime: doc.mtime ?? null,
        ctime: doc.ctime ?? null,
        content_hash: doc.content_hash ?? null,
        summary: doc.summary ?? null,
        full_summary: doc.full_summary ?? null,
        tags: doc.tags ?? null,
        last_processed_at: doc.last_processed_at ?? null,
        frontmatter_json: doc.frontmatter_json ?? null,
        word_count: doc.word_count,
        char_count: doc.char_count,
        last_open_ts: doc.last_open_ts,
        row_updated_at: doc.row_updated_at,
        infer_created_at: doc.infer_created_at,
        mobiusGraphNodeType: doc.mobiusGraphNodeType
      });
    }
  }
  async deleteByPaths(paths) {
    if (!paths.length) return;
    await this.db.deleteFrom("mobius_node").where("path", "in", paths).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  async deleteAll() {
    await this.db.deleteFrom("mobius_node").where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  async getAllIndexedPaths() {
    const rows = await this.docNodeQuery().select(["path", "mtime"]).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (!row.path) continue;
      result.set(row.path, row.mtime ?? 0);
    }
    return result;
  }
  async getIndexedPathsBatch(offset, limit) {
    const rows = await this.docNodeQuery().select(["path", "mtime"]).offset(offset).limit(limit).execute();
    return rows.filter((row) => row.path != null).map((row) => ({
      path: row.path,
      mtime: row.mtime ?? 0
    }));
  }
  async batchCheckIndexed(paths) {
    if (!paths.length) return /* @__PURE__ */ new Map();
    const rows = await this.docNodeQuery().select(["path", "mtime", "content_hash"]).where("path", "in", paths).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (!row.path) continue;
      result.set(row.path, {
        mtime: row.mtime ?? 0,
        content_hash: row.content_hash ?? null
      });
    }
    return result;
  }
  async getByPath(path4) {
    const row = await this.docNodeQuery().selectAll().where("path", "=", path4).executeTakeFirst();
    return row ? this.rowToIndexedDocument(row) : null;
  }
  async getByPaths(paths) {
    if (!paths.length) return /* @__PURE__ */ new Map();
    const rows = await this.docNodeQuery().selectAll().where("path", "in", paths).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const dm = this.rowToIndexedDocument(row);
      if (dm) result.set(dm.path, dm);
    }
    return result;
  }
  async getIdsByPaths(paths) {
    if (!paths.length) return [];
    const rows = await this.docNodeQuery().select(["node_id", "path"]).where("path", "in", paths).execute();
    return rows.filter((row) => row.path != null).map((row) => ({ id: row.node_id, path: row.path }));
  }
  async getIdsByFolderPath(folderPath) {
    if (folderPath === "") return [];
    const rows = await this.docNodeQuery().select(["node_id", "path"]).where(
      (eb) => eb.or([eb("path", "like", `${folderPath}/%`), eb("path", "=", folderPath)])
    ).execute();
    return rows.filter((row) => row.path != null).map((row) => ({ id: row.node_id, path: row.path }));
  }
  /**
   * Counts indexed notes located directly under the folder (one path segment below), excluding notes in subfolders.
   */
  async countDirectDocumentsInFolder(folderPath) {
    const p = normalizeVaultPath(folderPath);
    if (!p) return 0;
    const row = await this.docNodeQuery().select(({ fn }) => fn.countAll().as("cnt")).where("path", "like", `${p}/%`).where(import_kysely2.sql`instr(substr(path, length(${p}) + 2), '/') = 0`).executeTakeFirst();
    return Number(row?.cnt ?? 0);
  }
  async getIdsByPathPrefixes(prefixes) {
    if (!prefixes.length) return [];
    const rows = await this.docNodeQuery().select(["node_id", "path"]).where(
      (eb) => eb.or(
        prefixes.map((p) => {
          const folderLike = p.endsWith("/") ? p : p + "/";
          const exact = folderLike.slice(0, -1);
          return eb.or([eb("path", "like", `${folderLike}%`), eb("path", "=", exact)]);
        })
      )
    ).execute();
    return rows.filter((row) => row.path != null).map((row) => ({ id: row.node_id, path: row.path }));
  }
  async getByIds(ids) {
    if (!ids.length) return [];
    const rows = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "in", ids).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
    return rows.map((r) => this.rowToIndexedDocument(r)).filter((m) => m != null);
  }
  async batchGetByContentHashes(contentHashes) {
    if (!contentHashes.length) return /* @__PURE__ */ new Set();
    const rows = await this.docNodeQuery().select(["content_hash"]).where("content_hash", "in", contentHashes).where("content_hash", "is not", null).execute();
    return new Set(rows.map((row) => row.content_hash).filter(Boolean));
  }
  /**
   * Merge LLM deferred-enrichment fields into `attributes_json` without touching other columns.
   */
  async mergeDocumentLlmState(docId, patch) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", docId).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).executeTakeFirst();
    if (!row) return;
    const attrs = this.buildDocumentAttributesJson({
      existingJson: row.attributes_json,
      llm_tags_source_hash: patch.llm_tags_source_hash,
      llm_summary_source_hash: patch.llm_summary_source_hash,
      llm_tags_generated_at: patch.llm_tags_generated_at,
      llm_summary_generated_at: patch.llm_summary_generated_at,
      llm_pending: patch.llm_pending,
      llm_pending_reason: patch.llm_pending_reason,
      functional_tags_status: patch.functional_tags_status
    });
    await this.db.updateTable("mobius_node").set({
      attributes_json: attrs,
      updated_at: Date.now()
    }).where("node_id", "=", docId).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  /**
   * Merge vector deferred-enrichment fields into `attributes_json` without touching other columns.
   */
  async mergeDocumentVectorState(docId, patch) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", docId).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).executeTakeFirst();
    if (!row) return;
    const attrs = this.buildDocumentAttributesJson({
      existingJson: row.attributes_json,
      vector_source_hash: patch.vector_source_hash,
      vector_generated_at: patch.vector_generated_at,
      vector_pending: patch.vector_pending,
      vector_pending_reason: patch.vector_pending_reason
    });
    await this.db.updateTable("mobius_node").set({
      attributes_json: attrs,
      updated_at: Date.now()
    }).where("node_id", "=", docId).where("type", "in", [...INDEXED_NOTE_ROW_TYPES]).execute();
  }
  /** Paths whose `attributes_json` marks `llm_pending=true`. */
  async listPathsWithPendingLlm() {
    const rows = await this.docNodeQuery().select(["path", "attributes_json"]).execute();
    const out = [];
    for (const r of rows) {
      if (!r.path || !r.attributes_json) continue;
      const attrs = this.parseDocAttrs(r.attributes_json);
      if (attrs.llm_pending === true) out.push(r.path);
    }
    return out;
  }
  /** Paths whose `attributes_json` marks `vector_pending=true`. */
  async listPathsWithPendingVector() {
    const rows = await this.docNodeQuery().select(["path", "attributes_json"]).execute();
    const out = [];
    for (const r of rows) {
      if (!r.path || !r.attributes_json) continue;
      const attrs = this.parseDocAttrs(r.attributes_json);
      if (attrs.vector_pending === true) out.push(r.path);
    }
    return out;
  }
};

// src/core/storage/sqlite/repositories/DocChunkRepo.ts
var DocChunkRepo = class {
  constructor(db, rawDb) {
    this.db = db;
    this.rawDb = rawDb;
  }
  /**
   * Delete chunks by doc_id.
   */
  async deleteByDocId(docId) {
    await this.db.deleteFrom("doc_chunk").where("doc_id", "=", docId).execute();
  }
  /**
   * Delete chunks by doc_ids (batch).
   */
  async deleteByDocIds(docIds) {
    if (!docIds.length) return;
    await this.db.deleteFrom("doc_chunk").where("doc_id", "in", docIds).execute();
  }
  /**
   * Delete all chunks.
   */
  async deleteAll() {
    await this.db.deleteFrom("doc_chunk").execute();
  }
  /**
   * Delete FTS rows by doc_id.
   */
  deleteFtsByDocId(docId) {
    const stmt = this.rawDb.prepare(`DELETE FROM doc_fts WHERE doc_id = ?`);
    stmt.run(docId);
  }
  /**
   * Delete FTS rows by doc_ids (batch).
   */
  deleteFtsByDocIds(docIds) {
    if (!docIds.length) return;
    const stmt = this.rawDb.prepare(`DELETE FROM doc_fts WHERE doc_id IN (${docIds.map(() => "?").join(",")})`);
    stmt.run(...docIds);
  }
  /**
   * Delete meta FTS row by doc_id.
   */
  deleteMetaFtsByDocId(docId) {
    const stmt = this.rawDb.prepare(`DELETE FROM doc_meta_fts WHERE doc_id = ?`);
    stmt.run(docId);
  }
  /**
   * Delete meta FTS rows by doc_ids (batch).
   */
  deleteMetaFtsByDocIds(docIds) {
    if (!docIds.length) return;
    const stmt = this.rawDb.prepare(`DELETE FROM doc_meta_fts WHERE doc_id IN (${docIds.map(() => "?").join(",")})`);
    stmt.run(...docIds);
  }
  /**
   * Delete all FTS rows.
   */
  deleteAllFts() {
    const stmt = this.rawDb.prepare(`DELETE FROM doc_fts`);
    stmt.run();
  }
  /**
   * Delete all meta FTS rows.
   */
  deleteAllMetaFts() {
    const stmt = this.rawDb.prepare(`DELETE FROM doc_meta_fts`);
    stmt.run();
  }
  /**
   * Remove orphan doc_meta_fts rows (doc_id not linked to a document mobius node).
   */
  cleanupOrphanMetaFts() {
    const ph = GRAPH_INDEXED_NOTE_NODE_TYPES.map(() => "?").join(", ");
    const stmt = this.rawDb.prepare(
      `DELETE FROM doc_meta_fts WHERE doc_id NOT IN (SELECT node_id FROM mobius_node WHERE type IN (${ph}))`
    );
    const result = stmt.run(...GRAPH_INDEXED_NOTE_NODE_TYPES);
    return result.changes;
  }
  /**
   * Remove orphan doc_fts rows (doc_id not linked to a document mobius node).
   */
  cleanupOrphanFts() {
    const ph = GRAPH_INDEXED_NOTE_NODE_TYPES.map(() => "?").join(", ");
    const stmt = this.rawDb.prepare(
      `DELETE FROM doc_fts WHERE doc_id NOT IN (SELECT node_id FROM mobius_node WHERE type IN (${ph}))`
    );
    const result = stmt.run(...GRAPH_INDEXED_NOTE_NODE_TYPES);
    return result.changes;
  }
  /**
   * Remove orphan doc_chunk rows (doc_id not linked to a document mobius node).
   */
  async cleanupOrphanChunks() {
    const result = await this.db.deleteFrom("doc_chunk").where(
      "doc_id",
      "not in",
      this.db.selectFrom("mobius_node").select("node_id").where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES])
    ).executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0);
  }
  /**
   * Insert FTS row.
   */
  /**
   * Insert FTS row for content.
   */
  insertFts(params) {
    const stmt = this.rawDb.prepare(`
			INSERT INTO doc_fts (chunk_id, doc_id, content)
			VALUES (@chunk_id, @doc_id, @content)
		`);
    stmt.run(params);
  }
  /**
   * Insert FTS row for document metadata (title/path/tags).
   * Only one row per document.
   */
  insertMetaFts(params) {
    const stmt = this.rawDb.prepare(`
			INSERT INTO doc_meta_fts (doc_id, path, title, tags)
			VALUES (@doc_id, @path, @title, @tags)
		`);
    stmt.run({ ...params, tags: params.tags ?? "" });
  }
  /**
   * Replace meta FTS row for a document (e.g. after vault rename). FTS5 has no in-place path update.
   */
  replaceMetaFts(params) {
    const del = this.rawDb.prepare(`DELETE FROM doc_meta_fts WHERE doc_id = ?`);
    del.run(params.doc_id);
    this.insertMetaFts(params);
  }
  /**
   * Check if chunk exists by chunk_id.
   */
  async existsByChunkId(chunkId) {
    const row = await this.db.selectFrom("doc_chunk").select("chunk_id").where("chunk_id", "=", chunkId).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new chunk.
   */
  async insert(chunk) {
    await this.db.insertInto("doc_chunk").values({
      chunk_id: chunk.chunk_id,
      doc_id: chunk.doc_id,
      chunk_index: chunk.chunk_index,
      chunk_type: chunk.chunk_type,
      chunk_meta_json: chunk.chunk_meta_json,
      title: chunk.title,
      mtime: chunk.mtime,
      content_raw: chunk.content_raw,
      content_fts_norm: chunk.content_fts_norm
    }).execute();
  }
  /**
   * Update existing chunk by chunk_id.
   */
  async updateByChunkId(chunkId, updates) {
    await this.db.updateTable("doc_chunk").set(updates).where("chunk_id", "=", chunkId).execute();
  }
  /**
   * Upsert chunk.
   */
  async upsertChunk(chunk) {
    const exists = await this.existsByChunkId(chunk.chunk_id);
    if (exists) {
      await this.updateByChunkId(chunk.chunk_id, {
        doc_id: chunk.doc_id,
        chunk_index: chunk.chunk_index,
        chunk_type: chunk.chunk_type,
        chunk_meta_json: chunk.chunk_meta_json,
        title: chunk.title,
        mtime: chunk.mtime,
        content_raw: chunk.content_raw,
        content_fts_norm: chunk.content_fts_norm
      });
    } else {
      await this.insert(chunk);
    }
  }
  /**
   * Chunk rows for resolving vector hits.
   */
  async getByChunkIds(chunkIds) {
    if (!chunkIds.length) return [];
    const rows = await this.db.selectFrom("doc_chunk").select(["chunk_id", "doc_id", "chunk_type", "title", "content_raw", "mtime"]).where("chunk_id", "in", chunkIds).execute();
    const map = new Map(
      rows.map((r) => [
        r.chunk_id,
        {
          ...r,
          content_raw: r.content_raw ?? ""
        }
      ])
    );
    return chunkIds.map((id) => map.get(id)).filter((x) => x != null);
  }
  /**
   * Search FTS (full-text search).
   * Returns chunk_id, doc_id, and path. Caller should fetch indexed document path/title separately to avoid JOIN.
   * 
   * @param term - Search term (normalized for FTS)
   * @param limit - Maximum number of results
   * @param scopeMode - Scope mode for filtering
   * @param scopeValue - Scope value for filtering
   */
  searchFts(term, limit, scopeMode, scopeValue, excludeFolderPrefixes) {
    let pathFilter = "";
    const pathParams = [];
    if (scopeMode === "inFile" && scopeValue?.currentFilePath) {
      pathFilter = "AND dm.path = ?";
      pathParams.push(scopeValue.currentFilePath);
    } else if (scopeMode === "inFolder" && scopeValue?.folderPath) {
      const folderPath = (scopeValue.folderPath ?? "").trim().replace(/\/+$/, "") || void 0;
      if (folderPath) {
        pathFilter = "AND (dm.path = ? OR dm.path LIKE ?)";
        pathParams.push(folderPath, `${folderPath}/%`);
      }
    }
    if (excludeFolderPrefixes?.length) {
      for (const p of excludeFolderPrefixes) {
        const folderLike = p.endsWith("/") ? p : p + "/";
        const exact = folderLike.slice(0, -1);
        pathFilter += " AND NOT (dm.path LIKE ? OR dm.path = ?)";
        pathParams.push(`${folderLike}%`, exact);
      }
    }
    const sql6 = `
			SELECT
				f.chunk_id as chunkId,
				f.doc_id as docId,
				dm.path as path,
				dm.title as title,
				f.content as content,
				bm25(doc_fts) as bm25
			FROM doc_fts f
			INNER JOIN mobius_node dm ON f.doc_id = dm.node_id AND dm.type IN ('${GraphNodeType.Document}', '${GraphNodeType.HubDoc}')
			WHERE doc_fts MATCH ?
			${pathFilter}
			ORDER BY bm25 ASC
			LIMIT ?
		`;
    const stmt = this.rawDb.prepare(sql6);
    return stmt.all(term, ...pathParams, limit);
  }
  /**
   * Search document metadata (title/path) using FTS5.
   *
   * @param term - Search term (normalized for FTS)
   * @param limit - Maximum number of results
   * @param scopeMode - Scope mode for filtering
   * @param scopeValue - Scope value for filtering
   */
  searchMetaFts(term, limit, scopeMode, scopeValue, excludeFolderPrefixes) {
    let pathFilter = "";
    const pathParams = [];
    if (scopeMode === "inFile" && scopeValue?.currentFilePath) {
      pathFilter = "AND mf.path = ?";
      pathParams.push(scopeValue.currentFilePath);
    } else if (scopeMode === "inFolder" && scopeValue?.folderPath) {
      const folderPath = (scopeValue.folderPath ?? "").trim().replace(/\/+$/, "") || void 0;
      if (folderPath) {
        pathFilter = "AND (mf.path = ? OR mf.path LIKE ?)";
        pathParams.push(folderPath, `${folderPath}/%`);
      }
    }
    if (excludeFolderPrefixes?.length) {
      for (const p of excludeFolderPrefixes) {
        const folderLike = p.endsWith("/") ? p : p + "/";
        const exact = folderLike.slice(0, -1);
        pathFilter += " AND NOT (mf.path LIKE ? OR mf.path = ?)";
        pathParams.push(`${folderLike}%`, exact);
      }
    }
    const sql6 = `
			SELECT
				mf.doc_id as docId,
				mf.path as path,
				mf.title as title,
				bm25(doc_meta_fts) as bm25
			FROM doc_meta_fts mf
			WHERE doc_meta_fts MATCH ?
			${pathFilter}
			ORDER BY bm25 ASC
			LIMIT ?
		`;
    const stmt = this.rawDb.prepare(sql6);
    return stmt.all(term, ...pathParams, limit);
  }
  /**
   * Insert a stemmed content chunk into doc_fts_stem for morphological matching.
   */
  insertFtsStem(chunkId, docId, stemmedContent) {
    this.rawDb.prepare(
      `INSERT INTO doc_fts_stem (chunk_id, doc_id, content) VALUES (?, ?, ?)`
    ).run(chunkId, docId, stemmedContent);
  }
  /**
   * Delete all stemmed FTS entries for a document.
   */
  deleteFtsStemByDocId(docId) {
    this.rawDb.prepare(`DELETE FROM doc_fts_stem WHERE doc_id = ?`).run(docId);
  }
  /**
   * Delete all stemmed FTS entries for multiple documents (batch).
   */
  deleteFtsStemByDocIds(docIds) {
    if (!docIds.length) return;
    this.rawDb.prepare(
      `DELETE FROM doc_fts_stem WHERE doc_id IN (${docIds.map(() => "?").join(",")})`
    ).run(...docIds);
  }
  /**
   * Get all unique titles from doc_meta_fts. Used by FuzzyRetriever for title token cache.
   */
  getAllMetaTitles() {
    return this.rawDb.prepare(`SELECT DISTINCT title FROM doc_meta_fts`).all();
  }
  /**
   * Search the stemmed FTS5 table. Same structure as searchFts() but targets doc_fts_stem.
   */
  searchFtsStem(term, limit = 50, scopeMode, scopeValue, excludeFolderPrefixes) {
    let pathFilter = "";
    const pathParams = [];
    if (scopeMode === "inFile" && scopeValue?.currentFilePath) {
      pathFilter = "AND dm.path = ?";
      pathParams.push(scopeValue.currentFilePath);
    } else if (scopeMode === "inFolder" && scopeValue?.folderPath) {
      const folderPath = (scopeValue.folderPath ?? "").trim().replace(/\/+$/, "") || void 0;
      if (folderPath) {
        pathFilter = "AND (dm.path = ? OR dm.path LIKE ?)";
        pathParams.push(folderPath, `${folderPath}/%`);
      }
    }
    if (excludeFolderPrefixes?.length) {
      for (const p of excludeFolderPrefixes) {
        const folderLike = p.endsWith("/") ? p : p + "/";
        const exact = folderLike.slice(0, -1);
        pathFilter += " AND NOT (dm.path LIKE ? OR dm.path = ?)";
        pathParams.push(`${folderLike}%`, exact);
      }
    }
    const sql6 = `
			SELECT
				f.chunk_id as chunkId,
				f.doc_id as docId,
				dm.path as path,
				dm.title as title,
				f.content as content,
				bm25(doc_fts_stem) as bm25
			FROM doc_fts_stem f
			INNER JOIN mobius_node dm ON f.doc_id = dm.node_id AND dm.type IN ('${GraphNodeType.Document}', '${GraphNodeType.HubDoc}')
			WHERE doc_fts_stem MATCH ?
			${pathFilter}
			ORDER BY bm25 ASC
			LIMIT ?
		`;
    const stmt = this.rawDb.prepare(sql6);
    return stmt.all(term, ...pathParams, limit);
  }
};

// src/service/search/index/chunkTypes.ts
var SEMANTIC_CHUNK_TYPE_ORDER = [
  "summary_short",
  "summary_full",
  "salient_textrank_sentence",
  "body_raw"
];
var SEMANTIC_EDGE_CHUNK_TYPE_WEIGHT = {
  summary_short: 1.25,
  summary_full: 1.15,
  salient_textrank_sentence: 1.1,
  body_raw: 1
};

// src/core/storage/sqlite/repositories/EmbeddingRepo.ts
var EmbeddingRepo = class {
  constructor(db, rawDb, indexedDocumentRepo) {
    this.db = db;
    this.rawDb = rawDb;
    this.indexedDocumentRepo = indexedDocumentRepo;
    // Cache for vec_embeddings table state (checked once on plugin startup)
    this.vecEmbeddingsTableExists = null;
    this.vecEmbeddingsTableDimension = null;
  }
  /**
   * Convert number[] to Buffer (BLOB format).
   */
  arrayToBuffer(arr) {
    const buffer = Buffer.allocUnsafe(arr.length * 4);
    for (let i = 0; i < arr.length; i++) {
      buffer.writeFloatLE(arr[i], i * 4);
    }
    return buffer;
  }
  /**
   * Convert Buffer (BLOB format) to number[].
   */
  bufferToArray(buffer) {
    const arr = [];
    for (let i = 0; i < buffer.length; i += 4) {
      arr.push(buffer.readFloatLE(i));
    }
    return arr;
  }
  /**
   * Get embedding rowids by specific file paths.
   */
  async getEmbeddingRowidsByPath(paths) {
    const docIds = (await this.indexedDocumentRepo.getIdsByPaths(paths)).map((d) => d.id);
    return this.getEmbeddingRowidsByDocIds(docIds);
  }
  /**
   * Get embedding rowids by folder path (including subfolders).
   */
  async getEmbeddingRowidsByFolder(folderPath) {
    const docIds = (await this.indexedDocumentRepo.getIdsByFolderPath(folderPath)).map((d) => d.id);
    return this.getEmbeddingRowidsByDocIds(docIds);
  }
  /**
   * Get embedding rowids for docs whose path is under any of the given folder prefixes.
   * Used for exclude-folder filtering in KNN query.
   */
  async getEmbeddingRowidsByPathPrefixes(prefixes) {
    if (!prefixes.length) return [];
    const docs = await this.indexedDocumentRepo.getIdsByPathPrefixes(prefixes);
    return this.getEmbeddingRowidsByDocIds(docs.map((d) => d.id));
  }
  /**
   * Get embedding rowids by embedding IDs.
   */
  getEmbeddingRowidsByIds(ids) {
    if (!ids.length) return [];
    const embeddingStmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding
			WHERE id IN (${ids.map(() => "?").join(",")})
		`);
    const embeddings = embeddingStmt.all(...ids);
    return embeddings.map((e) => e.rowid);
  }
  /**
   * Get embedding rowids by document IDs.
   */
  getEmbeddingRowidsByDocIds(docIds) {
    if (!docIds.length) return [];
    const embeddingStmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding
			WHERE doc_id IN (${docIds.map(() => "?").join(",")})
		`);
    const embeddings = embeddingStmt.all(...docIds);
    return embeddings.map((e) => e.rowid);
  }
  /**
   * Initialize vec_embeddings table state cache.
   * Should be called once on plugin startup to avoid frequent table checks.
   */
  initializeVecEmbeddingsTableCache() {
    const checkStmt = this.rawDb.prepare(`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='vec_embeddings'
		`);
    this.vecEmbeddingsTableExists = checkStmt.get() !== void 0;
    if (this.vecEmbeddingsTableExists) {
      this.vecEmbeddingsTableDimension = null;
    }
  }
  /**
   * Re-check vec_embeddings table state (fallback when error occurs).
   */
  recheckVecEmbeddingsTableState() {
    const checkStmt = this.rawDb.prepare(`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='vec_embeddings'
		`);
    this.vecEmbeddingsTableExists = checkStmt.get() !== void 0;
    this.vecEmbeddingsTableDimension = null;
  }
  /**
   * Recreate vec_embeddings table with new dimension.
   * This will delete all existing vector data in vec_embeddings.
   * Note: This does NOT delete embedding records from the embedding table.
   * 
   * @param dimension - New dimension for the table
   */
  recreateVecEmbeddingsTable(dimension) {
    console.warn(
      `[EmbeddingRepo] Recreating vec_embeddings table with dimension ${dimension}. All existing vector data in vec_embeddings will be lost (embedding table records are preserved).`
    );
    this.rawDb.exec(`DROP TABLE IF EXISTS vec_embeddings`);
    this.rawDb.exec(`
			CREATE VIRTUAL TABLE vec_embeddings USING vec0(
				embedding float[${dimension}]
			)
		`);
    this.vecEmbeddingsTableExists = true;
    this.vecEmbeddingsTableDimension = dimension;
  }
  /**
   * Ensure vec_embeddings table exists with correct dimension.
   * Uses cached state to avoid frequent table checks.
   * If table doesn't exist, create it with the specified dimension.
   */
  ensureVecEmbeddingsTable(dimension) {
    if (this.vecEmbeddingsTableExists === null) {
      this.initializeVecEmbeddingsTableCache();
    }
    if (!this.vecEmbeddingsTableExists) {
      this.rawDb.exec(`
				CREATE VIRTUAL TABLE vec_embeddings USING vec0(
					embedding float[${dimension}]
				)
			`);
      this.vecEmbeddingsTableExists = true;
      this.vecEmbeddingsTableDimension = dimension;
    }
  }
  /**
   * Get embedding rowid by id.
   * Returns null if not found.
   */
  getEmbeddingRowid(id) {
    const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE id = ?
		`);
    const result = stmt.get(id);
    return result?.rowid ?? null;
  }
  /**
   * Sync embedding to vec_embeddings virtual table.
   * This performs DELETE then INSERT (virtual tables don't support UPDATE).
   */
  syncToVecEmbeddings(embeddingRowid, embeddingBuffer, logContext) {
    const checkStmt = this.rawDb.prepare(`
			SELECT rowid FROM vec_embeddings WHERE rowid = CAST(? AS INTEGER)
		`);
    const existing = checkStmt.get(embeddingRowid);
    if (existing) {
      const deleteStmt = this.rawDb.prepare(`
				DELETE FROM vec_embeddings WHERE rowid = CAST(? AS INTEGER)
			`);
      deleteStmt.run(embeddingRowid);
    }
    const insertStmt = this.rawDb.prepare(`
			INSERT INTO vec_embeddings(rowid, embedding)
			VALUES (CAST(? AS INTEGER), ?)
		`);
    insertStmt.run(embeddingRowid, embeddingBuffer);
  }
  /**
   * Handle errors from syncToVecEmbeddings and retry if needed.
   */
  handleSyncError(error, embeddingRowid, embeddingBuffer, embeddingDimension) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : new Error(String(error));
    if (errorMsg.includes("no such table: vec_embeddings")) {
      this.recheckVecEmbeddingsTableState();
      if (!this.vecEmbeddingsTableExists) {
        throw new BusinessError(
          "VEC_EMBEDDINGS_TABLE_MISSING" /* VEC_EMBEDDINGS_TABLE_MISSING */,
          "vec_embeddings virtual table does not exist. This requires sqlite-vec extension to be loaded. Please ensure sqlite-vec is installed and the extension is loaded during database initialization.",
          cause
        );
      }
      this.syncToVecEmbeddings(embeddingRowid, embeddingBuffer, "retry after table missing");
      return;
    }
    if (errorMsg.includes("Dimension mismatch")) {
      const dimensionMatch = errorMsg.match(/Expected (\d+) dimensions/);
      const expectedDimension = dimensionMatch ? dimensionMatch[1] : "unknown";
      console.warn(
        `[EmbeddingRepo] Dimension mismatch detected: table expects ${expectedDimension} dimensions, but received ${embeddingDimension} dimensions. This usually happens when the embedding model was changed. Automatically recreating vec_embeddings table with correct dimension...`
      );
      this.recreateVecEmbeddingsTable(embeddingDimension);
      this.syncToVecEmbeddings(embeddingRowid, embeddingBuffer, "retry after dimension mismatch");
      return;
    }
    this.recheckVecEmbeddingsTableState();
    throw new BusinessError(
      "UNKNOWN_ERROR" /* UNKNOWN_ERROR */,
      `Failed to sync embedding to vec_embeddings: ${errorMsg}`,
      cause
    );
  }
  /**
   * Check if embedding exists by id.
   */
  async existsById(id) {
    const row = await this.db.selectFrom("embedding").select("id").where("id", "=", id).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new embedding record.
   */
  async insert(embedding) {
    const insertStmt = this.rawDb.prepare(`
			INSERT INTO embedding (
				id, doc_id, chunk_id, chunk_index, chunk_type,
				content_hash, ctime, mtime, embedding,
				embedding_model, embedding_len
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
    const result = insertStmt.run(
      embedding.id,
      embedding.doc_id,
      embedding.chunk_id,
      embedding.chunk_index,
      embedding.chunk_type ?? null,
      embedding.content_hash,
      embedding.ctime,
      embedding.mtime,
      embedding.embedding,
      embedding.embedding_model,
      embedding.embedding_len
    );
    return result.lastInsertRowid;
  }
  /**
   * Update existing embedding record by id.
   */
  async updateById(id, updates) {
    await this.db.updateTable("embedding").set(updates).where("id", "=", id).execute();
  }
  /**
   * Upsert an embedding record.
   *
   * Also syncs the embedding vector to vec_embeddings virtual table for KNN search.
   * vec_embeddings.rowid corresponds to embedding table's implicit rowid (integer).
   * This allows direct association: we get embedding.rowid after insert, then use it as vec_embeddings.rowid.
   *
   * Note: embedding table stores vectors as BLOB (binary format), while vec_embeddings virtual table
   * uses JSON format (as required by sqlite-vec vec0).
   */
  async upsert(embedding) {
    const embeddingBuffer = this.arrayToBuffer(embedding.embedding);
    const exists = await this.existsById(embedding.id);
    let embeddingRowid;
    if (exists) {
      embeddingRowid = this.getEmbeddingRowid(embedding.id);
      await this.updateById(embedding.id, {
        doc_id: embedding.doc_id,
        chunk_id: embedding.chunk_id ?? null,
        chunk_index: embedding.chunk_index ?? null,
        chunk_type: embedding.chunk_type ?? null,
        content_hash: embedding.content_hash,
        mtime: embedding.mtime,
        embedding: embeddingBuffer,
        embedding_model: embedding.embedding_model,
        embedding_len: embedding.embedding_len
      });
    } else {
      embeddingRowid = await this.insert({
        id: embedding.id,
        doc_id: embedding.doc_id,
        chunk_id: embedding.chunk_id ?? null,
        chunk_index: embedding.chunk_index ?? null,
        chunk_type: embedding.chunk_type ?? null,
        content_hash: embedding.content_hash,
        ctime: embedding.ctime,
        mtime: embedding.mtime,
        embedding: embeddingBuffer,
        embedding_model: embedding.embedding_model,
        embedding_len: embedding.embedding_len
      });
    }
    const embeddingDimension = embedding.embedding.length;
    this.ensureVecEmbeddingsTable(embeddingDimension);
    try {
      this.syncToVecEmbeddings(embeddingRowid, embeddingBuffer);
    } catch (error) {
      this.handleSyncError(error, embeddingRowid, embeddingBuffer, embeddingDimension);
    }
  }
  /**
   * Get embeddings by file ID.
   */
  async getByDocId(docId) {
    return await this.db.selectFrom("embedding").selectAll().where("doc_id", "=", docId).execute();
  }
  /**
   * Distinct document ids that have at least one embedding row (batch semantic neighbor jobs).
   */
  async listDistinctDocIdsWithEmbeddings() {
    const rows = await this.db.selectFrom("embedding").select("doc_id").groupBy("doc_id").execute();
    return rows.map((r) => r.doc_id);
  }
  /**
   * Get embeddings by IDs (batch).
   * Used to fetch embedding records by their primary key (id).
   * Returns embedding as Buffer (BLOB format).
   */
  async getByIds(ids) {
    if (!ids.length) return [];
    const rows = await this.db.selectFrom("embedding").select(["id", "doc_id", "chunk_id", "chunk_type", "embedding"]).where("id", "in", ids).execute();
    return rows.map((r) => ({
      id: r.id,
      doc_id: r.doc_id,
      chunk_id: r.chunk_id ?? null,
      chunk_type: r.chunk_type ?? null,
      embedding: r.embedding
    }));
  }
  async searchSimilarAndGetId(queryEmbedding, limit, scopeMode, scopeValue, excludeFolderPrefixes) {
    const searchResults = await this.searchSimilar(queryEmbedding, limit, scopeMode, scopeValue, excludeFolderPrefixes);
    if (!searchResults.length) {
      return [];
    }
    const distanceMap = /* @__PURE__ */ new Map();
    for (const result of searchResults) {
      distanceMap.set(result.embedding_id, result.distance);
    }
    const embeddingRows = await this.getByIds(searchResults.map((r) => r.embedding_id));
    return embeddingRows.map((row) => {
      const embeddingId = row.id;
      const distance = distanceMap.get(embeddingId) ?? Number.MAX_SAFE_INTEGER;
      return {
        ...row,
        distance,
        // Convert distance to similarity score: 1 / (1 + distance)
        similarity: 1 / (1 + distance)
      };
    });
  }
  /**
   * Vector similarity search using sqlite-vec KNN search.
   * 
   * This uses the vec0 virtual table with MATCH operator for efficient KNN search
   * without loading all embeddings into memory.
   * 
   * Explanation of rowid:
   * - `rowid` is SQLite's implicit integer primary key for each table
   * - vec_embeddings.rowid = embedding.rowid (they share the same rowid)
   * - This allows direct association: we can use vec_embeddings.rowid to query embedding table
   * 
   * Why do we need vec_embeddings virtual table?
   * - sqlite-vec requires a vec0 virtual table for KNN search (it provides optimized vector indexing)
   * - vec_embeddings stores vectors as native float[] format for efficient KNN search
   * - Both embedding table and vec_embeddings use BLOB format (binary float[]) for efficiency
   * 
   * @param queryEmbedding The query embedding vector (as number[] or Buffer)
   * @param limit Maximum number of results to return
   * @param scopeMode Optional scope mode for filtering
   * @param scopeValue Optional scope value for filtering
   * @returns Array of results with embedding_id (from embedding table) and distance
   */
  async searchSimilar(queryEmbedding, limit, scopeMode, scopeValue, excludeFolderPrefixes) {
    const checkStmt = this.rawDb.prepare(`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='vec_embeddings'
		`);
    const result = checkStmt.get();
    if (!result) {
      throw new BusinessError(
        "VEC_EMBEDDINGS_TABLE_MISSING" /* VEC_EMBEDDINGS_TABLE_MISSING */,
        "vec_embeddings virtual table does not exist. Vector similarity search requires sqlite-vec extension. Please ensure sqlite-vec is installed (npm install sqlite-vec) and the extension is loaded during database initialization."
      );
    }
    const embeddingBuffer = Buffer.isBuffer(queryEmbedding) ? queryEmbedding : this.arrayToBuffer(queryEmbedding);
    let scopedRowids = null;
    if (scopeMode === "inFile" && scopeValue?.currentFilePath) {
      scopedRowids = await this.getEmbeddingRowidsByPath([scopeValue.currentFilePath]);
    } else if (scopeMode === "inFolder" && scopeValue?.folderPath) {
      const folderPath = (scopeValue.folderPath ?? "").trim().replace(/\/+$/, "") || void 0;
      if (folderPath) {
        scopedRowids = await this.getEmbeddingRowidsByFolder(folderPath);
      }
    } else if (scopeMode === "limitIdsSet" && scopeValue?.limitIdsSet) {
      scopedRowids = this.getEmbeddingRowidsByIds(Array.from(scopeValue.limitIdsSet));
    }
    let excludeRowids = [];
    if (scopeMode === "excludeDocIdsSet" && scopeValue?.excludeDocIdsSet && scopeValue.excludeDocIdsSet.size > 0) {
      excludeRowids = this.getEmbeddingRowidsByDocIds(Array.from(scopeValue.excludeDocIdsSet));
    }
    if (excludeFolderPrefixes?.length) {
      const prefixRowids = await this.getEmbeddingRowidsByPathPrefixes(excludeFolderPrefixes);
      excludeRowids = [...excludeRowids, ...prefixRowids];
    }
    let rowidFilter = "";
    if (scopedRowids && scopedRowids.length > 0) {
      rowidFilter = `AND ve.rowid IN (${scopedRowids.map(() => "?").join(",")})`;
    }
    if (excludeRowids.length > 0) {
      rowidFilter += ` AND ve.rowid NOT IN (${excludeRowids.map(() => "?").join(",")})`;
    }
    let sql6;
    let knnParams;
    sql6 = `
			SELECT
				ve.rowid,
				ve.distance
			FROM vec_embeddings ve
			WHERE ve.embedding MATCH ?
				AND k = ?
				${rowidFilter}
			ORDER BY ve.distance
		`;
    knnParams = [embeddingBuffer, limit];
    if (scopedRowids && scopedRowids.length > 0) {
      knnParams.push(...scopedRowids);
    }
    if (excludeRowids.length > 0) {
      knnParams.push(...excludeRowids);
    }
    const knnStmt = this.rawDb.prepare(sql6);
    const knnResults = knnStmt.all(...knnParams);
    if (!knnResults.length) {
      return [];
    }
    const rowids = knnResults.map((r) => r.rowid);
    const embeddingSql = `
			SELECT rowid, id FROM embedding
			WHERE rowid IN (${rowids.map(() => "?").join(",")})
		`;
    const embeddingStmt = this.rawDb.prepare(embeddingSql);
    const embeddings = embeddingStmt.all(...rowids);
    const rowidToEmbeddingId = new Map(embeddings.map((e) => [e.rowid, e.id]));
    return knnResults.map((r) => {
      const embeddingId = rowidToEmbeddingId.get(r.rowid);
      return embeddingId ? {
        embedding_id: embeddingId,
        distance: r.distance
      } : null;
    }).filter((r) => r !== null);
  }
  /**
   * Delete embeddings and their corresponding vec_embeddings records by rowids.
   * This is a private helper method that ensures both tables stay in sync.
   */
  async deleteEmbeddingsAndVecEmbeddingsByRowids(rowids) {
    if (!rowids.length) return;
    const placeholders = rowids.map(() => "?").join(",");
    const deleteEmbeddingStmt = this.rawDb.prepare(`
			DELETE FROM embedding WHERE rowid IN (${placeholders})
		`);
    deleteEmbeddingStmt.run(...rowids);
    if (this.vecEmbeddingsTableExists) {
      const deleteVecStmt = this.rawDb.prepare(`
				DELETE FROM vec_embeddings WHERE rowid IN (${placeholders})
			`);
      deleteVecStmt.run(...rowids);
    }
  }
  /**
   * Delete embeddings by doc IDs (batch).
   */
  async deleteByDocIds(docIds) {
    if (!docIds.length) return;
    const placeholders = docIds.map(() => "?").join(",");
    const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE doc_id IN (${placeholders})
		`);
    const rows = stmt.all(...docIds);
    if (rows.length > 0) {
      const rowids = rows.map((r) => r.rowid);
      await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
    }
  }
  /**
   * Remove orphan embedding rows (doc_id not linked to a document mobius node).
   */
  async cleanupOrphanEmbeddings() {
    const ph = GRAPH_INDEXED_NOTE_NODE_TYPES.map(() => "?").join(", ");
    const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding WHERE doc_id NOT IN (SELECT node_id FROM mobius_node WHERE type IN (${ph}))
		`);
    const rows = stmt.all(...GRAPH_INDEXED_NOTE_NODE_TYPES);
    if (rows.length > 0) {
      const rowids = rows.map((r) => r.rowid);
      await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
    }
    return rows.length;
  }
  /**
   * Delete all embeddings.
   */
  async deleteAll() {
    const stmt = this.rawDb.prepare(`
			SELECT rowid FROM embedding
		`);
    const rows = stmt.all();
    if (rows.length > 0) {
      const rowids = rows.map((r) => r.rowid);
      await this.deleteEmbeddingsAndVecEmbeddingsByRowids(rowids);
    }
  }
  /**
   * Computes the global mean semantic embedding vector for a document (Global Mean Pooling).
   * Feature code should use {@link getEmbeddingForSemanticSearch} for doc-level KNN; this is a fallback
   * when no prioritized typed chunk has an embedding.
   *
   * [Mathematical Principle & Representational Power]
   * This method operates under the "semantic centroid" assumption: in vector space, the arithmetic mean of a set of vectors represents their geometric centroid.
   * When a document's theme is highly coherent (such as a single-topic technical doc or focused essay), this mean vector effectively captures and compresses the document's essential theme,
   * providing a single, summary-level vector fingerprint for the document.
   *
   * [Semantic Dilution Risk]
   * For long or heterogeneous documents containing multiple unrelated semantic centers, averaging can cause "semantic collapse."
   * The resulting mean vector may fall in a region of vector space that doesn't exist in reality, significantly reducing retrieval accuracy.
   *   Common failure cases:
   *   1. Extreme topic shifts: If the first half discusses "pasta recipes" and the second half "Java multithreading," the mean vector drifts to a noisy space 
   *      that represents neither cooking nor programming, causing both keyword searches to miss.
   *   2. Localized key info: In a 5000-word annual report with only a short mention of "company layoffs," the mean dilutes this signal among ordinary content, 
   *      masking critical features.
   *   3. Contradictory semantics: Discussing both "extreme heat" and "extreme cold" may yield a mean vector closer to "moderate climate," losing the extremes.
   *
   * [Optimization Suggestions] todo implement
   * 1. Head-Chunk pooling: For overly long documents, compute average on the first N chunks (where title/intro often concentrates core context).
   * 2. Salience weighting: Use chunk position or IDF to weight the mean.
   * 3. Multi-center representation: For long/heterogeneous docs, store multiple cluster centroids or raw chunk embeddings instead of a single mean.
   *
   * @param docId - Unique document identifier
   * @returns High-dimensional vector (number[]) representing the document's global semantics, or null if none found
   */
  async getAverageEmbeddingForDoc(docId) {
    const embeddings = await this.getByDocId(docId);
    if (!embeddings.length) {
      return null;
    }
    const embeddingDim = embeddings[0].embedding_len;
    const averageVector = new Array(embeddingDim).fill(0);
    for (const embedding of embeddings) {
      const buffer = embedding.embedding;
      for (let i = 0; i < buffer.length; i += 4) {
        const floatValue = buffer.readFloatLE(i);
        averageVector[i / 4] += floatValue;
      }
    }
    for (let i = 0; i < averageVector.length; i++) {
      averageVector[i] /= embeddings.length;
    }
    return averageVector;
  }
  /**
   * **Single entry point** for doc-level semantic retrieval (KNN, inspector neighbors, path/grouping,
   * batch semantic edges). Call sites must not pick chunks via {@link getByDocId} for query vectors.
   *
   * Priority (first embedding found wins): `summary_short` → `summary_full` →
   * `salient_textrank_sentence` → `body_raw` (see {@link SEMANTIC_CHUNK_TYPE_ORDER}).
   * If none of those carry a vector, falls back to {@link getAverageEmbeddingForDoc} (mean of all chunks).
   */
  async getEmbeddingForSemanticSearch(docId) {
    const rows = await this.getByDocId(docId);
    if (!rows.length) return null;
    const byType = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const t = r.chunk_type ?? "body_raw";
      const arr = byType.get(t) ?? [];
      arr.push(r);
      byType.set(t, arr);
    }
    for (const t of SEMANTIC_CHUNK_TYPE_ORDER) {
      const list = byType.get(t);
      const first = list?.find((x) => x.embedding);
      if (first?.embedding) {
        return this.bufferToArray(first.embedding);
      }
    }
    return this.getAverageEmbeddingForDoc(docId);
  }
  /**
   * Clean up orphaned vec_embeddings records that exist in vec_embeddings table
   * but not in embedding table. This fixes data inconsistency issues.
   *
   * @returns Object with cleanup statistics: { found: number, deleted: number }
   */
  async cleanupOrphanedVecEmbeddings() {
    let found = 0;
    let deleted = 0;
    try {
      const checkStmt = this.rawDb.prepare(`
				SELECT name FROM sqlite_master
				WHERE type='table' AND name='vec_embeddings'
			`);
      const tableExists = checkStmt.get() !== void 0;
      if (!tableExists) {
        return { found: 0, deleted: 0 };
      }
      const orphanedStmt = this.rawDb.prepare(`
				SELECT ve.rowid
				FROM vec_embeddings ve
				LEFT JOIN embedding e ON ve.rowid = e.rowid
				WHERE e.rowid IS NULL
			`);
      const orphanedRecords = orphanedStmt.all();
      found = orphanedRecords.length;
      if (found === 0) {
        return { found: 0, deleted: 0 };
      }
      const rowids = orphanedRecords.map((r) => r.rowid);
      const placeholders = rowids.map(() => "?").join(",");
      const deleteStmt = this.rawDb.prepare(`
				DELETE FROM vec_embeddings WHERE rowid IN (${placeholders})
			`);
      deleteStmt.run(...rowids);
      deleted = rowids.length;
    } catch (error) {
      console.error("[EmbeddingRepo] Error during cleanup:", error);
      throw error;
    }
    return { found, deleted };
  }
};

// src/core/storage/sqlite/repositories/IndexStateRepo.ts
var IndexStateRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Check if index state exists by key.
   */
  async existsByKey(key) {
    const row = await this.db.selectFrom("index_state").select("key").where("key", "=", key).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new index state.
   */
  async insert(state) {
    await this.db.insertInto("index_state").values(state).execute();
  }
  /**
   * Update existing index state by key.
   */
  async updateByKey(key, value) {
    await this.db.updateTable("index_state").set({ value }).where("key", "=", key).execute();
  }
  async get(key) {
    const row = await this.db.selectFrom("index_state").select(["value"]).where("key", "=", key).executeTakeFirst();
    return row?.value != null ? String(row.value) : null;
  }
  async set(key, value) {
    const exists = await this.existsByKey(key);
    if (exists) {
      await this.updateByKey(key, value);
    } else {
      await this.insert({ key, value });
    }
  }
  /**
   * Clear all index state entries.
   */
  async clearAll() {
    await this.db.deleteFrom("index_state").execute();
  }
};

// src/core/storage/sqlite/repositories/MobiusNodeRepo.ts
var import_kysely3 = require("kysely");

// src/core/constant.ts
var VAULT_DB_FILENAME = "vault.sqlite";
var CHAT_DB_FILENAME = "chat.sqlite";
var INDEX_STATE_KEYS = {
  builtAt: "index_built_at",
  indexedDocs: "indexed_docs"
};
var MOBIUS_MAINTENANCE_STATE_KEYS = {
  dirtyScore: "mobius_maintenance_dirty_score",
  needed: "mobius_maintenance_needed",
  lastFullAt: "mobius_maintenance_last_full_at"
};
var MOBIUS_MAINTENANCE_DEBT_INDEX_DOC = 1;
var MOBIUS_MAINTENANCE_DEBT_PER_DELETE = 2;
var MOBIUS_MAINTENANCE_DEBT_RENAME = 1;
var MOBIUS_MAINTENANCE_DIRTY_THRESHOLD = 30;
var CASCADE_DEBT_SEMANTIC_EDGE_PRIORITY = 1;
var CASCADE_DEBT_DEGREE_REFRESH_PRIORITY = 2;
var CASCADE_DEBT_MERMAID_OVERLAY_PRIORITY = 3;
var INDEX_FRONTMATTER_KEYS = {
  updatedAt: "updated_at",
  updated: "updated",
  createdAt: "created_at",
  created: "created"
};
var LLM_PENDING_ENRICH_CONCURRENCY = 12;
var HUB_DISCOVER_LIMIT_MIN = 40;
var HUB_DISCOVER_LIMIT_MAX = 320;
var HUB_DISCOVER_LIMIT_SQRT_SCALE = 5;
var DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS = {
  incoming: 0.045,
  outgoing: 0.048
};
var FOLDER_HUB_MIN_DOCS = 4;
var FOLDER_HUB_STATS_DOC_PAGE_SIZE = 200;
var FOLDER_HUB_GRAPH_WEIGHT_PHYSICAL = 0.25;
var FOLDER_HUB_GRAPH_WEIGHT_ORGANIZATIONAL = 0.35;
var FOLDER_HUB_GRAPH_WEIGHT_SEMANTIC = 0.15;
var FOLDER_HUB_GRAPH_WEIGHT_COHESION = 0.25;
var FOLDER_HUB_COHESION_SIZE_REF_DOC_COUNT = 12;
var FOLDER_HUB_BOUNDARY_EDGE_BATCH_SIZE = 800;
var INDEX_LONG_RANGE_LCA_MAX_DEPTH = 1;
var PAGERANK_ALGORITHM_VERSION = 1;
var SEMANTIC_PAGERANK_ALGORITHM_VERSION = 1;
var PAGERANK_EDGE_BATCH_SIZE = 5e3;
var RRF_K = 60;
var GRAPH_RRF_WEIGHTS = {
  // Connection density (how well connected a node is)
  density: 1,
  // Update time (how recently the node was modified)
  updateTime: 1.2,
  // Slightly higher weight for recency
  // Richness score (content quality indicator)
  richness: 0.8,
  // Open count (how often the user accesses this node)
  openCount: 0.9,
  // Last open time (how recently the user accessed this node)
  lastOpen: 0.7,
  // Similarity score (only for semantic neighbors, measures semantic closeness)
  similarity: 1.1
  // Higher weight for semantic relevance in BFS traversal
};
var PHYSICAL_CONNECTION_BONUS = 0.1;
var PATH_FINDING_CONSTANTS = {
  /**
   * Default number of iterations for hybrid path discovery.
   * Balances diversity and computational cost.
   * - 1st iteration: Finds most direct path
   * - 2nd iteration: Discovers one alternative path
   * - 3rd iteration: Provides additional exploration perspective
   */
  DEFAULT_ITERATIONS: 5,
  /**
   * Maximum hop limit to prevent semantic drift.
   * Limits path length to maintain result relevance and prevent excessive computation.
   */
  MAX_HOPS_LIMIT: 5
};
var GRAPH_TRAVERSAL_EDGES_PER_NODE = 50;
var GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY = [3, 1];
var ORPHAN_FETCH_LIMIT = 200;
var EXPLORE_FOLDER_DEFAULT_LIMIT = 50;
var KEY_NODES_RRF_K = 60;
var GRAPH_INSPECT_STEP_TIME_LIMIT = 1e4;
var RRF_RANKING_POOL_SIZE = 500;
var VAULT_DESCRIPTION_FILENAME = "vault-description.md";
var GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT = 50;
var SLICE_CAPS = {
  indexing: {
    structuredChunkTop: 8
  },
  semanticEdges: {
    mermaidSafeLabel: 56,
    items: 14,
    nodeIdFallbackLabel: 12
  },
  aiSearch: {
    graphNodeLabels: 20,
    topicSources: 5,
    topicGraphLabels: 20,
    topicResults: 10
  },
  vaultDoc: {
    aiSearchAnalysisGraphNodes: 40,
    aiSearchAnalysisGraphEdges: 80
  },
  sqlite: {
    operationDescription: 500
  },
  utils: {
    logExpressionPreview: 80,
    chunkSlugFallback: 24,
    mermaidQuotedLabel: 80
  },
  modelId: {
    openaiPrefixSegments: 2,
    claudePrefixSegments: 3
  },
  date: {
    /** `toISOString().slice(0, n)` for `YYYY-MM-DD`. */
    isoDateChars: 10
  },
  /** Cumulative end indices for MD5 hex → UUID-style `8-4-4-4-12` grouping. */
  hash: {
    md5UuidSliceEnds: [8, 12, 16, 20, 32]
  },
  agent: {
    sourcePathsSample: 30,
    claimKey: 80,
    tacticalSummary: 400,
    dimensionIntent: 80,
    groupFocus: 200,
    sharedContext: 300,
    evidencePaths: 12,
    extractionTasks: 30,
    extractionFocus: 120,
    slotRecallDimensions: 10,
    summaryFacts: 500,
    docSimpleTitle: 80,
    suggestQuestions: 2,
    dashboardBlocks: 10,
    reportPlanMarkdown: 200
  },
  highlight: {
    fallbackShort: 200,
    fallbackLong: 220
  },
  inspector: {
    exploreFolderPaths: 2e3,
    pathFindQueueLevel: 5,
    pathFindHubs: 3,
    pathFindCommonParents: 3
  },
  searchWeb: {
    snippetShort: 200,
    snippetLong: 300
  },
  chat: {
    sourcesList: 10
  },
  graphViz: {
    candidatePathsToolbar: 30,
    candidatePathsPanel: 20,
    formatItems: 80,
    formatDocs: 80,
    formatEdges: 120,
    formatNodes: 60,
    debugTouchSample: 3,
    graphPatchFocus: 8,
    shortestPathNeighbors: 6,
    shortestPathDebugIds: 10
  },
  ui: {
    promptOptions: 20,
    resourcePreviewLines: 10,
    followupMarkdown: 300,
    followupAnswer: 200,
    tabSearchLabel: 48,
    saveAnalyzeMd: 120,
    knowledgeGraphItems: 120,
    searchPipelineBlocks: 12,
    sourcesSummaries: 3,
    sourcesFacts: 8,
    topicMenuSources: 6,
    analysisTitleSanitize: 80,
    analysisTitlePath: 200,
    analysisSearchText: 300,
    analysisSummary: 500,
    analysisSummaryInSearch: 400,
    analysisGraphNodes: 8,
    analysisSourcesSummary: 6,
    analysisBlocksSummary: 5,
    analysisNodeLabels: 30,
    analysisItemsPreview: 5,
    analysisBlockMarkdown: 200,
    analysisSourcesList: 10,
    analysisDisplayTitle: 48,
    analysisDisplayTitleTrim: 60
  },
  mocks: {
    mockTitle: 45,
    mockQuery: 50,
    mockQueryShort: 30,
    mockAIServiceSummary: 300,
    mockAIServiceTitle: 40
  },
  build: {
    esbuildLogInputs: 50
  }
};

// src/core/storage/sqlite/repositories/folderIntuitionMobius.ts
var MOBIUS_FOLDER_INTUITION = {
  ONE_LINER: "intuition_one_liner",
  TYPICAL_QUESTIONS: "intuition_typical_questions",
  NAVIGATION_HINTS: "intuition_navigation_hints",
  TOP_TAGS: "intuition_top_tags",
  TOP_KEYWORDS: "intuition_top_keywords",
  BACKBONE_NEIGHBORS: "intuition_backbone_neighbors",
  UPDATED_AT: "intuition_updated_at"
};
function safeStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string");
}
function safeParseAttrs(raw) {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}
function parseFolderIntuitionFromMobiusFolderRow(row) {
  const folderPath = (row.path ?? "").trim();
  if (!folderPath) return null;
  const attrs = safeParseAttrs(row.attributes_json);
  const fromAttr = typeof attrs[MOBIUS_FOLDER_INTUITION.ONE_LINER] === "string" ? attrs[MOBIUS_FOLDER_INTUITION.ONE_LINER] : "";
  const summary = typeof row.summary === "string" ? row.summary : "";
  const oneLiner = String(fromAttr).trim() || summary.trim() || folderPath;
  const intuitionTs = attrs[MOBIUS_FOLDER_INTUITION.UPDATED_AT];
  const updatedAt = typeof intuitionTs === "number" && Number.isFinite(intuitionTs) ? Math.floor(intuitionTs) : row.updated_at;
  return {
    folderPath,
    oneLiner,
    typicalQuestions: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.TYPICAL_QUESTIONS]),
    navigationHints: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.NAVIGATION_HINTS]),
    topicPurity: row.folder_cohesion_score,
    docCount: Math.max(0, Math.floor(Number(row.tag_doc_count ?? 0))),
    hubRank: row.pagerank,
    topTags: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.TOP_TAGS]),
    topKeywords: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.TOP_KEYWORDS]),
    backboneNeighbors: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.BACKBONE_NEIGHBORS]),
    updatedAt
  };
}

// src/core/storage/sqlite/repositories/MobiusNodeRepo.ts
var MobiusNodeRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * One **SQL page** of `node_id` values (not a full-table load).
   * Query shape: `WHERE type IN (…) AND node_id > cursor ORDER BY node_id LIMIT pageSize`.
   * Callers implement pagination by passing `afterNodeId = last id from the previous page` until this returns `[]`.
   */
  async listNodeIdsByTypesKeyset(types, afterNodeId, limit) {
    const typeList = [...types];
    let q = this.db.selectFrom("mobius_node").select("node_id").where("type", "in", typeList).orderBy("node_id").limit(limit);
    if (afterNodeId != null && afterNodeId !== "") {
      q = q.where("node_id", ">", afterNodeId);
    }
    const rows = await q.execute();
    return rows.map((r) => r.node_id);
  }
  /**
   * Iterates all `mobius_node` rows matching `types` using keyset pagination (`listNodeIdsByTypesKeyset` in a loop).
   * @param betweenPages Optional hook after each page (e.g. yield to the event loop).
   */
  async forEachNodeIdsByTypesKeyset(types, pageSize, onPage, betweenPages) {
    let afterNodeId = null;
    let pageIndex = 0;
    for (; ; ) {
      const ids = await this.listNodeIdsByTypesKeyset(types, afterNodeId, pageSize);
      if (!ids.length) break;
      await onPage(ids, pageIndex++);
      afterNodeId = ids[ids.length - 1];
      await betweenPages?.();
    }
  }
  /** All `document` / `hub_doc` node ids (vault PageRank vertex set). */
  async listAllDocLikeNodeIds() {
    const rows = await this.db.selectFrom("mobius_node").select("node_id").where("type", "in", [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]).execute();
    return rows.map((r) => r.node_id);
  }
  /**
   * Vertex ids for semantic PageRank (same doc-like set as reference PageRank).
   */
  async listDocLikeSemanticPageRankVertices() {
    return this.listAllDocLikeNodeIds();
  }
  /**
   * Document-like rows with cached `doc_outgoing_cnt` (wiki references to doc-like targets).
   * Call after degree refresh so counts match the `references` subgraph used by streaming PageRank.
   */
  async listDocLikePageRankVertices() {
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "doc_outgoing_cnt"]).where("type", "in", [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]).execute();
    return rows.map((r) => ({
      node_id: r.node_id,
      doc_outgoing_cnt: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0)))
    }));
  }
  /**
   * Merges keys into `attributes_json` for an indexed note row without dropping existing fields.
   */
  async mergeJsonAttributesForIndexedNoteNode(nodeId, merge, now = Date.now()) {
    const row = await this.db.selectFrom("mobius_node").select("attributes_json").where("node_id", "=", nodeId).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).executeTakeFirst();
    if (!row) return;
    let prev = {};
    try {
      prev = JSON.parse(row.attributes_json || "{}");
    } catch {
      prev = {};
    }
    const next = { ...prev, ...merge };
    await this.db.updateTable("mobius_node").set({
      attributes_json: JSON.stringify(next),
      updated_at: now
    }).where("node_id", "=", nodeId).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).execute();
  }
  /**
   * Clears cached semantic Mermaid overlay (and bumps rule version) on all document-like nodes
   * before a full vector-based `semantic_related` rebuild.
   */
  async clearSemanticOverlayFieldsForIndexedNotes(now, ruleVersion) {
    const ids = await this.listAllDocLikeNodeIds();
    let i = 0;
    for (const id of ids) {
      await this.mergeJsonAttributesForIndexedNoteNode(
        id,
        {
          semantic_overlay_mermaid: null,
          semantic_edge_rule_version: ruleVersion
        },
        now
      );
      i++;
      if (i % 200 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  /** Logical {@link DbSchema.graph_nodes} row from a `mobius_node` record. */
  graphNodeFromMobius(row) {
    return {
      id: row.node_id,
      type: row.type,
      label: row.label,
      attributes: row.attributes_json,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
  /** Logical {@link DbSchema.doc_statistics} from a document `mobius_node` row. */
  docStatisticsFromMobius(row) {
    if (!isIndexedNoteNodeType(row.type)) return null;
    return {
      doc_id: row.node_id,
      word_count: row.word_count,
      char_count: row.char_count,
      language: row.language,
      richness_score: row.richness_score,
      last_open_ts: row.last_open_ts,
      open_count: row.open_count,
      updated_at: row.updated_at
    };
  }
  /** Full `mobius_node` insert row from graph-upsert input (tag, category, placeholder doc, …). */
  mobiusRowFromGraphUpsert(node) {
    let path4 = null;
    try {
      const a = JSON.parse(node.attributes);
      if (typeof a?.path === "string") path4 = a.path;
    } catch {
      path4 = null;
    }
    return {
      node_id: node.id,
      type: node.type,
      label: node.label,
      created_at: node.created_at,
      infer_created_at: null,
      updated_at: node.updated_at,
      last_open_ts: null,
      open_count: null,
      path: isIndexedNoteNodeType(node.type) || node.type === GraphNodeType.Folder || node.type === GraphNodeType.Resource ? path4 : null,
      title: null,
      size: null,
      mtime: null,
      ctime: null,
      content_hash: null,
      summary: null,
      tags_json: null,
      word_count: null,
      char_count: null,
      language: null,
      richness_score: null,
      doc_incoming_cnt: null,
      doc_outgoing_cnt: null,
      other_incoming_cnt: null,
      other_outgoing_cnt: null,
      tag_doc_count: null,
      pagerank: null,
      pagerank_updated_at: null,
      pagerank_version: null,
      semantic_pagerank: null,
      semantic_pagerank_updated_at: null,
      semantic_pagerank_version: null,
      folder_cohesion_score: null,
      hub_stale_since: null,
      semantic_edges_version: 0,
      attributes_json: node.attributes || "{}"
    };
  }
  async existsByNodeId(nodeId) {
    const row = await this.db.selectFrom("mobius_node").select("node_id").where("node_id", "=", nodeId).executeTakeFirst();
    return row !== void 0;
  }
  /** Alias for {@link existsByNodeId} (graph-node id). */
  async existsById(id) {
    return this.existsByNodeId(id);
  }
  async getByNodeId(nodeId) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", nodeId).executeTakeFirst();
    return row ?? null;
  }
  /** Document row by vault path (unique when set). */
  /** Prefer indexed document row when multiple nodes could share display paths. */
  async getByPath(path4) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("path", "=", path4).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).executeTakeFirst();
    return row ?? null;
  }
  // --- Graph node DTO (`graph_nodes` shape on `mobius_node`) ---
  async insert(graphNode) {
    const row = this.mobiusRowFromGraphUpsert(graphNode);
    await this.db.insertInto("mobius_node").values(row).execute();
  }
  async updateById(id, updates) {
    const patch = {};
    if (updates.type !== void 0) patch.type = updates.type;
    if (updates.label !== void 0) patch.label = updates.label;
    if (updates.attributes !== void 0) patch.attributes_json = updates.attributes;
    if (updates.updated_at !== void 0) patch.updated_at = updates.updated_at;
    if (!Object.keys(patch).length) return;
    await this.db.updateTable("mobius_node").set(patch).where("node_id", "=", id).execute();
  }
  /**
   * Upsert a graph node; document rows merge `attributes_json` so indexed-document columns are preserved.
   */
  async upsert(graphNode) {
    const now = Date.now();
    const exists = await this.existsById(graphNode.id);
    if (exists && isIndexedNoteNodeType(graphNode.type)) {
      const existing = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", graphNode.id).executeTakeFirst();
      if (existing) {
        let prevAttrs = {};
        try {
          prevAttrs = JSON.parse(existing.attributes_json || "{}");
        } catch {
          prevAttrs = {};
        }
        let incomingAttrs = {};
        try {
          incomingAttrs = JSON.parse(graphNode.attributes);
        } catch {
          incomingAttrs = { raw: graphNode.attributes };
        }
        const merged = { ...prevAttrs, ...incomingAttrs };
        let path4 = existing.path;
        if (typeof incomingAttrs.path === "string") path4 = incomingAttrs.path;
        await this.db.updateTable("mobius_node").set({
          label: graphNode.label,
          attributes_json: JSON.stringify(merged),
          path: path4 ?? existing.path,
          updated_at: graphNode.updated_at ?? now
        }).where("node_id", "=", graphNode.id).execute();
        return;
      }
    }
    if (exists) {
      if (graphNode.type === GraphNodeType.Folder) {
        let folderPath = null;
        try {
          const a = JSON.parse(graphNode.attributes);
          if (typeof a?.path === "string") folderPath = a.path;
        } catch {
          folderPath = null;
        }
        await this.db.updateTable("mobius_node").set({
          type: graphNode.type,
          label: graphNode.label,
          attributes_json: graphNode.attributes,
          path: folderPath,
          updated_at: graphNode.updated_at ?? now
        }).where("node_id", "=", graphNode.id).execute();
        return;
      }
      if (graphNode.type === GraphNodeType.Resource) {
        let resourcePath = null;
        try {
          const a = JSON.parse(graphNode.attributes);
          if (typeof a?.path === "string") resourcePath = a.path;
        } catch {
          resourcePath = null;
        }
        await this.db.updateTable("mobius_node").set({
          type: graphNode.type,
          label: graphNode.label,
          attributes_json: graphNode.attributes,
          path: resourcePath,
          updated_at: graphNode.updated_at ?? now
        }).where("node_id", "=", graphNode.id).execute();
        return;
      }
      await this.updateById(graphNode.id, {
        type: graphNode.type,
        label: graphNode.label,
        attributes: graphNode.attributes,
        updated_at: graphNode.updated_at ?? now
      });
    } else {
      await this.insert({
        id: graphNode.id,
        type: graphNode.type,
        label: graphNode.label,
        attributes: graphNode.attributes,
        created_at: graphNode.created_at ?? now,
        updated_at: graphNode.updated_at ?? now
      });
    }
  }
  async getById(id) {
    const row = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "=", id).executeTakeFirst();
    return row ? this.graphNodeFromMobius(row) : null;
  }
  async getByIds(ids) {
    if (!ids.length) return /* @__PURE__ */ new Map();
    const rows = await this.db.selectFrom("mobius_node").selectAll().where("node_id", "in", ids).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      result.set(row.node_id, this.graphNodeFromMobius(row));
    }
    return result;
  }
  async getByType(type) {
    const rows = await this.db.selectFrom("mobius_node").selectAll().where("type", "=", type).execute();
    return rows.map((r) => this.graphNodeFromMobius(r));
  }
  async getByTypeAndLabels(type, labels) {
    if (!labels.length) return [];
    const rows = await this.db.selectFrom("mobius_node").selectAll().where("type", "=", type).where("label", "in", labels).execute();
    return rows.map((r) => this.graphNodeFromMobius(r));
  }
  async getIdsByIdsAndTypes(ids, types) {
    if (!ids.length || !types.length) return [];
    const rows = await this.db.selectFrom("mobius_node").select(["node_id"]).where("node_id", "in", ids).where("type", "in", types).execute();
    return rows.map((row) => row.node_id);
  }
  async deleteById(id) {
    await this.db.deleteFrom("mobius_node").where("node_id", "=", id).execute();
  }
  async deleteByIds(ids) {
    if (!ids.length) return;
    await this.deleteByNodeIds(ids);
  }
  /**
   * Increment open_count and set last_open_ts for indexed note rows (`document` / `hub_doc`).
   */
  async recordOpen(docId, ts) {
    await this.db.updateTable("mobius_node").set({
      last_open_ts: ts,
      open_count: import_kysely3.sql`coalesce(open_count, 0) + 1`,
      updated_at: ts
    }).where("node_id", "=", docId).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).execute();
  }
  async deleteByNodeIds(nodeIds) {
    if (!nodeIds.length) return;
    await this.db.deleteFrom("mobius_node").where("node_id", "in", nodeIds).execute();
  }
  async deleteAll() {
    await this.db.deleteFrom("mobius_node").execute();
  }
  // --- Document statistics (DTO `doc_statistics` on document `mobius_node` rows) ---
  docStatisticsRowQuery() {
    return this.db.selectFrom("mobius_node").where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]);
  }
  async getRecent(topK) {
    const limit = Math.max(1, topK || 20);
    const rows = await this.docStatisticsRowQuery().select(["node_id", "last_open_ts", "open_count"]).where("last_open_ts", "is not", null).orderBy("last_open_ts", "desc").limit(limit).execute();
    return rows.map((row) => ({
      docId: String(row.node_id),
      lastOpenTs: Number(row.last_open_ts ?? 0),
      openCount: Number(row.open_count ?? 0)
    }));
  }
  async getSignalsForDocIds(docIds) {
    if (!docIds.length) return /* @__PURE__ */ new Map();
    const rows = await this.docStatisticsRowQuery().select([
      "node_id",
      "type",
      "last_open_ts",
      "open_count",
      "doc_incoming_cnt",
      "pagerank_version"
    ]).where("node_id", "in", docIds).execute();
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const pv = row.pagerank_version;
      out.set(String(row.node_id), {
        lastOpenTs: Number(row.last_open_ts ?? 0),
        openCount: Number(row.open_count ?? 0),
        docIncomingCnt: Number(row.doc_incoming_cnt ?? 0),
        mobiusNodeType: String(row.type ?? ""),
        pagerankVersion: typeof pv === "number" ? pv : void 0
      });
    }
    return out;
  }
  /** Persists PageRank or semantic PageRank scalars on document-like rows. */
  async setPageRankForDocLikeNode(nodeId, fields, now = Date.now()) {
    await this.db.updateTable("mobius_node").set({ ...fields, updated_at: now }).where("node_id", "=", nodeId).where("type", "in", [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]).execute();
  }
  async getByDocId(docId) {
    const row = await this.docStatisticsRowQuery().selectAll().where("node_id", "=", docId).executeTakeFirst();
    return row ? this.docStatisticsFromMobius(row) : null;
  }
  async getByDocIds(docIds) {
    if (!docIds.length) return /* @__PURE__ */ new Map();
    const rows = await this.docStatisticsRowQuery().selectAll().where("node_id", "in", docIds).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const s = this.docStatisticsFromMobius(row);
      if (s) result.set(s.doc_id, s);
    }
    return result;
  }
  async deleteDocumentStatisticsByDocId(docId) {
    await this.db.updateTable("mobius_node").set({
      word_count: null,
      char_count: null,
      language: null,
      richness_score: null,
      last_open_ts: null,
      open_count: null,
      updated_at: Date.now()
    }).where("node_id", "=", docId).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).execute();
  }
  async deleteDocumentStatisticsByDocIds(docIds) {
    if (!docIds.length) return;
    for (const id of docIds) await this.deleteDocumentStatisticsByDocId(id);
  }
  /** Clears statistic columns on all document rows (does not delete nodes). */
  async clearAllDocumentStatistics() {
    await this.db.updateTable("mobius_node").set({
      word_count: null,
      char_count: null,
      language: null,
      richness_score: null,
      last_open_ts: null,
      open_count: null,
      updated_at: Date.now()
    }).where("type", "in", [...GRAPH_INDEXED_NOTE_NODE_TYPES]).execute();
  }
  async countAllDocumentStatisticsRows() {
    const r = await this.docStatisticsRowQuery().select(({ fn }) => fn.countAll().as("c")).executeTakeFirst();
    return Number(r?.c ?? 0);
  }
  async getTopDocStat(col, docIds, limit) {
    if (docIds !== void 0 && docIds.length === 0) return [];
    let q = this.docStatisticsRowQuery().select(["node_id", col]).where(col, "is not", null).orderBy(col, "desc").limit(limit);
    if (docIds !== void 0) q = q.where("node_id", "in", docIds);
    const rows = await q.execute();
    return rows.map((r) => ({ doc_id: r.node_id, [col]: Number(r[col]) }));
  }
  async getTopRecentEditedByDocIds(docIds, limit) {
    return this.getTopDocStat("updated_at", docIds, limit);
  }
  async getTopWordCountByDocIds(docIds, limit) {
    return this.getTopDocStat("word_count", docIds, limit);
  }
  async getTopCharCountByDocIds(docIds, limit) {
    return this.getTopDocStat("char_count", docIds, limit);
  }
  async getTopRichnessByDocIds(docIds, limit) {
    return this.getTopDocStat("richness_score", docIds, limit);
  }
  async getLanguageStatsByDocIds(docIds) {
    if (docIds !== void 0 && docIds.length === 0) return [];
    let q = this.docStatisticsRowQuery().select(({ fn }) => ["language", fn.count("node_id").as("count")]).where("language", "is not", null).groupBy("language");
    if (docIds !== void 0) q = q.where("node_id", "in", docIds);
    const rows = await q.execute();
    return rows;
  }
  /**
   * Refresh degree columns for tag nodes touched by these tag node ids (cheaper than full recompute).
   */
  async refreshTagDocCountsForTagNodeIds(tagNodeIds, now = Date.now()) {
    for (const id of tagNodeIds) {
      await import_kysely3.sql`
				UPDATE mobius_node SET
					tag_doc_count = (
						SELECT COUNT(DISTINCT e.from_node_id)
						FROM mobius_edge e
						WHERE e.to_node_id = ${id} AND (
							e.type = ${GraphEdgeType.TaggedTopic}
							OR e.type = ${GraphEdgeType.TaggedFunctional}
							OR e.type = ${GraphEdgeType.TaggedKeyword}
						)
					),
					updated_at = ${now}
				WHERE type IN (${GraphNodeType.TopicTag}, ${GraphNodeType.FunctionalTag}, ${GraphNodeType.KeywordTag}) AND node_id = ${id}
			`.execute(this.db);
    }
  }
  /**
   * Sets outgoing degree counts from indexer (matches edges written for this document).
   */
  async setDocumentOutgoingDegreeCounts(nodeId, docOutgoingCnt, otherOutgoingCnt, now = Date.now()) {
    await this.db.updateTable("mobius_node").set({
      doc_outgoing_cnt: docOutgoingCnt,
      other_outgoing_cnt: otherOutgoingCnt,
      updated_at: now
    }).where("node_id", "=", nodeId).where("type", "in", [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]).execute();
  }
  /**
   * Per-target counts for incoming edges (`to_node_id` in batch): doc-reference bucket vs other.
   * Only {@link GraphEdgeType.References} counts toward `doc`; {@link GraphEdgeType.ReferencesResource} is other.
   */
  async computeIncomingDocDegreeCountsBatch(nodeIds) {
    const out = /* @__PURE__ */ new Map();
    for (const id of nodeIds) out.set(id, { doc: 0, other: 0 });
    if (!nodeIds.length) return out;
    const ref = GraphEdgeType.References;
    const rows = await this.db.selectFrom("mobius_edge").select([
      "to_node_id",
      import_kysely3.sql`sum(case when type = ${ref} then 1 else 0 end)`.as("doc_cnt"),
      import_kysely3.sql`sum(case when type = ${ref} then 0 else 1 end)`.as("other_cnt")
    ]).where("to_node_id", "in", nodeIds).groupBy("to_node_id").execute();
    for (const row of rows) {
      const b = out.get(row.to_node_id);
      if (!b) continue;
      b.doc = Number(row.doc_cnt);
      b.other = Number(row.other_cnt);
    }
    return out;
  }
  /**
   * Per-source counts for outgoing edges (`from_node_id` in batch): doc-reference bucket vs other.
   * Same invariant as {@link computeIncomingDocDegreeCountsBatch}.
   */
  async computeOutgoingDocDegreeCountsBatch(nodeIds) {
    const out = /* @__PURE__ */ new Map();
    for (const id of nodeIds) out.set(id, { doc: 0, other: 0 });
    if (!nodeIds.length) return out;
    const ref = GraphEdgeType.References;
    const rows = await this.db.selectFrom("mobius_edge").select([
      "from_node_id",
      import_kysely3.sql`sum(case when type = ${ref} then 1 else 0 end)`.as("doc_cnt"),
      import_kysely3.sql`sum(case when type = ${ref} then 0 else 1 end)`.as("other_cnt")
    ]).where("from_node_id", "in", nodeIds).groupBy("from_node_id").execute();
    for (const row of rows) {
      const b = out.get(row.from_node_id);
      if (!b) continue;
      b.doc = Number(row.doc_cnt);
      b.other = Number(row.other_cnt);
    }
    return out;
  }
  /**
   * Recomputes incoming degree columns from `mobius_edge` for document/hub nodes (after neighbors add/remove edges).
   */
  async refreshDocumentIncomingDegreesForNodeIds(nodeIds, now = Date.now()) {
    if (!nodeIds.length) return;
    const d = GraphNodeType.Document;
    const h = GraphNodeType.HubDoc;
    const incoming = await this.computeIncomingDocDegreeCountsBatch(nodeIds);
    for (const id of nodeIds) {
      const b = incoming.get(id);
      await this.db.updateTable("mobius_node").set({
        doc_incoming_cnt: b.doc,
        other_incoming_cnt: b.other,
        updated_at: now
      }).where("node_id", "=", id).where("type", "in", [d, h]).execute();
    }
  }
  /**
   * Full recompute of all four degree columns from edges (repair / batch refresh; prefer {@link setDocumentOutgoingDegreeCounts} + {@link refreshDocumentIncomingDegreesForNodeIds} on index).
   */
  async refreshDocumentDegreesForNodeIds(nodeIds, now = Date.now()) {
    if (!nodeIds.length) return;
    const d = GraphNodeType.Document;
    const h = GraphNodeType.HubDoc;
    const [incoming, outgoing] = await Promise.all([
      this.computeIncomingDocDegreeCountsBatch(nodeIds),
      this.computeOutgoingDocDegreeCountsBatch(nodeIds)
    ]);
    for (const id of nodeIds) {
      const inc = incoming.get(id);
      const out = outgoing.get(id);
      await this.db.updateTable("mobius_node").set({
        doc_outgoing_cnt: out.doc,
        doc_incoming_cnt: inc.doc,
        other_outgoing_cnt: out.other,
        other_incoming_cnt: inc.other,
        updated_at: now
      }).where("node_id", "=", id).where("type", "in", [d, h]).execute();
    }
  }
  // --- Hub discovery & local hub graph (read-only helpers) ---
  /**
   * Clears materialized hub stats on folder nodes (`tag_doc_count`, `pagerank`, `semantic_pagerank`, boundary degree columns).
   */
  async clearFolderHubMaterializedStatsColumns(now = Date.now()) {
    await this.db.updateTable("mobius_node").set({
      tag_doc_count: null,
      pagerank: null,
      semantic_pagerank: null,
      folder_cohesion_score: null,
      doc_incoming_cnt: null,
      doc_outgoing_cnt: null,
      other_incoming_cnt: null,
      other_outgoing_cnt: null,
      updated_at: now
    }).where("type", "=", GraphNodeType.Folder).execute();
  }
  /**
   * One keyset page of document rows used to rebuild folder hub aggregates (after PageRank is persisted).
   * Excludes paths under `hubSummaryFolder` (same predicate as {@link listTopDocumentNodesForHubDiscovery}).
   */
  async listDocumentRowsForFolderHubStatsKeyset(afterNodeId, limit, hubSummaryFolder) {
    const lim = Math.max(1, limit);
    const hub = hubSummaryFolder.trim();
    const likeUnderHub = hub ? `${hub}/%` : "";
    let q = this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "tags_json",
      "pagerank",
      "semantic_pagerank",
      "doc_incoming_cnt",
      "doc_outgoing_cnt"
    ]).where("type", "=", GraphNodeType.Document).where("path", "is not", null).orderBy("node_id").limit(lim);
    if (hub) {
      q = q.where((eb) => eb.and([eb("path", "!=", hub), eb("path", "not like", likeUnderHub)]));
    }
    if (afterNodeId != null && afterNodeId !== "") {
      q = q.where("node_id", ">", afterNodeId);
    }
    const rows = await q.execute();
    return rows.map((r) => ({
      node_id: r.node_id,
      path: r.path,
      label: r.label,
      tags_json: r.tags_json,
      pagerank: r.pagerank,
      semantic_pagerank: r.semantic_pagerank,
      doc_incoming_cnt: r.doc_incoming_cnt,
      doc_outgoing_cnt: r.doc_outgoing_cnt
    }));
  }
  /**
   * Persists one folder node's materialized hub stats (reused columns; see hub docs).
   */
  async updateFolderNodeHubMaterializedStats(nodeId, stats, now = Date.now()) {
    await this.db.updateTable("mobius_node").set({
      tag_doc_count: stats.tagDocCount,
      pagerank: stats.avgPagerank,
      semantic_pagerank: stats.avgSemanticPagerank,
      folder_cohesion_score: stats.folderCohesionScore,
      doc_incoming_cnt: stats.docIncoming,
      doc_outgoing_cnt: stats.docOutgoing,
      other_incoming_cnt: stats.otherIncoming,
      other_outgoing_cnt: stats.otherOutgoing,
      updated_at: now
    }).where("node_id", "=", nodeId).where("type", "=", GraphNodeType.Folder).execute();
  }
  /**
   * Top folder nodes for conversational search Orient: ordered by PageRank, then doc count under folder.
   * Intuition text lives in `attributes_json` (see {@link parseFolderIntuitionFromMobiusFolderRow}).
   */
  async listTopFoldersForSearchOrient(limit = 30) {
    const lim = Math.max(1, Math.floor(limit));
    const rows = await this.db.selectFrom("mobius_node").select([
      "path",
      "summary",
      "attributes_json",
      "tag_doc_count",
      "folder_cohesion_score",
      "pagerank",
      "updated_at"
    ]).where("type", "=", GraphNodeType.Folder).where("path", "is not", null).orderBy(import_kysely3.sql`coalesce(pagerank, 0) desc`).orderBy(import_kysely3.sql`coalesce(tag_doc_count, 0) desc`).limit(lim).execute();
    const out = [];
    for (const r of rows) {
      const m = parseFolderIntuitionFromMobiusFolderRow({
        path: r.path,
        summary: r.summary,
        attributes_json: r.attributes_json,
        tag_doc_count: r.tag_doc_count,
        folder_cohesion_score: r.folder_cohesion_score,
        pagerank: r.pagerank,
        updated_at: r.updated_at
      });
      if (m) out.push(m);
    }
    return out;
  }
  /**
   * Loads `tags_json` for documents under a folder path (exact folder or nested files), capped for purity stats.
   */
  async listDocumentTagsJsonUnderFolderPrefix(folderPath, limit) {
    const p = normalizeVaultPath(folderPath);
    if (!p) return [];
    const lim = Math.max(1, limit);
    const prefix = p.endsWith("/") ? p : `${p}/`;
    const rows = await this.db.selectFrom("mobius_node").select("tags_json").where("type", "=", GraphNodeType.Document).where((eb) => eb.or([eb("path", "=", p), eb("path", "like", `${prefix}%`)])).limit(lim).execute();
    return rows.map((r) => String(r.tags_json ?? ""));
  }
  /** Direct child folder vault paths under `parentPath` (one extra path segment). */
  async listDirectChildFolderPaths(parentPath) {
    const p = normalizeVaultPath(parentPath);
    if (!p) return [];
    const prefix = `${p}/`;
    const rows = await this.db.selectFrom("mobius_node").select("path").where("type", "=", GraphNodeType.Folder).where("path", "like", `${prefix}%`).execute();
    const parentSlashCount = (p.match(/\//g) ?? []).length;
    const out = [];
    for (const r of rows) {
      const path4 = r.path ? normalizeVaultPath(r.path) : "";
      if (!path4.startsWith(prefix)) continue;
      const slashCount = (path4.match(/\//g) ?? []).length;
      if (slashCount === parentSlashCount + 1) out.push(path4);
    }
    return out;
  }
  /**
   * Folder hub discovery rows for specific paths.
   * Use for promoting direct children; may include rows below {@link FOLDER_HUB_MIN_DOCS} when `relaxMinDocs` is true.
   */
  async listFolderHubDiscoveryRowsByPaths(paths, hubSummaryFolder, options) {
    const uniq = [...new Set(paths.map((x) => normalizeVaultPath(String(x))).filter(Boolean))];
    if (!uniq.length) return [];
    const hub = hubSummaryFolder.trim();
    const likeUnderHub = hub ? `${hub}/%` : "";
    const relax = options?.relaxMinDocs === true;
    const hubPhysical = import_kysely3.sql`min(1.0, coalesce(pagerank, 0.0) * 2.2)`;
    const totalIn = import_kysely3.sql`coalesce(doc_incoming_cnt, 0) + coalesce(other_incoming_cnt, 0)`;
    const totalOut = import_kysely3.sql`coalesce(doc_outgoing_cnt, 0) + coalesce(other_outgoing_cnt, 0)`;
    const hubOrg = import_kysely3.sql`min(1.0, ln(1.0 + coalesce(tag_doc_count, 0)) * 0.18 + ln(1.0 + ${totalIn}) * 0.06 + ln(1.0 + ${totalOut}) * 0.06)`;
    const hubSem = import_kysely3.sql`min(1.0, coalesce(semantic_pagerank, 0.0) * 1.0)`;
    const lnRef = Math.log(1 + FOLDER_HUB_COHESION_SIZE_REF_DOC_COUNT);
    const hubCohEff = import_kysely3.sql`coalesce(folder_cohesion_score, 0.0) * min(1.0, ln(1.0 + coalesce(tag_doc_count, 0)) / ${lnRef})`;
    const wPhys = FOLDER_HUB_GRAPH_WEIGHT_PHYSICAL;
    const wOrg = FOLDER_HUB_GRAPH_WEIGHT_ORGANIZATIONAL;
    const wSem = FOLDER_HUB_GRAPH_WEIGHT_SEMANTIC;
    const wCoh = FOLDER_HUB_GRAPH_WEIGHT_COHESION;
    const hubGraph = import_kysely3.sql`min(1.0, (${hubPhysical} * ${wPhys}) + (${hubOrg} * ${wOrg}) + (${hubSem} * ${wSem}) + (${hubCohEff} * ${wCoh}))`;
    let q = this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "tag_doc_count",
      "pagerank",
      "semantic_pagerank",
      "folder_cohesion_score",
      "doc_incoming_cnt",
      "doc_outgoing_cnt",
      "other_incoming_cnt",
      "other_outgoing_cnt",
      hubPhysical.as("hub_physical_authority_score"),
      hubOrg.as("hub_organizational_score"),
      hubSem.as("hub_semantic_centrality_score"),
      hubCohEff.as("hub_cohesion_effective_score"),
      hubGraph.as("hub_graph_score")
    ]).where("type", "=", GraphNodeType.Folder).where("path", "is not", null).where("path", "in", uniq);
    if (!relax) {
      q = q.where("tag_doc_count", ">=", FOLDER_HUB_MIN_DOCS);
    }
    if (hub) {
      q = q.where((eb) => eb.and([eb("path", "!=", hub), eb("path", "not like", likeUnderHub)]));
    }
    const rows = await q.execute();
    return rows;
  }
  /**
   * Top `document` rows by hub graph score, excluding paths under `hubSummaryFolder` (Hub-Summaries subtree).
   * Scoring matches in-app `HubCandidateDiscoveryService.scoreDocumentRow`; computed in SQL to avoid full-table loads.
   *
   * Let `pr = coalesce(pagerank,0)`, `wc = coalesce(word_count,0)`, `inc = coalesce(doc_incoming_cnt,0)`,
   * `out = coalesce(doc_outgoing_cnt,0)`, `spr = coalesce(semantic_pagerank,0)` (all in SQL).
   *
   * - `longDocWeak = min(0.08, (wc / 50000) * 0.08)`
   * - `hub_physical_authority_score = min(1, pr * 2.5 + longDocWeak)`
   * - `hub_organizational_score = min(1, inc * w_in + out * w_out)` ({@link DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS})
   * - `hub_semantic_centrality_score = min(1, spr * 1.2)`
   * - `hub_graph_score = min(1, hub_physical_authority_score * 0.35 + hub_organizational_score * 0.25 + hub_semantic_centrality_score * 0.35)`
   *
   * Rows are ordered by `hub_graph_score` descending, then limited to `limit`.
   */
  async listTopDocumentNodesForHubDiscovery(limit, hubSummaryFolder) {
    const lim = Math.max(1, limit);
    const hub = hubSummaryFolder.trim();
    const likeUnderHub = hub ? `${hub}/%` : "";
    const wIn = DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS.incoming;
    const wOut = DOCUMENT_HUB_ORGANIZATIONAL_SCORE_WEIGHTS.outgoing;
    const hubPhysical = import_kysely3.sql`min(1.0, (coalesce(pagerank, 0) * 2.5) + min(0.08, (coalesce(word_count, 0) / 50000.0) * 0.08))`;
    const hubOrg = import_kysely3.sql`min(1.0, (coalesce(doc_incoming_cnt, 0) * ${wIn}) + (coalesce(doc_outgoing_cnt, 0) * ${wOut}))`;
    const hubSem = import_kysely3.sql`min(1.0, coalesce(semantic_pagerank, 0) * 1.2)`;
    const hubGraph = import_kysely3.sql`min(1.0, (${hubPhysical} * 0.35) + (${hubOrg} * 0.25) + (${hubSem} * 0.35))`;
    let q = this.db.selectFrom("mobius_node").select([
      "node_id",
      "path",
      "label",
      "type",
      "doc_incoming_cnt",
      "doc_outgoing_cnt",
      "pagerank",
      "semantic_pagerank",
      "word_count",
      hubPhysical.as("hub_physical_authority_score"),
      hubOrg.as("hub_organizational_score"),
      hubSem.as("hub_semantic_centrality_score"),
      hubGraph.as("hub_graph_score")
    ]).where("type", "=", GraphNodeType.Document).where("path", "is not", null);
    if (hub) {
      q = q.where(
        (eb) => eb.and([eb("path", "!=", hub), eb("path", "not like", likeUnderHub)])
      );
    }
    const rows = await q.orderBy("hub_graph_score", "desc").limit(lim).execute();
    return rows;
  }
  /**
   * Batch-load doc link degrees for `type=folder` mobius rows by vault path (one round-trip).
   * Keys in the returned map use {@link normalizeVaultPath}.
   */
  async listFolderDocDegreesByVaultPaths(paths) {
    const uniq = [...new Set(paths.map((p) => normalizeVaultPath(String(p ?? ""))).filter(Boolean))];
    if (uniq.length === 0) return /* @__PURE__ */ new Map();
    const rows = await this.db.selectFrom("mobius_node").select(["path", "doc_incoming_cnt", "doc_outgoing_cnt"]).where("type", "=", GraphNodeType.Folder).where("path", "in", uniq).execute();
    const m = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const p = normalizeVaultPath(String(r.path ?? ""));
      if (!p) continue;
      m.set(p, {
        incoming: Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0))),
        outgoing: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0)))
      });
    }
    return m;
  }
  /**
   * Sums `doc_outgoing_cnt` for document nodes (matches folder-row `docOutgoing` semantics, doc links only).
   */
  async sumDocumentOutgoingByNodeIds(nodeIds) {
    const uniq = [...new Set(nodeIds.filter(Boolean))];
    if (uniq.length === 0) return 0;
    const rows = await this.db.selectFrom("mobius_node").select(["doc_outgoing_cnt"]).where("node_id", "in", uniq).where("type", "=", GraphNodeType.Document).execute();
    let s = 0;
    for (const r of rows) {
      s += Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0)));
    }
    return s;
  }
};

// src/core/storage/sqlite/repositories/MobiusEdgeRepo.ts
var import_kysely4 = require("kysely");

// src/core/utils/id-utils.ts
var import_crypto = require("crypto");
var import_uuid = require("uuid");
function generateUuidWithoutHyphens() {
  return (0, import_uuid.v4)().replace(/-/g, "");
}
function generateStableUuid(input) {
  const hash = (0, import_crypto.createHash)("md5").update(input).digest("hex");
  const e = SLICE_CAPS.hash.md5UuidSliceEnds;
  const uuidWithHyphens = `${hash.slice(0, e[0])}-${hash.slice(e[0], e[1])}-${hash.slice(e[1], e[2])}-${hash.slice(e[2], e[3])}-${hash.slice(e[3], e[4])}`;
  return uuidWithHyphens.replace(/-/g, "");
}
function generateDocIdFromPath(path4) {
  return generateStableUuid(path4 ?? "");
}
function stableDocumentNodeIdTimeFallback(path4, timestampMs) {
  return generateStableUuid(`${path4}\0${timestampMs}`);
}
function stableMobiusFolderNodeId(tenant, folderPath) {
  return generateStableUuid(`mobius-folder:${tenant}:${folderPath}`);
}
function stableMobiusEdgeId(fromNodeId, toNodeId, edgeType) {
  return generateStableUuid(fromNodeId + toNodeId + edgeType);
}
function stableTopicTagNodeId(tag) {
  return generateStableUuid(`tag:${tag}`);
}
function stableFunctionalTagNodeId(tag) {
  return generateStableUuid(`functional:${tag}`);
}
function stableKeywordTagNodeId(tag) {
  return generateStableUuid(`keyword:${tag}`);
}
function stableContextTagNodeId(axis, label) {
  return generateStableUuid(`context:${axis}:${label}`);
}

// src/core/storage/sqlite/repositories/MobiusEdgeRepo.ts
var MobiusEdgeRepo = class _MobiusEdgeRepo {
  constructor(db) {
    this.db = db;
  }
  /** Logical {@link DbSchema.graph_edges} row from stored `mobius_edge` (or raw SELECT). */
  graphEdgeFromMobius(row) {
    return {
      id: row.id,
      from_node_id: row.from_node_id,
      to_node_id: row.to_node_id,
      type: row.type,
      weight: row.weight,
      attributes: row.attributes_json ?? row.attributes ?? "{}",
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
  /**
   * Generate edge ID (now returns a UUID instead of composite string for better storage efficiency).
   */
  static generateEdgeId(fromNodeId, toNodeId, type) {
    return stableMobiusEdgeId(fromNodeId, toNodeId, type);
  }
  /**
   * Check if graph edge exists by id.
   */
  async existsById(id) {
    const row = await this.db.selectFrom("mobius_edge").select("id").where("id", "=", id).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new graph edge.
   */
  async insert(edge) {
    await this.db.insertInto("mobius_edge").values({
      id: edge.id,
      from_node_id: edge.from_node_id,
      to_node_id: edge.to_node_id,
      type: edge.type,
      label: null,
      weight: edge.weight,
      attributes_json: edge.attributes,
      created_at: edge.created_at,
      updated_at: edge.updated_at
    }).execute();
  }
  /**
   * Update existing graph edge by id.
   */
  async updateById(id, updates) {
    const patch = {};
    if (updates.weight !== void 0) patch.weight = updates.weight;
    if (updates.attributes !== void 0) patch.attributes_json = updates.attributes;
    if (updates.updated_at !== void 0) patch.updated_at = updates.updated_at;
    if (!Object.keys(patch).length) return;
    await this.db.updateTable("mobius_edge").set(patch).where("id", "=", id).execute();
  }
  /**
   * Upsert a graph edge.
   */
  async upsert(edge) {
    const now = Date.now();
    const id = edge.id ?? _MobiusEdgeRepo.generateEdgeId(edge.from_node_id, edge.to_node_id, edge.type);
    const exists = await this.existsById(id);
    if (exists) {
      await this.updateById(id, {
        weight: edge.weight ?? 1,
        attributes: edge.attributes,
        updated_at: edge.updated_at ?? now
      });
    } else {
      await this.insert({
        id,
        from_node_id: edge.from_node_id,
        to_node_id: edge.to_node_id,
        type: edge.type,
        weight: edge.weight ?? 1,
        attributes: edge.attributes,
        created_at: edge.created_at ?? now,
        updated_at: edge.updated_at ?? now
      });
    }
  }
  /**
   * Get edge by ID.
   */
  async getById(id) {
    const row = await this.db.selectFrom("mobius_edge").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.graphEdgeFromMobius(row) : null;
  }
  /**
   * Get edges by from_node_id.
   */
  async getByFromNode(fromNodeId) {
    const rows = await this.db.selectFrom("mobius_edge").selectAll().where("from_node_id", "=", fromNodeId).execute();
    return rows.map((row) => this.graphEdgeFromMobius(row));
  }
  /**
   * Get edges by from_node_ids and types (batch).
   * todo we may need pagination for large result.
   */
  async getByFromNodesAndTypes(fromNodeIds, types) {
    if (!fromNodeIds.length || !types.length) return [];
    const rows = await this.db.selectFrom("mobius_edge").select(["to_node_id", "from_node_id", "type", "attributes_json"]).where("from_node_id", "in", fromNodeIds).where("type", "in", types).execute();
    return rows.map((r) => ({
      to_node_id: r.to_node_id,
      from_node_id: r.from_node_id,
      type: r.type,
      attributes: r.attributes_json ?? "{}"
    }));
  }
  /**
   * Get edges by to_node_ids and types (batch). No join.
   */
  async getByToNodesAndTypes(toNodeIds, types) {
    if (!toNodeIds.length || !types.length) return [];
    return await this.db.selectFrom("mobius_edge").select(["to_node_id", "from_node_id"]).where("to_node_id", "in", toNodeIds).where("type", "in", types).execute();
  }
  /**
   * Edge-only aggregate: filter by type, group by to_node_id, count. No join.
   * Caller should then look up mobius_node by to_node_id and sum counts by (type, label).
   */
  async getTagCategoryEdgeCountsByToNode(fromNodeIds) {
    let q = this.db.selectFrom("mobius_edge").select(["to_node_id", import_kysely4.sql`count(*)`.as("count")]).where("type", "in", [...GRAPH_TAGGED_EDGE_TYPES]).groupBy("to_node_id");
    if (fromNodeIds !== void 0 && fromNodeIds.length > 0) {
      q = q.where("from_node_id", "in", fromNodeIds);
    }
    const rows = await q.execute();
    return rows.map((r) => ({
      to_node_id: r.to_node_id,
      count: Number(r.count)
    }));
  }
  /**
   * Incoming edge counts. When `type` is omitted, uses `mobius_node` doc/other columns for document nodes
   * (aggregate columns rebuilt by {@link IndexService.runMobiusGlobalMaintenance} / per-index incoming refresh;
   * `semantic_related` edges by {@link IndexService.runMobiusGlobalMaintenance});
   * non-document ids fall back to `mobius_edge`.
   * When `type` is set, always aggregates from `mobius_edge` (cannot derive from cached columns).
   */
  async countInComingEdges(nodeIds, type) {
    if (!nodeIds.length) return /* @__PURE__ */ new Map();
    if (type !== void 0) {
      return this.countIncomingEdgesFromEdgeTable(nodeIds, type);
    }
    return this.countIncomingEdgesFromNodeColumns(nodeIds);
  }
  /**
   * Outgoing edge counts; same caching rules as {@link countInComingEdges}.
   */
  async countOutgoingEdges(nodeIds, type) {
    if (!nodeIds.length) return /* @__PURE__ */ new Map();
    if (type !== void 0) {
      return this.countOutgoingEdgesFromEdgeTable(nodeIds, type);
    }
    return this.countOutgoingEdgesFromNodeColumns(nodeIds);
  }
  async countIncomingEdgesFromEdgeTable(nodeIds, edgeType) {
    let query2 = this.db.selectFrom("mobius_edge").select(({ fn }) => [fn.count("id").as("count"), "to_node_id"]).where("to_node_id", "in", nodeIds);
    if (edgeType !== void 0) {
      const types = typeof edgeType === "string" ? [edgeType] : [...edgeType];
      query2 = types.length === 1 ? query2.where("type", "=", types[0]) : query2.where("type", "in", types);
    }
    const rows = await query2.groupBy(["to_node_id"]).execute();
    const map = /* @__PURE__ */ new Map();
    for (const row of rows) {
      map.set(row.to_node_id, row.count);
    }
    return map;
  }
  async countOutgoingEdgesFromEdgeTable(nodeIds, edgeType) {
    let query2 = this.db.selectFrom("mobius_edge").select(({ fn }) => [fn.count("id").as("count"), "from_node_id"]).where("from_node_id", "in", nodeIds);
    if (edgeType !== void 0) {
      const types = typeof edgeType === "string" ? [edgeType] : [...edgeType];
      query2 = types.length === 1 ? query2.where("type", "=", types[0]) : query2.where("type", "in", types);
    }
    const rows = await query2.groupBy(["from_node_id"]).execute();
    const map = /* @__PURE__ */ new Map();
    for (const row of rows) {
      map.set(row.from_node_id, row.count);
    }
    return map;
  }
  async countIncomingEdgesFromNodeColumns(nodeIds) {
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "type", "doc_incoming_cnt", "other_incoming_cnt"]).where("node_id", "in", nodeIds).execute();
    const byId = new Map(rows.map((r) => [r.node_id, r]));
    const fallback = /* @__PURE__ */ new Set();
    const map = /* @__PURE__ */ new Map();
    for (const id of nodeIds) {
      const r = byId.get(id);
      if (!r || !isIndexedNoteNodeType(r.type)) {
        fallback.add(id);
        continue;
      }
      map.set(id, (r.doc_incoming_cnt ?? 0) + (r.other_incoming_cnt ?? 0));
    }
    if (fallback.size) {
      const sub = await this.countIncomingEdgesFromEdgeTable([...fallback], void 0);
      for (const [k, v] of sub) map.set(k, v);
    }
    for (const id of nodeIds) {
      if (!map.has(id)) map.set(id, 0);
    }
    return map;
  }
  async countOutgoingEdgesFromNodeColumns(nodeIds) {
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "type", "doc_outgoing_cnt", "other_outgoing_cnt"]).where("node_id", "in", nodeIds).execute();
    const byId = new Map(rows.map((r) => [r.node_id, r]));
    const fallback = /* @__PURE__ */ new Set();
    const map = /* @__PURE__ */ new Map();
    for (const id of nodeIds) {
      const r = byId.get(id);
      if (!r || !isIndexedNoteNodeType(r.type)) {
        fallback.add(id);
        continue;
      }
      map.set(id, (r.doc_outgoing_cnt ?? 0) + (r.other_outgoing_cnt ?? 0));
    }
    if (fallback.size) {
      const sub = await this.countOutgoingEdgesFromEdgeTable([...fallback], void 0);
      for (const [k, v] of sub) map.set(k, v);
    }
    for (const id of nodeIds) {
      if (!map.has(id)) map.set(id, 0);
    }
    return map;
  }
  /**
   * group count node's edges by type.
   * return a map: node_id -> count
   */
  async countEdges(nodeIds, type) {
    const incoming = await this.countInComingEdges(nodeIds, type);
    const outgoing = await this.countOutgoingEdges(nodeIds, type);
    const total = /* @__PURE__ */ new Map();
    for (const nodeId of nodeIds) {
      total.set(nodeId, (incoming.get(nodeId) ?? 0) + (outgoing.get(nodeId) ?? 0));
    }
    return { incoming, outgoing, total };
  }
  /**
   * Batch get neighbor node IDs for multiple nodes.
   *
   * Returns a map: node_id -> neighbor_id[]
   */
  async getNeighborIdsMap(nodeIds) {
    if (!nodeIds.length) return /* @__PURE__ */ new Map();
    const rows = await this.db.selectFrom("mobius_edge").select(["from_node_id", "to_node_id"]).where("from_node_id", "in", nodeIds).execute();
    const out = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const key = String(r.from_node_id);
      const arr = out.get(key) ?? [];
      arr.push(String(r.to_node_id));
      out.set(key, arr);
    }
    return out;
  }
  /**
   * Streams all edges with endpoint `mobius_node` type/path resolved in memory (no SQL JOIN: edge page + `IN` lookup).
   */
  async *iterateMobiusEdgeBatchesWithEndpointMetadata(batchSize) {
    const limit = Math.max(1, batchSize);
    let afterId = null;
    for (; ; ) {
      let q = this.db.selectFrom("mobius_edge").select(["id", "type", "from_node_id", "to_node_id"]);
      if (afterId != null) {
        q = q.where("id", ">", afterId);
      }
      const edgeRows = await q.orderBy("id", "asc").limit(limit).execute();
      if (edgeRows.length === 0) {
        return;
      }
      const idSet = /* @__PURE__ */ new Set();
      for (const e of edgeRows) {
        idSet.add(String(e.from_node_id));
        idSet.add(String(e.to_node_id));
      }
      const metaById = await this.loadMobiusNodeTypePathByIds([...idSet]);
      yield edgeRows.map((e) => {
        const from = metaById.get(String(e.from_node_id));
        const to = metaById.get(String(e.to_node_id));
        return {
          id: String(e.id),
          type: String(e.type),
          from_type: from?.type ?? "",
          from_path: from?.path ?? null,
          to_type: to?.type ?? "",
          to_path: to?.path ?? null
        };
      });
      afterId = String(edgeRows[edgeRows.length - 1].id);
      if (edgeRows.length < limit) {
        return;
      }
    }
  }
  /** Single-table lookup for endpoint resolution (used with {@link iterateMobiusEdgeBatchesWithEndpointMetadata}). */
  async loadMobiusNodeTypePathByIds(nodeIds) {
    const out = /* @__PURE__ */ new Map();
    if (!nodeIds.length) return out;
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "type", "path"]).where("node_id", "in", nodeIds).execute();
    for (const r of rows) {
      out.set(String(r.node_id), { type: String(r.type), path: r.path ?? null });
    }
    return out;
  }
  /**
   * Keyset-ordered batches of wiki reference edges (no JOIN). Callers filter by doc-like node ids in memory.
   */
  async *iterateReferenceEdgeBatches(batchSize) {
    const limit = Math.max(1, batchSize);
    let afterId = null;
    for (; ; ) {
      let q = this.db.selectFrom("mobius_edge").select(["id", "from_node_id", "to_node_id"]).where("type", "in", [...GRAPH_WIKI_REFERENCE_EDGE_TYPES]);
      if (afterId != null) {
        q = q.where("id", ">", afterId);
      }
      const rows = await q.orderBy("id", "asc").limit(limit).execute();
      if (rows.length === 0) {
        return;
      }
      yield rows.map((r) => ({
        from_node_id: String(r.from_node_id),
        to_node_id: String(r.to_node_id)
      }));
      afterId = String(rows[rows.length - 1].id);
      if (rows.length < limit) {
        return;
      }
    }
  }
  /**
   * Keyset-ordered batches of `semantic_related` edges with weights (weighted PageRank).
   */
  async *iterateSemanticRelatedEdgeBatches(batchSize) {
    const limit = Math.max(1, batchSize);
    let afterId = null;
    for (; ; ) {
      let q = this.db.selectFrom("mobius_edge").select(["id", "from_node_id", "to_node_id", "weight"]).where("type", "=", GraphEdgeType.SemanticRelated);
      if (afterId != null) {
        q = q.where("id", ">", afterId);
      }
      const rows = await q.orderBy("id", "asc").limit(limit).execute();
      if (rows.length === 0) {
        return;
      }
      yield rows.map((r) => ({
        from_node_id: String(r.from_node_id),
        to_node_id: String(r.to_node_id),
        weight: Number(r.weight ?? 0)
      }));
      afterId = String(rows[rows.length - 1].id);
      if (rows.length < limit) {
        return;
      }
    }
  }
  /**
   * Get source node IDs that are connected to ALL specified target node IDs.
   * Uses GROUP BY and HAVING to find nodes that have edges to all required targets.
   * Since target node IDs are unique (tags and categories have different IDs),
   * we don't need to filter by edge type.
   * @param targetNodeIds Array of target node IDs to match against
   */
  async getSourceNodesConnectedToAllTargets(targetNodeIds) {
    if (targetNodeIds.length === 0) return [];
    const result = await this.db.selectFrom("mobius_edge").select("from_node_id").where("to_node_id", "in", targetNodeIds).groupBy("from_node_id").having(import_kysely4.sql`COUNT(DISTINCT to_node_id)`, "=", targetNodeIds.length).execute();
    return result.map((row) => row.from_node_id);
  }
  /**
   * Hard orphan: zero in- and out-degree. Documents use cached columns; other types use `NOT EXISTS` on both directions.
   */
  async getHardOrphanNodeIds(limit) {
    const cap = limit ?? 1e7;
    const d = GraphNodeType.Document;
    const h = GraphNodeType.HubDoc;
    const result = await import_kysely4.sql`
			SELECT n.node_id AS node_id FROM mobius_node n
			WHERE (
				(
					n.type IN (${d}, ${h})
					AND IFNULL(n.doc_outgoing_cnt,0) + IFNULL(n.other_outgoing_cnt,0) = 0
					AND IFNULL(n.doc_incoming_cnt,0) + IFNULL(n.other_incoming_cnt,0) = 0
				)
				OR (
					n.type NOT IN (${d}, ${h})
					AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.from_node_id = n.node_id)
					AND NOT EXISTS (SELECT 1 FROM mobius_edge e WHERE e.to_node_id = n.node_id)
				)
			)
			LIMIT ${cap}
		`.execute(this.db);
    return result.rows.map((r) => r.node_id);
  }
  /**
   * Get hard orphan nodes with full node information.
   * Uses separate queries to avoid JOIN operations.
   * @param limit Maximum number of orphans to return
   */
  async getHardOrphans(limit) {
    const orphanIds = await this.getHardOrphanNodeIds(limit);
    if (orphanIds.length === 0) {
      return [];
    }
    return orphanIds;
  }
  /**
   * Get top nodes by degree metrics (in-degree, out-degree). Queries in and out separately.
   *
   * @param limit Max nodes per degree type. Omitted = return all.
   * @param nodeIdFilter Optional node IDs to restrict to.
   * @param edgeType Optional edge relationship type (e.g. 'references', 'tagged') to filter by; not node type.
   */
  async getTopNodeIdsByDegree(limit, nodeIdFilter, edgeType) {
    let outDegreeQuery = this.db.selectFrom("mobius_edge").select([
      "from_node_id as nodeId",
      ({ fn }) => fn.count("id").as("outDegree")
    ]).groupBy("from_node_id").orderBy("outDegree", "desc");
    let inDegreeQuery = this.db.selectFrom("mobius_edge").select([
      "to_node_id as nodeId",
      ({ fn }) => fn.count("id").as("inDegree")
    ]).groupBy("to_node_id").orderBy("inDegree", "desc");
    if (edgeType !== void 0) {
      const types = typeof edgeType === "string" ? [edgeType] : [...edgeType];
      outDegreeQuery = types.length === 1 ? outDegreeQuery.where("type", "=", types[0]) : outDegreeQuery.where("type", "in", types);
      inDegreeQuery = types.length === 1 ? inDegreeQuery.where("type", "=", types[0]) : inDegreeQuery.where("type", "in", types);
    }
    if (nodeIdFilter && nodeIdFilter.length > 0) {
      outDegreeQuery = outDegreeQuery.where("from_node_id", "in", nodeIdFilter);
      inDegreeQuery = inDegreeQuery.where("to_node_id", "in", nodeIdFilter);
    }
    if (limit !== void 0) {
      outDegreeQuery = outDegreeQuery.limit(limit);
      inDegreeQuery = inDegreeQuery.limit(limit);
    }
    const [outDegreeStats, inDegreeStats] = await Promise.all([
      outDegreeQuery.execute(),
      inDegreeQuery.execute()
    ]);
    return {
      topByOutDegree: outDegreeStats,
      topByInDegree: inDegreeStats
    };
  }
  /**
   * Delete outgoing edges of a given type (e.g. re-materialize `semantic_related` on reindex).
   */
  async deleteByFromNodeAndType(fromNodeId, type) {
    await this.db.deleteFrom("mobius_edge").where("from_node_id", "=", fromNodeId).where("type", "=", type).execute();
  }
  /**
   * Delete edges by type.
   */
  async deleteByType(type) {
    await this.db.deleteFrom("mobius_edge").where("type", "=", type).execute();
  }
  /**
   * Delete edges where from_node_id or to_node_id matches any of the given node IDs.
   */
  async deleteByNodeIds(nodeIds) {
    if (!nodeIds.length) return;
    await this.db.deleteFrom("mobius_edge").where((eb) => eb.or([eb("from_node_id", "in", nodeIds), eb("to_node_id", "in", nodeIds)])).execute();
  }
  /**
   * Get limited edges by node ID, grouped by type.
   * Optionally exclude a set of types.
   * Returns edges where each type (for the remaining types, or all if not provided) is limited to the specified limit per type.
   * Uses SQLite window functions to rank edges within each type group.
   * @param nodeId - The node ID to fetch edges for
   * // todo we should limit by statistics weight. some doc are more important than others. not just simple order
   * //  so we should add some data to the graph edge, node table. like weight
   * @param limitPerType - Maximum number of edges per type to return
   * @param typesExclude - Types to exclude (edges of these types will not be included)
   */
  async getAllEdgesForNode(nodeId, limitPerType, typesExclude) {
    const directionExpr = import_kysely4.sql`case when from_node_id = ${nodeId} then 'out' else 'in' end`;
    const query2 = this.db.with("ranked_edges", (qb) => {
      let baseQb = qb.selectFrom("mobius_edge").select([
        "id",
        "from_node_id",
        "to_node_id",
        "type",
        "weight",
        "attributes_json",
        "created_at",
        "updated_at",
        // 1. define direction explicitly: if the edge is outgoing from the current node, mark as 'out', otherwise mark as 'in'
        directionExpr.as("direction"),
        // 2. add type and direction to partitionBy
        import_kysely4.sql`row_number() over(
							partition by type, ${directionExpr} 
							order by updated_at desc
						)`.as("dir_type_rank")
      ]).where(
        (eb) => eb.or([
          eb("from_node_id", "=", nodeId),
          eb("to_node_id", "=", nodeId)
        ])
      );
      if (typesExclude && typesExclude.length > 0) {
        baseQb = baseQb.where("type", "not in", typesExclude);
      }
      return baseQb;
    }).selectFrom("ranked_edges").selectAll().where("dir_type_rank", "<=", limitPerType).orderBy("updated_at", "desc");
    const raw = await query2.execute();
    return raw.map(
      (r) => this.graphEdgeFromMobius({
        id: r.id,
        from_node_id: r.from_node_id,
        to_node_id: r.to_node_id,
        type: r.type,
        weight: r.weight,
        attributes_json: r.attributes_json ?? "{}",
        created_at: r.created_at,
        updated_at: r.updated_at
      })
    );
  }
  /**
   * Top tags by `mobius_node.tag_doc_count` (distinct documents per tag, maintained with edges).
   */
  async getTopTaggedNodes(limit = 50) {
    const rows = await this.db.selectFrom("mobius_node").select(["node_id", "tag_doc_count"]).where("type", "in", [...GRAPH_TAG_NODE_TYPES]).where("tag_doc_count", "is not", null).where("tag_doc_count", ">", 0).orderBy("tag_doc_count", "desc").limit(limit).execute();
    return rows.map((r) => ({ tagId: r.node_id, count: Number(r.tag_doc_count) }));
  }
  /**
   * Delete all graph edges.
   */
  async deleteAll() {
    await this.db.deleteFrom("mobius_edge").execute();
  }
};

// src/core/storage/sqlite/repositories/MobiusOperationRepo.ts
var MobiusOperationType = {
  AI_ANALYSIS: "ai_analysis"
};
var MobiusOperationRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Log an AI Quick Search analysis run (links to `ai_analysis_record`).
   */
  async insertAiAnalysisOperation(params) {
    const desc = (params.query ?? params.title ?? "").slice(0, SLICE_CAPS.sqlite.operationDescription) || "(ai analysis)";
    const row = {
      id: generateUuidWithoutHyphens(),
      operation_type: MobiusOperationType.AI_ANALYSIS,
      operation_desc: desc,
      created_at: params.createdAtTs,
      related_kind: "ai_analysis_record",
      related_id: params.recordId,
      important_level: null,
      continuous_group_id: null,
      meta_json: JSON.stringify({ vault_rel_path: params.vaultRelPath })
    };
    await this.db.insertInto("mobius_operation").values(row).execute();
  }
  /**
   * Low-level insert; add a dedicated method when introducing a new operation kind.
   */
  async insertRow(row) {
    await this.db.insertInto("mobius_operation").values(row).execute();
  }
  /**
   * Return recent operations ordered by `created_at DESC`.
   *
   * @param params.limit    Maximum rows to return (clamped 1–500).
   * @param params.sinceTs  If provided, only rows with `created_at >= sinceTs`.
   * @param params.types    If provided, only rows whose `operation_type` is in this list.
   */
  async getRecent(params) {
    const safeLimit = Math.max(1, Math.min(500, params.limit));
    let query2 = this.db.selectFrom("mobius_operation").selectAll().orderBy("created_at", "desc").limit(safeLimit);
    if (params.sinceTs !== void 0) {
      query2 = query2.where("created_at", ">=", params.sinceTs);
    }
    if (params.types && params.types.length > 0) {
      query2 = query2.where("operation_type", "in", params.types);
    }
    return query2.execute();
  }
  /**
   * Count rows per `operation_type` since `sinceTs` (inclusive).
   *
   * @returns A record mapping each operation_type present in the range to its row count.
   */
  async countByTypeSince(sinceTs) {
    const rows = await this.db.selectFrom("mobius_operation").select((eb) => [
      "operation_type",
      eb.fn.count("id").as("cnt")
    ]).where("created_at", ">=", sinceTs).groupBy("operation_type").execute();
    const result = {};
    for (const row of rows) {
      result[row.operation_type] = Number(row.cnt);
    }
    return result;
  }
};

// src/core/storage/sqlite/repositories/GraphRepo.ts
function parseFunctionalQualifierFromEdgeAttributes(attributesJson) {
  try {
    const a = JSON.parse(attributesJson || "{}");
    if (typeof a.qualifier === "string" && a.qualifier.trim()) return a.qualifier.trim();
  } catch {
  }
  return void 0;
}
var GraphRepo = class {
  constructor(nodeRepo, edgeRepo) {
    this.nodeRepo = nodeRepo;
    this.edgeRepo = edgeRepo;
  }
  async getRelatedFilePaths(params) {
    const relatedNodeIds = await this.getRelatedNodeIds(params.currentFilePath, params.maxHops ?? 2);
    const documentIds = await this.nodeRepo.getIdsByIdsAndTypes(
      Array.from(relatedNodeIds),
      [...GRAPH_DOCUMENT_LIKE_NODE_TYPES]
    );
    return new Set(documentIds);
  }
  async getRelatedNodeIds(startNodeId, maxHops = 2) {
    const visited = /* @__PURE__ */ new Set([startNodeId]);
    let frontier = /* @__PURE__ */ new Set([startNodeId]);
    for (let hop = 0; hop < maxHops; hop++) {
      const next = /* @__PURE__ */ new Set();
      const neighborMap = await this.edgeRepo.getNeighborIdsMap(Array.from(frontier));
      for (const [, neighbors] of neighborMap) {
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            next.add(neighborId);
          }
        }
      }
      frontier = next;
      if (!frontier.size) break;
    }
    visited.delete(startNodeId);
    return visited;
  }
  /**
   * Per-doc tag bundles and global-ish counts. Uses `mobius_edge.type` (tagged_topic / functional / keyword / context).
   */
  async getTagsByDocIds(docIds) {
    const emptyMaps = () => ({
      idMapToTags: /* @__PURE__ */ new Map(),
      topicTagCounts: /* @__PURE__ */ new Map(),
      functionalTagCounts: /* @__PURE__ */ new Map(),
      keywordTagCounts: /* @__PURE__ */ new Map(),
      timeTagCounts: /* @__PURE__ */ new Map(),
      geoTagCounts: /* @__PURE__ */ new Map(),
      personTagCounts: /* @__PURE__ */ new Map()
    });
    if (docIds === void 0) {
      const edgeCounts = await this.edgeRepo.getTagCategoryEdgeCountsByToNode();
      if (!edgeCounts.length) {
        return emptyMaps();
      }
      const toNodeIds = [...new Set(edgeCounts.map((e) => e.to_node_id))];
      const nodeMap = await this.nodeRepo.getByIds(toNodeIds);
      const topicTagCounts2 = /* @__PURE__ */ new Map();
      const functionalTagCounts2 = /* @__PURE__ */ new Map();
      const keywordTagCounts2 = /* @__PURE__ */ new Map();
      const timeTagCounts2 = /* @__PURE__ */ new Map();
      const geoTagCounts2 = /* @__PURE__ */ new Map();
      const personTagCounts2 = /* @__PURE__ */ new Map();
      for (const { to_node_id, count } of edgeCounts) {
        const node = nodeMap.get(to_node_id);
        if (!node) continue;
        if (node.type === GraphNodeType.TopicTag) {
          topicTagCounts2.set(node.label, (topicTagCounts2.get(node.label) ?? 0) + count);
        } else if (node.type === GraphNodeType.FunctionalTag) {
          functionalTagCounts2.set(node.label, (functionalTagCounts2.get(node.label) ?? 0) + count);
        } else if (node.type === GraphNodeType.KeywordTag) {
          keywordTagCounts2.set(node.label, (keywordTagCounts2.get(node.label) ?? 0) + count);
        } else if (node.type === GraphNodeType.ContextTag) {
          const ax = contextAxisFromGraphNode(node);
          if (ax === "time") {
            timeTagCounts2.set(node.label, (timeTagCounts2.get(node.label) ?? 0) + count);
          } else if (ax === "geo") {
            geoTagCounts2.set(node.label, (geoTagCounts2.get(node.label) ?? 0) + count);
          } else if (ax === "person") {
            personTagCounts2.set(node.label, (personTagCounts2.get(node.label) ?? 0) + count);
          }
        }
      }
      return {
        idMapToTags: /* @__PURE__ */ new Map(),
        topicTagCounts: topicTagCounts2,
        functionalTagCounts: functionalTagCounts2,
        keywordTagCounts: keywordTagCounts2,
        timeTagCounts: timeTagCounts2,
        geoTagCounts: geoTagCounts2,
        personTagCounts: personTagCounts2
      };
    }
    const taggedEdges = await this.edgeRepo.getByFromNodesAndTypes(docIds, [...GRAPH_TAGGED_EDGE_TYPES]);
    const nodeById = await this.nodeRepo.getByIds(taggedEdges.map((edge) => edge.to_node_id));
    const topicTagCounts = /* @__PURE__ */ new Map();
    const functionalTagCounts = /* @__PURE__ */ new Map();
    const keywordTagCounts = /* @__PURE__ */ new Map();
    const timeTagCounts = /* @__PURE__ */ new Map();
    const geoTagCounts = /* @__PURE__ */ new Map();
    const personTagCounts = /* @__PURE__ */ new Map();
    for (const edge of taggedEdges) {
      const node = nodeById.get(edge.to_node_id);
      if (!node) continue;
      if (edge.type === GraphEdgeType.TaggedTopic) {
        topicTagCounts.set(node.label, (topicTagCounts.get(node.label) ?? 0) + 1);
      } else if (edge.type === GraphEdgeType.TaggedFunctional) {
        functionalTagCounts.set(node.label, (functionalTagCounts.get(node.label) ?? 0) + 1);
      } else if (edge.type === GraphEdgeType.TaggedKeyword) {
        keywordTagCounts.set(node.label, (keywordTagCounts.get(node.label) ?? 0) + 1);
      } else if (edge.type === GraphEdgeType.TaggedContext) {
        const ax = contextAxisFromGraphNode(node);
        if (ax === "time") {
          timeTagCounts.set(node.label, (timeTagCounts.get(node.label) ?? 0) + 1);
        } else if (ax === "geo") {
          geoTagCounts.set(node.label, (geoTagCounts.get(node.label) ?? 0) + 1);
        } else if (ax === "person") {
          personTagCounts.set(node.label, (personTagCounts.get(node.label) ?? 0) + 1);
        }
      }
    }
    const map = /* @__PURE__ */ new Map();
    for (const edge of taggedEdges) {
      const n = nodeById.get(edge.to_node_id);
      if (!n) continue;
      if (!map.has(edge.from_node_id)) {
        map.set(edge.from_node_id, {
          topicTags: [],
          topicTagEntries: [],
          functionalTagEntries: [],
          keywordTags: [],
          timeTags: [],
          geoTags: [],
          personTags: []
        });
      }
      const row = map.get(edge.from_node_id);
      if (edge.type === GraphEdgeType.TaggedTopic) {
        const qualifier = parseFunctionalQualifierFromEdgeAttributes(edge.attributes);
        const entry = qualifier ? { id: n.label, label: qualifier } : { id: n.label };
        row.topicTagEntries.push(entry);
        row.topicTags.push(n.label);
      } else if (edge.type === GraphEdgeType.TaggedFunctional) {
        const qualifier = parseFunctionalQualifierFromEdgeAttributes(edge.attributes);
        row.functionalTagEntries.push(
          qualifier ? { id: n.label, label: qualifier } : { id: n.label }
        );
      } else if (edge.type === GraphEdgeType.TaggedKeyword) {
        row.keywordTags.push(n.label);
      } else if (edge.type === GraphEdgeType.TaggedContext) {
        const ax = contextAxisFromGraphNode(n);
        if (ax === "time") row.timeTags.push(n.label);
        else if (ax === "geo") row.geoTags.push(n.label);
        else if (ax === "person") row.personTags.push(n.label);
      }
    }
    return {
      idMapToTags: map,
      topicTagCounts,
      functionalTagCounts,
      keywordTagCounts,
      timeTagCounts,
      geoTagCounts,
      personTagCounts
    };
  }
};
function contextAxisFromGraphNode(node) {
  if (node.type !== GraphNodeType.ContextTag) return null;
  try {
    const a = JSON.parse(node.attributes || "{}");
    if (a.axis === "time" || a.axis === "geo" || a.axis === "person") return a.axis;
  } catch {
  }
  if (node.label.startsWith("Time")) return "time";
  if (node.label.startsWith("Geo")) return "geo";
  if (node.label.startsWith("Person")) return "person";
  return null;
}

// src/core/storage/sqlite/repositories/ChatProjectRepo.ts
var ChatProjectRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Check if project exists by project_id.
   */
  async existsByProjectId(projectId) {
    const row = await this.db.selectFrom("chat_project").select("project_id").where("project_id", "=", projectId).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new chat project.
   */
  async insert(project) {
    await this.db.insertInto("chat_project").values(project).execute();
  }
  /**
   * Update existing chat project by project_id.
   */
  async updateByProjectId(projectId, updates) {
    await this.db.updateTable("chat_project").set(updates).where("project_id", "=", projectId).execute();
  }
  /**
   * Upsert project metadata.
   */
  async upsertProject(params) {
    const exists = await this.existsByProjectId(params.projectId);
    if (exists) {
      await this.updateByProjectId(params.projectId, {
        name: params.name,
        folder_rel_path: params.folderRelPath,
        updated_at_ts: params.updatedAtTs,
        archived_rel_path: params.archivedRelPath ?? null,
        meta_json: params.metaJson ?? null
      });
    } else {
      await this.insert({
        project_id: params.projectId,
        name: params.name,
        folder_rel_path: params.folderRelPath,
        created_at_ts: params.createdAtTs,
        updated_at_ts: params.updatedAtTs,
        archived_rel_path: params.archivedRelPath ?? null,
        meta_json: params.metaJson ?? null
      });
    }
  }
  /**
   * Get project by ID.
   */
  async getById(projectId) {
    const row = await this.db.selectFrom("chat_project").selectAll().where("project_id", "=", projectId).executeTakeFirst();
    return row ?? null;
  }
  /**
   * List all projects (excluding archived by default).
   */
  async listProjects(includeArchived = false) {
    let query2 = this.db.selectFrom("chat_project").selectAll();
    if (!includeArchived) {
      query2 = query2.where("archived_rel_path", "is", null);
    }
    return query2.orderBy("updated_at_ts", "desc").execute();
  }
  /**
   * Delete project by project_id.
   */
  async deleteByProjectId(projectId) {
    await this.db.deleteFrom("chat_project").where("project_id", "=", projectId).execute();
  }
};

// src/core/storage/sqlite/repositories/ChatConversationRepo.ts
var ChatConversationRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Check if conversation exists by conversation_id.
   */
  async existsByConversationId(conversationId) {
    const row = await this.db.selectFrom("chat_conversation").select("conversation_id").where("conversation_id", "=", conversationId).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new chat conversation.
   */
  async insert(conversation) {
    await this.db.insertInto("chat_conversation").values(conversation).execute();
  }
  /**
   * Update existing chat conversation by conversation_id.
   */
  async updateByConversationId(conversationId, updates) {
    await this.db.updateTable("chat_conversation").set(updates).where("conversation_id", "=", conversationId).execute();
  }
  /**
   * Upsert conversation metadata.
   */
  async upsertConversation(params) {
    const exists = await this.existsByConversationId(params.conversationId);
    if (exists) {
      await this.updateByConversationId(params.conversationId, {
        project_id: params.projectId ?? null,
        title: params.title,
        file_rel_path: params.fileRelPath,
        updated_at_ts: params.updatedAtTs,
        active_model: params.activeModel ?? null,
        active_provider: params.activeProvider ?? null,
        token_usage_total: params.tokenUsageTotal ?? null,
        title_manually_edited: params.titleManuallyEdited ? 1 : 0,
        title_auto_updated: params.titleAutoUpdated ? 1 : 0,
        context_last_updated_ts: params.contextLastUpdatedTimestamp ?? null,
        context_last_message_index: params.contextLastMessageIndex ?? null,
        archived_rel_path: params.archivedRelPath ?? null,
        meta_json: params.metaJson ?? null
      });
    } else {
      await this.insert({
        conversation_id: params.conversationId,
        project_id: params.projectId ?? null,
        title: params.title,
        file_rel_path: params.fileRelPath,
        created_at_ts: params.createdAtTs,
        updated_at_ts: params.updatedAtTs,
        active_model: params.activeModel ?? null,
        active_provider: params.activeProvider ?? null,
        token_usage_total: params.tokenUsageTotal ?? null,
        title_manually_edited: params.titleManuallyEdited ? 1 : 0,
        title_auto_updated: params.titleAutoUpdated ? 1 : 0,
        context_last_updated_ts: params.contextLastUpdatedTimestamp ?? null,
        context_last_message_index: params.contextLastMessageIndex ?? null,
        archived_rel_path: params.archivedRelPath ?? null,
        meta_json: params.metaJson ?? null
      });
    }
  }
  /**
   * Get conversation by ID.
   */
  async getById(conversationId) {
    const row = await this.db.selectFrom("chat_conversation").selectAll().where("conversation_id", "=", conversationId).executeTakeFirst();
    return row ?? null;
  }
  /**
   * List conversations by project (null for root conversations).
   */
  async listByProject(projectId, includeArchived = false, limit, offset) {
    let query2 = this.db.selectFrom("chat_conversation").selectAll();
    if (projectId === null) {
      query2 = query2.where("project_id", "is", null);
    } else {
      query2 = query2.where("project_id", "=", projectId);
    }
    if (!includeArchived) {
      query2 = query2.where("archived_rel_path", "is", null);
    }
    query2 = query2.orderBy("updated_at_ts", "desc");
    if (offset !== void 0) {
      query2 = query2.offset(offset);
    }
    if (limit !== void 0) {
      query2 = query2.limit(limit);
    }
    return query2.execute();
  }
  /**
   * Count conversations by project (null for root conversations).
   */
  async countByProject(projectId, includeArchived = false) {
    let query2 = this.db.selectFrom("chat_conversation").select(this.db.fn.countAll().as("count"));
    if (projectId === null) {
      query2 = query2.where("project_id", "is", null);
    } else {
      query2 = query2.where("project_id", "=", projectId);
    }
    if (!includeArchived) {
      query2 = query2.where("archived_rel_path", "is", null);
    }
    const result = await query2.executeTakeFirst();
    return Number(result?.count ?? 0);
  }
  /**
   * Update file path when conversation is moved/renamed.
   */
  async updateFilePath(conversationId, newFileRelPath, newArchivedRelPath) {
    await this.db.updateTable("chat_conversation").set({
      file_rel_path: newFileRelPath,
      archived_rel_path: newArchivedRelPath ?? null
    }).where("conversation_id", "=", conversationId).execute();
  }
  /**
   * Get all conversations with file paths (for orphan cleanup).
   */
  async getAllWithFilePaths() {
    return this.db.selectFrom("chat_conversation").select(["conversation_id", "file_rel_path", "archived_rel_path"]).execute();
  }
  /**
   * Delete conversations by IDs.
   */
  async deleteByConversationIds(conversationIds) {
    if (conversationIds.length === 0) return;
    await this.db.deleteFrom("chat_conversation").where("conversation_id", "in", conversationIds).execute();
  }
};

// src/core/utils/hash-utils.ts
var import_crypto2 = require("crypto");
function computeHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}
function hashString(str, minLength = 8) {
  const hash = computeHash(str);
  return Math.abs(hash).toString(16).padStart(minLength, "0");
}
function binaryContentHash(data) {
  let buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else {
    buffer = Buffer.from(data);
  }
  return (0, import_crypto2.createHash)("md5").update(buffer).digest("hex");
}
function hashMD5(str) {
  try {
    return (0, import_crypto2.createHash)("md5").update(str).digest("hex");
  } catch (error) {
    console.warn("MD5 hash not available, using simple hash fallback:", error);
    return hashString(str, 32);
  }
}

// src/core/storage/sqlite/repositories/ChatMessageRepo.ts
var ChatMessageRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Check if message exists by message_id.
   */
  async existsByMessageId(messageId) {
    const row = await this.db.selectFrom("chat_message").select("message_id").where("message_id", "=", messageId).executeTakeFirst();
    return row !== void 0;
  }
  /**
   * Insert new chat message.
   */
  async insert(message) {
    await this.db.insertInto("chat_message").values(message).execute();
  }
  /**
   * Update existing chat message by message_id.
   */
  async updateByMessageId(messageId, updates) {
    await this.db.updateTable("chat_message").set(updates).where("message_id", "=", messageId).execute();
  }
  /**
   * Upsert messages for a conversation.
   */
  async upsertMessages(conversationId, messages) {
    if (messages.length === 0) return;
    for (const msg of messages) {
      const messageData = {
        message_id: msg.id,
        conversation_id: conversationId,
        role: msg.role,
        content_hash: hashMD5(msg.content),
        created_at_ts: msg.createdAtTimestamp,
        created_at_zone: msg.createdAtZone,
        model: msg.model ?? null,
        provider: msg.provider ?? null,
        starred: msg.starred ? 1 : 0,
        is_error: msg.isErrorMessage ? 1 : 0,
        is_visible: msg.isVisible !== false ? 1 : 0,
        gen_time_ms: msg.genTimeMs ?? null,
        token_usage_json: msg.tokenUsage ? JSON.stringify(msg.tokenUsage) : null,
        thinking: msg.reasoning?.content ?? null
      };
      const exists = await this.existsByMessageId(msg.id);
      if (exists) {
        await this.updateByMessageId(msg.id, {
          conversation_id: conversationId,
          role: msg.role,
          content_hash: hashMD5(msg.content),
          created_at_ts: msg.createdAtTimestamp,
          created_at_zone: msg.createdAtZone,
          model: msg.model ?? null,
          provider: msg.provider ?? null,
          starred: msg.starred ? 1 : 0,
          is_error: msg.isErrorMessage ? 1 : 0,
          is_visible: msg.isVisible !== false ? 1 : 0,
          gen_time_ms: msg.genTimeMs ?? null,
          token_usage_json: msg.tokenUsage ? JSON.stringify(msg.tokenUsage) : null,
          thinking: msg.reasoning?.content ?? null
        });
      } else {
        await this.insert(messageData);
      }
    }
  }
  /**
   * List messages for a conversation, ordered by creation time.
   */
  async listByConversation(conversationId) {
    return this.db.selectFrom("chat_message").selectAll().where("conversation_id", "=", conversationId).orderBy("created_at_ts", "asc").execute();
  }
  /**
   * Update starred status for a message.
   * Optionally updates content preview and attachment summary when starring.
   */
  async updateStarred(messageId, starred, contentPreview, attachmentSummary) {
    const updateData = {
      starred: starred ? 1 : 0
    };
    if (starred) {
      if (contentPreview !== void 0) {
        updateData.content_preview = contentPreview || null;
      }
      if (attachmentSummary !== void 0) {
        updateData.attachment_summary = attachmentSummary || null;
      }
    } else {
      updateData.content_preview = null;
      updateData.attachment_summary = null;
    }
    await this.db.updateTable("chat_message").set(updateData).where("message_id", "=", messageId).execute();
  }
  /**
   * List starred messages for a project by joining with chat_conversation table.
   */
  async listStarredByProject(projectId) {
    return this.db.selectFrom("chat_message").innerJoin("chat_conversation", "chat_message.conversation_id", "chat_conversation.conversation_id").selectAll("chat_message").where("chat_conversation.project_id", "=", projectId).where("chat_message.starred", "=", 1).orderBy("chat_message.created_at_ts", "desc").execute();
  }
  /**
   * Count messages for a conversation (lightweight operation).
   */
  async countByConversation(conversationId) {
    const result = await this.db.selectFrom("chat_message").select(({ fn }) => fn.count("message_id").as("count")).where("conversation_id", "=", conversationId).where("is_visible", "=", 1).executeTakeFirst();
    return result?.count ?? 0;
  }
  /**
   * Batch-update topic field for multiple messages.
   */
  async updateTopics(assignments) {
    for (const { messageId, topic } of assignments) {
      await this.db.updateTable("chat_message").set({ topic }).where("message_id", "=", messageId).execute();
    }
  }
  /**
   * Delete all messages for the given conversation IDs.
   */
  async deleteByConversationIds(conversationIds) {
    if (conversationIds.length === 0) return;
    await this.db.deleteFrom("chat_message").where("conversation_id", "in", conversationIds).execute();
  }
};

// src/core/storage/sqlite/repositories/ChatMessageResourceRepo.ts
var ChatMessageResourceRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Replace all resources for a message (delete old, insert new).
   */
  async replaceForMessage(messageId, resources) {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom("chat_message_resource").where("message_id", "=", messageId).execute();
      if (resources.length > 0) {
        const values = resources.map((res) => ({
          id: res.id || `${messageId}-${res.source}`,
          message_id: messageId,
          source: res.source,
          kind: res.kind ?? null,
          summary_note_rel_path: res.summaryNotePath ?? null,
          meta_json: null
          // Reserved for future extension
        }));
        await trx.insertInto("chat_message_resource").values(values).execute();
      }
    });
  }
  /**
   * Get all resources for a message.
   */
  async getByMessageId(messageId) {
    return this.db.selectFrom("chat_message_resource").selectAll().where("message_id", "=", messageId).execute();
  }
  /**
   * Get resources for multiple messages.
   */
  async getByMessageIds(messageIds) {
    if (messageIds.length === 0) return /* @__PURE__ */ new Map();
    const rows = await this.db.selectFrom("chat_message_resource").selectAll().where("message_id", "in", messageIds).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const existing = result.get(row.message_id) || [];
      existing.push(row);
      result.set(row.message_id, existing);
    }
    return result;
  }
  /**
   * Delete resources for the given message IDs.
   */
  async deleteByMessageIds(messageIds) {
    if (messageIds.length === 0) return;
    await this.db.deleteFrom("chat_message_resource").where("message_id", "in", messageIds).execute();
  }
};

// src/core/storage/sqlite/repositories/ChatStarRepo.ts
var ChatStarRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * List all active starred messages.
   */
  async listActive() {
    return this.db.selectFrom("chat_star").selectAll().where("active", "=", 1).orderBy("created_at_ts", "desc").execute();
  }
  /**
   * Delete star records for the given conversation IDs.
   */
  async deleteByConversationIds(conversationIds) {
    if (conversationIds.length === 0) return;
    await this.db.deleteFrom("chat_star").where("conversation_id", "in", conversationIds).execute();
  }
};

// src/core/storage/sqlite/repositories/AIAnalysisRepo.ts
var AIAnalysisRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Insert a record. If vault_rel_path already exists, do nothing.
   */
  async insertOrIgnore(record) {
    await this.db.insertInto("ai_analysis_record").values(record).onConflict((oc) => oc.column("vault_rel_path").doNothing()).execute();
  }
  /**
   * List records ordered by created_at_ts desc.
   */
  async list(params) {
    const limit = Math.max(1, Math.min(200, params.limit || 20));
    const offset = Math.max(0, params.offset || 0);
    return this.db.selectFrom("ai_analysis_record").selectAll().orderBy("created_at_ts", "desc").limit(limit).offset(offset).execute();
  }
  async search(query2, params) {
    const limit = Math.max(1, Math.min(200, params.limit || 20));
    const offset = Math.max(0, params.offset || 0);
    const pattern = `%${query2}%`;
    return this.db.selectFrom("ai_analysis_record").selectAll().where((eb) => eb.or([
      eb("query", "like", pattern),
      eb("title", "like", pattern)
    ])).orderBy("created_at_ts", "desc").limit(limit).offset(offset).execute();
  }
  async searchCount(query2) {
    const pattern = `%${query2}%`;
    const row = await this.db.selectFrom("ai_analysis_record").select((eb) => eb.fn.countAll().as("cnt")).where((eb) => eb.or([
      eb("query", "like", pattern),
      eb("title", "like", pattern)
    ])).executeTakeFirstOrThrow();
    return Number(row.cnt);
  }
  /**
   * Count records.
   */
  async count() {
    const row = await this.db.selectFrom("ai_analysis_record").select((eb) => eb.fn.countAll().as("cnt")).executeTakeFirst();
    return Number(row?.cnt ?? 0);
  }
  /**
   * Find analyses related to a document by checking if the query contains
   * the document filename or path fragment.
   */
  async listByDocumentHint(docName, limit = 10) {
    const safeLimit = Math.max(1, Math.min(50, limit));
    return this.db.selectFrom("ai_analysis_record").selectAll().where("query", "like", `%${docName}%`).orderBy("created_at_ts", "desc").limit(safeLimit).execute();
  }
  /**
   * Return the most frequently used queries, ranked by usage count then recency.
   */
  async frequentQueries(limit = 5) {
    const safeLimit = Math.max(1, Math.min(50, limit));
    const rows = await this.db.selectFrom("ai_analysis_record").select((eb) => [
      "query",
      eb.fn.count("query").as("cnt")
    ]).where("query", "is not", null).where("query", "!=", "").groupBy("query").orderBy("cnt", "desc").orderBy((eb) => eb.fn.max("created_at_ts"), "desc").limit(safeLimit).execute();
    return rows.map((r) => ({ query: r.query, count: Number(r.cnt) }));
  }
  /**
   * Delete all records (metadata only).
   */
  async deleteAll() {
    await this.db.deleteFrom("ai_analysis_record").execute();
  }
};

// src/core/storage/sqlite/repositories/QueryPatternRepo.ts
var import_kysely5 = require("kysely");
var QueryPatternRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Insert a new pattern. If the id already exists, do nothing.
   */
  async insert(record) {
    await this.db.insertInto("query_pattern").values(record).onConflict((oc) => oc.column("id").doNothing()).execute();
  }
  /**
   * List active (non-deprecated) patterns ordered by usage_count DESC,
   * then discovered_at DESC (newest first on ties).
   */
  async listActive() {
    return this.db.selectFrom("query_pattern").selectAll().where("deprecated", "=", 0).orderBy("usage_count", "desc").orderBy("discovered_at", "desc").execute();
  }
  /**
   * List all patterns regardless of deprecated status.
   */
  async listAll() {
    return this.db.selectFrom("query_pattern").selectAll().orderBy("usage_count", "desc").orderBy("discovered_at", "desc").execute();
  }
  /**
   * Increment usage_count by 1 and update last_used_at to now.
   */
  async incrementUsage(id) {
    await this.db.updateTable("query_pattern").set({
      usage_count: import_kysely5.sql`usage_count + 1`,
      last_used_at: Date.now()
    }).where("id", "=", id).execute();
  }
  /**
   * Mark a single pattern as deprecated.
   */
  async deprecate(id) {
    await this.db.updateTable("query_pattern").set({ deprecated: 1 }).where("id", "=", id).execute();
  }
  /**
   * Deprecate stale discovered patterns: those with source='discovered',
   * usage_count=0, and discovered_at older than maxAgeDays.
   */
  async deprecateStale(maxAgeDays) {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1e3;
    await this.db.updateTable("query_pattern").set({ deprecated: 1 }).where("source", "=", "discovered").where("usage_count", "=", 0).where("discovered_at", "<", cutoff).execute();
  }
  /**
   * Total row count (all patterns, including deprecated).
   */
  async count() {
    const row = await this.db.selectFrom("query_pattern").select((eb) => eb.fn.countAll().as("cnt")).executeTakeFirst();
    return Number(row?.cnt ?? 0);
  }
  /**
   * Returns true when the table has no rows at all.
   */
  async isEmpty() {
    return await this.count() === 0;
  }
};

// src/core/storage/sqlite/repositories/UserProfileProcessedHashRepo.ts
var UserProfileProcessedHashRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Insert a hash (idempotent: ignore if exists).
   */
  async insert(contentHash) {
    const now = Date.now();
    await this.db.insertInto("user_profile_processed_hash").values({ content_hash: contentHash, processed_at: now }).onConflict((oc) => oc.column("content_hash").doNothing()).execute();
  }
  /**
   * Insert multiple hashes in one go.
   */
  async insertMany(hashes) {
    if (hashes.length === 0) return;
    const now = Date.now();
    await this.db.insertInto("user_profile_processed_hash").values(hashes.map((content_hash) => ({ content_hash, processed_at: now }))).onConflict((oc) => oc.column("content_hash").doNothing()).execute();
  }
  /**
   * Check if hash exists (single lookup).
   */
  async has(contentHash) {
    const row = await this.db.selectFrom("user_profile_processed_hash").select("content_hash").where("content_hash", "=", contentHash).executeTakeFirst();
    return row != null;
  }
  /**
   * Load all hashes into a Set (for batch filter). Or return array.
   */
  async loadAllHashes() {
    const rows = await this.db.selectFrom("user_profile_processed_hash").select("content_hash").execute();
    return new Set(rows.map((r) => r.content_hash));
  }
  /**
   * Clear all records (e.g. for full re-run).
   */
  async clearAll() {
    await this.db.deleteFrom("user_profile_processed_hash").execute();
  }
};

// src/core/storage/sqlite/repositories/CascadeDebtRepo.ts
var CascadeDebtRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Insert a new debt record, or update the existing unprocessed one if the new priority is higher.
   */
  async insertOrUpdatePriority(record) {
    const existing = await this.db.selectFrom("cascade_debt").select(["id", "priority"]).where("tenant", "=", record.tenant).where("target_id", "=", record.targetId).where("debt_type", "=", record.debtType).where("processed_at", "is", null).executeTakeFirst();
    if (existing) {
      if (record.priority < existing.priority) {
        await this.db.updateTable("cascade_debt").set({
          priority: record.priority,
          change_magnitude: record.changeMagnitude ?? null,
          source_path: record.sourcePath
        }).where("id", "=", existing.id).execute();
      }
      return;
    }
    await this.db.insertInto("cascade_debt").values({
      tenant: record.tenant,
      source_path: record.sourcePath,
      target_id: record.targetId,
      debt_type: record.debtType,
      priority: record.priority,
      change_magnitude: record.changeMagnitude ?? null,
      created_at: record.createdAt,
      processed_at: null
    }).execute();
  }
  /**
   * Fetch the next batch of unprocessed debt items, ordered by priority then age (oldest first).
   */
  async drainPending(tenant, limit) {
    const rows = await this.db.selectFrom("cascade_debt").selectAll().where("tenant", "=", tenant).where("processed_at", "is", null).orderBy("priority", "asc").orderBy("created_at", "asc").limit(limit).execute();
    return rows.map((r) => ({
      id: r.id,
      tenant: r.tenant,
      sourcePath: r.source_path,
      targetId: r.target_id,
      debtType: r.debt_type,
      priority: r.priority,
      changeMagnitude: r.change_magnitude,
      createdAt: r.created_at,
      processedAt: r.processed_at
    }));
  }
  /**
   * Mark debt items as processed by their IDs.
   */
  async markProcessed(ids) {
    if (ids.length === 0) return;
    const now = Date.now();
    await this.db.updateTable("cascade_debt").set({ processed_at: now }).where("id", "in", ids).execute();
  }
  /**
   * Count unprocessed debt items for the given tenant.
   */
  async pendingCount(tenant) {
    const result = await this.db.selectFrom("cascade_debt").select((eb) => eb.fn.countAll().as("cnt")).where("tenant", "=", tenant).where("processed_at", "is", null).executeTakeFirstOrThrow();
    return result.cnt;
  }
  /**
   * Delete processed debt records older than the given age (default: 24 hours).
   */
  async clearProcessed(olderThanMs = 24 * 60 * 60 * 1e3) {
    const cutoff = Date.now() - olderThanMs;
    await this.db.deleteFrom("cascade_debt").where("processed_at", "is not", null).where("processed_at", "<", cutoff).execute();
  }
};

// src/core/storage/sqlite/repositories/AmbientPushRepo.ts
var AmbientPushRepo = class {
  constructor(db) {
    this.db = db;
  }
  /**
   * Insert a push record.
   */
  async logPush(params) {
    await this.db.insertInto("ambient_push_log").values({
      id: void 0,
      // AUTOINCREMENT
      timestamp: params.timestamp,
      trigger_type: params.triggerType,
      source_file_path: params.sourceFilePath,
      context_paragraph: params.contextParagraph,
      pushed_file_path: params.pushedFilePath,
      pushed_score: params.pushedScore,
      explanation_type: params.explanationType,
      explanation_text: params.explanationText,
      user_action: null,
      user_action_ts: null
    }).execute();
  }
  /**
   * Update user_action on the most recent matching push (source + pushed pair).
   */
  async recordAction(params) {
    const row = await this.db.selectFrom("ambient_push_log").select("id").where("source_file_path", "=", params.sourceFilePath).where("pushed_file_path", "=", params.pushedFilePath).orderBy("timestamp", "desc").limit(1).executeTakeFirst();
    if (!row || row.id == null) return;
    await this.db.updateTable("ambient_push_log").set({
      user_action: params.action,
      user_action_ts: params.actionTs
    }).where("id", "=", row.id).execute();
  }
  /**
   * Get Set of `source::pushed` pairs dismissed in last N days.
   * Used to suppress re-pushing recently dismissed suggestions.
   */
  async getDismissedPairs(withinDays) {
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1e3;
    const rows = await this.db.selectFrom("ambient_push_log").select(["source_file_path", "pushed_file_path"]).where("user_action", "=", "dismissed").where("user_action_ts", ">=", cutoff).execute();
    const pairs = /* @__PURE__ */ new Set();
    for (const row of rows) {
      pairs.add(`${row.source_file_path}::${row.pushed_file_path}`);
    }
    return pairs;
  }
  /**
   * Get (source, pushed) pairs with positive feedback (opened/linked) in last N days.
   * Returns a Map of `source::pushed` → action count for score boosting.
   */
  async getPositivePairs(withinDays) {
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1e3;
    const rows = await this.db.selectFrom("ambient_push_log").select(["source_file_path", "pushed_file_path"]).select((eb) => eb.fn.count("id").as("cnt")).where("user_action", "in", ["opened", "linked"]).where("user_action_ts", ">=", cutoff).groupBy(["source_file_path", "pushed_file_path"]).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      result.set(`${row.source_file_path}::${row.pushed_file_path}`, row.cnt);
    }
    return result;
  }
  /**
   * Get (source, pushed) pairs that were ignored (no user action) in last N days.
   * Returns a Map of `source::pushed` → ignore count for score penalty.
   */
  async getIgnoredPenalties(withinDays) {
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1e3;
    const rows = await this.db.selectFrom("ambient_push_log").select(["source_file_path", "pushed_file_path"]).select((eb) => eb.fn.count("id").as("cnt")).where("user_action", "is", null).where("timestamp", ">=", cutoff).where("timestamp", "<=", Date.now() - 5 * 60 * 1e3).groupBy(["source_file_path", "pushed_file_path"]).execute();
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      result.set(`${row.source_file_path}::${row.pushed_file_path}`, row.cnt);
    }
    return result;
  }
};

// src/core/storage/sqlite/SqliteStoreManager.ts
var SqliteStoreManager = class _SqliteStoreManager {
  constructor() {
    // Database connections
    this.searchStore = null;
    this.metaStore = null;
    this.app = null;
    this.isVectorSearchAvailable = false;
    /** Set at start of close() so getters throw and no new work starts; avoids in-flight DB ops after close. */
    this.closing = false;
    // Search database repositories (vault tenant)
    this.indexedDocumentRepo = null;
    this.docChunkRepo = null;
    this.embeddingRepo = null;
    this.indexStateRepo = null;
    this.graphRepo = null;
    this.userProfileProcessedHashRepo = null;
    this.mobiusNodeRepo = null;
    this.mobiusEdgeRepo = null;
    this.cascadeDebtRepo = null;
    this.ambientPushRepo = null;
    // Meta database repositories (chat tenant + chat-only tables)
    this.indexedDocumentRepoChat = null;
    this.docChunkRepoChat = null;
    this.embeddingRepoChat = null;
    this.indexStateRepoChat = null;
    this.graphRepoChat = null;
    this.mobiusNodeRepoChat = null;
    this.mobiusEdgeRepoChat = null;
    this.mobiusOperationRepo = null;
    this.chatProjectRepo = null;
    this.chatConversationRepo = null;
    this.chatMessageRepo = null;
    this.chatMessageResourceRepo = null;
    this.chatStarRepo = null;
    this.aiAnalysisRepo = null;
    this.queryPatternRepo = null;
    this.cascadeDebtRepoChat = null;
  }
  static {
    this.instance = null;
  }
  static getInstance() {
    if (!_SqliteStoreManager.instance) {
      _SqliteStoreManager.instance = new _SqliteStoreManager();
    }
    return _SqliteStoreManager.instance;
  }
  static clearInstance() {
    if (_SqliteStoreManager.instance) {
      _SqliteStoreManager.instance.close();
      _SqliteStoreManager.instance = null;
    }
  }
  /** Asserts initialized and not closing, returns the repo or throws. */
  requireRepo(repo) {
    if (this.closing || !repo) throw new Error("SqliteStoreManager not initialized or is closing.");
    return repo;
  }
  /** Tenant-aware repo selector. */
  tenantRepo(tenant, vault, chat) {
    return this.requireRepo(tenant === "chat" ? chat : vault);
  }
  async createDatabaseConnection(dbFilePath, settings) {
    await this.selectBackend(settings?.sqliteBackend);
    const result = await BetterSqliteStore.open({ dbFilePath, app: this.app ?? void 0 });
    this.isVectorSearchAvailable = result.sqliteVecAvailable;
    return result.store;
  }
  async selectBackend(userSetting) {
    const available = await BetterSqliteStore.checkAvailable(this.app ?? void 0);
    if (!available) {
      new import_obsidian4.Notice(
        "Peak Assistant: SQLite component failed to load. Search and indexing features are unavailable. Please restart Obsidian or reinstall the plugin.",
        15e3
      );
      throw new Error(
        `better-sqlite3 is required but not available. Runtime ABI: ${process.versions.modules}, platform: ${process.platform}-${process.arch}. NativeModuleManager auto-download may have failed \u2014 check the console for details.`
      );
    }
    if (userSetting === "better-sqlite3") {
      console.log("[SqliteStoreManager] Using better-sqlite3 (user preference)");
    } else {
      console.log("[SqliteStoreManager] Using better-sqlite3 (auto-detected)");
    }
  }
  async buildDatabasePath(app, storageFolder, dbFilename) {
    const basePath = app.vault.adapter?.basePath ?? "";
    const normalizedStorageFolder = (storageFolder ?? "").trim().replace(/^\/+/, "");
    if (normalizedStorageFolder) {
      await ensureFolderRecursive(normalizedStorageFolder, app);
    }
    const dbPath = basePath ? normalizedStorageFolder ? import_path.default.join(basePath, normalizedStorageFolder, dbFilename) : import_path.default.join(basePath, dbFilename) : null;
    if (!dbPath) {
      throw new Error(`SqliteStoreManager init failed: ${dbFilename} database path is missing and vault basePath is unavailable`);
    }
    return dbPath;
  }
  async init(params) {
    if (this.searchStore || this.metaStore) {
      console.warn("SqliteStoreManager already initialized, closing existing connections");
      this.close();
    }
    this.app = params.app;
    const searchDbPath = await this.buildDatabasePath(params.app, params.storageFolder, VAULT_DB_FILENAME);
    this.searchStore = await this.createDatabaseConnection(searchDbPath, params.settings);
    const metaDbPath = await this.buildDatabasePath(params.app, params.storageFolder, CHAT_DB_FILENAME);
    this.metaStore = await this.createDatabaseConnection(metaDbPath, params.settings);
    const searchKdb = this.searchStore.kysely();
    const searchRawDb = this.searchStore;
    this.indexedDocumentRepo = new IndexedDocumentRepo(searchKdb);
    this.docChunkRepo = new DocChunkRepo(searchKdb, searchRawDb);
    this.embeddingRepo = new EmbeddingRepo(searchKdb, searchRawDb, this.indexedDocumentRepo);
    this.embeddingRepo.initializeVecEmbeddingsTableCache();
    this.indexStateRepo = new IndexStateRepo(searchKdb);
    this.mobiusNodeRepo = new MobiusNodeRepo(searchKdb);
    this.mobiusEdgeRepo = new MobiusEdgeRepo(searchKdb);
    this.graphRepo = new GraphRepo(this.mobiusNodeRepo, this.mobiusEdgeRepo);
    this.userProfileProcessedHashRepo = new UserProfileProcessedHashRepo(searchKdb);
    this.cascadeDebtRepo = new CascadeDebtRepo(searchKdb);
    this.ambientPushRepo = new AmbientPushRepo(searchKdb);
    const metaKdb = this.metaStore.kysely();
    this.chatProjectRepo = new ChatProjectRepo(metaKdb);
    this.chatConversationRepo = new ChatConversationRepo(metaKdb);
    this.chatMessageRepo = new ChatMessageRepo(metaKdb);
    this.chatMessageResourceRepo = new ChatMessageResourceRepo(metaKdb);
    this.chatStarRepo = new ChatStarRepo(metaKdb);
    this.aiAnalysisRepo = new AIAnalysisRepo(metaKdb);
    this.queryPatternRepo = new QueryPatternRepo(metaKdb);
    this.indexedDocumentRepoChat = new IndexedDocumentRepo(metaKdb);
    this.docChunkRepoChat = new DocChunkRepo(metaKdb, this.metaStore);
    this.embeddingRepoChat = new EmbeddingRepo(metaKdb, this.metaStore, this.indexedDocumentRepoChat);
    this.embeddingRepoChat.initializeVecEmbeddingsTableCache();
    this.indexStateRepoChat = new IndexStateRepo(metaKdb);
    this.mobiusNodeRepoChat = new MobiusNodeRepo(metaKdb);
    this.mobiusEdgeRepoChat = new MobiusEdgeRepo(metaKdb);
    this.graphRepoChat = new GraphRepo(this.mobiusNodeRepoChat, this.mobiusEdgeRepoChat);
    this.mobiusOperationRepo = new MobiusOperationRepo(metaKdb);
    this.cascadeDebtRepoChat = new CascadeDebtRepo(metaKdb);
  }
  getIndexContext(tenant = "vault") {
    const store = tenant === "chat" ? this.metaStore : this.searchStore;
    if (this.closing || !store) throw new Error("SqliteStoreManager not initialized or is closing.");
    return store.kysely();
  }
  getSearchStore() {
    return this.searchStore;
  }
  getMetaStore() {
    return this.metaStore;
  }
  isInitialized() {
    return !this.closing && this.searchStore !== null && this.metaStore !== null;
  }
  isVectorSearchEnabled() {
    return this.isVectorSearchAvailable;
  }
  // Tenant-aware repos (vault = search.sqlite, chat = meta.sqlite)
  getIndexedDocumentRepo(tenant = "vault") {
    return this.tenantRepo(tenant, this.indexedDocumentRepo, this.indexedDocumentRepoChat);
  }
  getDocChunkRepo(tenant = "vault") {
    return this.tenantRepo(tenant, this.docChunkRepo, this.docChunkRepoChat);
  }
  getEmbeddingRepo(tenant = "vault") {
    return this.tenantRepo(tenant, this.embeddingRepo, this.embeddingRepoChat);
  }
  getIndexStateRepo(tenant = "vault") {
    return this.tenantRepo(tenant, this.indexStateRepo, this.indexStateRepoChat);
  }
  getGraphRepo(tenant = "vault") {
    return this.tenantRepo(tenant, this.graphRepo, this.graphRepoChat);
  }
  getMobiusNodeRepo(tenant = "vault") {
    return this.tenantRepo(tenant, this.mobiusNodeRepo, this.mobiusNodeRepoChat);
  }
  getMobiusEdgeRepo(tenant = "vault") {
    return this.tenantRepo(tenant, this.mobiusEdgeRepo, this.mobiusEdgeRepoChat);
  }
  getCascadeDebtRepo(tenant = "vault") {
    return this.tenantRepo(tenant, this.cascadeDebtRepo, this.cascadeDebtRepoChat);
  }
  // Single-tenant repos
  getMobiusOperationRepo() {
    return this.requireRepo(this.mobiusOperationRepo);
  }
  getUserProfileProcessedHashRepo() {
    return this.requireRepo(this.userProfileProcessedHashRepo);
  }
  getChatProjectRepo() {
    return this.requireRepo(this.chatProjectRepo);
  }
  getChatConversationRepo() {
    return this.requireRepo(this.chatConversationRepo);
  }
  getChatMessageRepo() {
    return this.requireRepo(this.chatMessageRepo);
  }
  getChatMessageResourceRepo() {
    return this.requireRepo(this.chatMessageResourceRepo);
  }
  getChatStarRepo() {
    return this.requireRepo(this.chatStarRepo);
  }
  getAIAnalysisRepo() {
    return this.requireRepo(this.aiAnalysisRepo);
  }
  getQueryPatternRepo() {
    return this.requireRepo(this.queryPatternRepo);
  }
  getAmbientPushRepo() {
    return this.requireRepo(this.ambientPushRepo);
  }
  /** No-op for compatibility. better-sqlite3 persists to file automatically. */
  save() {
  }
  close() {
    this.closing = true;
    try {
      this.searchStore?.close();
      this.metaStore?.close();
    } catch (e) {
      console.warn("[SqliteStoreManager] Error during close (ignored):", e);
    }
    this.searchStore = this.metaStore = null;
    this.app = null;
    this.indexedDocumentRepo = this.docChunkRepo = this.embeddingRepo = this.indexStateRepo = this.graphRepo = null;
    this.mobiusNodeRepo = this.mobiusEdgeRepo = this.cascadeDebtRepo = this.ambientPushRepo = null;
    this.userProfileProcessedHashRepo = null;
    this.indexedDocumentRepoChat = this.docChunkRepoChat = this.embeddingRepoChat = this.indexStateRepoChat = this.graphRepoChat = null;
    this.mobiusNodeRepoChat = this.mobiusEdgeRepoChat = this.mobiusOperationRepo = this.cascadeDebtRepoChat = null;
    this.chatProjectRepo = this.chatConversationRepo = this.chatMessageRepo = null;
    this.chatMessageResourceRepo = this.chatStarRepo = this.aiAnalysisRepo = this.queryPatternRepo = null;
  }
};
var sqliteStoreManager = SqliteStoreManager.getInstance();

// src/core/utils/collection-utils.ts
function mapGetAll(map, keys) {
  const result = [];
  for (const key of keys) {
    if (map.has(key)) {
      result.push(map.get(key));
    }
  }
  return result;
}
var EMPTY_SET = /* @__PURE__ */ new Set();
var EMPTY_MAP = /* @__PURE__ */ new Map();
function emptyMap() {
  return EMPTY_MAP;
}

// src/core/utils/obsidian-utils.ts
var import_obsidian5 = __toESM(require_obsidian_stub());
async function readFileAsText(filePath) {
  try {
    const app = AppContext.getApp();
    const normalizedPath = (0, import_obsidian5.normalizePath)(filePath.startsWith("/") ? filePath.slice(1) : filePath);
    const file = app.vault.getAbstractFileByPath(normalizedPath);
    if (file && file instanceof import_obsidian5.TFile) {
      return await app.vault.read(file);
    }
  } catch (error) {
    console.warn(`[obsidian-utils] Failed to read file as text: ${filePath}`, error);
  }
  return null;
}
function getFileTypeByPath(filePath) {
  const app = AppContext.getApp();
  const path4 = filePath;
  const abstractFile = app.vault.getAbstractFileByPath(path4);
  let itemType = "folder";
  if (abstractFile) {
    if ("extension" in abstractFile) {
      itemType = abstractFile.extension === "md" ? "note" : "file";
    } else {
      itemType = "folder";
    }
  }
  return itemType ?? null;
}

// src/service/tools/search-graph-inspector/boolean-expression-parser.ts
var BooleanExpressionParser = class _BooleanExpressionParser {
  constructor(expression) {
    this.pos = 0;
    this.tokens = [];
    this.expression = expression == null ? "" : String(expression).trim();
    if (!this.expression) {
      throw new Error("Empty expression");
    }
    this.ast = this.parse(this.expression);
  }
  parse(expression) {
    this.pos = 0;
    const input = expression == null ? "" : String(expression).trim();
    this.tokens = this.tokenize(input);
    const result = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token at end of expression: ${this.tokens[this.pos]}`);
    }
    return result;
  }
  /** Extract topic, functional, and keyword values from the AST. */
  extractDimensions() {
    const tags = [];
    const functionals = [];
    const keywords = [];
    const traverse = (expr) => {
      switch (expr.type) {
        case "tag":
          if (expr.value && !tags.includes(expr.value)) tags.push(expr.value);
          break;
        case "functional":
          if (expr.value && !functionals.includes(expr.value)) functionals.push(expr.value);
          break;
        case "keyword":
          if (expr.value && !keywords.includes(expr.value)) keywords.push(expr.value);
          break;
        case "and":
        case "or":
          if (expr.left) traverse(expr.left);
          if (expr.right) traverse(expr.right);
          break;
        case "not":
          if (expr.left) traverse(expr.left);
          break;
      }
    };
    traverse(this.ast);
    return { tags, functionals, keywords };
  }
  rootEvaluate(note) {
    const topic = note.topicTags ?? note.tags ?? [];
    const functionalTagEntries = note.functionalTagEntries?.length ? note.functionalTagEntries : note.category ? [{ id: note.category }] : [];
    const keyword = note.keywordTags ?? [];
    const normalized = { topicTags: topic, functionalTagEntries, keywordTags: keyword };
    return this.evaluate(this.ast, normalized);
  }
  evaluate(expression, note) {
    switch (expression.type) {
      case "tag":
        return note.topicTags?.includes(expression.value) ?? false;
      case "functional":
        return note.functionalTagEntries?.some((e) => e.id === expression.value) ?? false;
      case "keyword":
        return note.keywordTags?.includes(expression.value) ?? false;
      case "and":
        return this.evaluate(expression.left, note) && this.evaluate(expression.right, note);
      case "or":
        return this.evaluate(expression.left, note) || this.evaluate(expression.right, note);
      case "not":
        return !this.evaluate(expression.left, note);
      default:
        return false;
    }
  }
  static {
    this.PREFIXES = [
      { key: "tag:", label: "tag" },
      { key: "functional:", label: "functional" },
      { key: "keyword:", label: "keyword" }
    ];
  }
  static {
    this.OPERATORS = [
      { key: "AND", len: 3 },
      { key: "OR", len: 2 },
      { key: "NOT", len: 3 }
    ];
  }
  tokenize(input) {
    const tokens = [];
    const lower = input.toLowerCase();
    let i = 0;
    while (i < input.length) {
      if (/\s/.test(input[i])) {
        i++;
        continue;
      }
      if (input[i] === "(" || input[i] === ")") {
        tokens.push(input[i++]);
        continue;
      }
      const op = _BooleanExpressionParser.OPERATORS.find((o) => lower.substring(i, i + o.len) === o.key.toLowerCase());
      if (op) {
        tokens.push(op.key);
        i += op.len;
        continue;
      }
      const prefix = _BooleanExpressionParser.PREFIXES.find((p) => lower.substring(i, i + p.key.length) === p.key);
      if (prefix) {
        const start = i;
        i += prefix.key.length;
        while (i < input.length && !/\s/.test(input[i]) && input[i] !== ")" && input[i] !== "(") i++;
        const value = input.substring(start + prefix.key.length, i);
        if (!value) throw new Error(`Invalid ${prefix.label} expression: missing value after ${prefix.key}`);
        tokens.push(prefix.key + value);
        continue;
      }
      throw new Error(`Invalid character at position ${i}: ${input[i]}`);
    }
    return tokens;
  }
  parseExpression() {
    let result = this.parseTerm();
    while (this.pos < this.tokens.length && (this.tokens[this.pos] === "AND" || this.tokens[this.pos] === "OR")) {
      const operator = this.tokens[this.pos++];
      const right = this.parseTerm();
      result = {
        type: operator === "AND" ? "and" : "or",
        left: result,
        right
      };
    }
    return result;
  }
  parseTerm() {
    const token = this.tokens[this.pos];
    if (token === "NOT") {
      this.pos++;
      return { type: "not", left: this.parseTerm() };
    }
    if (token === "(") {
      this.pos++;
      const expr = this.parseExpression();
      if (this.tokens[this.pos] !== ")") throw new Error("Expected closing parenthesis");
      this.pos++;
      return expr;
    }
    const prefix = _BooleanExpressionParser.PREFIXES.find((p) => token.startsWith(p.key));
    if (prefix) {
      this.pos++;
      return { type: prefix.label, value: token.substring(prefix.key.length) };
    }
    throw new Error(`Unexpected token: ${token}`);
  }
};

// src/core/utils/format-utils.ts
var LRUCache = class {
  /**
   * @param ttl 10min
   * @param cleanupInterval 5s
   */
  constructor(maxSize = 100, ttl = 6e5, cleanupInterval = 5e3) {
    this.cache = /* @__PURE__ */ new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cleanupInterval = cleanupInterval;
    this.startCleanupTimer();
  }
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.cache.delete(key));
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return void 0;
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return void 0;
    }
    this.cache.delete(key);
    this.cache.set(key, { value: entry.value, timestamp: now });
    return entry.value;
  }
  set(key, value) {
    const now = Date.now();
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: now });
  }
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  clear() {
    this.cache.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = void 0;
    }
  }
  size() {
    this.cleanup();
    return this.cache.size;
  }
};
var regexCache = new LRUCache(50);
function globToRegexPattern(glob) {
  return glob.split("").map((c) => {
    if (c === "*") return ".*";
    if (c === "?") return ".";
    if (/[.+^${}()|[\]\\]/.test(c)) return "\\" + c;
    return c;
  }).join("");
}
function getCachedRegex(pattern) {
  let regex = regexCache.get(pattern);
  if (!regex) {
    try {
      regex = new RegExp(pattern);
      regexCache.set(pattern, regex);
    } catch (e) {
      try {
        const asRegex = globToRegexPattern(pattern);
        regex = new RegExp(asRegex);
        regexCache.set(pattern, regex);
      } catch (e2) {
        console.error("[getCachedRegex] Error compiling regex:", e);
        regex = /^$/;
      }
    }
  }
  return regex;
}
var semanticDateRangeCache = new LRUCache(30);
var booleanExpressionCache = new LRUCache(50);
function getCachedBooleanExpression(expression) {
  if (!expression) return null;
  const trimmed = String(expression).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return null;
  let parser = booleanExpressionCache.get(expression);
  if (!parser) {
    try {
      parser = new BooleanExpressionParser(expression);
      booleanExpressionCache.set(expression, parser);
    } catch (e) {
      console.warn("[getCachedBooleanExpression] Invalid expression, skipping filter:", trimmed.slice(0, SLICE_CAPS.utils.logExpressionPreview), e);
      return null;
    }
  }
  return parser;
}

// src/service/tools/search-graph-inspector/common.ts
function matchVaultPathByGrepPattern(path4, pattern) {
  const p = String(path4 ?? "");
  const raw = String(pattern ?? "").trim();
  if (!raw) return true;
  try {
    const re = new RegExp(raw, "i");
    return re.test(p);
  } catch {
    return p.toLowerCase().includes(raw.toLowerCase());
  }
}
async function getSemanticNeighbors(docId, limit, filterDocIds = EMPTY_SET, tenant = "vault") {
  const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
  const queryVector = await embeddingRepo.getEmbeddingForSemanticSearch(docId);
  if (!queryVector) {
    return [];
  }
  const searchResults = await embeddingRepo.searchSimilarAndGetId(
    queryVector,
    limit * 2,
    "excludeDocIdsSet",
    { excludeDocIdsSet: filterDocIds }
  );
  const resultDocIds = Array.from(new Set(searchResults.map((r) => r.doc_id)));
  const resultDocNodesMap = await sqliteStoreManager.getMobiusNodeRepo(tenant).getByIds(resultDocIds);
  return searchResults.map((r) => {
    const docId2 = r.doc_id;
    const resultDocNode = resultDocNodesMap.get(docId2);
    if (!resultDocNode) return null;
    return {
      ...resultDocNode,
      // easier to understand for Agent (and user) in percentage form
      similarity: `${(r.similarity * 100).toFixed(1)}%`
    };
  }).filter((n) => n !== null).filter((n) => n.id !== docId).filter((n) => !filterDocIds.has(n.id)).slice(0, limit);
}
async function distillClusterNodesData(nodes, limit, ignoreDocumentNodes = false) {
  const typeNodeMap = {};
  for (const node of nodes) {
    const type = node.type;
    if (!typeNodeMap[type]) {
      typeNodeMap[type] = [];
    }
    typeNodeMap[type].push(node);
  }
  let documentNodes = typeNodeMap[GraphNodeType.Document];
  let omittedDocNodeCnt = 0;
  if (!ignoreDocumentNodes && documentNodes && documentNodes.length > 0) {
    const nodeIds = documentNodes.map((node) => node.id);
    const densityMap = await sqliteStoreManager.getMobiusEdgeRepo().countEdges(nodeIds);
    const docStatisticsMap = await sqliteStoreManager.getMobiusNodeRepo().getByDocIds(nodeIds);
    documentNodes = calculateDocumentRRF(documentNodes, densityMap.total, docStatisticsMap).sort((a, b) => b.rrfScore - a.rrfScore);
    const originalCount = documentNodes.length;
    if (originalCount > limit) {
      documentNodes = documentNodes.slice(0, limit);
      omittedDocNodeCnt = originalCount - limit;
    }
  }
  const tagNodes = typeNodeMap[GraphNodeType.TopicTag];
  const categoryNodes = typeNodeMap[GraphNodeType.FunctionalTag];
  return {
    documentNodes,
    // for all nodes parse tags, categories to one line to save tokens. we do not need to list their details.
    tagDesc: tagNodes?.map((n) => n.label).join(", "),
    categoryDesc: categoryNodes?.map((n) => n.label).join(", "),
    omittedDocNodeCnt: omittedDocNodeCnt > 0 ? omittedDocNodeCnt : void 0
  };
}
function calculateDocumentRRF(nodes, densityMap, docStatisticsMap) {
  const densityRankMap = new Map(
    [...nodes].sort((a, b) => (densityMap.get(b.id) || 0) - (densityMap.get(a.id) || 0)).map((node, index) => [node.id, index + 1])
  );
  const updateTimeRankMap = new Map(
    [...nodes].sort((a, b) => b.updated_at - a.updated_at).map((node, index) => [node.id, index + 1])
  );
  const richnessRankMap = new Map(
    [...nodes].sort((a, b) => {
      const aRich = docStatisticsMap.get(a.id)?.richness_score || 0;
      const bRich = docStatisticsMap.get(b.id)?.richness_score || 0;
      return bRich - aRich;
    }).map((node, index) => [node.id, index + 1])
  );
  const openCountRankMap = new Map(
    [...nodes].sort((a, b) => {
      const aOpens = docStatisticsMap.get(a.id)?.open_count || 0;
      const bOpens = docStatisticsMap.get(b.id)?.open_count || 0;
      return bOpens - aOpens;
    }).map((node, index) => [node.id, index + 1])
  );
  const lastOpenRankMap = new Map(
    [...nodes].sort((a, b) => {
      const aLast = docStatisticsMap.get(a.id)?.last_open_ts || 0;
      const bLast = docStatisticsMap.get(b.id)?.last_open_ts || 0;
      return bLast - aLast;
    }).map((node, index) => [node.id, index + 1])
  );
  const semanticNodes = nodes.filter((n) => n.foundBy === "semantic_neighbors");
  const similarityRankMap = semanticNodes.length > 0 ? new Map(
    [...semanticNodes].sort((a, b) => {
      const aSim = parseFloat(a.similarity) || 0;
      const bSim = parseFloat(b.similarity) || 0;
      return bSim - aSim;
    }).map((node, index) => [node.id, index + 1])
  ) : null;
  return nodes.map((node) => {
    const stats = docStatisticsMap.get(node.id);
    const extendedNode = node;
    const densityRank = (densityRankMap.get(node.id) || nodes.length) - 1;
    const updateTimeRank = (updateTimeRankMap.get(node.id) || nodes.length) - 1;
    const richnessRank = (richnessRankMap.get(node.id) || nodes.length) - 1;
    const openCountRank = (openCountRankMap.get(node.id) || nodes.length) - 1;
    const lastOpenRank = (lastOpenRankMap.get(node.id) || nodes.length) - 1;
    const richnessScore = stats?.richness_score || 0;
    const openCount = stats?.open_count || 0;
    const lastOpenTs = stats?.last_open_ts || 0;
    const densityScore = GRAPH_RRF_WEIGHTS.density * (1 / (RRF_K + densityRank));
    const updateTimeScore = GRAPH_RRF_WEIGHTS.updateTime * (1 / (RRF_K + updateTimeRank));
    const richnessScore_rrf = richnessScore > 0 ? GRAPH_RRF_WEIGHTS.richness * (1 / (RRF_K + richnessRank)) : 0;
    const openCountScore = openCount > 0 ? GRAPH_RRF_WEIGHTS.openCount * (1 / (RRF_K + openCountRank)) : 0;
    const lastOpenScore = lastOpenTs > 0 ? GRAPH_RRF_WEIGHTS.lastOpen * (1 / (RRF_K + lastOpenRank)) : 0;
    let similarityScore_rrf = 0;
    if (extendedNode.foundBy === "semantic_neighbors" && extendedNode.similarity) {
      const similarityScore = parseFloat(extendedNode.similarity) || 0;
      if (similarityScore > 0) {
        const similarityRank = (similarityRankMap?.get(node.id) || semanticNodes.length) - 1;
        similarityScore_rrf = GRAPH_RRF_WEIGHTS.similarity * (1 / (RRF_K + similarityRank));
      }
    }
    const physicalBonus = extendedNode.foundBy === "physical_neighbors" ? PHYSICAL_CONNECTION_BONUS : 0;
    const rrfScore = densityScore + updateTimeScore + richnessScore_rrf + openCountScore + lastOpenScore + similarityScore_rrf + physicalBonus;
    return { ...node, rrfScore };
  });
}
async function getSemanticSearchResults(semanticFilter, scopeMode = "vault", scopeValue) {
  if (!semanticFilter) {
    return [];
  }
  const { query: query2, topK } = semanticFilter;
  try {
    const searchClient = AppContext.getInstance().searchClient;
    const vectorResults = await searchClient.vectorSearch({
      text: query2,
      topK: Math.min(topK, 100),
      scopeMode,
      scopeValue
    });
    const paths = vectorResults.items.map((result) => result.path);
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
    const pathToDocMap = await indexedDocumentRepo.getByPaths(paths);
    const docIdMap = /* @__PURE__ */ new Map();
    for (const [path4, docMeta] of pathToDocMap) {
      docIdMap.set(path4, docMeta.id);
    }
    const semanticResults = vectorResults.items.map((result) => {
      const docId = docIdMap.get(result.path);
      if (!docId) return null;
      return {
        nodeId: docId,
        score: result.finalScore || result.score || 0
      };
    }).filter((result) => result !== null);
    return semanticResults;
  } catch (error) {
    console.warn("[getSemanticSearchResults] Semantic search failed:", error);
    return [];
  }
}
function getPathFromNode(node) {
  if (!node) return "";
  return JSON.parse(node.attributes || "{}").path;
}
async function getDefaultItemFiledGetter(nodeIds, filters, sorter) {
  const nodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds(nodeIds);
  const tagsTripleMap = emptyMap();
  const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const { incoming: inCominglinksCountMap, outgoing: outGoinglinksCountMap, total: totalLinksCountMap } = sorter === "backlinks_count_asc" || sorter === "backlinks_count_desc" || sorter === "outlinks_count_asc" || sorter === "outlinks_count_desc" ? await edgeRepo.countEdges(nodeIds) : { incoming: emptyMap(), outgoing: emptyMap(), total: emptyMap() };
  return (node) => ({
    getPath: () => getPathFromNode(nodesMap.get(node.id)),
    getModified: () => new Date(nodesMap.get(node.id)?.updated_at || Date.now()),
    getCreated: () => new Date(nodesMap.get(node.id)?.created_at || Date.now()),
    getTopicTags: () => tagsTripleMap.get(node.id)?.topicTags ?? [],
    getFunctionalTagEntries: () => tagsTripleMap.get(node.id)?.functionalTagEntries ?? [],
    getFunctionalTags: () => tagsTripleMap.get(node.id)?.functionalTagEntries.map((e) => e.id) ?? [],
    getKeywordTags: () => tagsTripleMap.get(node.id)?.keywordTags ?? [],
    getTags: () => {
      const t = tagsTripleMap.get(node.id);
      return [
        ...t?.topicTags ?? [],
        ...t?.keywordTags ?? [],
        ...t?.timeTags ?? [],
        ...t?.geoTags ?? [],
        ...t?.personTags ?? []
      ];
    },
    getCategory: () => tagsTripleMap.get(node.id)?.functionalTagEntries?.[0]?.id,
    // all same rank
    getResultRank: () => 0,
    getTotalLinksCount: () => totalLinksCountMap.get(node.id) || 0,
    getInCominglinksCount: () => inCominglinksCountMap.get(node.id) || 0,
    getOutgoingCount: () => outGoinglinksCountMap.get(node.id) || 0
  });
}
function applyFiltersAndSorters(items, filters, sorter, limit, itemFiledGetter) {
  let filteredItems = [...items];
  if (filters) {
    filteredItems = filteredItems.filter((item) => shouldIncludeItem(item, filters, itemFiledGetter));
  }
  if (sorter) {
    const compareFn = getCompareFn(sorter, itemFiledGetter);
    filteredItems.sort(compareFn);
  }
  if (limit && limit > 0) {
    filteredItems = filteredItems.slice(0, limit);
  }
  return filteredItems;
}
function shouldIncludeItem(item, filters, itemFiledGetter) {
  const path4 = itemFiledGetter?.(item).getPath?.();
  if (filters.type && filters.type !== "all" && path4 !== void 0) {
    const itemType = getFileTypeByPath(path4);
    if (filters.type === "note" && itemType !== "note") return false;
    if (filters.type === "file" && itemType !== "file") return false;
    if (filters.type === "folder" && itemType !== "folder") return false;
  }
  if (filters.path && path4 !== void 0) {
    try {
      if (filters.path.startsWith("/")) {
        if (!path4.startsWith(filters.path)) return false;
      } else {
        const pathPattern = getCachedRegex(filters.path.slice(1));
        if (!pathPattern.test(path4)) return false;
      }
    } catch (e) {
      console.warn("[shouldIncludeItem] Invalid regex:", e);
      if (!path4.startsWith(filters.path)) return false;
    }
  }
  const itemModified = itemFiledGetter?.(item).getModified?.();
  const itemCreated = itemFiledGetter?.(item).getCreated?.();
  const { timeToFilter, timeFilterTarget } = filters.modified_within ? { timeToFilter: itemModified, timeFilterTarget: filters.modified_within } : filters.created_within ? { timeToFilter: itemCreated, timeFilterTarget: filters.created_within } : { timeToFilter: void 0, timeFilterTarget: void 0 };
  if (timeToFilter && timeFilterTarget) {
    const timeToFilterTime = timeToFilter;
    const timeFilterTargetTime = parseSemanticDateRange(timeFilterTarget);
    if (timeToFilterTime.getTime() < timeFilterTargetTime.getTime()) return false;
  }
  const g = itemFiledGetter?.(item);
  const tagCategoryBooleanExpression = getCachedBooleanExpression(filters?.tag_category_boolean_expression);
  if (tagCategoryBooleanExpression) {
    const hasSplit = typeof g?.getTopicTags === "function" || typeof g?.getKeywordTags === "function" || typeof g?.getFunctionalTags === "function";
    const topicTags = hasSplit ? g?.getTopicTags?.() ?? [] : g?.getTags?.() ?? [];
    const keywordTags = hasSplit ? g?.getKeywordTags?.() ?? [] : [];
    const functionalTagEntries = g?.getFunctionalTagEntries?.() ?? (g?.getFunctionalTags?.() ?? []).map((id) => ({ id }));
    return tagCategoryBooleanExpression.rootEvaluate({
      topicTags,
      functionalTagEntries,
      keywordTags,
      tags: topicTags,
      category: functionalTagEntries[0]?.id ?? g?.getCategory?.()
    });
  }
  return true;
}
var SORTER_WHITELIST = [
  "result_rank_asc",
  "result_rank_desc",
  "modified_asc",
  "modified_desc",
  "created_asc",
  "created_desc",
  "total_links_count_asc",
  "total_links_count_desc",
  "backlinks_count_asc",
  "backlinks_count_desc",
  "outlinks_count_asc",
  "outlinks_count_desc"
];
function getCompareFn(sorter, itemFiledGetter) {
  const normalized = typeof sorter === "string" ? sorter.trim() : "";
  const sorterKey = SORTER_WHITELIST.includes(normalized) ? normalized : sorter;
  let valToCompareGetter = null;
  switch (sorterKey) {
    case "result_rank_asc":
    case "result_rank_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getResultRank?.() || 0;
      break;
    case "modified_asc":
    case "modified_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getModified?.()?.getTime() || 0;
      break;
    case "created_asc":
    case "created_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getCreated?.()?.getTime() || 0;
      break;
    case "total_links_count_asc":
    case "total_links_count_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getTotalLinksCount?.() || 0;
      break;
    case "backlinks_count_asc":
    case "backlinks_count_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getInCominglinksCount?.() || 0;
      break;
    case "outlinks_count_asc":
    case "outlinks_count_desc":
      valToCompareGetter = (item) => itemFiledGetter?.(item).getOutgoingCount?.() || 0;
      break;
    default:
      throw new Error(`Invalid sorter: ${sorter}`);
  }
  if (sorterKey.endsWith("_desc")) {
    return (a, b) => {
      const aVal = valToCompareGetter(a);
      const bVal = valToCompareGetter(b);
      return compareNumbers(bVal, aVal);
    };
  } else {
    return (a, b) => {
      const aVal = valToCompareGetter(a);
      const bVal = valToCompareGetter(b);
      return compareNumbers(aVal, bVal);
    };
  }
}
function compareNumbers(a, b) {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

// src/service/tools/search-graph-inspector/inspect-note-context.ts
async function inspectNoteContext(params, templateManager) {
  const { note_path, limit, include_semantic_paths, response_format } = params;
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const docMeta = await indexedDocumentRepo.getByPath(note_path);
  if (!docMeta) {
    return `Note not found in database: ${note_path}`;
  }
  const inAndOutEdges = await sqliteStoreManager.getMobiusEdgeRepo().getAllEdgesForNode(docMeta.id, limit);
  const inComingNode = inAndOutEdges.filter((e) => e.to_node_id === docMeta.id).map((e) => e.from_node_id);
  const outGoingNode = inAndOutEdges.filter((e) => e.from_node_id === docMeta.id).map((e) => e.to_node_id);
  const connectedNodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds([...inComingNode, ...outGoingNode]);
  const { idMapToTags } = await sqliteStoreManager.getGraphRepo().getTagsByDocIds([docMeta.id]);
  const functionalTagEntries = idMapToTags.get(docMeta.id)?.functionalTagEntries ?? [];
  let topicTags = [];
  let keywordTags = [];
  let timeTags = [];
  let geoTags = [];
  let personTags = [];
  let neighborDocumentsIds = /* @__PURE__ */ new Set();
  for (const nodeVal of connectedNodesMap.values()) {
    if (nodeVal.type === GraphNodeType.TopicTag) {
      topicTags.push(nodeVal.label);
    }
    if (nodeVal.type === GraphNodeType.KeywordTag) {
      keywordTags.push(nodeVal.label);
    }
    if (nodeVal.type === GraphNodeType.ContextTag) {
      const ax = contextAxisFromInspectNode(nodeVal);
      if (ax === "time") timeTags.push(nodeVal.label);
      else if (ax === "geo") geoTags.push(nodeVal.label);
      else if (ax === "person") personTags.push(nodeVal.label);
    }
    if (nodeVal.type === GraphNodeType.Document) {
      neighborDocumentsIds.add(nodeVal.id);
    }
  }
  const semanticNeighbors = include_semantic_paths ? await getSemanticNeighbors(docMeta.id, limit, neighborDocumentsIds) : [];
  const data = {
    note_path,
    topicTags,
    functionalTagEntries,
    keywordTags,
    timeTags,
    geoTags,
    personTags,
    tags: [
      ...topicTags,
      ...keywordTags,
      ...timeTags,
      ...geoTags,
      ...personTags,
      ...functionalTagEntries.map((e) => e.id)
    ],
    categories: functionalTagEntries.map((e) => e.id),
    incoming: await distillClusterNodesData(
      mapGetAll(connectedNodesMap, inComingNode),
      limit
    ),
    outgoing: await distillClusterNodesData(
      mapGetAll(connectedNodesMap, outGoingNode),
      limit
    ),
    semanticNeighbors: await distillClusterNodesData(
      semanticNeighbors,
      limit
    )
  };
  return buildResponse(response_format, ToolTemplateId.InspectNoteContext, data, { templateManager });
}
function contextAxisFromInspectNode(node) {
  try {
    const a = JSON.parse(node.attributes || "{}");
    if (a.axis === "time" || a.axis === "geo" || a.axis === "person") return a.axis;
  } catch {
  }
  if (node.label.startsWith("Time")) return "time";
  if (node.label.startsWith("Geo")) return "geo";
  if (node.label.startsWith("Person")) return "person";
  return null;
}

// src/service/tools/search-graph-inspector/graph-traversal.ts
async function graphTraversal(params, templateManager, internalOpts) {
  const { start_note_path, hops, include_semantic_paths, limit, response_format, filters, sorter } = params;
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const startIndexedDoc = await sqliteStoreManager.getIndexedDocumentRepo().getByPath(start_note_path);
  if (!startIndexedDoc) {
    return `Graph Traversal Failed. Start note "${start_note_path}" not found in database.`;
  }
  const startNode = await mobiusNodeRepo.getById(startIndexedDoc.id);
  if (!startNode) {
    return `Graph Traversal Failed. Start note node "${start_note_path}" not found in graph database.`;
  }
  const visited = /* @__PURE__ */ new Set([startNode.id]);
  let isTimeOut = false;
  const startTime = Date.now();
  const queue = [
    { ...startNode, depth: 0, foundBy: "physical_neighbors" }
  ];
  const result = [];
  const collectedEdges = [];
  while (queue.length > 0) {
    if (Date.now() - startTime > GRAPH_INSPECT_STEP_TIME_LIMIT) {
      isTimeOut = true;
      break;
    }
    const current = queue.shift();
    if (current.depth > hops)
      continue;
    result.push(current);
    if (current.depth === hops) {
      continue;
    }
    const physicalInAndOutEdges = await mobiusEdgeRepo.getAllEdgesForNode(current.id, GRAPH_TRAVERSAL_EDGES_PER_NODE);
    for (const edge of physicalInAndOutEdges) {
      collectedEdges.push({
        from_node_id: edge.from_node_id,
        to_node_id: edge.to_node_id,
        type: edge.type,
        weight: edge.weight
      });
    }
    const inComingNode = physicalInAndOutEdges.filter((e) => e.to_node_id === current.id).map((e) => e.from_node_id);
    const outGoingNode = physicalInAndOutEdges.filter((e) => e.from_node_id === current.id).map((e) => e.to_node_id);
    let semanticLimit = limit;
    if (include_semantic_paths && current.depth > 0) {
      semanticLimit = GRAPH_TRAVERSAL_SEMANTIC_DEPTH_DECAY[current.depth - 1] ?? 0;
    }
    const semanticFilterSet = /* @__PURE__ */ new Set([...inComingNode, ...outGoingNode]);
    const semanticNodes = include_semantic_paths && current.type === "document" ? await getSemanticNeighbors(current.id, semanticLimit, semanticFilterSet) : [];
    const connectedNodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds([...inComingNode, ...outGoingNode]);
    for (const [nodeId, node] of connectedNodesMap) {
      if (!visited.has(nodeId)) {
        visited.add(nodeId);
        queue.push({
          ...node,
          depth: current.depth + 1,
          foundBy: "physical_neighbors"
        });
      }
    }
    for (const node of semanticNodes) {
      if (!visited.has(node.id)) {
        visited.add(node.id);
        queue.push({
          ...node,
          depth: current.depth + 1,
          similarity: node.similarity,
          foundBy: "semantic_neighbors"
        });
        collectedEdges.push({
          from_node_id: current.id,
          to_node_id: node.id,
          type: "semantic",
          weight: parseFloat(node.similarity || "0") || 0.5
        });
      }
    }
  }
  const groupedByDepth = result.reduce((acc, node) => {
    if (!acc.has(node.depth)) {
      acc.set(node.depth, []);
    }
    acc.get(node.depth).push(node);
    return acc;
  }, /* @__PURE__ */ new Map());
  const levels = await Promise.all(
    Array.from(groupedByDepth.entries()).map(async ([depth, levelData]) => ({
      depth,
      // ignore document nodes filter as we have already filtered them before. also we want more semantic neighbors for each level.
      ...await distillClusterNodesData(levelData, limit, true)
    }))
  );
  if (filters) {
    const itemFiledGetter = await getDefaultItemFiledGetter(
      levels.flatMap((level) => level.documentNodes?.map((node) => node.id) ?? []),
      filters,
      sorter
    );
    for (const level of levels) {
      if (level.documentNodes) {
        level.documentNodes = applyFiltersAndSorters(level.documentNodes, filters, sorter, limit, itemFiledGetter);
      }
    }
  }
  const visitedNodeIds = new Set(result.map((n) => n.id));
  const includeGraph = internalOpts?.includeGraph || response_format === "hybrid";
  const parseAttrs = (raw) => {
    try {
      return typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    } catch {
      return {};
    }
  };
  const data = {
    isTimeOut,
    start_note_path,
    hops,
    levels
  };
  if (includeGraph) {
    if (response_format === "hybrid") {
      data.graph = {
        nodes: result.map((node) => {
          const attrs = parseAttrs(node.attributes);
          const path4 = typeof attrs?.path === "string" && attrs.path.trim() ? attrs.path.trim() : void 0;
          return { id: node.id, type: node.type, depth: node.depth, ...path4 ? { path: path4 } : {} };
        }),
        edges: collectedEdges.filter((e) => visitedNodeIds.has(e.from_node_id) && visitedNodeIds.has(e.to_node_id)).map((e) => ({ from: e.from_node_id, to: e.to_node_id, type: e.type, weight: e.weight }))
      };
    } else {
      const graphVisualizationNodes = result.map((node) => {
        let path4;
        try {
          const attrs = typeof node.attributes === "string" ? JSON.parse(node.attributes || "{}") : node.attributes;
          if (attrs && typeof attrs === "object" && typeof attrs.path === "string" && attrs.path.trim()) {
            path4 = attrs.path.trim();
          }
        } catch {
        }
        return {
          id: node.id,
          label: node.label || node.id,
          type: node.type,
          depth: node.depth,
          foundBy: node.foundBy,
          ...path4 ? { path: path4 } : {},
          ...node.attributes ? { attributes: typeof node.attributes === "string" ? (() => {
            try {
              return JSON.parse(node.attributes);
            } catch {
              return {};
            }
          })() : node.attributes } : {}
        };
      });
      const graphVisualizationEdges = collectedEdges.filter(
        (edge) => visitedNodeIds.has(edge.from_node_id) && visitedNodeIds.has(edge.to_node_id)
      );
      data.graph = { nodes: graphVisualizationNodes, edges: graphVisualizationEdges };
    }
  }
  return buildResponse(response_format, ToolTemplateId.GraphTraversal, data, { templateManager });
}

// src/service/tools/search-graph-inspector/find-path/scorer.ts
var EDGE_WEIGHTS = {
  physical: 1,
  semantic: 1.5,
  consecutiveSemantic: 2
};
var SIMILARITY_THRESHOLD = 0.5;
var SCORE_WEIGHTS = {
  physicalRatio: 0.35,
  freshness: 0.25,
  domainJumps: 0.2,
  uniqueness: 0.15,
  lengthPenalty: 0.05
};
var PATH_STRING_SEPARATOR = " -> ";
async function getIndexedDocumentById(id) {
  const results = await sqliteStoreManager.getIndexedDocumentRepo().getByIds([id]);
  return results.length > 0 ? results[0] : null;
}
async function getIndexedDocumentsByIds(ids) {
  const results = await sqliteStoreManager.getIndexedDocumentRepo().getByIds(ids);
  const map = /* @__PURE__ */ new Map();
  for (const meta2 of results) {
    map.set(meta2.id, meta2);
  }
  return map;
}
function getParentFolder(path4) {
  const lastSlash = path4.lastIndexOf("/");
  return lastSlash > 0 ? path4.substring(0, lastSlash) : "/";
}
async function getPhysicalNeighbors(nodeId, limit = 20, excludedDocIds) {
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const neighbors = [];
  const physicalEdges = await mobiusEdgeRepo.getAllEdgesForNode(nodeId, limit);
  const seenIds = /* @__PURE__ */ new Set();
  for (const edge of physicalEdges) {
    const neighborId = edge.from_node_id === nodeId ? edge.to_node_id : edge.from_node_id;
    if (excludedDocIds?.has(neighborId)) continue;
    if (!seenIds.has(neighborId)) {
      seenIds.add(neighborId);
      neighbors.push({ id: neighborId, foundBy: "physical_neighbors" });
    }
  }
  return neighbors;
}
async function getNeighbors(nodeId, includeSemantic, limit = 20, excludedDocIds) {
  const neighbors = [];
  const physicalNeighbors = await getPhysicalNeighbors(nodeId, limit, excludedDocIds);
  neighbors.push(...physicalNeighbors);
  const physicalIds = new Set(physicalNeighbors.map((n) => n.id));
  if (excludedDocIds) excludedDocIds.forEach((id) => physicalIds.add(id));
  if (includeSemantic) {
    const semanticNeighbors = await getSemanticNeighbors(
      nodeId,
      Math.max(5, limit - neighbors.length),
      physicalIds
    );
    for (const neighbor of semanticNeighbors) {
      if (excludedDocIds?.has(neighbor.id)) continue;
      neighbors.push({
        id: neighbor.id,
        foundBy: "semantic_neighbors",
        similarity: neighbor.similarity
      });
    }
  }
  return neighbors;
}
async function applyNeighborFilters(neighbors, filters) {
  if (!filters) return neighbors;
  const itemFieldGetter = await getDefaultItemFiledGetter(
    neighbors.map((n) => n.id),
    filters
  );
  return applyFiltersAndSorters(neighbors, filters, void 0, void 0, itemFieldGetter);
}
function reconstructPath(intersectId, startVisited, endVisited) {
  const path4 = [];
  let currentId = intersectId;
  const startPath = [];
  while (currentId) {
    const info = startVisited.get(currentId);
    if (!info) break;
    startPath.unshift({
      nodeId: currentId,
      type: info.type,
      similarity: info.similarity
    });
    currentId = info.parentId;
  }
  currentId = intersectId;
  const endPath = [];
  while (currentId) {
    const info = endVisited.get(currentId);
    if (!info) break;
    endPath.push({
      nodeId: currentId,
      type: info.type,
      similarity: info.similarity
    });
    currentId = info.parentId;
  }
  path4.push(...startPath);
  if (endPath.length > 1) {
    path4.push(...endPath.slice(1));
  }
  return path4;
}
function createEmptyScore() {
  return {
    totalScore: 0,
    physicalRatio: 0,
    avgSimilarity: 0,
    uniqueness: 1,
    freshness: 0,
    domainJumps: 0,
    length: 0
  };
}
async function scorePaths(paths, allPaths) {
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  for (const path4 of paths) {
    const segments = path4.segments;
    const length = segments.length - 1;
    const physicalCount = segments.filter((s) => s.type === "physical_neighbors").length;
    const physicalRatio = length > 0 ? (physicalCount - 1) / length : 1;
    const semanticSegments = segments.filter((s) => s.type === "semantic_neighbors" && s.similarity);
    const avgSimilarity = semanticSegments.length > 0 ? semanticSegments.reduce((sum, s) => sum + parseFloat(s.similarity) / 100, 0) / semanticSegments.length : 0;
    const uniqueness = calculateUniqueness(segments, allPaths);
    let freshnessSum = 0;
    const nodeIds = segments.map((s) => s.nodeId);
    const statsMap = await mobiusNodeRepo.getByDocIds(nodeIds);
    const now = Date.now();
    const oneMonthMs = 30 * 24 * 60 * 60 * 1e3;
    for (const nodeId of nodeIds) {
      const stats = statsMap.get(nodeId);
      if (stats?.last_open_ts) {
        const age = now - stats.last_open_ts;
        freshnessSum += Math.max(0, 1 - age / oneMonthMs);
      } else {
        freshnessSum += 0.5;
      }
    }
    const freshness = nodeIds.length > 0 ? freshnessSum / nodeIds.length : 0;
    const domainJumps = await countDomainJumps(segments);
    const totalScore = physicalRatio * SCORE_WEIGHTS.physicalRatio * 100 + freshness * SCORE_WEIGHTS.freshness * 100 + Math.min(domainJumps, 3) / 3 * SCORE_WEIGHTS.domainJumps * 100 + uniqueness * SCORE_WEIGHTS.uniqueness * 100 - length * SCORE_WEIGHTS.lengthPenalty * 10;
    path4.score = {
      totalScore,
      physicalRatio,
      avgSimilarity,
      uniqueness,
      freshness,
      domainJumps,
      length
    };
  }
  return paths;
}
function calculateUniqueness(segments, allPaths) {
  const myNodes = new Set(segments.map((s) => s.nodeId));
  let maxOverlap = 0;
  for (const other of allPaths) {
    if (other.segments === segments) continue;
    const otherNodes = new Set(other.segments.map((s) => s.nodeId));
    let overlap = 0;
    for (const node of myNodes) {
      if (otherNodes.has(node)) overlap++;
    }
    const overlapRatio = overlap / Math.max(myNodes.size, otherNodes.size);
    maxOverlap = Math.max(maxOverlap, overlapRatio);
  }
  return 1 - maxOverlap;
}
async function countDomainJumps(segments) {
  const nodeIds = segments.map((s) => s.nodeId);
  const metasMap = await getIndexedDocumentsByIds(nodeIds);
  let jumps = 0;
  let prevFolder = null;
  for (const segment of segments) {
    const meta2 = metasMap.get(segment.nodeId);
    if (!meta2) continue;
    const folder = getParentFolder(meta2.path);
    if (prevFolder !== null && folder !== prevFolder) {
      jumps++;
    }
    prevFolder = folder;
  }
  return jumps;
}
function generatePathReasoning(path4) {
  const score = path4.score;
  const reasons = [];
  if (score.physicalRatio > 0.8) {
    reasons.push("High physical connectivity ensures reliability");
  } else if (score.physicalRatio > 0.5) {
    reasons.push("Balanced physical and semantic connections");
  } else {
    reasons.push("Creative semantic bridging for discovery");
  }
  if (score.freshness > 0.7) {
    reasons.push("Includes recently accessed knowledge");
  }
  if (score.domainJumps > 0) {
    reasons.push(`Crosses ${score.domainJumps} knowledge domains`);
  }
  if (score.uniqueness > 0.8) {
    reasons.push("Unique path not overlapping with others");
  }
  if (score.length <= 3) {
    reasons.push("Direct and concise connection");
  }
  return reasons.length > 0 ? reasons.join(". ") + "." : "Selected for balanced quality metrics.";
}
function identifyKeyEdge(path4) {
  if (path4.length < 2) return "";
  const parseSimilarity = (similarity) => {
    if (!similarity) return 0;
    const parsed = parseFloat(similarity.replace("%", ""));
    return isNaN(parsed) ? 0 : parsed;
  };
  let bestEdge = "";
  let bestScore = -1;
  for (let i = 0; i < path4.length - 1; i++) {
    const current = path4[i];
    const next = path4[i + 1];
    let score = 0;
    if (current.type === "physical_neighbors" && next.type === "physical_neighbors") {
      score = 100 + Math.max(parseSimilarity(current.similarity), parseSimilarity(next.similarity));
    } else if (current.type === "semantic_neighbors" && next.type === "semantic_neighbors") {
      score = Math.max(parseSimilarity(current.similarity), parseSimilarity(next.similarity));
    } else {
      score = 50 + Math.max(parseSimilarity(current.similarity), parseSimilarity(next.similarity)) * 0.5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestEdge = `${current.nodeId}->${next.nodeId}`;
    }
  }
  return bestEdge;
}
function deduplicatePaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const path4 of paths) {
    const key = path4.segments.map((s) => s.nodeId).join("->");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(path4);
    }
  }
  return unique;
}
function ensureStrategyDiversity(paths, maxResults) {
  const byStrategy = {
    reliable: [],
    fastTrack: [],
    brainstorm: []
  };
  for (const path4 of paths) {
    byStrategy[path4.strategy].push(path4);
  }
  const result = [];
  const strategies = ["reliable", "fastTrack", "brainstorm"];
  for (const strategy of strategies) {
    if (byStrategy[strategy].length > 0 && result.length < maxResults) {
      result.push(byStrategy[strategy].shift());
    }
  }
  const remaining = paths.filter((p) => !result.includes(p));
  remaining.sort((a, b) => b.score.totalScore - a.score.totalScore);
  for (const path4 of remaining) {
    if (result.length >= maxResults) break;
    result.push(path4);
  }
  return result;
}
function analyzeHubs(paths) {
  const nodeCount = /* @__PURE__ */ new Map();
  for (const path4 of paths) {
    for (let i = 1; i < path4.segments.length - 1; i++) {
      const nodeId = path4.segments[i].nodeId;
      nodeCount.set(nodeId, (nodeCount.get(nodeId) || 0) + 1);
    }
  }
  const hubs = [];
  for (const [nodeId, count] of nodeCount) {
    if (count >= 2) {
      hubs.push({
        nodeId,
        label: nodeId,
        occurrenceCount: count,
        betweennessCentrality: count / paths.length
      });
    }
  }
  return hubs.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}
async function analyzeContextIntersection(startId, endId) {
  const [startMeta, endMeta] = await Promise.all([
    getIndexedDocumentById(startId),
    getIndexedDocumentById(endId)
  ]);
  if (!startMeta || !endMeta) return null;
  const physicalAncestor = analyzePhysicalAncestor(startMeta.path, endMeta.path);
  const commonTags = analyzeTagIntersection(startMeta.tags, endMeta.tags);
  const commonParents = await analyzeCommonParents(startId, endId);
  const isDistant = physicalAncestor.depth <= 1 && (commonTags.length > 0 || commonParents.length > 0);
  let primaryContext;
  if (commonTags.length > 0) {
    primaryContext = commonTags[0];
  } else if (commonParents.length > 0) {
    primaryContext = commonParents[0].label;
  }
  return {
    physicalAncestor,
    commonTags,
    commonParents,
    isDistant,
    primaryContext
  };
}
function analyzePhysicalAncestor(startPath, endPath) {
  const startParts = startPath.split("/");
  const endParts = endPath.split("/");
  let commonParts = [];
  for (let i = 0; i < Math.min(startParts.length, endParts.length); i++) {
    if (startParts[i] === endParts[i]) {
      commonParts.push(startParts[i]);
    } else {
      break;
    }
  }
  const ancestorPath = commonParts.length > 0 ? commonParts.join("/") : "/";
  return {
    ancestorPath,
    startPath,
    endPath,
    depth: commonParts.length
  };
}
function analyzeTagIntersection(startTags, endTags) {
  if (!startTags || !endTags) return [];
  let startTagArray = [];
  let endTagArray = [];
  try {
    const parsedStart = JSON.parse(startTags);
    const parsedEnd = JSON.parse(endTags);
    startTagArray = Array.isArray(parsedStart) ? parsedStart : [];
    endTagArray = Array.isArray(parsedEnd) ? parsedEnd : [];
  } catch {
    startTagArray = startTags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    endTagArray = endTags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
  return startTagArray.filter((tag) => endTagArray.includes(tag));
}
async function analyzeCommonParents(startId, endId) {
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const [startEdges, endEdges] = await Promise.all([
    mobiusEdgeRepo.getAllEdgesForNode(startId, 50),
    mobiusEdgeRepo.getAllEdgesForNode(endId, 50)
  ]);
  const startReferrerIds = new Set(
    startEdges.filter((edge) => edge.to_node_id === startId && edge.from_node_id !== endId).map((edge) => edge.from_node_id)
  );
  const endReferrerIds = new Set(
    endEdges.filter((edge) => edge.to_node_id === endId && edge.from_node_id !== startId).map((edge) => edge.from_node_id)
  );
  const commonParentIds = Array.from(startReferrerIds).filter((id) => endReferrerIds.has(id));
  if (commonParentIds.length === 0) return [];
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const parentNodes = await mobiusNodeRepo.getByIds(commonParentIds);
  const result = commonParentIds.map((parentId) => {
    const node = parentNodes.get(parentId);
    if (!node) return null;
    const startConnections = startEdges.filter(
      (edge) => edge.from_node_id === parentId && edge.to_node_id === startId
    ).length;
    const endConnections = endEdges.filter(
      (edge) => edge.from_node_id === parentId && edge.to_node_id === endId
    ).length;
    const connectionCount = startConnections + endConnections;
    let label = node.label;
    if (isIndexedNoteNodeType(node.type)) {
      try {
        const attributes = JSON.parse(node.attributes);
        label = attributes.path || label;
      } catch {
      }
    }
    return {
      nodeId: parentId,
      label,
      type: node.type,
      connectionCount
    };
  }).filter(Boolean).sort((a, b) => (b?.connectionCount || 0) - (a?.connectionCount || 0));
  return result;
}
function buildAnalysisSection(hubs, contextIntersection) {
  let section = "";
  if (hubs.length > 0) {
    section += "\n\n## Knowledge Hubs\n\n";
    section += "These nodes appear in multiple paths, acting as central connectors:\n\n";
    for (const hub of hubs.slice(0, SLICE_CAPS.inspector.pathFindHubs)) {
      section += `- **[[${hub.label}]]** (appears in ${hub.occurrenceCount} paths)
`;
    }
  }
  if (contextIntersection) {
    const hasValuableContent = contextIntersection.commonTags.length > 0 || contextIntersection.commonParents.length > 0 || contextIntersection.physicalAncestor.depth > 1 || contextIntersection.isDistant;
    if (hasValuableContent) {
      section += "\n\n## Shared Context Analysis\n\n";
      const physical = contextIntersection.physicalAncestor;
      if (contextIntersection.commonTags.length > 0) {
        section += `**Common Tags:** ${contextIntersection.commonTags.map((tag) => `\`${tag}\``).join(", ")}

`;
      }
      if (contextIntersection.commonParents.length > 0) {
        section += "**Common Reference Points:**\n";
        for (const parent of contextIntersection.commonParents.slice(0, SLICE_CAPS.inspector.pathFindCommonParents)) {
          const nodeLink = isIndexedNoteNodeType(parent.type) ? `[[${parent.label}]]` : `**${parent.label}**`;
          section += `- ${nodeLink} (${parent.connectionCount} connections)
`;
        }
        section += "\n";
      }
      if (physical.depth > 1) {
        section += `**Shared Location:** Both notes are in \`${physical.ancestorPath}\`

`;
      }
      if (contextIntersection.isDistant) {
        section += "**Cross-Domain Insight:** Despite different locations, these notes share ";
        if (contextIntersection.primaryContext) {
          section += `**${contextIntersection.primaryContext}**`;
        } else {
          section += "semantic connections";
        }
        section += ".\n\n";
      }
    }
  }
  return section;
}
var STRATEGY_NAMES = {
  reliable: "\u{1F517} Reliable",
  fastTrack: "\u{1F680} Fast Track",
  brainstorm: "\u{1F4A1} Brainstorm"
};
async function formatPathsForOutput(paths, mobiusNodeRepo) {
  const allNodeIds = /* @__PURE__ */ new Set();
  for (const scoredPath of paths) {
    for (const segment of scoredPath.segments) {
      allNodeIds.add(segment.nodeId);
    }
  }
  const nodesMap = await mobiusNodeRepo.getByIds(Array.from(allNodeIds));
  return paths.map((scoredPath) => {
    const nodeLabels = [];
    for (const segment of scoredPath.segments) {
      try {
        const node = nodesMap.get(segment.nodeId);
        if (!node) {
          nodeLabels.push(segment.nodeId);
        } else if (isIndexedNoteNodeType(node.type)) {
          nodeLabels.push(JSON.parse(node.attributes).path || segment.nodeId);
        } else {
          nodeLabels.push(node.type + node.label);
        }
      } catch {
        nodeLabels.push(segment.nodeId);
      }
    }
    const connectionDetails = scoredPath.segments.slice(0, -1).map((segment, i) => {
      const nextSegment = scoredPath.segments[i + 1];
      const type = segment.type === "physical_neighbors" && nextSegment.type === "physical_neighbors" ? "physical" : "semantic";
      const similarity = segment.similarity || nextSegment.similarity;
      return similarity ? `${type} (${similarity})` : type;
    }).join(" \u2192 ");
    return {
      path: nodeLabels,
      connectionDetails,
      strategy: STRATEGY_NAMES[scoredPath.strategy],
      insightLabel: scoredPath.insightLabel,
      score: scoredPath.score.totalScore
    };
  });
}

// src/service/tools/search-graph-inspector/find-path/reliable.ts
async function reliableStrategy(context) {
  const paths = [];
  const forbiddenEdges = /* @__PURE__ */ new Set();
  for (let i = 0; i < 3; i++) {
    const path4 = await bidirectionalBFS(
      context.startId,
      context.endId,
      forbiddenEdges,
      false,
      context.maxHops,
      context.filters,
      context.excludedDocIds
    );
    if (!path4) break;
    paths.push({
      segments: path4,
      strategy: "reliable",
      score: createEmptyScore(),
      insightLabel: "This is the most direct logical chain in your knowledge base.",
      reasoning: "Pure physical connections provide the most reliable and trustworthy path."
    });
    const edgeToBlock = identifyKeyEdge(path4);
    if (edgeToBlock) {
      forbiddenEdges.add(edgeToBlock);
    } else {
      break;
    }
  }
  return paths;
}
async function bidirectionalBFS(startId, endId, forbiddenEdges, includeSemantic, maxHops, filters, excludedDocIds) {
  const startVisited = /* @__PURE__ */ new Map();
  const endVisited = /* @__PURE__ */ new Map();
  startVisited.set(startId, { parentId: null, type: "physical_neighbors" });
  endVisited.set(endId, { parentId: null, type: "physical_neighbors" });
  let startQueue = [startId];
  let endQueue = [endId];
  let hops = 0;
  while (startQueue.length > 0 && endQueue.length > 0 && hops < maxHops) {
    const startResult = await expandFrontier(
      startQueue,
      startVisited,
      endVisited,
      forbiddenEdges,
      includeSemantic,
      filters,
      excludedDocIds
    );
    if (startResult.found && startResult.intersectId) {
      return reconstructPath(startResult.intersectId, startVisited, endVisited);
    }
    const endResult = await expandFrontier(
      endQueue,
      endVisited,
      startVisited,
      forbiddenEdges,
      includeSemantic,
      filters,
      excludedDocIds
    );
    if (endResult.found && endResult.intersectId) {
      return reconstructPath(endResult.intersectId, startVisited, endVisited);
    }
    hops++;
  }
  return null;
}
async function expandFrontier(queue, myVisited, otherVisited, forbiddenEdges, includeSemantic, filters, excludedDocIds) {
  const nextQueue = [];
  for (const currentId of queue) {
    let neighbors = includeSemantic ? await getNeighbors(currentId, true, 20, excludedDocIds) : await getPhysicalNeighbors(currentId, 20, excludedDocIds);
    neighbors = await applyNeighborFilters(neighbors, filters);
    for (const neighbor of neighbors) {
      const edgeKey = `${currentId}->${neighbor.id}`;
      if (forbiddenEdges.has(edgeKey)) continue;
      if (!myVisited.has(neighbor.id)) {
        myVisited.set(neighbor.id, {
          parentId: currentId,
          type: neighbor.foundBy,
          similarity: neighbor.similarity
        });
        nextQueue.push(neighbor.id);
        if (otherVisited.has(neighbor.id)) {
          return { found: true, intersectId: neighbor.id };
        }
      }
    }
  }
  queue.length = 0;
  queue.push(...nextQueue);
  return { found: false };
}

// src/service/tools/search-graph-inspector/find-path/fast-track.ts
async function fastTrackStrategy(context) {
  if (!context.startVector || !context.endVector) {
    return [];
  }
  const paths = [];
  const path4 = await aStarSearch(context);
  if (path4) {
    paths.push({
      segments: path4,
      strategy: "fastTrack",
      score: createEmptyScore(),
      insightLabel: "Through semantic bridging, these two ideas share a common conceptual core.",
      reasoning: "A* algorithm found optimal balance between path length and semantic relevance."
    });
  }
  return paths;
}
async function fallbackStrategy(context) {
  const paths = [];
  const path4 = await bidirectionalBFS(
    context.startId,
    context.endId,
    /* @__PURE__ */ new Set(),
    true,
    Math.max(context.maxHops * 2, 8),
    context.filters,
    context.excludedDocIds
  );
  if (path4) {
    paths.push({
      segments: path4,
      strategy: "fastTrack",
      score: createEmptyScore(),
      insightLabel: "Found through extended search - this connection exists but may be indirect.",
      reasoning: "Fallback search found this path after other strategies failed. Consider it as a distant connection."
    });
  }
  return paths;
}
async function aStarSearch(context) {
  const { startId, endId, startVector, endVector, maxHops, filters } = context;
  if (!startVector || !endVector) return null;
  const openSet = [];
  const closedSet = /* @__PURE__ */ new Set();
  const nodeMap = /* @__PURE__ */ new Map();
  const startNode = {
    nodeId: startId,
    gCost: 0,
    hCost: await calculateHeuristic(startId, endVector, 0, maxHops),
    fCost: 0,
    parent: null,
    connectionType: "physical_neighbors"
  };
  startNode.fCost = startNode.gCost + startNode.hCost;
  openSet.push(startNode);
  nodeMap.set(startId, startNode);
  let step = 0;
  let consecutiveSemanticCount = 0;
  while (openSet.length > 0 && step < maxHops * 50) {
    step++;
    openSet.sort((a, b) => a.fCost - b.fCost);
    const current = openSet.shift();
    if (current.nodeId === endId) {
      return reconstructAStarPath(current);
    }
    closedSet.add(current.nodeId);
    if (current.connectionType === "semantic_neighbors") {
      consecutiveSemanticCount++;
    } else {
      consecutiveSemanticCount = 0;
    }
    const neighbors = await getSmartNeighbors(
      current.nodeId,
      true,
      consecutiveSemanticCount >= 4,
      context.excludedDocIds
    );
    let filteredNeighbors = await applyNeighborFilters(neighbors, filters);
    for (const neighbor of filteredNeighbors) {
      if (closedSet.has(neighbor.id)) continue;
      const edgeWeight = neighbor.foundBy === "physical_neighbors" ? EDGE_WEIGHTS.physical : consecutiveSemanticCount >= 1 ? EDGE_WEIGHTS.consecutiveSemantic : EDGE_WEIGHTS.semantic;
      if (neighbor.foundBy === "semantic_neighbors" && neighbor.similarity) {
        const sim = parseFloat(neighbor.similarity) / 100;
        if (sim < SIMILARITY_THRESHOLD) continue;
      }
      const tentativeGCost = current.gCost + edgeWeight;
      let existingNode = nodeMap.get(neighbor.id);
      if (!existingNode) {
        const progress = step / (maxHops * 2);
        const hCost = await calculateHeuristic(neighbor.id, endVector, progress, maxHops);
        const newNode = {
          nodeId: neighbor.id,
          gCost: tentativeGCost,
          hCost,
          fCost: tentativeGCost + hCost,
          parent: current,
          connectionType: neighbor.foundBy,
          similarity: neighbor.similarity
        };
        openSet.push(newNode);
        nodeMap.set(neighbor.id, newNode);
      } else if (tentativeGCost < existingNode.gCost) {
        existingNode.gCost = tentativeGCost;
        existingNode.fCost = tentativeGCost + existingNode.hCost;
        existingNode.parent = current;
        existingNode.connectionType = neighbor.foundBy;
        existingNode.similarity = neighbor.similarity;
      }
    }
  }
  return null;
}
async function calculateHeuristic(nodeId, endVector, progress, maxHops) {
  const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
  const nodeVector = await embeddingRepo.getEmbeddingForSemanticSearch(nodeId);
  if (!nodeVector) {
    return 2;
  }
  const similarity = cosineSimilarity(nodeVector, endVector);
  const distance = Math.max(0, 1 - similarity);
  return distance * 1;
}
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
function reconstructAStarPath(endNode) {
  const path4 = [];
  let current = endNode;
  while (current) {
    path4.unshift({
      nodeId: current.nodeId,
      type: current.connectionType,
      similarity: current.similarity
    });
    current = current.parent;
  }
  return path4;
}
async function getSmartNeighbors(nodeId, includeSemantic, throttleSemantic, excludedDocIds) {
  const neighbors = [];
  const physicalNeighbors = await getPhysicalNeighbors(nodeId, 20, excludedDocIds);
  neighbors.push(...physicalNeighbors);
  if (includeSemantic && !throttleSemantic && physicalNeighbors.length < 3) {
    const physicalIds = new Set(physicalNeighbors.map((n) => n.id));
    if (excludedDocIds) excludedDocIds.forEach((id) => physicalIds.add(id));
    const semanticNeighbors = await getSemanticNeighbors(nodeId, 15, physicalIds);
    for (const neighbor of semanticNeighbors) {
      if (excludedDocIds?.has(neighbor.id)) continue;
      neighbors.push({
        id: neighbor.id,
        foundBy: "semantic_neighbors",
        similarity: neighbor.similarity
      });
    }
  }
  return neighbors;
}

// src/service/tools/search-graph-inspector/find-path/brainstorm.ts
async function brainstormStrategy(context) {
  const paths = [];
  const brainstormForbiddenEdges = /* @__PURE__ */ new Set();
  const [startMeta, endMeta] = await Promise.all([
    getIndexedDocumentById(context.startId),
    getIndexedDocumentById(context.endId)
  ]);
  if (!startMeta || !endMeta) return paths;
  const startFolder = getParentFolder(startMeta.path);
  const endFolder = getParentFolder(endMeta.path);
  for (let i = 0; i < 3; i++) {
    const forceCrossDomain = startFolder === endFolder || i === 0;
    const path4 = await bidirectionalBFSWithDomainPreference(
      context.startId,
      context.endId,
      brainstormForbiddenEdges,
      context.includeSemantic,
      context.maxHops,
      context.filters,
      forceCrossDomain ? endFolder : null,
      context.excludedDocIds
    );
    if (!path4) break;
    const nodeIds = path4.map((s) => s.nodeId);
    const metasMap = await getIndexedDocumentsByIds(nodeIds);
    const domains = /* @__PURE__ */ new Set();
    let semanticConnections = 0;
    let totalSimilarity = 0;
    for (const segment of path4) {
      const meta2 = metasMap.get(segment.nodeId);
      if (meta2) {
        domains.add(getParentFolder(meta2.path));
      }
      if (segment.type === "semantic_neighbors") {
        semanticConnections++;
        if (segment.similarity) {
          const sim = parseFloat(segment.similarity) / 100;
          totalSimilarity += sim;
        }
      }
    }
    const avgSimilarity = semanticConnections > 0 ? totalSimilarity / semanticConnections : 0;
    const shouldAccept = domains.size > 1 || semanticConnections > 0 && avgSimilarity > 0.7;
    if (shouldAccept) {
      const domainCount = domains.size;
      let insightMessage = "";
      if (domainCount > 1) {
        insightMessage = `Crossing ${domainCount} different domains, this connection may spark unexpected inspiration.`;
      } else if (semanticConnections > 0) {
        insightMessage = `Through creative semantic connections (avg ${Math.round(avgSimilarity * 100)}% similarity), these ideas form an unexpected bridge.`;
      } else {
        insightMessage = `This path reveals hidden connections through creative exploration.`;
      }
      paths.push({
        segments: path4,
        strategy: "brainstorm",
        score: createEmptyScore(),
        insightLabel: insightMessage,
        reasoning: "Selected for cross-domain exploration and creative connection discovery."
      });
      const edgeToBlock = identifyKeyEdge(path4);
      if (edgeToBlock) {
        brainstormForbiddenEdges.add(edgeToBlock);
      } else {
        break;
      }
    } else {
      const edgeToBlock = identifyKeyEdge(path4);
      if (edgeToBlock) {
        brainstormForbiddenEdges.add(edgeToBlock);
      } else {
        break;
      }
    }
  }
  return paths;
}
async function bidirectionalBFSWithDomainPreference(startId, endId, forbiddenEdges, includeSemantic, maxHops, filters, avoidFolder, excludedDocIds) {
  const startVisited = /* @__PURE__ */ new Map();
  const endVisited = /* @__PURE__ */ new Map();
  startVisited.set(startId, { parentId: null, type: "physical_neighbors" });
  endVisited.set(endId, { parentId: null, type: "physical_neighbors" });
  let startQueue = [startId];
  let endQueue = [endId];
  let hops = 0;
  while (startQueue.length > 0 && endQueue.length > 0 && hops < maxHops) {
    const startResult = await expandFrontierWithDomainPreference(
      startQueue,
      startVisited,
      endVisited,
      forbiddenEdges,
      includeSemantic,
      filters,
      avoidFolder,
      excludedDocIds
    );
    if (startResult.found && startResult.intersectId) {
      return reconstructPath(startResult.intersectId, startVisited, endVisited);
    }
    const endResult = await expandFrontierWithDomainPreference(
      endQueue,
      endVisited,
      startVisited,
      forbiddenEdges,
      includeSemantic,
      filters,
      avoidFolder,
      excludedDocIds
    );
    if (endResult.found && endResult.intersectId) {
      return reconstructPath(endResult.intersectId, startVisited, endVisited);
    }
    hops++;
  }
  return null;
}
async function expandFrontierWithDomainPreference(queue, myVisited, otherVisited, forbiddenEdges, includeSemantic, filters, avoidFolder, excludedDocIds) {
  const nextQueue = [];
  for (const currentId of queue) {
    let neighbors = includeSemantic ? await getNeighbors(currentId, true, 20, excludedDocIds) : await getPhysicalNeighbors(currentId, 20, excludedDocIds);
    if (avoidFolder) {
      const neighborIds = neighbors.map((n) => n.id);
      const metasMap = await getIndexedDocumentsByIds(neighborIds);
      const neighborsWithMeta = neighbors.map((n) => {
        const meta2 = metasMap.get(n.id);
        return { ...n, folder: meta2 ? getParentFolder(meta2.path) : "" };
      });
      neighborsWithMeta.sort((a, b) => {
        const aInAvoid = a.folder === avoidFolder ? 1 : 0;
        const bInAvoid = b.folder === avoidFolder ? 1 : 0;
        return aInAvoid - bInAvoid;
      });
      neighbors = neighborsWithMeta;
    }
    neighbors = await applyNeighborFilters(neighbors, filters);
    for (const neighbor of neighbors) {
      const edgeKey = `${currentId}->${neighbor.id}`;
      if (forbiddenEdges.has(edgeKey)) continue;
      if (!myVisited.has(neighbor.id)) {
        myVisited.set(neighbor.id, {
          parentId: currentId,
          type: neighbor.foundBy,
          similarity: neighbor.similarity
        });
        nextQueue.push(neighbor.id);
        if (otherVisited.has(neighbor.id)) {
          return { found: true, intersectId: neighbor.id };
        }
      }
    }
  }
  queue.length = 0;
  queue.push(...nextQueue);
  return { found: false };
}

// src/service/tools/search-graph-inspector/find-path/index.ts
async function findPath(params, templateManager) {
  const { start_note_path, end_note_path, strategy, max_paths, include_semantic_paths, response_format, filters } = params;
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const [startIndexedDoc, endIndexedDoc] = await Promise.all([
    sqliteStoreManager.getIndexedDocumentRepo().getByPath(start_note_path),
    sqliteStoreManager.getIndexedDocumentRepo().getByPath(end_note_path)
  ]);
  if (!startIndexedDoc || !endIndexedDoc) {
    return `# Path Finding Failed

${!startIndexedDoc ? `Start note "${start_note_path}" not found.` : ""}${!endIndexedDoc ? `End note "${end_note_path}" not found.` : ""}`;
  }
  const [startNode, endNode] = await Promise.all([
    mobiusNodeRepo.getById(startIndexedDoc.id),
    mobiusNodeRepo.getById(endIndexedDoc.id)
  ]);
  if (!startNode || !endNode) {
    return `# Path Finding Failed

${!startNode ? `Start node "${start_note_path}" not found in graph.` : ""}${!endNode ? `End node "${end_note_path}" not found in graph.` : ""}`;
  }
  const embeddingRepo = sqliteStoreManager.getEmbeddingRepo();
  const [startVector, endVector] = await Promise.all([
    embeddingRepo.getEmbeddingForSemanticSearch(startNode.id),
    embeddingRepo.getEmbeddingForSemanticSearch(endNode.id)
  ]);
  const effectiveMaxPaths = max_paths ?? 3;
  const context = {
    startId: startNode.id,
    endId: endNode.id,
    startVector,
    endVector,
    maxHops: PATH_FINDING_CONSTANTS.MAX_HOPS_LIMIT,
    filters,
    forbiddenEdges: /* @__PURE__ */ new Set(),
    includeSemantic: include_semantic_paths ?? false,
    excludedDocIds: /* @__PURE__ */ new Set()
  };
  const timeoutResult = await withTimeoutMessage(
    executeStrategySearch(context, strategy ?? "reliable", effectiveMaxPaths),
    GRAPH_INSPECT_STEP_TIME_LIMIT,
    `Path finding from "${start_note_path}" to "${end_note_path}"`
  );
  if (!timeoutResult.success) {
    return `# Path Finding Timeout

**${timeoutResult.message}**

Try these solutions:
- Reduce search complexity by using notes with fewer connections
- Disable semantic path finding if enabled
- Choose different start/end notes with clearer relationships
- The search may be exploring too many possible paths`;
  }
  const { scoredPaths, hubAnalysis, contextIntersection } = timeoutResult.data;
  if (hubAnalysis.length > 0) {
    const hubNodeIds = hubAnalysis.map((h) => h.nodeId);
    const hubNodesMap = await mobiusNodeRepo.getByIds(hubNodeIds);
    for (const hub of hubAnalysis) {
      const node = hubNodesMap.get(hub.nodeId);
      if (node && isIndexedNoteNodeType(node.type)) {
        try {
          hub.label = JSON.parse(node.attributes).path || hub.nodeId;
        } catch {
          hub.label = hub.nodeId;
        }
      } else {
        hub.label = node ? node.type + node.label : hub.nodeId;
      }
    }
  }
  const formattedPaths = await formatPathsForOutput(scoredPaths, mobiusNodeRepo);
  const templatePaths = formattedPaths.slice(0, effectiveMaxPaths).map((pathData, index) => {
    const originalPath = scoredPaths[index];
    return {
      index: index + 1,
      steps: pathData.path.length - 1,
      pathString: pathData.path.map((node) => `[[${node}]]`).join(PATH_STRING_SEPARATOR),
      connectionDetails: pathData.connectionDetails,
      strategy: pathData.strategy,
      insightLabel: pathData.insightLabel,
      score: pathData.score.toFixed(1),
      reasoning: originalPath?.reasoning || "Selected for optimal quality metrics."
    };
  });
  const analysisSection = buildAnalysisSection(hubAnalysis, contextIntersection);
  const data = {
    start_note_path,
    end_note_path,
    paths: templatePaths,
    analysis: analysisSection
  };
  return buildResponse(response_format, ToolTemplateId.GraphPathFinding, data, { templateManager });
}
async function executeStrategySearch(context, strategy, maxResults) {
  const allPaths = [];
  switch (strategy) {
    case "reliable":
      console.debug("[findPath] Strategy: Reliable");
      allPaths.push(...await reliableStrategy(context));
      break;
    case "fastTrack":
      console.debug("[findPath] Strategy: FastTrack");
      if (context.startVector && context.endVector) {
        allPaths.push(...await fastTrackStrategy(context));
      }
      if (allPaths.length === 0) {
        allPaths.push(...await reliableStrategy(context));
      }
      break;
    case "brainstorm":
      console.debug("[findPath] Strategy: Brainstorm");
      allPaths.push(...await brainstormStrategy(context));
      break;
    default:
      allPaths.push(...await reliableStrategy(context));
      break;
  }
  if (allPaths.length === 0) {
    console.debug("[findPath] No paths found, attempting fallback strategy");
    allPaths.push(...await fallbackStrategy(context));
  }
  const uniquePaths = deduplicatePaths(allPaths);
  const scoredPaths = await scorePaths(uniquePaths, allPaths);
  for (const path4 of scoredPaths) {
    path4.reasoning = generatePathReasoning(path4);
  }
  scoredPaths.sort((a, b) => b.score.totalScore - a.score.totalScore);
  const diversePaths = ensureStrategyDiversity(scoredPaths, maxResults);
  const hubAnalysis = analyzeHubs(diversePaths);
  const contextIntersection = await analyzeContextIntersection(context.startId, context.endId);
  return { scoredPaths: diversePaths, hubAnalysis, contextIntersection };
}

// src/service/tools/search-graph-inspector/find-key-nodes.ts
async function getNodeCategoryConnections(nodeIds) {
  if (!nodeIds.length) return /* @__PURE__ */ new Map();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const categoryConnections = await mobiusEdgeRepo.getByFromNodesAndTypes(nodeIds, [...GRAPH_TAGGED_EDGE_TYPES]);
  const categoryCountMap = /* @__PURE__ */ new Map();
  for (const edge of categoryConnections) {
    const count = categoryCountMap.get(edge.from_node_id) || 0;
    categoryCountMap.set(edge.from_node_id, count + 1);
  }
  return categoryCountMap;
}
async function findKeyNodes(params, templateManager) {
  const { limit, semantic_filter, response_format, filters, sorter } = params;
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const { topByOutDegree: allOutDegreeStats, topByInDegree: allInDegreeStats } = await mobiusEdgeRepo.getTopNodeIdsByDegree(RRF_RANKING_POOL_SIZE);
  const semanticResults = await getSemanticSearchResults(
    semantic_filter,
    "limitIdsSet",
    {
      limitIdsSet: /* @__PURE__ */ new Set([
        ...allOutDegreeStats.map((stat) => stat.nodeId),
        ...allInDegreeStats.map((stat) => stat.nodeId)
      ])
    }
  );
  const sortedNodes = await calculateKeyNoteRRFScores(
    semanticResults,
    allOutDegreeStats,
    allInDegreeStats,
    !!semantic_filter,
    limit
  );
  const candidateNodeIds = sortedNodes.map((node) => node.nodeId);
  const outDegreeMap = new Map(allOutDegreeStats.map((s) => [s.nodeId, s.outDegree]));
  const inDegreeMap = new Map(allInDegreeStats.map((s) => [s.nodeId, s.inDegree]));
  const candidateOutDegrees = candidateNodeIds.filter((id) => outDegreeMap.has(id)).map((id) => ({ nodeId: id, outDegree: outDegreeMap.get(id) }));
  const candidateInDegrees = candidateNodeIds.filter((id) => inDegreeMap.has(id)).map((id) => ({ nodeId: id, inDegree: inDegreeMap.get(id) }));
  const nodeMap = await mobiusNodeRepo.getByIds(candidateNodeIds);
  const nodeMetadataMap = new Map(
    sortedNodes.map((node) => [node.nodeId, {
      nodeType: node.nodeType,
      uniqueCategories: node.uniqueCategories
    }])
  );
  let allKeyNodes = [];
  for (const stat of candidateOutDegrees) {
    const nodeInfo = nodeMap.get(stat.nodeId);
    const metadata = nodeMetadataMap.get(stat.nodeId) || { nodeType: "balanced", uniqueCategories: 0 };
    allKeyNodes.push({
      id: stat.nodeId,
      label: nodeInfo?.label || stat.nodeId,
      type: nodeInfo?.type || "unknown",
      degree: stat.outDegree,
      direction: "out",
      nodeType: metadata.nodeType,
      uniqueCategories: metadata.uniqueCategories
    });
  }
  for (const stat of candidateInDegrees) {
    const nodeInfo = nodeMap.get(stat.nodeId);
    const metadata = nodeMetadataMap.get(stat.nodeId) || { nodeType: "balanced", uniqueCategories: 0 };
    allKeyNodes.push({
      id: stat.nodeId,
      label: nodeInfo?.label || stat.nodeId,
      type: nodeInfo?.type || "unknown",
      degree: stat.inDegree,
      direction: "in",
      nodeType: metadata.nodeType,
      uniqueCategories: metadata.uniqueCategories
    });
  }
  if (filters) {
    const itemFiledGetter = await getDefaultItemFiledGetter(candidateNodeIds, filters, sorter);
    allKeyNodes = applyFiltersAndSorters(allKeyNodes, filters, sorter, void 0, itemFiledGetter);
  }
  const data = { key_nodes: allKeyNodes };
  return buildResponse(response_format, ToolTemplateId.FindKeyNodes, data, { templateManager });
}
async function calculateKeyNoteRRFScores(semanticResults, allOutDegreeStats, allInDegreeStats, semanticEnabled, candidateLimit) {
  const outDegreeRankMap = /* @__PURE__ */ new Map();
  const inDegreeRankMap = /* @__PURE__ */ new Map();
  const semanticRankMap = /* @__PURE__ */ new Map();
  allOutDegreeStats.forEach((stat, index) => {
    outDegreeRankMap.set(stat.nodeId, index + 1);
  });
  allInDegreeStats.forEach((stat, index) => {
    inDegreeRankMap.set(stat.nodeId, index + 1);
  });
  semanticResults.forEach((result, index) => {
    semanticRankMap.set(result.nodeId, index + 1);
  });
  const outDegreeMap = new Map(allOutDegreeStats.map((stat) => [stat.nodeId, stat.outDegree]));
  const inDegreeMap = new Map(allInDegreeStats.map((stat) => [stat.nodeId, stat.inDegree]));
  const allNodeIds = /* @__PURE__ */ new Set([
    ...allOutDegreeStats.map((stat) => stat.nodeId),
    ...allInDegreeStats.map((stat) => stat.nodeId)
  ]);
  const categoryConnections = await getNodeCategoryConnections(Array.from(allNodeIds));
  const nodeScores = /* @__PURE__ */ new Map();
  const degreeNodeIds = /* @__PURE__ */ new Set([
    ...allOutDegreeStats.map((stat) => stat.nodeId),
    ...allInDegreeStats.map((stat) => stat.nodeId)
  ]);
  for (const nodeId of allNodeIds) {
    const outDegree = outDegreeMap.get(nodeId) || 0;
    const inDegree = inDegreeMap.get(nodeId) || 0;
    const uniqueCategories = categoryConnections.get(nodeId) || 0;
    const outDegreeRank = outDegreeRankMap.get(nodeId) || Number.MAX_SAFE_INTEGER;
    const inDegreeRank = inDegreeRankMap.get(nodeId) || Number.MAX_SAFE_INTEGER;
    const semanticRank = semanticRankMap.get(nodeId) || Number.MAX_SAFE_INTEGER;
    const semanticContribution = semanticEnabled ? 1 / (KEY_NODES_RRF_K + semanticRank) : 0;
    const outContribution = 1 / (KEY_NODES_RRF_K + outDegreeRank);
    const inContribution = 1 / (KEY_NODES_RRF_K + inDegreeRank);
    const degreeContribution = Math.max(outContribution, inContribution);
    let nodeType;
    if (uniqueCategories >= 2) {
      nodeType = "bridge";
    } else if (outDegree > inDegree * 1.2 && outDegree > 3) {
      nodeType = "hub";
    } else if (inDegree > outDegree * 1.2 && inDegree > 3) {
      nodeType = "authority";
    } else {
      nodeType = "balanced";
    }
    const bridgeBonus = nodeType === "bridge" ? 0.1 : 0;
    const rrfScore = semanticContribution + degreeContribution + bridgeBonus;
    nodeScores.set(nodeId, {
      nodeId,
      outDegree,
      inDegree,
      semanticScore: semanticRank < Number.MAX_SAFE_INTEGER ? semanticContribution : 0,
      rrfScore,
      nodeType,
      uniqueCategories
    });
  }
  return Array.from(nodeScores.values()).sort((a, b) => b.rrfScore - a.rrfScore).slice(0, candidateLimit * 2);
}

// src/service/tools/search-graph-inspector/find-orphans.ts
async function findOrphanNotes(params, templateManager) {
  const { filters, sorter, limit, response_format } = params;
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const hardOrphanIds = await mobiusEdgeRepo.getHardOrphans(ORPHAN_FETCH_LIMIT);
  let candidateAllOrphanNodes = [];
  if (hardOrphanIds.length > 0) {
    const hardOrphanNodeMap = await mobiusNodeRepo.getByIds(hardOrphanIds);
    candidateAllOrphanNodes = Array.from(hardOrphanNodeMap.values()).map((node) => ({
      ...node,
      orphanType: "hard"
    }));
  }
  const itemFiledGetter = await getDefaultItemFiledGetter(
    candidateAllOrphanNodes.map((node) => node.id),
    filters,
    sorter
  );
  const finalAllOrphanNodes = applyFiltersAndSorters(
    candidateAllOrphanNodes,
    filters,
    sorter,
    limit,
    itemFiledGetter
  );
  const orphanRevivalSuggestions = await findRevivalSuggestions(finalAllOrphanNodes);
  const hardOrphans = finalAllOrphanNodes.map((orphan, i) => {
    const suggestion = orphanRevivalSuggestions.get(orphan.id);
    return {
      index: i + 1,
      modified: orphan.modified,
      label: orphan.label,
      revival_suggestion: suggestion ? {
        title: suggestion.suggestedNode.title,
        reason: suggestion.reason
      } : null
    };
  });
  const data = {
    total_count: candidateAllOrphanNodes.length,
    filtered_count: finalAllOrphanNodes.length,
    hard_orphans: hardOrphans
  };
  return buildResponse(response_format, ToolTemplateId.OrphanNotes, data, { templateManager });
}
async function findRevivalSuggestions(orphans) {
  const suggestions = /* @__PURE__ */ new Map();
  const orphanIds = new Set(orphans.map((o) => o.id));
  for (const orphan of orphans) {
    if (!isIndexedNoteNodeType(orphan.type)) continue;
    try {
      const semanticNeighbors = await getSemanticNeighbors(orphan.id, 10, /* @__PURE__ */ new Set([orphan.id]));
      const closestNonOrphan = semanticNeighbors.filter((neighbor) => !orphanIds.has(neighbor.id)).sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))[0];
      if (closestNonOrphan) {
        suggestions.set(orphan.id, {
          suggestedNode: {
            path: closestNonOrphan.attributes ? JSON.parse(closestNonOrphan.attributes)?.path : closestNonOrphan.id,
            title: closestNonOrphan.label,
            similarity: parseFloat(closestNonOrphan.similarity)
          },
          reason: `High semantic similarity (${closestNonOrphan.similarity}) - suggests potential connection`
        });
      }
    } catch (error) {
      console.warn(`[findRevivalSuggestions] Failed to find suggestion for orphan ${orphan.id}:`, error);
    }
  }
  return suggestions;
}

// src/service/tools/search-graph-inspector/search-by-dimensions.ts
async function searchByDimensions(params, templateManager) {
  const { boolean_expression, semantic_filter, filters, sorter, limit, response_format } = params;
  const expr = typeof boolean_expression === "string" ? boolean_expression.trim() : "";
  if (!expr) {
    return "No search dimensions specified. Please specify a boolean_expression like 'tag:javascript AND functional:programming'.";
  }
  let parser;
  try {
    parser = new BooleanExpressionParser(expr);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Invalid boolean_expression: ${msg}. Use only tag:value, functional:value, AND, OR, NOT, and parentheses. Example: tag:javascript AND functional:programming. Attention. Only one word. do not use space. do not use special characters.`;
  }
  const { tags: expressionTags, functionals: expressionFunctionals, keywords: expressionKeywords } = parser.extractDimensions();
  if (expressionTags.length === 0 && expressionFunctionals.length === 0 && expressionKeywords.length === 0) {
    return "Boolean expression must contain at least one tag:functional: or keyword: filter.";
  }
  const { success: matchingDocumentsSuccess, message: matchingDocumentsMessage, data: matchingExpressionDocNodes, diagnosis: matchingDocumentsDiagnosis } = await findByExpressionWhere(expressionTags, expressionFunctionals, expressionKeywords);
  if (!matchingDocumentsSuccess || !matchingExpressionDocNodes) {
    if (matchingDocumentsDiagnosis) {
      const diagData = {
        boolean_expression,
        matched: 0,
        diagnosis: matchingDocumentsDiagnosis
      };
      return buildResponse(response_format, ToolTemplateId.SearchByDimensions, diagData, { templateManager });
    }
    return matchingDocumentsMessage || "Error finding matching documents.";
  }
  let docsAlignToSemantic = matchingExpressionDocNodes;
  if (semantic_filter) {
    const semanticSearchResults = await getSemanticSearchResults(
      semantic_filter,
      "limitIdsSet",
      { limitIdsSet: new Set(Array.from(matchingExpressionDocNodes.values()).map((document2) => document2.id)) }
    );
    if (semanticSearchResults && semanticSearchResults.length > 0) {
      let semanticScoreMap = new Map(semanticSearchResults.map((res) => [res.nodeId, res.score]));
      docsAlignToSemantic = new Map(
        Array.from(matchingExpressionDocNodes.entries()).filter(([id]) => semanticScoreMap.has(id)).map(([id, docNode]) => {
          return [id, { ...docNode, score: semanticScoreMap.get(id) }];
        })
      );
    }
  }
  const itemFiledGetter = await getDefaultItemFiledGetter(
    Array.from(docsAlignToSemantic.keys()),
    filters,
    sorter
  );
  const filtered = applyFiltersAndSorters(
    Array.from(docsAlignToSemantic.values()),
    filters,
    sorter,
    limit || 20,
    itemFiledGetter
  );
  const data = {
    boolean_expression,
    items: filtered,
    total_found: matchingExpressionDocNodes.size,
    semantic_filtered_cnt: matchingExpressionDocNodes.size - docsAlignToSemantic.size,
    all_filtered_cnt: matchingExpressionDocNodes.size - filtered.length
  };
  return buildResponse(response_format, ToolTemplateId.SearchByDimensions, data, { templateManager });
}
async function findByExpressionWhere(expressionTags, expressionFunctionals, expressionKeywords) {
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const tagLookupMap = await mobiusNodeRepo.getByTypeAndLabels(GraphNodeType.TopicTag, expressionTags).then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
  const functionalLookupMap = await mobiusNodeRepo.getByTypeAndLabels(GraphNodeType.FunctionalTag, expressionFunctionals).then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
  const keywordLookupMap = await mobiusNodeRepo.getByTypeAndLabels(GraphNodeType.KeywordTag, expressionKeywords).then((nodes) => new Map(nodes.map((node) => [node.label, node.id])));
  const unknownTags = expressionTags.filter((t) => !tagLookupMap.has(t));
  const unknownFunctionals = expressionFunctionals.filter((f) => !functionalLookupMap.has(f));
  const knownTags = expressionTags.filter((t) => tagLookupMap.has(t));
  const knownFunctionals = expressionFunctionals.filter((f) => functionalLookupMap.has(f));
  const allTargetNodeIds = [];
  tagLookupMap.forEach((id) => allTargetNodeIds.push(id));
  functionalLookupMap.forEach((id) => allTargetNodeIds.push(id));
  keywordLookupMap.forEach((id) => allTargetNodeIds.push(id));
  if (allTargetNodeIds.length === 0) {
    return {
      success: false,
      diagnosis: {
        unknown_tags: unknownTags,
        unknown_functionals: unknownFunctionals,
        known_tags: knownTags,
        known_functionals: knownFunctionals,
        suggestion: unknownTags.length + unknownFunctionals.length > 0 ? `Tags/functionals not found in vault: ${[...unknownTags, ...unknownFunctionals].join(", ")}. Check spelling or use local_search to discover valid tags.` : "All tags/functionals exist but no documents match the expression."
      }
    };
  }
  const documentIds = await mobiusEdgeRepo.getSourceNodesConnectedToAllTargets(allTargetNodeIds);
  if (documentIds.length === 0) {
    return {
      success: false,
      diagnosis: {
        unknown_tags: unknownTags,
        unknown_functionals: unknownFunctionals,
        known_tags: knownTags,
        known_functionals: knownFunctionals,
        suggestion: "Tags exist but AND intersection is empty. Try OR instead of AND, or check if tags are used on different documents."
      }
    };
  }
  return {
    success: true,
    data: await mobiusNodeRepo.getByIds(documentIds)
  };
}

// src/app/settings/types.ts
var import_obsidian6 = __toESM(require_obsidian_stub());

// src/service/prompt/PromptId.ts
var SEARCH_AI_ANALYSIS_PROMPT_IDS = [
  "ai-analysis-title" /* AiAnalysisTitle */,
  "ai-analysis-doc-simple-scope" /* AiAnalysisDocSimpleScope */,
  "ai-analysis-doc-simple-system" /* AiAnalysisDocSimpleSystem */,
  "ai-analysis-followup" /* AiAnalysisFollowup */,
  "ai-analysis-followup-system" /* AiAnalysisFollowupSystem */,
  "ai-analysis-save-filename" /* AiAnalysisSaveFileName */,
  "ai-analysis-save-folder" /* AiAnalysisSaveFolder */,
  // Vault pipeline
  "ai-analysis-vault-report-summary" /* AiAnalysisVaultReportSummary */,
  "ai-analysis-report-section" /* AiAnalysisReportSection */,
  "ai-analysis-mermaid-fix" /* AiAnalysisMermaidFix */,
  "ai-analysis-continue-system" /* AiAnalysisContinueSystem */,
  "ai-analysis-continue" /* AiAnalysisContinue */,
  "ai-analysis-synthesize" /* AiAnalysisSynthesize */
];
var INDEXING_AND_HUB_PROMPT_IDS = [
  "doc-summary-short" /* DocSummaryShort */,
  "doc-summary-full" /* DocSummaryFull */,
  "image-description" /* ImageDescription */,
  "image-summary" /* ImageSummary */,
  "doc-tag-generate-json" /* DocTagGenerateJson */,
  "knowledge-intuition-plan" /* KnowledgeIntuitionPlan */,
  "knowledge-intuition-submit" /* KnowledgeIntuitionSubmit */
];
var CONFIGURABLE_PROMPT_IDS = [
  // Chat summary prompts - users may want different models for summaries
  "conversation-summary-short" /* ConversationSummaryShort */,
  "conversation-summary-full" /* ConversationSummaryFull */,
  "project-summary-short" /* ProjectSummaryShort */,
  "project-summary-full" /* ProjectSummaryFull */,
  // Search prompts - users may want specialized models for search
  // AiAnalysis* prompts are in SEARCH_AI_ANALYSIS_PROMPT_IDS, not here
  "search-rerank-rank-gpt" /* SearchRerankRankGpt */,
  // Application prompts - title generation may benefit from different models
  "application-generate-title" /* ApplicationGenerateTitle */,
  // Memory/Profile prompts
  "memory-extract-candidates-json" /* MemoryExtractCandidatesJson */
];

// src/app/settings/types.ts
var AI_PATH_SUBFOLDERS = {
  Prompts: "Prompts",
  Attachments: "Attachments",
  ResourcesSummary: "resources-summary-cache",
  HubSummaries: "Hub-Summaries",
  ManualHubNotes: "Manual",
  UserProfile: "system/User-Profile.md"
};
function aiNormalizedRootFolder(rootFolderOverride) {
  const raw = rootFolderOverride !== void 0 ? rootFolderOverride : AppContext.getInstance().settings.ai.rootFolder;
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BusinessError("CONFIGURATION_MISSING" /* CONFIGURATION_MISSING */, "AI rootFolder is empty; ensure settings are initialized.");
  }
  return (0, import_obsidian6.normalizePath)(trimmed.replace(/\/+$/, ""));
}
function getAIPromptFolder(rootFolder) {
  return (0, import_obsidian6.normalizePath)(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.Prompts}`);
}
function getAIHubSummaryFolder(rootFolder) {
  return (0, import_obsidian6.normalizePath)(`${aiNormalizedRootFolder(rootFolder)}/${AI_PATH_SUBFOLDERS.HubSummaries}`);
}
var DEFAULT_AI_SERVICE_SETTINGS = {
  rootFolder: "ChatFolder",
  defaultModel: { provider: "openai", modelId: "gpt-4o-mini" },
  llmProviderConfigs: {},
  profileEnabled: true,
  promptModelMap: (() => {
    const defaultModel = { provider: "openai", modelId: "gpt-4o-mini" };
    const map = {};
    for (const promptId of [...CONFIGURABLE_PROMPT_IDS, ...INDEXING_AND_HUB_PROMPT_IDS, ...SEARCH_AI_ANALYSIS_PROMPT_IDS]) {
      map[promptId] = { ...defaultModel };
    }
    return map;
  })(),
  attachmentHandlingDefault: "direct",
  defaultOutputControl: {
    temperature: 1,
    topP: 0.9,
    topK: 50,
    presencePenalty: 0,
    frequencyPenalty: 0,
    reasoningEffort: "medium",
    textVerbosity: "medium",
    timeoutTotalMs: 3e5,
    timeoutStepMs: 3e4
  }
};

// src/core/utils/pathTreeCompact.ts
var INDENT_STEP = "        ";
function buildPathTree(paths) {
  const root = { segment: "", files: [], children: /* @__PURE__ */ new Map() };
  for (const p of paths) {
    const i = p.lastIndexOf("/");
    const dirPath = i >= 0 ? p.slice(0, i) : "";
    const file = i >= 0 ? p.slice(i + 1) : p;
    const segments = dirPath ? dirPath.split("/") : [];
    let node = root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, { segment: seg, files: [], children: /* @__PURE__ */ new Map() });
      }
      node = node.children.get(seg);
    }
    node.files.push(file);
  }
  return root;
}
function getCommonPrefixPath(node) {
  const path4 = [];
  let cur = node;
  while (cur.children.size === 1 && cur.files.length === 0) {
    const onlyChild = Array.from(cur.children.entries())[0];
    path4.push(onlyChild[0]);
    cur = onlyChild[1];
  }
  return path4;
}
function buildPathTreeWithSuffix(items) {
  const root = { segment: "", files: [], children: /* @__PURE__ */ new Map() };
  for (const { path: p, suffix } of items) {
    const i = p.lastIndexOf("/");
    const dirPath = i >= 0 ? p.slice(0, i) : "";
    const name = i >= 0 ? p.slice(i + 1) : p;
    const segments = dirPath ? dirPath.split("/") : [];
    let node = root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, { segment: seg, files: [], children: /* @__PURE__ */ new Map() });
      }
      node = node.children.get(seg);
    }
    node.files.push({ name, suffix });
  }
  return root;
}
function getCommonPrefixPathWithSuffix(node) {
  const path4 = [];
  let cur = node;
  while (cur.children.size === 1 && cur.files.length === 0) {
    const onlyChild = Array.from(cur.children.entries())[0];
    path4.push(onlyChild[0]);
    cur = onlyChild[1];
  }
  return path4;
}
function serializePathTreeWithSuffix(node, indent, segmentPrefix, ctx) {
  const sortedChildEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  const hasChildren = sortedChildEntries.length > 0;
  const hasFiles = sortedFiles.length > 0;
  if (node.segment) {
    if (hasFiles && !hasChildren) {
      const filePart = sortedFiles.map((f) => f.name + f.suffix).join(", ");
      const line = indent + segmentPrefix + node.segment + "/[" + filePart + "]";
      if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
      ctx.lines.push(line);
      ctx.pathsShown += sortedFiles.length;
      ctx.totalChars += line.length + 1;
      return;
    }
    if (hasChildren || hasFiles) {
      const line = indent + segmentPrefix + node.segment + "/";
      if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
      ctx.lines.push(line);
      ctx.totalChars += line.length + 1;
    }
  }
  if (hasFiles && hasChildren) {
    const filePart = sortedFiles.map((f) => f.name + f.suffix).join(", ");
    const line = indent + "[" + filePart + "]";
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
    ctx.lines.push(line);
    ctx.pathsShown += sortedFiles.length;
    ctx.totalChars += line.length + 1;
  }
  const nextIndent = indent + INDENT_STEP;
  for (const [, child] of sortedChildEntries) {
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
    serializePathTreeWithSuffix(child, nextIndent, "/", ctx);
  }
}
function compactPathsWithSuffix(items, maxLines = 40, maxChars = 3500) {
  if (items.length === 0) return "";
  const root = buildPathTreeWithSuffix(items);
  const ctx = { lines: [], totalChars: 0, pathsShown: 0, maxLines, maxChars, totalPaths: items.length };
  const commonSegments = getCommonPrefixPathWithSuffix(root);
  const commonPrefix = commonSegments.length > 0 ? commonSegments.join("/") + "/" : "";
  let node = root;
  for (const seg of commonSegments) {
    node = node.children.get(seg);
  }
  if (commonPrefix && (node.files.length > 0 || node.children.size > 0)) {
    const line = commonPrefix;
    if (ctx.totalChars + line.length + 1 <= ctx.maxChars) {
      ctx.lines.push(line);
      ctx.totalChars += line.length + 1;
    }
  }
  const sortedEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  if (sortedFiles.length > 0) {
    const filePart = sortedFiles.map((f) => f.name + f.suffix).join(", ");
    const line = INDENT_STEP + "[" + filePart + "]";
    if (ctx.lines.length < ctx.maxLines && ctx.totalChars + line.length + 1 <= ctx.maxChars) {
      ctx.lines.push(line);
      ctx.pathsShown += sortedFiles.length;
      ctx.totalChars += line.length + 1;
    }
  }
  for (const [, child] of sortedEntries) {
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
    serializePathTreeWithSuffix(child, INDENT_STEP, "", ctx);
  }
  if (ctx.pathsShown < items.length && ctx.lines.length < maxLines) {
    const remaining = items.length - ctx.pathsShown;
    const tail = "... and " + remaining + " more";
    if (ctx.totalChars + tail.length + 1 <= ctx.maxChars) ctx.lines.push(tail);
  }
  return ctx.lines.join("\n");
}
function serializePathTree(node, indent, segmentPrefix, ctx) {
  const sortedChildEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.localeCompare(b));
  const hasChildren = sortedChildEntries.length > 0;
  const hasFiles = sortedFiles.length > 0;
  if (node.segment) {
    if (hasFiles && !hasChildren) {
      const line = indent + segmentPrefix + node.segment + "/[" + sortedFiles.join(", ") + "]";
      if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
      ctx.lines.push(line);
      ctx.pathsShown += sortedFiles.length;
      ctx.totalChars += line.length + 1;
      return;
    }
    if (hasChildren || hasFiles) {
      const line = indent + segmentPrefix + node.segment + "/";
      if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
      ctx.lines.push(line);
      ctx.totalChars += line.length + 1;
    }
  }
  if (hasFiles && hasChildren) {
    const line = indent + "[" + sortedFiles.join(", ") + "]";
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
    ctx.lines.push(line);
    ctx.pathsShown += sortedFiles.length;
    ctx.totalChars += line.length + 1;
  }
  const nextIndent = indent + INDENT_STEP;
  for (const [, child] of sortedChildEntries) {
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
    serializePathTree(child, nextIndent, "/", ctx);
  }
}
function compactPathsForPrompt(paths, maxLines = 60, maxChars = 4e3) {
  if (paths.length === 0) return "";
  const root = buildPathTree(paths);
  const ctx = { lines: [], totalChars: 0, pathsShown: 0, maxLines, maxChars, totalPaths: paths.length };
  const commonSegments = getCommonPrefixPath(root);
  const commonPrefix = commonSegments.length > 0 ? commonSegments.join("/") + "/" : "";
  let node = root;
  for (const seg of commonSegments) {
    node = node.children.get(seg);
  }
  if (commonPrefix && (node.files.length > 0 || node.children.size > 0)) {
    const line = commonPrefix;
    if (ctx.totalChars + line.length + 1 <= ctx.maxChars) {
      ctx.lines.push(line);
      ctx.totalChars += line.length + 1;
    }
  }
  const sortedEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.localeCompare(b));
  if (sortedFiles.length > 0) {
    const line = INDENT_STEP + "[" + sortedFiles.join(", ") + "]";
    if (ctx.lines.length < ctx.maxLines && ctx.totalChars + line.length + 1 <= ctx.maxChars) {
      ctx.lines.push(line);
      ctx.pathsShown += sortedFiles.length;
      ctx.totalChars += line.length + 1;
    }
  }
  for (const [, child] of sortedEntries) {
    if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
    serializePathTree(child, INDENT_STEP, "", ctx);
  }
  if (ctx.pathsShown < paths.length && ctx.lines.length < maxLines) {
    const remaining = paths.length - ctx.pathsShown;
    const tail = "... and " + remaining + " more path(s)";
    if (ctx.totalChars + tail.length + 1 <= ctx.maxChars) ctx.lines.push(tail);
  }
  return ctx.lines.join("\n");
}

// src/service/tools/search-graph-inspector/explore-folder.ts
var import_obsidian7 = __toESM(require_obsidian_stub());
async function exploreFolder(params, templateManager) {
  const { folderPath, recursive, max_depth, limit, response_format } = params;
  const perFolderLimit = Math.max(1, Number(limit) ?? EXPLORE_FOLDER_DEFAULT_LIMIT);
  const vault = AppContext.getInstance().app.vault;
  const normalizedPath = normalizeVaultFolderPath(folderPath);
  const exclusions = getExploreFolderExclusions();
  if (exclusions.enabled && isPathExcluded(normalizedPath, exclusions.excludedPathPrefixes)) {
    return renderExploreFolderExcludedMarkdown(folderPath, exclusions.excludedPathPrefixes);
  }
  const targetFolder = normalizedPath === "" ? vault.getRoot() : vault.getAbstractFileByPath(normalizedPath);
  if (!targetFolder || !(targetFolder instanceof import_obsidian7.TFolder)) {
    return `Folder not found: ${folderPath}`;
  }
  const fullTree = getFolderStructure(
    targetFolder,
    recursive,
    max_depth ?? 3,
    0,
    exclusions.enabled ? exclusions.excludedPathPrefixes : void 0
  );
  const allCandidateFilePaths = getAllFilePaths(fullTree);
  if (!allCandidateFilePaths.length) {
    return "No files found in the folder";
  }
  const { items: finalFileTree, omitted: rootOmitted } = limitAndSortTree(fullTree, perFolderLimit);
  const visibleFilePaths = getAllFilePaths(finalFileTree);
  const { tagDesc, userKeywordTagDesc, categoryDesc } = exclusions.enabled ? await getTagsAndCategoriesByDocPaths(visibleFilePaths, perFolderLimit) : await getTagsAndCategoriesByFolderPath(normalizedPath, perFolderLimit);
  const docStats = exclusions.enabled ? await getDocStatisticsByDocPaths(visibleFilePaths, perFolderLimit) : await getDocStatisticsByFolderPath(normalizedPath, perFolderLimit);
  const sameGroupCountByPath = buildSameGroupCountByPath(finalFileTree);
  const compactFileTree = compactPathsForPrompt(visibleFilePaths, 80, 6e3);
  const compactRecentEdited = docStats.topRecentEdited.items.length > 0 ? compactPathsWithSuffix(
    docStats.topRecentEdited.items.map((i) => ({
      path: i.path,
      suffix: ` (${humanReadableTime(i.updated_at)})${(i.sameGroupCount ?? 0) > 1 ? ` _(${i.sameGroupCount} similar)_` : ""}`
    })),
    40,
    3500
  ) : "";
  const compactWordCount = docStats.topWordCount.length > 0 ? compactPathsWithSuffix(docStats.topWordCount.map((i) => ({ path: i.path, suffix: `: ${i.word_count} words` })), 40, 3500) : "";
  const compactCharCount = docStats.topCharCount.length > 0 ? compactPathsWithSuffix(docStats.topCharCount.map((i) => ({ path: i.path, suffix: `: ${i.char_count} characters` })), 40, 3500) : "";
  const compactRichness = docStats.topRichness.length > 0 ? compactPathsWithSuffix(docStats.topRichness.map((i) => ({ path: i.path, suffix: `: ${i.richness_score} richness` })), 40, 3500) : "";
  const compactTopLinksIn = docStats.topLinksIn.length > 0 ? compactPathsWithSuffix(docStats.topLinksIn.map((i) => ({ path: i.path, suffix: `: ${i.inDegree}` })), 40, 3500) : "";
  const compactTopLinksOut = docStats.topLinksOut.length > 0 ? compactPathsWithSuffix(docStats.topLinksOut.map((i) => ({ path: i.path, suffix: `: ${i.outDegree}` })), 40, 3500) : "";
  const data = {
    current_path: folderPath,
    recursive,
    max_depth: max_depth || 3,
    fileTree: finalFileTree,
    compactFileTree,
    compactRecentEdited,
    compactWordCount,
    compactCharCount,
    compactRichness,
    compactTopLinksIn,
    compactTopLinksOut,
    sameGroupCountByPath,
    rootOmitted,
    tagDesc,
    userKeywordTagDesc,
    categoryDesc,
    docStats
  };
  return buildExploreFolderResponse(response_format, data, templateManager);
}
function getFolderStructure(folder, recursive, maxDepth, currentDepth, excludedPathPrefixes) {
  const result = [];
  for (const child of folder.children) {
    if (excludedPathPrefixes?.length && isPathExcluded(child.path, excludedPathPrefixes)) {
      continue;
    }
    const mtime = child.stat?.mtime ?? 0;
    const name = child.path.split("/").pop() ?? child.path;
    const base = { path: child.path, name, mtime };
    if (child instanceof import_obsidian7.TFolder) {
      const folderItem = {
        ...base,
        type: "folder",
        linkPath: "",
        depth: 0
      };
      if (recursive && currentDepth < maxDepth - 1) {
        folderItem.children = getFolderStructure(child, recursive, maxDepth, currentDepth + 1, excludedPathPrefixes);
      }
      result.push(folderItem);
    } else if (child instanceof import_obsidian7.TFile) {
      result.push({
        ...base,
        type: "file",
        linkPath: "",
        depth: 0
      });
    }
  }
  return result;
}
function linkPathRelativeTo(fullPath, parentPath) {
  if (!parentPath) return fullPath;
  const prefix = parentPath + "/";
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}
function compressFileSiblings(items, rest = []) {
  const files = items.filter((it) => it.type === "file");
  if (files.length === 0) return items;
  const keyToGroup = /* @__PURE__ */ new Map();
  for (const f of files) {
    const basename = f.name ?? f.path.split("/").pop() ?? "";
    const key = normalizeRecentEditedKey(basename);
    const arr = keyToGroup.get(key) ?? [];
    arr.push(f);
    keyToGroup.set(key, arr);
  }
  const restCountByKey = /* @__PURE__ */ new Map();
  for (const it of rest) {
    if (it.type !== "file") continue;
    const basename = it.name ?? it.path.split("/").pop() ?? "";
    if (!basename) continue;
    const key = normalizeRecentEditedKey(basename);
    restCountByKey.set(key, (restCountByKey.get(key) ?? 0) + 1);
  }
  const keyToRep = /* @__PURE__ */ new Map();
  for (const [key, group] of keyToGroup) {
    const sorted = [...group].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
    const rep = sorted[0];
    const ext = rep.path.split(".").pop() ?? "";
    const patternName = ext ? `${key}.${ext}` : key;
    const restCount = restCountByKey.get(key) ?? 0;
    const total = group.length + restCount;
    const repObj = {
      type: rep.type,
      path: rep.path,
      name: rep.name,
      linkPath: rep.linkPath,
      depth: rep.depth,
      mtime: rep.mtime,
      sameGroupCount: total,
      ...total > 1 ? { patternName } : {}
    };
    keyToRep.set(key, repObj);
  }
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const it of items) {
    if (it.type === "folder") {
      result.push(it);
      continue;
    }
    const basename = it.name ?? it.path.split("/").pop() ?? "";
    const key = normalizeRecentEditedKey(basename);
    if (seen.has(key)) continue;
    seen.add(key);
    const rep = keyToRep.get(key);
    if (rep) result.push(rep);
  }
  return result;
}
function limitAndSortTree(nodes, limit, parentPath = "", depth = 0) {
  const sorted = [...nodes].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
  const taken = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const omitted = rest.length ? summarizeOmitted(rest) : void 0;
  const rawItems = taken.map((node) => {
    const linkPath = linkPathRelativeTo(node.path, parentPath);
    if (node.type === "file") {
      return {
        type: "file",
        path: node.path,
        name: node.name,
        linkPath,
        depth,
        mtime: node.mtime
      };
    }
    const { items: childItems, omitted: childOmitted } = limitAndSortTree(
      node.children ?? [],
      limit,
      node.path,
      depth + 1
    );
    return {
      type: "folder",
      path: node.path,
      name: node.name,
      linkPath,
      depth,
      mtime: node.mtime,
      children: childItems,
      omitted: childOmitted
    };
  });
  const items = compressFileSiblings(rawItems, rest);
  return { items, omitted, rest };
}
function summarizeOmitted(rest) {
  const byExt = {};
  let folderCount = 0;
  for (const item of rest) {
    if (item.type === "folder") {
      folderCount++;
    } else {
      const ext = item.path.split(".").pop()?.toLowerCase() ?? "unknown";
      byExt[ext] = (byExt[ext] ?? 0) + 1;
    }
  }
  return { total: rest.length, byExt, folderCount };
}
function normalizeRecentEditedKey(basename) {
  if (!basename || typeof basename !== "string") return basename || "";
  const withoutExt = basename.replace(/\.[^.]+$/, "");
  return withoutExt.replace(/^\d+\s*-\s*/, "*").replace(/\d{6,}(\s*-\s*)?/g, "*").trim() || withoutExt;
}
function compressRecentEdited(items) {
  if (items.length === 0) {
    return { items: [], totalItems: 0, totalGroups: 0 };
  }
  const keyToGroup = /* @__PURE__ */ new Map();
  for (const it of items) {
    const basename = it.path.split("/").pop() ?? it.path;
    const key = normalizeRecentEditedKey(basename);
    const arr = keyToGroup.get(key) ?? [];
    arr.push(it);
    keyToGroup.set(key, arr);
  }
  const result = [];
  for (const group of keyToGroup.values()) {
    const sorted = [...group].sort((a, b) => b.updated_at - a.updated_at);
    const representative = sorted[0];
    result.push({
      path: representative.path,
      updated_at: representative.updated_at,
      sameGroupCount: group.length
    });
  }
  result.sort((a, b) => b.updated_at - a.updated_at);
  return {
    items: result,
    totalItems: items.length,
    totalGroups: result.length
  };
}
function getAllFilePaths(fileTree) {
  const filePaths = [];
  for (const item of fileTree) {
    if (item.type === "file") filePaths.push(item.path);
    else if (item.children) filePaths.push(...getAllFilePaths(item.children));
  }
  return filePaths;
}
function buildSameGroupCountByPath(tree) {
  const out = {};
  function walk(nodes) {
    for (const node of nodes) {
      if (node.type === "file" && node.path && typeof node.sameGroupCount === "number") {
        const n = node.sameGroupCount;
        if (n > 1) out[node.path] = n;
      }
      if (node.children?.length) walk(node.children);
    }
  }
  walk(tree);
  return out;
}
async function getTagsAndCategoriesByFolderPath(pathPrefix, topN2 = 20) {
  const graphRepo = sqliteStoreManager.getGraphRepo();
  const docIds = pathPrefix === "" ? void 0 : (await sqliteStoreManager.getIndexedDocumentRepo().getIdsByFolderPath(pathPrefix)).map((m) => m.id);
  if (docIds !== void 0 && docIds.length === 0) {
    return { tagDesc: "", userKeywordTagDesc: "", categoryDesc: "" };
  }
  const { topicTagCounts, functionalTagCounts, keywordTagCounts } = await graphRepo.getTagsByDocIds(docIds);
  const tagDesc = Array.from(topicTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN2).map(([name, count]) => `${name}(${count})`).join(", ");
  const userKeywordTagDesc = Array.from(keywordTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN2).map(([name, count]) => `${name}(${count})`).join(", ");
  const categoryDesc = Array.from(functionalTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN2).map(([name, count]) => `${name}(${count})`).join(", ");
  return { tagDesc, userKeywordTagDesc, categoryDesc };
}
async function getDocStatisticsByFolderPath(pathPrefix, topK = 5) {
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const docIdsMaps = pathPrefix === "" ? null : await indexedDocumentRepo.getIdsByFolderPath(pathPrefix);
  const docIds = docIdsMaps === null ? void 0 : docIdsMaps.map((m) => m.id);
  if (docIds !== void 0 && docIds.length === 0) {
    return {
      totalFiles: 0,
      topRecentEdited: { items: [], totalItems: 0, totalGroups: 0, compressedCount: 0 },
      topWordCount: [],
      topCharCount: [],
      topRichness: [],
      topLinksIn: [],
      topLinksOut: [],
      hasTopLinks: false,
      languageStats: void 0
    };
  }
  const [
    topRecentEditedRaw,
    topWordCount,
    topCharCount,
    topRichness,
    languageStatsRows,
    totalFiles,
    { topLinksInRaw, topLinksOutRaw }
  ] = await Promise.all([
    mobiusNodeRepo.getTopRecentEditedByDocIds(docIds, topK),
    mobiusNodeRepo.getTopWordCountByDocIds(docIds, topK),
    mobiusNodeRepo.getTopCharCountByDocIds(docIds, topK),
    mobiusNodeRepo.getTopRichnessByDocIds(docIds, topK),
    mobiusNodeRepo.getLanguageStatsByDocIds(docIds),
    docIds === void 0 ? mobiusNodeRepo.countAllDocumentStatisticsRows() : Promise.resolve(docIds.length),
    // Edge type in graph_edges is relationship type (e.g. 'references', 'tagged'), not node type; use no filter to count all edges.
    pathPrefix === "" ? mobiusEdgeRepo.getTopNodeIdsByDegree(topK, void 0, GRAPH_WIKI_REFERENCE_EDGE_TYPES).then((r) => ({
      topLinksInRaw: r.topByInDegree.map((x) => ({ node_id: x.nodeId, inDegree: x.inDegree })),
      topLinksOutRaw: r.topByOutDegree.map((x) => ({ node_id: x.nodeId, outDegree: x.outDegree }))
    })) : mobiusEdgeRepo.countEdges(docIds).then(({ incoming, outgoing }) => ({
      topLinksInRaw: [...incoming.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, inDegree]) => ({ node_id, inDegree })),
      topLinksOutRaw: [...outgoing.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, outDegree]) => ({ node_id, outDegree }))
    }))
  ]);
  const allDocIdsFromTops = [
    ...topRecentEditedRaw.map((r) => r.doc_id),
    ...topWordCount.map((r) => r.doc_id),
    ...topCharCount.map((r) => r.doc_id),
    ...topRichness.map((r) => r.doc_id),
    ...topLinksInRaw.map((r) => r.node_id),
    ...topLinksOutRaw.map((r) => r.node_id)
  ];
  const uniqueIds = [...new Set(allDocIdsFromTops)];
  const idToPathMap = docIdsMaps !== null ? new Map(docIdsMaps.map((m) => [m.id, m.path])) : new Map((uniqueIds.length ? await indexedDocumentRepo.getByIds(uniqueIds) : []).map((m) => [m.id, m.path]));
  const languageStats = {};
  for (const row of languageStatsRows) {
    languageStats[row.language] = row.count;
  }
  const topRecentEditedList = topRecentEditedRaw.map((item) => ({
    path: idToPathMap.get(item.doc_id) ?? item.doc_id,
    updated_at: item.updated_at
  }));
  const topRecentEdited = compressRecentEdited(topRecentEditedList);
  return {
    totalFiles,
    topRecentEdited: {
      ...topRecentEdited,
      compressedCount: topRecentEdited.totalItems - topRecentEdited.totalGroups
    },
    topWordCount: topWordCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, word_count: item.word_count })),
    topCharCount: topCharCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, char_count: item.char_count })),
    topRichness: topRichness.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, richness_score: item.richness_score })),
    topLinksIn: topLinksInRaw.map((item) => ({
      path: idToPathMap.get(item.node_id) ?? item.node_id,
      inDegree: item.inDegree
    })),
    topLinksOut: topLinksOutRaw.map((item) => ({
      path: idToPathMap.get(item.node_id) ?? item.node_id,
      outDegree: item.outDegree
    })),
    hasTopLinks: topLinksInRaw.length > 0 || topLinksOutRaw.length > 0,
    languageStats: Object.keys(languageStats).length > 0 ? languageStats : void 0
  };
}
function normalizeVaultFolderPath(folderPath) {
  const raw = folderPath == null ? "" : String(folderPath).trim();
  if (raw === "" || raw === "/") return "";
  return raw.replace(/^\/+|\/+$/g, "");
}
function isPathExcluded(path4, excludedPathPrefixes) {
  if (!excludedPathPrefixes.length) return false;
  const p = normalizeVaultFolderPath(path4);
  if (p === "") return false;
  const hub = normalizeVaultFolderPath(getAIHubSummaryFolder());
  if (hub && (p === hub || p.startsWith(hub + "/"))) {
    return false;
  }
  for (const rawPrefix of excludedPathPrefixes) {
    const prefix = normalizeVaultFolderPath(rawPrefix);
    if (!prefix) continue;
    if (p === prefix) return true;
    if (p.startsWith(prefix + "/")) return true;
  }
  return false;
}
function getExploreFolderExclusions() {
  const settings = AppContext.getInstance().settings;
  const enabled = settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true;
  if (!enabled) return { enabled: false, excludedPathPrefixes: [] };
  const rootFolder = normalizeVaultFolderPath(settings.ai.rootFolder);
  const autoSaveFolder = normalizeVaultFolderPath(settings.search.aiAnalysisAutoSaveFolder);
  const excludedPathPrefixes = Array.from(new Set([rootFolder, autoSaveFolder].filter(Boolean)));
  return { enabled: excludedPathPrefixes.length > 0, excludedPathPrefixes };
}
function getFullVaultFilePathsForGrep() {
  const vault = AppContext.getInstance().app.vault;
  const root = vault.getRoot();
  const exclusions = getExploreFolderExclusions();
  const tree = getFolderStructure(
    root,
    true,
    50,
    0,
    exclusions.enabled ? exclusions.excludedPathPrefixes : void 0
  );
  return getAllFilePaths(tree);
}
function renderExploreFolderExcludedMarkdown(requestedFolderPath, excludedPrefixes) {
  const req = requestedFolderPath == null ? "" : String(requestedFolderPath);
  const list = excludedPrefixes.map((p) => `- \`${p}\``).join("\n");
  return [
    `## explore_folder`,
    ``,
    `The requested folder is excluded by settings and cannot be explored.`,
    ``,
    `- Requested: \`${req}\``,
    `- Excluded prefixes:`,
    list || `- (none)`
  ].join("\n");
}
async function buildExploreFolderResponse(responseFormat, data, templateManager) {
  if (responseFormat === "structured") return data;
  const markdown = await renderExploreFolderMarkdown(data, templateManager);
  if (responseFormat === "markdown") return markdown;
  return { data, template: markdown };
}
async function renderExploreFolderMarkdown(data, templateManager) {
  const tm = templateManager ?? AppContext.getInstance().manager.getTemplateManager?.();
  if (tm) {
    try {
      const rendered = await tm.render(ToolTemplateId.ExploreFolder, data);
      if (typeof rendered === "string" && rendered.trim() !== "") return rendered;
    } catch {
    }
  }
  return fallbackExploreFolderMarkdown(data);
}
function fallbackExploreFolderMarkdown(data) {
  const root = data?.current_path ?? "/";
  const maxDepth = data?.max_depth ?? 3;
  const recursive = Boolean(data?.recursive);
  const lines = [];
  lines.push(`## Folder: \`${root}\``);
  lines.push(``);
  lines.push(`- recursive: \`${String(recursive)}\``);
  lines.push(`- max_depth: \`${String(maxDepth)}\``);
  lines.push(``);
  lines.push(`\`\`\``);
  const tree = Array.isArray(data?.fileTree) ? data.fileTree : [];
  for (const node of tree) {
    lines.push(...renderTreeLines(node));
  }
  if (!tree.length) lines.push("(empty)");
  lines.push(`\`\`\``);
  const omitted = data?.rootOmitted;
  if (omitted?.total) {
    lines.push(``);
    lines.push(`- omitted_at_root: ${omitted.total} item(s) (folders: ${omitted.folderCount})`);
  }
  return lines.join("\n");
}
function renderTreeLines(node) {
  const indent = "  ".repeat(Math.max(0, node.depth ?? 0));
  const suffix = node.type === "folder" ? "/" : "";
  const group = node.sameGroupCount && node.sameGroupCount > 1 ? ` (x${node.sameGroupCount}${node.patternName ? `, ${node.patternName}` : ""})` : "";
  const line = `${indent}${node.name}${suffix}${group}`;
  const out = [line];
  if (node.type === "folder" && node.children?.length) {
    for (const child of node.children) {
      out.push(...renderTreeLines(child));
    }
  }
  return out;
}
async function getTagsAndCategoriesByDocPaths(paths, topN2 = 20) {
  const uniquePaths = [...new Set(paths)].filter(Boolean);
  if (!uniquePaths.length) return { tagDesc: "", userKeywordTagDesc: "", categoryDesc: "" };
  const docIdsMaps = await sqliteStoreManager.getIndexedDocumentRepo().getIdsByPaths(uniquePaths);
  const docIds = docIdsMaps.map((m) => m.id);
  if (!docIds.length) return { tagDesc: "", userKeywordTagDesc: "", categoryDesc: "" };
  const { topicTagCounts, functionalTagCounts, keywordTagCounts } = await sqliteStoreManager.getGraphRepo().getTagsByDocIds(docIds);
  const tagDesc = Array.from(topicTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN2).map(([name, count]) => `${name}(${count})`).join(", ");
  const userKeywordTagDesc = Array.from(keywordTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN2).map(([name, count]) => `${name}(${count})`).join(", ");
  const categoryDesc = Array.from(functionalTagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN2).map(([name, count]) => `${name}(${count})`).join(", ");
  return { tagDesc, userKeywordTagDesc, categoryDesc };
}
async function getDocStatisticsByDocPaths(paths, topK = 5) {
  const uniquePaths = [...new Set(paths)].filter(Boolean);
  if (!uniquePaths.length) {
    return {
      totalFiles: 0,
      topRecentEdited: { items: [], totalItems: 0, totalGroups: 0, compressedCount: 0 },
      topWordCount: [],
      topCharCount: [],
      topRichness: [],
      topLinksIn: [],
      topLinksOut: [],
      hasTopLinks: false,
      languageStats: void 0
    };
  }
  const cappedPaths = uniquePaths.slice(0, SLICE_CAPS.inspector.exploreFolderPaths);
  const docIdsMaps = await sqliteStoreManager.getIndexedDocumentRepo().getIdsByPaths(cappedPaths);
  const docIds = docIdsMaps.map((m) => m.id);
  if (!docIds.length) {
    return {
      totalFiles: 0,
      topRecentEdited: { items: [], totalItems: 0, totalGroups: 0, compressedCount: 0 },
      topWordCount: [],
      topCharCount: [],
      topRichness: [],
      topLinksIn: [],
      topLinksOut: [],
      hasTopLinks: false,
      languageStats: void 0
    };
  }
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const idToPathMap = new Map(docIdsMaps.map((m) => [m.id, m.path]));
  const [
    topRecentEditedRaw,
    topWordCount,
    topCharCount,
    topRichness,
    languageStatsRows,
    { topLinksInRaw, topLinksOutRaw }
  ] = await Promise.all([
    mobiusNodeRepo.getTopRecentEditedByDocIds(docIds, topK),
    mobiusNodeRepo.getTopWordCountByDocIds(docIds, topK),
    mobiusNodeRepo.getTopCharCountByDocIds(docIds, topK),
    mobiusNodeRepo.getTopRichnessByDocIds(docIds, topK),
    mobiusNodeRepo.getLanguageStatsByDocIds(docIds),
    mobiusEdgeRepo.countEdges(docIds).then(({ incoming, outgoing }) => ({
      topLinksInRaw: [...incoming.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, inDegree]) => ({ node_id, inDegree })),
      topLinksOutRaw: [...outgoing.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([node_id, outDegree]) => ({ node_id, outDegree }))
    }))
  ]);
  const languageStats = {};
  for (const row of languageStatsRows) {
    languageStats[row.language] = row.count;
  }
  const topRecentEditedList = topRecentEditedRaw.map((item) => ({
    path: idToPathMap.get(item.doc_id) ?? item.doc_id,
    updated_at: item.updated_at
  }));
  const topRecentEdited = compressRecentEdited(topRecentEditedList);
  return {
    totalFiles: docIds.length,
    topRecentEdited: {
      ...topRecentEdited,
      compressedCount: topRecentEdited.totalItems - topRecentEdited.totalGroups
    },
    topWordCount: topWordCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, word_count: item.word_count })),
    topCharCount: topCharCount.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, char_count: item.char_count })),
    topRichness: topRichness.map((item) => ({ path: idToPathMap.get(item.doc_id) ?? item.doc_id, richness_score: item.richness_score })),
    topLinksIn: topLinksInRaw.map((item) => ({
      path: idToPathMap.get(item.node_id) ?? item.node_id,
      inDegree: item.inDegree
    })),
    topLinksOut: topLinksOutRaw.map((item) => ({
      path: idToPathMap.get(item.node_id) ?? item.node_id,
      outDegree: item.outDegree
    })),
    hasTopLinks: topLinksInRaw.length > 0 || topLinksOutRaw.length > 0,
    languageStats: Object.keys(languageStats).length > 0 ? languageStats : void 0
  };
}

// src/service/tools/search-graph-inspector/grep-file-tree.ts
var DEFAULT_LIMIT = 200;
async function grepFileTree(params) {
  const limit = Math.min(DEFAULT_LIMIT, Math.max(1, Number(params.limit) ?? DEFAULT_LIMIT));
  const pattern = String(params.pattern).trim();
  const allPaths = getFullVaultFilePathsForGrep();
  const matched = allPaths.filter((p) => matchVaultPathByGrepPattern(p, pattern));
  const slice = matched.slice(0, limit);
  const total = matched.length;
  const lines = slice.map((p) => `- ${p}`);
  const header = [
    "## grep_file_tree",
    "",
    `Pattern: \`${pattern}\``,
    `Matches: ${slice.length}${total > limit ? ` (showing first ${limit} of ${total})` : ""}`,
    ""
  ].join("\n");
  return header + lines.join("\n");
}

// src/service/tools/search-graph-inspector/recent-change-whole-vault.ts
async function getRecentChanges(params, templateManager) {
  const { limit, response_format, filters, sorter } = params;
  const candidateItems = await AppContext.getInstance().searchClient.getRecent(limit);
  const itemFiledGetter = await getDefaultItemFiledGetter(candidateItems.map((item) => item.id), filters, sorter);
  const finalItems = applyFiltersAndSorters(candidateItems, filters, sorter, limit, itemFiledGetter);
  const data = { items: finalItems };
  return buildResponse(response_format, ToolTemplateId.RecentChanges, data, { templateManager });
}

// src/service/tools/search-graph-inspector/local-search.ts
function convertHighlightToText(highlight) {
  if (!highlight || !highlight.text) {
    return "";
  }
  if (!highlight.highlights || highlight.highlights.length === 0) {
    return highlight.text;
  }
  const sortedHighlights = [...highlight.highlights].sort((a, b) => b.start - a.start);
  let result = highlight.text;
  for (const span of sortedHighlights) {
    const start = span.start;
    const end = span.end;
    result = result.slice(0, end) + "**" + result.slice(end);
    result = result.slice(0, start) + "**" + result.slice(start);
  }
  return result;
}
function slimSearchResults(items) {
  return items.map((item) => {
    const {
      content,
      highlight,
      ...rest
    } = item;
    return {
      ...rest,
      highlightedText: convertHighlightToText(highlight)
    };
  });
}
async function getSearchResultItemFieldGetter(items, filters, sorter) {
  const paths = items.map((item) => item.path);
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const pathToMetaMap = await indexedDocumentRepo.getByPaths(paths);
  let tagsTripleByPath = /* @__PURE__ */ new Map();
  if (filters?.tag_category_boolean_expression) {
    const docIds = Array.from(pathToMetaMap.values()).map((meta2) => meta2.id);
    const graphData = await sqliteStoreManager.getGraphRepo().getTagsByDocIds(docIds);
    const docIdToData = graphData.idMapToTags;
    for (const [path4, meta2] of pathToMetaMap) {
      const data = docIdToData.get(meta2.id);
      if (data) {
        tagsTripleByPath.set(path4, data);
      }
    }
  }
  return (item) => ({
    getPath: () => item.path,
    getModified: () => {
      const meta2 = pathToMetaMap.get(item.path);
      return meta2?.mtime ? new Date(meta2.mtime) : new Date(item.lastModified);
    },
    getCreated: () => {
      const meta2 = pathToMetaMap.get(item.path);
      const createTime = meta2?.ctime ?? meta2?.mtime;
      return createTime ? new Date(createTime) : void 0;
    },
    getTopicTags: () => tagsTripleByPath.get(item.path)?.topicTags ?? [],
    getFunctionalTagEntries: () => tagsTripleByPath.get(item.path)?.functionalTagEntries ?? [],
    getFunctionalTags: () => tagsTripleByPath.get(item.path)?.functionalTagEntries.map((e) => e.id) ?? [],
    getKeywordTags: () => tagsTripleByPath.get(item.path)?.keywordTags ?? [],
    getTags: () => {
      const t = tagsTripleByPath.get(item.path);
      return [
        ...t?.topicTags ?? [],
        ...t?.keywordTags ?? [],
        ...t?.timeTags ?? [],
        ...t?.geoTags ?? [],
        ...t?.personTags ?? []
      ];
    },
    getCategory: () => tagsTripleByPath.get(item.path)?.functionalTagEntries?.[0]?.id,
    getResultRank: () => item.finalScore || item.score || 0,
    getTotalLinksCount: () => 0,
    // Not available for search results
    getInCominglinksCount: () => 0,
    getOutgoingCount: () => 0
  });
}
async function localSearch(params, templateManager) {
  const { query: query2, searchMode, scopeMode, scopeValue, limit, response_format, filters, sorter } = params;
  const { items: rawItems, duration } = await AppContext.getInstance().searchClient.search({
    text: query2,
    searchMode,
    scopeMode,
    scopeValue,
    topK: limit,
    indexTenant: "vault"
  });
  const itemFieldGetter = await getSearchResultItemFieldGetter(rawItems, filters, sorter);
  const filteredItems = applyFiltersAndSorters(rawItems, filters, sorter, limit, itemFieldGetter);
  const slimResults = slimSearchResults(filteredItems);
  const data = {
    query: query2,
    results: slimResults,
    searchTime: duration
  };
  return buildResponse(response_format, ToolTemplateId.LocalSearch, data, { templateManager });
}

// src/service/tools/search-graph-inspector.ts
function makeTool(desc, schema, mode, exec, tm, opts) {
  return safeAgentTool({
    description: desc,
    inputSchema: schema,
    execute: (p) => exec({
      ...p,
      mode,
      ...opts?.forceFormat ? { response_format: opts.forceFormat } : {}
    }, tm)
  });
}
function inspectNoteContextTool(tm, opts) {
  return makeTool(
    `Single-note deep dive \u2014 tags, functional categories, in/out links, semantic neighbors.

When to use:
- After local_search finds a candidate, to fully understand one note before including it as evidence

Avoid when:
- You need to inspect multiple notes in bulk \u2014 call graph_traversal from a common anchor instead`,
    inspectNoteContextInputSchema,
    "inspect_note_context",
    inspectNoteContext,
    tm,
    opts
  );
}
function graphTraversalTool(tm, opts) {
  return makeTool(
    `BFS from a start note across N hops of physical + optional semantic links.

When to use:
- Understanding a note's knowledge neighborhood; 1-2 hops for direct cluster, 3 hops only when results are too sparse

Avoid when:
- You want the shortest path between two notes \u2014 use find_path`,
    graphTraversalInputSchema,
    "graph_traversal",
    graphTraversal,
    tm,
    opts
  );
}
function findPathTool(tm) {
  return makeTool(
    `Discover connection paths between two known notes using one of three strategies (reliable/fastTrack/brainstorm).

When to use:
- "How are note A and note B related?" \u2014 directional bridge finding

Avoid when:
- You don't know both endpoints \u2014 use graph_traversal for open-ended exploration`,
    findPathInputSchema,
    "find_path",
    findPath,
    tm
  );
}
function findKeyNodesTool(tm) {
  return makeTool(
    `Vault-wide influential note discovery using RRF on out-degree, in-degree, and optional semantic filter. Node types: hub (many outgoing), authority (many incoming), bridge (cross-category), balanced.

When to use:
- Orientation at the start of recon when you need to find the most important notes in a topic area

Avoid when:
- You already have a starting note \u2014 start with inspect_note_context or graph_traversal instead`,
    findKeyNodesInputSchema,
    "find_key_nodes",
    findKeyNodes,
    tm
  );
}
function findOrphansTool(tm) {
  return makeTool(
    `Discover disconnected notes (no physical links) with semantic revival suggestions. revival_suggestion field: nearest semantically similar non-orphan note \u2014 agent can propose linking it.

When to use:
- Knowledge base maintenance and gap discovery, not search tasks`,
    findOrphansInputSchema,
    "find_orphans",
    findOrphanNotes,
    tm
  );
}
function searchByDimensionsTool(tm) {
  return makeTool(
    `Boolean-expression filter over tag/functional dimensions (e.g. tag:javascript AND functional:programming). Rules: only tag:value and functional:value prefixes; values must be single words (no spaces, no special characters). Error output: when no results found, returns diagnosis with unknown_tags and known_tags \u2014 use these to self-correct.

Avoid when:
- Searching by content keywords \u2014 use local_search_whole_vault`,
    searchByDimensionsInputSchema,
    "search_by_dimensions",
    searchByDimensions,
    tm
  );
}
function exploreFolderTool(tm, opts) {
  return makeTool(
    `Vault folder structure inspection with per-folder item caps and extension summaries.

When to use:
- After grep_file_tree finds a folder anchor, to see its contents and structure; max_depth: 1 for quick browse, 2 standard, 3 for deep structure mapping

Avoid when:
- You just need to check if a path exists \u2014 use grep_file_tree`,
    exploreFolderInputSchema,
    "explore_folder",
    exploreFolder,
    tm,
    opts
  );
}
function grepFileTreeTool() {
  return safeAgentTool({
    description: `Pattern-match against all vault file paths (regex or substring). Returns paths only.

When to use:
- First step to find anchor paths or folder names before deeper exploration; fastest path-discovery available

Avoid when:
- You need file content or structure \u2014 use explore_folder after finding anchor paths`,
    inputSchema: grepFileTreeInputSchema,
    execute: (params) => grepFileTree(params)
  });
}
function recentChangesWholeVaultTool(tm) {
  return makeTool(
    `Recently modified notes, sorted by mtime.

When to use:
- Establishing user's current focus at the start of recon; gives temporal context before running targeted searches

Avoid when:
- You need precise search results \u2014 this is orientation, not discovery`,
    recentChangesWholeVaultInputSchema,
    "recent_changes_whole_vault",
    getRecentChanges,
    tm
  );
}
function localSearchWholeVaultTool(tm) {
  return safeAgentTool({
    description: `Full-text, vector, or hybrid search across vault content.

When to use:
- Finding notes by keyword or concept; use fulltext for exact terms, vector for semantic concepts, hybrid for best of both

Avoid when:
- You already know the tag/category structure \u2014 use search_by_dimensions instead`,
    inputSchema: localSearchWholeVaultInputSchema,
    execute: async (params) => {
      const rawFolder = params.folder_path;
      const folderPath = rawFolder != null && String(rawFolder).trim() !== "" ? String(rawFolder).trim().replace(/\/+$/, "") : void 0;
      return localSearch({
        ...params,
        mode: "local_search_whole_vault",
        scopeValue: { currentFilePath: params.current_file_path, folderPath, limitIdsSet: params.limit_ids_set }
      }, tm);
    }
  });
}

// src/app/context/test-tools.ts
init_types();
init_types();

// src/service/agents/intuition-helper/intuition.memory.ts
function normKey(s) {
  return s.trim().toLowerCase();
}
function mergeStringLists(prev, next, max) {
  return [...new Set([...prev, ...next].map((s) => s.trim()).filter(Boolean))].slice(0, max);
}
function mergePartitions(prev, next) {
  const by = /* @__PURE__ */ new Map();
  for (const p of prev) {
    by.set(normKey(p.label), { ...p });
  }
  for (const p of next) {
    const k = normKey(p.label);
    const existing = by.get(k);
    const paths = mergeStringLists(existing?.entryPaths ?? [], p.entryPaths ?? [], 2);
    if (!existing || p.purpose.length >= (existing.purpose?.length ?? 0)) {
      by.set(k, { ...p, label: p.label.trim(), entryPaths: paths });
    } else {
      by.set(k, { ...existing, entryPaths: paths });
    }
  }
  return [...by.values()].slice(0, 6);
}
function mergeEntities(prev, next) {
  const by = /* @__PURE__ */ new Map();
  for (const e of prev) {
    by.set(normKey(e.name), { ...e });
  }
  for (const e of next) {
    const k = normKey(e.name);
    const existing = by.get(k);
    if (!existing || e.description.length >= existing.description.length) {
      const w = e.whyItMatters?.trim();
      by.set(k, {
        ...e,
        name: e.name.trim(),
        whyItMatters: w || existing?.whyItMatters?.trim() || ""
      });
    }
  }
  return [...by.values()].slice(0, 8);
}
function mergeTopology(prev, next) {
  const key = (t) => `${normKey(t.from)}\0${normKey(t.to)}\0${normKey(t.relation)}`;
  const by = /* @__PURE__ */ new Map();
  for (const t of prev) {
    by.set(key(t), { ...t });
  }
  for (const t of next) {
    const k = key(t);
    const existing = by.get(k);
    if (!existing || t.relation.length >= existing.relation.length) {
      by.set(k, { ...t });
    }
  }
  return [...by.values()].slice(0, 8);
}
function mergeEntryPoints(prev, next) {
  const by = /* @__PURE__ */ new Map();
  for (const e of prev) {
    by.set(normKey(e.intent), { ...e });
  }
  for (const e of next) {
    const k = normKey(e.intent);
    const existing = by.get(k);
    const startPaths = mergeStringLists(existing?.startPaths ?? [], e.startPaths ?? [], 2);
    const whatYouWillFind = e.whatYouWillFind.trim();
    if (!existing || whatYouWillFind.length >= (existing.whatYouWillFind?.length ?? 0)) {
      by.set(k, {
        intent: e.intent.trim(),
        startPaths,
        whatYouWillFind
      });
    } else {
      by.set(k, { ...existing, startPaths });
    }
  }
  return [...by.values()].slice(0, 24);
}
function buildInitialIntuitionMemory() {
  return {
    partitions: [],
    coreEntities: [],
    topology: [],
    evolution: "",
    entryPoints: [],
    openQuestions: []
  };
}
function mergeIntuitionSubmitIntoMemory(mem, submit) {
  const theme = submit.theme?.trim() ? submit.theme.trim() : mem.theme;
  const evolution = submit.evolution.trim().length >= mem.evolution.trim().length ? submit.evolution.trim() : mem.evolution;
  const openQuestions = submit.openQuestions?.length ? [.../* @__PURE__ */ new Set([...mem.openQuestions, ...submit.openQuestions.map((s) => s.trim())])].filter(Boolean) : mem.openQuestions;
  return {
    theme,
    partitions: mergePartitions(mem.partitions, submit.partitions),
    coreEntities: mergeEntities(mem.coreEntities, submit.coreEntities),
    topology: mergeTopology(mem.topology, submit.topology),
    evolution: evolution || mem.evolution,
    entryPoints: mergeEntryPoints(mem.entryPoints, submit.entryPoints),
    openQuestions: openQuestions.slice(0, 6)
  };
}

// src/service/agents/intuition-helper/intuition.render.ts
var JSON_VERSION = "2026.05";
function joinPaths(paths) {
  return paths.filter(Boolean).join(" \xB7 ");
}
function buildSkeletonTemplateData(memory, meta2) {
  const vaultName = meta2.vaultName.trim() || "Vault";
  const themeLine = memory.theme?.trim() || "No strong single-theme signal; infer from partitions, entry points, and entities.";
  const evolutionLine = memory.evolution.trim() || "Static library or no clear temporal signal detected.";
  return {
    vaultName,
    dateLabel: meta2.dateLabel,
    themeLine,
    hasPartitions: memory.partitions.length > 0,
    partitions: memory.partitions.map((p) => ({
      label: p.label,
      purpose: p.purpose,
      entryPaths: p.entryPaths ?? [],
      entryPathsLine: joinPaths(p.entryPaths ?? []),
      hasEntryPaths: (p.entryPaths?.length ?? 0) > 0
    })),
    hasCoreEntities: memory.coreEntities.length > 0,
    coreEntities: memory.coreEntities.map((e) => ({
      name: e.name,
      description: e.description,
      location: e.location,
      whyItMatters: e.whyItMatters?.trim() ?? "",
      hasWhyItMatters: Boolean(e.whyItMatters?.trim())
    })),
    hasTopology: memory.topology.length > 0,
    topology: memory.topology.map((t) => ({
      from: t.from,
      to: t.to,
      relation: t.relation
    })),
    evolutionLine,
    hasEntryPoints: memory.entryPoints.length > 0,
    entryPoints: memory.entryPoints.map((e) => ({
      intent: e.intent,
      startPaths: e.startPaths ?? [],
      startPathsLine: joinPaths(e.startPaths ?? []),
      whatYouWillFind: e.whatYouWillFind
    })),
    hasOpenQuestions: memory.openQuestions.length > 0,
    openQuestions: memory.openQuestions
  };
}
async function renderIntuitionSkeletonMarkdown(tm, memory, meta2) {
  const data = buildSkeletonTemplateData(memory, meta2);
  return (await tm.render(IndexingTemplateId.KnowledgeIntuitionSkeletonMarkdown, data)).trim();
}
function renderIntuitionSkeletonJson(memory, meta2) {
  return {
    version: JSON_VERSION,
    generatedAt: meta2.dateLabel,
    vaultLabel: meta2.vaultName,
    theme: memory.theme ?? "",
    partitions: memory.partitions.map((p) => ({
      label: p.label,
      purpose: p.purpose,
      entry_paths: p.entryPaths ?? []
    })),
    core_entities: memory.coreEntities.map((e) => ({
      name: e.name,
      description: e.description,
      location: e.location,
      why_it_matters: e.whyItMatters ?? ""
    })),
    topology: memory.topology.map((t) => ({
      from: t.from,
      to: t.to,
      relation: t.relation
    })),
    evolution: memory.evolution,
    entry_points: memory.entryPoints.map((e) => ({
      intent: e.intent,
      start_paths: e.startPaths,
      what_you_will_find: e.whatYouWillFind
    }))
  };
}

// src/service/agents/intuition-helper/intuition.recon.ts
init_types();

// src/core/utils/Stopwatch.ts
var Stopwatch = class {
  constructor(name = "Stopwatch") {
    this.segments = [];
    this.currentSegment = null;
    this.name = name;
  }
  /**
   * Start a new timing segment with the given label.
   * If a segment is already running, it will be stopped first.
   */
  start(label) {
    if (this.currentSegment) {
      this.stop();
    }
    const startTime = Date.now();
    this.currentSegment = { label, startTime, details: [] };
  }
  /**
   * add to current segment.
   */
  addSegmentDetail(label, duration) {
    if (!this.currentSegment) {
      return;
    }
    this.currentSegment.details?.push({ label, duration });
  }
  /**
   * Stop the current timing segment.
   * If no segment is running, this is a no-op.
   */
  stop() {
    if (!this.currentSegment) {
      return;
    }
    const endTime = Date.now();
    const duration = endTime - this.currentSegment.startTime;
    this.segments.push({
      label: this.currentSegment.label,
      startTime: this.currentSegment.startTime,
      endTime,
      duration,
      details: this.currentSegment.details
    });
    this.currentSegment = null;
  }
  getLastDuration() {
    if (this.segments.length === 0) {
      return 0;
    }
    return this.segments[this.segments.length - 1].duration ?? 0;
  }
  /**
   * Get all completed segments with their timing information.
   */
  getSegments() {
    return this.segments.map((s) => ({
      label: s.label,
      durationMs: s.duration ?? 0,
      details: s.details
    }));
  }
  /**
   * Get the current running segment label, if any.
   */
  getCurrentSegmentLabel() {
    return this.currentSegment?.label ?? null;
  }
  /**
   * Get the total elapsed time from the first segment start to now (or last segment end).
   */
  getTotalElapsed() {
    if (this.segments.length === 0) {
      return 0;
    }
    const firstStart = this.segments[0].startTime;
    const lastEnd = this.currentSegment ? Date.now() : this.segments[this.segments.length - 1].endTime ?? Date.now();
    return lastEnd - firstStart;
  }
  /**
   * Print all timing segments to console.
   * Format: [Stopwatch: name] label: duration ms (total: X ms)
   */
  print(debug = true) {
    const total = this.getTotalElapsed();
    const lines = [];
    lines.push(`[${this.name}] Total: ${total.toFixed(2)} ms`);
    for (const segment of this.segments) {
      const duration = segment.duration ?? 0;
      lines.push(`  - ${segment.label}: ${duration.toFixed(2)} ms`);
      if (segment.details) {
        for (const detail of segment.details) {
          lines.push(`    - ${detail.label}: ${detail.duration.toFixed(2)} ms`);
        }
      }
    }
    if (this.currentSegment) {
      const runningDuration = Date.now() - this.currentSegment.startTime;
      lines.push(`  - ${this.currentSegment.label}: ${runningDuration.toFixed(2)} ms (running)`);
      if (this.currentSegment.details) {
        for (const detail of this.currentSegment.details) {
          lines.push(`    - ${detail.label}: ${detail.duration.toFixed(2)} ms`);
        }
      }
    }
    if (debug) {
      console.debug(lines.join("\n"));
    } else {
      console.log(lines.join("\n"));
    }
  }
  /**
   * Get a formatted string with all timing information.
   */
  toString() {
    const total = this.getTotalElapsed();
    const lines = [];
    lines.push(`[${this.name}] Total: ${total.toFixed(2)} ms`);
    for (const segment of this.segments) {
      const duration = segment.duration ?? 0;
      lines.push(`  - ${segment.label}: ${duration.toFixed(2)} ms`);
    }
    if (this.currentSegment) {
      const runningDuration = Date.now() - this.currentSegment.startTime;
      lines.push(`  - ${this.currentSegment.label}: ${runningDuration.toFixed(2)} ms (running)`);
    }
    return lines.join("\n");
  }
  /**
   * Reset the stopwatch, clearing all segments.
   */
  reset() {
    this.segments = [];
    this.currentSegment = null;
  }
};

// src/core/profiles/types.ts
var DEFAULT_SDK_SETTINGS = {
  cliPathOverride: null,
  subprocessPoolSize: 1,
  warmupOnLoad: true
};

// src/core/profiles/ProfileRegistry.ts
var ProfileRegistry = class _ProfileRegistry {
  constructor() {
    this.profiles = [];
    this.activeAgentConfig = null;
    this.activeAgentFastConfig = null;
    this.activeChatConfig = null;
    this.activeCopilotConfig = null;
    this.activeEmbeddingConfig = null;
    this.activeWebSearchConfig = null;
    this.sdkSettings = { ...DEFAULT_SDK_SETTINGS };
    this.persistFn = null;
  }
  static {
    this.instance = null;
  }
  static getInstance() {
    if (!_ProfileRegistry.instance) {
      _ProfileRegistry.instance = new _ProfileRegistry();
    }
    return _ProfileRegistry.instance;
  }
  /** Reset singleton (for testing only). */
  static resetInstance() {
    _ProfileRegistry.instance = null;
  }
  /**
   * Initialize the registry from persisted settings.
   * Must be called once during plugin bootstrap.
   *
   * Accepts both the new format (activeAgentConfig) and the legacy format
   * (activeAgentProfileId) for backward compatibility with existing settings files.
   */
  load(settings, persistFn) {
    this.profiles = [...settings.profiles];
    this.activeAgentConfig = settings.activeAgentConfig ?? this.migrateOldId(settings.activeAgentProfileId);
    this.activeAgentFastConfig = settings.activeAgentFastConfig ?? null;
    this.activeChatConfig = settings.activeChatConfig ?? null;
    this.activeCopilotConfig = settings.activeCopilotConfig ?? null;
    this.activeEmbeddingConfig = settings.activeEmbeddingConfig ?? this.migrateOldId(settings.activeEmbeddingProfileId);
    this.activeWebSearchConfig = settings.activeWebSearchConfig ?? this.migrateOldId(settings.activeWebSearchProfileId);
    this.sdkSettings = { ...DEFAULT_SDK_SETTINGS, ...settings.sdkSettings };
    this.persistFn = persistFn;
  }
  migrateOldId(id) {
    if (!id) return null;
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) return null;
    return { profileId: id, modelId: profile.primaryModel };
  }
  // --------------- Selectors ---------------
  getAllProfiles() {
    return [...this.profiles];
  }
  getActiveAgentProfile() {
    if (!this.activeAgentConfig) {
      return this.profiles.length > 0 ? this.profiles[0] : null;
    }
    return this.profiles.find((p) => p.id === this.activeAgentConfig.profileId) ?? null;
  }
  getActiveAgentConfig() {
    if (!this.activeAgentConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeAgentConfig.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeAgentConfig.modelId };
  }
  getActiveAgentFastConfig() {
    if (!this.activeAgentFastConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeAgentFastConfig.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeAgentFastConfig.modelId };
  }
  getActiveChatProfile() {
    if (this.activeChatConfig) {
      return this.profiles.find((p) => p.id === this.activeChatConfig.profileId) ?? null;
    }
    return this.getActiveAgentProfile();
  }
  getActiveChatConfig() {
    if (this.activeChatConfig) {
      const profile = this.profiles.find((p) => p.id === this.activeChatConfig.profileId);
      if (profile) return { profile, modelId: this.activeChatConfig.modelId };
    }
    return this.getActiveAgentConfig();
  }
  /**
   * Returns the appropriate config for a given conversation mode.
   * 'agent' uses the Agent config; all others use the Chat config.
   */
  getConfigForMode(mode) {
    if (mode === "agent") return this.getActiveAgentConfig();
    return this.getActiveChatConfig();
  }
  getActiveCopilotConfig() {
    if (!this.activeCopilotConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeCopilotConfig.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeCopilotConfig.modelId };
  }
  getActiveEmbeddingProfile() {
    if (!this.activeEmbeddingConfig) return null;
    return this.profiles.find((p) => p.id === this.activeEmbeddingConfig.profileId) ?? null;
  }
  getActiveEmbeddingConfig() {
    if (!this.activeEmbeddingConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeEmbeddingConfig.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeEmbeddingConfig.modelId };
  }
  getActiveWebSearchProfile() {
    if (!this.activeWebSearchConfig) return null;
    return this.profiles.find((p) => p.id === this.activeWebSearchConfig.profileId) ?? null;
  }
  getActiveWebSearchConfig() {
    if (!this.activeWebSearchConfig) return null;
    const profile = this.profiles.find((p) => p.id === this.activeWebSearchConfig.profileId);
    if (!profile) return null;
    return { profile, modelId: this.activeWebSearchConfig.modelId };
  }
  getSdkSettings() {
    return { ...this.sdkSettings };
  }
  getProfileById(id) {
    return this.profiles.find((p) => p.id === id) ?? null;
  }
  // --------------- Mutations ---------------
  addProfile(profile) {
    if (this.profiles.some((p) => p.id === profile.id)) {
      throw new Error(`Profile with id "${profile.id}" already exists`);
    }
    this.profiles.push({ ...profile });
    this.persist();
  }
  updateProfile(id, updates) {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Profile with id "${id}" not found`);
    }
    this.profiles[idx] = { ...this.profiles[idx], ...updates, id };
    this.persist();
  }
  deleteProfile(id) {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`Profile with id "${id}" not found`);
    }
    this.profiles.splice(idx, 1);
    if (this.activeAgentConfig?.profileId === id) this.activeAgentConfig = null;
    if (this.activeAgentFastConfig?.profileId === id) this.activeAgentFastConfig = null;
    if (this.activeChatConfig?.profileId === id) this.activeChatConfig = null;
    if (this.activeCopilotConfig?.profileId === id) this.activeCopilotConfig = null;
    if (this.activeEmbeddingConfig?.profileId === id) this.activeEmbeddingConfig = null;
    if (this.activeWebSearchConfig?.profileId === id) this.activeWebSearchConfig = null;
    this.persist();
  }
  toggleEnabled(id) {
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Profile with id "${id}" not found`);
    this.profiles[idx] = { ...this.profiles[idx], enabled: !this.profiles[idx].enabled };
    if (!this.profiles[idx].enabled) {
      if (this.activeAgentConfig?.profileId === id) this.activeAgentConfig = null;
      if (this.activeAgentFastConfig?.profileId === id) this.activeAgentFastConfig = null;
      if (this.activeChatConfig?.profileId === id) this.activeChatConfig = null;
      if (this.activeCopilotConfig?.profileId === id) this.activeCopilotConfig = null;
      if (this.activeEmbeddingConfig?.profileId === id) this.activeEmbeddingConfig = null;
      if (this.activeWebSearchConfig?.profileId === id) this.activeWebSearchConfig = null;
    }
    this.persist();
  }
  setActiveAgentProfile(id) {
    if (id === null) {
      this.activeAgentConfig = null;
      this.persist();
      return;
    }
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`Profile with id "${id}" not found`);
    this.activeAgentConfig = { profileId: id, modelId: profile.primaryModel };
    this.persist();
  }
  setActiveAgentConfig(config) {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeAgentConfig = config;
    this.persist();
  }
  setActiveAgentFastConfig(config) {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeAgentFastConfig = config;
    this.persist();
  }
  setActiveChatProfile(id) {
    if (id === null) {
      this.activeChatConfig = null;
      this.persist();
      return;
    }
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`Profile with id "${id}" not found`);
    this.activeChatConfig = { profileId: id, modelId: profile.primaryModel };
    this.persist();
  }
  setActiveChatConfig(config) {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeChatConfig = config;
    this.persist();
  }
  setActiveCopilotConfig(config) {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeCopilotConfig = config;
    this.persist();
  }
  setActiveEmbeddingProfile(id) {
    if (id === null) {
      this.activeEmbeddingConfig = null;
      this.persist();
      return;
    }
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`Profile with id "${id}" not found`);
    this.activeEmbeddingConfig = { profileId: id, modelId: profile.embeddingModel ?? profile.primaryModel };
    this.persist();
  }
  setActiveEmbeddingConfig(config) {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeEmbeddingConfig = config;
    this.persist();
  }
  setActiveWebSearchProfile(id) {
    if (id === null) {
      this.activeWebSearchConfig = null;
      this.persist();
      return;
    }
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) throw new Error(`Profile with id "${id}" not found`);
    this.activeWebSearchConfig = { profileId: id, modelId: profile.primaryModel };
    this.persist();
  }
  setActiveWebSearchConfig(config) {
    if (config && !this.profiles.some((p) => p.id === config.profileId)) {
      throw new Error(`Profile with id "${config.profileId}" not found`);
    }
    this.activeWebSearchConfig = config;
    this.persist();
  }
  // --------------- Internal ---------------
  persist() {
    if (!this.persistFn) return;
    const snapshot = {
      profiles: this.profiles.map((p) => ({ ...p })),
      activeAgentConfig: this.activeAgentConfig,
      activeAgentFastConfig: this.activeAgentFastConfig,
      activeChatConfig: this.activeChatConfig,
      activeCopilotConfig: this.activeCopilotConfig,
      activeEmbeddingConfig: this.activeEmbeddingConfig,
      activeWebSearchConfig: this.activeWebSearchConfig,
      sdkSettings: { ...this.sdkSettings }
    };
    void this.persistFn(snapshot);
  }
};

// src/service/agents/core/sdkAgentPool.ts
var import_fs = require("fs");
var import_path2 = require("path");
var import_claude_agent_sdk = require("@anthropic-ai/claude-agent-sdk");

// src/core/profiles/materialize.ts
function toAgentSdkEnv(profile, agentModelId, agentFastModelId) {
  if (!profile.apiKey) {
    throw new Error("Profile is missing API key");
  }
  const baseUrl = profile.baseUrl || (profile.kind === "openrouter" ? "https://openrouter.ai/api/v1" : "");
  const env = {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_DEFAULT_OPUS_MODEL: agentModelId,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: agentFastModelId,
    ANTHROPIC_DEFAULT_SONNET_MODEL: agentModelId
  };
  if (profile.kind === "openrouter") {
    env.ANTHROPIC_API_KEY = "";
    env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  } else {
    env.ANTHROPIC_API_KEY = profile.apiKey;
  }
  if (Object.keys(profile.customHeaders).length > 0) {
    env.ANTHROPIC_CUSTOM_HEADERS = JSON.stringify(profile.customHeaders);
  }
  return env;
}
function toEmbeddingConfig(profile) {
  if (!profile.embeddingEndpoint || !profile.embeddingModel) return null;
  return {
    endpoint: profile.embeddingEndpoint,
    apiKey: profile.embeddingApiKey ?? profile.apiKey ?? "",
    model: profile.embeddingModel
  };
}

// src/service/search/support/llm-cost-utils.ts
function normalizeUsageTokens(usage) {
  if (!usage) {
    return { input: 0, output: 0, total: 0 };
  }
  const u = usage;
  const input = Number(u.inputTokens ?? u.promptTokens ?? 0) || 0;
  const output = Number(u.outputTokens ?? u.completionTokens ?? 0) || 0;
  const total = Number(u.totalTokens ?? input + output) || 0;
  return { input, output, total };
}
function computeUsdFromUsage(usage, modelInfo) {
  if (!modelInfo) return 0;
  const { input, output } = normalizeUsageTokens(usage);
  const inPrice = parseFloat(String(modelInfo.costInput ?? "0")) || 0;
  const outPrice = parseFloat(String(modelInfo.costOutput ?? "0")) || 0;
  return input / 1e6 * inPrice + output / 1e6 * outPrice;
}

// data/model-catalog.json
var model_catalog_default = {
  providers: [
    {
      id: "openai",
      name: "OpenAI",
      defaultBaseUrl: "https://api.openai.com/v1",
      icon: "openai",
      models: [
        {
          id: "o1",
          apiModelId: "o1-2024-12-17",
          icon: "o1",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 }
        },
        {
          id: "o1-mini",
          apiModelId: "o1-mini-2024-09-12",
          icon: "o1",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 }
        },
        {
          id: "o3-mini",
          apiModelId: "o3-mini-2025-01-31",
          icon: "o1",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 }
        },
        {
          id: "o3",
          apiModelId: "o3-2025-04-16",
          icon: "o1",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 }
        },
        {
          id: "o4-mini",
          apiModelId: "o4-mini-2025-04-16",
          icon: "o1",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 }
        },
        {
          id: "gpt-5",
          apiModelId: "gpt-5-2025-08-07",
          icon: "gpt-5",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-5-mini",
          apiModelId: "gpt-5-mini-2025-08-07",
          icon: "gpt-5",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-5-nano",
          apiModelId: "gpt-5-nano-2025-08-07",
          icon: "gpt-5",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-4.1",
          apiModelId: "gpt-4.1-2025-04-14",
          icon: "gpt-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-4.1-mini",
          apiModelId: "gpt-4.1-mini-2025-04-14",
          icon: "gpt-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-4.1-nano",
          apiModelId: "gpt-4.1-nano-2025-04-14",
          icon: "gpt-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-4o",
          apiModelId: "gpt-4o-2024-11-20",
          icon: "gpt-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-4o-mini",
          apiModelId: "gpt-4o-mini-2024-07-18",
          icon: "gpt-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-4-turbo",
          apiModelId: "gpt-4-turbo-2024-04-09",
          icon: "gpt-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-4",
          apiModelId: "gpt-4",
          icon: "gpt-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 8192 }
        },
        {
          id: "gpt-4-32k",
          apiModelId: "gpt-4-32k",
          icon: "gpt-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 32768, maxInputTokens: 32768, recommendedSummaryThreshold: 25e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 32768 }
        },
        {
          id: "gpt-4.5",
          apiModelId: "gpt-4.5-preview-2025-02-27",
          icon: "gpt-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "gpt-3.5-turbo",
          apiModelId: "gpt-3.5-turbo",
          icon: "gpt-3.5",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 16384, maxInputTokens: 16384, recommendedSummaryThreshold: 12e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 16384 }
        }
      ]
    },
    {
      id: "claude",
      name: "Anthropic",
      defaultBaseUrl: "https://api.anthropic.com/v1",
      icon: "anthropic",
      models: [
        {
          id: "claude-4-opus",
          apiModelId: "claude-4-opus-20250514",
          icon: "claude",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 }
        },
        {
          id: "claude-4-sonnet",
          apiModelId: "claude-4-sonnet-20250514",
          icon: "claude",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 }
        },
        {
          id: "claude-3-7-sonnet",
          apiModelId: "claude-3-7-sonnet-20250219",
          icon: "claude",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 }
        },
        {
          id: "claude-3-5-sonnet",
          apiModelId: "claude-3-5-sonnet-20241022",
          icon: "claude",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 }
        },
        {
          id: "claude-3-5-haiku",
          apiModelId: "claude-3-5-haiku-20241022",
          icon: "claude",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 }
        },
        {
          id: "claude-3-opus",
          apiModelId: "claude-3-opus-20240229",
          icon: "claude",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 }
        },
        {
          id: "claude-3-sonnet",
          apiModelId: "claude-3-sonnet-20240229",
          icon: "claude",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 }
        },
        {
          id: "claude-3-haiku",
          apiModelId: "claude-3-haiku-20240307",
          icon: "claude",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 }
        }
      ]
    },
    {
      id: "gemini",
      name: "Google",
      defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      icon: "google",
      models: [
        {
          id: "gemini-2.5-pro",
          apiModelId: "gemini-2.5-pro",
          icon: "gemini",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2097152, maxInputTokens: 2097152, recommendedSummaryThreshold: 16e5 },
          capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 2097152 }
        },
        {
          id: "gemini-2.5-flash",
          apiModelId: "gemini-2.5-flash",
          icon: "gemini",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 },
          capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 }
        },
        {
          id: "gemini-2.0-flash",
          apiModelId: "gemini-2.0-flash-001",
          icon: "gemini",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 },
          capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 }
        },
        {
          id: "gemini-2.0-flash-lite",
          apiModelId: "gemini-2.0-flash-lite-001",
          icon: "gemini",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 },
          capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 }
        },
        {
          id: "gemini-2.0-flash-thinking",
          apiModelId: "gemini-2.0-flash-thinking-exp-01-21",
          icon: "gemini",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 1171712, maxInputTokens: 1048576, maxOutputTokens: 65536, recommendedSummaryThreshold: 8e5 },
          capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: true, maxCtx: 1048576 }
        },
        {
          id: "gemini-1.5-pro",
          apiModelId: "gemini-1.5-pro-002",
          icon: "gemini",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 2097152, maxInputTokens: 2097152, recommendedSummaryThreshold: 16e5 },
          capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 2097152 }
        },
        {
          id: "gemini-1.5-flash",
          apiModelId: "gemini-1.5-flash-002",
          icon: "gemini",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 },
          capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 }
        },
        {
          id: "gemini-1.5-flash-8b",
          apiModelId: "gemini-1.5-flash-8b-001",
          icon: "gemini",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 },
          capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 }
        }
      ]
    },
    {
      id: "perplexity",
      name: "Perplexity",
      defaultBaseUrl: "https://api.perplexity.ai",
      icon: "perplexity",
      models: [
        {
          id: "sonar-deep-research",
          apiModelId: "sonar-deep-research",
          icon: "perplexity",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: true, maxCtx: 131072 }
        },
        {
          id: "sonar-reasoning-pro",
          apiModelId: "sonar-reasoning-pro",
          icon: "perplexity",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: true, maxCtx: 131072 }
        },
        {
          id: "sonar-reasoning",
          apiModelId: "sonar-reasoning",
          icon: "perplexity",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: true, maxCtx: 131072 }
        },
        {
          id: "sonar-pro",
          apiModelId: "sonar-pro",
          icon: "perplexity",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 204800, maxInputTokens: 204800, recommendedSummaryThreshold: 15e4 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: false, maxCtx: 204800 }
        },
        {
          id: "sonar",
          apiModelId: "sonar",
          icon: "perplexity",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: false, pdfInput: false, tools: false, webSearch: true, reasoning: false, maxCtx: 131072 }
        }
      ]
    },
    {
      id: "ollama",
      name: "Ollama",
      defaultBaseUrl: "http://localhost:11434",
      icon: "ollama",
      models: [
        {
          id: "llama3.1",
          apiModelId: "llama3.1",
          icon: "llama-3.1",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 131072, maxInputTokens: 131072, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 131072 }
        },
        {
          id: "llama3",
          apiModelId: "llama3",
          icon: "llama-3",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 8192 }
        },
        {
          id: "qwen2.5",
          apiModelId: "qwen2.5",
          icon: "qwen",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 32768, maxInputTokens: 32768, recommendedSummaryThreshold: 25e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 32768 }
        },
        {
          id: "qwen3",
          apiModelId: "qwen3",
          icon: "qwen",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 32768, maxInputTokens: 32768, recommendedSummaryThreshold: 25e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 32768 }
        },
        {
          id: "deepseek-r1",
          apiModelId: "deepseek-r1",
          icon: "deepseek",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 32768, maxInputTokens: 32768, recommendedSummaryThreshold: 25e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: true, maxCtx: 32768 }
        },
        {
          id: "mistral",
          apiModelId: "mistral",
          icon: "mistral",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 8192 }
        },
        {
          id: "mixtral",
          apiModelId: "mixtral",
          icon: "mixtral",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 32768, maxInputTokens: 32768, recommendedSummaryThreshold: 25e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 32768 }
        },
        {
          id: "gemma2",
          apiModelId: "gemma2",
          icon: "gemma",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 8192 }
        },
        {
          id: "phi3",
          apiModelId: "phi3",
          icon: "phi-3",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 4096, maxInputTokens: 4096, recommendedSummaryThreshold: 3e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 4096 }
        },
        {
          id: "codellama",
          apiModelId: "codellama",
          icon: "codellama",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 16384, maxInputTokens: 16384, recommendedSummaryThreshold: 12e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 16384 }
        },
        {
          id: "llava",
          apiModelId: "llava",
          icon: "llava",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 4096, maxInputTokens: 4096, recommendedSummaryThreshold: 3e3 },
          capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 4096 }
        },
        {
          id: "gpt-oss",
          apiModelId: "gpt-oss",
          icon: "gpt-oss",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6e3 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: true, maxCtx: 8192 }
        },
        {
          id: "gemma3",
          apiModelId: "gemma3",
          icon: "gemma",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "phi4",
          apiModelId: "phi4",
          icon: "phi-4",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "llama-3.3",
          apiModelId: "llama-3.3",
          icon: "llama-3.3",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        },
        {
          id: "mistral-small",
          apiModelId: "mistral-small",
          icon: "mistral",
          modelType: "llm",
          costInput: "0",
          costOutput: "0",
          tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 },
          capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 }
        }
      ]
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      icon: "openrouter",
      models: [
        { id: "openai/o1", apiModelId: "openai/o1", displayName: "o1", icon: "o1", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 } },
        { id: "openai/o1-mini", apiModelId: "openai/o1-mini", displayName: "o1-mini", icon: "o1", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 } },
        { id: "openai/o3-mini", apiModelId: "openai/o3-mini", displayName: "o3-mini", icon: "o1", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 } },
        { id: "openai/o3", apiModelId: "openai/o3", displayName: "o3", icon: "o1", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 } },
        { id: "openai/o4-mini", apiModelId: "openai/o4-mini", displayName: "o4-mini", icon: "o1", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: false, pdfInput: false, tools: false, webSearch: false, reasoning: true, maxCtx: 2e5 } },
        { id: "openai/gpt-5", apiModelId: "openai/gpt-5", displayName: "gpt-5", icon: "gpt-5", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-5-mini", apiModelId: "openai/gpt-5-mini", displayName: "gpt-5-mini", icon: "gpt-5", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-5-nano", apiModelId: "openai/gpt-5-nano", displayName: "gpt-5-nano", icon: "gpt-5", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-4.1", apiModelId: "openai/gpt-4.1", displayName: "gpt-4.1", icon: "gpt-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-4.1-mini", apiModelId: "openai/gpt-4.1-mini", displayName: "gpt-4.1-mini", icon: "gpt-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-4.1-nano", apiModelId: "openai/gpt-4.1-nano", displayName: "gpt-4.1-nano", icon: "gpt-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-4o", apiModelId: "openai/gpt-4o", displayName: "gpt-4o", icon: "gpt-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-4o-mini", apiModelId: "openai/gpt-4o-mini", displayName: "gpt-4o-mini", icon: "gpt-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-4-turbo", apiModelId: "openai/gpt-4-turbo", displayName: "gpt-4-turbo", icon: "gpt-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-4", apiModelId: "openai/gpt-4", displayName: "gpt-4", icon: "gpt-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 8192, maxInputTokens: 8192, recommendedSummaryThreshold: 6e3 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 8192 } },
        { id: "openai/gpt-4-32k", apiModelId: "openai/gpt-4-32k", displayName: "gpt-4-32k", icon: "gpt-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 32768, maxInputTokens: 32768, recommendedSummaryThreshold: 25e3 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 32768 } },
        { id: "openai/gpt-4.5", apiModelId: "openai/gpt-4.5", displayName: "gpt-4.5", icon: "gpt-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "openai/gpt-3.5-turbo", apiModelId: "openai/gpt-3.5-turbo", displayName: "gpt-3.5-turbo", icon: "gpt-3.5", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 16384, maxInputTokens: 16384, recommendedSummaryThreshold: 12e3 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 16384 } },
        { id: "anthropic/claude-4-opus", apiModelId: "anthropic/claude-4-opus", displayName: "claude-4-opus", icon: "claude", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 } },
        { id: "anthropic/claude-4-sonnet", apiModelId: "anthropic/claude-4-sonnet", displayName: "claude-4-sonnet", icon: "claude", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 } },
        { id: "anthropic/claude-3-7-sonnet", apiModelId: "anthropic/claude-3-7-sonnet", displayName: "claude-3-7-sonnet", icon: "claude", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 } },
        { id: "anthropic/claude-3-5-sonnet", apiModelId: "anthropic/claude-3-5-sonnet", displayName: "claude-3-5-sonnet", icon: "claude", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 } },
        { id: "anthropic/claude-3-5-haiku", apiModelId: "anthropic/claude-3-5-haiku", displayName: "claude-3-5-haiku", icon: "claude", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 } },
        { id: "anthropic/claude-3-opus", apiModelId: "anthropic/claude-3-opus", displayName: "claude-3-opus", icon: "claude", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 } },
        { id: "anthropic/claude-3-sonnet", apiModelId: "anthropic/claude-3-sonnet", displayName: "claude-3-sonnet", icon: "claude", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 } },
        { id: "anthropic/claude-3-haiku", apiModelId: "anthropic/claude-3-haiku", displayName: "claude-3-haiku", icon: "claude", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2e5, maxInputTokens: 2e5, recommendedSummaryThreshold: 15e4 }, capabilities: { vision: true, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 2e5 } },
        { id: "google/gemini-2.5-pro", apiModelId: "google/gemini-2.5-pro", displayName: "gemini-2.5-pro", icon: "gemini", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2097152, maxInputTokens: 2097152, recommendedSummaryThreshold: 16e5 }, capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 2097152 } },
        { id: "google/gemini-2.5-flash", apiModelId: "google/gemini-2.5-flash", displayName: "gemini-2.5-flash", icon: "gemini", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 }, capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 } },
        { id: "google/gemini-2.0-flash", apiModelId: "google/gemini-2.0-flash", displayName: "gemini-2.0-flash", icon: "gemini", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 }, capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 } },
        { id: "google/gemini-2.0-flash-lite", apiModelId: "google/gemini-2.0-flash-lite", displayName: "gemini-2.0-flash-lite", icon: "gemini", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 }, capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 } },
        { id: "google/gemini-2.0-flash-thinking", apiModelId: "google/gemini-2.0-flash-thinking", displayName: "gemini-2.0-flash-thinking", icon: "gemini", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 }, capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: true, maxCtx: 1048576 } },
        { id: "google/gemini-1.5-pro", apiModelId: "google/gemini-1.5-pro", displayName: "gemini-1.5-pro", icon: "gemini", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 2097152, maxInputTokens: 2097152, recommendedSummaryThreshold: 16e5 }, capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 2097152 } },
        { id: "google/gemini-1.5-flash", apiModelId: "google/gemini-1.5-flash", displayName: "gemini-1.5-flash", icon: "gemini", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 }, capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 } },
        { id: "google/gemini-1.5-flash-8b", apiModelId: "google/gemini-1.5-flash-8b", displayName: "gemini-1.5-flash-8b", icon: "gemini", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 1048576, maxInputTokens: 1048576, recommendedSummaryThreshold: 8e5 }, capabilities: { vision: true, pdfInput: true, tools: true, webSearch: false, reasoning: false, maxCtx: 1048576 } },
        { id: "deepseek/deepseek-r1", apiModelId: "deepseek/deepseek-r1", icon: "deepseek", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: true, maxCtx: 128e3 } },
        { id: "deepseek/deepseek-r1-0528", apiModelId: "deepseek/deepseek-r1-0528", icon: "deepseek", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: true, maxCtx: 128e3 } },
        { id: "deepseek/deepseek-chat-v3", apiModelId: "deepseek/deepseek-chat-v3", icon: "deepseek", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "meta-llama/llama-4-maverick", apiModelId: "meta-llama/llama-4-maverick", icon: "llama-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 1e6, maxInputTokens: 1e6, recommendedSummaryThreshold: 8e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 1e6 } },
        { id: "meta-llama/llama-4-scout", apiModelId: "meta-llama/llama-4-scout", icon: "llama-4", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 512e3, maxInputTokens: 512e3, recommendedSummaryThreshold: 4e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 512e3 } },
        { id: "meta-llama/llama-3.3-70b", apiModelId: "meta-llama/llama-3.3-70b", icon: "llama-3.3", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "meta-llama/llama-3.1-405b", apiModelId: "meta-llama/llama-3.1-405b", icon: "llama-3.1", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "mistralai/mistral-large-2", apiModelId: "mistralai/mistral-large-2", icon: "mistral", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "mistralai/mistral-medium-3", apiModelId: "mistralai/mistral-medium-3", icon: "mistral", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "mistralai/codestral", apiModelId: "mistralai/codestral", icon: "mistral", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 32e3, maxInputTokens: 32e3, recommendedSummaryThreshold: 25e3 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 32e3 } },
        { id: "mistralai/ministral-8b", apiModelId: "mistralai/ministral-8b", icon: "mistral", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "x-ai/grok-3", apiModelId: "x-ai/grok-3", icon: "grok", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: true, maxCtx: 128e3 } },
        { id: "x-ai/grok-3-mini", apiModelId: "x-ai/grok-3-mini", icon: "grok", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: true, maxCtx: 128e3 } },
        { id: "x-ai/grok-2", apiModelId: "x-ai/grok-2", icon: "grok", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "cohere/command-a", apiModelId: "cohere/command-a", icon: "cohere", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 256e3, maxInputTokens: 256e3, recommendedSummaryThreshold: 2e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 256e3 } },
        { id: "cohere/command-r-plus", apiModelId: "cohere/command-r-plus", icon: "cohere", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: true, reasoning: false, maxCtx: 128e3 } },
        { id: "cohere/command-r", apiModelId: "cohere/command-r", icon: "cohere", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: true, reasoning: false, maxCtx: 128e3 } },
        { id: "qwen/qwen3-235b", apiModelId: "qwen/qwen3-235b", icon: "qwen", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: true, maxCtx: 128e3 } },
        { id: "qwen/qwen3-30b", apiModelId: "qwen/qwen3-30b", icon: "qwen", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: true, maxCtx: 128e3 } },
        { id: "qwen/qwen-2.5-72b", apiModelId: "qwen/qwen-2.5-72b", icon: "qwen", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } },
        { id: "nvidia/llama-3.1-nemotron-70b", apiModelId: "nvidia/llama-3.1-nemotron-70b", icon: "nvidia", modelType: "llm", costInput: "0", costOutput: "0", tokenLimits: { maxTokens: 128e3, maxInputTokens: 128e3, recommendedSummaryThreshold: 1e5 }, capabilities: { vision: false, pdfInput: false, tools: true, webSearch: false, reasoning: false, maxCtx: 128e3 } }
      ]
    }
  ]
};

// src/core/providers/model-registry.ts
init_types();
var DEFAULT_MODEL_TYPE = "llm" /* LLM */;
function normalizeModelKey(modelId) {
  return modelId.trim().toLowerCase();
}
function normalizeProviderId(providerId) {
  return providerId.trim().toLowerCase();
}
function normalizeModelForFuzzyMatch(modelId) {
  const raw = normalizeModelKey(modelId);
  const withoutTag = raw.replace(/:[^/]+$/, "");
  if (withoutTag.includes("/")) {
    return withoutTag.split("/").slice(-1)[0] ?? withoutTag;
  }
  return withoutTag;
}
function resolveModelType(modelType) {
  if (typeof modelType === "string") {
    for (const value of Object.values(ModelType)) {
      if (value === modelType) {
        return value;
      }
    }
  }
  return DEFAULT_MODEL_TYPE;
}
function cloneCapabilities(capabilities) {
  if (!capabilities) return void 0;
  return { ...capabilities };
}
function cloneTokenLimits(tokenLimits) {
  if (!tokenLimits) return void 0;
  return { ...tokenLimits };
}
function toModelMetadata(entry) {
  return {
    id: entry.id,
    displayName: entry.displayName ?? entry.id,
    icon: entry.icon,
    modelType: entry.modelType,
    releaseTimestamp: entry.releaseTimestamp,
    costInput: entry.costInput,
    costOutput: entry.costOutput,
    capabilities: cloneCapabilities(entry.capabilities),
    tokenLimits: cloneTokenLimits(entry.tokenLimits)
  };
}
var ModelRegistry = class _ModelRegistry {
  constructor() {
    this.providers = /* @__PURE__ */ new Map();
    const rawCatalog = model_catalog_default;
    for (const provider of rawCatalog.providers ?? []) {
      const providerId = normalizeProviderId(provider.id);
      const models = (provider.models ?? []).map((model) => {
        const id = model.id;
        const apiModelId = model.apiModelId?.trim();
        return {
          ...model,
          id,
          displayName: model.displayName ?? id,
          modelType: resolveModelType(model.modelType),
          normalizedId: normalizeModelKey(id),
          normalizedApiModelId: apiModelId ? normalizeModelKey(apiModelId) : void 0
        };
      });
      const modelById = /* @__PURE__ */ new Map();
      const modelByApiModelId = /* @__PURE__ */ new Map();
      for (const model of models) {
        modelById.set(model.normalizedId, model);
        if (model.normalizedApiModelId) {
          modelByApiModelId.set(model.normalizedApiModelId, model);
        }
      }
      this.providers.set(providerId, {
        id: provider.id,
        name: provider.name,
        defaultBaseUrl: provider.defaultBaseUrl,
        icon: provider.icon,
        models,
        modelById,
        modelByApiModelId
      });
    }
  }
  static {
    this.instance = null;
  }
  static getInstance() {
    if (!_ModelRegistry.instance) {
      _ModelRegistry.instance = new _ModelRegistry();
    }
    return _ModelRegistry.instance;
  }
  getProviderMetadata(providerId) {
    const provider = this.providers.get(normalizeProviderId(providerId));
    if (!provider) return void 0;
    return {
      id: provider.id,
      name: provider.name,
      defaultBaseUrl: provider.defaultBaseUrl,
      icon: provider.icon
    };
  }
  getAllProviderMetadata() {
    return Array.from(this.providers.values()).map((provider) => ({
      id: provider.id,
      name: provider.name,
      defaultBaseUrl: provider.defaultBaseUrl,
      icon: provider.icon
    }));
  }
  getModelIdsForProvider(providerId) {
    const provider = this.providers.get(normalizeProviderId(providerId));
    if (!provider) return [];
    return provider.models.map((model) => model.id);
  }
  getModelsForProvider(providerId) {
    const provider = this.providers.get(normalizeProviderId(providerId));
    if (!provider) return [];
    return provider.models.map(toModelMetadata);
  }
  resolveApiModelId(providerId, modelId) {
    const model = this.findModel(providerId, modelId);
    return model?.apiModelId ?? model?.id ?? modelId;
  }
  getModelCapabilities(providerId, modelId) {
    return cloneCapabilities(this.findModel(providerId, modelId)?.capabilities);
  }
  getModelTokenLimits(providerId, modelId) {
    return cloneTokenLimits(this.findModel(providerId, modelId)?.tokenLimits);
  }
  getModelIcon(providerId, modelId) {
    return this.findModel(providerId, modelId)?.icon;
  }
  mergeServerData(providerId, serverModels) {
    return serverModels.map((serverModel) => {
      const catalogModel = this.findModel(providerId, serverModel.id);
      const fallback = catalogModel ? toModelMetadata(catalogModel) : void 0;
      return {
        ...fallback,
        ...serverModel,
        id: serverModel.id,
        displayName: serverModel.displayName || fallback?.displayName || serverModel.id,
        modelType: serverModel.modelType ?? fallback?.modelType ?? DEFAULT_MODEL_TYPE,
        icon: serverModel.icon ?? fallback?.icon,
        tokenLimits: serverModel.tokenLimits ?? fallback?.tokenLimits,
        capabilities: serverModel.capabilities ?? fallback?.capabilities,
        costInput: serverModel.costInput ?? fallback?.costInput,
        costOutput: serverModel.costOutput ?? fallback?.costOutput
      };
    });
  }
  getAllProviderIds() {
    return [...this.providers.keys()];
  }
  /**
   * Merge runtime-discovered models (e.g. from Ollama API) into a provider's
   * model list. Deduplicates against existing catalog entries.
   */
  mergeRuntimeModels(providerId, modelIds) {
    const key = normalizeProviderId(providerId);
    let provider = this.providers.get(key);
    if (!provider) {
      provider = {
        id: providerId,
        name: providerId,
        defaultBaseUrl: "",
        icon: void 0,
        models: [],
        modelById: /* @__PURE__ */ new Map(),
        modelByApiModelId: /* @__PURE__ */ new Map()
      };
      this.providers.set(key, provider);
    }
    for (const id of modelIds) {
      const normalized = normalizeModelKey(id);
      if (provider.modelById.has(normalized)) continue;
      const entry = {
        id,
        displayName: id,
        modelType: DEFAULT_MODEL_TYPE,
        normalizedId: normalized
      };
      provider.models.push(entry);
      provider.modelById.set(normalized, entry);
    }
  }
  findModel(providerId, modelId) {
    const provider = this.providers.get(normalizeProviderId(providerId));
    if (!provider) return void 0;
    const normalizedInput = normalizeModelKey(modelId);
    const exact = provider.modelById.get(normalizedInput);
    if (exact) return exact;
    const byApiModelId = provider.modelByApiModelId.get(normalizedInput);
    if (byApiModelId) return byApiModelId;
    const fuzzyInput = normalizeModelForFuzzyMatch(modelId);
    let best;
    let bestScore = -1;
    for (const model of provider.models) {
      const keys = [model.normalizedId, model.normalizedApiModelId].filter(Boolean);
      for (const key of keys) {
        if (!key) continue;
        const matched = fuzzyInput.includes(key) || key.includes(fuzzyInput);
        if (!matched) continue;
        const score = key.length;
        if (score > bestScore) {
          best = model;
          bestScore = score;
        }
      }
    }
    return best;
  }
};
var modelRegistry = ModelRegistry.getInstance();

// src/service/agents/core/sdkAgentPool.ts
function findNodeBinary() {
  const home = process.env.HOME ?? "";
  const candidates = [];
  const override = globalThis.PEAK_NODE_PATH;
  if (override) candidates.push(override);
  const nvmDir = (0, import_path2.join)(home, ".nvm", "versions", "node");
  try {
    const versions = (0, import_fs.readdirSync)(nvmDir).sort().reverse();
    for (const v of versions) candidates.push((0, import_path2.join)(nvmDir, v, "bin", "node"));
  } catch {
  }
  candidates.push(
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node"
  );
  for (const p of candidates) {
    try {
      if ((0, import_fs.existsSync)(p)) return { path: p, isElectron: false };
    } catch {
    }
  }
  return { path: process.execPath, isElectron: true };
}
var _setMaxListenersPatched = false;
function patchEventsSetMaxListenersForRenderer() {
  if (_setMaxListenersPatched) return;
  _setMaxListenersPatched = true;
  const nodeRequire = globalThis.require;
  const eventsModule = nodeRequire("events");
  const original = eventsModule.setMaxListeners.bind(eventsModule);
  eventsModule.setMaxListeners = function patchedSetMaxListeners(n, ...targets) {
    try {
      original(n, ...targets);
    } catch (err) {
      if (err instanceof TypeError && String(err.message).includes("must be an instance")) {
        original(n);
        return;
      }
      throw err;
    }
  };
  console.debug("[sdkAgentPool] patched events.setMaxListeners for renderer dual-globals");
}
var _timerShimInstalled = false;
function installRendererTimerShim() {
  if (_timerShimInstalled) return;
  _timerShimInstalled = true;
  const wrap = (id) => {
    if (typeof id === "object" && id !== null) return id;
    const wrapper = {
      _peakId: id,
      unref() {
        return this;
      },
      ref() {
        return this;
      },
      refresh() {
        return this;
      },
      hasRef() {
        return true;
      },
      valueOf() {
        return id;
      },
      [Symbol.toPrimitive]() {
        return id;
      }
    };
    return wrapper;
  };
  const unwrap = (maybeWrapped) => {
    if (maybeWrapped != null && typeof maybeWrapped === "object" && "_peakId" in maybeWrapped) {
      return maybeWrapped._peakId;
    }
    return maybeWrapped;
  };
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  const origSetInterval = globalThis.setInterval;
  const origClearInterval = globalThis.clearInterval;
  globalThis.setTimeout = function patchedSetTimeout(handler, timeout, ...args) {
    const id = origSetTimeout(
      handler,
      timeout,
      ...args
    );
    return wrap(id);
  };
  globalThis.clearTimeout = function patchedClearTimeout(maybeWrapped) {
    origClearTimeout(unwrap(maybeWrapped));
  };
  globalThis.setInterval = function patchedSetInterval(handler, timeout, ...args) {
    const id = origSetInterval(
      handler,
      timeout,
      ...args
    );
    return wrap(id);
  };
  globalThis.clearInterval = function patchedClearInterval(maybeWrapped) {
    origClearInterval(unwrap(maybeWrapped));
  };
  console.debug("[sdkAgentPool] installed renderer timer shim");
}
function getCliPathBase(app, pluginId) {
  const adapter = app.vault.adapter;
  return (0, import_path2.join)(adapter.getBasePath(), app.vault.configDir, "plugins", pluginId, "sdk", "cli.js");
}
var DEFAULT_DISALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch"
];
var _warmedUp = false;
var _cachedNodeInfo = null;
async function warmupPool() {
  if (_warmedUp) return;
  patchEventsSetMaxListenersForRenderer();
  installRendererTimerShim();
  _cachedNodeInfo = findNodeBinary();
  _warmedUp = true;
  console.debug("[sdkAgentPool] pool warmup complete", {
    nodeBinary: _cachedNodeInfo
  });
}
async function ensureNodeInfo() {
  if (!_warmedUp || !_cachedNodeInfo) {
    await warmupPool();
  }
  return _cachedNodeInfo;
}
function getCliPath(app, pluginId) {
  const sdkSettings = ProfileRegistry.getInstance().getSdkSettings();
  if (sdkSettings.cliPathOverride) {
    return sdkSettings.cliPathOverride;
  }
  return getCliPathBase(app, pluginId);
}
async function* queryWithProfile(app, pluginId, profile, options) {
  const nodeInfo = await ensureNodeInfo();
  const registry = ProfileRegistry.getInstance();
  const agentConfig = registry.getActiveAgentConfig();
  const agentFastConfig = registry.getActiveAgentFastConfig();
  const agentModelId = agentConfig?.modelId ?? profile.primaryModel;
  const agentFastModelId = agentFastConfig?.modelId ?? profile.fastModel;
  const subprocessEnv = {
    ...toAgentSdkEnv(profile, agentModelId, agentFastModelId),
    PATH: process.env.PATH ?? "",
    CLAUDE_CODE_SIMPLE: "1"
  };
  if (nodeInfo.isElectron) subprocessEnv.ELECTRON_RUN_AS_NODE = "1";
  const disallowedTools = options.disallowedTools ? [.../* @__PURE__ */ new Set([...DEFAULT_DISALLOWED_TOOLS, ...options.disallowedTools])] : [...DEFAULT_DISALLOWED_TOOLS];
  const abortController = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) return;
    options.signal.addEventListener("abort", () => abortController.abort());
  }
  const basePath = app.vault.adapter.getBasePath();
  const messages = (0, import_claude_agent_sdk.query)({
    prompt: options.prompt,
    options: {
      pathToClaudeCodeExecutable: getCliPath(app, pluginId),
      executable: nodeInfo.path,
      executableArgs: [],
      cwd: basePath,
      maxTurns: options.maxTurns ?? 20,
      systemPrompt: options.systemPrompt,
      allowedTools: options.allowedTools,
      disallowedTools,
      mcpServers: options.mcpServers ?? {},
      settingSources: [],
      env: subprocessEnv,
      includePartialMessages: true,
      abortController
    }
  });
  const startMs = Date.now();
  let inputTokens = 0, outputTokens = 0, cachedTokens = 0;
  for await (const msg of messages) {
    if (options.signal?.aborted) return;
    if (msg?.type === "result" && msg?.usage) {
      inputTokens = msg.usage.input_tokens ?? 0;
      outputTokens = msg.usage.output_tokens ?? 0;
      cachedTokens = msg.usage.cache_read_input_tokens ?? 0;
    }
    yield msg;
  }
  if (options.usageFeature && (inputTokens > 0 || outputTokens > 0)) {
    try {
      const durationMs = Date.now() - startMs;
      const modelId = agentModelId ?? profile.primaryModel;
      const modelInfo = modelId ? modelRegistry.getModelsForProvider(profile.kind).find((m) => m.id === modelId) : void 0;
      const costUsd = computeUsdFromUsage(
        { inputTokens, outputTokens, cachedInputTokens: cachedTokens, reasoningTokens: 0, totalTokens: inputTokens + outputTokens },
        modelInfo
      );
      const eventBus = EventBus.getInstance(app);
      eventBus.dispatch(new UsageRecordedViewEvent({
        sessionId: options.usageSessionId ?? crypto.randomUUID(),
        feature: options.usageFeature,
        action: options.usageAction ?? "agent_query",
        provider: profile.kind,
        model: modelId ?? "unknown",
        inputTokens,
        outputTokens,
        cachedTokens,
        reasoningTokens: 0,
        costUsd,
        durationMs,
        isStreaming: false
      }));
    } catch (e) {
      console.warn("[sdkAgentPool] Failed to emit usage event", e);
    }
  }
}

// src/core/errors/llm-errors.ts
var AuthenticationError = class extends Error {
  constructor(message, provider) {
    super(message);
    this.provider = provider;
    this.name = "AuthenticationError";
  }
};
var LLMResponseError = class extends Error {
  constructor(message, rawResponse) {
    super(message);
    this.rawResponse = rawResponse;
    this.name = "LLMResponseError";
  }
};
var MaxTurnsError = class extends Error {
  constructor(message, partialText) {
    super(message);
    this.partialText = partialText;
    this.name = "MaxTurnsError";
  }
};
function throwTypedError(errorText, partialText) {
  const lower = errorText.toLowerCase();
  if (lower.includes("authentication") || lower.includes("invalid bearer") || lower.includes("401")) {
    throw new AuthenticationError(
      "API key is invalid or expired. Please update your credentials in Settings \u2192 Profiles."
    );
  }
  if (lower.includes("maximum number of turns")) {
    throw new MaxTurnsError(
      "Analysis reached maximum depth. Partial results may be available.",
      partialText
    );
  }
  throw new LLMResponseError(errorText);
}

// src/service/agents/core/sdkMessageAdapter.ts
function translateSdkMessage(raw, opts) {
  const msg = raw;
  const out = [];
  const { triggerName, taskIndex } = opts;
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        out.push({
          type: "pk-debug",
          debugName: "sdk-round-input",
          triggerName,
          extra: {
            sessionId: msg.session_id,
            model: msg.model,
            taskIndex
          }
        });
      } else {
        out.push({
          type: "pk-debug",
          debugName: `sdk-system-${msg.subtype ?? "unknown"}`,
          triggerName,
          extra: { raw: msg, taskIndex }
        });
      }
      break;
    case "assistant": {
      const blocks = msg.message?.content ?? [];
      for (const block of blocks) {
        if (!opts.hasPartialMessages && block.type === "text" && typeof block.text === "string") {
          out.push({
            type: "text-delta",
            text: block.text,
            triggerName
          });
        } else if (!opts.hasPartialMessages && block.type === "thinking" && typeof block.thinking === "string") {
          out.push({
            type: "reasoning-delta",
            text: block.thinking,
            triggerName
          });
        } else if (block.type === "tool_use") {
          out.push({
            type: "tool-call",
            id: block.id ?? "",
            toolName: block.name ?? "unknown",
            input: block.input ?? {},
            triggerName
          });
        }
      }
      break;
    }
    case "user": {
      const blocks = msg.message?.content ?? [];
      for (const block of blocks) {
        if (block.type === "tool_result") {
          out.push({
            type: "tool-result",
            id: block.tool_use_id ?? "",
            toolName: "unknown",
            // SDK doesn't carry tool name on result side
            input: {},
            output: block.content ?? null,
            triggerName
          });
        }
      }
      break;
    }
    case "result":
      out.push({
        type: "complete",
        finishReason: msg.is_error ? "error" : "stop",
        usage: {
          inputTokens: msg.usage?.input_tokens ?? 0,
          outputTokens: msg.usage?.output_tokens ?? 0,
          totalTokens: (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0),
          cachedInputTokens: msg.usage?.cache_read_input_tokens ?? 0
        },
        result: msg.result,
        triggerName
      });
      break;
    // Per-token streaming events (enabled by includePartialMessages: true)
    case "stream_event": {
      const event = msg.event;
      if (!event) break;
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          out.push({
            type: "text-delta",
            text: delta.text,
            triggerName
          });
        } else if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
          out.push({
            type: "reasoning-delta",
            text: delta.thinking,
            triggerName
          });
        }
      }
      break;
    }
    default:
      out.push({
        type: "pk-debug",
        debugName: "sdk-unknown",
        triggerName,
        extra: { raw: msg, taskIndex }
      });
      break;
  }
  return out;
}
async function* translateSdkMessages(messages, options) {
  const opts = {
    triggerName: options?.triggerName,
    taskIndex: options?.taskIndex,
    hasPartialMessages: options?.hasPartialMessages
  };
  for await (const raw of messages) {
    const events = translateSdkMessage(raw, opts);
    for (const ev of events) {
      yield ev;
    }
  }
}
async function collectText(messages) {
  let text = "";
  let errorResult = null;
  for await (const raw of messages) {
    const msg = raw;
    if (msg.type === "result" && msg.is_error) {
      errorResult = typeof msg.result === "string" ? msg.result : JSON.stringify(msg.result);
      continue;
    }
    if (msg.type === "stream_event") {
      const event = msg.event;
      if (event?.type === "content_block_delta" && event?.delta?.type === "text_delta" && typeof event?.delta?.text === "string") {
        text += event.delta.text;
      }
    } else if (msg.type === "assistant") {
      const blocks = msg.message?.content ?? [];
      for (const block of blocks) {
        if (block.type === "text" && typeof block.text === "string") {
          if (text.length === 0) {
            text += block.text;
          }
        }
      }
    }
  }
  if (errorResult) {
    throwTypedError(errorResult, text || void 0);
  }
  return text;
}

// src/service/agents/core/agentToolMcpAdapter.ts
var import_claude_agent_sdk2 = require("@anthropic-ai/claude-agent-sdk");
function agentToolsToMcpServer(serverName, tools) {
  const sdkTools = Object.entries(tools).map(([name, agentTool]) => {
    const zodObj = agentTool.inputSchema;
    const shape = zodObj.shape ?? {};
    return (0, import_claude_agent_sdk2.tool)(
      name,
      agentTool.description,
      shape,
      async (input, _extra) => {
        const result = await agentTool.execute(input);
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return {
          content: [{ type: "text", text }]
        };
      }
    );
  });
  return (0, import_claude_agent_sdk2.createSdkMcpServer)({
    name: serverName,
    version: "1.0.0",
    tools: sdkTools
  });
}
function mcpToolNames(serverName, tools) {
  return Object.keys(tools).map((name) => `mcp__${serverName}__${name}`);
}

// src/service/agents/intuition-helper/intuition.recon.ts
function effectiveReconMaxIterations(budgetDerived, debug) {
  const base = Math.max(1, Math.min(6, budgetDerived));
  if (debug?.maxIterations !== void 0) {
    return Math.max(1, Math.min(6, Math.min(base, debug.maxIterations)));
  }
  return base;
}
function serializeHistory(history) {
  return history.map((entry) => {
    switch (entry.role) {
      case "user":
        return `<user>
${entry.content}
</user>`;
      case "assistant":
        return `<assistant>
${entry.content}
</assistant>`;
      case "tool-results":
        return `<tool-results>
${entry.content}
</tool-results>`;
    }
  }).join("\n\n");
}
var MCP_SERVER_NAME = "recon";
async function* runKnowledgeIntuitionLoop(options) {
  const { ctx, stepId, aiServiceManager, onComplete, debug } = options;
  const stopwatch = new Stopwatch("Knowledge intuition recon");
  const tools = {
    explore_folder: exploreFolderTool(ctx.tm, { forceFormat: "markdown" }),
    grep_file_tree: grepFileTreeTool(),
    local_search_whole_vault: localSearchWholeVaultTool(ctx.tm),
    inspect_note_context: inspectNoteContextTool(ctx.tm, { forceFormat: "markdown" }),
    graph_traversal: graphTraversalTool(ctx.tm, { forceFormat: "markdown" }),
    find_path: findPathTool(ctx.tm)
  };
  const budgetDerived = Math.min(6, Math.max(3, Math.floor(ctx.indexBudgetRaw.limitTotal / 160)));
  const maxIter = effectiveReconMaxIterations(budgetDerived, debug);
  let memory = buildInitialIntuitionMemory();
  const initialUserPrompt = await aiServiceManager.renderPrompt("knowledge-intuition-plan" /* KnowledgeIntuitionPlan */, {
    userGoal: ctx.userGoal,
    vaultName: ctx.vaultName,
    currentDateLabel: ctx.currentDateLabel,
    vaultSummaryMarkdown: ctx.vaultSummaryMarkdown,
    baselineExcludedMarkdown: ctx.baselineExcludedMarkdown,
    backboneMarkdownExcerpt: ctx.backboneMarkdownExcerpt,
    backboneEdgesMarkdown: ctx.backboneEdgesMarkdown,
    folderSignalsMarkdown: ctx.folderSignalsMarkdown,
    documentShortlistMarkdown: ctx.documentShortlistMarkdown,
    folderTreeMarkdown: ctx.folderTreeMarkdown
  });
  const history = [
    { role: "user", content: initialUserPrompt }
  ];
  const mcpServer = agentToolsToMcpServer(MCP_SERVER_NAME, tools);
  const allowedTools = mcpToolNames(MCP_SERVER_NAME, tools);
  const appCtx = AppContext.getInstance();
  const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
  for (let iter = 0; iter < maxIter; iter++) {
    const planSystem = await aiServiceManager.renderPrompt("knowledge-intuition-plan-system" /* KnowledgeIntuitionPlanSystem */, {});
    let iterPrompt = serializeHistory(history);
    if (iter > 0) {
      iterPrompt += `

[Iteration ${iter + 1}/${maxIter}] Intuition memory (JSON):
${JSON.stringify(memory)}`;
    }
    yield buildPromptTraceDebugEvent(
      "knowledge-intuition-plan" /* KNOWLEDGE_INTUITION_PLAN */,
      planSystem,
      iterPrompt
    );
    stopwatch.start(`knowledge intuition plan iter ${iter}`);
    const capturedToolResults = [];
    const capturedToolCalls = [];
    const capturingMcpServer = agentToolsToMcpServer(MCP_SERVER_NAME, Object.fromEntries(
      Object.entries(tools).map(([name, agentTool]) => [name, {
        ...agentTool,
        execute: async (input) => {
          capturedToolCalls.push({ toolName: name, input });
          const result = await agentTool.execute(input);
          const str = typeof result === "string" ? result : JSON.stringify(result);
          capturedToolResults.push(`[${name}] ${str.slice(0, 2e3)}${str.length > 2e3 ? "\u2026" : ""}`);
          return result;
        }
      }])
    ));
    const planMessages = queryWithProfile(appCtx.app, appCtx.pluginId, profile, {
      prompt: iterPrompt,
      systemPrompt: planSystem,
      maxTurns: 2,
      // one LLM turn with tool calls + one final response
      mcpServers: { [MCP_SERVER_NAME]: capturingMcpServer },
      allowedTools
    });
    let planText = "";
    for await (const ev of translateSdkMessages(planMessages, {
      triggerName: "knowledge-intuition-plan" /* KNOWLEDGE_INTUITION_PLAN */,
      hasPartialMessages: true
    })) {
      if (ev.type === "text-delta" && typeof ev.text === "string") {
        planText += ev.text;
      }
      yield ev;
    }
    stopwatch.stop();
    const toolResultsMarkdown = capturedToolResults.length > 0 ? capturedToolResults.join("\n\n") : "(no tool calls executed)";
    const iterOneBased = iter + 1;
    yield {
      type: "pk-debug",
      debugName: "Knowledge intuition plan+tools raw",
      extra: {
        iteration: iterOneBased,
        maxIter,
        planText: planText || void 0,
        toolCalls: capturedToolCalls,
        toolResultsPreview: toolResultsMarkdown.slice(0, 400) + (toolResultsMarkdown.length > 400 ? "\u2026" : "")
      }
    };
    if (debug?.stopAfterPlanIteration === iterOneBased) {
      yield {
        type: "pk-debug",
        debugName: "Knowledge intuition stop (after plan + tools)",
        extra: { stopped: true, iteration: iterOneBased, maxIter, phase: "intuition_plan" }
      };
      onComplete(memory);
      return;
    }
    const submitRaw = await aiServiceManager.queryText(
      "knowledge-intuition-submit" /* KnowledgeIntuitionSubmit */,
      {
        userGoal: ctx.userGoal,
        iteration: iterOneBased,
        memoryJson: JSON.stringify(memory),
        vaultScaleHintMarkdown: ctx.vaultScaleHintMarkdown,
        folderTreeMarkdown: ctx.folderTreeMarkdown,
        backboneEdgesJson: ctx.backboneEdgesJson,
        toolResultsMarkdown
      }
    );
    const submitJsonMatch = submitRaw.match(/```json\s*([\s\S]*?)```/) || submitRaw.match(/(\{[\s\S]*\})/);
    if (!submitJsonMatch) {
      console.error("[IntuitionRecon] No JSON in submit response, stopping loop");
      break;
    }
    const submit = knowledgeIntuitionSubmitSchema.parse(JSON.parse(submitJsonMatch[1] || submitJsonMatch[0]));
    yield {
      type: "pk-debug",
      debugName: "knowledge-intuition-submit",
      triggerName: "knowledge-intuition-submit" /* KNOWLEDGE_INTUITION_SUBMIT */,
      extra: {
        iteration: iterOneBased,
        maxIter,
        should_stop: submit.should_stop,
        submit
      }
    };
    memory = mergeIntuitionSubmitIntoMemory(memory, submit);
    if (planText) {
      history.push({ role: "assistant", content: planText });
    }
    if (capturedToolResults.length > 0) {
      history.push({ role: "tool-results", content: toolResultsMarkdown });
    }
    history.push({
      role: "assistant",
      content: JSON.stringify({
        findingsSummary: submit.findingsSummary,
        should_stop: submit.should_stop
      })
    });
    if (debug?.stopAfterSubmitIteration === iterOneBased) {
      yield {
        type: "pk-debug",
        debugName: "Knowledge intuition stop (after submit)",
        extra: {
          stopped: true,
          iteration: iterOneBased,
          maxIter,
          phase: "intuition_submit",
          memoryAfterMerge: memory
        }
      };
      onComplete(memory);
      return;
    }
    if (submit.should_stop) break;
  }
  yield {
    type: "pk-debug",
    debugName: "Knowledge intuition recon complete",
    extra: { stopwatch: stopwatch.toString() }
  };
  onComplete(memory);
}

// src/service/agents/intuition-helper/intuitionPrep.ts
var import_obsidian9 = __toESM(require_obsidian_stub());

// src/core/utils/file-utils.ts
function normalizeFilePath(path4) {
  return path4.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}
function basenameFromPath(path4) {
  if (!path4) return "";
  const i = path4.lastIndexOf("/");
  return i >= 0 ? path4.slice(i + 1) : path4;
}
function getFileNameFromPath(path4) {
  const s = String(path4 ?? "").trim();
  return s.replace(/^\/+/, "").replace(/\/+$/, "").split("/").pop() ?? "";
}

// src/service/search/index/helper/backbone/buildBackboneMap.ts
var import_ignore2 = __toESM(require("ignore"));
var import_obsidian8 = __toESM(require_obsidian_stub());

// src/service/search/IgnoreService.ts
var import_ignore = __toESM(require("ignore"));
var IgnoreService = class _IgnoreService {
  constructor(ignorePatterns = []) {
    this.patterns = [];
    this.ig = (0, import_ignore.default)();
    this.updateSettings(ignorePatterns);
  }
  static {
    this.instance = null;
  }
  /**
   * Get the global singleton instance.
   * Must be initialized with init() before first use.
   */
  static getInstance() {
    if (!_IgnoreService.instance) {
      throw new Error("IgnoreService not initialized. Call init() first.");
    }
    return _IgnoreService.instance;
  }
  /**
   * Clear the global singleton instance.
   * Call from plugin onunload to release memory.
   */
  static clearInstance() {
    _IgnoreService.instance = null;
  }
  /**
   * Initialize the global singleton instance.
   * Should be called once during plugin initialization.
   */
  static init(ignorePatterns = []) {
    if (_IgnoreService.instance) {
      console.warn("IgnoreService already initialized. Reinitializing with new patterns.");
    }
    _IgnoreService.instance = new _IgnoreService(ignorePatterns);
    return _IgnoreService.instance;
  }
  /**
   * Update ignore patterns and reload the service.
   * Should be called when ignore patterns are updated.
   */
  updateSettings(ignorePatterns) {
    this.patterns = ignorePatterns;
    this.ig = (0, import_ignore.default)();
    if (ignorePatterns && ignorePatterns.length > 0) {
      this.ig.add(ignorePatterns);
    }
  }
  /**
   * Check if a path should be ignored.
   * @param path Relative path to check (should be relative to vault root)
   * @returns true if the path should be ignored, false otherwise
   */
  shouldIgnore(path4) {
    const normalizedPath = path4.replace(/\\/g, "/");
    const cleanPath = normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath;
    return this.ig.ignores(cleanPath);
  }
  /**
   * Filter an array of paths, removing ignored ones.
   * @param paths Array of relative paths to filter
   * @returns Array of paths that are not ignored
   */
  filterPaths(paths) {
    return this.ig.filter(paths);
  }
  /**
   * Get the current ignore patterns.
   * @returns Array of current ignore patterns
   */
  getPatterns() {
    return this.patterns;
  }
  /**
   * Test ignore functionality with detailed result.
   * @param path Path to test
   * @returns Test result with ignore status and rule information
   */
  test(path4) {
    const normalizedPath = path4.replace(/\\/g, "/");
    const cleanPath = normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath;
    return this.ig.test(cleanPath);
  }
};

// src/service/search/index/helper/backbone/buildBackboneMap.ts
var TYPE_PRIOR = {
  topic: 1,
  keyword: 0.82,
  functional: 0.22
};
var STATIC_ROW_NOISE = /* @__PURE__ */ new Set([
  "todo",
  "todolist",
  "todo-list",
  "mess",
  "messy",
  "waiting",
  "pending",
  "later",
  "done",
  "doing",
  "inbox",
  "index",
  "archive",
  "draft",
  "wip"
]);
var MAX_FOLDER_COVERAGE_FOR_ROW = 0.1;
function normalizeTagKey(tag) {
  return tag.trim().toLowerCase();
}
function getDfForTag(tag, dfMap) {
  const d = dfMap.get(tag);
  if (d !== void 0) return d;
  const k = normalizeTagKey(tag);
  for (const [t, df] of dfMap) {
    if (normalizeTagKey(t) === k) return df;
  }
  return 0;
}
function shouldHideTagFromFolderRows(tag, stats) {
  if (!tag.trim()) return false;
  if (STATIC_ROW_NOISE.has(normalizeTagKey(tag))) return true;
  const N = stats.folderCount;
  if (N <= 0) return false;
  const df = getDfForTag(tag, stats.tagFolderDf);
  if (df <= 0) return false;
  return df / N >= MAX_FOLDER_COVERAGE_FOR_ROW;
}
function buildVaultNoiseTagLegend(stats, maxEntries = 80) {
  if (stats.folderCount <= 0) return [];
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [tag, df] of stats.tagFolderDf) {
    if (df <= 0) continue;
    if (!shouldHideTagFromFolderRows(tag, stats)) continue;
    const k = normalizeTagKey(tag);
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ tag, df });
  }
  items.sort((a, b) => b.df - a.df);
  return items.slice(0, maxEntries).map(({ tag, df }) => `${tag} (${df} folders)`);
}
function firstVaultPathSegment(path4) {
  const n = normalizeVaultPath(path4);
  const parts = n.split("/").filter(Boolean);
  return parts[0] ?? "";
}
function smoothIdf(df, n) {
  if (n <= 0) return 1;
  return Math.log((n + 1) / (df + 1)) + 1;
}
function buildTagGlobalStats(folders) {
  const tagFolderSets = /* @__PURE__ */ new Map();
  const tagRootSets = /* @__PURE__ */ new Map();
  const allRoots = /* @__PURE__ */ new Set();
  const getOrCreate = (m, k) => {
    let s = m.get(k);
    if (!s) {
      s = /* @__PURE__ */ new Set();
      m.set(k, s);
    }
    return s;
  };
  for (const f of folders) {
    const root = firstVaultPathSegment(f.folderPath) || "_";
    allRoots.add(root);
    const seen = /* @__PURE__ */ new Set();
    for (const counts of [f.topicTagCounts, f.keywordTagCounts, f.functionalTagCounts]) {
      for (const [tag, c] of counts) {
        if (c > 0 && tag && !seen.has(tag)) {
          seen.add(tag);
          getOrCreate(tagFolderSets, tag).add(f.folderPath);
          getOrCreate(tagRootSets, tag).add(root);
        }
      }
    }
  }
  const tagFolderDf = /* @__PURE__ */ new Map();
  const tagRootDf = /* @__PURE__ */ new Map();
  for (const [tag, set] of tagFolderSets) tagFolderDf.set(tag, set.size);
  for (const [tag, set] of tagRootSets) tagRootDf.set(tag, set.size);
  return { folderCount: folders.length, rootBucketCount: Math.max(1, allRoots.size), tagFolderDf, tagRootDf };
}
function scoreTag(tf, tag, category, stats) {
  if (tf <= 0) return 0;
  const idfFolder = smoothIdf(getDfForTag(tag, stats.tagFolderDf), stats.folderCount);
  const idfRoot = smoothIdf(getDfForTag(tag, stats.tagRootDf), stats.rootBucketCount);
  return tf * idfFolder * idfRoot * TYPE_PRIOR[category];
}
function rankMapByScore(counts, category, stats, limit) {
  const scored = [...counts.entries()].filter(([, c]) => c > 0).map(([tag, tf]) => ({ tag, s: scoreTag(tf, tag, category, stats) })).sort((a, b) => b.s - a.s || a.tag.localeCompare(b.tag));
  const out = [];
  for (const x of scored) {
    if (shouldHideTagFromFolderRows(x.tag, stats)) continue;
    out.push(x.tag);
    if (out.length >= limit) break;
  }
  return out;
}
function mergeKwFunctionalCounts(kw, fn) {
  const m = /* @__PURE__ */ new Map();
  for (const [t, c] of kw) if (c > 0) m.set(t, c + (fn.get(t) ?? 0));
  for (const [t, c] of fn) if (c > 0 && !m.has(t)) m.set(t, c);
  return m;
}
function pickCounts(full, names) {
  const m = /* @__PURE__ */ new Map();
  for (const n of names) {
    const c = full.get(n);
    if (c && c > 0) m.set(n, c);
  }
  return m;
}
function normalizeVaultFolderPath2(folderPath) {
  const raw = folderPath == null ? "" : String(folderPath).trim();
  if (raw === "" || raw === "/") return "";
  return raw.replace(/^\/+|\/+$/g, "");
}
function getBackboneExcludedPrefixes() {
  const settings = AppContext.getInstance().settings;
  const enabled = settings.search.aiAnalysisExcludeAutoSaveFolderFromSearch ?? true;
  if (!enabled) return [];
  const rootFolder = normalizeVaultFolderPath2(settings.ai.rootFolder);
  const autoSaveFolder = normalizeVaultFolderPath2(settings.search.aiAnalysisAutoSaveFolder);
  return [...new Set([rootFolder, autoSaveFolder].filter(Boolean))];
}
function isPathExcludedByPrefixes(path4, excludedPathPrefixes) {
  if (!excludedPathPrefixes.length) return false;
  const p = normalizeVaultFolderPath2(path4);
  if (p === "") return false;
  const hub = normalizeVaultFolderPath2(getAIHubSummaryFolder());
  if (hub && (p === hub || p.startsWith(`${hub}/`))) return false;
  for (const raw of excludedPathPrefixes) {
    const prefix = normalizeVaultFolderPath2(raw);
    if (!prefix) continue;
    if (p === prefix) return true;
    if (p.startsWith(`${prefix}/`)) return true;
  }
  return false;
}
function shouldIgnoreFolderForBackbone(path4) {
  const p = normalizeVaultFolderPath2(path4);
  const hub = normalizeVaultFolderPath2(getAIHubSummaryFolder());
  if (hub && (p === hub || p.startsWith(`${hub}/`))) return false;
  try {
    return IgnoreService.getInstance().shouldIgnore(path4);
  } catch {
    const patterns = AppContext.getInstance().settings.search.ignorePatterns ?? [];
    if (!patterns.length) return false;
    const ig = (0, import_ignore2.default)();
    ig.add(patterns);
    const clean = String(path4).replace(/\\/g, "/").replace(/^\//, "");
    return ig.ignores(clean);
  }
}
function visibleChildFolders(folder, excludedPathPrefixes) {
  const subs = folder.children.filter((c) => c instanceof import_obsidian8.TFolder).sort((a, b) => a.path.localeCompare(b.path));
  return subs.filter(
    (s) => !isPathExcludedByPrefixes(s.path, excludedPathPrefixes) && !shouldIgnoreFolderForBackbone(s.path)
  );
}
function scanFolderTree(root, maxDepth, maxFolders, excludedPathPrefixes) {
  const rows = [];
  const subtreeStats = /* @__PURE__ */ new Map();
  function dfs(folder, depth, collectRows) {
    const visibleSubs = visibleChildFolders(folder, excludedPathPrefixes);
    if (collectRows && rows.length < maxFolders) {
      rows.push({ path: folder.path, depth, childFolderCount: visibleSubs.length });
    }
    const childCollect = collectRows && depth < maxDepth && rows.length < maxFolders;
    let sumDepths = depth, count = 1, max = depth;
    for (const sub of visibleSubs) {
      const a = dfs(sub, depth + 1, childCollect);
      sumDepths += a.sumDepths;
      count += a.count;
      max = Math.max(max, a.maxDepth);
    }
    subtreeStats.set(normalizeVaultPath(folder.path), {
      subtreeMaxDepth: max,
      subtreeAvgDepth: count > 0 ? sumDepths / count : depth
    });
    return { sumDepths, count, maxDepth: max };
  }
  const top = root.children.filter((c) => c instanceof import_obsidian8.TFolder).sort((a, b) => a.path.localeCompare(b.path));
  for (const ch of top) {
    if (isPathExcludedByPrefixes(ch.path, excludedPathPrefixes) || shouldIgnoreFolderForBackbone(ch.path)) continue;
    dfs(ch, 1, true);
  }
  return { rows, subtreeStats };
}
function stripFileExtensionBasename(basename) {
  const i = basename.lastIndexOf(".");
  if (i <= 0) return basename;
  return basename.slice(0, i);
}
function tokenizeHubDigestBasename(rawBasename) {
  const base = stripFileExtensionBasename(rawBasename.trim());
  if (!base) return [];
  const withCamel = base.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const parts = withCamel.split(/[\s\-_/\.，、]+/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (/^[\x00-\x7f]+$/.test(t)) {
      const low = t.toLowerCase();
      if (low.length >= 2) out.push(low);
    } else if (t.length <= 32) {
      out.push(t.toLowerCase());
    }
  }
  return out;
}
function topTokensFromBasenames(basenames, maxTokens) {
  const counts = /* @__PURE__ */ new Map();
  for (const name of basenames) {
    for (const tok of tokenizeHubDigestBasename(name)) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, Math.max(0, maxTokens)).map(([t]) => t);
}
var NAME_TOKEN_TOP = 6;
function formatTopWeightedTopics(topicTagCounts, keywordTagCounts, maxTopics) {
  const merged = /* @__PURE__ */ new Map();
  for (const [k, v] of topicTagCounts) merged.set(k, (merged.get(k) ?? 0) + v);
  for (const [k, v] of keywordTagCounts) merged.set(k, (merged.get(k) ?? 0) + v);
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return "";
  const top = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTopics);
  return top.map(([name, c]) => `${name}(${Math.round(100 * c / total)}%)`).join(", ");
}
function topicPurityFromCounts(topicTagCounts) {
  const total = [...topicTagCounts.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return 1;
  let h = 0;
  for (const v of topicTagCounts.values()) {
    const p = v / total;
    h += p * p;
  }
  return h;
}
function buildFolderDescription(f) {
  const theme = f.topTopics.slice(0, 2).join(", ") || "mixed topics";
  if (f.topicPurity >= 0.5) return `Cohesive thematic branch around ${theme}.`;
  if (f.docOutgoing > 40) return `Strong outbound links (${f.docOutgoing}); likely cross-folder corridor.`;
  if (f.childFolderCount > 6) return `Wide container (${f.childFolderCount} subfolders); landing layer.`;
  return `Mixed coverage (${theme}); ${f.docCount} indexed notes in subtree.`;
}
async function loadBackboneFolderNodes(rows, excludedPathPrefixes, subtreeStatsMap) {
  if (!sqliteStoreManager.isInitialized() || rows.length === 0) {
    return { folderNodes: [], recursiveMapsByFolder: /* @__PURE__ */ new Map(), tagGlobalStats: { folderCount: 0, rootBucketCount: 1, tagFolderDf: /* @__PURE__ */ new Map(), tagRootDf: /* @__PURE__ */ new Map() } };
  }
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const graphRepo = sqliteStoreManager.getGraphRepo();
  const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo();
  const paths = rows.map((r) => r.path);
  const degreeMap = await mobiusRepo.listFolderDocDegreesByVaultPaths(paths);
  const vault = AppContext.getInstance().app.vault;
  const recursiveMapsByFolder = /* @__PURE__ */ new Map();
  const rawRows = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const np = normalizeVaultPath(row.path);
    const deg = degreeMap.get(np) ?? { incoming: 0, outgoing: 0 };
    let maps = [];
    let topicTagCounts = /* @__PURE__ */ new Map();
    let keywordTagCounts = /* @__PURE__ */ new Map();
    let functionalTagCounts = /* @__PURE__ */ new Map();
    try {
      maps = await indexedDocumentRepo.getIdsByFolderPath(row.path);
      recursiveMapsByFolder.set(np, maps);
      const directMaps = maps.filter((m) => isDirectDocInFolder(m.path, row.path));
      if (directMaps.length > 0) {
        const docIds = directMaps.map((m) => m.id);
        const t = await graphRepo.getTagsByDocIds(docIds);
        topicTagCounts = t.topicTagCounts;
        keywordTagCounts = t.keywordTagCounts;
        functionalTagCounts = t.functionalTagCounts;
      }
    } catch {
      maps = [];
      recursiveMapsByFolder.set(np, []);
    }
    rawRows.push({ row, np, maps, topicTagCounts, keywordTagCounts, functionalTagCounts, deg });
  }
  const tagGlobalStats = buildTagGlobalStats(
    rawRows.map((r) => ({
      folderPath: r.np,
      topicTagCounts: r.topicTagCounts,
      keywordTagCounts: r.keywordTagCounts,
      functionalTagCounts: r.functionalTagCounts
    }))
  );
  const TOP_TOPIC = 5;
  const TOP_KEYWORD = 6;
  const out = [];
  for (let i = 0; i < rawRows.length; i++) {
    const { row, np, maps, topicTagCounts, keywordTagCounts, functionalTagCounts, deg } = rawRows[i];
    const topTopics = rankMapByScore(topicTagCounts, "topic", tagGlobalStats, TOP_TOPIC);
    const mergedKw = mergeKwFunctionalCounts(keywordTagCounts, functionalTagCounts);
    const topKeywords = rankMapByScore(mergedKw, "keyword", tagGlobalStats, TOP_KEYWORD);
    const directFileMaps = maps.filter((m) => isDirectDocInFolder(m.path, row.path));
    const fileBasenames = directFileMaps.map((m) => basenameFromPath(m.path));
    let subfolderNameTokenSample = [];
    if (row.childFolderCount > 0) {
      const af = vault.getAbstractFileByPath(row.path);
      if (af instanceof import_obsidian8.TFolder) {
        subfolderNameTokenSample = topTokensFromBasenames(
          visibleChildFolders(af, excludedPathPrefixes).map((f) => basenameFromPath(f.path)),
          NAME_TOKEN_TOP
        );
      }
    }
    const st = subtreeStatsMap.get(np);
    out.push({
      id: `F-${String(i + 1).padStart(3, "0")}`,
      path: row.path,
      displayName: basenameFromPath(row.path) || row.path,
      depth: row.depth,
      childFolderCount: row.childFolderCount,
      subtreeMaxDepth: st?.subtreeMaxDepth ?? row.depth,
      subtreeAvgDepth: st?.subtreeAvgDepth ?? row.depth,
      docCount: maps.length,
      directDocCount: directFileMaps.length,
      topKeywords,
      topTopics,
      topTopicsWeighted: formatTopWeightedTopics(pickCounts(topicTagCounts, topTopics), pickCounts(mergedKw, topKeywords), 3),
      topicPurity: topicPurityFromCounts(topicTagCounts),
      docOutgoing: deg.outgoing,
      docIncoming: deg.incoming,
      fileNameTokenSample: fileBasenames.length > 0 ? topTokensFromBasenames(fileBasenames, NAME_TOKEN_TOP) : [],
      subfolderNameTokenSample,
      pageRankMass: 0,
      semanticPageRankMass: 0,
      cityScore: 0,
      isCity: false,
      description: ""
    });
  }
  for (const n of out) {
    n.description = buildFolderDescription(n);
  }
  return { folderNodes: out, recursiveMapsByFolder, tagGlobalStats };
}
function parentFolderOfDocPath(docPath) {
  return normalizeVaultPath(parentDirPath(docPath));
}
function isDirectDocInFolder(docPath, folderPath) {
  return parentFolderOfDocPath(docPath) === normalizeVaultPath(folderPath);
}
function parentFolderPath(folderPath) {
  const segs = normalizeVaultPath(folderPath).split("/").filter(Boolean);
  return segs.length <= 1 ? "" : segs.slice(0, -1).join("/");
}
function buildSupernodeResolver(folderNodes, virtualNodes) {
  const pathToFolder = /* @__PURE__ */ new Map();
  for (const f of folderNodes) pathToFolder.set(normalizeVaultPath(f.path), f);
  const docPathToVirtualId = /* @__PURE__ */ new Map();
  for (const v of virtualNodes) for (const p of v.memberDocPaths) {
    const np = normalizeVaultPath(p);
    if (!docPathToVirtualId.has(np)) docPathToVirtualId.set(np, v.id);
  }
  const idToLabel = /* @__PURE__ */ new Map();
  for (const f of folderNodes) idToLabel.set(f.id, `${f.displayName}/`);
  for (const v of virtualNodes) idToLabel.set(v.id, v.displayName);
  return {
    resolve: (docPath) => {
      const np = normalizeVaultPath(docPath);
      const vid = docPathToVirtualId.get(np);
      if (vid) return vid;
      let p = parentFolderOfDocPath(docPath);
      while (p) {
        const n = pathToFolder.get(p);
        if (n) return n.id;
        p = parentFolderPath(p);
      }
      return pathToFolder.get("")?.id;
    },
    label: (supernodeId) => idToLabel.get(supernodeId) ?? supernodeId
  };
}
function pairKey(from, to) {
  return `${from}=>${to}`;
}
async function buildBackboneEdges(options) {
  const { validDocIdSet, nodeIdToPath, prMap, resolver, topK } = options;
  const aggs = /* @__PURE__ */ new Map();
  function bump(fromId, toId, kind, semW) {
    if (!validDocIdSet.has(fromId) || !validDocIdSet.has(toId)) return;
    const pFrom = nodeIdToPath.get(fromId);
    const pTo = nodeIdToPath.get(toId);
    if (!pFrom || !pTo) return;
    const s1 = resolver.resolve(pFrom);
    const s2 = resolver.resolve(pTo);
    if (!s1 || !s2 || s1 === s2) return;
    const prF = prMap.get(fromId)?.pr ?? 0;
    const prT = prMap.get(toId)?.pr ?? 0;
    const bridge = 0.5 * (prF + prT);
    const key = pairKey(s1, s2);
    let a = aggs.get(key);
    if (!a) {
      a = { from: s1, to: s2, referenceCount: 0, semanticWeightSum: 0, bridgePageRankMass: 0 };
      aggs.set(key, a);
    }
    if (kind === "ref") {
      a.referenceCount += 1;
      a.bridgePageRankMass += bridge;
    } else {
      const w = Number.isFinite(semW) && semW > 0 ? semW : 0;
      a.semanticWeightSum += w;
      a.bridgePageRankMass += bridge * Math.min(1, w);
    }
  }
  if (!sqliteStoreManager.isInitialized()) {
    return { edges: [], pairCount: 0 };
  }
  const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  for await (const batch of edgeRepo.iterateReferenceEdgeBatches(2e3)) {
    for (const e of batch) {
      bump(e.from_node_id, e.to_node_id, "ref", 0);
    }
  }
  for await (const batch of edgeRepo.iterateSemanticRelatedEdgeBatches(2e3)) {
    for (const e of batch) {
      bump(e.from_node_id, e.to_node_id, "sem", e.weight);
    }
  }
  const scored = [...aggs.values()].map((a) => {
    const weight = a.referenceCount + 0.35 * a.semanticWeightSum + 0.5 * Math.min(50, a.bridgePageRankMass);
    const label = shortEdgeLabel(a.referenceCount, a.semanticWeightSum);
    return { ...a, weight, label };
  });
  scored.sort((x, y) => y.weight - x.weight);
  const picked = scored.slice(0, Math.max(1, topK));
  const edges = picked.map((a, i) => ({
    id: `H-${String(i + 1).padStart(3, "0")}`,
    fromId: a.from,
    toId: a.to,
    fromLabel: resolver.label(a.from),
    toLabel: resolver.label(a.to),
    weight: a.weight,
    referenceCount: a.referenceCount,
    semanticWeightSum: a.semanticWeightSum,
    bridgePageRankMass: a.bridgePageRankMass,
    label: a.label
  }));
  return { edges, pairCount: aggs.size };
}
function shortEdgeLabel(ref, sem) {
  if (ref > 0 && sem > 0) return "refs + semantic";
  if (ref > 0) return "references";
  return "semantic";
}
async function loadDocPageranks(docIds) {
  const out = /* @__PURE__ */ new Map();
  if (!docIds.length || !sqliteStoreManager.isInitialized()) return out;
  const kdb = sqliteStoreManager.getIndexContext("vault");
  const safeNum = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
  for (let i = 0; i < docIds.length; i += 900) {
    const rows = await kdb.selectFrom("mobius_node").select(["node_id", "pagerank", "semantic_pagerank"]).where("node_id", "in", docIds.slice(i, i + 900)).execute();
    for (const r of rows) out.set(String(r.node_id), { pr: safeNum(r.pagerank), spr: safeNum(r.semantic_pagerank) });
  }
  return out;
}
var MIN_DIRECT = 8;
var MAX_PURITY = 0.42;
var MIN_CLUSTER = 3;
var MIN_RATIO = 0.18;
function prefixKeyFromBasename(basename) {
  const noExt = basename.replace(/\.[^.]+$/, "");
  const m = noExt.match(/^([a-zA-Z][a-zA-Z0-9]{2,})/);
  if (m) return m[1].toLowerCase();
  const parts = noExt.split(/[-_\s]+/).filter(Boolean);
  return (parts[0] ?? "").toLowerCase().slice(0, 32);
}
async function buildVirtualNodesForMessyFolders(folderNodes, enableVirtualFolders, tagGlobalStats) {
  if (!enableVirtualFolders || !sqliteStoreManager.isInitialized() || folderNodes.length === 0) {
    return [];
  }
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const graphRepo = sqliteStoreManager.getGraphRepo();
  const out = [];
  let vCounter = 0;
  for (const folder of folderNodes) {
    if (folder.directDocCount < MIN_DIRECT || folder.topicPurity > MAX_PURITY) continue;
    let maps = [];
    try {
      maps = await indexedDocumentRepo.getIdsByFolderPath(folder.path);
    } catch {
      continue;
    }
    const direct = maps.filter((m) => isDirectDocInFolder(m.path, folder.path));
    if (direct.length < MIN_DIRECT) continue;
    const byPrefix = /* @__PURE__ */ new Map();
    for (const m of direct) {
      const base = basenameFromPath(m.path);
      const key = prefixKeyFromBasename(base);
      if (key.length < 3) continue;
      const arr = byPrefix.get(key) ?? [];
      arr.push(m.path);
      byPrefix.set(key, arr);
    }
    const nDirect = direct.length;
    for (const [key, paths] of byPrefix) {
      if (paths.length < MIN_CLUSTER) continue;
      if (paths.length / nDirect < MIN_RATIO) continue;
      vCounter++;
      const id = `V-${String(vCounter).padStart(3, "0")}`;
      let topTopics = [];
      let topKeywords = [];
      let topTopicsWeighted = "";
      let topicPurity = 1;
      try {
        const docIds = await indexedDocumentRepo.getIdsByPaths(paths);
        const ids = docIds.map((x) => x.id);
        if (ids.length) {
          const { topicTagCounts, keywordTagCounts, functionalTagCounts } = await graphRepo.getTagsByDocIds(ids);
          topicPurity = topicPurityFromCounts(topicTagCounts);
          topTopics = rankMapByScore(topicTagCounts, "topic", tagGlobalStats, 4);
          const mkw = mergeKwFunctionalCounts(keywordTagCounts, functionalTagCounts);
          topKeywords = rankMapByScore(mkw, "keyword", tagGlobalStats, 5);
          const weighted = formatTopWeightedTopics(pickCounts(topicTagCounts, topTopics), pickCounts(mkw, topKeywords), 3);
          if (weighted) topTopicsWeighted = weighted;
        }
      } catch {
      }
      const displayName = `virtual-${key}/`;
      out.push({
        id,
        parentFolderPath: normalizeVaultPath(folder.path),
        displayName,
        kind: "prefix",
        memberDocPaths: [...paths].sort(),
        memberCount: paths.length,
        parentDirectDocCount: nDirect,
        topKeywords,
        topTopics,
        topTopicsWeighted,
        topicPurity,
        docOutgoing: 0,
        pageRankMass: 0,
        description: `Filename prefix cluster "${key}" (${paths.length} notes).`
      });
    }
  }
  return out;
}
function buildHighwayBodyLines(edgesOrdered) {
  const byTriple = /* @__PURE__ */ new Map();
  for (const e of edgesOrdered) {
    byTriple.set(`${e.fromId}\0${e.toId}\0${e.label}`, e);
  }
  const consumed = /* @__PURE__ */ new Set();
  const reciprocalRows = [];
  for (const e of edgesOrdered) {
    if (consumed.has(e.id)) continue;
    const rev = byTriple.get(`${e.toId}\0${e.fromId}\0${e.label}`);
    if (rev && rev.id !== e.id) {
      const left = e.fromId.localeCompare(e.toId) <= 0 ? e.fromId : e.toId;
      const right = e.fromId.localeCompare(e.toId) <= 0 ? e.toId : e.fromId;
      const sortKey = `${left}\0${right}\0${e.label}`;
      reciprocalRows.push({
        left,
        right,
        label: e.label,
        sortKey
      });
      consumed.add(e.id);
      consumed.add(rev.id);
    }
  }
  const remaining = [];
  for (const e of edgesOrdered) {
    if (!consumed.has(e.id)) remaining.push(e);
  }
  const byFrom = /* @__PURE__ */ new Map();
  for (const e of remaining) {
    const arr = byFrom.get(e.fromId) ?? [];
    arr.push(e);
    byFrom.set(e.fromId, arr);
  }
  for (const arr of byFrom.values()) {
    arr.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.toId.localeCompare(b.toId);
    });
  }
  const blocks = [];
  for (const r of reciprocalRows.sort((a, b) => a.sortKey.localeCompare(b.sortKey))) {
    blocks.push({
      sortKey: r.sortKey,
      lines: [`[${r.left}] <==> [${r.right}] : ${r.label}`]
    });
  }
  for (const fromId of [...byFrom.keys()].sort((a, b) => a.localeCompare(b))) {
    const arr = byFrom.get(fromId);
    const lines = [];
    if (arr.length === 1) {
      const e = arr[0];
      lines.push(`[${e.fromId}] ==> [${e.toId}] : ${e.label}`);
    } else {
      lines.push(`[${fromId}] ==> [${arr[0].toId}] : ${arr[0].label}`);
      const pad = " ".repeat(`[${fromId}] `.length);
      for (let i = 1; i < arr.length; i++) {
        lines.push(`${pad}==> [${arr[i].toId}] : ${arr[i].label}`);
      }
    }
    blocks.push({
      sortKey: `${fromId}\0fan`,
      lines
    });
  }
  blocks.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) out.push("");
    out.push(...blocks[i].lines);
  }
  return out;
}
var sc = (s) => s.replace(/\|/g, " ");
var purTier = (p) => p >= 0.5 ? "High" : p >= 0.28 ? "Med" : "Low";
function formatStatsGrid(direct, total, purity, subfolders, docOut, kwCol, topicCol) {
  return `<| ${direct}/${total} | ${purity.toFixed(2)} (${purTier(purity)}) | ${subfolders} | ${docOut} | ${kwCol} | ${topicCol} |>`;
}
function fmtKwCol(keywords, subTokens, hasChildren) {
  const kw = keywords.slice(0, 8).map(sc).filter(Boolean).join(", ");
  if (hasChildren && subTokens.length > 0) {
    const sub = subTokens.slice(0, 8).map(sc).join(", ");
    return kw ? `sub:${sub} | kw:${kw}` : `sub:${sub}`;
  }
  return kw || "\u2014";
}
function fmtTopicCol(weighted, topics) {
  const t = weighted.trim() || topics.slice(0, 4).join(", ");
  return t ? sc(t) : "\u2014";
}
function nodeTreeLine(id, displayName, depth, bold, stats, endpointIds) {
  const indent = "  ".repeat(Math.max(0, depth - 1));
  const name = displayName.endsWith("/") ? displayName.slice(0, -1) : displayName;
  const label = bold ? `**${name}/**` : `${name}/`;
  const hi = endpointIds.has(id) ? " `[==>]`" : "";
  return `${indent}${id} ${label} ${stats}${hi}`;
}
var COLUMN_LEGEND = [
  "## Column legend (stats grid)",
  "",
  "`<| direct/total | topic purity (tier) | subfolders | doc-out | keywords | topics |>`",
  "",
  "- **direct/total** \u2014 Notes directly in this folder / all indexed notes in this folder subtree (recursive).",
  "- **topic purity (tier)** \u2014 Herfindahl concentration on **topic** tags of direct files only; tier High / Med / Low.",
  "- **subfolders** \u2014 Immediate child folder count (always **0** on `V-###` virtual rows).",
  "- **doc-out** \u2014 Outgoing wiki-style doc links: materialized on the folder node, or summed over member notes for virtual rows.",
  "- **keywords** \u2014 `sub:` tokens from immediate child folder names; `kw:` keyword tags from direct files (after global de-noising).",
  "- **topics** \u2014 Topic tags from direct files; may show weighted `name(%)` when available.",
  "- **`[==>]`** \u2014 This `F-###` or `V-###` is an endpoint of at least one High-Speed Link in the section below.",
  ""
];
function renderBackboneMarkdown(options) {
  const { folderNodes, virtualNodes, backboneEdges, maxNodesPerPage, noiseTagLegendLines = [] } = options;
  const edgesOrdered = [...backboneEdges].sort((a, b) => a.fromId.localeCompare(b.fromId) || b.weight - a.weight || a.toId.localeCompare(b.toId));
  const endpointIds = /* @__PURE__ */ new Set();
  for (const e of edgesOrdered) {
    endpointIds.add(e.fromId);
    endpointIds.add(e.toId);
  }
  const virtualByParent = /* @__PURE__ */ new Map();
  for (const v of virtualNodes) {
    const p = normalizeVaultPath(v.parentFolderPath);
    const arr = virtualByParent.get(p) ?? [];
    arr.push(v);
    virtualByParent.set(p, arr);
  }
  for (const arr of virtualByParent.values()) arr.sort((a, b) => a.id.localeCompare(b.id));
  const treeLines = ["# Folder Tree", ""];
  if (noiseTagLegendLines.length > 0) {
    treeLines.push("## Global status & high-frequency tags (not shown in folder rows)", "", noiseTagLegendLines.join(", "), "");
  }
  treeLines.push(...COLUMN_LEGEND);
  for (const f of folderNodes) {
    const stats = formatStatsGrid(
      f.directDocCount,
      f.docCount,
      f.topicPurity,
      f.childFolderCount,
      f.docOutgoing,
      fmtKwCol(f.topKeywords, f.subfolderNameTokenSample, f.childFolderCount > 0),
      fmtTopicCol(f.topTopicsWeighted, f.topTopics)
    );
    treeLines.push(nodeTreeLine(f.id, f.displayName, f.depth, f.isCity, stats, endpointIds));
    const kids = virtualByParent.get(normalizeVaultPath(f.path));
    if (kids?.length) {
      for (const v of kids) {
        const vs = formatStatsGrid(
          v.memberCount,
          v.parentDirectDocCount,
          v.topicPurity,
          0,
          v.docOutgoing,
          v.topKeywords.slice(0, 8).map(sc).filter(Boolean).join(", ") || "\u2014",
          fmtTopicCol(v.topTopicsWeighted, v.topTopics)
        );
        treeLines.push(nodeTreeLine(v.id, v.displayName, f.depth + 1, true, vs, endpointIds));
      }
    }
  }
  const highwayBody = buildHighwayBodyLines(edgesOrdered);
  const highwayLines = ["", "# High-Speed Links (The Backbone)", "", ...highwayBody];
  const fullMarkdown = [...treeLines, ...highwayLines].join("\n");
  const lim = Math.max(40, Math.min(500, maxNodesPerPage));
  const pageBodies = [];
  for (let i = 0; i < treeLines.length; i += lim) {
    pageBodies.push(treeLines.slice(i, i + lim).join("\n"));
  }
  const totalPages = Math.max(1, pageBodies.length);
  const pages = pageBodies.map((markdown, pageIndex) => ({
    pageIndex,
    totalPages,
    markdown: pageIndex === totalPages - 1 ? `${markdown}
${highwayLines.join("\n")}` : `${markdown}

_(continued\u2026)_
`
  }));
  return { markdown: fullMarkdown, pages };
}
function markCities(folderNodes, cityPercentile) {
  if (folderNodes.length === 0) return;
  const sorted = [...folderNodes].sort((a, b) => b.pageRankMass - a.pageRankMass);
  const n = Math.max(1, Math.ceil(sorted.length * Math.min(0.5, Math.max(0.01, cityPercentile))));
  const threshold = sorted[n - 1].pageRankMass;
  for (const f of folderNodes) {
    f.cityScore = f.pageRankMass;
    f.isCity = f.pageRankMass > 0 && f.pageRankMass >= threshold;
  }
}
async function buildBackboneMap(options) {
  const maxDepth = options?.maxDepth ?? 10;
  const maxFolders = options?.maxFolders ?? 8e3;
  const maxNodesPerPage = options?.maxNodesPerPage ?? 120;
  const topBackboneEdges = options?.topBackboneEdges ?? 32;
  const cityPercentile = options?.cityPercentile ?? 0.05;
  const enableVirtualFolders = options?.enableVirtualFolders ?? true;
  const extraExclude = (options?.extraExcludePathPrefixes ?? []).map((p) => normalizeVaultPath(String(p)));
  const empty = {
    folderNodes: [],
    virtualNodes: [],
    backboneEdges: [],
    metrics: {
      totalFolders: 0,
      totalVirtualNodes: 0,
      totalIndexedDocuments: 0,
      backboneEdgeCount: 0,
      cityFolderCount: 0
    },
    markdown: "_SQLite index not ready; backbone map is empty._\n",
    pages: [],
    noiseTagLegend: [],
    debug: { folderIdByPath: {}, docCount: 0, edgeWeightSamples: [] }
  };
  if (!sqliteStoreManager.isInitialized()) {
    return empty;
  }
  const vault = AppContext.getInstance().app.vault;
  const root = vault.getRoot();
  const excluded = [...getBackboneExcludedPrefixes(), ...extraExclude.filter(Boolean)];
  const { rows, subtreeStats } = scanFolderTree(root, maxDepth, maxFolders, excluded);
  const { folderNodes, recursiveMapsByFolder, tagGlobalStats } = await loadBackboneFolderNodes(
    rows,
    excluded,
    subtreeStats
  );
  const allDocIds = /* @__PURE__ */ new Set();
  const nodeIdToPath = /* @__PURE__ */ new Map();
  for (const maps of recursiveMapsByFolder.values()) {
    for (const m of maps) {
      allDocIds.add(m.id);
      nodeIdToPath.set(m.id, m.path);
    }
  }
  const virtualNodes = await buildVirtualNodesForMessyFolders(folderNodes, enableVirtualFolders, tagGlobalStats);
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const virtualMemberRows = /* @__PURE__ */ new Map();
  for (const v of virtualNodes) {
    const idRows = await indexedDocumentRepo.getIdsByPaths(v.memberDocPaths);
    virtualMemberRows.set(v.id, idRows);
    for (const r of idRows) {
      allDocIds.add(r.id);
      nodeIdToPath.set(r.id, r.path);
    }
    const memberIds = idRows.map((r) => r.id);
    v.docOutgoing = await mobiusNodeRepo.sumDocumentOutgoingByNodeIds(memberIds);
  }
  const prMap = await loadDocPageranks([...allDocIds]);
  for (const f of folderNodes) {
    const maps = recursiveMapsByFolder.get(normalizeVaultPath(f.path)) ?? [];
    let mass = 0;
    let smass = 0;
    for (const m of maps) {
      const p = prMap.get(m.id);
      mass += p?.pr ?? 0;
      smass += p?.spr ?? 0;
    }
    f.pageRankMass = mass;
    f.semanticPageRankMass = smass;
  }
  for (const v of virtualNodes) {
    const idRows = virtualMemberRows.get(v.id) ?? [];
    v.pageRankMass = idRows.reduce((s, r) => s + (prMap.get(r.id)?.pr ?? 0), 0);
  }
  markCities(folderNodes, cityPercentile);
  const resolver = buildSupernodeResolver(folderNodes, virtualNodes);
  const { edges: backboneEdges, pairCount } = await buildBackboneEdges({
    validDocIdSet: allDocIds,
    nodeIdToPath,
    prMap,
    resolver,
    topK: topBackboneEdges
  });
  const noiseTagLegendLines = buildVaultNoiseTagLegend(tagGlobalStats);
  const { markdown, pages } = renderBackboneMarkdown({
    folderNodes,
    virtualNodes,
    backboneEdges,
    maxNodesPerPage,
    noiseTagLegendLines
  });
  let totalIndexedDocuments = allDocIds.size;
  try {
    totalIndexedDocuments = await sqliteStoreManager.getMobiusNodeRepo().countAllDocumentStatisticsRows();
  } catch {
  }
  const folderIdByPath = {};
  for (const f of folderNodes) {
    folderIdByPath[normalizeVaultPath(f.path)] = f.id;
  }
  return {
    folderNodes,
    virtualNodes,
    backboneEdges,
    metrics: {
      totalFolders: folderNodes.length,
      totalVirtualNodes: virtualNodes.length,
      totalIndexedDocuments,
      backboneEdgeCount: backboneEdges.length,
      cityFolderCount: folderNodes.filter((f) => f.isCity).length
    },
    markdown,
    pages,
    noiseTagLegend: noiseTagLegendLines,
    debug: {
      folderIdByPath,
      docCount: allDocIds.size,
      pairCountBeforeTopK: pairCount,
      edgeWeightSamples: backboneEdges.slice(0, 16).map((e) => ({
        fromId: e.fromId,
        toId: e.toId,
        weight: e.weight,
        referenceCount: e.referenceCount,
        semanticWeightSum: e.semanticWeightSum
      }))
    }
  };
}

// src/service/agents/intuition-helper/intuitionPrep.ts
var BACKBONE_MARKDOWN_EXCERPT_MAX = 14e3;
var PLAN_FOLDER_DIGEST_MAX = 80;
var PLAN_DEEP_FOLDER_DIGEST_MAX = 48;
var PLAN_DOC_SHORTLIST_MAX = 80;
var HUB_DIGEST_NAME_TOKEN_TOP = 6;
function computeHubDiscoverBudgets(documentNodeCount) {
  const n = Math.max(0, Math.floor(documentNodeCount));
  const raw = Math.floor(Math.sqrt(n) * HUB_DISCOVER_LIMIT_SQRT_SCALE);
  const limitTotal = Math.max(HUB_DISCOVER_LIMIT_MIN, Math.min(HUB_DISCOVER_LIMIT_MAX, raw));
  const documentFetchLimit = Math.max(1, Math.ceil(limitTotal * 1.8));
  const folderFetchLimit = Math.max(1, Math.ceil(limitTotal * 0.6));
  const clusterLimit = Math.max(1, Math.ceil(limitTotal * 0.35));
  const topDocExcludeLimit = Math.max(1, Math.ceil(limitTotal * 0.4));
  const clusterSeedFetchLimit = Math.min(120, Math.max(20, topDocExcludeLimit + clusterLimit * 3));
  return { limitTotal, documentFetchLimit, folderFetchLimit, clusterLimit, topDocExcludeLimit, clusterSeedFetchLimit };
}
var getExploreFolderExcludedPrefixes = getBackboneExcludedPrefixes;
function sanitizeDigestCell(text) {
  return text.replace(/\|/g, " ");
}
function compactTokenSampleList(tokens, maxChars) {
  if (!tokens.length) return "\u2014";
  const s = tokens.join(", ");
  const t = s.length <= maxChars ? s : `${s.slice(0, Math.max(0, maxChars - 1))}\u2026`;
  return sanitizeDigestCell(t);
}
function formatTopWeightedTopics2(topicTagCounts, keywordTagCounts, maxTopics) {
  const merged = /* @__PURE__ */ new Map();
  for (const [k, v] of topicTagCounts) merged.set(k, (merged.get(k) ?? 0) + v);
  for (const [k, v] of keywordTagCounts) merged.set(k, (merged.get(k) ?? 0) + v);
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return "";
  return [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTopics).map(([name, c]) => `${name}(${Math.round(100 * c / total)}%)`).join(", ");
}
async function chunkPages(nodes, maxNodesPerPage, tm) {
  const lim = Math.max(64, Math.min(2e3, Math.max(1, Math.floor(maxNodesPerPage))));
  if (nodes.length === 0) {
    const compactTreeMarkdown = await tm.render(IndexingTemplateId.HubDiscoveryFolderTreeEmpty, {});
    return [{ pageId: "folder-page-empty", pageIndex: 0, totalPages: 1, compactTreeMarkdown, pathsOnPage: [] }];
  }
  const pages = [];
  for (let i = 0; i < nodes.length; i += lim) {
    const slice = nodes.slice(i, i + lim);
    const pageIndex = pages.length;
    const compactTreeMarkdown = await tm.render(IndexingTemplateId.HubDiscoveryFolderTreePage, {
      folderRows: slice.map((n) => ({
        displayName: n.name || basenameFromPath(n.path) || n.path,
        depthMinusOne: Math.max(0, n.depth - 1),
        docCount: n.docCount,
        topKeywords: n.topKeywords,
        topTopics: n.topTopics,
        docOutgoing: n.docOutgoing,
        docIncoming: n.docIncoming,
        childFolderCount: n.childFolderCount,
        subtreeMaxDepth: n.subtreeMaxDepth,
        subtreeAvgDepthDisplay: n.subtreeAvgDepth.toFixed(1),
        fileTokenSampleCompact: compactTokenSampleList(n.fileNameTokenSample, 120),
        subfolderTokenSampleCompact: compactTokenSampleList(n.subfolderNameTokenSample, 120)
      }))
    });
    pages.push({ pageId: `folder-page-${pageIndex}`, pageIndex, totalPages: 0, compactTreeMarkdown, pathsOnPage: slice.map((n) => n.path) });
  }
  const nPages = pages.length;
  for (const p of pages) p.totalPages = nPages;
  return pages;
}
async function buildWorldMetrics(nodes) {
  const vault = AppContext.getInstance().app.vault;
  const root = vault.getRoot();
  const topLevelBranchCount = root.children.filter((c) => c instanceof import_obsidian9.TFolder).length;
  let totalIndexedDocuments = 0;
  let orphanHardSampleCount = 0;
  if (sqliteStoreManager.isInitialized()) {
    totalIndexedDocuments = await sqliteStoreManager.getMobiusNodeRepo().countAllDocumentStatisticsRows();
    const orphanIds = await sqliteStoreManager.getMobiusEdgeRepo().getHardOrphanNodeIds(3e3);
    orphanHardSampleCount = orphanIds.length;
  }
  const topOutgoingFolders = [...nodes].map((n) => ({ path: n.path, outgoing: n.docOutgoing })).sort((a, b) => b.outgoing - a.outgoing).slice(0, 12);
  let orphanRiskHint = "low";
  if (totalIndexedDocuments > 0) {
    const ratio = orphanHardSampleCount / Math.min(totalIndexedDocuments, 3e3);
    if (ratio > 0.15) orphanRiskHint = "high";
    else if (ratio > 0.05) orphanRiskHint = "medium";
  }
  return { totalIndexedDocuments, totalFoldersScanned: nodes.length, topLevelBranchCount, orphanHardSampleCount, orphanRiskHint, topOutgoingFolders };
}
async function buildHubWorldSnapshot(options, templateManager) {
  const { maxDepth, maxFolders, maxNodesPerPage, extraExcludePathPrefixes = [] } = options;
  if (!sqliteStoreManager.isInitialized()) {
    return { pages: [], metrics: { totalIndexedDocuments: 0, totalFoldersScanned: 0, topLevelBranchCount: 0, orphanHardSampleCount: 0, orphanRiskHint: "low", topOutgoingFolders: [] }, nodes: [] };
  }
  const vault = AppContext.getInstance().app.vault;
  const root = vault.getRoot();
  const excluded = [...getExploreFolderExcludedPrefixes(), ...extraExcludePathPrefixes.map((p) => normalizeVaultFolderPath2(p))];
  const { rows, subtreeStats: subtreeStatsMap } = scanFolderTree(root, maxDepth, maxFolders, excluded);
  const paths = rows.map((r) => r.path);
  const degreeMap = await sqliteStoreManager.getMobiusNodeRepo().listFolderDocDegreesByVaultPaths(paths);
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const graphRepo = sqliteStoreManager.getGraphRepo();
  const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo();
  const nodes = [];
  for (const row of rows) {
    const np = normalizeVaultPath(row.path);
    const deg = degreeMap.get(np) ?? { incoming: 0, outgoing: 0 };
    let docCount = 0;
    let topKeywords = [];
    let topTopics = [];
    let topTopicsWeighted;
    let maps = [];
    try {
      maps = await indexedDocumentRepo.getIdsByFolderPath(row.path);
      docCount = maps.length;
      if (docCount > 0) {
        const docIds = maps.map((m) => m.id);
        const { topicTagCounts, keywordTagCounts } = await graphRepo.getTagsByDocIds(docIds);
        topTopics = [...topicTagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
        topKeywords = [...keywordTagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
        const weighted = formatTopWeightedTopics2(topicTagCounts, keywordTagCounts, 3);
        if (weighted) topTopicsWeighted = weighted;
      }
    } catch {
      docCount = 0;
      maps = [];
    }
    let directDocCount = 0;
    try {
      directDocCount = await indexedDocumentRepo.countDirectDocumentsInFolder(row.path);
    } catch {
      directDocCount = 0;
    }
    const fileBasenames = maps.map((m) => basenameFromPath(m.path));
    const fileNameTokenSample = fileBasenames.length > 0 ? topTokensFromBasenames(fileBasenames, HUB_DIGEST_NAME_TOKEN_TOP) : [];
    let subfolderNameTokenSample = [];
    if (row.childFolderCount > 0) {
      const af = vault.getAbstractFileByPath(row.path);
      if (af instanceof import_obsidian9.TFolder) {
        const childNames = visibleChildFolders(af, excluded).map((f) => basenameFromPath(f.path));
        subfolderNameTokenSample = topTokensFromBasenames(childNames, HUB_DIGEST_NAME_TOKEN_TOP);
      }
    }
    const st = subtreeStatsMap.get(np);
    nodes.push({
      path: row.path,
      name: basenameFromPath(row.path),
      depth: row.depth,
      childFolderCount: row.childFolderCount,
      subtreeMaxDepth: st?.subtreeMaxDepth ?? row.depth,
      subtreeAvgDepth: st?.subtreeAvgDepth ?? row.depth,
      docCount,
      directDocCount,
      topKeywords,
      topTopics,
      topTopicsWeighted,
      docOutgoing: deg.outgoing,
      docIncoming: deg.incoming,
      fileNameTokenSample,
      subfolderNameTokenSample
    });
  }
  const hubFolder = getAIHubSummaryFolder();
  let folderRows = [];
  try {
    folderRows = await mobiusRepo.listFolderHubDiscoveryRowsByPaths(paths, hubFolder, { relaxMinDocs: true });
  } catch {
    folderRows = [];
  }
  const folderRowByPath = new Map(folderRows.map((r) => [normalizeVaultPath(String(r.path ?? "")), r]));
  for (const n of nodes) {
    const np = normalizeVaultPath(n.path);
    const fr = folderRowByPath.get(np);
    if (fr && typeof fr.hub_graph_score === "number") n.hubGraphScore = fr.hub_graph_score;
  }
  const metrics = await buildWorldMetrics(nodes);
  const pages = await chunkPages(nodes, maxNodesPerPage, templateManager);
  return { pages, metrics, nodes };
}
async function buildDocumentHubShortlist(limit) {
  if (!sqliteStoreManager.isInitialized()) return [];
  const hubFolder = getAIHubSummaryFolder();
  const rows = await sqliteStoreManager.getMobiusNodeRepo().listTopDocumentNodesForHubDiscovery(Math.max(1, limit), hubFolder);
  return rows.map((r) => ({
    path: String(r.path ?? ""),
    label: String(r.label ?? ""),
    hubGraphScore: typeof r.hub_graph_score === "number" ? r.hub_graph_score : 0,
    docIncoming: Math.max(0, Math.floor(Number(r.doc_incoming_cnt ?? 0))),
    docOutgoing: Math.max(0, Math.floor(Number(r.doc_outgoing_cnt ?? 0)))
  }));
}
function purityDigestCell(n) {
  const p = n.topicPurity;
  if (p === void 0 || Number.isNaN(p)) return "\u2014";
  const tier = p >= 0.65 ? "High" : p >= 0.35 ? "Med" : "Low";
  return `${p.toFixed(2)} (${tier})`;
}
function containerDigestCell(n) {
  if (n.containerPenalty === void 0 && n.strongChildDocShare === void 0 && n.residualRatio === void 0) return "\u2014";
  const pen = n.containerPenalty !== void 0 ? n.containerPenalty.toFixed(2) : "\u2014";
  const sc2 = n.strongChildDocShare !== void 0 ? `${Math.round(n.strongChildDocShare * 100)}%` : "\u2014";
  const res = n.residualRatio !== void 0 ? `${Math.round(n.residualRatio * 100)}%` : "\u2014";
  return `pen ${pen} \xB7 child ${sc2} \xB7 res ${res}`;
}
function rankDigestCell(n) {
  const fr = n.folderRank;
  const hg = n.hubGraphScore;
  if (fr !== void 0 && hg !== void 0) return `${fr.toFixed(2)} / ${hg.toFixed(2)}`;
  if (fr !== void 0) return fr.toFixed(2);
  if (hg !== void 0) return hg.toFixed(2);
  return "\u2014";
}
function compareFolderDigestRows(a, b) {
  const ra = a.folderRank ?? a.hubGraphScore ?? 0;
  const rb = b.folderRank ?? b.hubGraphScore ?? 0;
  if (rb !== ra) return rb - ra;
  const pa = a.topicPurity ?? 0;
  const pb = b.topicPurity ?? 0;
  if (pb !== pa) return pb - pa;
  return (a.containerPenalty ?? 0) - (b.containerPenalty ?? 0) || b.docCount - a.docCount;
}
function buildFolderDigestMarkdown(nodes, maxLines) {
  const sorted = [...nodes].sort(compareFolderDigestRows);
  const lines = sorted.slice(0, maxLines).map((n) => {
    const dt = `${n.directDocCount}/${n.docCount}`;
    const topics = n.topTopicsWeighted?.trim() || n.topTopics.slice(0, 3).join(", ") || "\u2014";
    const safe = (s) => s.replace(/\|/g, " ");
    return `| \`${n.path}\` | ${n.depth} | ${dt} | ${purityDigestCell(n)} | ${containerDigestCell(n)} | ${rankDigestCell(n)} | ${safe(topics)} | in ${n.docIncoming} / out ${n.docOutgoing} |`;
  });
  return [
    "| Path | Depth | Docs (direct/total) | Purity | Container | Rank (fr / hub) | Top topics (weighted) | Degrees (in/out) |",
    "| --- | ---: | --- | --- | --- | --- | --- | ---: |",
    ...lines
  ].join("\n");
}
function buildDeepFolderDigestMarkdown(nodes, maxLines) {
  const scored = nodes.filter((n) => n.depth >= 3).map((n) => ({
    node: n,
    score: (n.folderRank ?? n.hubGraphScore ?? 0) * 140 + (n.topicPurity ?? 0) * 55 + n.docCount * 0.45 + n.docOutgoing * 0.1 + Math.max(0, n.depth - 2) * 12 + Math.max(0, n.childFolderCount - 1) * 4 - (n.containerPenalty ?? 0) * 30
  })).sort((a, b) => b.score - a.score || compareFolderDigestRows(a.node, b.node));
  const lines = scored.slice(0, maxLines).map(({ node: n }) => {
    const keywords = n.topKeywords.slice(0, 6).join(", ") || "\u2014";
    const topics = n.topTopicsWeighted?.trim() || n.topTopics.slice(0, 4).join(", ") || "\u2014";
    const safe = (s) => s.replace(/\|/g, " ");
    return `| \`${n.path}\` | ${n.depth} | ${n.directDocCount}/${n.docCount} | ${purityDigestCell(n)} | ${n.childFolderCount} | ${n.docOutgoing} | ${safe(keywords)} | ${safe(topics)} |`;
  });
  if (lines.length === 0) return "_(No depth >= 3 folder candidates found in snapshot.)_";
  return [
    "| Path | Depth | Docs (d/t) | Purity | Subdirs | Out | Keywords | Topics |",
    "| --- | ---: | --- | --- | ---: | ---: | --- | --- |",
    ...lines
  ].join("\n");
}
function buildFolderTreePagesMarkdown(world) {
  if (world.pages.length === 0) return "_(No folder tree pages available.)_";
  return world.pages.map((p) => `### Folder tree page ${p.pageIndex + 1}/${p.totalPages}

${p.compactTreeMarkdown}`).join("\n\n");
}
function buildBackboneEdgesJson(backbone) {
  const edges = backbone.backboneEdges.slice(0, 24).map((e) => ({
    fromId: e.fromId,
    toId: e.toId,
    fromLabel: e.fromLabel,
    toLabel: e.toLabel,
    label: e.label,
    weight: e.weight,
    referenceCount: e.referenceCount
  }));
  return JSON.stringify(edges);
}
function buildVaultSummaryMarkdown(world, backbone, indexBudgetRaw) {
  const m = world.metrics;
  const b = backbone.metrics;
  const topOut = m.topOutgoingFolders.slice(0, 3).map((x) => `\`${x.path}\` (${x.outgoing})`).join(", ");
  return [
    `- Indexed documents (world): ${m.totalIndexedDocuments}`,
    `- Folders scanned (world): ${m.totalFoldersScanned}`,
    `- Top-level branches: ${m.topLevelBranchCount}`,
    `- Orphan risk: ${m.orphanRiskHint} (hard samples: ${m.orphanHardSampleCount})`,
    `- Top outgoing folders: ${topOut || "\u2014"}`,
    `- Backbone: folders ${b.totalFolders}, virtual nodes ${b.totalVirtualNodes}, backbone edges ${b.backboneEdgeCount}, city folders ${b.cityFolderCount}`,
    `- Indexed documents (backbone): ${b.totalIndexedDocuments}`,
    `- Index budget limitTotal: ${indexBudgetRaw.limitTotal}`
  ].join("\n");
}
function buildBackboneEdgesMarkdown(backbone) {
  const edges = backbone.backboneEdges.slice(0, 24);
  if (edges.length === 0) return "_(No backbone edges in excerpt.)_";
  return edges.map((e) => {
    const w = typeof e.weight === "number" && !Number.isNaN(e.weight) ? e.weight.toFixed(3) : String(e.weight);
    return `- ${e.fromLabel} \u2192 ${e.toLabel} \xB7 w ${w} \xB7 refs ${e.referenceCount} \xB7 ${e.label}`;
  }).join("\n");
}
function buildDocumentShortlistMarkdown(rows, maxLines) {
  if (rows.length === 0) return "_(No document shortlist; index may be empty.)_";
  return rows.slice(0, maxLines).map(
    (r) => `- \`${r.path}\` \xB7 hub ${r.hubGraphScore.toFixed(2)} \xB7 in/out ${r.docIncoming}/${r.docOutgoing} \xB7 ${r.label}`
  ).join("\n");
}
function buildBaselineExcludedMarkdown(prefixes) {
  if (prefixes.length === 0) return "_(none)_";
  return prefixes.map((p) => `- \`${p}\``).join("\n");
}
function computeEntryPointsTargetCount(foldersScanned) {
  const r = Math.round(foldersScanned / 11);
  return Math.min(24, Math.max(4, r));
}
function buildVaultScaleHintMarkdown(world, backbone) {
  const m = world.metrics;
  const b = backbone.metrics;
  const f = m.totalFoldersScanned;
  const n = computeEntryPointsTargetCount(f);
  return [
    `- **Folders scanned** (snapshot) = **F**: ${f}`,
    `- **Target entry point count N** (host-computed): **${n}** \u2014 emit **exactly ${n}** distinct \`entryPoints\` objects.`,
    `- **Indexed documents** (world): ${m.totalIndexedDocuments}`,
    `- **Top-level branches**: ${m.topLevelBranchCount}`,
    `- **Backbone folder nodes** (map): ${b.totalFolders}`,
    `- **City folders** (navigation hubs): ${b.cityFolderCount}`
  ].join("\n");
}
function buildFolderSignalsMarkdown(folderTable, deepTable) {
  return [
    "### Ranked folders (sample)",
    "",
    folderTable,
    "",
    "### Deep folder candidates (depth \u2265 3)",
    "",
    deepTable
  ].join("\n");
}
async function prepareIntuitionContext(options) {
  const { userGoal, vaultName, currentDateLabel, tm } = options;
  const documentNodeCount = sqliteStoreManager.isInitialized() ? await sqliteStoreManager.getMobiusNodeRepo().countAllDocumentStatisticsRows() : 0;
  const indexBudgetRaw = computeHubDiscoverBudgets(documentNodeCount);
  const { limitTotal, documentFetchLimit, folderFetchLimit } = indexBudgetRaw;
  const globalTreeMaxDepth = Math.min(10, Math.max(6, 6 + Math.floor(limitTotal / 100)));
  const maxFoldersInSnapshot = Math.min(8e3, Math.max(400, Math.floor(folderFetchLimit * 28)));
  const maxNodesPerPage = Math.min(2e3, Math.max(320, Math.floor(limitTotal * 7)));
  const docShortlistLimit = Math.min(500, Math.max(50, Math.floor(documentFetchLimit * 2)));
  const baselineExcludedPrefixes = getExploreFolderExcludedPrefixes();
  const world = await buildHubWorldSnapshot(
    {
      maxDepth: globalTreeMaxDepth,
      maxFolders: maxFoldersInSnapshot,
      maxNodesPerPage,
      extraExcludePathPrefixes: []
    },
    tm
  );
  const backbone = await buildBackboneMap({
    maxDepth: globalTreeMaxDepth,
    maxFolders: maxFoldersInSnapshot,
    maxNodesPerPage,
    topBackboneEdges: Math.min(48, Math.max(16, Math.floor(limitTotal / 8))),
    extraExcludePathPrefixes: []
  });
  const documentShortlist = await buildDocumentHubShortlist(docShortlistLimit);
  const folderDigestMarkdown = buildFolderDigestMarkdown(world.nodes, PLAN_FOLDER_DIGEST_MAX);
  const deepFolderDigestMarkdown = buildDeepFolderDigestMarkdown(world.nodes, PLAN_DEEP_FOLDER_DIGEST_MAX);
  const folderSignalsMarkdown = buildFolderSignalsMarkdown(folderDigestMarkdown, deepFolderDigestMarkdown);
  const folderTreeMarkdown = buildFolderTreePagesMarkdown(world);
  const backboneMarkdownExcerpt = backbone.markdown.length <= BACKBONE_MARKDOWN_EXCERPT_MAX ? backbone.markdown : `${backbone.markdown.slice(0, BACKBONE_MARKDOWN_EXCERPT_MAX)}

_(truncated)_`;
  const backboneEdgesJson = buildBackboneEdgesJson(backbone);
  const backboneEdgesMarkdown = buildBackboneEdgesMarkdown(backbone);
  const vaultSummaryMarkdown = buildVaultSummaryMarkdown(world, backbone, indexBudgetRaw);
  const documentShortlistMarkdown = buildDocumentShortlistMarkdown(documentShortlist, PLAN_DOC_SHORTLIST_MAX);
  const baselineExcludedMarkdown = buildBaselineExcludedMarkdown(baselineExcludedPrefixes);
  const vaultScaleHintMarkdown = buildVaultScaleHintMarkdown(world, backbone);
  const worldMetricsForPrompt = {
    ...world.metrics,
    indexBudgetRaw,
    backboneMetrics: backbone.metrics
  };
  return {
    tm,
    userGoal,
    vaultName,
    currentDateLabel,
    baselineExcludedPrefixes,
    worldMetricsForPrompt,
    backbone,
    world,
    documentShortlist,
    folderSignalsMarkdown,
    vaultSummaryMarkdown,
    backboneEdgesMarkdown,
    documentShortlistMarkdown,
    baselineExcludedMarkdown,
    vaultScaleHintMarkdown,
    folderTreeMarkdown,
    backboneMarkdownExcerpt,
    backboneEdgesJson,
    indexBudgetRaw
  };
}

// src/service/agents/KnowledgeIntuitionAgent.ts
var KnowledgeIntuitionPrepAbortError = class extends Error {
  constructor(partialResult) {
    super("KnowledgeIntuitionPrepAbortError: prep_only");
    this.partialResult = partialResult;
    this.name = "KnowledgeIntuitionPrepAbortError";
  }
};
var KnowledgeIntuitionAgent = class {
  constructor(aiServiceManager) {
    this.aiServiceManager = aiServiceManager;
  }
  resetSession() {
    this.intuitionMemory = void 0;
  }
  async buildPrepOnlyResult(ctx) {
    const memory = buildInitialIntuitionMemory();
    const markdown = (await ctx.tm.render(IndexingTemplateId.KnowledgeIntuitionPrepOnlyMarkdown, {
      vaultName: ctx.vaultName,
      dateLabel: ctx.currentDateLabel,
      backboneExcerpt: ctx.backboneMarkdownExcerpt.slice(0, 6e3)
    })).trim();
    const json = renderIntuitionSkeletonJson(memory, {
      vaultName: ctx.vaultName,
      dateLabel: ctx.currentDateLabel
    });
    return { prep: ctx, memory, markdown, json };
  }
  resolveDebug(options) {
    if (options.maxIterations == null) return void 0;
    return { maxIterations: Math.max(1, Math.min(6, Math.floor(options.maxIterations))) };
  }
  async prepareContext(options) {
    const tm = this.aiServiceManager.getTemplateManager?.();
    if (!tm) {
      throw new Error("KnowledgeIntuitionAgent requires TemplateManager (plugin templates not loaded).");
    }
    const trimmedGoal = options.userGoal?.trim();
    const userGoal = trimmedGoal || (await tm.render(IndexingTemplateId.KnowledgeIntuitionDefaultUserGoal, {})).trim();
    if (!userGoal) {
      throw new Error(
        "KnowledgeIntuitionAgent: userGoal is empty and default user-goal template rendered empty."
      );
    }
    const vaultName = options.vaultName?.trim() || "Vault";
    const currentDateLabel = options.currentDateLabel?.trim() || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    return prepareIntuitionContext({
      userGoal,
      vaultName,
      currentDateLabel,
      tm
    });
  }
  async finalizeResult(ctx, memory) {
    const markdown = await renderIntuitionSkeletonMarkdown(ctx.tm, memory, {
      vaultName: ctx.vaultName,
      dateLabel: ctx.currentDateLabel
    });
    const json = renderIntuitionSkeletonJson(memory, {
      vaultName: ctx.vaultName,
      dateLabel: ctx.currentDateLabel
    });
    return { prep: ctx, memory, markdown, json };
  }
  async *runPipeline(options) {
    this.resetSession();
    const ctx = await this.prepareContext(options);
    const stepId = generateUuidWithoutHyphens();
    if (options.stopAt === "prep") {
      yield {
        type: "pk-debug",
        debugName: "KnowledgeIntuitionAgent prep snapshot (raw)",
        extra: {
          stopAt: "prep",
          userGoal: ctx.userGoal,
          metrics: ctx.world.metrics,
          backboneMetrics: ctx.backbone.metrics,
          folderTreeNodeCount: ctx.world.nodes.length
        }
      };
      const partial = await this.buildPrepOnlyResult(ctx);
      throw new KnowledgeIntuitionPrepAbortError(partial);
    }
    let memory;
    yield* runKnowledgeIntuitionLoop({
      ctx,
      stepId,
      aiServiceManager: this.aiServiceManager,
      debug: this.resolveDebug(options),
      onComplete: (m) => {
        memory = m;
        this.intuitionMemory = m;
      }
    });
    if (!memory) {
      throw new Error("KnowledgeIntuitionAgent: recon finished without memory (onComplete not invoked).");
    }
    return await this.finalizeResult(ctx, memory);
  }
  async *streamRun(options = {}, onFinish) {
    const ctx = AppContext.getInstance();
    if (ctx.isMockEnv) {
      yield {
        type: "pk-debug",
        debugName: "KnowledgeIntuitionAgent skipped (mock env)",
        extra: {}
      };
      const emptyMemory = buildInitialIntuitionMemory();
      const mockResult = {
        prep: {},
        memory: emptyMemory,
        markdown: "_KnowledgeIntuitionAgent skipped (mock env)_\n",
        json: {
          version: "2026.05",
          theme: "",
          partitions: [],
          core_entities: [],
          topology: [],
          evolution: "",
          entry_points: []
        }
      };
      onFinish?.(mockResult);
      return;
    }
    yield {
      type: "pk-debug",
      debugName: "KnowledgeIntuitionAgent start",
      extra: {
        hasUserGoal: Boolean(options.userGoal?.trim()),
        stopAt: options.stopAt ?? "full",
        maxIterations: options.maxIterations
      }
    };
    let result;
    try {
      result = yield* this.runPipeline(options);
    } catch (err) {
      if (err instanceof KnowledgeIntuitionPrepAbortError) {
        yield {
          type: "pk-debug",
          debugName: "KnowledgeIntuitionAgent pipeline abort (prep)",
          extra: { partialResult: err.partialResult }
        };
        this.intuitionMemory = err.partialResult.memory;
        onFinish?.(err.partialResult);
        return;
      }
      throw err;
    }
    yield {
      type: "pk-debug",
      debugName: "KnowledgeIntuitionAgent complete",
      extra: {
        partitionCount: result.memory.partitions.length,
        entityCount: result.memory.coreEntities.length,
        topologyCount: result.memory.topology.length,
        markdownChars: result.markdown.length
      }
    };
    onFinish?.(result);
  }
};

// src/app/context/test-tools.ts
var GraphInspectorTestTools = class {
  constructor() {
    this.tools = {
      inspect_note_context: inspectNoteContextTool(),
      graph_traversal: graphTraversalTool(),
      find_path: findPathTool(),
      find_key_nodes: findKeyNodesTool(),
      find_orphans: findOrphansTool(),
      search_by_dimensions: searchByDimensionsTool(),
      explore_folder: exploreFolderTool(),
      recent_changes_whole_vault: recentChangesWholeVaultTool(),
      local_search_whole_vault: localSearchWholeVaultTool()
    };
  }
  /**
   * Execute a specific tool
   */
  async executeTool(name, params) {
    try {
      if (!this.tools[name]) {
        throw new Error(`Tool ${name} not found`);
      }
      const result = await this.tools[name].execute(params);
      return result;
    } catch (error) {
      console.error("\u274C Tool execution failed:", error);
      throw error;
    }
  }
  // Convenience methods for each tool
  async inspectNote(notePath, includeSemantic = false, limit = 10, responseFormat = "hybrid") {
    return this.executeTool("inspect_note_context", {
      note_path: notePath,
      limit,
      include_semantic_paths: includeSemantic,
      response_format: responseFormat
    });
  }
  async graphTraversal(startPath, hops = 1, limit = 20, responseFormat = "hybrid", includeSemantic = false, filters = void 0, sorter = void 0) {
    return this.executeTool("graph_traversal", {
      start_note_path: startPath,
      hops,
      limit,
      response_format: responseFormat,
      include_semantic_paths: includeSemantic,
      filters,
      sorter
    });
  }
  async findPath(startPath, endPath, responseFormat = "hybrid", limit = 10, includeSemantic = false) {
    return this.executeTool("find_path", {
      start_note_path: startPath,
      end_note_path: endPath,
      response_format: responseFormat,
      limit,
      include_semantic_paths: includeSemantic
    });
  }
  async findKeyNodes(limit = 20, responseFormat = "hybrid") {
    return this.executeTool("find_key_nodes", {
      limit,
      response_format: responseFormat
    });
  }
  async findOrphans(limit = 20, responseFormat = "hybrid") {
    return this.executeTool("find_orphans", {
      limit,
      response_format: responseFormat
    });
  }
  async searchByDimensions(expression, limit = 20, responseFormat = "hybrid") {
    return this.executeTool("search_by_dimensions", {
      boolean_expression: expression,
      limit,
      response_format: responseFormat
    });
  }
  async exploreFolder(folderPath = "/", recursive = true, maxDepth = 2, responseFormat = "hybrid") {
    return this.executeTool("explore_folder", {
      folderPath,
      recursive,
      max_depth: maxDepth,
      response_format: responseFormat
    });
  }
  async getRecentChanges(limit = 20, responseFormat = "hybrid") {
    return this.executeTool("recent_changes_whole_vault", {
      limit,
      response_format: responseFormat
    });
  }
  async localSearch(query2, searchMode = "hybrid", limit = 20, responseFormat = "hybrid") {
    return this.executeTool("local_search_whole_vault", {
      query: query2,
      searchMode,
      limit,
      response_format: responseFormat
      // Pass flattened params if needed, or let them be undefined
    });
  }
  // Utility methods
  async getAppInfo() {
    const app = AppContext.getInstance().app;
    return {
      vaultName: app.vault.getName(),
      vaultPath: app.vault.getRoot(),
      fileCount: app.vault.getFiles().length,
      plugin: AppContext.getInstance().plugin
    };
  }
  async listAllFiles(limit = 100) {
    const app = AppContext.getInstance().app;
    const files = app.vault.getFiles();
    return files.slice(0, limit).map((f) => ({
      path: f.path,
      name: f.name,
      size: f.stat.size,
      mtime: new Date(f.stat.mtime).toISOString()
    }));
  }
};
async function* streamWithStreamLog(stream) {
  const allLog = [];
  let totalTokenUsage = emptyUsage();
  try {
    for await (const ev of stream) {
      if (!DELTA_EVENT_TYPES.has(ev.type)) {
        allLog.push(ev);
      }
      if (ev.type === "on-step-finish") {
        totalTokenUsage = mergeTokenUsage(totalTokenUsage, ev.usage);
      }
      yield ev;
    }
  } finally {
    allLog.push({ type: "total-token-usage", totalTokenUsage });
  }
}
var AISearchAgentTestTools = class {
  /**
   * Run {@link KnowledgeIntuitionAgent}: backbone + folder digest prep → intuition recon (plan/tools/submit) → fixed markdown + JSON.
   * Also persists the result to SQLite (`knowledge_intuition_json`) so classify/intuitionFeedback phases can use it.
   * Requires indexed SQLite, TemplateManager, and models for knowledge-intuition prompts.
   *
   * @example
   * ```ts
   * await window.testAISearchTools.testKnowledgeIntuition({ userGoal: 'Map this vault for navigation' });
   * await window.testKnowledgeIntuition({ stopAt: 'prep' });
   * ```
   */
  async testKnowledgeIntuition(options) {
    const start = Date.now();
    const ctx = AppContext.getInstance();
    const agent = new KnowledgeIntuitionAgent(ctx.manager);
    let result = null;
    let eventCount = 0;
    for await (const _ev of streamWithStreamLog(
      agent.streamRun(options ?? {}, (r) => {
        result = r;
      })
    )) {
      eventCount++;
    }
    const duration = Date.now() - start;
    const snapshot = result;
    if (snapshot != null && sqliteStoreManager.isInitialized()) {
      try {
        const stateRepo = sqliteStoreManager.getIndexStateRepo();
        await stateRepo.set("knowledge_intuition_json", JSON.stringify(snapshot.json));
      } catch (e) {
        console.error("[testKnowledgeIntuition] Failed to persist intuition map:", e);
      }
    }
    return { result, duration, eventCount };
  }
  /**
   * Builds deterministic backbone map: folder tree, optional virtual-* clusters, cross-folder highways.
   * No LLM. Requires indexed SQLite.
   *
   * @example
   * ```ts
   * await window.testBackboneMap();
   * await window.testAISearchTools.testBackboneMap({ maxDepth: 8, topBackboneEdges: 24 });
   * ```
   */
  async testBackboneMap(options) {
    const ctx = AppContext.getInstance();
    if (ctx.isMockEnv) {
      return null;
    }
    const result = await buildBackboneMap(options);
    return result;
  }
};

// src/app/context/graph-cleanup.ts
var import_kysely6 = require("kysely");
async function cleanupGraphTable() {
  const kdb = sqliteStoreManager.getIndexContext("vault");
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const pathMap = await indexedDocumentRepo.getAllIndexedPaths();
  const paths = Array.from(pathMap.keys());
  const idRows = paths.length > 0 ? await indexedDocumentRepo.getIdsByPaths(paths) : [];
  const validDocIds = new Set(idRows.map((r) => r.id));
  const allNodeIdsToCheck = [];
  for (const t of GRAPH_DOCUMENT_LIKE_NODE_TYPES) {
    const nodes = await mobiusNodeRepo.getByType(t);
    allNodeIdsToCheck.push(...nodes.map((n) => n.id));
  }
  const nodeIdsWithoutIndexedDocument = [...new Set(allNodeIdsToCheck)].filter((id) => !validDocIds.has(id));
  let orphanEdgesDeleted = 0;
  await kdb.transaction().execute(async (trx) => {
    const orphanEdgeRows = await trx.selectFrom("mobius_edge").select("id").where(
      import_kysely6.sql`from_node_id NOT IN (SELECT node_id FROM mobius_node) OR to_node_id NOT IN (SELECT node_id FROM mobius_node)`
    ).execute();
    const orphanEdgeIds = orphanEdgeRows.map((r) => r.id);
    if (orphanEdgeIds.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < orphanEdgeIds.length; i += chunkSize) {
        const chunk = orphanEdgeIds.slice(i, i + chunkSize);
        await trx.deleteFrom("mobius_edge").where("id", "in", chunk).execute();
      }
      orphanEdgesDeleted = orphanEdgeIds.length;
    }
    if (nodeIdsWithoutIndexedDocument.length > 0) {
      await trx.deleteFrom("mobius_edge").where(
        (eb) => eb.or([
          eb("from_node_id", "in", nodeIdsWithoutIndexedDocument),
          eb("to_node_id", "in", nodeIdsWithoutIndexedDocument)
        ])
      ).execute();
      await trx.deleteFrom("mobius_node").where("node_id", "in", nodeIdsWithoutIndexedDocument).execute();
    }
  });
  return {
    orphanEdgesDeleted,
    nodesWithoutIndexedDocumentDeleted: nodeIdsWithoutIndexedDocument.length
  };
}

// src/service/search/index/indexService.ts
var import_obsidian12 = __toESM(require_obsidian_stub());
init_types();

// src/service/search/support/llm-enrichment-progress-tracker.ts
var CHARS_PER_TOKEN = 4;
var TAG_OVERHEAD = 900;
var SHORT_OVERHEAD = 500;
var FULL_OVERHEAD = 700;
var TAG_OUTPUT_AVG = 220;
var BASE_LATENCY_MS = 2500;
var TOKENS_PER_SEC = 100;
var wordsToTokens = (w) => Math.max(1, Math.ceil(w / 0.75));
var phaseMs = (inTok, outTok) => BASE_LATENCY_MS + (inTok + outTok) / TOKENS_PER_SEC * 1e3;
var LlmEnrichmentProgressTracker = class {
  constructor(settings, ai) {
    this.settings = settings;
    this.ai = ai;
    this.completed = 0;
    this.sumObservedDurationMs = 0;
    this.sumObservedInputTokens = 0;
    this.sumObservedOutputTokens = 0;
    this.sumObservedCostUsd = 0;
    this.sumPlannedDurationMs = 0;
    this.sumPlannedTotalTokens = 0;
    this.sumPlannedCostUsd = 0;
  }
  async planForMarkdownDoc(contentChars) {
    const contentTokens = Math.ceil(contentChars / CHARS_PER_TOKEN);
    const needsSummaryFull = contentChars > this.settings.fullSummaryLength;
    const tagIn = contentTokens + TAG_OVERHEAD, shortIn = contentTokens + SHORT_OVERHEAD, fullIn = contentTokens + FULL_OVERHEAD;
    const shortOut = wordsToTokens(this.settings.shortSummaryLength), fullOut = wordsToTokens(this.settings.fullSummaryLength), tagOut = TAG_OUTPUT_AVG;
    const costFor = async (promptId, inT, outT) => {
      const m = this.ai.getModelForPrompt(promptId);
      const info = await this.ai.getModelInfo(m.modelId, m.provider);
      return computeUsdFromUsage({ inputTokens: inT, outputTokens: outT, totalTokens: inT + outT }, info);
    };
    let plannedIn = tagIn + shortIn, plannedOut = tagOut + shortOut;
    let plannedCost = await costFor("doc-tag-generate-json" /* DocTagGenerateJson */, tagIn, tagOut) + await costFor("doc-summary-short" /* DocSummaryShort */, shortIn, shortOut);
    let maxPhaseMs = Math.max(phaseMs(tagIn, tagOut), phaseMs(shortIn, shortOut));
    if (needsSummaryFull) {
      plannedIn += fullIn;
      plannedOut += fullOut;
      plannedCost += await costFor("doc-summary-full" /* DocSummaryFull */, fullIn, fullOut);
      maxPhaseMs = Math.max(maxPhaseMs, phaseMs(fullIn, fullOut));
    }
    return { contentChars, needsSummaryFull, plannedInputTokens: plannedIn, plannedOutputTokens: plannedOut, plannedTotalTokens: plannedIn + plannedOut, plannedCostUsd: plannedCost, plannedDurationMs: maxPhaseMs };
  }
  emptyPlan() {
    return { contentChars: 0, needsSummaryFull: false, plannedInputTokens: 0, plannedOutputTokens: 0, plannedTotalTokens: 0, plannedCostUsd: 0, plannedDurationMs: 0 };
  }
  recordDocComplete(plan, actual) {
    this.completed++;
    this.sumObservedDurationMs += actual.durationMs;
    const n = normalizeUsageTokens(actual.usage);
    this.sumObservedInputTokens += n.input;
    this.sumObservedOutputTokens += n.output;
    this.sumObservedCostUsd += actual.costUsd;
    this.sumPlannedDurationMs += plan.plannedDurationMs;
    this.sumPlannedTotalTokens += plan.plannedTotalTokens;
    this.sumPlannedCostUsd += plan.plannedCostUsd;
  }
  snapshot(params) {
    const { path: path4, processed, total, batchStartMs, lastPlan, lastActual } = params;
    const elapsedMs = Date.now() - batchStartMs;
    const lastTok = normalizeUsageTokens(lastActual.usage);
    const timeRatio = this.sumPlannedDurationMs > 0 ? this.sumObservedDurationMs / this.sumPlannedDurationMs : 1;
    const tokenRatio = this.sumPlannedTotalTokens > 0 ? (this.sumObservedInputTokens + this.sumObservedOutputTokens) / this.sumPlannedTotalTokens : 1;
    const costRatio = this.sumPlannedCostUsd > 0 ? this.sumObservedCostUsd / this.sumPlannedCostUsd : tokenRatio;
    const remainingDocs = Math.max(0, total - processed);
    const avgPlannedDuration = this.completed > 0 ? this.sumPlannedDurationMs / this.completed : lastPlan.plannedDurationMs;
    const avgPlannedTokens = this.completed > 0 ? this.sumPlannedTotalTokens / this.completed : lastPlan.plannedTotalTokens;
    const avgPlannedCost = this.completed > 0 ? this.sumPlannedCostUsd / this.completed : lastPlan.plannedCostUsd;
    const estimatedRemainingMs = remainingDocs * avgPlannedDuration * timeRatio;
    const estimatedRemainingTotalTokens = remainingDocs * avgPlannedTokens * tokenRatio;
    const estimatedRemainingCostUsd = remainingDocs * avgPlannedCost * costRatio;
    const sumTotalTokens = this.sumObservedInputTokens + this.sumObservedOutputTokens;
    return {
      processed,
      total,
      path: path4,
      elapsedMs,
      estimatedRemainingMs,
      estimatedTotalMs: elapsedMs + estimatedRemainingMs,
      lastDocInputTokens: lastTok.input,
      lastDocOutputTokens: lastTok.output,
      lastDocTotalTokens: lastTok.total,
      lastDocCostUsd: lastActual.costUsd,
      sumInputTokens: this.sumObservedInputTokens,
      sumOutputTokens: this.sumObservedOutputTokens,
      sumTotalTokens,
      sumCostUsd: this.sumObservedCostUsd,
      estimatedRemainingTotalTokens,
      estimatedRemainingCostUsd,
      estimatedFinalTotalTokens: sumTotalTokens + estimatedRemainingTotalTokens,
      estimatedFinalCostUsd: this.sumObservedCostUsd + estimatedRemainingCostUsd
    };
  }
};

// src/service/search/index/types.ts
function defaultIndexDocumentOptions(reason) {
  switch (reason) {
    case "listener_fast":
    case "startup_scan":
      return {
        includeEmbeddings: false,
        includeLlmTags: false,
        includeLlmSummary: false,
        preserveExistingLlmDataWhenSkipped: true,
        markLlmPendingWhenSkipped: true,
        includeCoreSearchIndex: true,
        markVectorPendingWhenSkipped: true,
        incrementIndexState: true,
        reason
      };
    case "manual_full":
    case "hub_maintenance":
      return {
        includeEmbeddings: true,
        includeLlmTags: true,
        includeLlmSummary: true,
        preserveExistingLlmDataWhenSkipped: false,
        markLlmPendingWhenSkipped: false,
        includeCoreSearchIndex: true,
        markVectorPendingWhenSkipped: false,
        incrementIndexState: true,
        reason
      };
    case "vector_enrich_only":
      return {
        includeEmbeddings: true,
        includeLlmTags: false,
        includeLlmSummary: false,
        preserveExistingLlmDataWhenSkipped: true,
        markLlmPendingWhenSkipped: false,
        includeCoreSearchIndex: false,
        markVectorPendingWhenSkipped: false,
        incrementIndexState: false,
        reason
      };
    case "llm_enrich_only":
      return {
        includeEmbeddings: false,
        includeLlmTags: true,
        includeLlmSummary: true,
        preserveExistingLlmDataWhenSkipped: false,
        markLlmPendingWhenSkipped: false,
        includeCoreSearchIndex: false,
        markVectorPendingWhenSkipped: false,
        incrementIndexState: false,
        reason
      };
  }
}

// src/service/search/support/segmenter.ts
function stripCombiningMarks(text) {
  try {
    return text.replace(/\p{M}+/gu, "");
  } catch {
    return text;
  }
}
function normalizeForSearch(text) {
  if (!text) return "";
  const normalized = text.normalize("NFKD");
  return stripCombiningMarks(normalized).toLowerCase();
}
function segmentToWhitespace(text, locale) {
  if (!text) return "";
  const input = text.replace(/\s+/g, " ").trim();
  if (!input) return "";
  const Seg = Intl?.Segmenter;
  if (!Seg) return input;
  try {
    const seg = new Seg(locale ? [locale] : void 0, { granularity: "word" });
    const out = [];
    for (const part of seg.segment(input)) {
      const s = String(part.segment ?? "").trim();
      if (!s) continue;
      if (part.isWordLike === false) {
        if (/^\p{P}+$/u.test(s)) continue;
      }
      out.push(s);
    }
    return out.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return input;
  }
}
function normalizeTextForFts(text, locale) {
  return normalizeForSearch(segmentToWhitespace(text, locale));
}

// src/service/search/support/porter-stemmer.ts
function isConsonant(word, i) {
  const c = word[i];
  if (c === "a" || c === "e" || c === "i" || c === "o" || c === "u") return false;
  if (c === "y") return i === 0 || !isConsonant(word, i - 1);
  return true;
}
function measure(stem) {
  let m = 0;
  let i = 0;
  const n = stem.length;
  while (i < n && isConsonant(stem, i)) i++;
  while (i < n) {
    while (i < n && !isConsonant(stem, i)) i++;
    m++;
    while (i < n && isConsonant(stem, i)) i++;
  }
  return m;
}
function containsVowel(stem) {
  for (let i = 0; i < stem.length; i++) {
    if (!isConsonant(stem, i)) return true;
  }
  return false;
}
function endsDoubleConsonant(stem) {
  const n = stem.length;
  return n >= 2 && stem[n - 1] === stem[n - 2] && isConsonant(stem, n - 1);
}
function endsCVC(stem) {
  const n = stem.length;
  if (n < 3) return false;
  return isConsonant(stem, n - 1) && !isConsonant(stem, n - 2) && isConsonant(stem, n - 3) && stem[n - 1] !== "w" && stem[n - 1] !== "x" && stem[n - 1] !== "y";
}
function step1a(word) {
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("ies")) return word.slice(0, -2);
  if (word.endsWith("ss")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}
function step1b(word) {
  if (word.endsWith("eed")) {
    const stem = word.slice(0, -3);
    if (measure(stem) > 0) return stem + "ee";
    return word;
  }
  if (word.endsWith("ed")) {
    const stem = word.slice(0, -2);
    if (containsVowel(stem)) return step1bFix(stem);
    return word;
  }
  if (word.endsWith("ing")) {
    const stem = word.slice(0, -3);
    if (containsVowel(stem)) return step1bFix(stem);
    return word;
  }
  return word;
}
function step1bFix(stem) {
  if (stem.endsWith("at") || stem.endsWith("bl") || stem.endsWith("iz")) return stem + "e";
  if (endsDoubleConsonant(stem)) {
    const last = stem[stem.length - 1];
    if (last !== "l" && last !== "s" && last !== "z") return stem.slice(0, -1);
  }
  if (measure(stem) === 1 && endsCVC(stem)) return stem + "e";
  return stem;
}
function step1c(word) {
  if (word.endsWith("y")) {
    const stem = word.slice(0, -1);
    if (containsVowel(stem)) return stem + "i";
  }
  return word;
}
var STEP2_MAP = [
  ["ational", "ate"],
  ["tional", "tion"],
  ["enci", "ence"],
  ["anci", "ance"],
  ["izer", "ize"],
  ["abli", "able"],
  ["alli", "al"],
  ["entli", "ent"],
  ["eli", "e"],
  ["ousli", "ous"],
  ["ization", "ize"],
  ["ation", "ate"],
  ["ator", "ate"],
  ["alism", "al"],
  ["iveness", "ive"],
  ["fulness", "ful"],
  ["ousness", "ous"],
  ["aliti", "al"],
  ["iviti", "ive"],
  ["biliti", "ble"]
];
function step2(word) {
  for (const [suffix, replacement] of STEP2_MAP) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (measure(stem) > 0) return stem + replacement;
      return word;
    }
  }
  return word;
}
var STEP3_MAP = [
  ["icate", "ic"],
  ["ative", ""],
  ["alize", "al"],
  ["iciti", "ic"],
  ["ical", "ic"],
  ["ful", ""],
  ["ness", ""]
];
function step3(word) {
  for (const [suffix, replacement] of STEP3_MAP) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (measure(stem) > 0) return stem + replacement;
      return word;
    }
  }
  return word;
}
var STEP4_SUFFIXES = [
  "ement",
  "ment",
  "ance",
  "ence",
  "able",
  "ible",
  "ism",
  "ate",
  "iti",
  "ous",
  "ive",
  "ize",
  "ant",
  "ent",
  "ion",
  "al",
  "er",
  "ic"
];
function step4(word) {
  for (const suffix of STEP4_SUFFIXES) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, -suffix.length);
      if (suffix === "ion") {
        if (measure(stem) > 1 && (stem.endsWith("s") || stem.endsWith("t"))) return stem;
        return word;
      }
      if (measure(stem) > 1) return stem;
      return word;
    }
  }
  return word;
}
function step5a(word) {
  if (word.endsWith("e")) {
    const stem = word.slice(0, -1);
    const m = measure(stem);
    if (m > 1) return stem;
    if (m === 1 && !endsCVC(stem)) return stem;
  }
  return word;
}
function step5b(word) {
  if (endsDoubleConsonant(word) && word.endsWith("l") && measure(word.slice(0, -1)) > 1) {
    return word.slice(0, -1);
  }
  return word;
}
var ENGLISH_ONLY = /^[a-zA-Z]+$/;
function porterStem(word) {
  if (!word || !ENGLISH_ONLY.test(word)) return word;
  if (word.length <= 2) return word.toLowerCase();
  let w = word.toLowerCase();
  w = step1a(w);
  w = step1b(w);
  w = step1c(w);
  w = step2(w);
  w = step3(w);
  w = step4(w);
  w = step5a(w);
  w = step5b(w);
  return w;
}
function stemText(text) {
  return text.split(/(\s+)/).map((token) => /^\s+$/.test(token) ? token : porterStem(token)).join("");
}

// src/service/search/index/helper/documentPageRank.ts
var DEFAULT_DAMPING = 0.85;
var DEFAULT_MAX_ITER = 100;
var DEFAULT_TOL = 1e-6;
async function computeVaultPageRankStreaming(nodeIds, outDeg, scanReferenceEdges, options) {
  const d = options?.damping ?? DEFAULT_DAMPING;
  const maxIter = options?.maxIterations ?? DEFAULT_MAX_ITER;
  const tol = options?.tolerance ?? DEFAULT_TOL;
  const n = nodeIds.length;
  if (n === 0) {
    return /* @__PURE__ */ new Map();
  }
  if (outDeg.length !== n) {
    throw new Error("computeVaultPageRankStreaming: outDeg length must match nodeIds");
  }
  const idToIndex = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    idToIndex.set(nodeIds[i], i);
  }
  let r = new Float64Array(n);
  const invN = 1 / n;
  r.fill(invN);
  const base = (1 - d) / n;
  for (let iter = 0; iter < maxIter; iter++) {
    const rNext = new Float64Array(n);
    rNext.fill(base);
    let danglingMass = 0;
    for (let j = 0; j < n; j++) {
      if (outDeg[j] === 0) {
        danglingMass += r[j];
      }
    }
    await scanReferenceEdges((from, to) => {
      const fi = idToIndex.get(from);
      const ti = idToIndex.get(to);
      if (fi === void 0 || ti === void 0) return;
      const deg = outDeg[fi];
      if (deg > 0) {
        rNext[ti] += d * r[fi] / deg;
      }
    }, iter);
    if (danglingMass > 0) {
      const add = d * danglingMass / n;
      for (let i = 0; i < n; i++) {
        rNext[i] += add;
      }
    }
    let diff = 0;
    for (let i = 0; i < n; i++) {
      diff += Math.abs(rNext[i] - r[i]);
    }
    r = rNext;
    if (diff < tol) break;
  }
  const scores = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    scores.set(nodeIds[i], r[i]);
  }
  return scores;
}
async function accumulateSemanticOutgoingWeightSums(nodeIds, scanAllSemanticEdges) {
  const n = nodeIds.length;
  const idToIndex = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    idToIndex.set(nodeIds[i], i);
  }
  const sums = new Float64Array(n);
  await scanAllSemanticEdges((from, to, w) => {
    const fi = idToIndex.get(from);
    const ti = idToIndex.get(to);
    if (fi === void 0 || ti === void 0) return;
    const ww = Number.isFinite(w) && w > 0 ? w : 0;
    if (ww > 0) sums[fi] += ww;
  });
  return sums;
}
async function computeSemanticPageRankStreaming(nodeIds, outgoingWeightSum, scanSemanticEdges, options) {
  const d = options?.damping ?? DEFAULT_DAMPING;
  const maxIter = options?.maxIterations ?? DEFAULT_MAX_ITER;
  const tol = options?.tolerance ?? DEFAULT_TOL;
  const n = nodeIds.length;
  if (n === 0) {
    return /* @__PURE__ */ new Map();
  }
  if (outgoingWeightSum.length !== n) {
    throw new Error("computeSemanticPageRankStreaming: outgoingWeightSum length must match nodeIds");
  }
  const idToIndex = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    idToIndex.set(nodeIds[i], i);
  }
  let r = new Float64Array(n);
  const invN = 1 / n;
  r.fill(invN);
  const base = (1 - d) / n;
  for (let iter = 0; iter < maxIter; iter++) {
    const rNext = new Float64Array(n);
    rNext.fill(base);
    let danglingMass = 0;
    for (let j = 0; j < n; j++) {
      if (outgoingWeightSum[j] <= 0) {
        danglingMass += r[j];
      }
    }
    await scanSemanticEdges((from, to, weight) => {
      const fi = idToIndex.get(from);
      const ti = idToIndex.get(to);
      if (fi === void 0 || ti === void 0) return;
      const sumW = outgoingWeightSum[fi];
      if (sumW <= 0) return;
      const w = Number.isFinite(weight) && weight > 0 ? weight : 0;
      if (w <= 0) return;
      rNext[ti] += d * r[fi] * w / sumW;
    }, iter);
    if (danglingMass > 0) {
      const add = d * danglingMass / n;
      for (let i = 0; i < n; i++) {
        rNext[i] += add;
      }
    }
    let diff = 0;
    for (let i = 0; i < n; i++) {
      diff += Math.abs(rNext[i] - r[i]);
    }
    r = rNext;
    if (diff < tol) break;
  }
  const scores = /* @__PURE__ */ new Map();
  for (let i = 0; i < n; i++) {
    scores.set(nodeIds[i], r[i]);
  }
  return scores;
}

// src/service/search/index/helper/safeChunking.ts
function enforceChunkLengthWithOverlap(chunks, settings) {
  const maxChars = Math.max(1, Number(settings.maxChunkSize ?? 1e3));
  const overlap = normalizeOverlap(settings.chunkOverlap ?? 200, maxChars);
  const out = [];
  for (const chunk of chunks) {
    const content = chunk.content ?? "";
    if (content.length <= maxChars) {
      out.push({ ...chunk });
      continue;
    }
    const splitParts = splitTextWithOverlap(content, maxChars, overlap);
    for (const part of splitParts) {
      if (!part.trim()) continue;
      out.push({
        ...chunk,
        content: part,
        chunkId: generateUuidWithoutHyphens()
      });
    }
  }
  for (let i = 0; i < out.length; i++) {
    out[i].chunkIndex = i;
  }
  return out;
}
function normalizeOverlap(overlap, maxChars) {
  const raw = Number.isFinite(overlap) ? Math.max(0, Math.floor(overlap)) : 0;
  if (maxChars <= 1) return 0;
  return Math.min(raw, Math.max(0, maxChars - 1));
}
function splitTextWithOverlap(text, maxChars, overlap) {
  const parts = [];
  let cursor = 0;
  while (cursor < text.length) {
    const hardEnd = Math.min(cursor + maxChars, text.length);
    if (hardEnd >= text.length) {
      parts.push(text.slice(cursor));
      break;
    }
    const splitAt = findSplitPoint(text, cursor, hardEnd);
    parts.push(text.slice(cursor, splitAt));
    const nextCursor = splitAt - overlap;
    cursor = nextCursor > cursor ? nextCursor : splitAt;
  }
  return parts;
}
function findSplitPoint(text, start, hardEnd) {
  const window2 = Math.max(32, Math.floor((hardEnd - start) * 0.2));
  const softStart = Math.max(start + 1, hardEnd - window2);
  for (let i = hardEnd; i >= softStart; i--) {
    const ch = text[i - 1];
    if (ch === "\n" || ch === " " || ch === "	") {
      return i;
    }
  }
  return hardEnd;
}

// src/core/document/loader/helper/DocumentLoaderManager.ts
var import_obsidian11 = __toESM(require_obsidian_stub());

// src/core/utils/markdown-utils.ts
var import_gray_matter = __toESM(require("gray-matter"));
var import_remark = require("remark");
var import_remark_frontmatter = __toESM(require("remark-frontmatter"));
var import_remark_gfm = __toESM(require("remark-gfm"));
var import_remark_wiki_link = __toESM(require("remark-wiki-link"));
var import_unist_util_visit = require("unist-util-visit");
async function parseMarkdownWithRemark(content, options) {
  const processor = (0, import_remark.remark)().use(import_remark_frontmatter.default, ["yaml"]).use(import_remark_gfm.default).use(import_remark_wiki_link.default, {
    pageResolver: (name) => [name],
    hrefTemplate: (permalink) => permalink,
    wikiLinkClassName: null,
    newClassName: null,
    aliasDivider: "|"
  });
  const ast = processor.parse(content);
  const validAst = !ast || !ast.children ? {
    type: "root",
    children: [{
      type: "paragraph",
      children: [{ type: "text", value: content }]
    }]
  } : ast;
  let frontmatter = null;
  let title = null;
  const tags = /* @__PURE__ */ new Set();
  const outgoingRefs = [];
  const embeddings = [];
  const resolveToFullPath = (linkTarget) => {
    if (options?.resolveWikiLinkToPath) {
      const resolved = options.resolveWikiLinkToPath(linkTarget);
      if (resolved) return resolved;
    }
    return linkTarget;
  };
  (0, import_unist_util_visit.visit)(validAst, (node, index, parent) => {
    switch (node.type) {
      case "yaml":
        try {
          const yamlContent = node.value;
          const parsed = (0, import_gray_matter.default)(`---
${yamlContent}
---`);
          frontmatter = Object.keys(parsed.data).length > 0 ? parsed.data : null;
          if (frontmatter?.tags) {
            const frontmatterTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : String(frontmatter.tags).split(",");
            frontmatterTags.forEach((tag) => tags.add(String(tag).trim()));
          }
          if (frontmatter?.title && !title) {
            title = String(frontmatter.title).trim().replace(/^["']|["']$/g, "");
          }
        } catch (e) {
        }
        break;
      // case 'heading':
      // 	// Extract title from first h1 if not already set
      // 	if (!title && (node as Heading).depth === 1) {
      // 		title = toString(node);
      // 	}
      // 	break;
      case "wikiLink":
        const target = node.value || node.data?.permalink || node.data?.value || node.url;
        if (target) {
          const isEmbed = node.data?.isEmbed || typeof node.value === "string" && node.value.startsWith("!") || node.data?.embed;
          if (isEmbed) {
            embeddings.push(resolveToFullPath(target.replace(/^!/, "")));
          } else {
            outgoingRefs.push({ fullPath: resolveToFullPath(target) });
          }
        }
        break;
      case "link":
        const linkNode = node;
        if (linkNode.url && !linkNode.url.startsWith("http") && !linkNode.url.startsWith("#")) {
          outgoingRefs.push({ fullPath: linkNode.url });
        }
        break;
      case "image":
        const imageNode = node;
        if (imageNode.url && !imageNode.url.startsWith("http")) {
          embeddings.push(imageNode.url);
        }
        break;
      case "text":
        if (parent && ["code", "inlineCode", "link"].includes(parent.type)) {
          return;
        }
        if (node.value.includes("[[")) {
          const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
          const wikiMatches = node.value.matchAll(wikiLinkRegex);
          for (const match of wikiMatches) {
            const content2 = match[1];
            const pipeIndex = content2.indexOf("|");
            let target2 = pipeIndex !== -1 ? content2.substring(0, pipeIndex).trim() : content2.trim();
            if (target2.startsWith("!")) {
              target2 = target2.substring(1).trim();
              const hashIndex2 = target2.indexOf("#");
              const filePath = hashIndex2 !== -1 ? target2.substring(0, hashIndex2).trim() : target2;
              if (filePath && filePath.length > 0 && filePath.length <= 200 && !filePath.startsWith("@") && !filePath.includes("\n") && /[a-zA-Z\u4e00-\u9fff]/.test(filePath)) {
                embeddings.push(filePath);
              }
              continue;
            }
            const hashIndex = target2.indexOf("#");
            const fullPath = hashIndex !== -1 ? target2.substring(0, hashIndex).trim() : target2;
            if (fullPath && fullPath.length > 0 && fullPath.length <= 200 && !fullPath.startsWith("@") && !fullPath.includes("\n") && /[a-zA-Z\u4e00-\u9fff]/.test(fullPath)) {
              outgoingRefs.push({ fullPath: resolveToFullPath(fullPath) });
            }
          }
        }
        const hashtagRegex = /#([a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff_-]*)/g;
        const matches = node.value.matchAll(hashtagRegex);
        for (const match of matches) {
          const tag = match[1];
          if (tag && tag.length >= 2) {
            tags.add(tag);
          }
        }
        break;
    }
  });
  const references = {
    outgoing: outgoingRefs,
    incoming: []
    // Will be populated by indexing process
  };
  return {
    frontmatter,
    title,
    tags: Array.from(tags),
    references,
    embeddings,
    ast: validAst
  };
}
var DEFAULT_CODE_BLOCK_PLACEHOLDER = "\n\n[code omitted]\n\n";
var CODE_KEYWORD_TOP_N = 6;
var MIN_TOKEN_LEN = 2;
var codeStopwordsSet = null;
function getCodeStopwords() {
  return codeStopwordsSet ?? /* @__PURE__ */ new Set();
}
var IDENT_RE = /[A-Za-z_][A-Za-z0-9_]{1,63}/g;
function parseFenceLang(infoLine) {
  const raw = infoLine.trim().split(/\s+/)[0] ?? "";
  if (!raw) return "unknown";
  const cleaned = raw.replace(/[^a-zA-Z0-9.+#-]/g, "").toLowerCase();
  return cleaned.slice(0, SLICE_CAPS.utils.chunkSlugFallback) || "unknown";
}
function expandIdentifier(id) {
  const withSplits = id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  return withSplits.split(/[^a-zA-Z0-9_]+/).filter((p) => p.length >= MIN_TOKEN_LEN);
}
function extractCodeKeywordsForIndex(code, topN2) {
  const counts = /* @__PURE__ */ new Map();
  let m;
  const re = new RegExp(IDENT_RE.source, "g");
  while ((m = re.exec(code)) !== null) {
    const id = m[0];
    for (const part of expandIdentifier(id)) {
      const w = part.toLowerCase();
      if (w.length < MIN_TOKEN_LEN) continue;
      if (/^\d+$/.test(w)) continue;
      if (getCodeStopwords().has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [w] of ranked) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= topN2) break;
  }
  return out;
}
function buildCodeOmittedPlaceholder(infoLine, inner) {
  const lang = parseFenceLang(infoLine);
  const lines = inner.length === 0 ? 0 : inner.split(/\r?\n/).length;
  const chars = inner.length;
  const kw = extractCodeKeywordsForIndex(inner, CODE_KEYWORD_TOP_N);
  const kwPart = kw.length ? ` kw=${kw.join(",")}` : "";
  return `

[code omitted lang=${lang} lines=${lines} chars=${chars}${kwPart}]

`;
}
function replaceFencedCodeBlocks(content, maxKeep, fallbackPlaceholder, useRichOmit) {
  const re = /```([^\n]*)\n([\s\S]*?)```/g;
  return content.replace(re, (_full, infoLine, inner) => {
    if (maxKeep <= 0) {
      return useRichOmit ? buildCodeOmittedPlaceholder(infoLine, inner) : fallbackPlaceholder;
    }
    if (inner.length <= maxKeep) return "```" + infoLine + "\n" + inner + "\n```";
    return "```" + infoLine + "\n" + inner.slice(0, maxKeep) + "\n...\n```";
  });
}
function preprocessMarkdownForChunking(content, settings) {
  const skip = settings.skipCodeBlocksInChunking === true;
  if (!skip) return content;
  const configured = settings.codeBlockPlaceholder;
  const fallbackPlaceholder = configured ?? DEFAULT_CODE_BLOCK_PLACEHOLDER;
  const useRichOmit = configured === void 0 || configured === DEFAULT_CODE_BLOCK_PLACEHOLDER;
  const maxKeep = Math.max(0, settings.maxCodeChunkChars ?? 0);
  return replaceFencedCodeBlocks(content, maxKeep, fallbackPlaceholder, useRichOmit);
}

// src/core/document/loader/MarkdownDocumentLoader.ts
var import_textsplitters3 = require("@langchain/textsplitters");
init_types();

// src/core/document/loader/helper/DocumentLoaderHelpers.ts
init_types();
function resolveTextrankContext(document2, options) {
  const custom = document2.metadata?.custom;
  let kw = options?.textrankKeywords;
  if (kw === void 0 && custom) {
    if (typeof custom.textrankKeywords === "string") {
      kw = custom.textrankKeywords;
    } else if (Array.isArray(custom.textrankKeywordsStructured) && custom.textrankKeywordsStructured.length) {
      kw = custom.textrankKeywordsStructured.map((t) => t.term).join(", ");
    }
  }
  kw = kw ?? "";
  let sent = options?.textrankSentences;
  if (sent === void 0 && custom) {
    if (typeof custom.textrankSentences === "string") {
      sent = custom.textrankSentences;
    } else if (Array.isArray(custom.textrankSentencesStructured) && custom.textrankSentencesStructured.length) {
      const arr = custom.textrankSentencesStructured;
      sent = arr.map((s, i) => `${i + 1}. ${s.text}`).join("\n");
    }
  }
  sent = sent ?? "";
  return { textrankKeywords: kw, textrankSentences: sent };
}
async function getDefaultDocumentSummary(doc, aiServiceManager, provider, modelId, options) {
  if (!aiServiceManager) {
    throw new Error("getDefaultDocumentSummary requires AIServiceManager to generate summaries");
  }
  let document2;
  if (typeof doc === "string") {
    document2 = {
      cacheFileInfo: {
        content: doc
      },
      sourceFileInfo: {
        content: doc
      },
      metadata: {
        title: "",
        topicTags: [],
        functionalTagEntries: [],
        keywordTags: []
      }
    };
  } else {
    document2 = doc;
  }
  const content = document2.cacheFileInfo.content || document2.sourceFileInfo.content;
  const title = document2.metadata.title || document2.sourceFileInfo.name;
  const path4 = document2.sourceFileInfo.path;
  const search = AppContext.getInstance().settings.search;
  const shortW = options?.shortWordCount ?? search.shortSummaryLength;
  const fullW = options?.fullWordCount ?? search.fullSummaryLength;
  const mode = options?.mode ?? "short_then_full_if_long";
  const { textrankKeywords, textrankSentences } = resolveTextrankContext(document2, options);
  const shortVars = {
    content,
    title,
    path: path4,
    maxWords: String(shortW),
    ...textrankKeywords.trim() ? { textrankKeywords } : {},
    ...textrankSentences.trim() ? { textrankSentences } : {}
  };
  const fullVarsBase = {
    content,
    title,
    path: path4,
    targetWords: String(fullW),
    ...textrankKeywords.trim() ? { textrankKeywords } : {},
    ...textrankSentences.trim() ? { textrankSentences } : {}
  };
  const needFull = mode === "short_then_full_if_long" && content.length > search.fullSummaryLength;
  const tSum = Date.now();
  console.info("[MarkdownDocumentLoader] document summary LLM start", {
    path: path4,
    needFull,
    prompts: needFull ? ["DocSummaryShort", "DocSummaryFull"] : ["DocSummaryShort"]
  });
  let llmUsage = emptyUsage();
  let llmCostUsd = 0;
  let shortSummary;
  let fullSummary;
  if (needFull) {
    const [shortText, fullText] = await Promise.all([
      aiServiceManager.queryText("doc-summary-short" /* DocSummaryShort */, shortVars),
      aiServiceManager.queryText("doc-summary-full" /* DocSummaryFull */, fullVarsBase)
    ]);
    shortSummary = shortText;
    fullSummary = fullText;
  } else {
    shortSummary = await aiServiceManager.queryText("doc-summary-short" /* DocSummaryShort */, shortVars);
    fullSummary = void 0;
  }
  console.info("[MarkdownDocumentLoader] document summary LLM done", {
    path: path4,
    needFull,
    elapsedMs: Date.now() - tSum
  });
  return { shortSummary, fullSummary, llmUsage, llmCostUsd };
}

// src/core/document/helper/TagService.ts
var import_v39 = require("zod/v3");

// src/core/schemas/agents/search-agent-schemas.ts
var SEMANTIC_DIMENSION_IDS = [
  "essence_definition",
  "history_origin",
  "why_mechanism",
  "evidence_source",
  "pitfall_misconception",
  "how_method",
  "example_case",
  "options_comparison",
  "cost_risk_limit",
  "applicable_condition",
  "impact_consequence",
  "related_extension",
  "next_action",
  "trend_future",
  "tool_resource"
];
var ALL_DIMENSION_IDS = [
  ...SEMANTIC_DIMENSION_IDS,
  "inventory_mapping",
  "temporal_mapping"
];
var FUNCTIONAL_TAG_CORE = [
  "current_state",
  "goal_intent",
  "constraint",
  "resource",
  "skill_stack",
  "past_attempt",
  "idea_candidate",
  "decision_opinion"
];
var FUNCTIONAL_TAG_ENHANCEMENT = [
  "timeline_event",
  "external_context",
  "emotion_attitude",
  "evidence_data"
];
var FUNCTIONAL_TAG_IDS = [...FUNCTIONAL_TAG_CORE, ...FUNCTIONAL_TAG_ENHANCEMENT];
var SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS = {
  essence_definition: ["current_state", "idea_candidate"],
  history_origin: ["timeline_event", "external_context", "past_attempt"],
  why_mechanism: ["goal_intent", "constraint", "evidence_data", "decision_opinion"],
  evidence_source: ["evidence_data"],
  pitfall_misconception: ["constraint", "past_attempt"],
  how_method: ["skill_stack", "idea_candidate"],
  example_case: ["idea_candidate", "evidence_data"],
  options_comparison: ["decision_opinion", "idea_candidate"],
  cost_risk_limit: ["constraint", "resource"],
  applicable_condition: ["current_state", "external_context", "constraint"],
  impact_consequence: ["decision_opinion", "evidence_data", "current_state"],
  related_extension: ["external_context", "idea_candidate"],
  next_action: ["past_attempt", "idea_candidate", "resource", "goal_intent"],
  trend_future: ["timeline_event", "external_context"],
  tool_resource: ["resource", "skill_stack"]
};

// src/core/document/helper/TagService.ts
var functionalSet = new Set(FUNCTIONAL_TAG_IDS);
var EMPTY_TAGS_BLOB = {
  topicTags: [],
  functionalTagEntries: [],
  keywordTags: [],
  timeTags: [],
  geoTags: [],
  personTags: []
};
var CONTEXT_LABEL_PATTERN = {
  time: /^Time[A-Z][a-zA-Z0-9_]*$/,
  geo: /^Geo[A-Z][a-zA-Z0-9_]*$/,
  person: /^Person[A-Z][a-zA-Z0-9_]*$/
};
var MAX_CONTEXT_TAGS_PER_AXIS = 8;
var MAX_FUNCTIONAL_LABEL_LEN = 240;
var MAX_TOPIC_ID_LEN = 120;
var MAX_TOPIC_LABEL_LEN = 240;
function sanitizeContextTagsForAxis(axis, labels) {
  const re = CONTEXT_LABEL_PATTERN[axis];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of labels) {
    const s = String(raw).trim();
    if (!s || !re.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_CONTEXT_TAGS_PER_AXIS) break;
  }
  return out;
}
function graphKeywordTagsForMobius(meta2) {
  if (meta2.userKeywordTags !== void 0) return meta2.userKeywordTags;
  return meta2.keywordTags ?? [];
}
function mergeIndexedTagsBlobForFastIndex(existingTagsJson, meta2) {
  const existing = decodeIndexedTagsBlob(existingTagsJson ?? null);
  return {
    topicTags: [...existing.topicTags],
    ...existing.topicTagEntries?.length ? { topicTagEntries: existing.topicTagEntries } : {},
    functionalTagEntries: [...existing.functionalTagEntries],
    keywordTags: meta2.keywordTags ?? [],
    ...meta2.userKeywordTags !== void 0 ? { userKeywordTags: meta2.userKeywordTags } : {},
    ...meta2.textrankKeywordTerms?.length ? { textrankKeywordTerms: meta2.textrankKeywordTerms } : {},
    timeTags: [...existing.timeTags],
    geoTags: [...existing.geoTags],
    personTags: [...existing.personTags]
  };
}
function encodeIndexedTagsBlob(blob) {
  const {
    topicTags,
    topicTagEntries,
    functionalTagEntries,
    keywordTags,
    userKeywordTags,
    textrankKeywordTerms,
    timeTags,
    geoTags,
    personTags
  } = blob;
  if (!topicTags.length && !(topicTagEntries?.length ?? 0) && !functionalTagEntries.length && !keywordTags.length && !(userKeywordTags?.length ?? 0) && !(textrankKeywordTerms?.length ?? 0) && !timeTags.length && !geoTags.length && !personTags.length) {
    return null;
  }
  const payload = {
    topicTags,
    functionalTagEntries,
    keywordTags,
    timeTags,
    geoTags,
    personTags
  };
  if (topicTagEntries?.length) {
    payload.topicTagEntries = topicTagEntries;
  }
  if (userKeywordTags?.length) {
    payload.userKeywordTags = userKeywordTags;
  }
  if (textrankKeywordTerms?.length) {
    payload.textrankKeywordTerms = textrankKeywordTerms;
  }
  return JSON.stringify(payload);
}
function asStrArr(v) {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}
function parseTopicTagEntriesFromUnknown(topicTagEntriesRaw, legacyTopicTags) {
  const fromObjects = [];
  if (Array.isArray(topicTagEntriesRaw)) {
    const seen = /* @__PURE__ */ new Set();
    for (const item of topicTagEntriesRaw) {
      if (!item || typeof item !== "object") continue;
      const o = item;
      const id = String(o.id ?? "").trim().slice(0, MAX_TOPIC_ID_LEN);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const labelRaw = o.label;
      const label = typeof labelRaw === "string" ? labelRaw.trim().slice(0, MAX_TOPIC_LABEL_LEN) : "";
      fromObjects.push(label ? { id, label } : { id });
    }
    if (fromObjects.length) return fromObjects;
  }
  const legacy = asStrArr(legacyTopicTags).map((s) => s.trim().slice(0, MAX_TOPIC_ID_LEN)).filter(Boolean);
  return legacy.map((id) => ({ id }));
}
function parseFunctionalTagEntriesFromUnknown(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item;
    const id = String(o.id ?? "").trim();
    if (!id || !functionalSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    const labelRaw = o.label;
    const label = typeof labelRaw === "string" ? labelRaw.trim().slice(0, MAX_FUNCTIONAL_LABEL_LEN) : "";
    out.push(label ? { id, label } : { id });
  }
  return out;
}
function decodeIndexedTagsBlob(raw) {
  if (raw == null || raw === "") {
    return { ...EMPTY_TAGS_BLOB };
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        topicTags: parsed.map(String).filter(Boolean),
        functionalTagEntries: [],
        keywordTags: [],
        timeTags: [],
        geoTags: [],
        personTags: []
      };
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed;
      const fromObjects = parseFunctionalTagEntriesFromUnknown(o.functionalTagEntries);
      const legacyIds = asStrArr(o.functionalTags).filter((id) => functionalSet.has(id));
      const functionalTagEntries = fromObjects.length > 0 ? fromObjects : legacyIds.map((id) => ({ id }));
      const topicTagEntries = parseTopicTagEntriesFromUnknown(o.topicTagEntries, o.topicTags);
      const topicIds = topicTagEntries.map((e) => e.id);
      const keywordTags = asStrArr(o.keywordTags);
      const userKw = o.userKeywordTags !== void 0 ? asStrArr(o.userKeywordTags) : void 0;
      const trKw = o.textrankKeywordTerms !== void 0 ? asStrArr(o.textrankKeywordTerms) : void 0;
      return {
        topicTags: topicIds.length ? topicIds : asStrArr(o.topicTags),
        topicTagEntries: topicTagEntries.length ? topicTagEntries : void 0,
        functionalTagEntries,
        keywordTags,
        ...userKw !== void 0 ? { userKeywordTags: userKw } : {},
        ...trKw !== void 0 ? { textrankKeywordTerms: trKw } : {},
        timeTags: asStrArr(o.timeTags),
        geoTags: asStrArr(o.geoTags),
        personTags: asStrArr(o.personTags)
      };
    }
  } catch {
  }
  return { ...EMPTY_TAGS_BLOB };
}
function filterValidTopicTagEntries(entries) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const e of entries) {
    const id = typeof e?.id === "string" ? e.id.trim().slice(0, MAX_TOPIC_ID_LEN) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = typeof e.label === "string" ? e.label.trim().slice(0, MAX_TOPIC_LABEL_LEN) : "";
    out.push(label ? { id, label } : { id });
    if (out.length >= 12) break;
  }
  return out;
}
function filterValidFunctionalTagEntries(entries) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const e of entries) {
    if (!e?.id || !functionalSet.has(e.id)) continue;
    const id = e.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const label = typeof e.label === "string" ? e.label.trim().slice(0, MAX_FUNCTIONAL_LABEL_LEN) : "";
    out.push(label ? { id, label } : { id });
  }
  return out;
}
var llmFunctionalTagEntryLooseSchema = import_v39.z.object({
  id: import_v39.z.string().min(1).max(80),
  label: import_v39.z.string().max(MAX_FUNCTIONAL_LABEL_LEN).optional()
});
function mapLlmFunctionalIdToCanonical(raw) {
  const id = String(raw).trim();
  if (!id) return null;
  if (functionalSet.has(id)) return id;
  if (Object.prototype.hasOwnProperty.call(SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS, id)) {
    const mapped = SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS[id];
    return mapped?.[0] ?? null;
  }
  return null;
}
var topicTagEntrySchema = import_v39.z.object({
  id: import_v39.z.string().max(MAX_TOPIC_ID_LEN),
  label: import_v39.z.string().max(MAX_TOPIC_LABEL_LEN).optional()
});
var DOC_TYPE_LLM = [
  "principle",
  "profile",
  "index",
  "daily",
  "project",
  "note",
  "other"
];
var docTagResponseSchema = import_v39.z.object({
  topicTagEntries: import_v39.z.array(topicTagEntrySchema).max(12).default([]),
  /** @deprecated LLM may still return plain strings; mapped to `{ id }` when topicTagEntries is empty. */
  topicTags: import_v39.z.array(import_v39.z.string()).max(12).optional(),
  /** At least one entry; ids normalized via {@link mapLlmFunctionalIdToCanonical}. */
  functionalTagEntries: import_v39.z.array(llmFunctionalTagEntryLooseSchema).min(1).max(5),
  timeTags: import_v39.z.array(import_v39.z.string()).max(12).default([]),
  geoTags: import_v39.z.array(import_v39.z.string()).max(12).default([]),
  personTags: import_v39.z.array(import_v39.z.string()).max(12).default([]),
  /**
   * Best estimate of first authorship / event start. Prefer compact text: `yyyyMMdd` or `yyyyMMdd HHmmss`
   * (24h). Omit or null if unknown.
   */
  inferCreatedAt: import_v39.z.string().max(48).optional().nullable(),
  /**
   * Optional vault role hints; merged into functional tag labels in code (not separate result fields).
   */
  docType: import_v39.z.enum(DOC_TYPE_LLM).optional(),
  docTypeConfidence: import_v39.z.number().min(0).max(1).optional(),
  docTypeReasoning: import_v39.z.string().max(500).optional()
});
function mergeDocVaultRoleIntoFunctionalEntries(entries, docType, docTypeConfidence, docTypeReasoning) {
  if (!docType || entries.length === 0) return entries;
  const parts = [`vaultRole:${docType}`];
  if (docTypeConfidence !== void 0 && Number.isFinite(docTypeConfidence)) {
    parts.push(`conf:${Math.round(Number(docTypeConfidence) * 100) / 100}`);
  }
  const reason = String(docTypeReasoning ?? "").trim().slice(0, 200);
  if (reason) parts.push(reason);
  const annotation = parts.join(" \xB7 ");
  const essenceIds = SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS.essence_definition;
  let i = -1;
  for (const fid of essenceIds) {
    const idx = entries.findIndex((e) => e.id === fid);
    if (idx >= 0) {
      i = idx;
      break;
    }
  }
  if (i < 0) i = 0;
  const next = entries.map((e, idx) => ({ ...e, ...idx === i ? mergeLabel(e.label, annotation) : {} }));
  return filterValidFunctionalTagEntries(next);
}
function mergeLabel(existing, annotation) {
  const prev = typeof existing === "string" ? existing.trim() : "";
  const combined = prev ? `${prev} | ${annotation}` : annotation;
  const trimmed = combined.slice(0, MAX_FUNCTIONAL_LABEL_LEN);
  return trimmed ? { label: trimmed } : {};
}
function buildDimensionFunctionalHintsTable() {
  const lines = [];
  for (const dim of SEMANTIC_DIMENSION_IDS) {
    const hints = SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS[dim];
    lines.push(`- ${dim}: ${hints.join(", ")}`);
  }
  return lines.join("\n");
}
async function extractTopicAndFunctionalTags(text, ai, options) {
  const empty = {
    topicTagEntries: [],
    topicTags: [],
    functionalTagEntries: [],
    timeTags: [],
    geoTags: [],
    personTags: [],
    llmTagRunStatus: "skipped"
  };
  if (!text.trim()) {
    return empty;
  }
  const functionalHintsTable = buildDimensionFunctionalHintsTable();
  const variables = {
    content: text,
    title: options?.title ?? "",
    existingTopicTags: options?.existingTopicTags?.length ? options.existingTopicTags.join(", ") : "",
    existingUserTags: options?.existingUserTags?.trim() ?? "",
    ...options?.textrankKeywords?.trim() ? { textrankKeywords: options.textrankKeywords.trim() } : {},
    ...options?.textrankSentences?.trim() ? { textrankSentences: options.textrankSentences.trim() } : {},
    functionalHintsTable,
    functionalTagList: FUNCTIONAL_TAG_IDS.join(", ")
  };
  let normalized;
  let tagUsage;
  let tagCostUsd;
  const tTag = Date.now();
  console.info("[MarkdownDocumentLoader] DocTagGenerateJson LLM start", {
    title: options?.title ?? "",
    contentChars: text.length
  });
  try {
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    normalized = await ai.queryStructured(
      "doc-tag-generate-json" /* DocTagGenerateJson */,
      variables,
      zodToJsonSchema(docTagResponseSchema)
    );
    console.info("[MarkdownDocumentLoader] DocTagGenerateJson LLM done", {
      title: options?.title ?? "",
      elapsedMs: Date.now() - tTag
    });
  } catch (err) {
    console.warn("[MarkdownDocumentLoader] DocTagGenerateJson LLM failed or skipped", {
      title: options?.title ?? "",
      elapsedMs: Date.now() - tTag,
      error: err instanceof Error ? err.message : String(err)
    });
    return {
      ...empty,
      llmTagRunStatus: "failed"
    };
  }
  let inferCreatedAtMs;
  if (normalized.inferCreatedAt != null && String(normalized.inferCreatedAt).trim()) {
    const raw = String(normalized.inferCreatedAt).trim();
    inferCreatedAtMs = parseInferCreatedAtStringToMs(raw) ?? parseLooseTimestampToMs(raw);
  }
  const fromLlmObjects = normalized.topicTagEntries.map((e) => ({
    id: e.id,
    ...e.label ? { label: e.label } : {}
  }));
  const legacyStrings = (normalized.topicTags ?? []).map((id) => ({ id }));
  const topicTagEntries = filterValidTopicTagEntries(
    fromLlmObjects.length > 0 ? fromLlmObjects : legacyStrings
  );
  const topicTags = topicTagEntries.map((e) => e.id);
  const mappedFunctional = [];
  for (const e of normalized.functionalTagEntries) {
    const canonical = mapLlmFunctionalIdToCanonical(e.id);
    if (!canonical) continue;
    const label = typeof e.label === "string" ? e.label.trim().slice(0, MAX_FUNCTIONAL_LABEL_LEN) : "";
    mappedFunctional.push(label ? { id: canonical, label } : { id: canonical });
  }
  let functionalTagEntries = filterValidFunctionalTagEntries(mappedFunctional);
  if (functionalTagEntries.length === 0) {
    console.info("[MarkdownDocumentLoader] DocTagGenerateJson: no valid functional tags after filter", {
      title: options?.title ?? ""
    });
    return {
      ...empty,
      topicTagEntries,
      topicTags,
      llmTagRunStatus: "failed",
      ...tagUsage ? { llmUsage: tagUsage, llmCostUsd: tagCostUsd } : {}
    };
  }
  functionalTagEntries = mergeDocVaultRoleIntoFunctionalEntries(
    functionalTagEntries,
    normalized.docType,
    normalized.docTypeConfidence,
    normalized.docTypeReasoning
  );
  return {
    topicTagEntries,
    topicTags,
    functionalTagEntries,
    timeTags: sanitizeContextTagsForAxis("time", normalized.timeTags),
    geoTags: sanitizeContextTagsForAxis("geo", normalized.geoTags),
    personTags: sanitizeContextTagsForAxis("person", normalized.personTags),
    llmTagRunStatus: "success",
    ...inferCreatedAtMs !== void 0 ? { inferCreatedAtMs } : {},
    ...tagUsage ? { llmUsage: tagUsage, llmCostUsd: tagCostUsd } : {}
  };
}

// src/core/utils/text-language-detect.ts
var SAMPLE_MAX = 12e3;
function stripLikeTextRank(markdown) {
  let s = markdown.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`[^`\n]+`/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
function detectTextLocaleStem(text) {
  const s = stripLikeTextRank(text).slice(0, SAMPLE_MAX);
  if (!s) return "en";
  let hir = 0;
  let kat = 0;
  let hang = 0;
  let cjk = 0;
  let lat = 0;
  let cyr = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 12352 && c <= 12447) hir++;
    else if (c >= 12448 && c <= 12543) kat++;
    else if (c >= 44032 && c <= 55215) hang++;
    else if (c >= 19968 && c <= 40959) cjk++;
    else if (c >= 65 && c <= 90 || c >= 97 && c <= 122) lat++;
    else if (c >= 1024 && c <= 1279) cyr++;
  }
  const kana = hir + kat;
  const letters = lat + cyr;
  if (kana >= 3) return "ja";
  if (hang >= 10 && hang >= (hang + cjk + kana + letters) * 0.2) return "ko";
  if (cjk >= 24 && cjk >= (cjk + letters) * 0.32) return "zh";
  if (cyr >= 16 && cyr >= (cyr + lat) * 0.22) return "ru";
  return "en";
}

// src/core/utils/stopword-utils.ts
var stopwordCache = /* @__PURE__ */ new Map();
function normalizeLocaleKey(locale) {
  return locale.trim().toLowerCase().replace(/_/g, "-");
}
function pickLoadedStopwordStem(detected) {
  const norm = normalizeLocaleKey(detected);
  const primary = norm.split("-")[0] ?? norm;
  const candidates = [norm];
  if (primary === "cmn") candidates.push("zh");
  candidates.push(primary);
  for (const k of candidates) {
    if (k && k !== "common" && stopwordCache.has(k)) return k;
  }
  if (stopwordCache.has("en")) return "en";
  return primary;
}
function resolveTextRankLocaleFromStripped(strippedText) {
  return pickLoadedStopwordStem(detectTextLocaleStem(strippedText));
}
function getTextStopwordsForLocale(locale) {
  const common = stopwordCache.get("common") ?? /* @__PURE__ */ new Set();
  if (!locale?.trim()) {
    const local = stopwordCache.get("en") ?? /* @__PURE__ */ new Set();
    return /* @__PURE__ */ new Set([...common, ...local]);
  }
  const raw = normalizeLocaleKey(locale);
  const primary = raw.split("-")[0] ?? raw;
  const tryKeys = [raw, primary === "cmn" ? "zh" : "", primary].filter(Boolean);
  for (const k of tryKeys) {
    if (k === "common") continue;
    if (stopwordCache.has(k)) {
      const local = stopwordCache.get(k);
      return /* @__PURE__ */ new Set([...common, ...local]);
    }
  }
  const fallback = stopwordCache.get("en") ?? /* @__PURE__ */ new Set();
  return /* @__PURE__ */ new Set([...common, ...fallback]);
}

// src/core/document/loader/helper/textRank.ts
var DEFAULT_OPTS = {
  maxContentChars: 12e4,
  wordWindow: 4,
  maxTerms: 20,
  maxSentences: 8,
  maxSentencesInGraph: 80,
  damping: 0.85,
  iterations: 40,
  minWordLength: 2
};
function stripForTextRank(markdown) {
  let s = markdown.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`[^`\n]+`/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
function tokenizeForTextRank(text, minWordLength, options) {
  const locale = options?.locale;
  const stopwords = options?.stopwords ?? getTextStopwordsForLocale(locale);
  const segmented = segmentToWhitespace(text, locale);
  const out = [];
  const minCjkLength = locale?.toLowerCase().startsWith("zh") ? 2 : 1;
  for (const raw of segmented.split(/\s+/)) {
    const t = normalizeForSearch(raw).trim();
    if (!t) continue;
    if (stopwords.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    if (/^[a-z]+$/.test(t) && t.length < minWordLength) continue;
    if (/[\u4e00-\u9fff]/.test(t) && t.length < minCjkLength) continue;
    if (/^\p{P}+$/u.test(t)) continue;
    out.push(t);
  }
  return out;
}
function buildWordGraph(tokens, windowSize) {
  const adj = /* @__PURE__ */ new Map();
  const addEdge = (a, b) => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    if (!adj.has(x)) adj.set(x, /* @__PURE__ */ new Map());
    if (!adj.has(y)) adj.set(y, /* @__PURE__ */ new Map());
    const mx = adj.get(x);
    const my = adj.get(y);
    mx.set(y, (mx.get(y) ?? 0) + 1);
    my.set(x, (my.get(x) ?? 0) + 1);
  };
  for (let i = 0; i < tokens.length; i++) {
    const end = Math.min(i + windowSize, tokens.length);
    for (let j = i + 1; j < end; j++) {
      addEdge(tokens[i], tokens[j]);
    }
  }
  return adj;
}
function outWeightSum(node, adj) {
  const m = adj.get(node);
  if (!m) return 0;
  let s = 0;
  for (const w of m.values()) s += w;
  return s;
}
function pageRankWeighted(nodes, adj, options) {
  const n = nodes.length;
  if (n === 0) return /* @__PURE__ */ new Map();
  const nodeSet = new Set(nodes);
  let scores = /* @__PURE__ */ new Map();
  const init = 1 / n;
  for (const v of nodes) scores.set(v, init);
  for (let it = 0; it < options.iterations; it++) {
    const next = /* @__PURE__ */ new Map();
    for (const vi of nodes) {
      let sum = 0;
      const neighbors = adj.get(vi);
      if (neighbors) {
        for (const [j, wji] of neighbors) {
          if (!nodeSet.has(j)) continue;
          const outJ = outWeightSum(j, adj);
          if (outJ <= 0) continue;
          const sj = scores.get(j) ?? 0;
          sum += wji / outJ * sj;
        }
      }
      const val = (1 - options.damping) / n + options.damping * sum;
      next.set(vi, val);
    }
    scores = next;
  }
  return scores;
}
function splitSentences(text) {
  const parts = text.split(/(?<=[.!?。！？])\s+|\n+/);
  const out = [];
  for (const p of parts) {
    const t = p.trim().replace(/\s+/g, " ");
    if (t.length >= 12) out.push(t);
  }
  return out;
}
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter++;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}
function buildSentenceGraph(sentences, tokenize) {
  const adj = /* @__PURE__ */ new Map();
  const sets = sentences.map((s) => new Set(tokenize(s)));
  const n = sentences.length;
  const addEdge = (i, j, w) => {
    if (i === j || w <= 0) return;
    const a = String(i);
    const b = String(j);
    if (!adj.has(a)) adj.set(a, /* @__PURE__ */ new Map());
    if (!adj.has(b)) adj.set(b, /* @__PURE__ */ new Map());
    const ma = adj.get(a);
    const mb = adj.get(b);
    const cur = ma.get(b) ?? 0;
    ma.set(b, cur + w);
    mb.set(a, cur + w);
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = jaccard(sets[i], sets[j]);
      if (sim > 0) addEdge(i, j, sim);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    addEdge(i, i + 1, 0.05);
  }
  return adj;
}
function sentenceNodeIds(n) {
  return Array.from({ length: n }, (_, i) => String(i));
}
function extractTextRankFeatures(rawText, options) {
  const o = { ...DEFAULT_OPTS, ...options };
  const stopwords = o.stopwords ?? getTextStopwordsForLocale(o.locale);
  let text = stripForTextRank(rawText);
  if (text.length > o.maxContentChars) {
    text = text.slice(0, o.maxContentChars);
  }
  const tokens = tokenizeForTextRank(text, o.minWordLength, {
    locale: o.locale,
    stopwords
  });
  if (tokens.length === 0) {
    return { topTerms: [], topSentences: [] };
  }
  const wordAdj = buildWordGraph(tokens, o.wordWindow);
  const vocab = [...new Set(tokens)];
  const wordScores = pageRankWeighted(vocab, wordAdj, { damping: o.damping, iterations: o.iterations });
  const topTerms = [...wordScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, o.maxTerms).map(([term, score]) => ({ term, score }));
  let sentences = splitSentences(text);
  if (sentences.length > o.maxSentencesInGraph) {
    sentences = sentences.slice(0, o.maxSentencesInGraph);
  }
  const tok = (s) => tokenizeForTextRank(s, o.minWordLength, {
    locale: o.locale,
    stopwords
  });
  if (sentences.length < 2) {
    const one = sentences[0];
    return {
      topTerms,
      topSentences: one ? [{ text: one, score: 1, index: 0 }] : []
    };
  }
  const sentAdj = buildSentenceGraph(sentences, tok);
  const sentIds = sentenceNodeIds(sentences.length);
  const sentScores = pageRankWeighted(sentIds, sentAdj, { damping: o.damping, iterations: o.iterations });
  const topSentences = [...sentScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, o.maxSentences).map(([id, score]) => ({
    text: sentences[Number(id)] ?? "",
    score,
    index: Number(id)
  })).filter((x) => x.text.length > 0);
  return { topTerms, topSentences };
}
var KEYWORD_TAGS_MAX_TOTAL = 40;
var KEYWORD_TAGS_MAX_TEXTRANK = 20;
function computeKeywordTagBundles(userTags, topTerms) {
  const seen = /* @__PURE__ */ new Set();
  const lower = (s) => s.toLowerCase();
  const mergedKeywordTags = [];
  for (const u of userTags) {
    const k = lower(u);
    if (seen.has(k)) continue;
    seen.add(k);
    mergedKeywordTags.push(u);
  }
  const userKeywordTags = [...mergedKeywordTags];
  const textrankKeywordTerms = [];
  let trAdded = 0;
  for (const { term } of topTerms) {
    if (mergedKeywordTags.length >= KEYWORD_TAGS_MAX_TOTAL) break;
    const k = lower(term);
    if (seen.has(k)) continue;
    seen.add(k);
    mergedKeywordTags.push(term);
    textrankKeywordTerms.push(term);
    trAdded++;
    if (trAdded >= KEYWORD_TAGS_MAX_TEXTRANK) break;
  }
  return { userKeywordTags, textrankKeywordTerms, mergedKeywordTags };
}

// src/core/document/loader/helper/assembleIndexedChunks.ts
var import_textsplitters = require("@langchain/textsplitters");
async function splitSummaryWithMarkdownSplitter(text, maxChunkSize, chunkOverlap) {
  const s = text.trim();
  if (!s.length) return [];
  if (maxChunkSize < 1) return [s];
  const splitter = import_textsplitters.RecursiveCharacterTextSplitter.fromLanguage("markdown", {
    chunkSize: maxChunkSize,
    chunkOverlap
  });
  const docs = await splitter.createDocuments([s]);
  return docs.map((d) => d.pageContent.trim()).filter(Boolean);
}
async function assembleIndexedChunks(doc, bodyChunks, chunking) {
  const maxChunkSize = chunking.maxChunkSize;
  const chunkOverlap = chunking.chunkOverlap;
  const out = bodyChunks.map((c, i) => ({
    ...c,
    chunkType: c.chunkType ?? "body_raw",
    chunkIndex: c.chunkIndex ?? i
  }));
  let idx = out.length;
  const summarySources = [];
  const short = doc.summary?.trim();
  if (short) summarySources.push({ chunkType: "summary_short", text: short, baseTitle: "Short summary" });
  const full = doc.fullSummary?.trim();
  if (full) summarySources.push({ chunkType: "summary_full", text: full, baseTitle: "Full summary" });
  for (const src of summarySources) {
    const slices = await splitSummaryWithMarkdownSplitter(src.text, maxChunkSize, chunkOverlap);
    const n = slices.length;
    for (let si = 0; si < n; si++) {
      out.push({
        docId: doc.id,
        chunkType: src.chunkType,
        content: slices[si],
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: idx++,
        title: n > 1 ? `${src.baseTitle} (${si + 1}/${n})` : src.baseTitle,
        chunkMeta: n > 1 ? { summarySource: "llm", summarySliceIndex: si, summarySliceCount: n } : { summarySource: "llm" }
      });
    }
  }
  const structured = doc.metadata?.custom?.textrankSentencesStructured;
  if (Array.isArray(structured) && structured.length) {
    const top = structured.slice(0, SLICE_CAPS.indexing.structuredChunkTop);
    for (const s of top) {
      const t = s.text?.trim();
      if (!t) continue;
      out.push({
        docId: doc.id,
        chunkType: "salient_textrank_sentence",
        content: t,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: idx++,
        chunkMeta: { textrankScore: s.score, textrankIndex: s.index }
      });
    }
  }
  return out;
}

// src/core/document/loader/BaseDocumentLoader.ts
var import_obsidian10 = __toESM(require_obsidian_stub());
var import_textsplitters2 = require("@langchain/textsplitters");
var BaseDocumentLoader = class {
  constructor(app, aiServiceManager) {
    this.app = app;
    this.aiServiceManager = aiServiceManager;
  }
  /**
   * Check whether a vault path matches this loader's supported extensions.
   * Override for compound extensions like `.excalidraw.md`.
   */
  matchesPath(path4) {
    const ext = path4.split(".").pop()?.toLowerCase() ?? "";
    return this.getSupportedExtensions().includes(ext);
  }
  async readByPath(path4, genCacheContent, readOptions) {
    const file = this.app.vault.getAbstractFileByPath(path4);
    if (!file || !(file instanceof import_obsidian10.TFile)) return null;
    if (!this.matchesPath(path4)) return null;
    return this.readFile(file, genCacheContent, readOptions);
  }
  // ── Chunking (default: RecursiveCharacterTextSplitter) ──────────
  /**
   * Returns the content string to chunk.
   * Default uses `sourceFileInfo.content`; binary-source loaders (Docx, Pptx, PDF, Image)
   * should override to return `cacheFileInfo.content`.
   */
  getContentForChunking(doc) {
    return doc.sourceFileInfo.content;
  }
  async chunkContent(doc, settings) {
    const content = this.getContentForChunking(doc);
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(
        doc,
        [{ docId: doc.id, chunkType: "body_raw", content }],
        settings
      );
    }
    const splitter = new import_textsplitters2.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = langchainDocs.map((lc, i) => ({
      docId: doc.id,
      chunkType: "body_raw",
      content: lc.pageContent,
      chunkId: generateUuidWithoutHyphens(),
      chunkIndex: i
    }));
    return assembleIndexedChunks(doc, chunks, settings);
  }
  // ── Scanning ────────────────────────────────────────────────────
  async *scanDocuments(params) {
    const limit = params?.limit ?? Infinity;
    const batchSize = params?.batchSize ?? 100;
    const docType = this.getDocumentType();
    const files = this.app.vault.getFiles().filter((f) => this.matchesPath(f.path)).slice(0, limit);
    let batch = [];
    for (const file of files) {
      batch.push({ path: file.path, mtime: file.stat.mtime, type: docType });
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  }
  // ── Summary ─────────────────────────────────────────────────────
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error(
        `${this.constructor.name} requires AIServiceManager to generate summaries`
      );
    }
    if (typeof source === "string") {
      throw new Error(
        `${this.constructor.name}.getSummary requires a Document, not a string`
      );
    }
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
};

// src/core/document/loader/MarkdownDocumentLoader.ts
var MarkdownDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
  }
  getDocumentType() {
    return "markdown";
  }
  getSupportedExtensions() {
    return ["md", "markdown"];
  }
  /**
   * Splits markdown body with RecursiveCharacterTextSplitter, then appends summary / TextRank chunks for indexing.
   */
  async chunkContent(doc, settings) {
    let content = doc.sourceFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(
        doc,
        [
          {
            docId: doc.id,
            chunkType: "body_raw",
            content
          }
        ],
        settings
      );
    }
    content = preprocessMarkdownForChunking(content, settings);
    const splitter = import_textsplitters3.RecursiveCharacterTextSplitter.fromLanguage("markdown", {
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = [];
    for (let i = 0; i < langchainDocs.length; i++) {
      const langchainDoc = langchainDocs[i];
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: langchainDoc.pageContent,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: i
      });
    }
    return assembleIndexedChunks(doc, chunks, settings);
  }
  /**
   * Read a markdown file and convert to core Document model.
   * TextRank always runs. LLM tag/summary runs only when {@link DocumentLoaderReadOptions} allows (default: on).
   */
  async readFile(file, _genCacheContent, readOptions) {
    const includeLlmTags = readOptions?.includeLlmTags ?? true;
    const includeLlmSummary = readOptions?.includeLlmSummary ?? true;
    return this.readMarkdownFile(file, {
      includeLlmTags,
      includeLlmSummary,
      onLlmIndexingComplete: readOptions?.onLlmIndexingComplete
    });
  }
  async readMarkdownFile(file, readOptions) {
    const tRead = Date.now();
    try {
      const content = await this.app.vault.cachedRead(file);
      const contentHash = hashString(content, 8);
      const parseResult = await parseMarkdownWithRemark(content, {
        resolveWikiLinkToPath: (linkText) => {
          const dest = this.app.metadataCache.getFirstLinkpathDest(linkText, file.path);
          return dest?.path ?? null;
        }
      });
      let title = parseResult.title || file.basename;
      const userKeywordTags = [...new Set(parseResult.tags.map((t) => String(t).trim()).filter(Boolean))];
      let mergedKeywordTags = userKeywordTags;
      let textrankKeywordTerms = [];
      const localeForTextRank = resolveTextRankLocaleFromStripped(stripForTextRank(content));
      const textRankSnapshot = extractTextRankFeatures(content, { locale: localeForTextRank });
      const bundles = computeKeywordTagBundles(userKeywordTags, textRankSnapshot.topTerms);
      mergedKeywordTags = bundles.mergedKeywordTags;
      textrankKeywordTerms = bundles.textrankKeywordTerms;
      const textrankKeywordsStructured = textRankSnapshot.topTerms.map(({ term, score }) => ({ term, score }));
      const textrankSentencesStructured = textRankSnapshot.topSentences.map((s) => ({
        text: s.text,
        score: s.score,
        index: s.index
      }));
      const textrankKeywordsForLlm = textrankKeywordsStructured.map((t) => t.term).join(", ");
      const textrankSentencesForLlm = textrankSentencesStructured.length ? textrankSentencesStructured.map((s, i) => `${i + 1}. ${s.text}`).join("\n") : "";
      const summaryDocStub = {
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title,
          topicTags: [],
          topicTagEntries: [],
          functionalTagEntries: [],
          keywordTags: mergedKeywordTags,
          userKeywordTags,
          ...textrankKeywordTerms.length ? { textrankKeywordTerms } : {},
          custom: {
            textrankKeywordsStructured,
            textrankSentencesStructured
          }
        }
      };
      const runTagLlm = readOptions.includeLlmTags && Boolean(this.aiServiceManager);
      const runSummaryLlm = readOptions.includeLlmSummary && Boolean(this.aiServiceManager);
      const tLlm = Date.now();
      if (runTagLlm || runSummaryLlm) {
        console.info("[MarkdownDocumentLoader] readMarkdownFile: LLM batch start", {
          path: file.path,
          contentChars: content.length,
          elapsedSinceReadMs: tLlm - tRead,
          runTagLlm,
          runSummaryLlm
        });
      }
      const emptyTag = {
        topicTagEntries: [],
        topicTags: [],
        functionalTagEntries: [],
        timeTags: [],
        geoTags: [],
        personTags: [],
        llmTagRunStatus: "failed"
      };
      const failedTag = { ...emptyTag, llmTagRunStatus: "failed" };
      const skippedTag = { ...emptyTag, llmTagRunStatus: "skipped" };
      const [tagRes, summaryContent] = await Promise.all([
        runTagLlm ? extractTopicAndFunctionalTags(content, this.aiServiceManager, {
          title,
          existingUserTags: userKeywordTags.length ? userKeywordTags.join(", ") : void 0,
          textrankKeywords: textrankKeywordsForLlm || void 0,
          textrankSentences: textrankSentencesForLlm || void 0
        }).catch((err) => {
          console.warn("[MarkdownDocumentLoader] extractTopicAndFunctionalTags failed:", err);
          return failedTag;
        }) : Promise.resolve(skippedTag),
        runSummaryLlm ? getDefaultDocumentSummary(summaryDocStub, this.aiServiceManager) : Promise.resolve({
          shortSummary: "",
          fullSummary: void 0,
          llmUsage: emptyUsage(),
          llmCostUsd: 0
        })
      ]);
      if (runTagLlm || runSummaryLlm) {
        console.info("[MarkdownDocumentLoader] readMarkdownFile: LLM batch done", {
          path: file.path,
          llmBatchMs: Date.now() - tLlm,
          elapsedSinceReadMs: Date.now() - tRead
        });
      }
      if (readOptions.onLlmIndexingComplete && (runTagLlm || runSummaryLlm)) {
        let mergedUsage = emptyUsage();
        let mergedCostUsd = 0;
        if (runTagLlm && tagRes.llmUsage) {
          mergedUsage = mergeTokenUsage(mergedUsage, tagRes.llmUsage);
          mergedCostUsd += tagRes.llmCostUsd ?? 0;
        }
        if (runSummaryLlm && "llmUsage" in summaryContent) {
          mergedUsage = mergeTokenUsage(mergedUsage, summaryContent.llmUsage);
          mergedCostUsd += summaryContent.llmCostUsd;
        }
        readOptions.onLlmIndexingComplete({
          path: file.path,
          durationMs: Date.now() - tLlm,
          usage: mergedUsage,
          costUsd: mergedCostUsd
        });
      }
      const functionalTagStatus = !runTagLlm ? "pending" : tagRes.llmTagRunStatus === "failed" || tagRes.functionalTagEntries.length === 0 ? "failed" : "success";
      return {
        id: generateDocIdFromPath(file.path),
        type: "markdown",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title,
          topicTags: runTagLlm ? tagRes.topicTags : [],
          topicTagEntries: runTagLlm && tagRes.topicTagEntries.length ? tagRes.topicTagEntries : void 0,
          functionalTagEntries: runTagLlm ? tagRes.functionalTagEntries : [],
          keywordTags: mergedKeywordTags,
          userKeywordTags,
          ...textrankKeywordTerms.length ? { textrankKeywordTerms } : {},
          timeTags: runTagLlm ? tagRes.timeTags : [],
          geoTags: runTagLlm ? tagRes.geoTags : [],
          personTags: runTagLlm ? tagRes.personTags : [],
          ...runTagLlm && tagRes.inferCreatedAtMs !== void 0 && Number.isFinite(tagRes.inferCreatedAtMs) ? { inferCreatedAt: tagRes.inferCreatedAtMs } : {},
          frontmatter: parseResult.frontmatter ? { ...parseResult.frontmatter } : void 0,
          custom: {
            textrankKeywordsStructured,
            textrankSentencesStructured,
            llmTagRunStatus: tagRes.llmTagRunStatus,
            functionalTagStatus
          }
        },
        ...runSummaryLlm ? {
          summary: summaryContent.shortSummary?.trim() ? summaryContent.shortSummary : null,
          fullSummary: summaryContent.fullSummary ?? null
        } : {},
        contentHash,
        references: parseResult.references,
        lastProcessedAt: Date.now()
      };
    } catch (error) {
      console.error("Error reading markdown file:", error);
      return null;
    }
  }
  /**
   * Get summary for a markdown document
   * // todo implement getSummary. many types: raw knowledge base markdown, conv and project markdown, resources markdown
   */
  async getSummary(source, provider, modelId) {
    return getDefaultDocumentSummary(source, this.aiServiceManager, provider, modelId);
  }
};

// src/core/document/loader/TextDocumentLoader.ts
var TextDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
  }
  getDocumentType() {
    return "txt";
  }
  getSupportedExtensions() {
    return ["txt"];
  }
  async readFile(file) {
    try {
      const content = await this.app.vault.cachedRead(file);
      const contentHash = hashString(content, 8);
      return {
        id: generateDocIdFromPath(file.path),
        type: "txt",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/TableDocumentLoader.ts
var TableDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
  }
  getDocumentType() {
    return "csv";
  }
  getSupportedExtensions() {
    return ["csv", "xlsx"];
  }
  /**
   * Custom chunking: each row becomes a chunk; long rows are split with overlap.
   */
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const rows = content.split("\n").filter((row) => row.trim().length > 0);
    const maxChunkSize = settings.maxChunkSize;
    const overlap = settings.chunkOverlap;
    const chunks = [];
    let chunkIndex = 0;
    for (const row of rows) {
      if (row.length <= maxChunkSize) {
        chunks.push({
          docId: doc.id,
          chunkType: "body_raw",
          content: row,
          chunkId: generateUuidWithoutHyphens(),
          chunkIndex: chunkIndex++
        });
      } else {
        let start = 0;
        while (start < row.length) {
          const end = Math.min(start + maxChunkSize, row.length);
          const chunkContent = row.substring(start, end);
          chunks.push({
            docId: doc.id,
            chunkType: "body_raw",
            content: chunkContent,
            chunkId: generateUuidWithoutHyphens(),
            chunkIndex: chunkIndex++
          });
          start = end - overlap;
          if (start >= row.length) break;
        }
      }
    }
    return assembleIndexedChunks(doc, chunks, settings);
  }
  async readFile(file) {
    try {
      let content = "";
      const ext = file.extension.toLowerCase();
      if (ext === "csv") {
        content = await this.app.vault.cachedRead(file);
      } else if (ext === "xlsx") {
        console.warn("XLSX parsing not supported: no xlsx library available");
        return null;
      }
      const contentHash = hashString(content, 8);
      return {
        id: generateDocIdFromPath(file.path),
        type: "csv",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/JsonDocumentLoader.ts
var import_textsplitters4 = require("@langchain/textsplitters");
var JsonDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
  }
  getDocumentType() {
    return "json";
  }
  getSupportedExtensions() {
    return ["json"];
  }
  /**
   * Custom chunking: JSON arrays get per-item chunks; objects use text splitting.
   * Falls back to plain text splitting if JSON parse fails.
   */
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const minSize = settings.minDocumentSizeForChunking;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        const chunks = parsed.map((item, i) => ({
          docId: doc.id,
          chunkType: "body_raw",
          content: JSON.stringify(item, null, 2),
          chunkId: generateUuidWithoutHyphens(),
          chunkIndex: i
        }));
        return assembleIndexedChunks(doc, chunks, settings);
      }
      return this.splitAsText(doc, content, minSize, settings);
    } catch {
      return this.splitAsText(doc, content, minSize, settings);
    }
  }
  async splitAsText(doc, content, minSize, settings) {
    if (content.length <= minSize) {
      return assembleIndexedChunks(
        doc,
        [{ docId: doc.id, chunkType: "body_raw", content }],
        settings
      );
    }
    const splitter = new import_textsplitters4.RecursiveCharacterTextSplitter({
      chunkSize: settings.maxChunkSize,
      chunkOverlap: settings.chunkOverlap
    });
    const langchainDocs = await splitter.createDocuments([content]);
    const chunks = langchainDocs.map((lc, i) => ({
      docId: doc.id,
      chunkType: "body_raw",
      content: lc.pageContent,
      chunkId: generateUuidWithoutHyphens(),
      chunkIndex: i
    }));
    return assembleIndexedChunks(doc, chunks, settings);
  }
  async readFile(file) {
    try {
      const content = await this.app.vault.cachedRead(file);
      const contentHash = hashString(content, 8);
      return {
        id: generateDocIdFromPath(file.path),
        type: "json",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/HtmlXmlDocumentLoader.ts
var HtmlXmlDocumentLoader = class _HtmlXmlDocumentLoader extends BaseDocumentLoader {
  static {
    this.MEANINGFUL_TAGS = ["div", "section", "article", "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th"];
  }
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
    const tagsPattern = _HtmlXmlDocumentLoader.MEANINGFUL_TAGS.join("|");
    this.tagPattern = new RegExp(`(<(?:${tagsPattern})[^>]*>)([\\s\\S]*?)(</(?:${tagsPattern})>)`, "gi");
  }
  getDocumentType() {
    return "html";
  }
  getSupportedExtensions() {
    return ["html", "htm", "xml"];
  }
  /**
   * Custom chunking: splits by meaningful HTML tags, then groups by size.
   */
  async chunkContent(doc, settings) {
    const content = doc.sourceFileInfo.content;
    const maxChunkSize = settings.maxChunkSize;
    const overlap = settings.chunkOverlap;
    const minSize = settings.minDocumentSizeForChunking;
    if (content.length <= minSize) {
      return assembleIndexedChunks(
        doc,
        [{ docId: doc.id, chunkType: "body_raw", content }],
        settings
      );
    }
    const chunks = [];
    let chunkIndex = 0;
    const segments = [];
    let lastIndex = 0;
    let match;
    this.tagPattern.lastIndex = 0;
    while ((match = this.tagPattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const beforeText = content.substring(lastIndex, match.index);
        if (beforeText.trim()) {
          segments.push(beforeText.trim());
        }
      }
      const tagContent = match[2]?.trim();
      if (tagContent) {
        segments.push(tagContent);
      }
      lastIndex = this.tagPattern.lastIndex;
    }
    if (lastIndex < content.length) {
      const remaining = content.substring(lastIndex).trim();
      if (remaining) {
        segments.push(remaining);
      }
    }
    if (segments.length === 0) {
      let start = 0;
      while (start < content.length) {
        const end = Math.min(start + maxChunkSize, content.length);
        const chunkContent = content.substring(start, end);
        chunks.push({
          docId: doc.id,
          chunkType: "body_raw",
          content: chunkContent,
          chunkId: generateUuidWithoutHyphens(),
          chunkIndex: chunkIndex++
        });
        start = end - overlap;
        if (start >= content.length) break;
      }
      return assembleIndexedChunks(doc, chunks, settings);
    }
    let currentChunk = "";
    for (const segment of segments) {
      if (segment.length > maxChunkSize) {
        if (currentChunk.length > 0) {
          chunks.push({
            docId: doc.id,
            chunkType: "body_raw",
            content: currentChunk,
            chunkId: generateUuidWithoutHyphens(),
            chunkIndex: chunkIndex++
          });
          currentChunk = "";
        }
        let segStart = 0;
        while (segStart < segment.length) {
          const segEnd = Math.min(segStart + maxChunkSize, segment.length);
          const chunkContent = segment.substring(segStart, segEnd);
          chunks.push({
            docId: doc.id,
            chunkType: "body_raw",
            content: chunkContent,
            chunkId: generateUuidWithoutHyphens(),
            chunkIndex: chunkIndex++
          });
          segStart = segEnd - overlap;
          if (segStart >= segment.length) break;
        }
      } else if (currentChunk.length + segment.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          docId: doc.id,
          chunkType: "body_raw",
          content: currentChunk,
          chunkId: generateUuidWithoutHyphens(),
          chunkIndex: chunkIndex++
        });
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + "\n" + segment;
      } else {
        currentChunk += (currentChunk ? "\n" : "") + segment;
      }
    }
    if (currentChunk.length > 0) {
      chunks.push({
        docId: doc.id,
        chunkType: "body_raw",
        content: currentChunk,
        chunkId: generateUuidWithoutHyphens(),
        chunkIndex: chunkIndex++
      });
    }
    return assembleIndexedChunks(doc, chunks, settings);
  }
  async readFile(file) {
    try {
      const content = await this.app.vault.cachedRead(file);
      const contentHash = hashString(content, 8);
      return {
        id: generateDocIdFromPath(file.path),
        type: "html",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/PdfDocumentLoader.ts
var PDFJS_CDN_VERSION = "5.4.394";
var PDF_JS_DOC_OPTIONS = {
  standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/standard_fonts/`,
  cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/cmaps/`,
  cMapPacked: true
};
var pdfWorkerSrcConfigured = false;
function ensurePdfWorkerSrc() {
  if (pdfWorkerSrcConfigured) return;
  try {
    const pdfjs = require("pdfjs-dist");
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_CDN_VERSION}/build/pdf.worker.mjs`;
      pdfWorkerSrcConfigured = true;
    }
  } catch (e) {
    console.warn("[PdfDocumentLoader] pdfjs-dist not available (external); PDF text extraction will fail.", e);
  }
}
async function extractTextFromPdfBuffer(arrayBuffer) {
  ensurePdfWorkerSrc();
  const pdfjs = require("pdfjs-dist");
  const uint8Array = new Uint8Array(arrayBuffer);
  const loadingOptions = {
    data: uint8Array,
    ...PDF_JS_DOC_OPTIONS
  };
  const loadingTask = pdfjs.getDocument(loadingOptions);
  try {
    const pdfDocument = await loadingTask.promise;
    const pageTexts = [];
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      try {
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str ?? "").join(" ");
        pageTexts.push(pageText);
      } finally {
        if (typeof page.cleanup === "function") page.cleanup();
      }
    }
    if (typeof pdfDocument.cleanup === "function") pdfDocument.cleanup();
    return pageTexts.join("\n\n");
  } finally {
    if (typeof loadingTask.destroy === "function") loadingTask.destroy();
  }
}
var PdfDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
  }
  getDocumentType() {
    return "pdf";
  }
  getSupportedExtensions() {
    return ["pdf"];
  }
  getContentForChunking(doc) {
    return doc.cacheFileInfo.content;
  }
  async readFile(file, genCacheContent) {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const sourceContentHash = binaryContentHash(arrayBuffer);
      let cacheContent = "";
      if (genCacheContent) {
        cacheContent = await extractTextFromPdfBuffer(arrayBuffer);
      }
      return {
        id: generateDocIdFromPath(file.path),
        type: "pdf",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: ""
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: cacheContent
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash: sourceContentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch (error) {
      console.error("[PdfDocumentLoader] error reading PDF file:", file.path, error);
      return null;
    }
  }
};

// src/core/document/loader/ImageDocumentLoader.ts
var ImageDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, settings, aiServiceManager) {
    super(app, aiServiceManager);
    this.settings = settings;
  }
  getDocumentType() {
    return "image";
  }
  getSupportedExtensions() {
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
  }
  getContentForChunking(doc) {
    return doc.cacheFileInfo.content;
  }
  /**
   * Custom summary: uses AI image description prompt instead of default text summary.
   */
  async getSummary(source, provider, modelId) {
    if (!this.aiServiceManager) {
      throw new Error("ImageDocumentLoader requires AIServiceManager to generate summaries");
    }
    if (typeof source === "string") {
      throw new Error("ImageDocumentLoader.getSummary requires a Document, not a string");
    }
    const doc = source;
    const content = doc.cacheFileInfo.content;
    const title = doc.metadata.title || doc.sourceFileInfo.name;
    const path4 = doc.sourceFileInfo.path;
    const shortSummary = await this.aiServiceManager.queryText(
      "image-summary" /* ImageSummary */,
      { content, title, path: path4 }
    );
    return { shortSummary, fullSummary: shortSummary };
  }
  async readFile(file, genCacheContent) {
    try {
      if (genCacheContent) {
        console.debug("[ImageDocumentLoader] reading image file:", file.path, "genCacheContent:", genCacheContent);
      }
      const realContent = await this.app.vault.readBinary(file);
      const realContentHash = binaryContentHash(realContent);
      const cacheContent = genCacheContent ? await this.generateImageDescription(file) : "";
      return {
        id: generateDocIdFromPath(file.path),
        type: "image",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: ""
          // Image has no text content in source
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: cacheContent
          // OCR and AI description
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash: realContentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
  /**
   * Generate image description using AI service or return placeholder.
   */
  async generateImageDescription(file) {
    if (!this.aiServiceManager) {
      return `[Image: ${file.basename}]`;
    }
    try {
      const response = await this.aiServiceManager.queryText(
        "image-description" /* ImageDescription */,
        null
      );
      console.debug("[ImageDocumentLoader] response:", response);
      return response || `[Image: ${file.basename}]`;
    } catch (error) {
      console.error("Error generating image description with AI:", error);
      return `[Image: ${file.basename}]`;
    }
  }
  /**
   * Get MIME type for image extension.
   */
  getMimeType(extension) {
    const ext = extension.toLowerCase();
    const mimeTypes = {
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "png": "image/png",
      "gif": "image/gif",
      "webp": "image/webp",
      "bmp": "image/bmp",
      "svg": "image/svg+xml"
    };
    return mimeTypes[ext] || "image/jpeg";
  }
};

// src/core/document/loader/DocxDocumentLoader.ts
var import_mammoth = __toESM(require("mammoth"));
var DocxDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
  }
  getDocumentType() {
    return "docx";
  }
  getSupportedExtensions() {
    return ["docx", "doc"];
  }
  getContentForChunking(doc) {
    return doc.cacheFileInfo.content;
  }
  async readFile(file, genCacheContent) {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const buffer = Buffer.from(arrayBuffer);
      const sourceContentHash = binaryContentHash(arrayBuffer);
      let cacheContent = "";
      if (genCacheContent) {
        const result = await import_mammoth.default.extractRawText({ buffer });
        cacheContent = result.value;
      }
      return {
        id: generateDocIdFromPath(file.path),
        type: "docx",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: ""
          // DOCX has no text content in source
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: cacheContent
          // Extracted text content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash: sourceContentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/PptxDocumentLoader.ts
var import_officeparser = __toESM(require("officeparser"));
var PptxDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
  }
  getDocumentType() {
    return "pptx";
  }
  getSupportedExtensions() {
    return ["pptx"];
  }
  getContentForChunking(doc) {
    return doc.cacheFileInfo.content;
  }
  async readFile(file, genCacheContent) {
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const buffer = Buffer.from(arrayBuffer);
      const sourceContentHash = binaryContentHash(arrayBuffer);
      let cacheContent = "";
      if (genCacheContent) {
        const content = await import_officeparser.default.parseOfficeAsync(buffer);
        cacheContent = content;
      }
      return {
        id: generateDocIdFromPath(file.path),
        type: "pptx",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: ""
          // PPTX has no text content in source
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content: cacheContent
          // Extracted text content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash: sourceContentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/ExcalidrawDocumentLoader.ts
var ExcalidrawDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
  }
  getDocumentType() {
    return "excalidraw";
  }
  getSupportedExtensions() {
    return ["excalidraw", "excalidraw.md"];
  }
  /**
   * Compound extensions need suffix-based matching.
   */
  matchesPath(path4) {
    return this.getSupportedExtensions().some((ext) => path4.endsWith("." + ext));
  }
  isExcalidrawMarkdown(content) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      return /^plugin:\s*excalidraw-plugin/m.test(frontmatter) || /^excalidraw-plugin/m.test(frontmatter);
    }
    return false;
  }
  async readFile(file) {
    try {
      let content = await this.app.vault.cachedRead(file);
      if (file.path.endsWith(".excalidraw.md")) {
        if (this.isExcalidrawMarkdown(content)) {
          content = content.replace(/```excalidraw[\s\S]*?```/g, "");
          content = content.replace(/```json[\s\S]*?```/g, "");
        }
      }
      const contentHash = hashString(content, 8);
      return {
        id: generateDocIdFromPath(file.path),
        type: "excalidraw",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/CanvasDocumentLoader.ts
var CanvasDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
  }
  getDocumentType() {
    return "canvas";
  }
  getSupportedExtensions() {
    return ["canvas"];
  }
  matchesPath(path4) {
    return this.getSupportedExtensions().some((ext) => path4.endsWith("." + ext));
  }
  async readFile(file) {
    try {
      const fileContents = await this.app.vault.cachedRead(file);
      const canvas = fileContents ? JSON.parse(fileContents) : {};
      const texts = [];
      for (const node of canvas.nodes ?? []) {
        if (node.type === "text" && node.text) {
          texts.push(node.text);
        } else if (node.type === "file" && node.file) {
          texts.push(node.file);
        }
      }
      for (const edge of (canvas.edges ?? []).filter((e) => !!e.label)) {
        texts.push(edge.label);
      }
      const content = texts.join("\r\n");
      const contentHash = hashString(content, 8);
      return {
        id: generateDocIdFromPath(file.path),
        type: "canvas",
        sourceFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        cacheFileInfo: {
          path: file.path,
          name: file.name,
          extension: file.extension,
          size: file.stat.size,
          mtime: file.stat.mtime,
          ctime: file.stat.ctime,
          content
        },
        metadata: {
          title: file.basename,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch {
      return null;
    }
  }
};

// src/core/document/loader/UrlDocumentLoader.ts
var import_playwright = require("@langchain/community/document_loaders/web/playwright");
var UrlDocumentLoader = class extends BaseDocumentLoader {
  constructor(app, aiServiceManager) {
    super(app, aiServiceManager);
    this.playwrightConfig = {
      launchOptions: {
        headless: true
      },
      gotoOptions: {
        waitUntil: "domcontentloaded"
      }
    };
  }
  getDocumentType() {
    return "url";
  }
  getSupportedExtensions() {
    return ["url"];
  }
  getContentForChunking(doc) {
    return doc.cacheFileInfo.content;
  }
  /**
   * For URLs, path is the URL itself — not a vault file.
   */
  async readByPath(path4, genCacheContent, _readOptions) {
    if (!this.isValidUrl(path4)) return null;
    return this.readUrl(path4, genCacheContent);
  }
  /**
   * URLs are not vault files — nothing to scan.
   */
  async *scanDocuments(_params) {
    yield [];
  }
  /** Not used — readByPath is overridden. */
  async readFile(_file) {
    return null;
  }
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  async readUrl(url, genCacheContent) {
    if (!this.isValidUrl(url)) return null;
    try {
      let content = "";
      const contentHash = hashString(url, 8);
      let title = "";
      if (genCacheContent) {
        const loader = new import_playwright.PlaywrightWebBaseLoader(url, this.playwrightConfig);
        const docs = await loader.load();
        content = docs.map((doc) => doc.pageContent).join("\n\n");
        const urlObj = new URL(url);
        title = urlObj.hostname + urlObj.pathname;
      }
      return {
        id: generateDocIdFromPath(url),
        type: "url",
        sourceFileInfo: {
          path: url,
          name: url,
          extension: "url",
          size: content.length,
          mtime: Date.now(),
          ctime: Date.now(),
          content: ""
          // URL has no source content
        },
        cacheFileInfo: {
          path: url,
          name: url,
          extension: "url",
          size: content.length,
          mtime: Date.now(),
          ctime: Date.now(),
          content
          // Extracted web content
        },
        metadata: {
          title,
          topicTags: [],
          functionalTagEntries: [],
          keywordTags: []
        },
        contentHash,
        references: {
          outgoing: [],
          incoming: []
        },
        lastProcessedAt: Date.now()
      };
    } catch (error) {
      console.error("Error loading URL:", url, error);
      return null;
    }
  }
};

// src/core/document/loader/helper/DocumentLoaderManager.ts
var DocumentLoaderManager = class _DocumentLoaderManager {
  constructor(app, settings, aiServiceManager) {
    this.loaderMap = /* @__PURE__ */ new Map();
    this.extensionToLoaderMap = /* @__PURE__ */ new Map();
    this.app = app;
    this.settings = settings;
    this.aiServiceManager = aiServiceManager;
    IgnoreService.init(settings.ignorePatterns);
    this.registerAllLoaders();
  }
  static {
    this.instance = null;
  }
  /**
   * Get the global singleton instance.
   * Must be initialized with init() before first use.
   */
  static getInstance() {
    if (!_DocumentLoaderManager.instance) {
      throw new Error("DocumentLoaderManager not initialized. Call init() first.");
    }
    return _DocumentLoaderManager.instance;
  }
  /**
   * Clear the global singleton instance.
   * Call from plugin onunload to release memory.
   */
  static clearInstance() {
    _DocumentLoaderManager.instance = null;
  }
  /**
   * Initialize the global singleton instance.
   * Should be called once during plugin initialization.
   * @param aiServiceManager Optional AI service manager for loaders that need AI capabilities (e.g., image description).
   */
  static init(app, settings, aiServiceManager) {
    if (_DocumentLoaderManager.instance) {
      console.warn("DocumentLoaderManager already initialized. Reinitializing with new settings.");
    }
    _DocumentLoaderManager.instance = new _DocumentLoaderManager(app, settings, aiServiceManager);
    return _DocumentLoaderManager.instance;
  }
  /**
   * Register all document loaders.
   */
  registerAllLoaders() {
    this.registerLoader(new MarkdownDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new TextDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new TableDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new JsonDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new HtmlXmlDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new PdfDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new ImageDocumentLoader(this.app, this.settings, this.aiServiceManager));
    this.registerLoader(new DocxDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new PptxDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new ExcalidrawDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new CanvasDocumentLoader(this.app, this.aiServiceManager));
    this.registerLoader(new UrlDocumentLoader(this.app, this.aiServiceManager));
  }
  /**
   * Update settings and reload all loaders.
   * Should be called when search settings are updated.
   */
  updateSettings(settings) {
    this.settings = settings;
    IgnoreService.getInstance().updateSettings(settings.ignorePatterns);
    this.registerAllLoaders();
  }
  /**
   * Register a custom document loader.
   * Automatically maps file extensions to loaders.
   */
  registerLoader(loader) {
    const docType = loader.getDocumentType();
    this.loaderMap.set(docType, loader);
    for (const ext of loader.getSupportedExtensions()) {
      this.extensionToLoaderMap.set(ext.toLowerCase(), loader);
    }
  }
  /**
   * Get the appropriate loader for a file extension.
   */
  getLoaderForExtension(extension) {
    return this.extensionToLoaderMap.get(extension.toLowerCase()) || null;
  }
  /**
   * Get the appropriate loader for a document type.
   */
  getLoaderForDocumentType(documentType) {
    return this.loaderMap.get(documentType) || null;
  }
  /**
   * Get the appropriate loader for a file.
   */
  getLoaderForFile(file) {
    if (!(file instanceof import_obsidian11.TFile)) return null;
    const extension = file.extension.toLowerCase();
    return this.getLoaderForExtension(extension);
  }
  getTypeForPath(path4) {
    if (path4.endsWith(".excalidraw.md") || path4.endsWith(".excalidraw")) {
      return "excalidraw";
    }
    if (path4.startsWith("http://") || path4.startsWith("https://")) {
      return "url";
    }
    const extension = path4.split(".").pop()?.toLowerCase() || "";
    return this.getLoaderForExtension(extension)?.getDocumentType() || null;
  }
  /**
   * Read a document by its path using the appropriate loader.
   * Returns core Document model.
   */
  async readByPath(path4, genCacheContent, readOptions) {
    if (genCacheContent === void 0 || genCacheContent === null) {
      genCacheContent = true;
    }
    const type = this.getTypeForPath(path4);
    if (!type) return null;
    const loader = this.loaderMap.get(type);
    if (!loader) return null;
    return await loader.readByPath(path4, genCacheContent, readOptions);
  }
  /**
   * Check if a document should be indexed based on settings and ignore patterns.
   */
  shouldIndexDocument(doc) {
    if (!(this.settings.includeDocumentTypes[doc.type] && this.loaderMap.has(doc.type))) {
      return false;
    }
    if (doc.sourceFileInfo?.path) {
      const ignoreService = IgnoreService.getInstance();
      return !ignoreService.shouldIgnore(doc.sourceFileInfo.path);
    }
    return true;
  }
  /**
   * Stream all documents from all registered loaders.
   * Returns core Document models filtered by settings.
   * Uses scanDocuments to get file list, then loads content on demand.
   */
  async *loadAllDocuments(params) {
    const batchSize = params?.batchSize ?? 25;
    let currentBatch = [];
    let batchReadStart;
    for await (const scanBatch of this.scanDocuments(params)) {
      batchReadStart = performance.now();
      for (const docMeta of scanBatch) {
        const partialDoc = {
          type: docMeta.type,
          sourceFileInfo: { path: docMeta.path }
        };
        if (!this.shouldIndexDocument(partialDoc)) {
          continue;
        }
        const doc = await this.readByPath(docMeta.path);
        if (doc) {
          currentBatch.push(doc);
          if (currentBatch.length >= batchSize) {
            console.log(
              `[DocumentLoaderManager] Yielded a batch of documents, read time: ${(performance.now() - batchReadStart).toFixed(2)} ms`
            );
            yield currentBatch;
            currentBatch = [];
            batchReadStart = performance.now();
          }
        }
      }
    }
    if (currentBatch.length > 0) {
      console.log(
        `[DocumentLoaderManager] Yielded final batch of documents, read time: ${(performance.now() - (batchReadStart ?? performance.now())).toFixed(2)} ms`
      );
      yield currentBatch;
    }
  }
  /**
   * Scan all documents metadata without loading content.
   * Returns lightweight metadata: path, mtime, type.
   * This is used for efficient index change detection.
   */
  async *scanDocuments(params) {
    const processedLoaders = /* @__PURE__ */ new Set();
    for (const loader of this.loaderMap.values()) {
      if (processedLoaders.has(loader)) continue;
      for await (const batch of loader.scanDocuments(params)) {
        yield batch;
      }
      processedLoaders.add(loader);
    }
  }
};

// src/core/embeddings/embedClient.ts
async function embedTexts(texts) {
  const startMs = Date.now();
  const registry = ProfileRegistry.getInstance();
  const profile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
  if (!profile) throw new Error("No embedding profile configured");
  const config = toEmbeddingConfig(profile);
  if (!config)
    throw new Error("Embedding endpoint not configured on active profile");
  const response = await fetch(`${config.endpoint}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({ model: config.model, input: texts })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Embedding API error ${response.status}: ${body.slice(0, 200)}`
    );
  }
  const data = await response.json();
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const embeddings = data.data.map(
    (item) => item.embedding
  );
  if (promptTokens > 0) {
    try {
      const durationMs = Date.now() - startMs;
      AppContext.getInstance().eventBus.dispatch(new UsageRecordedViewEvent({
        sessionId: crypto.randomUUID(),
        feature: "indexing",
        action: "embed",
        provider: profile.kind,
        model: config.model,
        inputTokens: promptTokens,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        costUsd: 0,
        durationMs,
        isStreaming: false
      }));
    } catch {
    }
  }
  return embeddings;
}

// src/core/utils/adaptive-concurrency.ts
var AdaptiveConcurrencyPool = class {
  constructor(options) {
    this.waiting = [];
    this.latencyWindow = [];
    this.consecutiveErrors = 0;
    this.totalSamples = 0;
    this.options = {
      scaleUpThreshold: 0.6,
      errorsBeforeScaleDown: 3,
      minSamples: 5,
      ...options
    };
    this._current = Math.max(options.min, Math.min(options.max, options.initial));
    this.slots = this._current;
  }
  /** Current concurrency level. */
  get current() {
    return this._current;
  }
  async acquire() {
    if (this.slots > 0) {
      this.slots--;
      return;
    }
    await new Promise((resolve) => this.waiting.push(resolve));
  }
  release() {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.slots++;
    }
  }
  updateConcurrency(newLevel, onConcurrencyChange, onScaleUp) {
    const clamped = Math.max(this.options.min, Math.min(this.options.max, newLevel));
    if (clamped === this._current) return;
    const delta = clamped - this._current;
    this._current = clamped;
    this.latencyWindow = [];
    this.consecutiveErrors = 0;
    for (let i = 0; i < delta; i++) {
      this.release();
    }
    if (delta > 0) {
      onScaleUp?.(delta);
    }
    onConcurrencyChange?.(this._current);
  }
  recordSample(durationMs, isError, onConcurrencyChange, onScaleUp) {
    const windowSize = 10;
    this.latencyWindow.push(durationMs);
    if (this.latencyWindow.length > windowSize) {
      this.latencyWindow.shift();
    }
    this.totalSamples++;
    if (isError) {
      this.consecutiveErrors++;
    } else {
      this.consecutiveErrors = 0;
    }
    if (this.latencyWindow.length < this.options.minSamples) return;
    if (this.consecutiveErrors >= this.options.errorsBeforeScaleDown) {
      this.consecutiveErrors = 0;
      this.updateConcurrency(this._current - 1, onConcurrencyChange, onScaleUp);
      return;
    }
    const avg = this.latencyWindow.reduce((a, b) => a + b, 0) / this.latencyWindow.length;
    const { targetLatencyMs, scaleUpThreshold } = this.options;
    if (avg < targetLatencyMs * scaleUpThreshold) {
      this.updateConcurrency(this._current + 1, onConcurrencyChange, onScaleUp);
    } else if (avg > targetLatencyMs) {
      this.updateConcurrency(this._current - 1, onConcurrencyChange, onScaleUp);
    }
  }
  /**
   * Run a task. The pool manages worker concurrency adaptively.
   * Returns the task result.
   */
  async run(fn, onConcurrencyChange, onScaleUp) {
    await this.acquire();
    const t0 = Date.now();
    let isError = false;
    try {
      const result = await fn();
      return result;
    } catch (e) {
      isError = true;
      throw e;
    } finally {
      const durationMs = Date.now() - t0;
      this.recordSample(durationMs, isError, onConcurrencyChange, onScaleUp);
      this.release();
    }
  }
  /**
   * Map items with adaptive concurrency.
   * Similar to mapWithConcurrency but uses adaptive pool.
   */
  async mapWithAdaptiveConcurrency(items, fn, options) {
    if (items.length === 0) return [];
    const results = new Array(items.length);
    let nextIndex = 0;
    const { onConcurrencyChange } = options ?? {};
    const pendingWorkers = [];
    const onScaleUp = (delta) => {
      const toSpawn = Math.min(delta, items.length - nextIndex);
      for (let i = 0; i < toSpawn; i++) spawnWorker();
    };
    const spawnWorker = () => {
      const p = (async () => {
        for (; ; ) {
          const i = nextIndex++;
          if (i >= items.length) return;
          const item = items[i];
          results[i] = await this.run(() => fn(item, i), onConcurrencyChange, onScaleUp);
        }
      })();
      pendingWorkers.push(p);
    };
    const initialWorkers = Math.min(this._current, items.length);
    for (let i = 0; i < initialWorkers; i++) spawnWorker();
    while (pendingWorkers.length > 0) {
      await Promise.all(pendingWorkers.splice(0));
    }
    return results;
  }
};

// src/service/search/index/helper/semanticRelatedEdges.ts
var SEMANTIC_EDGE_RULE_VERSION = 4;
var SEMANTIC_VECTOR_TOP_K_PER_DOC = 12;
var SEMANTIC_VECTOR_KNN_LIMIT = 150;
var SEMANTIC_VECTOR_MIN_SIMILARITY = 0.5;
async function computeSemanticWritesForDoc(fromId, embeddingRepo, mobiusNodeRepo) {
  const queryVector = await embeddingRepo.getEmbeddingForSemanticSearch(fromId);
  if (!queryVector) return [];
  let results;
  try {
    results = await embeddingRepo.searchSimilarAndGetId(
      queryVector,
      SEMANTIC_VECTOR_KNN_LIMIT,
      "excludeDocIdsSet",
      { excludeDocIdsSet: /* @__PURE__ */ new Set([fromId]) }
    );
  } catch (e) {
    console.warn("[semanticRelatedEdges] KNN failed:", fromId, e);
    return [];
  }
  const byNeighbor = /* @__PURE__ */ new Map();
  for (const r of results) {
    if (r.doc_id === fromId || r.similarity < SEMANTIC_VECTOR_MIN_SIMILARITY) continue;
    const targetChunkType = r.chunk_type ?? "body_raw";
    const w = SEMANTIC_EDGE_CHUNK_TYPE_WEIGHT[targetChunkType];
    const weighted = r.similarity * w;
    const prev = byNeighbor.get(r.doc_id);
    if (!prev || weighted > prev.bestWeighted) {
      byNeighbor.set(r.doc_id, { bestWeighted: weighted, bestDistance: r.distance, bestSimilarity: r.similarity, targetChunkType });
    }
  }
  const ranked = [...byNeighbor.entries()].filter(([, v]) => v.bestSimilarity >= SEMANTIC_VECTOR_MIN_SIMILARITY).sort((a, b) => b[1].bestWeighted - a[1].bestWeighted).slice(0, SEMANTIC_VECTOR_TOP_K_PER_DOC);
  const targetNodes = await mobiusNodeRepo.getByIds(ranked.map(([id]) => id));
  const writes = [];
  for (const [toId, agg] of ranked) {
    const target = targetNodes.get(toId);
    if (!target || !isIndexedNoteNodeType(target.type)) continue;
    writes.push({
      toNodeId: toId,
      weight: Math.min(1, agg.bestWeighted),
      attributes: {
        source: "vector",
        rule: "semantic_doc_center_knn",
        ruleVersion: SEMANTIC_EDGE_RULE_VERSION,
        bestDistance: agg.bestDistance,
        bestSimilarity: agg.bestSimilarity,
        targetChunkType: agg.targetChunkType,
        bestWeightedSimilarity: agg.bestWeighted
      }
    });
  }
  return writes;
}
async function persistWritesAndOverlay(fromId, writes, mobiusEdgeRepo, mobiusNodeRepo, now) {
  for (const w of writes) {
    await mobiusEdgeRepo.upsert({
      id: MobiusEdgeRepo.generateEdgeId(fromId, w.toNodeId, GraphEdgeType.SemanticRelated),
      from_node_id: fromId,
      to_node_id: w.toNodeId,
      type: GraphEdgeType.SemanticRelated,
      weight: w.weight,
      attributes: JSON.stringify({ ...w.attributes, updatedAt: now })
    });
  }
  if (writes.length > 0) {
    const centerNode = await mobiusNodeRepo.getByNodeId(fromId);
    const centerLabel = centerNode?.label ?? fromId.slice(0, SLICE_CAPS.semanticEdges.nodeIdFallbackLabel);
    const mermaid = await SemanticRelatedEdgesOverlayService.buildMermaidForWrites(centerLabel, writes, mobiusNodeRepo);
    await mobiusNodeRepo.mergeJsonAttributesForIndexedNoteNode(fromId, {
      semantic_overlay_mermaid: mermaid ?? null,
      semantic_edge_rule_version: SEMANTIC_EDGE_RULE_VERSION
    }, now);
  }
  return writes.length;
}
var SemanticRelatedEdgesOverlayService = class {
  static escapeMermaidLabel(s) {
    return s.replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").slice(0, SLICE_CAPS.semanticEdges.mermaidSafeLabel);
  }
  static buildMermaid(centerLabel, items) {
    const lines = ["flowchart LR", `  center["${this.escapeMermaidLabel(centerLabel)}"]`];
    items.slice(0, SLICE_CAPS.semanticEdges.items).forEach((it, idx) => {
      const nid = `n${idx}`;
      const el = it.edge === "vec" ? "vec" : it.edge === "topic" ? "topic" : "ref";
      lines.push(`  ${nid}["${this.escapeMermaidLabel(it.label)}"]`);
      lines.push(`  center -->|${el}| ${nid}`);
    });
    return lines.join("\n");
  }
  static async buildMermaidForWrites(centerLabel, writes, mobiusNodeRepo) {
    if (writes.length === 0) return null;
    const ids = [...new Set(writes.map((w) => w.toNodeId))];
    const nodes = await mobiusNodeRepo.getByIds(ids);
    const items = [];
    for (const w of writes) {
      const n = nodes.get(w.toNodeId);
      const label = n?.label ?? w.toNodeId.slice(0, SLICE_CAPS.semanticEdges.nodeIdFallbackLabel);
      const rule = w.attributes.rule;
      const edge = rule === "chunk_knn_max" || rule === "vector_knn" || rule === "typed_weighted_knn" || rule === "semantic_doc_center_knn" ? "vec" : rule === "shared_topic_tag" ? "topic" : "ref";
      items.push({ label, edge });
    }
    return this.buildMermaid(centerLabel, items);
  }
  static async buildMermaidForDocument(doc, writes, mobiusNodeRepo) {
    const center = doc.metadata.title ?? getFileNameFromPath(doc.sourceFileInfo.path);
    return this.buildMermaidForWrites(center, writes, mobiusNodeRepo);
  }
};
var SemanticRelatedEdgesRebuildService = class {
  static {
    this.yieldToMainThread = () => new Promise((r) => setTimeout(r, 0));
  }
  /** Rebuilds all `semantic_related` edges for one index tenant using vector similarity. */
  static async rebuildForTenant(tenant, options) {
    if (!sqliteStoreManager.isVectorSearchEnabled()) {
      return { tenant, documentsProcessed: 0, edgesWritten: 0, skipped: true, reason: "Vector search (sqlite-vec) is not enabled." };
    }
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    let docIds;
    try {
      docIds = await embeddingRepo.listDistinctDocIdsWithEmbeddings();
    } catch (e) {
      return { tenant, documentsProcessed: 0, edgesWritten: 0, skipped: true, reason: e instanceof Error ? e.message : String(e) };
    }
    if (!docIds.length) return { tenant, documentsProcessed: 0, edgesWritten: 0, skipped: false };
    const probeVec = await embeddingRepo.getEmbeddingForSemanticSearch(docIds[0]);
    if (probeVec) {
      try {
        await embeddingRepo.searchSimilarAndGetId(probeVec, 1, "excludeDocIdsSet", { excludeDocIdsSet: /* @__PURE__ */ new Set([docIds[0]]) });
      } catch (e) {
        if (e instanceof BusinessError && e.code === "VEC_EMBEDDINGS_TABLE_MISSING" /* VEC_EMBEDDINGS_TABLE_MISSING */) {
          return { tenant, documentsProcessed: 0, edgesWritten: 0, skipped: true, reason: e.message };
        }
        throw e;
      }
    }
    const yieldEvery = options?.yieldEveryDocs ?? 40;
    const now = Date.now();
    let edgesWritten = 0;
    let processed = 0;
    await mobiusEdgeRepo.deleteByType(GraphEdgeType.SemanticRelated);
    await mobiusNodeRepo.clearSemanticOverlayFieldsForIndexedNotes(now, SEMANTIC_EDGE_RULE_VERSION);
    for (const fromId of docIds) {
      processed++;
      options?.onProgress?.({ tenant, processed, total: docIds.length });
      const writes = await computeSemanticWritesForDoc(fromId, embeddingRepo, mobiusNodeRepo);
      edgesWritten += await persistWritesAndOverlay(fromId, writes, mobiusEdgeRepo, mobiusNodeRepo, now);
      if (processed % yieldEvery === 0) await this.yieldToMainThread();
    }
    return { tenant, documentsProcessed: processed, edgesWritten, skipped: false };
  }
  /** Incrementally rebuilds `semantic_related` edges FROM the given doc IDs only. */
  static async rebuildForDocIds(docIds, tenant) {
    if (!docIds.length || !sqliteStoreManager.isVectorSearchEnabled()) {
      return { edgesCreated: 0, nodesUpdated: 0 };
    }
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const now = Date.now();
    let edgesCreated = 0;
    const affectedNodeIds = new Set(docIds);
    const writesByDoc = /* @__PURE__ */ new Map();
    for (const fromId of docIds) {
      await mobiusEdgeRepo.deleteByFromNodeAndType(fromId, GraphEdgeType.SemanticRelated);
      const writes = await computeSemanticWritesForDoc(fromId, embeddingRepo, mobiusNodeRepo);
      edgesCreated += await persistWritesAndOverlay(fromId, writes, mobiusEdgeRepo, mobiusNodeRepo, now);
      for (const w of writes) affectedNodeIds.add(w.toNodeId);
      writesByDoc.set(fromId, writes);
    }
    let nodesUpdated = docIds.length;
    for (const nodeId of affectedNodeIds) {
      if (writesByDoc.has(nodeId)) continue;
      const edges = await mobiusEdgeRepo.getByFromNode(nodeId);
      const writes = edges.filter((e) => e.type === GraphEdgeType.SemanticRelated).map((e) => ({
        toNodeId: e.to_node_id,
        weight: e.weight,
        attributes: JSON.parse(e.attributes || "{}")
      }));
      const centerNode = await mobiusNodeRepo.getByNodeId(nodeId);
      const centerLabel = centerNode?.label ?? nodeId.slice(0, SLICE_CAPS.semanticEdges.nodeIdFallbackLabel);
      const mermaid = await SemanticRelatedEdgesOverlayService.buildMermaidForWrites(centerLabel, writes, mobiusNodeRepo);
      await mobiusNodeRepo.mergeJsonAttributesForIndexedNoteNode(nodeId, {
        semantic_overlay_mermaid: mermaid ?? null,
        semantic_edge_rule_version: SEMANTIC_EDGE_RULE_VERSION
      }, now);
      nodesUpdated++;
    }
    return { edgesCreated, nodesUpdated };
  }
};

// src/service/search/index/helper/mobiusTagEdges.ts
async function upsertOneTagEdge(mobiusNodeRepo, mobiusEdgeRepo, docNodeId, edgeType, nodeType, tagId, label, nodeAttributes, edgeAttributes = {}) {
  await mobiusNodeRepo.upsert({
    id: tagId,
    type: nodeType,
    label,
    attributes: JSON.stringify(nodeAttributes)
  });
  await mobiusEdgeRepo.upsert({
    id: MobiusEdgeRepo.generateEdgeId(docNodeId, tagId, edgeType),
    from_node_id: docNodeId,
    to_node_id: tagId,
    type: edgeType,
    weight: 1,
    attributes: JSON.stringify(edgeAttributes)
  });
}
async function upsertDocumentTagEdges(tenant, docNodeId, spec) {
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
  switch (spec.nodeType) {
    case GraphNodeType.TopicTag:
      for (const { id, label } of spec.items) {
        const qualifier = label?.trim();
        await upsertOneTagEdge(
          mobiusNodeRepo,
          mobiusEdgeRepo,
          docNodeId,
          GraphEdgeType.TaggedTopic,
          spec.nodeType,
          stableTopicTagNodeId(id),
          id,
          { tagName: id },
          qualifier ? { qualifier } : {}
        );
      }
      break;
    case GraphNodeType.FunctionalTag:
      for (const { id, label } of spec.items) {
        const qualifier = label?.trim();
        await upsertOneTagEdge(
          mobiusNodeRepo,
          mobiusEdgeRepo,
          docNodeId,
          GraphEdgeType.TaggedFunctional,
          spec.nodeType,
          stableFunctionalTagNodeId(id),
          id,
          { functionalTag: id },
          qualifier ? { qualifier } : {}
        );
      }
      break;
    case GraphNodeType.KeywordTag:
      for (const kw of spec.items) {
        await upsertOneTagEdge(
          mobiusNodeRepo,
          mobiusEdgeRepo,
          docNodeId,
          GraphEdgeType.TaggedKeyword,
          spec.nodeType,
          stableKeywordTagNodeId(kw),
          kw,
          { keywordTag: kw },
          {}
        );
      }
      break;
    case GraphNodeType.ContextTag:
      for (const { axis, label } of spec.items) {
        await upsertOneTagEdge(
          mobiusNodeRepo,
          mobiusEdgeRepo,
          docNodeId,
          GraphEdgeType.TaggedContext,
          spec.nodeType,
          stableContextTagNodeId(axis, label),
          label,
          { axis, contextTag: label },
          {}
        );
      }
      break;
  }
}

// src/core/utils/hub-path-utils.ts
function isVaultPathUnderPrefix(path4, prefix) {
  const p = normalizeVaultPath(path4);
  const pre = normalizeVaultPath(prefix);
  if (!pre) return false;
  if (p === pre) return true;
  return p.startsWith(pre + "/");
}

// src/core/document/helper/DocumentReferencePolicy.ts
var DOC_OUTGOING_TARGET_TYPES = [
  "markdown",
  "excalidraw",
  "canvas",
  "pdf"
];
var DOC_OUTGOING_TARGET_TYPE_SET = new Set(DOC_OUTGOING_TARGET_TYPES);
function countsAsDocOutgoingTarget(docType) {
  return !!docType && DOC_OUTGOING_TARGET_TYPE_SET.has(docType);
}
function graphNodeTypeForPlaceholderReferenceTarget(fullPath, docType) {
  const hub = getAIHubSummaryFolder();
  if (hub && isVaultPathUnderPrefix(fullPath, hub) && countsAsDocOutgoingTarget(docType)) {
    return GraphNodeType.HubDoc;
  }
  if (countsAsDocOutgoingTarget(docType)) return GraphNodeType.Document;
  return GraphNodeType.Resource;
}

// src/service/search/index/cascade/CascadeChangeDetector.ts
function computeChangeMagnitude(oldVec, newVec) {
  if (!oldVec && !newVec) return 0;
  if (!oldVec || !newVec) return 1;
  if (oldVec.length !== newVec.length) return 1;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < oldVec.length; i++) {
    dot += oldVec[i] * newVec[i];
    normA += oldVec[i] * oldVec[i];
    normB += newVec[i] * newVec[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  const cosineSim = dot / denom;
  return Math.max(0, Math.min(1, 1 - cosineSim));
}
function detectChanges(docPath, docNodeId, preSnapshot, newContentHash, newOutgoingTargetIds, newEmbeddingVector) {
  const oldHash = preSnapshot?.contentHash ?? null;
  const oldTargets = preSnapshot?.outgoingTargetIds ?? [];
  const oldVec = preSnapshot?.embeddingVector ?? null;
  const contentHashChanged = oldHash !== newContentHash;
  const oldSet = new Set(oldTargets);
  const newSet = new Set(newOutgoingTargetIds);
  const outgoingLinksChanged = oldSet.size !== newSet.size || [...oldSet].some((id) => !newSet.has(id));
  const changeMagnitude = computeChangeMagnitude(oldVec, newEmbeddingVector);
  const embeddingChanged = changeMagnitude > 1e-3;
  if (!contentHashChanged && !outgoingLinksChanged && !embeddingChanged) {
    return null;
  }
  return {
    docPath,
    docNodeId,
    contentHashChanged,
    embeddingChanged,
    outgoingLinksChanged,
    oldOutgoingTargetIds: oldTargets,
    newOutgoingTargetIds,
    changeMagnitude
  };
}

// src/service/search/index/indexService.ts
function getIndexTenantForPath(path4) {
  const ctx = AppContext.getInstance();
  const hubFolder = getAIHubSummaryFolder();
  if (hubFolder && isVaultPathUnderPrefix(path4, hubFolder)) {
    return "vault";
  }
  const rootFolder = ctx.settings.ai.rootFolder.trim();
  const normalized = path4.replace(/^\/+/, "");
  const prefix = rootFolder.endsWith("/") ? rootFolder.replace(/\/+$/, "") : rootFolder;
  return normalized === prefix || normalized.startsWith(prefix + "/") ? "chat" : "vault";
}
var DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE = 200;
async function yieldForLargePass() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
function folderAncestorPathsFromFolderPath(folderPath) {
  if (!folderPath) return [];
  const parts = folderPath.split("/").filter((p) => p.length > 0);
  const out = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc = i === 0 ? parts[i] : `${acc}/${parts[i]}`;
    out.push(acc);
  }
  return out;
}
function membershipFolderPathsForGraphNode(type, path4) {
  if (!path4) return /* @__PURE__ */ new Set();
  if (type === GraphNodeType.Folder) {
    return new Set(folderAncestorPathsFromFolderPath(path4));
  }
  if (type === GraphNodeType.Document || type === GraphNodeType.HubDoc || type === GraphNodeType.Resource) {
    const slash = path4.lastIndexOf("/");
    if (slash <= 0) return /* @__PURE__ */ new Set();
    return new Set(folderAncestorPathsFromFolderPath(path4.slice(0, slash)));
  }
  return /* @__PURE__ */ new Set();
}
function folderHubStatsPathAllowed(folderPath, hubSummaryFolder) {
  const hub = hubSummaryFolder.trim();
  if (!hub) return true;
  if (folderPath === hub) return false;
  if (isVaultPathUnderPrefix(folderPath, hub)) return false;
  return true;
}
var IndexService = class _IndexService {
  static {
    this.instance = null;
  }
  static {
    this.isIndexingCancelled = false;
  }
  constructor() {
  }
  static getInstance() {
    if (!_IndexService.instance) {
      _IndexService.instance = new _IndexService();
    }
    return _IndexService.instance;
  }
  /**
   * Clear the global singleton instance.
   * Call from plugin onunload to release memory.
   */
  static clearInstance() {
    _IndexService.instance = null;
  }
  /**
   * Initialize IndexService with AIServiceManager for embedding generation.
   * This should be called once during plugin initialization in main.ts.
   * Can also be called when settings are updated to refresh the service instance.
   */
  init(aiServiceManager) {
    this.aiServiceManager = aiServiceManager;
  }
  /** Cancel ongoing indexing operations. */
  static cancelIndexing() {
    _IndexService.isIndexingCancelled = true;
  }
  /** Reset the cancellation flag. */
  static resetCancellation() {
    _IndexService.isIndexingCancelled = false;
  }
  /** Check if indexing has been cancelled. */
  static isCancelled() {
    return _IndexService.isIndexingCancelled;
  }
  // --- Index lifecycle (formerly IndexCrudService) ---
  /**
   * Delete documents by paths. Removes chunks, embeddings, indexed document rows on Mobius, and document graph nodes/edges for those ids.
   *
   * Notes:
   * - Does not delete tag/hub nodes shared by other documents (only edges from removed docs are cleared via node delete scope).
   * - Runs in a per-tenant transaction.
   */
  async deleteDocuments(paths, onAfterMutation) {
    if (!paths.length) return;
    const byTenant = /* @__PURE__ */ new Map();
    for (const p of paths) {
      const t = getIndexTenantForPath(p);
      const list = byTenant.get(t) ?? [];
      list.push(p);
      byTenant.set(t, list);
    }
    for (const [tenant, tenantPaths] of byTenant) {
      const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
      const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
      const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
      const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
      const kdb = sqliteStoreManager.getIndexContext(tenant);
      const metaMap = await indexedDocumentRepo.getByPaths(tenantPaths);
      const docIds = Array.from(metaMap.values()).map((m) => m.id);
      await kdb.transaction().execute(async () => {
        docChunkRepo.deleteFtsByDocIds(docIds);
        docChunkRepo.deleteFtsStemByDocIds(docIds);
        docChunkRepo.deleteMetaFtsByDocIds(docIds);
        await docChunkRepo.deleteByDocIds(docIds);
        await embeddingRepo.deleteByDocIds(docIds);
        await mobiusNodeRepo.deleteDocumentStatisticsByDocIds(docIds);
        await mobiusEdgeRepo.deleteByNodeIds(docIds);
        await indexedDocumentRepo.deleteByPaths(tenantPaths);
        await mobiusNodeRepo.deleteByIds(docIds);
      });
      if (docIds.length > 0) {
        await this.addMaintenanceDebt(tenant, MOBIUS_MAINTENANCE_DEBT_PER_DELETE * docIds.length);
      }
    }
    onAfterMutation?.(["sqlite", "graph"]);
  }
  /**
   * Clear all index data: chunks, embeddings, Mobius nodes/edges (via repos), and index_state.
   * Destructive and cannot be undone.
   */
  async clearAllIndexData(onAfterMutation) {
    const tenants = ["vault", "chat"];
    for (const tenant of tenants) {
      const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
      const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
      const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
      const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
      const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
      docChunkRepo.deleteAllFts();
      docChunkRepo.deleteAllMetaFts();
      await docChunkRepo.deleteAll();
      await embeddingRepo.deleteAll();
      await mobiusNodeRepo.clearAllDocumentStatistics();
      await mobiusEdgeRepo.deleteAll();
      await indexedDocumentRepo.deleteAll();
      await mobiusNodeRepo.deleteAll();
      await indexStateRepo.clearAll();
    }
    onAfterMutation?.(["sqlite", "graph"]);
  }
  /**
   * Clean up orphan FTS/chunk/embedding rows and stray document nodes on Mobius when no indexed document remains for that path set.
   */
  async cleanupOrphanedSearchIndexData() {
    const tenants = ["vault", "chat"];
    let metaFts = 0;
    let fts = 0;
    let chunks = 0;
    let embeddings = 0;
    let graphNodes = 0;
    for (const tenant of tenants) {
      const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
      const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
      const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
      const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
      const kdb = sqliteStoreManager.getIndexContext(tenant);
      await kdb.transaction().execute(async () => {
        metaFts += docChunkRepo.cleanupOrphanMetaFts();
        fts += docChunkRepo.cleanupOrphanFts();
        chunks += await docChunkRepo.cleanupOrphanChunks();
        embeddings += await embeddingRepo.cleanupOrphanEmbeddings();
        const pathMap = await indexedDocumentRepo.getAllIndexedPaths();
        const paths = Array.from(pathMap.keys());
        const idRows = paths.length > 0 ? await indexedDocumentRepo.getIdsByPaths(paths) : [];
        const validDocIds = new Set(idRows.map((r) => r.id));
        const orphanDocNodes = [];
        for (const t of GRAPH_DOCUMENT_LIKE_NODE_TYPES) {
          const nodes = await mobiusNodeRepo.getByType(t);
          orphanDocNodes.push(...nodes.filter((n) => !validDocIds.has(n.id)).map((n) => n.id));
        }
        if (orphanDocNodes.length > 0) {
          await mobiusEdgeRepo.deleteByNodeIds(orphanDocNodes);
          await mobiusNodeRepo.deleteByIds(orphanDocNodes);
          graphNodes += orphanDocNodes.length;
        }
      });
    }
    return { metaFts, fts, chunks, embeddings, graphNodes };
  }
  /** Index build timestamp and document count (vault tenant). */
  async getIndexStatus() {
    const indexStateRepo = sqliteStoreManager.getIndexStateRepo("vault");
    const builtAtRaw = await indexStateRepo.get(INDEX_STATE_KEYS.builtAt);
    const indexedRaw = await indexStateRepo.get(INDEX_STATE_KEYS.indexedDocs);
    const indexBuiltAt = builtAtRaw != null ? Number(builtAtRaw) : null;
    const indexedDocs = indexedRaw != null ? Number(indexedRaw) : null;
    return {
      indexBuiltAt: Number.isFinite(indexBuiltAt) ? indexBuiltAt : null,
      indexedDocs: Number.isFinite(indexedDocs) ? indexedDocs : null,
      isReady: Boolean(builtAtRaw)
    };
  }
  /**
   * Updates path on the indexed document (Mobius + FTS + graph node attributes) without changing node id.
   * @returns true if a row was updated under oldPath.
   */
  async renameDocumentPath(oldPath, newPath) {
    const tenantOld = getIndexTenantForPath(oldPath);
    const tenantNew = getIndexTenantForPath(newPath);
    if (tenantOld !== tenantNew) return false;
    const tenant = tenantOld;
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const meta2 = await indexedDocumentRepo.getByPath(oldPath);
    if (!meta2) return false;
    const docId = meta2.id;
    const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const kdb = sqliteStoreManager.getIndexContext(tenant);
    const title = meta2.title ?? getFileNameFromPath(newPath);
    const normTitle = normalizeTextForFts(title);
    const ts = Date.now();
    await kdb.transaction().execute(async () => {
      await indexedDocumentRepo.updatePathById(docId, newPath);
      docChunkRepo.replaceMetaFts({ doc_id: docId, path: newPath, title: normTitle });
      const gn = await mobiusNodeRepo.getById(docId);
      if (gn) {
        let attrs = {};
        try {
          attrs = JSON.parse(gn.attributes);
        } catch {
          attrs = {};
        }
        attrs.path = newPath;
        await mobiusNodeRepo.updateById(docId, {
          label: title,
          attributes: JSON.stringify(attrs),
          updated_at: ts
        });
      }
    });
    await this.addMaintenanceDebt(tenant, MOBIUS_MAINTENANCE_DEBT_RENAME);
    return true;
  }
  /** True when maintenance debt reached the threshold in vault or chat DB. */
  async isMobiusMaintenanceRecommended() {
    for (const tenant of ["vault", "chat"]) {
      const v = await sqliteStoreManager.getIndexStateRepo(tenant).get(MOBIUS_MAINTENANCE_STATE_KEYS.needed);
      if (v === "1") return true;
    }
    return false;
  }
  /** Accumulate maintenance debt after successful incremental graph/search writes. */
  async addMaintenanceDebt(tenant, delta) {
    if (delta <= 0) return;
    if (!sqliteStoreManager.isInitialized()) return;
    const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
    const raw = await indexStateRepo.get(MOBIUS_MAINTENANCE_STATE_KEYS.dirtyScore);
    const prev = Number(raw ?? 0);
    const base = Number.isFinite(prev) && prev >= 0 ? prev : 0;
    const next = base + delta;
    await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.dirtyScore, String(next));
    if (next >= MOBIUS_MAINTENANCE_DIRTY_THRESHOLD) {
      await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.needed, "1");
    }
  }
  // --- Single-document indexing (formerly IndexSingleService) ---
  /**
   * Index a document by path with chunking strategy applied.
   * Pass {@link IndexDocumentOptions} to control LLM tags/summary vs fast core index.
   */
  async indexDocument(docPath, settings, indexOptions, preloadedDocument) {
    if (!this.aiServiceManager) {
      throw new Error("[IndexService] init(AIServiceManager) must be called before indexing");
    }
    const opts = indexOptions ?? defaultIndexDocumentOptions("manual_full");
    const sw = new Stopwatch(`[IndexService] Indexing: ${docPath}`);
    try {
      const loaderManager = DocumentLoaderManager.getInstance();
      const partialDoc = {
        type: loaderManager.getTypeForPath(docPath) ?? "unknown",
        sourceFileInfo: { path: docPath }
      };
      if (!loaderManager.shouldIndexDocument(partialDoc)) {
        console.warn(
          `[IndexService] Skipping indexing for path: ${docPath}, type: ${partialDoc.type} (should not be indexed or has no loader)`
        );
        return;
      }
      const readOpts = {
        includeLlmTags: opts.includeLlmTags,
        includeLlmSummary: opts.includeLlmSummary,
        ...opts.onLlmIndexingComplete ? { onLlmIndexingComplete: opts.onLlmIndexingComplete } : {}
      };
      sw.start("Read document");
      const preload = preloadedDocument;
      let rawDoc = null;
      if (preload) {
        const want = (0, import_obsidian12.normalizePath)(docPath);
        const got = (0, import_obsidian12.normalizePath)(preload.sourceFileInfo?.path ?? "");
        if (want !== got) {
          console.warn(
            `[IndexService] preloadedDocument path mismatch (expected ${want}, got ${got}); reloading from vault.`
          );
          rawDoc = await loaderManager.readByPath(docPath, true, readOpts);
        } else {
          rawDoc = preload;
        }
      } else {
        rawDoc = await loaderManager.readByPath(docPath, true, readOpts);
      }
      sw.stop();
      if (!rawDoc) {
        console.warn(`[IndexService] Failed to load document: ${docPath}`);
        return;
      }
      const tenant = getIndexTenantForPath(rawDoc.sourceFileInfo.path);
      rawDoc.id = await this.resolveDocumentNodeId(rawDoc.sourceFileInfo.path, tenant);
      if (_IndexService.isCancelled()) {
        return;
      }
      const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const existing = await indexedDocumentRepo.getByPath(rawDoc.sourceFileInfo.path);
      const doc = this.applyDocumentMergeForIndex(rawDoc, existing, opts);
      const loader = loaderManager.getLoaderForDocumentType(doc.type);
      if (!loader) {
        console.warn(`No loader found for document type: ${doc.type}`);
        return;
      }
      let chunks = [];
      if (opts.includeCoreSearchIndex) {
        sw.start("Chunk content");
        chunks = await loader.chunkContent(doc, settings.chunking);
        chunks = enforceChunkLengthWithOverlap(chunks, settings.chunking);
        sw.stop();
      } else if (opts.includeEmbeddings) {
        sw.start("Load chunks for vector enrichment");
        chunks = await this.loadPersistedChunksForEmbedding(doc.id, tenant);
        sw.stop();
      }
      const vectorSearchAvailable = sqliteStoreManager.isVectorSearchEnabled();
      const registry = ProfileRegistry.getInstance();
      const embProfile = registry.getActiveEmbeddingProfile() ?? registry.getActiveAgentProfile();
      const hasEmbedding = !!(embProfile?.embeddingEndpoint && embProfile?.embeddingModel);
      const embeddingModelName = hasEmbedding ? embProfile.embeddingModel : void 0;
      const canGenerateEmbeddings = opts.includeEmbeddings && hasEmbedding && vectorSearchAvailable;
      let vectorCompleted = false;
      if (canGenerateEmbeddings) {
        sw.start("Generate embeddings");
        await this.generateAndFillEmbeddings(chunks);
        sw.stop();
        vectorCompleted = true;
      }
      let preSnapshot = null;
      if (tenant === "vault") {
        try {
          const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
          const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
          const existingNode = await mobiusNodeRepo.getByPath(docPath);
          if (existingNode) {
            const existingOutgoing = await mobiusEdgeRepo.getByFromNodesAndTypes(
              [existingNode.id],
              [GraphEdgeType.References]
            );
            preSnapshot = {
              contentHash: existingNode.content_hash ?? null,
              outgoingTargetIds: existingOutgoing.map((e) => e.to_node_id),
              embeddingVector: null
            };
          }
        } catch {
        }
      }
      sw.start("Persist index (transaction: mobius + FTS + graph + aggregates + index_state)");
      const shouldRefreshGraph = opts.includeCoreSearchIndex || opts.includeLlmTags || opts.includeLlmSummary;
      const sameTenantOutgoing = shouldRefreshGraph ? this.filterOutgoingRefsForTenant(doc.references.outgoing, tenant) : [];
      const pathToIndexedDocInfo = shouldRefreshGraph ? await this.loadPathToIndexedDocInfoMap(tenant, sameTenantOutgoing) : emptyMap();
      const indexedByTargetId = shouldRefreshGraph ? await this.loadIndexedRecordsForOutgoingTargets(
        tenant,
        pathToIndexedDocInfo,
        sameTenantOutgoing
      ) : emptyMap();
      const kdb = sqliteStoreManager.getIndexContext(tenant);
      await kdb.transaction().execute(async () => {
        await this.upsertIndexedDocument(doc, tenant, opts, existing);
        if (shouldRefreshGraph) {
          await this.upsertGraphEdgesForDocument(
            doc,
            tenant,
            pathToIndexedDocInfo,
            indexedByTargetId,
            sameTenantOutgoing,
            opts.includeLlmTags
          );
          await this.upsertFolderContainsEdgesForDocument(doc, tenant);
          await this.refreshMobiusAggregatesForIndexedDocument(
            doc,
            tenant,
            pathToIndexedDocInfo,
            indexedByTargetId,
            sameTenantOutgoing
          );
        }
        if (opts.includeCoreSearchIndex) {
          await this.saveChunkAndFtsData(
            doc.id,
            doc.sourceFileInfo.path,
            doc.metadata.title,
            chunks,
            doc.metadata.keywordTags,
            tenant
          );
          if (opts.includeEmbeddings) {
            await this.saveEmbeddingData(doc.id, chunks, embeddingModelName, tenant);
          } else {
            await this.clearEmbeddingsForDoc(doc.id, tenant);
          }
        } else if (opts.includeEmbeddings) {
          await this.saveEmbeddingData(doc.id, chunks, embeddingModelName, tenant);
        }
        await this.persistDeferredStateAfterIndex(doc, tenant, opts, vectorCompleted);
        if (opts.incrementIndexState) {
          await this.updateIndexState(tenant);
        }
      });
      await this.addMaintenanceDebt(tenant, MOBIUS_MAINTENANCE_DEBT_INDEX_DOC);
      if (tenant === "vault" && preSnapshot !== null) {
        try {
          const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
          const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
          const postNode = await mobiusNodeRepo.getByPath(docPath);
          if (postNode) {
            const postOutgoing = await mobiusEdgeRepo.getByFromNodesAndTypes(
              [postNode.id],
              [GraphEdgeType.References]
            );
            const changeInfo = detectChanges(
              docPath,
              postNode.id,
              preSnapshot,
              postNode.content_hash ?? "",
              postOutgoing.map((e) => e.to_node_id),
              null
            );
            if (changeInfo) {
              await this.writeCascadeDebt(tenant, changeInfo);
            }
          }
        } catch {
        }
      }
      sw.stop();
    } catch (error) {
      console.error(`[IndexService] Error indexing document:`, {
        docPath,
        message: error.message ?? void 0,
        stack: error.stack ?? void 0
      });
    } finally {
      sw.print();
    }
  }
  /**
   * When fast index skips LLM, restore prior LLM-derived fields from DB for graph + upsert.
   */
  applyDocumentMergeForIndex(doc, existing, opts) {
    if (!existing || !opts.preserveExistingLlmDataWhenSkipped) {
      return doc;
    }
    const merged = {
      ...doc,
      metadata: { ...doc.metadata }
    };
    if (!opts.includeLlmSummary) {
      if (existing.summary !== void 0) {
        merged.summary = existing.summary;
      }
      if (existing.full_summary !== void 0) {
        merged.fullSummary = existing.full_summary;
      }
    }
    if (!opts.includeLlmTags && existing.tags) {
      const blob = decodeIndexedTagsBlob(existing.tags);
      merged.metadata.topicTags = blob.topicTags;
      if (blob.topicTagEntries?.length) {
        merged.metadata.topicTagEntries = blob.topicTagEntries;
      } else {
        delete merged.metadata.topicTagEntries;
      }
      merged.metadata.functionalTagEntries = blob.functionalTagEntries;
      merged.metadata.timeTags = blob.timeTags;
      merged.metadata.geoTags = blob.geoTags;
      merged.metadata.personTags = blob.personTags;
      if (existing.infer_created_at != null) {
        merged.metadata.inferCreatedAt = existing.infer_created_at;
      }
    }
    return merged;
  }
  /**
   * Updates deferred LLM/vector enrichment markers in `attributes_json` after a successful index transaction.
   */
  async persistDeferredStateAfterIndex(doc, tenant, opts, vectorCompleted) {
    const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const hash = doc.contentHash ?? null;
    const now = Date.now();
    const functionalCount = filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []).length;
    const functionalStatus = !opts.includeLlmTags ? "pending" : functionalCount > 0 ? "success" : "failed";
    const skippedAnyLlm = !opts.includeLlmTags || !opts.includeLlmSummary;
    if (opts.markLlmPendingWhenSkipped && skippedAnyLlm) {
      await repo.mergeDocumentLlmState(doc.id, {
        llm_pending: true,
        llm_pending_reason: opts.reason,
        functional_tags_status: "pending"
      });
    } else {
      const patch = {
        llm_pending: false,
        llm_pending_reason: null,
        functional_tags_status: functionalStatus
      };
      if (opts.includeLlmTags) {
        patch.llm_tags_source_hash = hash;
        patch.llm_tags_generated_at = now;
      }
      if (opts.includeLlmSummary) {
        patch.llm_summary_source_hash = hash;
        patch.llm_summary_generated_at = now;
      }
      if (opts.includeLlmTags || opts.includeLlmSummary) {
        await repo.mergeDocumentLlmState(doc.id, patch);
      }
    }
    if (opts.markVectorPendingWhenSkipped && !opts.includeEmbeddings) {
      await repo.mergeDocumentVectorState(doc.id, {
        vector_pending: true,
        vector_pending_reason: opts.reason
      });
    } else if (opts.includeEmbeddings && vectorCompleted) {
      await repo.mergeDocumentVectorState(doc.id, {
        vector_pending: false,
        vector_pending_reason: null,
        vector_source_hash: hash,
        vector_generated_at: now
      });
    } else if (opts.includeEmbeddings) {
      await repo.mergeDocumentVectorState(doc.id, {
        vector_pending: true,
        vector_pending_reason: opts.reason
      });
    }
  }
  /**
   * Stable node_id for a vault path: reuse existing indexed document on `mobius_node`, else allocate.
   * First tries path-stable id; on collision, one fallback using path + timestamp seed.
   */
  async resolveDocumentNodeId(path4, tenant) {
    const mobiusRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const existing = await mobiusRepo.getByPath(path4);
    if (existing && isIndexedNoteNodeType(existing.type)) {
      return existing.node_id;
    }
    const tryCandidate = async (candidate) => {
      const row = await mobiusRepo.getByNodeId(candidate);
      if (!row) return candidate;
      if (row.path === path4 && isIndexedNoteNodeType(row.type)) return candidate;
      return null;
    };
    const primary = generateDocIdFromPath(path4);
    const first = await tryCandidate(primary);
    if (first !== null) return first;
    const ts = Date.now();
    const fallback = stableDocumentNodeIdTimeFallback(path4, ts);
    const second = await tryCandidate(fallback);
    if (second !== null) return second;
    throw new Error(`[IndexService] Failed to allocate document node id for path: ${path4}`);
  }
  /**
   * Generate embeddings for chunks and fill them into chunk objects.
   *
   * @param chunks - Chunks to generate embeddings for
   */
  async generateAndFillEmbeddings(chunks) {
    if (!chunks.length) return;
    try {
      const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
      for (let i = 0; i < chunks.length && i < embeddings.length; i++) {
        chunks[i].embedding = embeddings[i];
      }
    } catch (error) {
      const maxChunk = chunks.reduce((acc, chunk) => {
        if (!acc) return chunk;
        return (chunk.content?.length ?? 0) > (acc.content?.length ?? 0) ? chunk : acc;
      }, null);
      console.error(`[IndexService] Failed to generate embeddings:`, {
        error,
        chunkCount: chunks.length,
        maxChunkLen: maxChunk?.content?.length ?? 0,
        maxChunkType: maxChunk?.chunkType ?? "unknown",
        maxChunkIndex: maxChunk?.chunkIndex ?? -1
      });
    }
  }
  /**
   * Load persisted doc chunks so vector-enrich pass can run without re-chunking.
   */
  async loadPersistedChunksForEmbedding(docId, tenant) {
    const kdb = sqliteStoreManager.getIndexContext(tenant);
    const rows = await kdb.selectFrom("doc_chunk").select(["chunk_id", "chunk_index", "chunk_type", "title", "content_raw"]).where("doc_id", "=", docId).orderBy("chunk_index", "asc").execute();
    return rows.map((r) => ({
      docId,
      chunkType: r.chunk_type,
      content: r.content_raw ?? "",
      chunkId: r.chunk_id,
      chunkIndex: r.chunk_index ?? 0,
      title: r.title ?? void 0
    }));
  }
  /**
   * Save chunk and FTS data to database. Embeddings are handled by {@link saveEmbeddingData}.
   */
  async saveChunkAndFtsData(docId, path4, title, chunks, keywordTags = [], tenant = "vault") {
    const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
    const now = Date.now();
    docChunkRepo.deleteFtsByDocId(docId);
    docChunkRepo.deleteFtsStemByDocId(docId);
    docChunkRepo.deleteMetaFtsByDocId(docId);
    await docChunkRepo.deleteByDocId(docId);
    const normTitle = normalizeTextForFts(title ?? "");
    const tags = keywordTags.join(" ");
    docChunkRepo.insertMetaFts({
      doc_id: docId,
      path: path4,
      title: normTitle,
      tags
    });
    for (const chunk of chunks) {
      const chunkId = chunk.chunkId ?? generateUuidWithoutHyphens();
      chunk.chunkId = chunkId;
      const chunkIndex = Number(chunk.chunkIndex ?? 0);
      const normContent = normalizeTextForFts(chunk.content ?? "");
      const metaJson = chunk.chunkMeta && Object.keys(chunk.chunkMeta).length > 0 ? JSON.stringify(chunk.chunkMeta) : null;
      await docChunkRepo.upsertChunk({
        chunk_id: chunkId,
        doc_id: docId,
        chunk_index: chunkIndex,
        chunk_type: chunk.chunkType,
        chunk_meta_json: metaJson,
        title: chunk.title ?? null,
        mtime: now,
        content_raw: chunk.content ?? null,
        content_fts_norm: normContent
      });
      docChunkRepo.insertFts({
        chunk_id: chunkId,
        doc_id: docId,
        content: normContent
      });
      const stemmedContent = stemText(normContent);
      docChunkRepo.insertFtsStem(chunkId, docId, stemmedContent);
    }
  }
  /**
   * Save embeddings only. Existing rows for the doc are replaced to avoid stale vectors.
   */
  async saveEmbeddingData(docId, chunks, embeddingModel, tenant = "vault") {
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
    const now = Date.now();
    await embeddingRepo.deleteByDocIds([docId]);
    for (const chunk of chunks) {
      if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0 || !chunk.chunkId) continue;
      await embeddingRepo.upsert({
        id: chunk.chunkId,
        doc_id: docId,
        chunk_id: chunk.chunkId,
        chunk_index: Number(chunk.chunkIndex ?? 0),
        chunk_type: chunk.chunkType,
        content_hash: "",
        ctime: now,
        mtime: now,
        embedding: chunk.embedding,
        embedding_model: embeddingModel ?? "unknown",
        embedding_len: chunk.embedding.length
      });
    }
  }
  async clearEmbeddingsForDoc(docId, tenant) {
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo(tenant);
    await embeddingRepo.deleteByDocIds([docId]);
  }
  /**
   * Computes word/char counts and timestamps for the document row on `mobius_node`.
   */
  computeDocumentStatistics(doc) {
    const content = doc.sourceFileInfo.content ?? "";
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const charCount = content.length;
    const fm = doc.metadata.frontmatter;
    const fromFmUpdated = parseLooseTimestampToMs(fm?.[INDEX_FRONTMATTER_KEYS.updatedAt]) ?? parseLooseTimestampToMs(fm?.[INDEX_FRONTMATTER_KEYS.updated]);
    const updatedAt = fromFmUpdated !== void 0 ? fromFmUpdated : doc.sourceFileInfo.ctime ?? doc.sourceFileInfo.mtime ?? Date.now();
    return {
      word_count: wordCount > 0 ? wordCount : null,
      char_count: charCount > 0 ? charCount : null,
      last_open_ts: updatedAt,
      row_updated_at: updatedAt
    };
  }
  /**
   * `mobius_node.type` for indexed notes: `hub_doc` for everything under `{root}/Hub-Summaries`
   * (including auto `Hub-*.md` and user `Manual/*.md`).
   */
  resolveMobiusGraphNodeTypeForPath(path4) {
    const hub = getAIHubSummaryFolder();
    if (hub && isVaultPathUnderPrefix(path4, hub)) return GraphNodeType.HubDoc;
    return GraphNodeType.Document;
  }
  /**
   * Upserts the indexed document row on `mobius_node` via IndexedDocumentRepo (document or hub_doc; stats columns).
   * When LLM tags/summary are skipped but preserved, omits those columns so {@link IndexedDocumentRepo.upsert} keeps DB values.
   */
  async upsertIndexedDocument(doc, tenant, opts, existing) {
    const startTime = Date.now();
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const stats = this.computeDocumentStatistics(doc);
    const llmInferCreated = doc.metadata.inferCreatedAt;
    const tagsJson = opts.includeLlmTags ? encodeIndexedTagsBlob({
      topicTags: doc.metadata.topicTags ?? [],
      topicTagEntries: doc.metadata.topicTagEntries,
      functionalTagEntries: doc.metadata.functionalTagEntries ?? [],
      keywordTags: doc.metadata.keywordTags ?? [],
      ...doc.metadata.userKeywordTags !== void 0 ? { userKeywordTags: doc.metadata.userKeywordTags } : {},
      ...doc.metadata.textrankKeywordTerms?.length ? { textrankKeywordTerms: doc.metadata.textrankKeywordTerms } : {},
      timeTags: doc.metadata.timeTags ?? [],
      geoTags: doc.metadata.geoTags ?? [],
      personTags: doc.metadata.personTags ?? []
    }) : encodeIndexedTagsBlob(
      mergeIndexedTagsBlobForFastIndex(existing?.tags ?? null, {
        keywordTags: doc.metadata.keywordTags ?? [],
        userKeywordTags: doc.metadata.userKeywordTags,
        textrankKeywordTerms: doc.metadata.textrankKeywordTerms
      })
    );
    const payload = {
      id: doc.id,
      path: doc.sourceFileInfo.path,
      type: doc.type,
      title: doc.metadata.title ?? doc.id,
      mtime: doc.sourceFileInfo.mtime ?? 0,
      size: doc.sourceFileInfo.size ?? null,
      ctime: doc.sourceFileInfo.ctime ?? null,
      content_hash: doc.contentHash ?? null,
      tags: tagsJson,
      word_count: stats.word_count,
      char_count: stats.char_count,
      last_open_ts: stats.last_open_ts,
      row_updated_at: stats.row_updated_at,
      mobiusGraphNodeType: this.resolveMobiusGraphNodeTypeForPath(doc.sourceFileInfo.path)
    };
    if (opts.includeLlmSummary) {
      payload.summary = doc.summary ?? null;
      payload.full_summary = doc.fullSummary ?? null;
    } else if (!opts.preserveExistingLlmDataWhenSkipped || !existing) {
      payload.summary = doc.summary ?? null;
      payload.full_summary = doc.fullSummary ?? null;
    }
    if (typeof llmInferCreated === "number" && Number.isFinite(llmInferCreated)) {
      payload.infer_created_at = llmInferCreated;
    }
    try {
      await indexedDocumentRepo.upsert(payload);
      const elapsed = Date.now() - startTime;
      if (elapsed > 100) {
        console.warn(`[IndexService] upsertIndexedDocument took ${elapsed}ms for ${doc.sourceFileInfo.path}`);
      }
    } catch (error) {
      console.error(`[IndexService] Error upserting indexed document for ${doc.sourceFileInfo.path}:`, error);
      throw error;
    }
  }
  /**
   * Update index state (document count and build timestamp).
   */
  async updateIndexState(tenant = "vault") {
    const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
    const now = Date.now();
    const indexedCount = await indexStateRepo.get(INDEX_STATE_KEYS.indexedDocs);
    const newCount = Number(indexedCount ?? 0) + 1;
    await indexStateRepo.set(INDEX_STATE_KEYS.indexedDocs, String(newCount));
    await indexStateRepo.set(INDEX_STATE_KEYS.builtAt, String(now));
  }
  /**
   * Batch-load indexed document id + title for outgoing link targets that omit `docId`, so edges use the same node id as the DB (e.g. after path collision handling / renames).
   */
  async loadPathToIndexedDocInfoMap(tenant, sameTenantOutgoing) {
    const paths = [...new Set(sameTenantOutgoing.filter((r) => !r.docId).map((r) => r.fullPath))];
    if (paths.length === 0) return /* @__PURE__ */ new Map();
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const byPath = await indexedDocumentRepo.getByPaths(paths);
    const out = /* @__PURE__ */ new Map();
    for (const p of paths) {
      const row = byPath.get(p);
      if (row) out.set(p, { id: row.id, title: row.title });
    }
    return out;
  }
  /**
   * Loads indexed rows for all resolved outgoing target node ids (covers refs with `docId` and path-based resolution).
   */
  async loadIndexedRecordsForOutgoingTargets(tenant, pathMap, sameTenantOutgoing) {
    const ids = /* @__PURE__ */ new Set();
    for (const ref of sameTenantOutgoing) {
      ids.add(this.resolveOutgoingTargetNodeId(ref, pathMap));
    }
    if (ids.size === 0) return /* @__PURE__ */ new Map();
    const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
    const rows = await indexedDocumentRepo.getByIds([...ids]);
    return new Map(rows.map((r) => [r.id, r]));
  }
  /** Resolves Mobius document node id for an outgoing reference (parser id, indexed row, or path-stable fallback). */
  resolveOutgoingTargetNodeId(ref, pathMap) {
    return ref.docId ?? pathMap.get(ref.fullPath)?.id ?? generateDocIdFromPath(ref.fullPath);
  }
  /**
   * Keeps only refs whose target path is indexed in the same tenant DB as the source document.
   * Cross-tenant wiki links are ignored (no cross-DB reference edges or placeholder nodes).
   */
  filterOutgoingRefsForTenant(outgoing, tenant) {
    return outgoing.filter((r) => getIndexTenantForPath(r.fullPath) === tenant);
  }
  /**
   * Upserts tag nodes (topic / functional / keyword) and ref edges for this document. The document `mobius_node` row is written only by {@link upsertIndexedDocument}.
   * When `includeLlmTagEdges` is false, only reference edges and keyword tag edges are refreshed (LLM topic/functional/context edges are left as-is).
   */
  async upsertGraphEdgesForDocument(doc, tenant, pathMap, indexedByTargetId, sameTenantOutgoing, includeLlmTagEdges) {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const docNodeId = doc.id;
    const lcaMax = INDEX_LONG_RANGE_LCA_MAX_DEPTH;
    const sourcePath = doc.sourceFileInfo.path;
    await mobiusEdgeRepo.deleteByFromNodeAndType(docNodeId, GraphEdgeType.References);
    await mobiusEdgeRepo.deleteByFromNodeAndType(docNodeId, GraphEdgeType.ReferencesResource);
    const loaderMgr = DocumentLoaderManager.getInstance();
    for (const ref of sameTenantOutgoing) {
      const targetNodeId = this.resolveOutgoingTargetNodeId(ref, pathMap);
      const fallbackLabel = getFileNameFromPath(ref.fullPath);
      const indexed = indexedByTargetId.get(targetNodeId);
      const docType = loaderMgr.getTypeForPath(ref.fullPath);
      const isDocRef = countsAsDocOutgoingTarget(docType);
      const label = indexed?.title?.trim() ? indexed.title.trim() : fallbackLabel;
      const targetGraphType = indexed ? this.resolveMobiusGraphNodeTypeForPath(ref.fullPath) : graphNodeTypeForPlaceholderReferenceTarget(ref.fullPath, docType);
      await mobiusNodeRepo.upsert({
        id: targetNodeId,
        type: targetGraphType,
        label,
        attributes: JSON.stringify({ path: ref.fullPath, docType: docType ?? void 0 })
      });
      const lcaDepth = pathLcaDepth(sourcePath, ref.fullPath);
      const crosses = crossesTopLevelFolder(sourcePath, ref.fullPath);
      const longRange = crosses && lcaDepth <= lcaMax;
      const edgeType = isDocRef ? GraphEdgeType.References : GraphEdgeType.ReferencesResource;
      await mobiusEdgeRepo.upsert({
        id: MobiusEdgeRepo.generateEdgeId(docNodeId, targetNodeId, edgeType),
        from_node_id: docNodeId,
        to_node_id: targetNodeId,
        type: edgeType,
        weight: 1,
        attributes: JSON.stringify({ longRange, lcaDepth })
      });
    }
    if (includeLlmTagEdges) {
      for (const t of [
        GraphEdgeType.TaggedTopic,
        GraphEdgeType.TaggedFunctional,
        GraphEdgeType.TaggedContext
      ]) {
        await mobiusEdgeRepo.deleteByFromNodeAndType(docNodeId, t);
      }
    }
    await mobiusEdgeRepo.deleteByFromNodeAndType(docNodeId, GraphEdgeType.TaggedKeyword);
    const functionalSanitized = filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []);
    if (includeLlmTagEdges) {
      const topicItems = doc.metadata.topicTagEntries?.length ? doc.metadata.topicTagEntries : (doc.metadata.topicTags ?? []).map((id) => ({ id }));
      await upsertDocumentTagEdges(tenant, docNodeId, {
        nodeType: GraphNodeType.TopicTag,
        items: topicItems
      });
      await upsertDocumentTagEdges(tenant, docNodeId, {
        nodeType: GraphNodeType.FunctionalTag,
        items: functionalSanitized
      });
      const contextTriples = [
        ...(doc.metadata.timeTags ?? []).map((label) => ({ axis: "time", label })),
        ...(doc.metadata.geoTags ?? []).map((label) => ({ axis: "geo", label })),
        ...(doc.metadata.personTags ?? []).map((label) => ({ axis: "person", label }))
      ];
      await upsertDocumentTagEdges(tenant, docNodeId, {
        nodeType: GraphNodeType.ContextTag,
        items: contextTriples
      });
    }
    await upsertDocumentTagEdges(tenant, docNodeId, {
      nodeType: GraphNodeType.KeywordTag,
      items: graphKeywordTagsForMobius(doc.metadata)
    });
  }
  /**
   * Adds folder hierarchy `contains` edges (Folder nodes → child folder or document).
   */
  async upsertFolderContainsEdgesForDocument(doc, tenant) {
    const path4 = doc.sourceFileInfo.path;
    const parts = pathSegments(path4);
    if (parts.length < 2) {
      return;
    }
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const now = Date.now();
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = parts.slice(0, i + 1).join("/");
      const folderId = stableMobiusFolderNodeId(tenant, folderPath);
      const label = parts[i] ?? folderPath;
      await mobiusNodeRepo.upsert({
        id: folderId,
        type: GraphNodeType.Folder,
        label,
        attributes: JSON.stringify({ path: folderPath }),
        created_at: now,
        updated_at: now
      });
      if (i > 0) {
        const parentFolderPath2 = parts.slice(0, i).join("/");
        const parentId = stableMobiusFolderNodeId(tenant, parentFolderPath2);
        await mobiusEdgeRepo.upsert({
          id: MobiusEdgeRepo.generateEdgeId(parentId, folderId, GraphEdgeType.Contains),
          from_node_id: parentId,
          to_node_id: folderId,
          type: GraphEdgeType.Contains,
          weight: 1,
          attributes: JSON.stringify({})
        });
      }
    }
    const lastFolderPath = parts.slice(0, -1).join("/");
    const lastFolderId = stableMobiusFolderNodeId(tenant, lastFolderPath);
    await mobiusEdgeRepo.upsert({
      id: MobiusEdgeRepo.generateEdgeId(lastFolderId, doc.id, GraphEdgeType.Contains),
      from_node_id: lastFolderId,
      to_node_id: doc.id,
      type: GraphEdgeType.Contains,
      weight: 1,
      attributes: JSON.stringify({})
    });
  }
  /**
   * After edges are written: set this doc's outgoing counts from the parsed graph, recompute incoming for this doc and linked doc nodes, refresh tag_doc_count for touched tags.
   */
  async refreshMobiusAggregatesForIndexedDocument(doc, tenant, pathMap, indexedByTargetId, sameTenantOutgoing) {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const now = Date.now();
    const loaderMgr = DocumentLoaderManager.getInstance();
    let docOutgoing = 0;
    let resourceRefOutgoing = 0;
    for (const ref of sameTenantOutgoing) {
      const dt = loaderMgr.getTypeForPath(ref.fullPath);
      if (countsAsDocOutgoingTarget(dt)) docOutgoing++;
      else resourceRefOutgoing++;
    }
    const functionalN = filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []).length;
    const ctxN = (doc.metadata.timeTags ?? []).length + (doc.metadata.geoTags ?? []).length + (doc.metadata.personTags ?? []).length;
    const otherOutgoing = (doc.metadata.topicTags ?? []).length + functionalN + (doc.metadata.keywordTags ?? []).length + ctxN + resourceRefOutgoing;
    const outgoing = { doc_outgoing_cnt: docOutgoing, other_outgoing_cnt: otherOutgoing };
    await mobiusNodeRepo.setDocumentOutgoingDegreeCounts(
      doc.id,
      outgoing.doc_outgoing_cnt,
      outgoing.other_outgoing_cnt,
      now
    );
    const docIdsForIncoming = /* @__PURE__ */ new Set([doc.id]);
    for (const ref of sameTenantOutgoing) {
      const targetId = this.resolveOutgoingTargetNodeId(ref, pathMap);
      const indexed = indexedByTargetId.get(targetId);
      const dt = loaderMgr.getTypeForPath(ref.fullPath);
      if (indexed) {
        docIdsForIncoming.add(targetId);
      } else if (graphNodeTypeForPlaceholderReferenceTarget(ref.fullPath, dt) !== GraphNodeType.Resource) {
        docIdsForIncoming.add(targetId);
      }
    }
    await mobiusNodeRepo.refreshDocumentIncomingDegreesForNodeIds([...docIdsForIncoming], now);
    const tagNodeIds = [
      ...(doc.metadata.topicTags ?? []).map((t) => stableTopicTagNodeId(t)),
      ...filterValidFunctionalTagEntries(doc.metadata.functionalTagEntries ?? []).map(
        (e) => stableFunctionalTagNodeId(e.id)
      ),
      ...graphKeywordTagsForMobius(doc.metadata).map((k) => stableKeywordTagNodeId(k)),
      ...(doc.metadata.timeTags ?? []).map((label) => stableContextTagNodeId("time", label)),
      ...(doc.metadata.geoTags ?? []).map((label) => stableContextTagNodeId("geo", label)),
      ...(doc.metadata.personTags ?? []).map((label) => stableContextTagNodeId("person", label))
    ];
    if (tagNodeIds.length) {
      await mobiusNodeRepo.refreshTagDocCountsForTagNodeIds(tagNodeIds, now);
    }
  }
  async writeCascadeDebt(tenant, change) {
    const cascadeRepo = sqliteStoreManager.getCascadeDebtRepo(tenant);
    const now = Date.now();
    if (change.embeddingChanged || change.contentHashChanged) {
      await cascadeRepo.insertOrUpdatePriority({
        tenant,
        sourcePath: change.docPath,
        targetId: change.docNodeId,
        debtType: "semantic_edge",
        priority: CASCADE_DEBT_SEMANTIC_EDGE_PRIORITY,
        changeMagnitude: change.changeMagnitude,
        createdAt: now
      });
      await cascadeRepo.insertOrUpdatePriority({
        tenant,
        sourcePath: change.docPath,
        targetId: change.docNodeId,
        debtType: "mermaid_overlay",
        priority: CASCADE_DEBT_MERMAID_OVERLAY_PRIORITY,
        changeMagnitude: change.changeMagnitude,
        createdAt: now
      });
    }
    if (change.outgoingLinksChanged) {
      const allAffectedIds = /* @__PURE__ */ new Set([...change.oldOutgoingTargetIds, ...change.newOutgoingTargetIds]);
      for (const targetId of allAffectedIds) {
        await cascadeRepo.insertOrUpdatePriority({
          tenant,
          sourcePath: change.docPath,
          targetId,
          debtType: "degree_refresh",
          priority: CASCADE_DEBT_DEGREE_REFRESH_PRIORITY,
          changeMagnitude: null,
          createdAt: now
        });
      }
    }
  }
  // --- Global maintenance (formerly GlobalMaintenanceService) ---
  /** Clears debt after a successful full maintenance pass for the given tenants. */
  async resetMaintenanceDebtAfterFullMaintenance(tenants) {
    const now = Date.now();
    for (const tenant of tenants) {
      const indexStateRepo = sqliteStoreManager.getIndexStateRepo(tenant);
      await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.dirtyScore, "0");
      await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.needed, "0");
      await indexStateRepo.set(MOBIUS_MAINTENANCE_STATE_KEYS.lastFullAt, String(now));
    }
  }
  /**
   * Full Mobius maintenance: aggregate columns, reference-graph PageRank, `semantic_related` rebuild, then weighted semantic PageRank.
   */
  async runMobiusGlobalMaintenance(tenants = ["vault", "chat"], options) {
    const onProgress = options?.onProgress;
    const sw = new Stopwatch("[IndexService] runMobiusGlobalMaintenance");
    sw.start("mobius_aggregates");
    for (const tenant of tenants) {
      await this.refreshMobiusAggregatesInternal(tenant, onProgress);
    }
    sw.stop();
    sw.start("mobius_pagerank");
    for (const tenant of tenants) {
      await this.computeAndPersistVaultPageRankInternal(tenant, onProgress);
    }
    sw.stop();
    sw.start("semantic_related_edges");
    const semanticRebuildResults = [];
    for (const tenant of tenants) {
      const r = await SemanticRelatedEdgesRebuildService.rebuildForTenant(tenant, {
        onProgress: !onProgress ? void 0 : (p) => onProgress({
          tenant: p.tenant,
          phase: "semantic_related",
          progressTextSuffix: `${p.processed}/${p.total} docs`
        })
      });
      semanticRebuildResults.push(r);
      await yieldForLargePass();
    }
    sw.stop();
    sw.start("semantic_pagerank");
    for (let i = 0; i < tenants.length; i++) {
      const tenant = tenants[i];
      const rebuild = semanticRebuildResults[i];
      if (rebuild?.skipped) continue;
      await this.computeAndPersistSemanticPageRankInternal(tenant, onProgress);
    }
    sw.stop();
    if (tenants.includes("vault")) {
      sw.start("folder_hub_stats");
      await this.rebuildFolderHubStatsForVaultInternal(onProgress);
      sw.stop();
    }
    sw.print();
    await this.resetMaintenanceDebtAfterFullMaintenance(tenants);
  }
  /**
   * Rebuild tag_doc_count and document degree columns via **paged SQL** (keyset on `node_id`, LIMIT = {@link DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE}).
   */
  async refreshMobiusAggregatesInternal(tenant, onProgress) {
    const now = Date.now();
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    await mobiusNodeRepo.forEachNodeIdsByTypesKeyset(
      GRAPH_TAG_NODE_TYPES,
      DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE,
      async (ids, batchIndex) => {
        await mobiusNodeRepo.refreshTagDocCountsForTagNodeIds(ids, now);
        onProgress?.({
          tenant,
          phase: "tag_doc_count",
          progressTextSuffix: `batch ${batchIndex ?? 0} \xB7 ${ids.length ?? 0} items`
        });
      },
      yieldForLargePass
    );
    await mobiusNodeRepo.forEachNodeIdsByTypesKeyset(
      GRAPH_DOCUMENT_LIKE_NODE_TYPES,
      DEFAULT_MOBIUS_AGGREGATE_BATCH_SIZE,
      async (ids, batchIndex) => {
        await mobiusNodeRepo.refreshDocumentDegreesForNodeIds(ids, now);
        onProgress?.({
          tenant,
          phase: "document_degrees",
          progressTextSuffix: `batch ${batchIndex ?? 0} \xB7 ${ids.length ?? 0} items`
        });
      },
      yieldForLargePass
    );
  }
  /**
   * Runs global PageRank on the directed **references** subgraph (wiki links between document-like nodes)
   * and writes `pagerank` / `pagerank_updated_at` / `pagerank_version` on `mobius_node` (dedicated columns).
   *
   * **Why not load the whole graph into memory?** The math needs many iterations; each iteration
   * re-scans `mobius_edge` in batches and only keeps O(N) state (ranks + out-degrees), not O(E) adjacency lists.
   *
   * **Out-degree source:** `doc_outgoing_cnt` on `mobius_node` — it counts reference edges to other
   * document-like targets. This run should follow `refreshDocumentDegreesForNodeIds` in full maintenance
   * so counts match the edges we scan.
   */
  async computeAndPersistVaultPageRankInternal(tenant, onProgress) {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const vertices = await mobiusNodeRepo.listDocLikePageRankVertices();
    const nodeIds = vertices.map((v) => v.node_id);
    const outDeg = new Int32Array(vertices.length);
    for (let i = 0; i < vertices.length; i++) {
      outDeg[i] = vertices[i].doc_outgoing_cnt;
    }
    const scores = await computeVaultPageRankStreaming(
      nodeIds,
      outDeg,
      async (visit2, iterIndex) => {
        let edgeBatchIndex = 0;
        for await (const batch of mobiusEdgeRepo.iterateReferenceEdgeBatches(PAGERANK_EDGE_BATCH_SIZE)) {
          for (const e of batch) {
            visit2(e.from_node_id, e.to_node_id);
          }
          if (iterIndex === 0) {
            onProgress?.({
              tenant,
              phase: "pagerank_edges",
              progressTextSuffix: `batch ${edgeBatchIndex ?? 0} \xB7 ${batch.length ?? 0} items`
            });
          }
          await yieldForLargePass();
        }
      }
    );
    const now = Date.now();
    const version = PAGERANK_ALGORITHM_VERSION;
    const persistChunk = 200;
    let n = 0;
    let persistBatchIndex = 0;
    for (const id of nodeIds) {
      const score = scores.get(id) ?? 0;
      await mobiusNodeRepo.setPageRankForDocLikeNode(
        id,
        {
          pagerank: score,
          pagerank_updated_at: now,
          pagerank_version: version
        },
        now
      );
      n++;
      if (n % persistChunk === 0) {
        persistBatchIndex++;
        onProgress?.({
          tenant,
          phase: "pagerank_persist",
          progressTextSuffix: `batch ${persistBatchIndex} \xB7 ${persistChunk} items`
        });
        await yieldForLargePass();
      }
    }
    const remainder = n % persistChunk;
    if (remainder > 0) {
      persistBatchIndex++;
      onProgress?.({
        tenant,
        phase: "pagerank_persist",
        progressTextSuffix: `batch ${persistBatchIndex} \xB7 ${remainder} items`
      });
    }
  }
  /**
   * Weighted PageRank on `semantic_related` (edge weights = similarity). Runs after semantic edge rebuild.
   */
  async computeAndPersistSemanticPageRankInternal(tenant, onProgress) {
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const nodeIds = await mobiusNodeRepo.listDocLikeSemanticPageRankVertices();
    if (!nodeIds.length) return;
    const outgoingWeightSum = await accumulateSemanticOutgoingWeightSums(nodeIds, async (visit2) => {
      for await (const batch of mobiusEdgeRepo.iterateSemanticRelatedEdgeBatches(PAGERANK_EDGE_BATCH_SIZE)) {
        for (const e of batch) {
          visit2(e.from_node_id, e.to_node_id, e.weight);
        }
        await yieldForLargePass();
      }
    });
    const scores = await computeSemanticPageRankStreaming(
      nodeIds,
      outgoingWeightSum,
      async (visit2, iterIndex) => {
        let edgeBatchIndex = 0;
        for await (const batch of mobiusEdgeRepo.iterateSemanticRelatedEdgeBatches(PAGERANK_EDGE_BATCH_SIZE)) {
          for (const e of batch) {
            visit2(e.from_node_id, e.to_node_id, e.weight);
          }
          if (iterIndex === 0) {
            edgeBatchIndex++;
            onProgress?.({
              tenant,
              phase: "semantic_pagerank_edges",
              progressTextSuffix: `batch ${edgeBatchIndex} \xB7 ${batch.length ?? 0} items`
            });
          }
          await yieldForLargePass();
        }
      }
    );
    const now = Date.now();
    const version = SEMANTIC_PAGERANK_ALGORITHM_VERSION;
    const persistChunk = 200;
    let n = 0;
    let persistBatchIndex = 0;
    for (const id of nodeIds) {
      const score = scores.get(id) ?? 0;
      await mobiusNodeRepo.setPageRankForDocLikeNode(
        id,
        {
          semantic_pagerank: score,
          semantic_pagerank_updated_at: now,
          semantic_pagerank_version: version
        },
        now
      );
      n++;
      if (n % persistChunk === 0) {
        persistBatchIndex++;
        onProgress?.({
          tenant,
          phase: "semantic_pagerank_persist",
          progressTextSuffix: `batch ${persistBatchIndex} \xB7 ${persistChunk} items`
        });
        await yieldForLargePass();
      }
    }
    const remainder = n % persistChunk;
    if (remainder > 0) {
      persistBatchIndex++;
      onProgress?.({
        tenant,
        phase: "semantic_pagerank_persist",
        progressTextSuffix: `batch ${persistBatchIndex} \xB7 ${remainder} items`
      });
    }
  }
  /**
   * Materializes folder hub columns on `type=folder` (vault): per-folder doc averages + subtree **boundary** degrees.
   * Must run after reference + semantic PageRank are persisted on documents.
   */
  async rebuildFolderHubStatsForVaultInternal(onProgress) {
    const tenant = "vault";
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);
    const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
    const now = Date.now();
    await mobiusNodeRepo.clearFolderHubMaterializedStatsColumns(now);
    const hubFolder = getAIHubSummaryFolder();
    const byFolder = /* @__PURE__ */ new Map();
    const getAgg = (folderPath) => {
      let agg = byFolder.get(folderPath);
      if (!agg) {
        agg = { count: 0, sumPr: 0, sumSpr: 0, docIn: 0, docOut: 0, otherIn: 0, otherOut: 0 };
        byFolder.set(folderPath, agg);
      }
      return agg;
    };
    let afterNodeId = null;
    let docPageIndex = 0;
    for (; ; ) {
      const page = await mobiusNodeRepo.listDocumentRowsForFolderHubStatsKeyset(
        afterNodeId,
        FOLDER_HUB_STATS_DOC_PAGE_SIZE,
        hubFolder
      );
      if (!page.length) break;
      for (const r of page) {
        const path4 = r.path ?? "";
        if (!path4) continue;
        const pr = typeof r.pagerank === "number" && Number.isFinite(r.pagerank) ? r.pagerank : 0;
        const spr = typeof r.semantic_pagerank === "number" && Number.isFinite(r.semantic_pagerank) ? r.semantic_pagerank : 0;
        let cur = path4;
        for (; ; ) {
          const slash = cur.lastIndexOf("/");
          if (slash <= 0) break;
          const folder = cur.slice(0, slash);
          if (hubFolder && isVaultPathUnderPrefix(folder, hubFolder)) break;
          const agg = getAgg(folder);
          agg.count += 1;
          agg.sumPr += pr;
          agg.sumSpr += spr;
          cur = folder;
        }
      }
      afterNodeId = page[page.length - 1].node_id;
      docPageIndex++;
      onProgress?.({
        tenant,
        phase: "folder_hub_stats",
        progressTextSuffix: `docs batch ${docPageIndex} \xB7 ${page.length ?? 0} rows`
      });
      await yieldForLargePass();
    }
    let edgeBatchIndex = 0;
    for await (const batch of mobiusEdgeRepo.iterateMobiusEdgeBatchesWithEndpointMetadata(
      FOLDER_HUB_BOUNDARY_EDGE_BATCH_SIZE
    )) {
      for (const e of batch) {
        const fromSet = membershipFolderPathsForGraphNode(e.from_type, e.from_path);
        const toSet = membershipFolderPathsForGraphNode(e.to_type, e.to_path);
        const isDocRefEdge = e.type === GraphEdgeType.References;
        for (const f of fromSet) {
          if (!toSet.has(f) && folderHubStatsPathAllowed(f, hubFolder)) {
            const agg = getAgg(f);
            if (isDocRefEdge) agg.docOut += 1;
            else agg.otherOut += 1;
          }
        }
        for (const f of toSet) {
          if (!fromSet.has(f) && folderHubStatsPathAllowed(f, hubFolder)) {
            const agg = getAgg(f);
            if (isDocRefEdge) agg.docIn += 1;
            else agg.otherIn += 1;
          }
        }
      }
      edgeBatchIndex++;
      onProgress?.({
        tenant,
        phase: "folder_hub_stats",
        progressTextSuffix: `edges batch ${edgeBatchIndex} \xB7 ${batch.length ?? 0} rows`
      });
      await yieldForLargePass();
    }
    const writeAt = Date.now();
    let folderWriteIndex = 0;
    for (const [folderPath, agg] of byFolder) {
      const nodeId = stableMobiusFolderNodeId(tenant, folderPath);
      const n = agg.count;
      const avgPr = agg.sumPr / Math.max(1, n);
      const avgSpr = agg.sumSpr / Math.max(1, n);
      await mobiusNodeRepo.updateFolderNodeHubMaterializedStats(
        nodeId,
        {
          tagDocCount: n,
          avgPagerank: avgPr,
          avgSemanticPagerank: avgSpr,
          folderCohesionScore: null,
          docIncoming: agg.docIn,
          docOutgoing: agg.docOut,
          otherIncoming: agg.otherIn,
          otherOutgoing: agg.otherOut
        },
        writeAt
      );
      folderWriteIndex++;
      if (folderWriteIndex % 150 === 0) {
        await yieldForLargePass();
      }
    }
  }
  // --- Batch enrichment (static) ---
  /**
   * LLM tags + summary for documents marked `llm_pending` (fast index deferred enrichment).
   * Does not bump global index_state; does not re-chunk unless options change.
   */
  static async runPendingLlmIndexEnrichment(settings, options) {
    if (!sqliteStoreManager.isInitialized()) {
      return {
        processed: 0,
        skippedWrongTenant: 0,
        errors: [{ path: "", message: "SQLite not initialized" }]
      };
    }
    const indexSvc = _IndexService.getInstance();
    const baseOpts = defaultIndexDocumentOptions("llm_enrich_only");
    const tenants = ["vault", "chat"];
    let processed = 0;
    let skippedWrongTenant = 0;
    const errors = [];
    const pendingPaths = [];
    for (const tenant of tenants) {
      const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const paths = await repo.listPathsWithPendingLlm();
      for (const path4 of paths) {
        if (getIndexTenantForPath(path4) !== tenant) {
          skippedWrongTenant++;
          continue;
        }
        pendingPaths.push(path4);
      }
    }
    const total = pendingPaths.length;
    let done = 0;
    const batchStartMs = Date.now();
    const ai = AppContext.getInstance().manager;
    const tracker = new LlmEnrichmentProgressTracker(settings, ai);
    const loaderMgr = DocumentLoaderManager.getInstance();
    const readMarkdownContentChars = async (path4) => {
      const app = AppContext.getApp();
      const f = app.vault.getAbstractFileByPath(path4);
      if (!f || !(f instanceof import_obsidian12.TFile)) return 0;
      const ext = f.extension.toLowerCase();
      if (ext !== "md" && ext !== "markdown") return 0;
      const content = await app.vault.cachedRead(f);
      return content.length;
    };
    const logPendingLlmEnrichmentDocComplete = async (params) => {
      const tenant = getIndexTenantForPath(params.path);
      const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const indexed = await repo.getByPath(params.path);
      const tok = normalizeUsageTokens(params.usage);
    };
    const adaptivePool = new AdaptiveConcurrencyPool({
      initial: LLM_PENDING_ENRICH_CONCURRENCY,
      min: 1,
      max: LLM_PENDING_ENRICH_CONCURRENCY * 2,
      targetLatencyMs: 8e3
      // 8s target per doc
    });
    await adaptivePool.mapWithAdaptiveConcurrency(
      pendingPaths,
      async (path4) => {
        if (options?.shouldContinue && !options.shouldContinue()) {
          return;
        }
        const docType = loaderMgr.getTypeForPath(path4);
        let plan = tracker.emptyPlan();
        if (docType === "markdown") {
          const chars = await readMarkdownContentChars(path4);
          plan = await tracker.planForMarkdownDoc(chars);
        }
        const llmTelemetry = {
          snapshot: null
        };
        const onLlmIndexingComplete = (ev) => {
          llmTelemetry.snapshot = { usage: ev.usage, costUsd: ev.costUsd };
        };
        const t0 = Date.now();
        try {
          await indexSvc.indexDocument(path4, settings, {
            ...baseOpts,
            onLlmIndexingComplete
          });
          processed++;
          done++;
          const wallMs = Date.now() - t0;
          const snap = llmTelemetry.snapshot;
          const actual = {
            durationMs: wallMs,
            usage: snap?.usage ?? emptyUsage(),
            costUsd: snap?.costUsd ?? 0
          };
          tracker.recordDocComplete(plan, actual);
          await logPendingLlmEnrichmentDocComplete({
            path: path4,
            docType,
            status: "success",
            wallMs,
            usage: actual.usage,
            costUsd: actual.costUsd,
            done,
            total
          });
          options?.onProgress?.(
            tracker.snapshot({
              path: path4,
              processed: done,
              total,
              batchStartMs,
              lastPlan: plan,
              lastActual: actual
            })
          );
        } catch (e) {
          errors.push({ path: path4, message: e.message ?? String(e) });
          done++;
          const wallMs = Date.now() - t0;
          const snap = llmTelemetry.snapshot;
          const actual = {
            durationMs: wallMs,
            usage: snap?.usage ?? emptyUsage(),
            costUsd: snap?.costUsd ?? 0
          };
          tracker.recordDocComplete(plan, actual);
          await logPendingLlmEnrichmentDocComplete({
            path: path4,
            docType,
            status: "error",
            wallMs,
            usage: actual.usage,
            costUsd: actual.costUsd,
            done,
            total,
            error: e
          });
          options?.onProgress?.(
            tracker.snapshot({
              path: path4,
              processed: done,
              total,
              batchStartMs,
              lastPlan: plan,
              lastActual: actual
            })
          );
          throw e;
        }
      },
      {}
    );
    return { processed, skippedWrongTenant, errors };
  }
  /**
   * Vector embeddings for documents marked `vector_pending`; uses persisted chunks, no core FTS re-pass.
   */
  static async runPendingVectorIndexEnrichment(settings, options) {
    if (!sqliteStoreManager.isInitialized()) {
      return {
        processed: 0,
        skippedWrongTenant: 0,
        errors: [{ path: "", message: "SQLite not initialized" }]
      };
    }
    const index = _IndexService.getInstance();
    const opts = defaultIndexDocumentOptions("vector_enrich_only");
    const tenants = ["vault", "chat"];
    let processed = 0;
    let skippedWrongTenant = 0;
    const errors = [];
    const pendingPaths = [];
    for (const tenant of tenants) {
      const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const paths = await repo.listPathsWithPendingVector();
      for (const path4 of paths) {
        if (getIndexTenantForPath(path4) !== tenant) {
          skippedWrongTenant++;
          continue;
        }
        pendingPaths.push(path4);
      }
    }
    const total = pendingPaths.length;
    let done = 0;
    for (const path4 of pendingPaths) {
      try {
        await index.indexDocument(path4, settings, opts);
        processed++;
        done++;
        options?.onProgress?.({ processed: done, total, path: path4 });
      } catch (e) {
        errors.push({ path: path4, message: e.message ?? String(e) });
        done++;
        options?.onProgress?.({ processed: done, total, path: path4 });
      }
    }
    return { processed, skippedWrongTenant, errors };
  }
  /**
   * Clears `llm_pending` flags on all pending documents without calling LLM.
   * Use when the user explicitly skips LLM enrichment.
   */
  static async clearPendingLlmFlags() {
    if (!sqliteStoreManager.isInitialized()) return { cleared: 0 };
    const tenants = ["vault", "chat"];
    let cleared = 0;
    for (const tenant of tenants) {
      const repo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
      const paths = await repo.listPathsWithPendingLlm();
      const filtered = paths.filter((p) => getIndexTenantForPath(p) === tenant);
      const idMap = await repo.getIdsByPaths(filtered);
      for (const { id } of idMap) {
        await repo.mergeDocumentLlmState(id, {
          llm_pending: false,
          llm_pending_reason: null
        });
        cleared++;
      }
    }
    return { cleared };
  }
};

// src/service/agents/VaultSearchAgentSDK.ts
init_types();

// src/service/agents/vault-sdk/vaultMcpServer.ts
var import_claude_agent_sdk3 = require("@anthropic-ai/claude-agent-sdk");
var import_zod = require("zod");

// src/service/context/WorkingThemeInferrer.ts
var INFERENCE_THRESHOLD = 10;
var INFERENCE_DEBOUNCE_MS = 3e4;
var WorkingThemeInferrer = class {
  constructor() {
    this.activitiesSinceLastInference = 0;
    this.debounceTimer = null;
    this.isRunning = false;
  }
  onActivity() {
    this.activitiesSinceLastInference++;
    if (this.activitiesSinceLastInference >= INFERENCE_THRESHOLD && !this.isRunning) {
      this.scheduleInference();
    }
  }
  forceInference(activities) {
    if (this.isRunning) return;
    this.runInference(activities);
  }
  scheduleInference() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      const ctx = AppContext.getSessionContext().getWorkingContext();
      await this.runInference(ctx.recentActivities);
    }, INFERENCE_DEBOUNCE_MS);
  }
  async runInference(activities) {
    if (this.isRunning || activities.length === 0) return;
    this.isRunning = true;
    try {
      const manager = AppContext.getManager();
      const activitiesInput = activities.slice(0, 20).map((a) => ({
        type: a.type,
        summary: a.summary,
        timestamp: a.timestamp
      }));
      const response = await manager.queryText("working-theme-inference" /* WorkingThemeInference */, {
        activities: activitiesInput
      });
      const parsed = JSON.parse(response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
      AppContext.getSessionContext().setLlmInferredTheme({
        summary: parsed.summary ?? "",
        relatedFiles: parsed.relatedFiles ?? [],
        updatedAt: Date.now()
      });
      this.activitiesSinceLastInference = 0;
    } catch (err) {
      console.warn("[WorkingThemeInferrer] Failed:", err);
    } finally {
      this.isRunning = false;
    }
  }
  destroy() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
};

// src/service/context/SessionContextService.ts
var DECAY_WINDOW_MS = 30 * 60 * 1e3;
var CONTINUOUS_GROUP_THRESHOLD_MS = 3e3;
var MAX_ACTIVITIES = 200;
var EVENT_TO_OP = {
  ["peak:message-sent" /* MESSAGE_SENT */]: "chat_message",
  ["copilot-action" /* COPILOT_ACTION */]: "copilot_action",
  ["search-query" /* SEARCH_QUERY */]: "search_query",
  ["ai-analysis-complete" /* AI_ANALYSIS_COMPLETE */]: "ai_analysis_complete",
  ["resource-attached" /* RESOURCE_ATTACHED */]: "resource_attach"
};
var ROW_TYPE_TO_OP = {
  chat_message: "chat_message",
  ai_analysis_complete: "ai_analysis_complete",
  ai_analysis: "ai_analysis_complete",
  // legacy name from MobiusOperationType.AI_ANALYSIS
  copilot_action: "copilot_action",
  file_open: "file_open",
  resource_attach: "resource_attach",
  search_query: "search_query"
};
function parentFolder(filePath) {
  const idx = filePath.lastIndexOf("/");
  return idx > 0 ? filePath.slice(0, idx) : "/";
}
function safeParseMeta(json) {
  if (!json) return void 0;
  try {
    return JSON.parse(json);
  } catch {
    return void 0;
  }
}
function extractRelatedPaths(row) {
  const paths = [];
  const meta2 = safeParseMeta(row.meta_json);
  if (meta2) {
    if (typeof meta2.vault_rel_path === "string") paths.push(meta2.vault_rel_path);
    if (typeof meta2.path === "string") paths.push(meta2.path);
    if (Array.isArray(meta2.paths)) {
      for (const p of meta2.paths) {
        if (typeof p === "string") paths.push(p);
      }
    }
  }
  return paths;
}
var SessionContextService = class _SessionContextService {
  constructor(app, eventBus) {
    this.themeInferrer = new WorkingThemeInferrer();
    this.unsubscribers = [];
    this.fileOpenRef = null;
    this.lastOpByType = /* @__PURE__ */ new Map();
    this.app = app;
    this.eventBus = eventBus;
    this.context = {
      activeFile: null,
      recentActivities: [],
      workingTheme: {
        ruleBased: { topTags: [], topFolders: [], topKeywords: [], summary: "" },
        llmInferred: null
      },
      updatedAt: Date.now()
    };
  }
  static {
    this.instance = null;
  }
  static getInstance(app, eventBus) {
    if (!_SessionContextService.instance) {
      if (!app || !eventBus) {
        throw new Error("SessionContextService.getInstance requires app and eventBus on first call");
      }
      _SessionContextService.instance = new _SessionContextService(app, eventBus);
    }
    return _SessionContextService.instance;
  }
  static destroyInstance() {
    if (_SessionContextService.instance) {
      _SessionContextService.instance.destroy();
      _SessionContextService.instance = null;
    }
  }
  async init() {
    await this.rebuildFromSqlite();
    this.subscribeEvents();
  }
  getWorkingContext() {
    return this.context;
  }
  setLlmInferredTheme(theme) {
    this.context.workingTheme.llmInferred = theme;
    this.context.updatedAt = Date.now();
  }
  destroy() {
    this.themeInferrer.destroy();
    for (const unsub of this.unsubscribers) {
      try {
        unsub();
      } catch {
      }
    }
    this.unsubscribers = [];
    if (this.fileOpenRef) {
      this.app.workspace.offref(this.fileOpenRef);
      this.fileOpenRef = null;
    }
  }
  async recordActivity(params) {
    const now = Date.now();
    const id = generateUuidWithoutHyphens();
    const groupId = this.assignContinuousGroup(params.type, now);
    const entry = {
      id,
      type: params.type,
      timestamp: now,
      summary: params.summary,
      relatedPaths: params.relatedPaths ?? [],
      importanceLevel: params.importanceLevel ?? 0,
      metadata: params.metadata
    };
    try {
      const repo = SqliteStoreManager.getInstance().getMobiusOperationRepo();
      await repo.insertRow({
        id,
        operation_type: params.type,
        operation_desc: params.summary.slice(0, 500),
        created_at: now,
        related_kind: params.relatedKind ?? null,
        related_id: params.relatedId ?? null,
        important_level: params.importanceLevel ?? null,
        continuous_group_id: groupId,
        meta_json: params.metadata ? JSON.stringify(params.metadata) : null
      });
    } catch (err) {
      console.warn("[SessionContextService] Failed to persist activity", err);
    }
    this.appendActivity(entry);
  }
  /** Convert raw DB rows into a WorkingContext, collapsing continuous groups. */
  static buildWorkingContextFromRows(rows) {
    const groups = /* @__PURE__ */ new Map();
    const standalone = [];
    for (const row of rows) {
      if (row.continuous_group_id) {
        const list = groups.get(row.continuous_group_id);
        if (list) {
          list.push(row);
        } else {
          groups.set(row.continuous_group_id, [row]);
        }
      } else {
        standalone.push(row);
      }
    }
    const activities = [];
    for (const [, groupRows] of groups) {
      const sorted = groupRows.sort((a, b) => a.created_at - b.created_at);
      const first = sorted[0];
      const allPaths = sorted.flatMap(extractRelatedPaths);
      const uniquePaths = [...new Set(allPaths)];
      const opType = ROW_TYPE_TO_OP[first.operation_type] ?? "chat_message";
      let summary;
      if (sorted.length === 1) {
        summary = first.operation_desc ?? "";
      } else {
        const folder = uniquePaths.length > 0 ? parentFolder(uniquePaths[0]) : "";
        summary = `${capitalizeFirst(opType.replace(/_/g, " "))} \xD7${sorted.length}` + (folder ? ` in ${folder}/` : "");
      }
      const meta2 = mergeMeta(sorted);
      activities.push({
        id: first.id,
        type: opType,
        timestamp: first.created_at,
        summary,
        relatedPaths: uniquePaths,
        importanceLevel: clampImportance(first.important_level),
        metadata: meta2
      });
    }
    for (const row of standalone) {
      activities.push({
        id: row.id,
        type: ROW_TYPE_TO_OP[row.operation_type] ?? "chat_message",
        timestamp: row.created_at,
        summary: row.operation_desc ?? "",
        relatedPaths: extractRelatedPaths(row),
        importanceLevel: clampImportance(row.important_level),
        metadata: safeParseMeta(row.meta_json)
      });
    }
    activities.sort((a, b) => b.timestamp - a.timestamp);
    const theme = _SessionContextService.computeRuleBasedTheme(activities);
    return {
      activeFile: null,
      recentActivities: activities,
      workingTheme: { ruleBased: theme, llmInferred: null },
      updatedAt: Date.now()
    };
  }
  static computeRuleBasedTheme(activities) {
    const folderCounts = /* @__PURE__ */ new Map();
    const keywordCounts = /* @__PURE__ */ new Map();
    const tagCounts = /* @__PURE__ */ new Map();
    for (const act of activities) {
      for (const p of act.relatedPaths) {
        const folder = parentFolder(p);
        folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
      }
      if (!act.metadata) continue;
      if (act.type === "search_query" && typeof act.metadata.query === "string") {
        const kw = act.metadata.query.trim();
        if (kw) keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
      }
      if (Array.isArray(act.metadata.tags)) {
        for (const t of act.metadata.tags) {
          if (typeof t === "string") {
            tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
          }
        }
      }
    }
    const topFolders = topN(folderCounts, 5);
    const topKeywords = topN(keywordCounts, 5);
    const topTags = topN(tagCounts, 5);
    const parts = [];
    if (topFolders.length > 0) parts.push(`Active in ${topFolders.slice(0, 2).join(", ")}`);
    if (topTags.length > 0) parts.push(`topics: ${topTags.slice(0, 3).map((t) => `#${t}`).join(", ")}`);
    if (topKeywords.length > 0) parts.push(`recent searches: '${topKeywords.slice(0, 2).join("', '")}'`);
    return {
      topFolders,
      topKeywords,
      topTags,
      summary: parts.join(", ") || "No recent activity"
    };
  }
  async rebuildFromSqlite() {
    try {
      const repo = SqliteStoreManager.getInstance().getMobiusOperationRepo();
      const sinceTs = Date.now() - DECAY_WINDOW_MS;
      const rows = await repo.getRecent({ limit: 200, sinceTs });
      this.context = _SessionContextService.buildWorkingContextFromRows(rows);
    } catch (err) {
      console.warn("[SessionContextService] Failed to rebuild from SQLite", err);
    }
  }
  subscribeEvents() {
    for (const [eventType, opType] of Object.entries(EVENT_TO_OP)) {
      const unsub = this.eventBus.on(eventType, (event) => {
        this.handleBusEvent(opType, event);
      });
      this.unsubscribers.push(unsub);
    }
    this.fileOpenRef = this.app.workspace.on("file-open", (file) => {
      this.handleFileOpen(file);
    });
  }
  handleBusEvent(opType, event) {
    const summary = String(event?.operation_desc ?? event?.query ?? event?.summary ?? opType.replace(/_/g, " "));
    const paths = [];
    if (typeof event?.path === "string") paths.push(event.path);
    if (Array.isArray(event?.paths)) {
      for (const p of event.paths) {
        if (typeof p === "string") paths.push(p);
      }
    }
    const metadata = {};
    if (typeof event?.query === "string") metadata.query = event.query;
    if (Array.isArray(event?.tags)) metadata.tags = event.tags;
    this.recordActivity({
      type: opType,
      summary: summary.slice(0, 500),
      relatedPaths: paths,
      importanceLevel: typeof event?.importanceLevel === "number" ? clampImportance(event.importanceLevel) : 0,
      metadata: Object.keys(metadata).length > 0 ? metadata : void 0,
      relatedKind: typeof event?.relatedKind === "string" ? event.relatedKind : null,
      relatedId: typeof event?.relatedId === "string" ? event.relatedId : null
    }).catch((err) => console.warn("[SessionContextService] recordActivity error", err));
  }
  handleFileOpen(file) {
    if (!file) return;
    this.context.activeFile = { path: file.path, title: file.basename ?? file.path, openedAt: Date.now() };
    const meta2 = { path: file.path };
    const cache = this.app.metadataCache?.getFileCache(file);
    if (cache?.frontmatter?.tags) {
      meta2.tags = Array.isArray(cache.frontmatter.tags) ? cache.frontmatter.tags : [cache.frontmatter.tags];
    }
    this.recordActivity({
      type: "file_open",
      summary: `Opened ${file.basename ?? file.path}`,
      relatedPaths: [file.path],
      importanceLevel: 0,
      metadata: meta2
    }).catch((err) => console.warn("[SessionContextService] file-open recordActivity error", err));
  }
  assignContinuousGroup(opType, now) {
    const prev = this.lastOpByType.get(opType);
    let groupId = null;
    if (prev && now - prev.ts <= CONTINUOUS_GROUP_THRESHOLD_MS) {
      groupId = prev.groupId;
    }
    this.lastOpByType.set(opType, { ts: now, groupId: groupId ?? generateUuidWithoutHyphens() });
    return groupId;
  }
  appendActivity(entry) {
    this.context.recentActivities.unshift(entry);
    if (this.context.recentActivities.length > MAX_ACTIVITIES) {
      this.context.recentActivities.length = MAX_ACTIVITIES;
    }
    this.context.workingTheme.ruleBased = _SessionContextService.computeRuleBasedTheme(
      this.context.recentActivities
    );
    this.context.updatedAt = Date.now();
    this.themeInferrer.onActivity();
  }
};
function topN(counts, n) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key]) => key);
}
function clampImportance(value) {
  if (value == null) return 0;
  if (value <= 0) return 0;
  if (value >= 2) return 2;
  return value;
}
function capitalizeFirst(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function mergeMeta(rows) {
  const merged = {};
  let hasAny = false;
  for (const row of rows) {
    const m = safeParseMeta(row.meta_json);
    if (m) {
      Object.assign(merged, m);
      hasAny = true;
    }
  }
  return hasAny ? merged : void 0;
}

// src/service/context/context-tools/getActivityDetailTool.ts
function getActivityDetailTool() {
  return safeAgentTool({
    description: 'Get full details for a specific recent activity using its index ID (e.g. "A1" for the first activity). Returns timestamp, type, summary, related file paths, importance level, and metadata.',
    inputSchema: getActivityDetailInputSchema,
    execute: async (input) => {
      const { activityId } = input;
      const match = /^A(\d+)$/i.exec(activityId.trim());
      if (!match) {
        return { error: `Invalid activityId format "${activityId}". Expected format: "A1", "A2", etc.` };
      }
      const index = parseInt(match[1], 10) - 1;
      if (index < 0) {
        return { error: `Activity index must be >= 1 (got "${activityId}").` };
      }
      const ctx = SessionContextService.getInstance().getWorkingContext();
      const activities = ctx.recentActivities;
      if (index >= activities.length) {
        return {
          error: `Activity "${activityId}" not found. There are only ${activities.length} recent activities.`,
          totalActivities: activities.length
        };
      }
      const activity = activities[index];
      return {
        id: activity.id,
        indexId: activityId.toUpperCase(),
        type: activity.type,
        timestamp: activity.timestamp,
        timestampIso: new Date(activity.timestamp).toISOString(),
        summary: activity.summary,
        relatedPaths: activity.relatedPaths,
        importanceLevel: activity.importanceLevel,
        metadata: activity.metadata ?? null
      };
    }
  });
}

// src/service/context/context-tools/getRecentAnalysisResultTool.ts
function getRecentAnalysisResultTool() {
  return safeAgentTool({
    description: "Retrieve recent AI analysis results from the analysis history. Optionally filter by a search query matched against the analysis query/title. Returns analysis summaries including title, query, preset, and creation time.",
    inputSchema: getRecentAnalysisResultInputSchema,
    execute: async (input) => {
      const { query: query2, limit } = input;
      const service = AppContext.getAIAnalysisHistoryService();
      const fetchLimit = Math.max(limit * 5, 20);
      const records = await service.list({ limit: fetchLimit, offset: 0 });
      if (records.length === 0) {
        return { analyses: [], total: 0, message: "No analysis history found." };
      }
      let filtered = records;
      if (query2?.trim()) {
        const keywords = query2.toLowerCase().split(/\s+/).filter(Boolean);
        filtered = records.filter((r) => {
          const searchText = `${r.query ?? ""} ${r.title ?? ""}`.toLowerCase();
          return keywords.some((kw) => searchText.includes(kw));
        });
      }
      const results = filtered.slice(0, limit).map((r) => ({
        id: r.id,
        title: r.title ?? null,
        query: r.query ?? null,
        analysisPreset: r.analysis_preset ?? null,
        vaultRelPath: r.vault_rel_path ?? null,
        createdAt: r.created_at_ts,
        createdAtIso: new Date(r.created_at_ts).toISOString()
      }));
      return {
        analyses: results,
        total: filtered.length,
        returned: results.length
      };
    }
  });
}

// src/service/context/context-tools/getWorkingThemeTool.ts
function getWorkingThemeTool() {
  return safeAgentTool({
    description: "Get the current working theme derived from recent session activity. Returns the active file, rule-based theme summary (top folders, tags, search keywords), LLM-inferred theme if available, and the top 5 most recent activities.",
    inputSchema: getWorkingThemeInputSchema,
    execute: async () => {
      const ctx = SessionContextService.getInstance().getWorkingContext();
      const topActivities = ctx.recentActivities.slice(0, 5).map((act, i) => ({
        indexId: `A${i + 1}`,
        type: act.type,
        summary: act.summary,
        relatedPaths: act.relatedPaths,
        importanceLevel: act.importanceLevel,
        timestampIso: new Date(act.timestamp).toISOString()
      }));
      return {
        activeFile: ctx.activeFile ? {
          path: ctx.activeFile.path,
          title: ctx.activeFile.title,
          openedAtIso: new Date(ctx.activeFile.openedAt).toISOString()
        } : null,
        workingTheme: {
          ruleBased: ctx.workingTheme.ruleBased,
          llmInferred: ctx.workingTheme.llmInferred
        },
        topActivities,
        totalActivities: ctx.recentActivities.length,
        updatedAtIso: new Date(ctx.updatedAt).toISOString()
      };
    }
  });
}

// src/service/agents/vault-sdk/vaultMcpServer.ts
async function listFoldersImpl(vault, params) {
  const maxDepth = Math.max(1, Math.min(params.maxDepth ?? 2, 5));
  const files = vault.getMarkdownFiles();
  const folderCounts = /* @__PURE__ */ new Map();
  for (const file of files) {
    const parts = file.path.split("/");
    const folderDepth = parts.length - 1;
    const limit = Math.min(folderDepth, maxDepth);
    for (let d = 1; d <= limit; d++) {
      const folderPath = parts.slice(0, d).join("/");
      folderCounts.set(folderPath, (folderCounts.get(folderPath) ?? 0) + 1);
    }
  }
  const folders = Array.from(folderCounts.entries()).map(([path4, mdCount]) => ({ path: path4, mdCount })).sort((a, b) => b.mdCount - a.mdCount);
  return {
    folders,
    totalMdFiles: files.length
  };
}
async function readFolderImpl(vault, params) {
  const folder = params.folder.replace(/\/+$/, "");
  const recursive = params.recursive ?? true;
  const allFiles = vault.getMarkdownFiles();
  const matches = allFiles.filter((f) => {
    if (!f.path.startsWith(folder + "/") && f.path !== folder) return false;
    if (recursive) return true;
    const rest = f.path.slice(folder.length + 1);
    return !rest.includes("/");
  });
  return {
    folder,
    files: matches.map((f) => ({
      path: f.path,
      basename: f.basename
    })),
    totalCount: matches.length
  };
}
async function readNoteImpl(vault, metadataCache, params) {
  const maxChars = params.maxChars ?? 3e3;
  const file = vault.getAbstractFileByPath(params.path);
  if (!file || !("extension" in file)) {
    return {
      path: params.path,
      frontmatter: {},
      bodyPreview: "",
      wikilinks: [],
      tags: [],
      error: "not found"
    };
  }
  const content = await vault.cachedRead(file);
  const body = content.replace(/^---[\s\S]*?---\n?/, "").trim();
  const bodyPreview = body.slice(0, maxChars);
  const cache = metadataCache.getFileCache(file);
  const frontmatter = cache?.frontmatter ?? {};
  const wikilinks = (cache?.links ?? []).map((l) => l.link);
  const tags = (cache?.tags ?? []).map((t) => t.tag);
  return {
    path: params.path,
    frontmatter,
    bodyPreview,
    wikilinks,
    tags
  };
}
async function wikilinkExpandImpl(vault, metadataCache, params) {
  const maxSteps = Math.max(1, Math.min(params.maxSteps ?? 2, 4));
  const visited = /* @__PURE__ */ new Set();
  const queue = [{ path: params.startPath, depth: 0 }];
  while (queue.length > 0) {
    const { path: path4, depth } = queue.shift();
    if (visited.has(path4)) continue;
    visited.add(path4);
    if (depth >= maxSteps) continue;
    const file = vault.getAbstractFileByPath(path4);
    if (!file) continue;
    const cache = metadataCache.getFileCache(file);
    if (!cache?.links) continue;
    for (const linkRef of cache.links) {
      const dest = metadataCache.getFirstLinkpathDest(linkRef.link, path4);
      if (dest && !visited.has(dest.path)) {
        queue.push({ path: dest.path, depth: depth + 1 });
      }
    }
  }
  return {
    startPath: params.startPath,
    visited: Array.from(visited)
  };
}
async function grepImpl(searchFn, params) {
  const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
  const hits = await searchFn(params.query, limit);
  return { query: params.query, hits };
}
function buildVaultMcpServer(deps) {
  const { app, searchFn, onSubmitPlan } = deps;
  const listFolders = (0, import_claude_agent_sdk3.tool)(
    "vault_list_folders",
    `List top-level folders in the vault with markdown file counts. CALL THIS FIRST for reflective queries like "my X" or "all Y". The result shows you the user's folder taxonomy so you can decide which folders to enumerate.`,
    {
      maxDepth: import_zod.z.number().min(1).max(5).default(2)
    },
    async (input, _extra) => {
      const result = await listFoldersImpl(app.vault, {
        maxDepth: input.maxDepth
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  );
  const readFolder = (0, import_claude_agent_sdk3.tool)(
    "vault_read_folder",
    "List all markdown files in a specific folder. Use after vault_list_folders has told you which folder to dive into. Recursive by default.",
    {
      folder: import_zod.z.string(),
      recursive: import_zod.z.boolean().default(true)
    },
    async (input, _extra) => {
      const result = await readFolderImpl(app.vault, {
        folder: input.folder,
        recursive: input.recursive
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  );
  const readNote = (0, import_claude_agent_sdk3.tool)(
    "vault_read_note",
    "Read a single note: frontmatter, wikilinks, tags, and body preview (first N chars). Use after vault_read_folder gives you candidate paths.",
    {
      path: import_zod.z.string(),
      maxChars: import_zod.z.number().min(100).max(2e4).default(3e3)
    },
    async (input, _extra) => {
      const result = await readNoteImpl(
        app.vault,
        app.metadataCache,
        { path: input.path, maxChars: input.maxChars }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  );
  const grep = (0, import_claude_agent_sdk3.tool)(
    "vault_grep",
    'Full-text keyword search across the vault (FTS + vector hybrid). Use for specific-concept queries ("what did I write about X"). Do NOT use this as the first tool for reflective queries \u2014 it collapses on homogeneous folders.',
    {
      query: import_zod.z.string(),
      limit: import_zod.z.number().min(1).max(50).default(20)
    },
    async (input, _extra) => {
      const result = await grepImpl(searchFn, {
        query: input.query,
        limit: input.limit
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  );
  const wikilinkExpand = (0, import_claude_agent_sdk3.tool)(
    "vault_wikilink_expand",
    "Follow wikilinks N hops from a starting note. Use to find notes connected by the user's explicit semantic edges (more reliable than vector similarity on personal vaults).",
    {
      startPath: import_zod.z.string(),
      maxSteps: import_zod.z.number().min(1).max(4).default(2)
    },
    async (input, _extra) => {
      const result = await wikilinkExpandImpl(
        app.vault,
        app.metadataCache,
        { startPath: input.startPath, maxSteps: input.maxSteps }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  );
  const submitPlan = (0, import_claude_agent_sdk3.tool)(
    "vault_submit_plan",
    "Call this when you have gathered enough evidence to propose a plan for the final report. The user will review and either approve or request adjustments. selected_paths must contain all vault paths you want cited in the final report.",
    {
      selected_paths: import_zod.z.array(import_zod.z.string()),
      rationale: import_zod.z.string(),
      proposed_outline: import_zod.z.string(),
      coverage_assessment: import_zod.z.string(),
      follow_up_questions: import_zod.z.array(import_zod.z.string()).min(3).max(5).describe("REQUIRED: 3-5 context-specific follow-up questions the user might ask next. Always generate these."),
      plan_sections: import_zod.z.array(import_zod.z.object({
        id: import_zod.z.string(),
        title: import_zod.z.string().describe('Conclusion-as-heading: a short finding sentence, max 50 chars. E.g. "3 projects viable, PeakAssistant fastest to revenue"'),
        content_type: import_zod.z.enum(["enumeration", "comparison", "analysis", "recommendation", "timeline"]),
        visual_type: import_zod.z.enum(["table", "quadrantChart", "flowchart", "timeline", "mindmap", "none"]),
        evidence_paths: import_zod.z.array(import_zod.z.string()).describe("Vault paths relevant to this section"),
        brief: import_zod.z.string().describe("1-2 sentence description of section content"),
        weight: import_zod.z.number().min(0).max(10).describe("Display weight: 1-3=small, 4-6=medium, 7-10=full-width"),
        mission_role: import_zod.z.enum([
          "synthesis",
          "contradictions",
          "trade_off",
          "action_plan",
          "risk_audit",
          "roadmap",
          "decomposition",
          "blindspots",
          "probing_horizon"
        ]).describe("Block mission role from McKinsey report framework")
      })).optional().describe("Structured report plan: 3-6 sections with content types and visual prescriptions")
    },
    async (input, _extra) => {
      const feedback = await onSubmitPlan({
        selected_paths: input.selected_paths,
        rationale: input.rationale,
        proposed_outline: input.proposed_outline,
        coverage_assessment: input.coverage_assessment,
        follow_up_questions: input.follow_up_questions,
        plan_sections: input.plan_sections
      });
      return {
        content: [{ type: "text", text: JSON.stringify(feedback, null, 2) }]
      };
    }
  );
  function wrapAgentTool(agentToolFactory, name) {
    const at = agentToolFactory();
    const shape = at.inputSchema.shape ?? {};
    return (0, import_claude_agent_sdk3.tool)(
      name,
      at.description,
      shape,
      async (input, _extra) => {
        const result = await at.execute(input);
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return { content: [{ type: "text", text }] };
      }
    );
  }
  const getActivityDetail = wrapAgentTool(getActivityDetailTool, "get_activity_detail");
  const getRecentAnalysis = wrapAgentTool(getRecentAnalysisResultTool, "get_recent_analysis");
  const getWorkingTheme = wrapAgentTool(getWorkingThemeTool, "get_working_theme");
  return (0, import_claude_agent_sdk3.createSdkMcpServer)({
    name: "vault",
    version: "1.0.0",
    tools: [
      listFolders,
      readFolder,
      readNote,
      grep,
      wikilinkExpand,
      submitPlan,
      getActivityDetail,
      getRecentAnalysis,
      getWorkingTheme
    ]
  });
}

// src/service/agents/vault-sdk/webSearchTool.ts
var import_claude_agent_sdk4 = require("@anthropic-ai/claude-agent-sdk");
var import_zod2 = require("zod");
var WEB_SEARCH_SYSTEM_PROMPT = "Search the web and provide a comprehensive answer with sources. Cite URLs where possible. Focus on factual, up-to-date information. If the query is about a specific topic, provide relevant context and details.";
function buildWebSearchMcpServer(deps) {
  const { app, pluginId } = deps;
  const webSearch = (0, import_claude_agent_sdk4.tool)(
    "web_search",
    "Search the web for up-to-date information, external knowledge, or facts not found in the vault. Use when the user asks about recent events, external products, public data, or anything beyond their personal notes.",
    {
      query: import_zod2.z.string().describe("The search query to look up on the web")
    },
    async (input) => {
      const profile = ProfileRegistry.getInstance().getActiveWebSearchProfile();
      if (!profile) {
        return {
          content: [{ type: "text", text: "Web search is not configured. Please set a Web Search profile in Settings \u2192 Profiles." }]
        };
      }
      try {
        const messages = queryWithProfile(app, pluginId, profile, {
          prompt: input.query,
          systemPrompt: WEB_SEARCH_SYSTEM_PROMPT,
          maxTurns: 1
        });
        const text = await collectText(messages);
        return {
          content: [{ type: "text", text: text || "No results found." }]
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Web search failed";
        return {
          content: [{ type: "text", text: `Web search error: ${msg}` }]
        };
      }
    }
  );
  return (0, import_claude_agent_sdk4.createSdkMcpServer)({
    tools: [webSearch]
  });
}

// src/service/agents/VaultSearchAgentSDK.ts
var VaultSearchAgentSDK = class {
  constructor(options) {
    this.options = options;
  }
  /**
   * One-time setup: install renderer compat patches and probe for node
   * binary. Non-blocking on failure — startSession retries lazily.
   */
  async warmup() {
    try {
      await warmupPool();
    } catch (err) {
      console.error("[VaultSearchAgentSDK] warmup failed", err);
    }
  }
  /**
   * Start a vault search session. Yields LLMStreamEvents compatible with
   * the existing UI routing layer. Terminates when the SDK streams its
   * result message (which happens after the LLM calls submit_plan).
   *
   * HITL (v1): the submit_plan tool callback auto-approves. A later task
   * will wire this to the existing HITL modal.
   */
  async *startSession(userQuery, options) {
    const { app, pluginId, searchClient, aiServiceManager } = this.options;
    const triggerName = "search-ai-agent" /* SEARCH_AI_AGENT */;
    const startTs = Date.now();
    try {
      await warmupPool();
    } catch (err) {
      yield {
        type: "error",
        error: err,
        triggerName
      };
      return;
    }
    const profile = ProfileRegistry.getInstance().getActiveAgentProfile();
    if (!profile) {
      throw new Error("No active profile configured. Please set up a profile in Settings \u2192 Profiles.");
    }
    const [folderIntuitions, globalIntuitionJson, probeHits] = await Promise.all([
      (async () => {
        try {
          if (!sqliteStoreManager.isInitialized()) return [];
          return await sqliteStoreManager.getMobiusNodeRepo("vault").listTopFoldersForSearchOrient(30);
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          if (!sqliteStoreManager.isInitialized()) return void 0;
          return await sqliteStoreManager.getIndexStateRepo().get("knowledge_intuition_json") ?? void 0;
        } catch {
          return void 0;
        }
      })(),
      (async () => {
        try {
          const res = await searchClient.search({
            text: userQuery,
            topK: 15,
            searchMode: "hybrid",
            scopeMode: "vault",
            indexTenant: "vault"
          });
          return (res.items ?? []).map((i) => ({
            path: i.path,
            title: i.title ?? i.path.split("/").pop() ?? "",
            score: i.score ?? 0
          }));
        } catch {
          return [];
        }
      })()
    ]);
    let vaultIntuitionSection = "";
    if (folderIntuitions.length > 0) {
      const folderLines = folderIntuitions.slice(0, 20).map(
        (f) => `- **${f.folderPath}** (${f.docCount} docs): ${f.oneLiner}${f.topTags?.length ? `
  Tags: ${f.topTags.join(", ")}` : ""}`
      ).join("\n");
      vaultIntuitionSection += `### Vault Structure
${folderLines}

`;
    }
    if (globalIntuitionJson) {
      const truncated = globalIntuitionJson.length > 3e3 ? globalIntuitionJson.slice(0, 3e3) + "\n_(truncated)_" : globalIntuitionJson;
      vaultIntuitionSection += `### Vault Understanding
${truncated}
`;
    }
    let probeResultsSection = "";
    if (probeHits.length > 0) {
      const hitLines = probeHits.map(
        (h) => `- [[${h.title}]] (${h.path}) \u2014 score: ${h.score.toFixed(3)}`
      ).join("\n");
      probeResultsSection = `### Relevant Files Found (pre-search)
${hitLines}
`;
    }
    let systemPrompt;
    if (this.options.systemPromptOverride) {
      const probeContext = [vaultIntuitionSection, probeResultsSection].filter(Boolean).join("\n\n");
      systemPrompt = probeContext ? this.options.systemPromptOverride + "\n\n" + probeContext : this.options.systemPromptOverride;
    } else {
      try {
        systemPrompt = await aiServiceManager.renderPrompt(
          "ai-analysis-vault-sdk-playbook" /* VaultSdkPlaybook */,
          {
            vaultIntuition: vaultIntuitionSection,
            probeResults: probeResultsSection,
            webEnabled: options?.webEnabled ? "true" : ""
          }
        );
      } catch (err) {
        console.error("[VaultSearchAgentSDK] failed to load playbook prompt", err);
        yield {
          type: "error",
          error: err,
          triggerName
        };
        return;
      }
    }
    const searchFn = async (q, limit) => {
      const res = await searchClient.search({
        text: q,
        topK: limit,
        searchMode: "hybrid",
        scopeMode: "vault",
        indexTenant: "vault"
      });
      const items = res.items ?? [];
      return items.map((i) => ({
        path: i.path,
        snippet: i.title ?? i.path,
        score: i.score ?? 0
      }));
    };
    const pendingSubmits = [];
    let planSubmitted = false;
    let sdkUsage = null;
    const onSubmitPlan = async (plan) => {
      pendingSubmits.push(plan);
      planSubmitted = true;
      return {
        approved: true,
        adjustedPaths: plan.selected_paths,
        adjustedOutline: plan.proposed_outline
      };
    };
    const vaultMcpServer = buildVaultMcpServer({
      app,
      searchFn,
      onSubmitPlan
    });
    const webEnabled = options?.webEnabled && ProfileRegistry.getInstance().getActiveWebSearchProfile() !== null;
    const webMcpServer = webEnabled ? buildWebSearchMcpServer({ app, pluginId }) : null;
    yield {
      type: "pk-debug",
      debugName: "vault-sdk-starting",
      triggerName,
      extra: {
        query: userQuery,
        profile: profile.kind,
        model: profile.primaryModel
      }
    };
    const effectivePrompt = this.options.contextPrefix ? `${this.options.contextPrefix}

${userQuery}` : userQuery;
    let roundIndex = 0;
    try {
      const allowedTools = [
        "mcp__vault__vault_list_folders",
        "mcp__vault__vault_read_folder",
        "mcp__vault__vault_read_note",
        "mcp__vault__vault_grep",
        "mcp__vault__vault_wikilink_expand",
        "mcp__vault__vault_submit_plan"
      ];
      const mcpServers = { vault: vaultMcpServer };
      if (webMcpServer) {
        allowedTools.push("mcp__web__web_search");
        mcpServers.web = webMcpServer;
      }
      const messages = queryWithProfile(app, pluginId, profile, {
        prompt: effectivePrompt,
        systemPrompt,
        maxTurns: 20,
        allowedTools,
        disallowedTools: [
          "AskUserQuestion"
        ],
        mcpServers,
        signal: options?.signal
      });
      for await (const raw of messages) {
        const msg = raw;
        if (msg.type === "assistant") {
          roundIndex += 1;
          try {
            console.group(`[VaultSearchAgentSDK] round ${roundIndex}`);
          } catch {
          }
        }
        if (msg.type === "user") {
          try {
            console.groupEnd();
          } catch {
          }
        }
        const events = translateSdkMessage(raw, { triggerName, hasPartialMessages: true });
        for (const ev of events) {
          yield ev;
        }
        if (planSubmitted) {
          if (msg.type === "result") {
            const resultMsg = raw;
            if (resultMsg.usage) {
              sdkUsage = {
                inputTokens: resultMsg.usage.input_tokens ?? 0,
                outputTokens: resultMsg.usage.output_tokens ?? 0,
                totalTokens: (resultMsg.usage.input_tokens ?? 0) + (resultMsg.usage.output_tokens ?? 0)
              };
            }
            break;
          }
          continue;
        }
      }
    } catch (err) {
      const errMsg = err?.message ?? "";
      if (errMsg.toLowerCase().includes("maximum number of turns")) {
        console.warn("[VaultSearchAgentSDK] max turns reached, emitting partial results");
        yield {
          type: "complete",
          finishReason: "stop",
          triggerName
        };
        return;
      }
      console.error("[VaultSearchAgentSDK] query error", err);
      yield {
        type: "error",
        error: err,
        triggerName
      };
      return;
    } finally {
      if (roundIndex > 0) {
        try {
          console.groupEnd();
        } catch {
        }
      }
    }
    const totalDuration = Date.now() - startTs;
    yield {
      type: "complete",
      triggerName,
      durationMs: totalDuration,
      usage: sdkUsage ?? void 0,
      result: void 0
    };
    yield {
      type: "pk-debug",
      debugName: "vault-sdk-complete",
      triggerName,
      extra: {
        submittedPlans: pendingSubmits.length,
        totalPaths: pendingSubmits.flatMap((p) => p.selected_paths).length
      }
    };
  }
};

// src/service/agents/VaultSearchAgent.ts
var VaultSearchAgent = class {
  constructor(aiServiceManager) {
    this.aiServiceManager = aiServiceManager;
  }
  /**
   * Start a new vault search session.
   * Always delegates to VaultSearchAgentSDK (Claude Agent SDK).
   */
  async *startSession(userQuery) {
    const ctx = AppContext.getInstance();
    const v2 = new VaultSearchAgentSDK({
      app: ctx.app,
      pluginId: ctx.plugin.manifest.id,
      searchClient: ctx.searchClient,
      aiServiceManager: this.aiServiceManager
    });
    v2.warmup().catch(() => void 0);
    for await (const ev of v2.startSession(userQuery)) {
      yield ev;
    }
  }
};

// src/service/tools/search-graph-inspector/build-sources-graph.ts
var CACHE_MAX_ENTRIES = 5;
var sourcesGraphCache = /* @__PURE__ */ new Map();
function normPath(p) {
  return normalizeFilePath(String(p ?? "").trim()).toLowerCase();
}
function getSourcesCacheKey(sources) {
  const paths = /* @__PURE__ */ new Set();
  for (const s of sources) {
    const raw = (s.path ?? s.source ?? "").trim();
    if (raw) paths.add(normalizeFilePath(raw).toLowerCase());
  }
  return [...paths].sort().join("|");
}
async function buildSourcesGraphWithDiscoveredEdges(sources) {
  if (!sources.length) return null;
  const cacheKey = getSourcesCacheKey(sources);
  const cached = sourcesGraphCache.get(cacheKey);
  if (cached) return cached;
  const pathToDisplayId = /* @__PURE__ */ new Map();
  const pathToSource = /* @__PURE__ */ new Map();
  for (const s of sources) {
    const path4 = s.path ?? s.source ?? "";
    if (!path4) continue;
    const n = normPath(path4);
    const displayId = s.id ?? `file:${path4}`.replace(/[_\s]+/g, "-");
    pathToDisplayId.set(n, displayId);
    pathToSource.set(n, s);
  }
  const pathSet = /* @__PURE__ */ new Set();
  for (const s of sources) {
    const raw = (s.path ?? s.source ?? "").trim();
    if (!raw) continue;
    pathSet.add(normalizeFilePath(raw));
  }
  const uniquePaths = [...pathSet];
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo();
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
  const pathToIndexedDoc = await indexedDocumentRepo.getByPaths(uniquePaths);
  const pathToDocId = /* @__PURE__ */ new Map();
  const docIdToDisplayId = /* @__PURE__ */ new Map();
  for (const [path4, meta2] of pathToIndexedDoc) {
    if (!meta2?.id) continue;
    const n = normPath(path4);
    const displayId = pathToDisplayId.get(n);
    if (displayId) {
      pathToDocId.set(n, meta2.id);
      docIdToDisplayId.set(meta2.id, displayId);
    }
  }
  const sourceDocIds = new Set(docIdToDisplayId.keys());
  const nodes = sources.map((s) => {
    const path4 = s.path ?? s.source ?? "";
    const id = s.id ?? `file:${path4}`.replace(/[_\s]+/g, "-");
    const label = s.title ?? path4?.split("/").pop?.()?.replace(/\.(md|markdown)$/i, "") ?? id;
    return { id, label, type: "file", attributes: path4 ? { path: path4 } : {} };
  });
  const seenEdges = /* @__PURE__ */ new Set();
  const edges = [];
  const EDGE_LIMIT = 30;
  for (const docId of sourceDocIds) {
    const fromDisplayId = docIdToDisplayId.get(docId);
    if (!fromDisplayId) continue;
    const physicalEdges = await mobiusEdgeRepo.getAllEdgesForNode(docId, EDGE_LIMIT);
    const neighborIds = /* @__PURE__ */ new Set();
    for (const e of physicalEdges) {
      const neighborId = e.from_node_id === docId ? e.to_node_id : e.from_node_id;
      neighborIds.add(neighborId);
    }
    if (neighborIds.size < 5) {
      const physicalPlusExcluded = new Set(neighborIds);
      physicalPlusExcluded.add(docId);
      const semantic = await getSemanticNeighbors(docId, 10, physicalPlusExcluded);
      for (const n of semantic) {
        if (sourceDocIds.has(n.id)) neighborIds.add(n.id);
      }
    }
    const neighborNodes = neighborIds.size > 0 ? await mobiusNodeRepo.getByIds([...neighborIds]) : /* @__PURE__ */ new Map();
    for (const [, node] of neighborNodes) {
      if (node.type !== "document") continue;
      const neighborPath = getPathFromNode(node);
      if (!neighborPath) continue;
      const n = normPath(neighborPath);
      if (!pathToDisplayId.has(n)) continue;
      const toDisplayId = pathToDisplayId.get(n);
      if (fromDisplayId === toDisplayId) continue;
      const key = fromDisplayId < toDisplayId ? `${fromDisplayId}|${toDisplayId}` : `${toDisplayId}|${fromDisplayId}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({
        id: `e-${fromDisplayId}-${toDisplayId}`,
        from_node_id: fromDisplayId,
        to_node_id: toDisplayId,
        kind: "link"
      });
    }
  }
  const result = { nodes, edges };
  if (sourcesGraphCache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = sourcesGraphCache.keys().next().value;
    if (firstKey != null) sourcesGraphCache.delete(firstKey);
  }
  sourcesGraphCache.set(cacheKey, result);
  return result;
}

// src/service/agents/ai-graph/infer-cross-domain.ts
function enrichWithCrossDomain(data) {
  const getTopFolder = (path4) => {
    const parts = path4.split("/");
    return parts.length > 1 ? parts[0] : "/";
  };
  const nodeGroups = /* @__PURE__ */ new Map();
  const enrichedNodes = data.nodes.map((n) => {
    const group = getTopFolder(n.path);
    nodeGroups.set(n.path, group);
    return { ...n, group };
  });
  const enrichedEdges = data.edges.map((e) => {
    const srcGroup = nodeGroups.get(e.source);
    const tgtGroup = nodeGroups.get(e.target);
    if (srcGroup && tgtGroup && srcGroup !== tgtGroup) {
      return { ...e, kind: "cross-domain" };
    }
    return e;
  });
  const nodeGroupConnections = /* @__PURE__ */ new Map();
  for (const e of enrichedEdges) {
    const srcGroup = nodeGroups.get(e.source);
    const tgtGroup = nodeGroups.get(e.target);
    if (!nodeGroupConnections.has(e.source)) nodeGroupConnections.set(e.source, /* @__PURE__ */ new Set());
    if (!nodeGroupConnections.has(e.target)) nodeGroupConnections.set(e.target, /* @__PURE__ */ new Set());
    if (srcGroup) nodeGroupConnections.get(e.source).add(srcGroup);
    if (tgtGroup) nodeGroupConnections.get(e.source).add(tgtGroup);
    if (srcGroup) nodeGroupConnections.get(e.target).add(srcGroup);
    if (tgtGroup) nodeGroupConnections.get(e.target).add(tgtGroup);
  }
  const finalNodes = enrichedNodes.map((n) => {
    const groups = nodeGroupConnections.get(n.path);
    if (groups && groups.size >= 2 && n.role !== "root" && n.role !== "hub") {
      return { ...n, role: "bridge" };
    }
    return n;
  });
  const availableLenses = [.../* @__PURE__ */ new Set([...data.availableLenses, "bridge"])];
  return { nodes: finalNodes, edges: enrichedEdges, availableLenses };
}

// src/service/agents/ai-graph/infer-thinking-tree.ts
var SYSTEM_PROMPT = `You analyze document relationships and infer a thinking tree structure.
Given a set of documents with their titles and first few lines, determine:
1. Which document is the root (the starting point / index / overview)
2. Parent-child relationships (which doc elaborates on which)
3. The depth level of each document (0 = root)
4. Each document's role: root, hub (connects many children), bridge (connects different topics), leaf (endpoint)

Output JSON only, no explanation.`;
var USER_PROMPT_TEMPLATE = `Analyze these documents and infer their hierarchical thinking tree:

{{FILES}}

Output format:
{
  "nodes": [
    { "path": "...", "label": "short title", "parentPath": null, "level": 0, "role": "root", "summary": "one line summary" }
  ]
}`;
async function inferThinkingTree(input) {
  const filesText = input.files.map((f) => `### ${f.path}
Title: ${f.title}
${f.firstLines}`).join("\n\n");
  const prompt = USER_PROMPT_TEMPLATE.replace("{{FILES}}", filesText);
  const manager = AppContext.getInstance().manager;
  const text = await manager.queryText(prompt, void 0, {
    systemPrompt: SYSTEM_PROMPT
  });
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { nodes: [] };
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { nodes: [] };
  }
}

// src/service/agents/ai-graph/build-graph-data.ts
async function buildLensGraphFromSources(sources) {
  const sg = await buildSourcesGraphWithDiscoveredEdges(sources);
  if (!sg) {
    return { nodes: [], edges: [], availableLenses: [] };
  }
  const baseNodes = sg.nodes.map((n) => ({
    label: n.label,
    path: n.attributes?.path ?? n.id,
    role: "leaf",
    group: (n.attributes?.path ?? n.id).split("/").slice(0, -1).join("/")
  }));
  const edges = sg.edges.map((e) => ({
    source: e.from_node_id,
    target: e.to_node_id,
    kind: e.kind === "semantic" ? "semantic" : "link"
  }));
  const ctx = AppContext.getInstance();
  const app = ctx.app;
  const nodesWithTime = await Promise.all(baseNodes.map(async (n) => {
    const file = app.vault.getAbstractFileByPath(n.path);
    if (file && "stat" in file) {
      const stat = file.stat;
      return { ...n, createdAt: stat.ctime, modifiedAt: stat.mtime };
    }
    return n;
  }));
  const hasTimestamps = nodesWithTime.some((n) => n.createdAt !== void 0);
  const availableLenses = hasTimestamps ? ["topology", "timeline"] : ["topology"];
  const baseGraph = { nodes: nodesWithTime, edges, availableLenses };
  return enrichWithCrossDomain(baseGraph);
}
async function enrichWithThinkingTree(currentData) {
  const ctx = AppContext.getInstance();
  const app = ctx.app;
  const files = await Promise.all(
    currentData.nodes.map(async (n) => {
      const file = app.vault.getAbstractFileByPath(n.path);
      if (!file || !("extension" in file)) return { path: n.path, title: n.label, firstLines: "" };
      const content = await app.vault.cachedRead(file);
      return { path: n.path, title: n.label, firstLines: content.slice(0, 500) };
    })
  );
  const tree = await inferThinkingTree({ files });
  if (tree.nodes.length === 0) return currentData;
  const treeMap = new Map(tree.nodes.map((n) => [n.path, n]));
  const enrichedNodes = currentData.nodes.map((n) => {
    const t = treeMap.get(n.path);
    if (!t) return n;
    return {
      ...n,
      label: t.label || n.label,
      level: t.level,
      parentId: t.parentPath ?? void 0,
      role: t.role,
      summary: t.summary
    };
  });
  const derivesEdges = tree.nodes.filter((n) => n.parentPath).map((n) => ({ source: n.parentPath, target: n.path, kind: "derives" }));
  const allEdges = [...currentData.edges, ...derivesEdges];
  const availableLenses = [
    .../* @__PURE__ */ new Set([...currentData.availableLenses, "thinking-tree"])
  ];
  return { nodes: enrichedNodes, edges: allEdges, availableLenses };
}

// src/service/agents/AIGraphAgent.ts
var AIGraphAgent = class {
  constructor(aiServiceManager) {
    this.aiServiceManager = aiServiceManager;
  }
  /**
   * Search the vault for the given query and build a topology graph from results.
   */
  async *startSession(userQuery) {
    const ctx = AppContext.getInstance();
    yield { type: "ui-signal", channel: "search-stage", data: { stage: "searching" } };
    const searchClient = ctx.searchClient;
    const results = await searchClient.search(
      { text: userQuery, scopeMode: "vault", topK: 30, searchMode: "hybrid" },
      false
    );
    yield { type: "ui-signal", channel: "search-stage", data: { stage: "building-graph" } };
    const graphData = await buildLensGraphFromSources(results.items);
    yield {
      type: "ui-signal",
      channel: "ai-graph-data",
      data: { graphData }
    };
    yield { type: "complete", result: { summary: `Built graph with ${graphData.nodes.length} nodes` } };
  }
  /**
   * Build a graph from explicit file paths (no search step).
   */
  async *startFromPaths(paths) {
    yield { type: "ui-signal", channel: "search-stage", data: { stage: "building-graph" } };
    const sources = paths.map((p) => ({
      id: p,
      type: "markdown",
      title: p.split("/").pop() ?? p,
      path: p,
      lastModified: 0,
      score: 0,
      finalScore: 0,
      highlight: null
    }));
    const graphData = await buildLensGraphFromSources(sources);
    yield {
      type: "ui-signal",
      channel: "ai-graph-data",
      data: { graphData }
    };
    yield { type: "complete", result: { summary: `Built graph with ${graphData.nodes.length} nodes` } };
  }
  /**
   * Enrich existing graph data with an AI-inferred thinking tree layer.
   * Placeholder until Task 7 implements the actual enrichment.
   */
  async enrichThinkingTree(currentData) {
    return enrichWithThinkingTree(currentData);
  }
};

// src/service/tools/system-info.ts
function getVaultStatistics() {
  const allFiles = AppContext.getInstance().app.vault.getFiles();
  const mdCount = allFiles.filter((f) => f.extension === "md").length;
  return { markdownFiles: mdCount, otherFiles: allFiles.length - mdCount, totalFiles: allFiles.length };
}
async function getVaultDescription() {
  try {
    const content = await readFileAsText(`${getAIPromptFolder()}/${VAULT_DESCRIPTION_FILENAME}`);
    return content?.trim() || void 0;
  } catch {
    return void 0;
  }
}
async function getTagCloud() {
  try {
    const topTagStats = await sqliteStoreManager.getMobiusEdgeRepo().getTopTaggedNodes(GLOBAL_TAG_CLOUD_TOP_TAGS_COUNT);
    if (!topTagStats.length) return "";
    const tagNodesMap = await sqliteStoreManager.getMobiusNodeRepo().getByIds(topTagStats.map((s) => s.tagId));
    return topTagStats.map((s) => {
      const n = tagNodesMap.get(s.tagId);
      return n ? `#${n.label}(${s.count})` : null;
    }).filter(Boolean).join(", ");
  } catch {
    return "";
  }
}
async function getVaultPersona() {
  const [description, topTags] = await Promise.all([getVaultDescription(), getTagCloud()]);
  const stats = getVaultStatistics();
  const tm = AppContext.getInstance().manager.getTemplateManager?.();
  const structure = await exploreFolder({ folderPath: "/", recursive: true, max_depth: 2, limit: 100, response_format: "markdown" }, tm);
  return {
    description,
    domain: [],
    structure,
    topTags: topTags || "(none)",
    capabilities: `${stats.markdownFiles} markdown, ${stats.otherFiles} other files` + (stats.totalFiles < 20 ? `; small vault, consider external search` : ``)
  };
}

// src/app/context/AppContext.ts
var AppContext = class _AppContext {
  constructor(app, manager, searchClient, plugin, settings, aiAnalysisHistoryService, searchAgentFactory, isMockEnv = false) {
    this.app = app;
    this.manager = manager;
    this.searchClient = searchClient;
    this.plugin = plugin;
    this.settings = settings;
    this.aiAnalysisHistoryService = aiAnalysisHistoryService;
    this.searchAgentFactory = searchAgentFactory;
    this.isMockEnv = isMockEnv;
    this.viewManager = null;
    this.eventBus = EventBus.getInstance(app);
    _AppContext.instance = this;
    this.handleDevToolsSettingChange(this.settings.enableDevTools ?? false);
    this.unsubscribeSettingsUpdated = this.eventBus.on("peak:settings-updated" /* SETTINGS_UPDATED */, (event) => {
      const previousEnableDevTools = this.settings.enableDevTools ?? false;
      this.settings = this.plugin.settings;
      const currentEnableDevTools = this.settings.enableDevTools ?? false;
      if (previousEnableDevTools !== currentEnableDevTools) {
        this.handleDevToolsSettingChange(currentEnableDevTools);
      }
    });
  }
  static {
    this.instance = null;
  }
  static getInstance() {
    if (!_AppContext.instance) {
      throw new BusinessError(
        "CONFIGURATION_MISSING" /* CONFIGURATION_MISSING */,
        "AppContext is not initialized"
      );
    }
    return _AppContext.instance;
  }
  /** Obsidian `App` from the initialized singleton. */
  static getApp() {
    return _AppContext.getInstance().app;
  }
  static getManager() {
    return _AppContext.getInstance().manager;
  }
  static getSearchClient() {
    return _AppContext.getInstance().searchClient;
  }
  static getPlugin() {
    return _AppContext.getInstance().plugin;
  }
  static getSettings() {
    return _AppContext.getInstance().settings;
  }
  static getEventBus() {
    return _AppContext.getInstance().eventBus;
  }
  static getViewManager() {
    return _AppContext.getInstance().viewManager;
  }
  static getAIAnalysisHistoryService() {
    return _AppContext.getInstance().aiAnalysisHistoryService;
  }
  static getSessionContext() {
    return SessionContextService.getInstance();
  }
  /**
   * Clear singleton and unsubscribe from workspace events.
   * Must be called from plugin onunload to break reference chains and allow GC.
   */
  static clearForUnload() {
    if (_AppContext.instance) {
      _AppContext.instance.unsubscribeSettingsUpdated?.();
      _AppContext.instance.handleDevToolsSettingChange(false);
      _AppContext.instance = null;
    }
  }
  static searchAgent() {
    return _AppContext.getInstance().searchAgentFactory(_AppContext.getInstance().manager);
  }
  /** Create a VaultSearchAgent (routes to VaultSearchAgentSDK on desktop). */
  static vaultSearchAgent() {
    return new VaultSearchAgent(_AppContext.getInstance().manager);
  }
  /** Create an AIGraphAgent for building multi-lens knowledge graphs. */
  static aiGraphAgent() {
    return new AIGraphAgent(_AppContext.getInstance().manager);
  }
  /**
   * Handle dynamic changes to enableDevTools setting
   */
  handleDevToolsSettingChange(enabled) {
    if (enabled) {
      if (typeof window !== "undefined") {
        window.testGraphTools = new GraphInspectorTestTools();
        window.testAISearchTools = new AISearchAgentTestTools();
        window.indexDocument = (docPath) => IndexService.getInstance().indexDocument(
          docPath,
          this.settings.search,
          defaultIndexDocumentOptions("listener_fast")
        );
        window.indexDocumentFull = (docPath) => IndexService.getInstance().indexDocument(
          docPath,
          this.settings.search,
          defaultIndexDocumentOptions("manual_full")
        );
        window.runPendingLlmIndexEnrichment = () => IndexService.runPendingLlmIndexEnrichment(this.settings.search);
        window.runPendingVectorIndexEnrichment = () => IndexService.runPendingVectorIndexEnrichment(this.settings.search);
        window.getVaultPersona = () => getVaultPersona();
        window.cleanupGraphTable = () => cleanupGraphTable();
        window.dumpV2State = () => {
          try {
            const { useSearchSessionStore: useSearchSessionStore2 } = (init_searchSessionStore(), __toCommonJS(searchSessionStore_exports));
            const s = useSearchSessionStore2.getState();
            const dump = {
              status: s.status,
              query: s.query,
              v2Steps: s.v2Steps.map((st) => ({
                id: st.id,
                toolName: st.toolName,
                displayName: st.displayName,
                status: st.status,
                summary: st.summary,
                durationMs: st.endedAt && st.startedAt ? st.endedAt - st.startedAt : null
              })),
              v2ReportLength: s.v2ReportChunks.join("").length,
              v2ReportChunkCount: s.v2ReportChunks.length,
              v2ReportComplete: s.v2ReportComplete,
              v1Steps: s.steps.map((st) => ({ type: st.type, status: st.status })),
              usage: s.usage,
              duration: s.duration,
              error: s.error,
              debugLogCount: s.agentDebugLog.length
            };
            console.log("[V2 State Dump]", JSON.stringify(dump, null, 2));
            return dump;
          } catch (e) {
            console.error("dumpV2State failed", e);
          }
        };
        window.captureV2Debug = async () => {
          const fs3 = require("fs");
          const path4 = require("path");
          const outDir = "/tmp/peak-v2-debug";
          try {
            fs3.mkdirSync(outDir, { recursive: true });
          } catch {
          }
          const ts = Date.now();
          const state = window.dumpV2State?.();
          if (state) {
            fs3.writeFileSync(path4.join(outDir, `state-${ts}.json`), JSON.stringify(state, null, 2));
          }
          const modalEl = document.querySelector(".modal-container");
          if (modalEl) {
            const html = modalEl.innerHTML;
            fs3.writeFileSync(path4.join(outDir, `dom-${ts}.html`), html);
          }
          try {
            const electron = require("electron");
            const win = (electron.remote ?? electron).getCurrentWindow?.() ?? electron.BrowserWindow?.getFocusedWindow?.();
            if (win) {
              const image = await win.webContents.capturePage();
              fs3.writeFileSync(path4.join(outDir, `screenshot-${ts}.png`), image.toPNG());
              console.log(`[captureV2Debug] screenshot saved: ${outDir}/screenshot-${ts}.png`);
            }
          } catch (e) {
            console.warn("[captureV2Debug] screenshot failed (expected in some Electron configs):", e.message);
          }
          console.log(`[captureV2Debug] saved to ${outDir}/ (state + dom + screenshot)`);
          return outDir;
        };
        console.debug("\u{1F527} Dev Tools initialized!");
        console.debug('\u{1F4D6} Usage: window.testGraphTools.inspectNote("path/to/note.md")');
        console.debug('\u{1F4D6} Usage: await window.testAISearchTools.testSlotRecall("your question")');
        console.debug('\u{1F4D6} Usage: window.indexDocument("path/to/note.md") \u2014 fast core index');
        console.debug('\u{1F4D6} Usage: window.indexDocumentFull("path/to/note.md") \u2014 full index + LLM');
        window.testBackboneMap = (opts) => window.testAISearchTools.testBackboneMap(opts);
        window.testKnowledgeIntuition = (opts) => window.testAISearchTools.testKnowledgeIntuition(opts);
        window.testClassify = (query2) => window.testAISearchTools.testClassify(query2);
        window.testPipelinePhases = (query2) => window.testAISearchTools.testPipelinePhases(query2);
      }
    } else {
      if (typeof window !== "undefined") {
        const globals = [
          "testGraphTools",
          "testAISearchTools",
          "indexDocument",
          "indexDocumentFull",
          "runPendingLlmIndexEnrichment",
          "runPendingVectorIndexEnrichment",
          "getVaultPersona",
          "cleanupGraphTable",
          "dumpV2State",
          "captureV2Debug",
          "testBackboneMap",
          "testKnowledgeIntuition",
          "testClassify",
          "testPipelinePhases"
        ];
        for (const g of globals) {
          if (window[g]) delete window[g];
        }
      }
    }
  }
};

// src/service/ambient/AmbientSearcher.ts
var DEDUP_WINDOW_MS = 10 * 60 * 1e3;
function detectSharedTags(sourceTags, resultTags) {
  const signals = [];
  for (const tag of resultTags) {
    if (sourceTags.has(tag)) {
      signals.push({ type: "shared_tag", tag });
    }
  }
  return signals;
}
function detectGraphNeighborSignal(resultPath, directNeighbors, twoHopBridgeMap) {
  if (directNeighbors.has(resultPath)) {
    return { type: "graph_neighbor", hop: 1 };
  }
  const bridge = twoHopBridgeMap.get(resultPath);
  if (bridge !== void 0) {
    return { type: "graph_neighbor", hop: 2, via: bridge || void 0 };
  }
  return null;
}
function detectCoCitationSignal(resultPath, coCitations) {
  const match = coCitations.find((c) => c.path === resultPath);
  if (match && match.citingNotes.length > 0) {
    return { type: "co_citation", citingNote: match.citingNotes[0] };
  }
  return null;
}
function detectHubMemberSignal(resultPath, sharedHubNames) {
  const hubName = sharedHubNames.get(resultPath);
  if (hubName) {
    return { type: "hub_member", hubName };
  }
  return null;
}

// test/ambient-push.test.ts
{
  const lines = [
    "# Heading",
    "",
    "First line of paragraph.",
    "Second line of paragraph.",
    "Third line of paragraph.",
    "",
    "## Another heading",
    "",
    "Single line paragraph.",
    "",
    "Last paragraph start.",
    "Last paragraph end."
  ];
  import_node_assert.strict.equal(
    extractParagraphAtLine(lines, 3),
    "First line of paragraph.\nSecond line of paragraph.\nThird line of paragraph."
  );
  import_node_assert.strict.equal(extractParagraphAtLine(lines, 0), "# Heading");
  import_node_assert.strict.equal(extractParagraphAtLine(lines, 6), "## Another heading");
  import_node_assert.strict.equal(extractParagraphAtLine(lines, 1), "");
  import_node_assert.strict.equal(extractParagraphAtLine(lines, 5), "");
  import_node_assert.strict.equal(extractParagraphAtLine(lines, 8), "Single line paragraph.");
  import_node_assert.strict.equal(extractParagraphAtLine(lines, -1), "");
  import_node_assert.strict.equal(extractParagraphAtLine(lines, 100), "");
  import_node_assert.strict.equal(
    extractParagraphAtLine(lines, 10),
    "Last paragraph start.\nLast paragraph end."
  );
  console.log("extractParagraphAtLine: all passed");
}
{
  import_node_assert.strict.deepEqual(extractOutlinks("See [[Note A]] and [[Note B]]"), ["Note A", "Note B"]);
  import_node_assert.strict.deepEqual(extractOutlinks("[[Target|display text]]"), ["Target"]);
  import_node_assert.strict.deepEqual(extractOutlinks("[[Page#Section]]"), ["Page"]);
  import_node_assert.strict.deepEqual(extractOutlinks("[[Page#Section|alias]]"), ["Page"]);
  import_node_assert.strict.deepEqual(extractOutlinks("No links here"), []);
  import_node_assert.strict.deepEqual(extractOutlinks("[[A]] and [[A]] again"), ["A"]);
  import_node_assert.strict.deepEqual(extractOutlinks("[[#heading]]"), []);
  console.log("extractOutlinks: all passed");
}
{
  const lines = [
    "# Title",
    "Some text",
    "## Section",
    "More text",
    "### Subsection",
    "#### Too deep",
    "##### Way too deep",
    "Normal line",
    "## Another Section"
  ];
  import_node_assert.strict.deepEqual(extractHeadings(lines), ["Title", "Section", "Subsection", "Another Section"]);
  import_node_assert.strict.deepEqual(extractHeadings([]), []);
  import_node_assert.strict.deepEqual(extractHeadings(["no headings here"]), []);
  console.log("extractHeadings: all passed");
}
{
  const lines = [
    "# Top",
    "intro text",
    "## Section A",
    "content a",
    "### Subsection A1",
    "content a1",
    "## Section B",
    "content b"
  ];
  import_node_assert.strict.equal(getCursorSection(lines, 1), "Top");
  import_node_assert.strict.equal(getCursorSection(lines, 3), "Top > Section A");
  import_node_assert.strict.equal(getCursorSection(lines, 5), "Top > Section A > Subsection A1");
  import_node_assert.strict.equal(getCursorSection(lines, 7), "Top > Section B");
  import_node_assert.strict.equal(getCursorSection(lines, 0), "Top");
  import_node_assert.strict.equal(getCursorSection([], 0), "");
  console.log("getCursorSection: all passed");
}
{
  import_node_assert.strict.equal(
    generateExplanation([{ type: "shared_tag", tag: "programming" }]),
    "Both tagged with #programming"
  );
  import_node_assert.strict.equal(
    generateExplanation([{ type: "graph_neighbor", hop: 1 }]),
    "Directly linked"
  );
  import_node_assert.strict.equal(
    generateExplanation([{ type: "graph_neighbor", hop: 2, via: "Bridge Note" }]),
    "Connected via [[Bridge Note]]"
  );
  import_node_assert.strict.equal(
    generateExplanation([{ type: "co_citation", citingNote: "Summary" }]),
    "Co-cited in [[Summary]]"
  );
  import_node_assert.strict.equal(
    generateExplanation([{ type: "hub_member", hubName: "Machine Learning" }]),
    'Both in "Machine Learning" cluster'
  );
  import_node_assert.strict.equal(
    generateExplanation([{ type: "text_overlap", terms: ["neural", "network"] }]),
    'Similar discussion of "neural", "network"'
  );
  import_node_assert.strict.equal(
    generateExplanation([{ type: "recency", editedDaysAgo: 3 }]),
    "Edited 3 days ago in a related session"
  );
  import_node_assert.strict.equal(generateExplanation([]), "Related content");
  import_node_assert.strict.equal(
    generateExplanation([
      { type: "shared_tag", tag: "test" },
      { type: "graph_neighbor", hop: 1 }
    ]),
    "Directly linked"
  );
  import_node_assert.strict.equal(
    generateExplanation([
      { type: "hub_member", hubName: "Cluster" },
      { type: "co_citation", citingNote: "Index" }
    ]),
    "Co-cited in [[Index]]"
  );
  import_node_assert.strict.equal(
    generateExplanation([
      { type: "text_overlap", terms: ["foo"] },
      { type: "recency", editedDaysAgo: 1 }
    ]),
    "Edited 1 days ago in a related session"
  );
  console.log("generateExplanation: all passed");
}
{
  const sourceTags = /* @__PURE__ */ new Set(["process", "dev", "ai"]);
  const resultTags = ["dev", "testing", "ai"];
  const signals = detectSharedTags(sourceTags, resultTags);
  import_node_assert.strict.equal(signals.length, 2);
  import_node_assert.strict.equal(signals[0].type, "shared_tag");
  import_node_assert.strict.equal(signals[0].tag, "dev");
  import_node_assert.strict.equal(signals[1].tag, "ai");
  const empty = detectSharedTags(/* @__PURE__ */ new Set(["a"]), ["b"]);
  import_node_assert.strict.equal(empty.length, 0);
  console.log("detectSharedTags: all passed");
}
{
  const s1 = detectGraphNeighborSignal("note-a.md", /* @__PURE__ */ new Set(["note-a.md", "note-b.md"]), /* @__PURE__ */ new Map());
  import_node_assert.strict.equal(s1?.type, "graph_neighbor");
  import_node_assert.strict.equal(s1.hop, 1);
  const bridgeMap = /* @__PURE__ */ new Map([["note-c.md", "Bridge Note"]]);
  const s2 = detectGraphNeighborSignal("note-c.md", /* @__PURE__ */ new Set(), bridgeMap);
  import_node_assert.strict.equal(s2?.type, "graph_neighbor");
  import_node_assert.strict.equal(s2.hop, 2);
  import_node_assert.strict.equal(s2.via, "Bridge Note");
  const s3 = detectGraphNeighborSignal("note-x.md", /* @__PURE__ */ new Set(), /* @__PURE__ */ new Map());
  import_node_assert.strict.equal(s3, null);
  console.log("detectGraphNeighborSignal: all passed");
}
{
  const coCitations = [
    { nodeId: "n1", path: "note-a.md", label: "Note A", citingNotes: ["MOC Note"], score: 0.8 },
    { nodeId: "n2", path: "note-b.md", label: "Note B", citingNotes: [], score: 0.3 }
  ];
  const s1 = detectCoCitationSignal("note-a.md", coCitations);
  import_node_assert.strict.equal(s1?.type, "co_citation");
  import_node_assert.strict.equal(s1.citingNote, "MOC Note");
  const s2 = detectCoCitationSignal("note-b.md", coCitations);
  import_node_assert.strict.equal(s2, null);
  const s3 = detectCoCitationSignal("note-x.md", coCitations);
  import_node_assert.strict.equal(s3, null);
  console.log("detectCoCitationSignal: all passed");
}
{
  const sharedHubNames = /* @__PURE__ */ new Map([["note-a.md", "Systems Thinking"]]);
  const s1 = detectHubMemberSignal("note-a.md", sharedHubNames);
  import_node_assert.strict.equal(s1?.type, "hub_member");
  import_node_assert.strict.equal(s1.hubName, "Systems Thinking");
  const s2 = detectHubMemberSignal("note-x.md", sharedHubNames);
  import_node_assert.strict.equal(s2, null);
  console.log("detectHubMemberSignal: all passed");
}
console.log("All Phase 2 signal detection tests passed");
{
  const posMap = /* @__PURE__ */ new Map([["src::target", 5]]);
  const boost = Math.min(0.3, (posMap.get("src::target") ?? 0) * 0.1);
  import_node_assert.strict.equal(boost, 0.3);
  const boost2 = Math.min(0.3, (posMap.get("src::other") ?? 0) * 0.1);
  import_node_assert.strict.equal(boost2, 0);
  const posMap2 = /* @__PURE__ */ new Map([["src::target", 2]]);
  const boost3 = Math.min(0.3, (posMap2.get("src::target") ?? 0) * 0.1);
  import_node_assert.strict.equal(boost3, 0.2);
  const ignMap = /* @__PURE__ */ new Map([["src::target", 2]]);
  const penalty = Math.min(0.15, (ignMap.get("src::target") ?? 0) * 0.05);
  import_node_assert.strict.equal(penalty, 0.1);
  const ignMap2 = /* @__PURE__ */ new Map([["src::target", 10]]);
  const penalty2 = Math.min(0.15, (ignMap2.get("src::target") ?? 0) * 0.05);
  import_node_assert.strict.equal(penalty2, 0.15);
  console.log("feedback scoring: all passed");
}
{
  import_node_assert.strict.equal(
    generateExplanation([{ type: "co_citation", citingNote: "MOC Note" }]),
    "Co-cited in [[MOC Note]]"
  );
  import_node_assert.strict.equal(
    generateExplanation([{ type: "hub_member", hubName: "Systems Thinking" }]),
    'Both in "Systems Thinking" cluster'
  );
  import_node_assert.strict.equal(
    generateExplanation([{ type: "graph_neighbor", hop: 2, via: "Design Patterns" }]),
    "Connected via [[Design Patterns]]"
  );
  const multi = generateExplanation([
    { type: "shared_tag", tag: "dev" },
    { type: "graph_neighbor", hop: 1 }
  ]);
  import_node_assert.strict.equal(multi, "Directly linked");
  console.log("RelevanceExplainer Phase 2 coverage: all passed");
}
console.log("All tests passed");
