import { DialogueController } from "@spt/controllers/DialogueController";
import type { OnUpdate } from "@spt/di/OnUpdate";
import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IUIDRequestData } from "@spt/models/eft/common/request/IUIDRequestData";
import type {
    IAcceptFriendRequestData,
    ICancelFriendRequestData,
    IDeclineFriendRequestData,
} from "@spt/models/eft/dialog/IAcceptFriendRequestData";
import type { IAddUserGroupMailRequest } from "@spt/models/eft/dialog/IAddUserGroupMailRequest";
import type { IChangeGroupMailOwnerRequest } from "@spt/models/eft/dialog/IChangeGroupMailOwnerRequest";
import type { IChatServer } from "@spt/models/eft/dialog/IChatServer";
import type { IClearMailMessageRequest } from "@spt/models/eft/dialog/IClearMailMessageRequest";
import type { ICreateGroupMailRequest } from "@spt/models/eft/dialog/ICreateGroupMailRequest";
import type { IDeleteFriendRequest } from "@spt/models/eft/dialog/IDeleteFriendRequest";
import type { IFriendRequestData } from "@spt/models/eft/dialog/IFriendRequestData";
import type { IFriendRequestSendResponse } from "@spt/models/eft/dialog/IFriendRequestSendResponse";
import type { IGetAllAttachmentsRequestData } from "@spt/models/eft/dialog/IGetAllAttachmentsRequestData";
import type { IGetAllAttachmentsResponse } from "@spt/models/eft/dialog/IGetAllAttachmentsResponse";
import type { IGetChatServerListRequestData } from "@spt/models/eft/dialog/IGetChatServerListRequestData";
import type { IGetFriendListDataResponse } from "@spt/models/eft/dialog/IGetFriendListDataResponse";
import type { IGetMailDialogInfoRequestData } from "@spt/models/eft/dialog/IGetMailDialogInfoRequestData";
import type { IGetMailDialogListRequestData } from "@spt/models/eft/dialog/IGetMailDialogListRequestData";
import type { IGetMailDialogViewRequestData } from "@spt/models/eft/dialog/IGetMailDialogViewRequestData";
import type { IGetMailDialogViewResponseData } from "@spt/models/eft/dialog/IGetMailDialogViewResponseData";
import type { IPinDialogRequestData } from "@spt/models/eft/dialog/IPinDialogRequestData";
import type { IRemoveDialogRequestData } from "@spt/models/eft/dialog/IRemoveDialogRequestData";
import type { IRemoveMailMessageRequest } from "@spt/models/eft/dialog/IRemoveMailMessageRequest";
import type { IRemoveUserGroupMailRequest } from "@spt/models/eft/dialog/IRemoveUserGroupMailRequest";
import type { ISendMessageRequest } from "@spt/models/eft/dialog/ISendMessageRequest";
import type { ISetDialogReadRequestData } from "@spt/models/eft/dialog/ISetDialogReadRequestData";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import type { IDialogueInfo } from "@spt/models/eft/profile/ISptProfile";
import { HashUtil } from "@spt/utils/HashUtil";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class DialogueCallbacks implements OnUpdate {
    constructor(
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("DialogueController") protected dialogueController: DialogueController,
    ) {}

    /**
     * Handle client/friend/list
     * @returns IGetFriendListDataResponse
     */
    public getFriendList(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetFriendListDataResponse> {
        return this.httpResponse.getBody(this.dialogueController.getFriendList(sessionID));
    }

    /**
     * Handle client/chatServer/list
     * @returns IChatServer[]
     */
    public getChatServerList(
        url: string,
        info: IGetChatServerListRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IChatServer[]> {
        const chatServer: IChatServer = {
            _id: this.hashUtil.generate(),
            RegistrationId: 20,
            DateTime: this.timeUtil.getTimestamp(),
            IsDeveloper: true,
            Regions: ["EUR"],
            VersionId: "bgkidft87ddd",
            Ip: "",
            Port: 0,
            Chats: [{ _id: "0", Members: 0 }],
        };

        return this.httpResponse.getBody([chatServer]);
    }

    /** Handle client/mail/dialog/list */
    public getMailDialogList(
        url: string,
        info: IGetMailDialogListRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IDialogueInfo[]> {
        return this.httpResponse.getBody(this.dialogueController.generateDialogueList(sessionID), 0, undefined, false);
    }

    /** Handle client/mail/dialog/view */
    public getMailDialogView(
        url: string,
        info: IGetMailDialogViewRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetMailDialogViewResponseData> {
        return this.httpResponse.getBody(
            this.dialogueController.generateDialogueView(info, sessionID),
            0,
            undefined,
            false,
        );
    }

    /** Handle client/mail/dialog/info */
    public getMailDialogInfo(
        url: string,
        info: IGetMailDialogInfoRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IDialogueInfo> {
        return this.httpResponse.getBody(this.dialogueController.getDialogueInfo(info.dialogId, sessionID));
    }

    /** Handle client/mail/dialog/remove */
    public removeDialog(url: string, info: IRemoveDialogRequestData, sessionID: string): IGetBodyResponseData<any[]> {
        this.dialogueController.removeDialogue(info.dialogId, sessionID);
        return this.httpResponse.emptyArrayResponse();
    }

    /** Handle client/mail/dialog/pin */
    public pinDialog(url: string, info: IPinDialogRequestData, sessionID: string): IGetBodyResponseData<any[]> {
        this.dialogueController.setDialoguePin(info.dialogId, true, sessionID);
        return this.httpResponse.emptyArrayResponse();
    }

    /** Handle client/mail/dialog/unpin */
    public unpinDialog(url: string, info: IPinDialogRequestData, sessionID: string): IGetBodyResponseData<any[]> {
        this.dialogueController.setDialoguePin(info.dialogId, false, sessionID);
        return this.httpResponse.emptyArrayResponse();
    }

    /** Handle client/mail/dialog/read */
    public setRead(url: string, info: ISetDialogReadRequestData, sessionID: string): IGetBodyResponseData<any[]> {
        this.dialogueController.setRead(info.dialogs, sessionID);
        return this.httpResponse.emptyArrayResponse();
    }

    /**
     * Handle client/mail/dialog/getAllAttachments
     * @returns IGetAllAttachmentsResponse
     */
    public getAllAttachments(
        url: string,
        info: IGetAllAttachmentsRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetAllAttachmentsResponse | undefined> {
        return this.httpResponse.getBody(this.dialogueController.getAllAttachments(info.dialogId, sessionID));
    }

    /** Handle client/mail/msg/send */
    public sendMessage(url: string, request: ISendMessageRequest, sessionID: string): IGetBodyResponseData<string> {
        return this.httpResponse.getBody(this.dialogueController.sendMessage(sessionID, request));
    }

    /** Handle client/friend/request/list/outbox */
    public listOutbox(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<any[]> {
        return this.httpResponse.getBody([]);
    }

    /**
     * Handle client/friend/request/list/inbox
     */
    public listInbox(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<any[]> {
        return this.httpResponse.getBody([]);
    }

    /**
     * Handle client/friend/request/send
     */
    public sendFriendRequest(
        url: string,
        request: IFriendRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IFriendRequestSendResponse> {
        return this.httpResponse.getBody(this.dialogueController.sendFriendRequest(sessionID, request));
    }

    /**
     * Handle client/friend/request/accept-all
     */
    public acceptAllFriendRequests(url: string, request: IEmptyRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle client/friend/request/accept
     */
    public acceptFriendRequest(
        url: string,
        request: IAcceptFriendRequestData,
        sessionID: string,
    ): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /**
     * Handle client/friend/request/decline
     */
    public declineFriendRequest(
        url: string,
        request: IDeclineFriendRequestData,
        sessionID: string,
    ): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /**
     * Handle client/friend/request/cancel
     */
    public cancelFriendRequest(
        url: string,
        request: ICancelFriendRequestData,
        sessionID: string,
    ): IGetBodyResponseData<boolean> {
        return this.httpResponse.getBody(true);
    }

    /** Handle client/friend/delete */
    public deleteFriend(url: string, request: IDeleteFriendRequest, sessionID: string): INullResponseData {
        this.dialogueController.deleteFriend(sessionID, request);
        return this.httpResponse.nullResponse();
    }

    /** Handle client/friend/ignore/set */
    public ignoreFriend(url: string, request: IUIDRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    /** Handle client/friend/ignore/remove */
    public unIgnoreFriend(url: string, request: IUIDRequestData, sessionID: string): INullResponseData {
        return this.httpResponse.nullResponse();
    }

    public clearMail(url: string, request: IClearMailMessageRequest, sessionID: string): IGetBodyResponseData<any[]> {
        return this.httpResponse.emptyArrayResponse();
    }

    public removeMail(url: string, request: IRemoveMailMessageRequest, sessionID: string): IGetBodyResponseData<any[]> {
        return this.httpResponse.emptyArrayResponse();
    }

    public createGroupMail(url: string, info: ICreateGroupMailRequest, sessionID: string): IGetBodyResponseData<any[]> {
        return this.httpResponse.emptyArrayResponse();
    }

    public changeMailGroupOwner(
        url: string,
        info: IChangeGroupMailOwnerRequest,
        sessionID: string,
    ): IGetBodyResponseData<any[]> {
        throw new Error("Method not implemented.");
    }

    public addUserToMail(url: string, info: IAddUserGroupMailRequest, sessionID: string): IGetBodyResponseData<any[]> {
        throw new Error("Method not implemented.");
    }

    public removeUserFromMail(
        url: string,
        info: IRemoveUserGroupMailRequest,
        sessionID: string,
    ): IGetBodyResponseData<any[]> {
        throw new Error("Method not implemented.");
    }

    public async onUpdate(timeSinceLastRun: number): Promise<boolean> {
        this.dialogueController.update();
        return true;
    }

    public getRoute(): string {
        return "spt-dialogue";
    }
}
