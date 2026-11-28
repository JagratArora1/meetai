import { and,eq,not } from "drizzle-orm";
import { NextRequest,NextResponse,after } from "next/server";
import { CallSessionParticipantLeftEvent,CallSessionStartedEvent,CallEndedEvent,CallTranscriptionReadyEvent,CallRecordingReadyEvent,MessageNewEvent,InvalidWebhookError,InvalidWebhookErrorMessages,verifyAndParseWebhook,type StreamCall } from "@stream-io/node-sdk";
import type { RealtimeClient,RealtimeEventEnvelope } from "@stream-io/openai-realtime-api";
import { db } from "@/db";
import { agents,meetings } from "@/db/schema";
import { streamVideo } from "@/lib/stream-video";
import { inngest } from "@/inngest/client";
import OpenAI from "openai"
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { generateAvatarUri } from "@/lib/avatar";
import { streamChat } from "@/lib/stream-chat";
import { gunzipSync } from "node:zlib";
import { timingSafeEqual } from "node:crypto";

const openaiClient = new OpenAI({apiKey:process.env.OPENAI_API_KEY!});

// Stream events are a few kilobytes. 5 MB is about what an uncompressed request can carry on
// Vercel (4.5 MB), so the cap only stops bodies that inflate far beyond any real event.
const MAX_WEBHOOK_BODY_BYTES = 5 * 1024 * 1024;

const isGzip = (bytes:Buffer) => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

// Stream sends the app's API key in X-Api-Key. Video and chat events come from the same Stream
// app (both are verified with the video secret below), so either configured key is accepted;
// normally they are the same value. timingSafeEqual compares in constant time.
const isExpectedApiKey = (received:string) => {
    const receivedBytes = Buffer.from(received);
    const expectedKeys = [
        process.env.NEXT_PUBLIC_STREAM_VIDEO_API_KEY,
        process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY,
    ];
    let matched = false;
    for(const key of expectedKeys){
        if(!key){
            continue;
        }
        const keyBytes = Buffer.from(key);
        if(keyBytes.length === receivedBytes.length && timingSafeEqual(keyBytes,receivedBytes)){
            matched = true;
        }
    }
    return matched;
};

