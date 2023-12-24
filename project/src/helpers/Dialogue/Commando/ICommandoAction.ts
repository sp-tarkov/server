import {IUserDialogInfo} from "@spt-aki/models/eft/profile/IAkiProfile";
import {ISendMessageRequest} from "@spt-aki/models/eft/dialog/ISendMessageRequest";

export interface ICommandoAction
{
    handle(commandHandler: IUserDialogInfo, sessionId: string, request: ISendMessageRequest): string;
}
