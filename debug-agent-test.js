require("dotenv").config();
const { StreamClient } = require("@stream-io/node-sdk");

const client = new StreamClient(
  process.env.NEXT_PUBLIC_STREAM_VIDEO_API_KEY,
  process.env.STREAM_VIDEO_SECRET_KEY
);

async function tryConnect(call, label, model) {
  try {
    const rt = await client.video.connectOpenAi({
      call,
      openAiApiKey: process.env.OPENAI_API_KEY,
      agentUserId: "debug-agent",
      ...(model ? { model } : {}),
    });
    console.log(`[${label}] CONNECTED OK`);
    try { rt.disconnect(); } catch {}
  } catch (e) {
    console.log(`[${label}] FAILED:`);
    console.log(require("util").inspect(e, { depth: null }));
  }
}

(async () => {
  await client.upsertUsers([
    { id: "debug-user", name: "Debug User" },
    { id: "debug-agent", name: "Debug Agent" },
  ]);
  const call = client.video.call("default", "agent-debug-test");
  await call.getOrCreate({
    data: { created_by_id: "debug-user", custom: { debug: true } },
  });

  await tryConnect(call, "default model (current webhook behavior)");
  await tryConnect(call, "gpt-realtime", "gpt-realtime");

  await call.end().catch(() => {});
  process.exit(0);
})().catch((e) => {
  console.error("setup failed:", e?.message || e);
  process.exit(1);
});
