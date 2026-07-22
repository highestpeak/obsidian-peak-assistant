(() => {
  "use strict";

  const PRIMARY = [
    ["knowledge-base", "知识库.md", "B-2/信息聚合-PKM/知识库.md", 91, "当前 [[知识库]] 链接命中 · 14:29 最近编辑", "reference"],
    ["base-judgement", "Base 使用判断.md", "B-2/信息聚合-PKM/Base 使用判断.md", 84, "共同讨论结构化字段与最终输出", "semantic"],
    ["knowledge-review", "知识回顾.md", "B-2/信息聚合-PKM/知识回顾.md", 78, "记录了从阅读、修改到复盘的路径", "semantic"],
    ["composer-architecture", "Composer architecture.md", "Projects/Peak/Composer architecture.md", 75, "包含原生对象、事务与回写边界", "reference"],
    ["evidence-matrix", "证据矩阵.md", "Projects/Peak/证据矩阵.md", 72, "可用于补齐判断依据和出处", "semantic"],
  ];

  const SUPPORTING = [
    ["editor-transaction", "编辑器事务模型.md", "Projects/Peak/Composer/编辑器事务模型.md", "解释接受、拒绝与回滚如何形成一次正文事务"],
    ["ai-writeback-audit", "AI 写回审计.md", "Projects/Peak/Composer/AI 写回审计.md", "记录候选内容从生成到接受写入的边界"],
    ["block-identity", "Block identity.md", "Projects/Peak/Composer/Block identity.md", "说明修改结果如何稳定定位到原生正文对象"],
    ["composer-review-flow", "Composer review flow.md", "Projects/Peak/Composer/Composer review flow.md", "覆盖逐项审阅与 previous / next change 导航"],
    ["markdown-roundtrip", "Markdown roundtrip.md", "Projects/Peak/Composer/Markdown roundtrip.md", "验证编辑结果能回到源 Markdown 而不丢失结构"],
    ["inline-diff", "Inline diff 交互.md", "Projects/Peak/Composer/Inline diff 交互.md", "比较原位 diff 与上下 before / after 的适用场景"],
    ["history-rollback", "History rollback.md", "Projects/Peak/Composer/History rollback.md", "定义接受写入后的定位、查看与安全回滚"],
    ["editor-ownership", "Editor ownership.md", "Projects/Peak/Composer/Editor ownership.md", "强调正文最终所有权仍属于作者"],
    ["review-queue", "Review queue.md", "Projects/Peak/Composer/Review queue.md", "描述大量候选改动的排序和分批审阅"],
    ["prompt-context", "Prompt context contract.md", "Projects/Peak/Intelligence/Prompt context contract.md", "区分自动上下文、显式来源和冻结快照"],
    ["sidecar-design", "智能侧栏设计.md", "Projects/Peak/Intelligence/智能侧栏设计.md", "记录贴近正文的 sidecar 信息架构"],
    ["ambient-handbook", "Ambient Push handbook.md", "Projects/Peak/Intelligence/Ambient Push handbook.md", "说明主动建议如何原位更新而不污染对话"],
    ["current-work-state", "Current Work State.md", "Projects/Peak/Intelligence/Current Work State.md", "保存当前工作判断及其可追溯信号"],
    ["run-envelope", "Capability Run Envelope.md", "Projects/Peak/Intelligence/Capability Run Envelope.md", "约束能力、上下文与执行回执属于同一轮运行"],
    ["action-receipts", "Agent action receipts.md", "Projects/Peak/Intelligence/Agent action receipts.md", "展示 agent choice、工具调用和结果回执"],
    ["source-provenance", "Source provenance.md", "Projects/Peak/Intelligence/Source provenance.md", "让洞察与修改都能回到具体来源"],
    ["suggest-links", "Suggest Links contract.md", "Projects/Peak/Capabilities/Suggest Links contract.md", "定义建议链接与图谱近邻的解释信息"],
    ["add-evidence", "Add Evidence contract.md", "Projects/Peak/Capabilities/Add Evidence contract.md", "描述如何检索、选择并带入证据"],
    ["result-subgraph", "Result subgraph notes.md", "Projects/Peak/Search/Result subgraph notes.md", "记录搜索结果到局部关系图的投影规则"],
    ["search-ranking", "Search ranking review.md", "Projects/Peak/Search/Search ranking review.md", "解释相关材料为什么排在当前顺序"],
    ["semantic-edge", "Semantic edge policy.md", "Projects/Peak/Search/Semantic edge policy.md", "区分显式引用和已索引语义关系"],
    ["folder-projection", "Folder projection.md", "Projects/Peak/Search/Folder projection.md", "从完整 Vault path 派生目录树"],
    ["retrieval-contract", "Knowledge retrieval.md", "Projects/Peak/Search/Knowledge retrieval.md", "约束检索结果、score 与 reason 的稳定字段"],
    ["pkm-output", "PKM 输出工作流.md", "B-2/信息聚合-PKM/PKM 输出工作流.md", "补充知识从收集、组织到重新输出的路径"],
    ["review-principles", "文档审阅原则.md", "B-2/信息聚合-PKM/文档审阅原则.md", "提供论证完整性与适用边界的检查清单"],
    ["evidence-conclusion", "证据与结论.md", "B-2/信息聚合-PKM/证据与结论.md", "说明结论如何绑定依据并保持可复查"],
    ["base-data-model", "Base data model.md", "B-2/信息聚合-PKM/Base data model.md", "比较结构化字段和正文叙述的协作方式"],
    ["canvas-editing", "Canvas editing notes.md", "B-2/信息聚合-PKM/Canvas editing notes.md", "记录非文本对象的编辑与审阅边界"],
    ["graph-semantics", "Graph relation semantics.md", "B-2/信息聚合-PKM/Graph relation semantics.md", "定义引用、语义和弱关联的视觉语法"],
    ["user-research", "Composer user research.md", "Research/Peak/Composer user research.md", "汇总作者对正文旁 AI 协作的反馈"],
    ["sidecar-interviews", "Intelligence sidecar interviews.md", "Research/Peak/Intelligence sidecar interviews.md", "记录用户如何理解建议、对话和审阅"],
    ["vault-search-study", "Vault Search usability study.md", "Research/Peak/Vault Search usability study.md", "验证列表、文件夹和图谱三种视图的认知模型"],
  ];

  function createRelatedMaterialsSnapshot() {
    const items = [
      ...PRIMARY.map(([id, title, path, score, reason, relationKind]) => ({ id, title, path, score, reason, relationKind })),
      ...SUPPORTING.map(([id, title, path, reason], index) => ({ id, title, path, score: 71 - index, reason, relationKind: index % 3 === 0 ? "reference" : "semantic" })),
    ];
    return {
      id: "composer-related-materials",
      revision: "composer-related-materials-2026-07-21-v2",
      root: { id: "current-block", kind: "current", label: "AI 旁路段落" },
      items,
      relations: [
        { source: "source:knowledge-base", target: "source:knowledge-review", kind: "reference", strength: 0.82 },
        { source: "source:base-judgement", target: "source:composer-architecture", kind: "semantic", strength: 0.76 },
      ],
    };
  }

  window.PeakVaultResultFixtures = Object.freeze({ createRelatedMaterialsSnapshot });
})();
