import { DialogueCallbacks } from "@spt/callbacks/DialogueCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IAddUserGroupMailRequest } from "@spt/models/eft/dialog/IAddUserGroupMailRequest";
import { IChangeGroupMailOwnerRequest } from "@spt/models/eft/dialog/IChangeGroupMailOwnerRequest";
import { IChatServer } from "@spt/models/eft/dialog/IChatServer";
import { ICreateGroupMailRequest } from "@spt/models/eft/dialog/ICreateGroupMailRequest";
import { IFriendRequestSendResponse } from "@spt/models/eft/dialog/IFriendRequestSendResponse";
import { IGetAllAttachmentsResponse } from "@spt/models/eft/dialog/IGetAllAttachmentsResponse";
import { IGetFriendListDataResponse } from "@spt/models/eft/dialog/IGetFriendListDataResponse";
import { IGetMailDialogViewResponseData } from "@spt/models/eft/dialog/IGetMailDialogViewResponseData";
import { IRemoveUserGroupMailRequest } from "@spt/models/eft/dialog/IRemoveUserGroupMailRequest";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { IDialogueInfo } from "@spt/models/eft/profile/ISptProfile";
import { inject, injectable } from "tsyringe";

@injectable()
export class DialogStaticRouter extends StaticRouter {
    constructor(@inject("DialogueCallbacks") protected dialogueCallbacks: DialogueCallbacks) {
        super([
            new RouteAction(
                "/client/chatServer/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IChatServer[]>> => {
                    return this.dialogueCallbacks.getChatServerList(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IDialogueInfo[]>> => {
                    return this.dialogueCallbacks.getMailDialogList(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/view",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetMailDialogViewResponseData>> => {
                    return this.dialogueCallbacks.getMailDialogView(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/info",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IDialogueInfo>> => {
                    return this.dialogueCallbacks.getMailDialogInfo(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/remove",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.removeDialog(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/pin",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.pinDialog(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/unpin",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.unpinDialog(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/read",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.setRead(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/remove",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.removeMail(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/getAllAttachments",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetAllAttachmentsResponse>> => {
                    return this.dialogueCallbacks.getAllAttachments(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/msg/send",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string>> => {
                    return this.dialogueCallbacks.sendMessage(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/clear",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.clearMail(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/group/create",
                async (
                    url: string,
                    info: ICreateGroupMailRequest,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.createGroupMail(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/group/owner/change",
                async (
                    url: string,
                    info: IChangeGroupMailOwnerRequest,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.changeMailGroupOwner(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/group/users/add",
                async (
                    url: string,
                    info: IAddUserGroupMailRequest,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.addUserToMail(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/mail/dialog/group/users/remove",
                async (
                    url: string,
                    info: IRemoveUserGroupMailRequest,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.removeUserFromMail(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGetFriendListDataResponse>> => {
                    return this.dialogueCallbacks.getFriendList(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/request/list/outbox",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.listOutbox(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/request/list/inbox",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<any[]>> => {
                    return this.dialogueCallbacks.listInbox(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/request/send",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IFriendRequestSendResponse>> => {
                    return this.dialogueCallbacks.sendFriendRequest(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/request/accept-all",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.acceptAllFriendRequests(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/request/accept",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> => {
                    return this.dialogueCallbacks.acceptFriendRequest(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/request/decline",
                (url: string, info: any, sessionID: string, output: string): any => {
                    return this.dialogueCallbacks.declineFriendRequest(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/request/cancel",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<boolean>> => {
                    return this.dialogueCallbacks.cancelFriendRequest(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/delete",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.dialogueCallbacks.deleteFriend(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/ignore/set",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.dialogueCallbacks.ignoreFriend(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/friend/ignore/remove",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.dialogueCallbacks.unIgnoreFriend(url, info, sessionID);
                },
            ),
        ]);
    }
}
