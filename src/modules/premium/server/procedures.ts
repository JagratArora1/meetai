import { getStateExternalCustomers } from "@polar-sh/sdk/2026-10/services/customers";
import { getProducts, listProducts } from "@polar-sh/sdk/2026-10/services/products";
import { polarClient } from "@/lib/polar";
import { createTRPCRouter,protectedProcedure } from "@/trpc/init";
import { db } from "@/db";
import { agents,meetings } from "@/db/schema";
import { count,eq } from "drizzle-orm";

export const premiumRouter = createTRPCRouter({
    getCurrentSubscription:protectedProcedure.query(async({ctx}) => {
        const customer = await getStateExternalCustomers(polarClient)(ctx.auth.user.id)
        const subscription = customer.active_subscriptions[0];
        if(!subscription) return null;
        const product = await getProducts(polarClient)(subscription.product_id)
        return product;
    }),
    getProducts:protectedProcedure.query(async() => {
        const products = await listProducts(polarClient)({
            is_archived:false,
            is_recurring:true,
            sorting:["price_amount"]
        })
        return products.items;
    }),
    getFreeUsage:protectedProcedure.query(async({ctx})=> {
        const customer = await getStateExternalCustomers(polarClient)(ctx.auth.user.id)
        const subscription = customer.active_subscriptions[0];
        if(subscription) return null;
        const [userMeetings] = await db
            .select({
                count:count(meetings.id)
            })
            .from(meetings)
            .where(eq(meetings.userId,ctx.auth.user.id))
        const [userAgents] = await db
            .select({
                count:count(agents.id)
            })
            .from(agents)
            .where(eq(agents.userId,ctx.auth.user.id))
        return {
            meetingCount:userMeetings.count,
            agentCount:userAgents.count,
        };
    })
})