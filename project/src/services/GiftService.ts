import { inject, injectable } from "tsyringe";
import { DialogueHelper } from "../helpers/DialogueHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { GiftSenderType } from "../models/enums/GiftSenderType";
import { GiftSentResult } from "../models/enums/GiftSentResult";
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
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.giftConfig = this.configServer.getConfig(ConfigTypes.GIFTS);
    }

    /**
     * Does a gift with a specific ID exist in db
     * @param giftId Gift id to check for
     * @returns True if it exists in  db
     */
    public giftExists(giftId: string): boolean
    {
        return !!this.giftConfig.gifts[giftId];
    }

    /**
     * Send player a gift
     * @param playerId Player to send gift to / sessionId
     * @param giftId Id of gift to send player
     * @returns true if gift was sent
     */
    public sendGiftToPlayer(playerId: string, giftId: string): GiftSentResult
    {
        const giftData = this.giftConfig.gifts[giftId];
        if (!giftData)
        {
            this.logger.warning(`Unable to find gift with id: ${giftId}`);

            return GiftSentResult.FAILED_GIFT_DOESNT_EXIST;
        }

        if (this.profileHelper.playerHasRecievedGift(playerId, giftId))
        {
            this.logger.warning(`Player already recieved gift: ${giftId}`);

            return GiftSentResult.FAILED_GIFT_ALREADY_RECEIVED;
        }

        const senderId = this.getSenderId(giftData);
        const messageType = this.getMessageType(giftData);

        const messageContent = this.dialogueHelper.createMessageContext(null, messageType, giftData.collectionTimeHours);
        messageContent.text = giftData.messageText;

        this.dialogueHelper.addDialogueMessage(senderId, messageContent, playerId, giftData.items, messageType);

        this.profileHelper.addGiftReceivedFlagToProfile(playerId, giftId);

        return GiftSentResult.SUCCESS;
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