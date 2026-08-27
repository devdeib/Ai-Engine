import { z } from "zod";
import {
  ACTION_CENTER_DEFAULT_LIMIT,
  ACTION_CENTER_MAX_LIMIT,
} from "@/modules/ai/action-center/constants";

export const listAiActionCenterQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(1),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(ACTION_CENTER_MAX_LIMIT, "Limit must be at most 100")
    .default(ACTION_CENTER_DEFAULT_LIMIT),
});
