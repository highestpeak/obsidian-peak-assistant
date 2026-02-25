/**
 * Builds the update-result tool input schema (operations array). Only this file uses z for this domain.
 */
import { z } from "zod/v3";

export type UpdateResultTransforms = {
	parseRaw: (raw: unknown) => unknown;
	normalize: (raw: unknown) => unknown;
	dataTransform: (data: unknown) => unknown;
};

/**
 * Creates the input schema for update-result tools: { operations: Operation[] }.
 * Transforms are provided by the caller (they depend on runtime context).
 */
export function createUpdateResultInputSchema(
	fieldName: string,
	itemSchema: z.ZodType,
	transforms: UpdateResultTransforms,
	operationsArrayDesc: string
): z.ZodType {
	const addOperationSchema = z.object({
		operation: z.literal("add"),
		targetField: z.literal(fieldName),
		item: itemSchema,
	});

	const removeOperationSchema = z.object({
		operation: z.literal("remove"),
		targetField: z.literal(fieldName),
		removeId: z.string().min(1, { message: "removeId is required" }),
	});

	const operationSchema = z
		.any()
		.transform(transforms.parseRaw)
		.transform(transforms.normalize)
		.pipe(
			z
				.discriminatedUnion("operation", [
					addOperationSchema,
					removeOperationSchema,
				])
				.transform(transforms.dataTransform)
		);

	return z.object({
		operations: z.array(operationSchema).describe(operationsArrayDesc),
	});
}
