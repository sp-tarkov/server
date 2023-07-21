import { inject, injectable } from "tsyringe";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { GiftSenderType } from "../models/enums/GiftSenderType";
import { GiftSentResult } from "../models/enums/GiftSentResult";
import { MessageType } from "../models/enums/MessageType";
import { Gift, IGiftsConfig } from "../models/spt/config/IGiftsConfig";
import { ISendMessageDetails } from "../models/spt/dialog/ISendMessageDetails";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { HashUtil } from "../utils/HashUtil";
import { TimeUtil } from "../utils/TimeUtil";
import { MailSendService } from "./MailSendService";

@injectable()
export class GiftService
{
    protected giftConfig: IGiftsConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
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
     * Send player a gift from a range of sources
     * @param playerId Player to send gift to / sessionId
     * @param giftId Id of gift in configs/gifts.json to send player
     * @returns outcome of sending gift to player
     */
    public sendGiftToPlayer(playerId: string, giftId: string): GiftSentResult
    {
        const giftData = this.giftConfig.gifts[giftId];
        if (!giftData)
        {
            return GiftSentResult.FAILED_GIFT_DOESNT_EXIST;
        }

        if (this.profileHelper.playerHasRecievedGift(playerId, giftId))
        {
            this.logger.debug(`Player already recieved gift: ${giftId}`);

            return GiftSentResult.FAILED_GIFT_ALREADY_RECEIVED;
        }

        // Handle system messsages
        if (giftData.sender === GiftSenderType.SYSTEM)
        {
            this.mailSendService.sendSystemMessageToPlayer(
                playerId,
                giftData.messageText,
                giftData.items,
                this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours));
        }
        // Handle user messages
        else if (giftData.sender === GiftSenderType.USER)
        {
            this.mailSendService.sendUserMessageToPlayer(
                playerId,
                giftData.senderDetails,
                giftData.messageText,
                giftData.items,
                this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours));
        }
        else if (giftData.sender === GiftSenderType.TRADER)
        {
            this.mailSendService.sendDirectNpcMessageToPlayer(
                playerId,
                giftData.trader,
                MessageType.MESSAGE_WITH_ITEMS,
                giftData.messageText,
                giftData.items,
                this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours));
        }
        else
        {
            // TODO: further split out into different message systems like above SYSTEM method
            // Trader / ragfair
            const details: ISendMessageDetails = {
                recipientId: playerId,
                sender: this.getMessageType(giftData),
                senderDetails: { _id: this.getSenderId(giftData), info: null},
                messageText: giftData.messageText,
                items: giftData.items,
                itemsMaxStorageLifetimeSeconds: this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours)
            };

            if (giftData.trader)
            {
                details.trader = giftData.trader;
            }

            this.mailSendService.sendMessageToPlayer(details);
        }        

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