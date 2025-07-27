"use client";
import { ErrorState } from "@/components/error-state";

const ErrorPage = () => {
    return(
        <ErrorState
            title="Error loading agents"
            description="There was an error while trying to load the agents. Please try again later."
        />
    )
}
export default ErrorPage;