require("dotenv").config();
const { WebSocket } = require("ws");

const ws = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime", {
  headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
});

ws.on("open", () => console.log("connected to OpenAI GA realtime"));
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.type === "session.created") {
    console.log("SESSION CREATED — key, quota and model all OK");
    ws.close();
    process.exit(0);
  }
  if (m.type === "error") {
    console.log("OPENAI ERROR:", JSON.stringify(m, null, 2));
    process.exit(1);
  }
});
ws.on("unexpected-response", (_req, res) => {
  console.log("HTTP", res.statusCode);
  let b = "";
  res.on("data", (c) => (b += c));
  res.on("end", () => {
    console.log(b);
    process.exit(1);
  });
});
ws.on("error", (e) => console.log("ws error:", e.message));
setTimeout(() => {
  console.log("timeout — no session.created within 20s");
  process.exit(1);
}, 20000);
