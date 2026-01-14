import { AppContext } from "@/app/context/AppContext";
import { template as LOCAL_SEARCH_TEMPLATE } from "../templates/local-search";
import { buildResponse } from "../types";
import { applyFiltersAndSorters, getDefaultItemFiledGetter } from "./common";

export async function localSearch(params: any) {
    const { query, searchMode, scopeMode, scopeValue, limit, response_format, filters, sorter } = params;
    const {items, duration} = await AppContext.getInstance().searchClient.search({
        text: query,
        searchMode: searchMode,
        scopeMode: scopeMode,
        scopeValue: scopeValue,
        topK: limit,
    });

    const itemFiledGetter = await getDefaultItemFiledGetter(items.map(item => item.id), filters, sorter);
    const finalItems = applyFiltersAndSorters(items, filters, sorter, limit, itemFiledGetter);

    // Render template
    return buildResponse(response_format, LOCAL_SEARCH_TEMPLATE, {
        query: query,
        results: finalItems,
        searchTime: duration
    });
}