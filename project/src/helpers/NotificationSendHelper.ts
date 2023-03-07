import { inject, injectable } from "tsyringe";

import { INotification } from "../models/eft/notifier/INotifier";
import { Dialogue, IUserDialogInfo, Message } from "../models/eft/profile/IAkiProfile";
import { MessageType } from "../models/enums/MessageType";
import { SaveServer } from "../servers/SaveServer";
import { WebSocketServer } from "../servers/WebSocketServer";
import { NotificationService } from "../services/NotificationService";
import { HashUtil } from "../utils/HashUtil";

@injectable()
export class NotificationSendHelper
{
    constructor(
        @inject("WebSocketServer") protected webSocketServer: WebSocketServer,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("NotificationService") protected notificationService: NotificationService
    )
    {}

    /**
     * Send notification message to the appropriate channel
     * @param sessionID 
     * @param notificationMessage 
     */
    public sendMessage(sessionID: string, notificationMessage: INotification): void
    {
        if (this.webSocketServer.isConnectionWebSocket(sessionID))
        {
            this.webSocketServer.sendMessage(sessionID, notificationMessage);
        }
        else
        {
            this.notificationService.add(sessionID, notificationMessage);
        }
    }

    /**
     * Send a message directly to the player
     * @param sessionId Session id
     * @param author UID of sender
     * @param messageText Text to send player
     */
    public sendMessageToPlayer(sessionId: string, senderDetails: IUserDialogInfo, messageText: string, messageType: MessageType): void
    {
        const dialog = this.getDialog(sessionId, messageType, senderDetails);

        dialog.new += 1;
        const message: Message = {
            _id: this.hashUtil.generate(),
            uid: dialog._id,
            type: messageType,
            dt: Math.round(Date.now() / 1000),
            text: messageText,
            templateId: undefined,
            hasRewards: undefined,
            rewardCollected: undefined,
            items: undefined
        };
        dialog.messages.push(message);

        const notification: INotification = {
            type: "new_message",
            eventId: message._id,
            dialogId: message.uid,
            message: message
        };
        this.sendMessage(sessionId, notification);
    }

    protected getDialog(sessionId: string, messageType: MessageType, senderDetails: IUserDialogInfo): Dialogue
    {
        const dialogueData = this.saveServer.getProfile(sessionId).dialogues;
        const isNewDialogue = !(senderDetails.info.Nickname in dialogueData);
        let dialogue: Dialogue = dialogueData[senderDetails.info.Nickname];

        if (isNewDialogue)
        {
            dialogue = {
                _id: senderDetails.info.Nickname,
                type: messageType,
                messages: [],
                pinned: false,
                new: 0,
                attachmentsNew: 0,
                Users: [senderDetails]
            };

            dialogueData[senderDetails.info.Nickname] = dialogue;
        }
        return dialogue;
    }
}