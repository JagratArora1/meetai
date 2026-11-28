import {z} from 'zod';

const AGENT_NAME_MAX_LENGTH = 100;
const AGENT_INSTRUCTIONS_MAX_LENGTH = 4000;

export const agentsInsertSchema = z.object({
    name: z.string()
        .min(1, {message:"Name is required"})
        .max(AGENT_NAME_MAX_LENGTH, {message:`Name must be at most ${AGENT_NAME_MAX_LENGTH} characters`}),
    instructions: z.string()
        .min(1, {message:"Instructions is required"})
        .max(AGENT_INSTRUCTIONS_MAX_LENGTH, {message:`Instructions must be at most ${AGENT_INSTRUCTIONS_MAX_LENGTH} characters`}),
})

export const agentsUpdateSchema = agentsInsertSchema.extend({
    id: z.string().min(1,{message:"Id is required"}),
})