export async function POST(req:NextRequest){
    const signature=req.headers.get("x-signature");
    const apiKey=req.headers.get("x-api-key");
    if(!signature || !apiKey){
        return NextResponse.json(
            {error:"Missing signature or API key"},
            {status:400}
        )
    }
    if(!isExpectedApiKey(apiKey)){
        console.warn("Stream webhook rejected: unexpected API key");
        return NextResponse.json(
            {error:"Invalid API key"},
            {status:401}
        )
    }
    // Stream can deliver webhook bodies gzip-compressed, and signs the uncompressed JSON.
    // Read the raw bytes (req.text() would mangle gzip data), gunzip them here with a size
    // cap, then let the SDK verify the HMAC and parse. The SDK's own gunzip has no limit and
    // runs before the signature check, so a small unsigned gzip body could inflate to
    // gigabytes in memory.
    const rawBody = Buffer.from(await req.arrayBuffer());
    let body = rawBody;
    if(isGzip(rawBody)){
        try{
            body = gunzipSync(rawBody,{maxOutputLength:MAX_WEBHOOK_BODY_BYTES});
        } catch {
            return NextResponse.json(
                {error:"Invalid payload"},
                {status:400}
            )
        }
        // Stream compresses once; a second gzip layer would reach the SDK's unbounded gunzip.
        if(isGzip(body)){
            return NextResponse.json(
                {error:"Invalid payload"},
                {status:400}
            )
        }
    }
    let payload:unknown;
    try{
        payload = verifyAndParseWebhook(body,signature,process.env.STREAM_VIDEO_SECRET_KEY!);
    } catch (error) {
        if(error instanceof InvalidWebhookError && error.message === InvalidWebhookErrorMessages.signatureMismatch){
            console.warn("Stream webhook rejected: signature mismatch",{
                contentEncoding:req.headers.get("content-encoding"),
                bytes:rawBody.length,
                gzipMagic:isGzip(rawBody),
            });
            return NextResponse.json(
                {error:"Invalid Signature"},
                {status:401}
            )
        }
        return NextResponse.json(
            {error:"Invalid payload"},
            {status:400}
        )
    }
    const eventType = (payload as Record<string,unknown>)?.type;
    if(eventType === "call.session_started"){
        const event = payload as CallSessionStartedEvent;
        const meetingId = event.call.custom.meetingId;
        if(!meetingId){
            return NextResponse.json(
                {error:"Missing meetingId"},
                {status:400}
            )
        }
        const [existingMeeting] = await db
            .select()
            .from(meetings)
            .where(
                and(
                    eq(meetings.id,meetingId),
                    not(eq(meetings.status,"completed")),
                    not(eq(meetings.status,"active")),
                    not(eq(meetings.status,"cancelled")),
                    not(eq(meetings.status,"processing")),
                )
            )
            if(!existingMeeting){
                return NextResponse.json(
                    {error:"Meeting not found"},
                    {status:404}
                )
            }
            await db
                .update(meetings)
                .set({
                    status:"active",
                    startedAt:new Date(),
                })
                .where(eq(meetings.id,existingMeeting.id))

            const [existingAgent] = await db
                .select()
                .from(agents)
                .where(eq(agents.id,existingMeeting.agentId))
            
            if(!existingAgent){
                return NextResponse.json(
                    {error:"Agent not found"},
                    {status:404}
                )
            }
            const call = streamVideo.video.call("default",meetingId);
            let realTimeClient:RealtimeClient;
            try{
                realTimeClient = await streamVideo.video.connectOpenAi({
                    call,
                    openAiApiKey:process.env.OPENAI_API_KEY!,
                    agentUserId:existingAgent.id,
                    model:"gpt-realtime",
                })
            } catch (error) {
                console.error("Could not connect the AI agent to the call",{meetingId,error:describeError(error)});
                return NextResponse.json(
                    {error:"Could not connect the agent"},
                    {status:500}
                )
            }
            // This function holds the agent's realtime WebSocket (Stream's edge bridges the audio).
            // Vercel can suspend the function once the response is sent, which leaves the agent
            // silent, so keep the function running until the agent's session ends.
            const agentSession = keepAgentConnected(realTimeClient,call,meetingId);
            // The SDK's default session sends turn_detection: null, which turns OpenAI's turn
            // detection off, so the model never answers on its own. Turn it on, as Stream's AI
            // voice assistant tutorial does.
            realTimeClient.updateSession({
                instructions:existingAgent.instructions,
                turn_detection:{type:"semantic_vad"},
            })
            after(agentSession);
        } else if(eventType === "call.session_participant_left"){
            const event = payload as CallSessionParticipantLeftEvent;
            const meetingId = event.call_cid.split(":")[1];
            if(!meetingId){
                return NextResponse.json(
                    {error:"Missing meetingId"},
                    {status:400}
                )
            }
            const call = streamVideo.video.call("default",meetingId);
            await call.end();
        } else if(eventType === "call.session_ended"){
            const event = payload as CallEndedEvent;
            const meetingId=event.call.custom?.meetingId;
            if(!meetingId){
                return NextResponse.json(
                    {error:"Missing meetingId"},
                    {status:400}
                )
            }
            await db
                .update(meetings)
                .set({
                    status:"processing",
                    endedAt:new Date(),
                })
                .where(and(eq(meetings.id,meetingId),eq(meetings.status,"active")))
        } else if(eventType === "call.transcription_ready"){
            const event = payload as CallTranscriptionReadyEvent;
            const meetingId = event.call_cid.split(":")[1];
            const [updatedMeeting] = await db
                .update(meetings)
                .set({
                    transcriptUrl:event.call_transcription.url,
                })
                .where(eq(meetings.id,meetingId))
                .returning();
            if(!updatedMeeting){
                return NextResponse.json(
                    {error:"Meeting not found"},
                    {status:404}
                )
            }
            await inngest.send({
                name:"meetings/processing",
                data:{
                    meetingId:updatedMeeting.id,
                    transcriptUrl:updatedMeeting.transcriptUrl,
                }
            })
        } else if(eventType === "call.recording_ready"){
            const event = payload as CallRecordingReadyEvent;
            const meetingId = event.call_cid.split(":")[1];
            await db
                .update(meetings)
                .set({
                    recordingUrl:event.call_recording.url,
                })
                .where(eq(meetings.id,meetingId))
        } else if (eventType === "message.new"){
            const event = payload as MessageNewEvent;
            const userId = event.user?.id;
            const channelId = event.channel_id;
            const text = event.message?.text;
            if(!userId || !channelId || !text){
                return NextResponse.json(
                    {error:"Missing required fields"},
                    {status:400}
                )
            }
            const [existingMeeting] = await db
                .select()
                .from(meetings)
                .where(
                    and(
                        eq(meetings.id,channelId),eq(meetings.status,"completed")
                    )
                )
            if(!existingMeeting){
                return NextResponse.json(
                    {error:"Meeting not found"},
                    {status:404}
                )
            }
            const [existingAgent] = await db
                .select()
                .from(agents)
                .where(eq(agents.id,existingMeeting.agentId))
            if(!existingAgent){
                return NextResponse.json(
                    {error:"Agent not found"},
                    {status:404}
                )
            }
            // Answer only the meeting's owner. This also skips the agent's own replies, and keeps
            // anyone else who can post in the channel from reading the summary or the agent's
            // instructions through the bot, or running up OpenAI usage.
            if(userId===existingMeeting.userId){
                const instructions = `
                    You are an AI assistant helping the user revisit a recently completed meeting.
                    Below is a summary of the meeting, generated from the transcript:
                    
                    ${existingMeeting.summary}
                    
                    The following are your original instructions from the live meeting assistant. Please continue to follow these behavioral guidelines as you assist the user:
                    
                    ${existingAgent.instructions}
                    
                    The user may ask questions about the meeting, request clarifications, or ask for follow-up actions.
                    Always base your responses on the meeting summary above.
                    
                    You also have access to the recent conversation history between you and the user. Use the context of previous messages to provide relevant, coherent, and helpful responses. If the user's question refers to something discussed earlier, make sure to take that into account and maintain continuity in the conversation.
                    
                    If the summary does not contain enough information to answer a question, politely let the user know.
                    
                    Be concise, helpful, and focus on providing accurate information from the meeting and the ongoing conversation.
                    `;
                
                // Last 5 messages of the channel (oldest first), as the old watch()+slice(-5) gave.
                const {messages:recentMessages} = await streamChat.chat
                    .channel("messaging",channelId)
                    .getOrCreate({messages:{limit:5}})
                const previousMessages = recentMessages
                    .slice(-5)
                    .filter((msg) => msg.text && msg.text.trim() !== "")
                    .map<ChatCompletionMessageParam>((message) => ({
                        role:message.user?.id === existingAgent.id ? "assistant" : "user",
                        content:message.text || ""
                    }))
                const GPTResponse = await openaiClient.chat.completions.create({
                    messages: [
                        {role:"system", content:instructions},
                        ...previousMessages,
                        {role:"user", content:text}
                    ],
                    model:"gpt-4o"
                })
                const GPTResponseText = GPTResponse.choices[0].message.content;
                if(!GPTResponseText){
                return NextResponse.json(
                    {error:"No response from GPT"},
                    {status:400}
                )
            }
            const avatarUrl = generateAvatarUri({
                seed:existingAgent.name,
                variant:"botttsNeutral"
            })
            // Awaited so the reply is posted before the serverless function returns.
            await streamChat.upsertUsers([
                {
                    id:existingAgent.id,
                    name:existingAgent.name,
                    image:avatarUrl,
                }
            ])
            await streamChat.chat.sendMessage({
                type:"messaging",
                id:channelId,
                message:{
                    text:GPTResponseText,
                    user_id:existingAgent.id,
                }
            })

            }
        }
    return NextResponse.json({status:"ok"})
}

