import { inject, injectable } from "tsyringe";

import { DialogueCallbacks } from "@spt-aki/callbacks/DialogueCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class DialogStaticRouter extends StaticRouter {
    constructor(@inject("DialogueCallbacks") protected dialogueCallbacks: DialogueCallbacks) {
        super([
            new RouteAction(
                "/client/chatServer/list",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.getChatServerList(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/list",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.getMailDialogList(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/view",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.getMailDialogView(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/info",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.getMailDialogInfo(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/remove",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.removeDialog(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/pin",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.pinDialog(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/unpin",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.unpinDialog(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/read",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.setRead(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/remove",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.removeMail(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/getAllAttachments",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.getAllAttachments(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/msg/send",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.sendMessage(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/mail/dialog/clear",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.clearMail(url, info, sessionID);
                }
            ),
            new RouteAction("/client/friend/list", (url: string, info: any, sessionID: string, output: string): any => {
                return this.dialogueCallbacks.getFriendList(url, info, sessionID);
            }),
            new RouteAction(
                "/client/friend/request/list/outbox",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.listOutbox(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/friend/request/list/inbox",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.listInbox(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/friend/request/send",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.sendFriendRequest(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/friend/request/accept",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.acceptFriendRequest(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/friend/request/cancel",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.cancelFriendRequest(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/friend/delete",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.deleteFriend(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/friend/ignore/set",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.ignoreFriend(url, info, sessionID);
                }
            ),
            new RouteAction(
                "/client/friend/ignore/remove",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.unIgnoreFriend(url, info, sessionID);
                }
            ),
        ]);
    }
}
