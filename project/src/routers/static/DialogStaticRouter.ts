import { inject, injectable } from "tsyringe";

import { DialogueCallbacks } from "../../callbacks/DialogueCallbacks";
import { RouteAction, StaticRouter } from "../../di/Router";

@injectable()
export class DialogStaticRouter extends StaticRouter 
{
    constructor(
        @inject("DialogueCallbacks") protected dialogueCallbacks: DialogueCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/client/chatServer/list",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.getChatServerList(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/list",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.getMailDialogList(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/view",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.getMailDialogView(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/info",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.getMailDialogInfo(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/remove",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.removeDialog(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/pin",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.pinDialog(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/unpin",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.unpinDialog(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/read",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.setRead(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/remove",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.removeMail(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/getAllAttachments",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.getAllAttachments(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/msg/send",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.sendMessage(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/mail/dialog/clear",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.clearMail(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/friend/list",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.getFriendList(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/friend/request/list/outbox",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.listOutbox(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/friend/request/list/inbox",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.listInbox(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/friend/request/send",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.sendFriendRequest(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/friend/delete",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dialogueCallbacks.deleteFriend(url, info, sessionID);
                    }
                )
            ]
        );
    }
}