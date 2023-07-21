import { inject, injectable } from "tsyringe";
import { DialogueHelper } from "../helpers/DialogueHelper";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { GiftSenderType } from "../models/enums/GiftSenderType";
import { MessageType } from "../models/enums/MessageType";
import { Gift, IGiftsConfig } from "../models/spt/config/IGiftsConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { HashUtil } from "../utils/HashUtil";

@injectable()
export class GiftService
{
    protected giftConfig: IGiftsConfig;
    protected readonly systemSenderId = "59e7125688a45068a6249071";

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.giftConfig = this.configServer.getConfig(ConfigTypes.GIFTS);
    }

    /**
     * Send player a gift
     * @param playerId Player to send gift to / sessionId
     * @param giftId Id of gift to send player
     * @returns true if gift was sent
     */
    public sendGiftToPlayer(playerId: string, giftId: string): boolean
    {
        const giftData = this.giftConfig.gifts[giftId];
        if (!giftData)
        {
            this.logger.warning(`Unable to find gift with id of ${giftId}`);

            return false;
        }

        const senderId = this.getSenderId(giftData);
        const messageType = this.getMessageType(giftData);

        const messageContent = this.dialogueHelper.createMessageContext(null, messageType, giftData.collectionTimeHours);
        messageContent.text = giftData.messageText;

        this.dialogueHelper.addDialogueMessage(senderId, messageContent, playerId, giftData.items, messageType);

        return true;
    }

    /**
     * Get sender id based on gifts sender type enum
     * @param giftData Gift to send player
     * @returns trader/user/system id
     */
    protected getSenderId(giftData: Gift): string
    {
        if (giftData.sender === GiftSenderType.SYSTEM)
        {
            return this.systemSenderId;
        }

        if (giftData.sender === GiftSenderType.TRADER)
        {
            return giftData.trader;
        }

        if (giftData.sender === GiftSenderType.USER)
        {
            return giftData.senderId;
        }
    }

    /**
     * Convert GiftSenderType into a dialog MessageType
     * @param giftData Gift to send player
     * @returns MessageType enum value
     */
    protected getMessageType(giftData: Gift): MessageType
    {
        switch (giftData.sender)
        {
            case GiftSenderType.SYSTEM:
                return MessageType.SYSTEM_MESSAGE;
            case GiftSenderType.TRADER:
                return MessageType.NPC_TRADER;
            case GiftSenderType.USER:
                return MessageType.USER_MESSAGE;
            default:
                this.logger.error(`Gift message type: ${giftData.sender} not handled`);
                break;
        }
    }
}