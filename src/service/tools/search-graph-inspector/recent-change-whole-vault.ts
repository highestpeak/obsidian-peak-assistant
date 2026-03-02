import { AppContext } from "@/app/context/AppContext";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import { applyFiltersAndSorters, getDefaultItemFiledGetter } from "./common";
export async function getRecentChanges(params: any, templateManager?: TemplateManager) {
    const { limit, response_format, filters, sorter } = params;
    const candidateItems = await AppContext.getInstance().searchClient.getRecent(limit);
    const itemFiledGetter = await getDefaultItemFiledGetter(candidateItems.map(item => item.id), filters, sorter);
    const finalItems = applyFiltersAndSorters(candidateItems, filters, sorter, limit, itemFiledGetter);

    const data = { items: finalItems };
    return buildResponse(response_format, ToolTemplateId.RecentChanges, data, { templateManager });
}
