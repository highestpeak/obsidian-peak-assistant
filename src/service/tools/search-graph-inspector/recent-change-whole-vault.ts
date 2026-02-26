import { AppContext } from "@/app/context/AppContext";
import { buildResponse, buildResponseFromRendered } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import { applyFiltersAndSorters, getDefaultItemFiledGetter } from "./common";
import { getAiAnalysisExcludeContext } from "./ai-analysis-exclude";

export async function getRecentChanges(params: any, templateManager?: TemplateManager) {
    const { limit, response_format, filters, sorter } = params;
    let candidateItems = await AppContext.getInstance().searchClient.getRecent(limit);

    const excludeCtx = await getAiAnalysisExcludeContext();
    if (excludeCtx) {
        candidateItems = candidateItems.filter((i) => !excludeCtx.excludedDocIds.has(i.id));
    }

    const itemFiledGetter = await getDefaultItemFiledGetter(candidateItems.map(item => item.id), filters, sorter);
    const finalItems = applyFiltersAndSorters(candidateItems, filters, sorter, limit, itemFiledGetter);

    const data = { items: finalItems };
    const tm = templateManager ?? AppContext.getInstance().manager.getTemplateManager?.();
    if (tm) {
        const rendered = await tm.render(ToolTemplateId.RecentChanges, data);
        return buildResponseFromRendered(response_format, data, rendered);
    }
    return buildResponse(response_format, undefined, data);
}
