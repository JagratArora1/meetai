import { useState } from "react";
import { StreamTheme,useCall } from "@stream-io/video-react-sdk";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props{
    meetingName:string;
}

export const CallUI = ({meetingName}:Props) => {
    const call = useCall();
    const trpc = useTRPC();
    const {mutate:endCall} = useMutation(
        trpc.meetings.endCall.mutationOptions()
    )
    const [show,setShow] = useState<"lobby" | "call" | "ended">("lobby");
    const handleJoin = async () => {
        if(!call) return;
        await call.join();
        setShow("call");
    }
    const handleLeave = () => {
        if(!call) return;
        // CallControls has already left the call. End it for everyone, the agent included, on
        // the server: this Stream user has the plain "user" role, which may not be allowed to
        // end calls. The call id is the meeting id.
        endCall({id:call.id});
        setShow("ended")
    }
    return(
        <StreamTheme className="h-full">
            {show === "lobby" && <CallLobby onJoin={handleJoin} />}
            {show === "call" && <CallActive onLeave={handleLeave} meetingName={meetingName} />}
            {show === "ended" && <CallEnded />}
        </StreamTheme>
    )
}