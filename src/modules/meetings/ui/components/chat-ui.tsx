import { useEffect,useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Channel as StreamChannel } from "stream-chat";
import {
    Channel,
    Chat,
    MessageActions,
    MessageComposer,
    MessageList,
    WithComponents,
    defaultMessageActionSet,
    useCreateChatClient,
} from "stream-chat-react";
import { useTRPC } from "@/trpc/client";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import "stream-chat-react/dist/css/index.css";

// stream-chat-react v15 only opens threads inside its ChatView workspace layout, which this
// single-channel chat doesn't use, so drop the "reply in thread" action rather than show a no-op.
const chatMessageActionSet = defaultMessageActionSet.filter(
    (action) => !("type" in action) || action.type !== "reply"
);
const ChatMessageActions = () => <MessageActions messageActionSet={chatMessageActionSet} />;

interface ChatUIProps {
    meetingId:string;
    meetingName:string;
    userId:string;
    userName:string;
    userImage:string | undefined;
}

export const ChatUI = ({
    meetingId,
    userId,
    userName,
    userImage,
}:ChatUIProps) => {
    const trpc = useTRPC();
    const {mutateAsync: generateChatToken} = useMutation(
        trpc.meetings.generateChatToken.mutationOptions(),
    )
    const client = useCreateChatClient({
        apiKey:process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY!,
        tokenOrProvider:generateChatToken,
        userData:{
            id:userId,
            name:userName,
            image:userImage,
        }
    })
    const [channel,setChannel] = useState<StreamChannel>();
    const [failed,setFailed] = useState(false);
    useEffect(() => {
        if(!client) return;
        const _channel = client.channel("messaging",meetingId,{
            members:[{user_id:userId}]
        })
        let active = true;
        // v15's <Channel> no longer watches the channel itself (v13's did on mount), so create
        // or load it here and subscribe to its events, including the agent's replies.
        _channel.watch().then(
            () => { if(active) setChannel(_channel); },
            () => { if(active) setFailed(true); },
        )
        return () => {
            active = false;
            _channel.stopWatching().catch(() => {});
        }
    },[client,meetingId,userId])
    if(failed){
        return(
            <ErrorState
                title="Error loading chat"
                description="Please try again later"
            />
        )
    }
    if(!client || !channel){
        return(
            <LoadingState
                title="Loading Chat"
                description="This may take a few seconds"
            />
        )
    }
    return(
        <div className="bg-white rounded-lg border overflow-hidden">
            <Chat client={client}>
                <WithComponents overrides={{MessageActions:ChatMessageActions}}>
                    <Channel channel={channel}>
                        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-23rem)] border-b">
                            <MessageList/>
                        </div>
                        <MessageComposer/>
                    </Channel>
                </WithComponents>
            </Chat>
        </div>
    )
}
