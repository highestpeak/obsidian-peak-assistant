import { AppContext } from "@/app/context/AppContext";
import { template as RECENT_CHANGES_TEMPLATE } from "../templates/recent-changes";
import { buildResponse } from "../types";
import { applyFiltersAndSorters, getDefaultItemFiledGetter } from "./common";

export async function getRecentChanges(params: any) {
    const { limit, response_format, filters, sorter } = params;
    const candidateItems = await AppContext.getInstance().searchClient.getRecent(limit);

    const itemFiledGetter = await getDefaultItemFiledGetter(candidateItems.map(item => item.id), filters, sorter);
    const finalItems = applyFiltersAndSorters(candidateItems, filters, sorter, limit, itemFiledGetter);

    // Render template
    return buildResponse(response_format, RECENT_CHANGES_TEMPLATE, {
        items: finalItems,
    });
}
