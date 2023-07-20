import { inject, injectable } from "tsyringe";
import { DialogueHelper } from "../helpers/DialogueHelper";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MessageType } from "../models/enums/MessageType";
import { IGiftsConfig } from "../models/spt/config/IGiftsConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { HashUtil } from "../utils/HashUtil";

@injectable()
export class GiftService
{
    protected giftConfig: IGiftsConfig;

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
     * Send a player a gift
     * @param playerId Player to send gift to
     * @param giftId Id of gift to send player
     */
    public sendGiftToPlayer(playerId: string, giftId: string): void
    {
        const giftData = this.giftConfig.gifts[giftId];
        if (!giftData)
        {
            this.logger.warning(`unable to find gift with id of ${giftId}`);

            return;
        }

        const messageContent = this.dialogueHelper.createMessageContext(null, MessageType.SYSTEM_MESSAGE, giftData.maxStorageTime);

        this.dialogueHelper.addDialogueMessage(this.hashUtil.generate(), messageContent, playerId, giftData.items, MessageType.SYSTEM_MESSAGE);
    }
}