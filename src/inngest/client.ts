import { Inngest } from "inngest";

// Inngest v4 defaults, set explicitly:
// - Mode: v4 defaults to cloud mode, which requires INNGEST_SIGNING_KEY (provided on Vercel by
//   the Inngest integration) and rejects unsigned requests. Dev mode is only for a local
//   Inngest Dev Server and is opted into with INNGEST_DEV=1.
// - Checkpointing: v4 runs steps back-to-back in one request and checkpoints after each step,
//   instead of one HTTP round trip per step. The default 10s budget would push the summary
//   (an OpenAI call that can take tens of seconds) onto the slower async path, so allow up to
//   240s: about 80% of the 300s maxDuration on /api/inngest, leaving room to checkpoint before
//   Vercel stops the function. Longer runs fall back to normal async execution.
export const inngest = new Inngest({
  id: "meer-ai-2",
  isDev: process.env.INNGEST_DEV === "1",
  checkpointing: { maxRuntime: "240s" },
});
