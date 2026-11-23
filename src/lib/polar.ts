import { createPolarCore } from "@polar-sh/sdk/2026-10";

// Polar SDK 1.x: a core client plus standalone service functions
// (e.g. getStateExternalCustomers(polarClient)(id)). Still on the Polar sandbox.
export const polarClient = createPolarCore({
    accessToken:process.env.POLAR_ACCESS_TOKEN!,
    environment:"sandbox",
})
