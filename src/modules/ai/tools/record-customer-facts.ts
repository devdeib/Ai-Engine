import "server-only";
import { executeRecordCustomerFacts } from "@/modules/ai/actions/write";
import type { AiToolDefinition } from "@/modules/ai/tools/types";
import {
  RECORD_CUSTOMER_FACTS_JSON_SCHEMA,
  recordCustomerFactsToolInputSchema,
  recordCustomerFactsToolOutputSchema,
  type RecordCustomerFactsToolInput,
} from "@/modules/ai/tools/write-schemas";

export const recordCustomerFactsTool: AiToolDefinition = {
  name: "record_customer_facts",
  trust: "autonomous",
  description:
    "Record contact details or qualification facts the customer explicitly stated. Never invent or infer values. Fill empty contact fields only; do not overwrite existing contact data. Scope is fixed by the server.",
  inputSchema: recordCustomerFactsToolInputSchema,
  outputSchema: recordCustomerFactsToolOutputSchema,
  inputJsonSchema: { ...RECORD_CUSTOMER_FACTS_JSON_SCHEMA },
  async execute(ctx, input) {
    return executeRecordCustomerFacts(
      ctx,
      input as RecordCustomerFactsToolInput
    );
  },
};
