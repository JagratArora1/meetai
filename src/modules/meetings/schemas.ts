import {z} from 'zod';

const MEETING_NAME_MAX_LENGTH = 100;

export const meetingsInsertSchema = z.object({
    name: z.string()
        .min(1, {message:"Name is required"})
        .max(MEETING_NAME_MAX_LENGTH, {message:`Name must be at most ${MEETING_NAME_MAX_LENGTH} characters`}),
    agentId: z.string().min(1, {message:"Agent is required"}),
})

export const meetingsUpdateSchema = meetingsInsertSchema.extend({
    id: z.string().min(1,{message:"Id is required"}),
})