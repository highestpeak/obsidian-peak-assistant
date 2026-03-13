import { z } from "zod/v3";
import { overviewLogicModelSchema } from "../agents/search-agent-schemas";

export const submitOverviewLogicModelInputSchema = z.object({
	logicModel: overviewLogicModelSchema,
});

export type SubmitOverviewLogicModelInput = z.infer<typeof submitOverviewLogicModelInputSchema>;
