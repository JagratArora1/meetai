import { createTRPCRouter, premiumProcedure, protectedProcedure } from "@/trpc/init";
import { db } from "@/db";
import { agents, meetings, user } from "@/db/schema";
import z from "zod";
import { and, count, desc, eq, getTableColumns, ilike, inArray, sql } from "drizzle-orm";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/constants";
import { TRPCError } from "@trpc/server";
import { meetingsInsertSchema, meetingsUpdateSchema } from "../schemas";
import { MeetingStatus, StreamTranscriptItem } from "../types";
import { streamVideo } from "@/lib/stream-video";
import { generateAvatarUri } from "@/lib/avatar";
import JSONL from "jsonl-parse-stringify";
import { streamChat } from "@/lib/stream-chat";

// Signed-in users get Stream's plain "user" role on both Stream Video and Stream Chat. The
// "admin" role they used to get is app-wide: with it, any user's token could read every chat
// channel and act as an admin on every call. A user reaches their own meeting through
// membership instead: create() makes them a member of the meeting's call and chat channel.
const streamUser = (user:{id:string; name:string; image?:string | null}) => ({
    id:user.id,
    name:user.name,
    role:"user",
    image:user.image ?? generateAvatarUri({seed:user.name,variant:"initials"}),
});

export const meetingsRouter = createTRPCRouter({
    generateChatToken:protectedProcedure.mutation(async({ctx}) => {
        // Expiring (1h) token; the chat client calls this provider again to refresh it.
        const token = streamChat.generateUserToken({user_id:ctx.auth.user.id})
        await streamChat.upsertUsers([
            {
                id:ctx.auth.user.id,
                role:"user",
            }
        ])
        return token;
    }),
    getTranscript:protectedProcedure
        .input(z.object({id:z.string()}))
        .query(async ({input,ctx}) => {
            const [existingMeeting] = await db
                .select()
                .from(meetings)
                .where(
                    and(
                        eq(meetings.id,input.id),eq(meetings.userId, ctx.auth.user.id)
                    )
                )
            if(!existingMeeting){
                    throw new TRPCError({
                        code:"NOT_FOUND",
                        message:"Meeting not found",
                    });
                }

            if(!existingMeeting.transcriptUrl){
                return [];
            }

            const transcript = await fetch(existingMeeting.transcriptUrl)
                .then((res) => res.text())
                .then((text) => JSONL.parse<StreamTranscriptItem>(text))
                .catch(() =>{
                    return [];
                })
            const speakerIds = [
                ...new Set(transcript.map((item) => item.speaker_id))
            ]

            const userSpeakers = await db
                .select()
                .from(user)
                .where(inArray(user.id,speakerIds))
                .then((users) => 
                    users.map((user) => ({
                        ...user,
                        image:
                            user.image ??
                            generateAvatarUri({seed:user.name , variant:"initials"})
                    })))
            const agentSpeakers = await db
                .select()
                .from(agents)
                .where(inArray(agents.id,speakerIds))
                .then((agents) => 
                    agents.map((agent) => ({
                        ...agent,
                        // Agents have no image column; `user.image` here was the Drizzle column
                        // object, which made the response fail to serialize.
                        image:generateAvatarUri({seed:agent.name , variant:"botttsNeutral"})
                    })))
            
            const speakers = [...userSpeakers,...agentSpeakers]
            const transcriptWithSpeakers = transcript.map((item) => {
                const speaker = speakers.find(
                    (speaker) => speaker.id === item.speaker_id
                )
                if(!speaker) {
                    return {
                        ...item,
                        user:{
                            name:"Unknown",
                            image: generateAvatarUri({
                                seed:"Unknown",
                                variant:"initials"
                            })
                        }
                    }
                }
                return {
                    ...item,
                    user:{
                        name:speaker.name,
                        image:speaker.image
                    }
                }
            })
            return transcriptWithSpeakers;
        }),
    generateToken:protectedProcedure.mutation(async ({ctx}) => {
        await streamVideo.upsertUsers([streamUser(ctx.auth.user)])
        const expirationTime = Math.floor(Date.now()/1000) + 3600;
        const issuedAt = Math.floor(Date.now()/1000) -60;
        const token = streamVideo.generateUserToken({
            user_id:ctx.auth.user.id,
            exp:expirationTime,
            iat:issuedAt,
        });
        return token;
    }),
    endCall:protectedProcedure
        .input(z.object({id:z.string()}))
        .mutation(async ({ctx,input}) => {
            // Ending a call needs Stream's end-call permission, which the plain "user" role may
            // not have. End it here instead, with the server key, and only for the meeting's owner.
            const [existingMeeting] = await db
                .select({id:meetings.id})
                .from(meetings)
                .where(
                    and(
                        eq(meetings.id,input.id),
                        eq(meetings.userId,ctx.auth.user.id),
                    ),
                );
            if(!existingMeeting){
                throw new TRPCError({
                    code:"NOT_FOUND",
                    message:"Meeting not found",
                });
            }
            await streamVideo.video.call("default",existingMeeting.id).end();
            return {id:existingMeeting.id};
        }),
    remove:protectedProcedure
            .input(z.object({id:z.string()}))
            .mutation(async({ctx,input}) => {
                const [removedMeeting] = await db 
                    .delete(meetings)
                    .where(
                        and(
                            eq(meetings.id ,input.id),
                            eq(meetings.userId, ctx.auth.user.id),
                        ),
                    )
                    .returning();
                if(!removedMeeting){
                    throw new TRPCError({
                        code:"NOT_FOUND",
                        message:"Meeting not found",
                    });
                }
                return removedMeeting;
            }),
    update:protectedProcedure
            .input(meetingsUpdateSchema)
            .mutation(async({ctx,input}) => {
                // The agent joins the call with its instructions, so it must be one of the
                // caller's own agents, not any agent whose id they send.
                const [ownAgent] = await db
                    .select({id:agents.id})
                    .from(agents)
                    .where(
                        and(
                            eq(agents.id,input.agentId),
                            eq(agents.userId,ctx.auth.user.id),
                        ),
                    );
                if(!ownAgent){
                    throw new TRPCError({
                        code:"NOT_FOUND",
                        message:"Agent not found",
                    });
                }
                const [updatedMeeting] = await db 
                    .update(meetings)
                    .set(input)
                    .where(
                        and(
                            eq(meetings.id ,input.id),
                            eq(meetings.userId, ctx.auth.user.id),
                        ),
                    )
                    .returning();
                if(!updatedMeeting){
                    throw new TRPCError({
                        code:"NOT_FOUND",
                        message:"Meeting not found",
                    });
                }
                return updatedMeeting;
            }),
    create:premiumProcedure("meetings").input(meetingsInsertSchema).mutation(async({input,ctx}) => {
            // Check the agent belongs to the caller before creating the meeting and its call.
            const [existingAgent] = await db
                .select()
                .from(agents)
                .where(
                    and(
                        eq(agents.id,input.agentId),
                        eq(agents.userId,ctx.auth.user.id),
                    ),
                );

            if(!existingAgent){
                throw new TRPCError({
                    code:"NOT_FOUND",
                    message:"Agent not found",
                })
            }

            const [createdMeeting] = await db
            .insert(meetings)
            .values({
                ...input,
                userId: ctx.auth.user.id,
            })
            .returning();
            // Call members must already exist in Stream, and the owner may not have joined a
            // call yet, so upsert them first.
            await streamVideo.upsertUsers([streamUser(ctx.auth.user)]);
            const call = streamVideo.video.call("default",createdMeeting.id);
            await call.create({
                data:{
                    created_by_id:ctx.auth.user.id,
                    // The owner is the call's host. A member's role applies to this call only,
                    // unlike the user's app-wide Stream role.
                    members:[{user_id:ctx.auth.user.id,role:"host"}],
                    custom:{
                        meetingId:createdMeeting.id,
                        meetingName:createdMeeting.name,
                    },
                    settings_override:{
                        transcription:{
                            language:"en",
                            mode:"auto-on",
                            closed_caption_mode:"auto-on"
                        },
                        recording:{
                            mode:"auto-on",
                            quality:"1080p"
                        },
                    },
                },
            });

            await streamVideo.upsertUsers([
                {
                    id:existingAgent.id,
                    name:existingAgent.name,
                    role:"user",
                    image:generateAvatarUri({
                        seed:existingAgent.name,
                        variant:"botttsNeutral",
                    })
                }
            ])

            // The post-meeting chat channel, with the owner as its creator and only member, so
            // nobody else can create messaging:<meetingId> first and lock the owner out. The
            // agent needs no membership: its replies are sent with the server key. Best effort:
            // if this fails, the chat UI still creates the channel, with the owner as its
            // member, the first time the owner opens it.
            try{
                await streamChat.upsertUsers([streamUser(ctx.auth.user)]);
                await streamChat.chat.channel("messaging",createdMeeting.id).getOrCreate({
                    data:{
                        created_by_id:ctx.auth.user.id,
                        members:[{user_id:ctx.auth.user.id}],
                    },
                });
            } catch (error) {
                console.warn("Could not create the meeting's chat channel",{
                    meetingId:createdMeeting.id,
                    error:error instanceof Error ? error.message : "unknown error",
                });
            }
            return createdMeeting;
        }),
    getOne: protectedProcedure.input(z.object({id:z.string()})).query(async ({ input,ctx }) => {
        const [existingMeeting] = await db.select({
            ...getTableColumns(meetings),
            agent:agents,
            duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
        })
        .from(meetings)
        .innerJoin(agents,eq(meetings.agentId,agents.id))
        .where(
            and(
                eq(meetings.id,input.id),
                eq(meetings.userId,ctx.auth.user.id)
            )
        );
        if(!existingMeeting){
            throw new TRPCError({code:"NOT_FOUND",message:"Meeting Not Found"})
        }
        return existingMeeting;
    }),
    getMany: protectedProcedure
        .input(z.object({
            page:z.number().int().min(1).default(DEFAULT_PAGE),
            pageSize:z.number().int().min(MIN_PAGE_SIZE).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
            search:z.string().nullish(),
            agentId:z.string().nullish(),
            status:z
                .enum([
                    MeetingStatus.Upcoming,
                    MeetingStatus.Active,
                    MeetingStatus.Completed,
                    MeetingStatus.Processing,
                    MeetingStatus.Cancelled,
                ])
                .nullish(),
        }))
        .query(async ({input,ctx}) => {
        const {search,page,pageSize,status,agentId} = input;
        const data = await db
        .select({
            ...getTableColumns(meetings),
            agent:agents,
            duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
        })
        .from(meetings)
        .innerJoin(agents,eq(meetings.agentId ,agents.id))
        .where(
            and(
                eq(meetings.userId, ctx.auth.user.id),
                search ? ilike(meetings.name, `%${search}%`) : undefined,
                status ? eq(meetings.status,status) : undefined,
                agentId ? eq(meetings.agentId,agentId) : undefined,
            )
        )
        .orderBy(desc(meetings.createdAt),desc(meetings.id))
        .limit(pageSize)
        .offset((page-1)*pageSize)

        const [total] = await db
            .select({count: count()})
            .from(meetings)
            .innerJoin(agents,eq(meetings.agentId ,agents.id))
            .where(
            and(
                eq(meetings.userId, ctx.auth.user.id),
                search ? ilike(meetings.name, `%${search}%`) : undefined,
                status ? eq(meetings.status,status) : undefined,
                agentId ? eq(meetings.agentId,agentId) : undefined,
            )
        );
        const totalPages = Math.ceil(total.count/pageSize);

        return{
            items:data,
            total:total.count,
            totalPages,
        };
    }),
});