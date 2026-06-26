import { z } from "zod/v3";
import { buildResponse } from "../types";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { ToolTemplateId } from "@/core/template/TemplateRegistry";
import { applyFiltersAndSorters, getDefaultItemFiledGetter } from "./common";
import { recentChangesWholeVaultInputSchema } from "@/core/schemas/tools/searchGraphInspector";
import type { SearchClient } from "@/service/search/SearchClient";

type RecentChangesParams = z.infer<typeof recentChangesWholeVaultInputSchema> & { mode: string };

export async function getRecentChanges(params: RecentChangesParams, searchClient: SearchClient, templateManager?: TemplateManager) {
    const { limit, response_format, filters, sorter } = params;
    const candidateItems = await searchClient.getRecent(limit);
    const itemFiledGetter = await getDefaultItemFiledGetter(candidateItems.map(item => item.id), filters, sorter);
    const finalItems = applyFiltersAndSorters(candidateItems, filters, sorter, limit, itemFiledGetter);

    const data = { items: finalItems };
    return buildResponse(response_format, ToolTemplateId.RecentChanges, data, { templateManager });
}
