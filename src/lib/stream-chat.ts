import "server-only";
import { StreamClient } from "@stream-io/node-sdk";

// stream-chat v10 is a client-only SDK (no secret, no server methods), so server-side
// chat calls (tokens, users, channel history, bot replies) go through the Stream node SDK.
export const streamChat = new StreamClient(
    process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY!,
    process.env.STREAM_CHAT_SECRET_KEY!
)
