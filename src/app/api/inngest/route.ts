import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { meetingsProcessing } from "@/inngest/functions";

// Matches the project's 300s function limit; the client's checkpointing maxRuntime (240s)
// stays below it so a run can checkpoint before the function is stopped.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    meetingsProcessing,
  ],
});
