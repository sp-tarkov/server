import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { IMessage, IMessageContentRagfair } from "@spt/models/eft/profile/ISptProfile";
import { IWsChatMessageReceived } from "@spt/models/eft/ws/IWsChatMessageReceived";
import { IWsNotificationEvent } from "@spt/models/eft/ws/IWsNotificationEvent";
import { IWsRagfairOfferSold } from "@spt/models/eft/ws/IWsRagfairOfferSold";
import { NotificationEventType } from "@spt/models/enums/NotificationEventType";
import { inject, injectable } from "tsyringe";

@injectable()
export class NotifierHelper {
    /**
     * The default notification sent when waiting times out.
     */
    protected defaultNotification: IWsNotificationEvent = { type: NotificationEventType.PING, eventId: "ping" };

    constructor(@inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper) {}

    public getDefaultNotification(): IWsNotificationEvent {
        return this.defaultNotification;
    }

    /**
     * Create a new notification that displays the "Your offer was sold!" prompt and removes sold offer from "My Offers" on clientside
     * @param dialogueMessage Message from dialog that was sent
     * @param ragfairData Ragfair data to attach to notification
     * @returns
     */
    public createRagfairOfferSoldNotification(
        dialogueMessage: IMessage,
        ragfairData: IMessageContentRagfair,
    ): IWsRagfairOfferSold {
        return {
            type: NotificationEventType.RAGFAIR_OFFER_SOLD,
            eventId: dialogueMessage._id,
            ...ragfairData,
        };
    }

    /**
     * Create a new notification with the specified dialogueMessage object
     * @param dialogueMessage
     * @returns
     */
    public createNewMessageNotification(dialogueMessage: IMessage): IWsChatMessageReceived {
        return {
            type: NotificationEventType.CHAT_MESSAGE_RECEIVED,
            eventId: dialogueMessage._id,
            dialogId: dialogueMessage.uid,
            message: dialogueMessage,
        };
    }

    public getWebSocketServer(sessionID: string): string {
        return `${this.httpServerHelper.getWebsocketUrl()}/notifierServer/getwebsocket/${sessionID}`;
    }
}
