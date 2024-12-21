import type { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import type { IFriendRequestData } from "@spt/models/eft/dialog/IFriendRequestData";
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
import type { ISendMessageRequest } from "@spt/models/eft/dialog/ISendMessageRequest";
import type { ISetDialogReadRequestData } from "@spt/models/eft/dialog/ISetDialogReadRequestData";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import type { IDialogueInfo } from "@spt/models/eft/profile/ISptProfile";

export interface IDialogueCallbacks {
    getFriendList(
        url: string,
        info: IEmptyRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetFriendListDataResponse>;
    getChatServerList(url: string, info: IGetChatServerListRequestData, sessionID: string): IGetBodyResponseData<any[]>;
    getMailDialogList(
        url: string,
        info: IGetMailDialogListRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IDialogueInfo[]>;
    getMailDialogView(
        url: string,
        info: IGetMailDialogViewRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetMailDialogViewResponseData>;
    getMailDialogInfo(url: string, info: IGetMailDialogInfoRequestData, sessionID: string): IGetBodyResponseData<any>;
    removeDialog(url: string, info: IRemoveDialogRequestData, sessionID: string): IGetBodyResponseData<any[]>;
    pinDialog(url: string, info: IPinDialogRequestData, sessionID: string): IGetBodyResponseData<any[]>;
    unpinDialog(url: string, info: IPinDialogRequestData, sessionID: string): IGetBodyResponseData<any[]>;
    setRead(url: string, info: ISetDialogReadRequestData, sessionID: string): IGetBodyResponseData<any[]>;
    getAllAttachments(
        url: string,
        info: IGetAllAttachmentsRequestData,
        sessionID: string,
    ): IGetBodyResponseData<IGetAllAttachmentsResponse>;
    listOutbox(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<any[]>;
    listInbox(url: string, info: IEmptyRequestData, sessionID: string): IGetBodyResponseData<any[]>;
    sendFriendRequest(url: string, request: IFriendRequestData, sessionID: string): INullResponseData;
    sendMessage(url: string, request: ISendMessageRequest, sessionID: string): IGetBodyResponseData<number>;
    update(): boolean;
}
