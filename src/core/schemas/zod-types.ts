/**
 * Re-export only types and ZodError from zod. Only this file (and other files under schemas) may import from "zod/v3".
 * Other code must not import z; they use ZodType / ZodError from @/core/schemas.
 */
import { z } from "zod/v3";

export type ZodType = z.ZodType;
/** Re-export for instanceof checks and type use. Only schemas import from "zod/v3". */
export const ZodError = z.ZodError;
