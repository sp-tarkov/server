import {IUserDialogInfo} from "@spt-aki/models/eft/profile/IAkiProfile";
import {ISendMessageRequest} from "@spt-aki/models/eft/dialog/ISendMessageRequest";

export interface IDialogueChatBot {
    getChatBot(): IUserDialogInfo;
    handleMessage(sessionId: string, request: ISendMessageRequest): string;
}
