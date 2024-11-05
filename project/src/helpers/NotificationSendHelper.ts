import { IDialogue, IMessage, IUserDialogInfo } from "@spt/models/eft/profile/ISptProfile";
import { IWsChatMessageReceived } from "@spt/models/eft/ws/IWsChatMessageReceived";
import { IWsNotificationEvent } from "@spt/models/eft/ws/IWsNotificationEvent";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { MessageType } from "@spt/models/enums/MessageType";
import { NotificationEventType } from "@spt/models/enums/NotificationEventType";
import { SaveServer } from "@spt/servers/SaveServer";
import { SptWebSocketConnectionHandler } from "@spt/servers/ws/SptWebSocketConnectionHandler";
import { NotificationService } from "@spt/services/NotificationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class NotificationSendHelper {
    constructor(
        @inject("SptWebSocketConnectionHandler") protected sptWebSocketConnection: SptWebSocketConnectionHandler,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("NotificationService") protected notificationService: NotificationService,
    ) {}

    /**
     * Send notification message to the appropriate channel
     * @param sessionID
     * @param notificationMessage
     */
    public sendMessage(sessionID: string, notificationMessage: IWsNotificationEvent): void {
        if (this.sptWebSocketConnection.isConnectionWebSocket(sessionID)) {
            this.sptWebSocketConnection.sendMessage(sessionID, notificationMessage);
        } else {
            this.notificationService.add(sessionID, notificationMessage);
        }
    }

    /**
     * Send a message directly to the player
     * @param sessionId Session id
     * @param senderDetails Who is sendin the message to player
     * @param messageText Text to send player
     * @param messageType Underlying type of message being sent
     */
    public sendMessageToPlayer(
        sessionId: string,
        senderDetails: IUserDialogInfo,
        messageText: string,
        messageType: MessageType,
    ): void {
        const dialog = this.getDialog(sessionId, messageType, senderDetails);

        dialog.new += 1;
        const message: IMessage = {
            _id: this.hashUtil.generate(),
            uid: dialog._id,
            type: messageType,
            dt: Math.round(Date.now() / 1000),
            text: messageText,
            hasRewards: undefined,
            rewardCollected: undefined,
            items: undefined,
        };
        dialog.messages.push(message);

        const notification: IWsChatMessageReceived = {
            type: NotificationEventType.CHAT_MESSAGE_RECEIVED,
            eventId: message._id,
            dialogId: message.uid,
            message: message,
        };
        this.sendMessage(sessionId, notification);
    }

    /**
     * Helper function for sendMessageToPlayer(), get new dialog for storage in profile or find existing by sender id
     * @param sessionId Session id
     * @param messageType Type of message to generate
     * @param senderDetails Who is sending the message
     * @returns Dialogue
     */
    protected getDialog(sessionId: string, messageType: MessageType, senderDetails: IUserDialogInfo): IDialogue {
        // Use trader id if sender is trader, otherwise use nickname
        const key = senderDetails._id;
        const dialogueData = this.saveServer.getProfile(sessionId).dialogues;
        const isNewDialogue = !(key in dialogueData);
        let dialogue: IDialogue = dialogueData[key];

        // Existing dialog not found, make new one
        if (isNewDialogue) {
            dialogue = {
                _id: key,
                type: messageType,
                messages: [],
                pinned: false,
                new: 0,
                attachmentsNew: 0,
                Users: senderDetails.Info.MemberCategory === MemberCategory.TRADER ? undefined : [senderDetails],
            };

            dialogueData[key] = dialogue;
        }
        return dialogue;
    }
}
