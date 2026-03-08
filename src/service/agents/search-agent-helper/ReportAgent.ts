import { AIServiceManager } from "@/service/chat/service-manager";
import { AgentContextManager } from "./AgentContextManager";
import { LLMStreamEvent, StreamTriggerName, UIStepType } from "@/core/providers/types";
import { mergeStreamsWithConcurrency, parallelStream } from "@/core/providers/helpers/stream-helper";
import { AnalysisMode } from "../AISearchAgent";
import { EvidenceMermaidOverviewWeaveAgent } from "./EvidenceMermaidOverviewWeaveAgent";
import { ReportPlanAgent } from "./ReportPlanAgent";
import { DashboardBlocksAgent } from "./DashboardBlocksAgent";
import { SummaryAgent } from "./SummaryAgent";
import { generateUuidWithoutHyphens } from "@/core/utils/id-utils";
import { PromptId } from "@/service/prompt/PromptId";
import { type ReportBlockBlueprintItem } from "./helpers/report-block-plan-weaver";
import { makeStepId, uiStageSignal } from "./helpers/search-ui-events";
import { TopicsUpdateAgent } from "./TopicsUpdateAgent";

const REPORT_BLOCK_CONCURRENCY = 3;

export class ReportAgent {
    private readonly evidenceMermaidOverviewWeaveAgent: EvidenceMermaidOverviewWeaveAgent;
    private readonly reportPlanAgent: ReportPlanAgent;
    private readonly summaryAgent: SummaryAgent;
    private readonly topicsUpdateAgent: TopicsUpdateAgent;
    constructor(
        private readonly aiServiceManager: AIServiceManager,
        private readonly context: AgentContextManager,
    ) {
        this.evidenceMermaidOverviewWeaveAgent = new EvidenceMermaidOverviewWeaveAgent({ aiServiceManager, context });
        this.reportPlanAgent = new ReportPlanAgent(aiServiceManager, context);
        this.summaryAgent = new SummaryAgent({ aiServiceManager, context });
        this.topicsUpdateAgent = new TopicsUpdateAgent({ aiServiceManager, context });
    }

    public async *streamReport(opts: { analysisMode: AnalysisMode; runStepId?: string }): AsyncGenerator<LLMStreamEvent> {
        const rootStepId = opts.runStepId ?? generateUuidWithoutHyphens();

        yield* this.evidenceMermaidOverviewWeaveAgent.stream({ stepId: rootStepId });

        yield* this.reportPlanAgent.streamPlan({ stepId: rootStepId });

        let items = this.context.getReportBlockBlueprintItems();
        if (items.length === 0) {
            const plan = this.context.getReportPlan();
            if (!plan) {
                yield {
                    type: "pk-debug",
                    debugName: "report-phases-skip",
                    triggerName: StreamTriggerName.SEARCH_AI_AGENT,
                    extra: { reason: "no report plan" },
                };
                return;
            }
        }

        yield* parallelStream([
            this.summaryAgent.streamTitle({ stepId: rootStepId }),
            this.topicsUpdateAgent.stream(
                [this.context.getReportPlan()?.topicsSpec ?? this.context.getVerifiedFactSheet().join('\n')],
                rootStepId
            ),
        ])

        yield uiStageSignal(
            { runStepId: rootStepId, stage: 'reportBlock', agent: 'ReportAgent' },
            { status: 'start', triggerName: StreamTriggerName.SEARCH_AI_AGENT },
        );
        yield {
            type: "ui-step",
            uiType: UIStepType.STEPS_DISPLAY,
            stepId: rootStepId,
            title: "Generating report blocks…",
            description: "Report body & appendices",
            triggerName: StreamTriggerName.SEARCH_AI_AGENT,
        };
        const factories = items.map((item: ReportBlockBlueprintItem) => () => {
            const agent = new DashboardBlocksAgent({
                aiServiceManager: this.aiServiceManager,
                context: this.context,
            });
            const stepId = makeStepId({
                runStepId: rootStepId,
                stage: 'reportBlock',
                lane: { laneType: 'block', laneId: item.blockId },
                agent: 'DashboardBlocksAgent',
            });
            const promptOverride =
                item.kind === "body"
                    ? {
                        promptId: PromptId.AiAnalysisReportBodyBlocks,
                        systemPromptId: PromptId.AiAnalysisReportBodyBlocksSystem,
                    }
                    : {
                        promptId: PromptId.AiAnalysisReportAppendicesBlocks,
                        systemPromptId: PromptId.AiAnalysisReportAppendicesBlocksSystem,
                    };
            return agent.streamOneReportBlock(item, stepId, undefined, promptOverride, rootStepId, item.blockId);
        });
        yield* mergeStreamsWithConcurrency(REPORT_BLOCK_CONCURRENCY, factories);
        yield uiStageSignal(
            { runStepId: rootStepId, stage: 'reportBlock', agent: 'ReportAgent' },
            { status: 'complete', triggerName: StreamTriggerName.SEARCH_AI_AGENT },
        );

        yield {
            type: "ui-step",
            uiType: UIStepType.STEPS_DISPLAY,
            stepId: rootStepId,
            title: "Generating summary…",
            description: "Summary",
            triggerName: StreamTriggerName.SEARCH_AI_AGENT,
        };
        yield* this.summaryAgent.streamSummary({ stepId: rootStepId });
    }
}