// The agent's session runs after the response, within this route's time limit. Vercel Hobby with
// Fluid compute allows at most 300 s, so on Vercel the agent stays for about 5 minutes.
export const maxDuration = 300;

// End the agent's session a little before maxDuration so it leaves cleanly instead of being cut
// off; the work before the response (database, connecting the agent) takes a few seconds.
const AGENT_SESSION_LIMIT_MS = 280_000;
const CALL_STATE_POLL_MS = 15_000;

// Log only an error's name and message; SDK errors can carry request details.
function describeError(error:unknown){
    return error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
}

// Settles when the agent's realtime socket closes, the call ends or the time limit is reached,
// and disconnects the agent if it is still connected. The counts in the final log show whether
// OpenAI acknowledged the session updates and produced responses.
function keepAgentConnected(realTimeClient:RealtimeClient,call:StreamCall,meetingId:string){
    const startedAt = Date.now();
    let sessionUpdates = 0;
    let responses = 0;
    let finished = false;
    return new Promise<void>((resolve) => {
        const finish = (reason:string) => {
            if(finished){
                return;
            }
            finished = true;
            clearTimeout(limit);
            clearInterval(poll);
            if(realTimeClient.isConnected()){
                realTimeClient.disconnect();
            }
            console.log("AI agent session ended",{
                meetingId,
                reason,
                seconds:Math.round((Date.now()-startedAt)/1000),
                sessionUpdates,
                responses,
            });
            resolve();
        };
        realTimeClient.on("realtime.event",(envelope)=>{
            const {source,event} = envelope as RealtimeEventEnvelope;
            if(source==="server" && event.type==="session.updated"){
                sessionUpdates++;
            } else if(source==="server" && event.type==="response.done"){
                responses++;
            }
        });
        realTimeClient.on("close",()=>finish("realtime socket closed"));
        const limit = setTimeout(()=>finish("time limit"),AGENT_SESSION_LIMIT_MS);
        const poll = setInterval(()=>{
            call.get()
                .then(({call:state})=>{
                    if(state.ended_at || state.session?.ended_at){
                        finish("call ended");
                    }
                })
                .catch((error:unknown)=>{
                    console.warn("Could not read the call state",{meetingId,error:describeError(error)});
                });
        },CALL_STATE_POLL_MS);
        if(!realTimeClient.isConnected()){
            finish("realtime socket closed");
        }
    });
}