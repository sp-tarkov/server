import { ISendMessageRequest } from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import { IUserDialogInfo } from "@spt-aki/models/eft/profile/IAkiProfile";

export interface ICommandoAction
{
    handle(commandHandler: IUserDialogInfo, sessionId: string, request: ISendMessageRequest): string;
}
