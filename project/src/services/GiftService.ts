import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { GiftSenderType } from "@spt/models/enums/GiftSenderType";
import { GiftSentResult } from "@spt/models/enums/GiftSentResult";
import { MessageType } from "@spt/models/enums/MessageType";
import { Traders } from "@spt/models/enums/Traders";
import { IGift, IGiftsConfig } from "@spt/models/spt/config/IGiftsConfig";
import { ISendMessageDetails } from "@spt/models/spt/dialog/ISendMessageDetails";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { HashUtil } from "@spt/utils/HashUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class GiftService {
    protected giftConfig: IGiftsConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.giftConfig = this.configServer.getConfig(ConfigTypes.GIFTS);
    }

    /**
     * Does a gift with a specific ID exist in db
     * @param giftId Gift id to check for
     * @returns True if it exists in  db
     */
    public giftExists(giftId: string): boolean {
        return !!this.giftConfig.gifts[giftId];
    }

    public getGiftById(giftId: string): IGift {
        return this.giftConfig.gifts[giftId];
    }

    /**
     * Get dictionary of all gifts
     * @returns Dict keyed by gift id
     */
    public getGifts(): Record<string, IGift> {
        return this.giftConfig.gifts;
    }

    /**
     * Get an array of all gift ids
     * @returns string array of gift ids
     */
    public getGiftIds(): string[] {
        return Object.keys(this.giftConfig.gifts);
    }

    /**
     * Send player a gift from a range of sources
     * @param playerId Player to send gift to / sessionId
     * @param giftId Id of gift in configs/gifts.json to send player
     * @returns outcome of sending gift to player
     */
    public sendGiftToPlayer(playerId: string, giftId: string): GiftSentResult {
        const giftData = this.giftConfig.gifts[giftId];
        if (!giftData) {
            return GiftSentResult.FAILED_GIFT_DOESNT_EXIST;
        }
        const maxGiftsToSendCount = giftData.maxToSendPlayer ?? 1;
        if (this.profileHelper.playerHasRecievedMaxNumberOfGift(playerId, giftId, maxGiftsToSendCount)) {
            this.logger.debug(`Player already recieved gift: ${giftId}`);

            return GiftSentResult.FAILED_GIFT_ALREADY_RECEIVED;
        }

        if (giftData.items?.length > 0 && !giftData.collectionTimeHours) {
            this.logger.warning(`Gift ${giftId} has items but no collection time limit, defaulting to 48 hours`);
        }

        // Handle system messsages
        if (giftData.sender === GiftSenderType.SYSTEM) {
            // Has a localisable text id to send to player
            if (giftData.localeTextId) {
                this.mailSendService.sendLocalisedSystemMessageToPlayer(
                    playerId,
                    giftData.localeTextId,
                    giftData.items,
                    giftData.profileChangeEvents,
                    this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours),
                );
            } else {
                this.mailSendService.sendSystemMessageToPlayer(
                    playerId,
                    giftData.messageText,
                    giftData.items,
                    this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours),
                    giftData.profileChangeEvents,
                );
            }
        }
        // Handle user messages
        else if (giftData.sender === GiftSenderType.USER) {
            this.mailSendService.sendUserMessageToPlayer(
                playerId,
                giftData.senderDetails,
                giftData.messageText,
                giftData.items,
                this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours),
            );
        } else if (giftData.sender === GiftSenderType.TRADER) {
            if (giftData.localeTextId) {
                this.mailSendService.sendLocalisedNpcMessageToPlayer(
                    playerId,
                    giftData.trader,
                    MessageType.MESSAGE_WITH_ITEMS,
                    giftData.localeTextId,
                    giftData.items,
                    this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours),
                );
            } else {
                this.mailSendService.sendDirectNpcMessageToPlayer(
                    playerId,
                    giftData.trader,
                    MessageType.MESSAGE_WITH_ITEMS,
                    giftData.messageText,
                    giftData.items,
                    this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours),
                );
            }
        } else {
            // TODO: further split out into different message systems like above SYSTEM method
            // Trader / ragfair
            const details: ISendMessageDetails = {
                recipientId: playerId,
                sender: this.getMessageType(giftData),
                senderDetails: {
                    _id: this.getSenderId(giftData),
                    aid: 1234567, // TODO - pass proper aid value
                    Info: undefined,
                },
                messageText: giftData.messageText,
                items: giftData.items,
                itemsMaxStorageLifetimeSeconds: this.timeUtil.getHoursAsSeconds(giftData.collectionTimeHours),
            };

            if (giftData.trader) {
                details.trader = giftData.trader;
            }

            this.mailSendService.sendMessageToPlayer(details);
        }

        this.profileHelper.flagGiftReceivedInProfile(playerId, giftId, maxGiftsToSendCount);

        return GiftSentResult.SUCCESS;
    }

    /**
     * Get sender id based on gifts sender type enum
     * @param giftData Gift to send player
     * @returns trader/user/system id
     */
    protected getSenderId(giftData: IGift): string | undefined {
        if (giftData.sender === GiftSenderType.TRADER) {
            return Traders[giftData.trader];
        }

        if (giftData.sender === GiftSenderType.USER) {
            return giftData.senderId;
        }
    }

    /**
     * Convert GiftSenderType into a dialog MessageType
     * @param giftData Gift to send player
     * @returns MessageType enum value
     */
    protected getMessageType(giftData: IGift): MessageType | undefined {
        switch (giftData.sender) {
            case GiftSenderType.SYSTEM:
                return MessageType.SYSTEM_MESSAGE;
            case GiftSenderType.TRADER:
                return MessageType.NPC_TRADER;
            case GiftSenderType.USER:
                return MessageType.USER_MESSAGE;
            default:
                this.logger.error(
                    this.localisationService.getText("gift-unable_to_handle_message_type_command", giftData.sender),
                );
                break;
        }
    }

    /**
     * Prapor sends gifts to player for first week after profile creation
     * @param sessionId Player id
     * @param day What day to give gift for
     */
    public sendPraporStartingGift(sessionId: string, day: number): void {
        let giftId: string;
        switch (day) {
            case 1: {
                giftId = "PraporGiftDay1";

                break;
            }
            case 2: {
                giftId = "PraporGiftDay2";

                break;
            }
        }

        if (giftId) {
            const giftData = this.getGiftById(giftId);
            if (!this.profileHelper.playerHasRecievedMaxNumberOfGift(sessionId, giftId, 1)) {
                // Hard-coded to send only one
                this.sendGiftToPlayer(sessionId, giftId);
            }
        }
    }
}
