import { NotificationSendHelper } from "@spt/helpers/NotificationSendHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IAggressor, IVictim } from "@spt/models/eft/common/tables/IBotBase";
import { IUserDialogInfo } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { MessageType } from "@spt/models/enums/MessageType";
import { IGiftsConfig } from "@spt/models/spt/config/IGiftsConfig";
import { IPmcChatResponse } from "@spt/models/spt/config/IPmChatResponse";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { GiftService } from "@spt/services/GiftService";
import { LocaleService } from "@spt/services/LocaleService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MatchBotDetailsCacheService } from "@spt/services/MatchBotDetailsCacheService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class PmcChatResponseService {
    protected pmcResponsesConfig: IPmcChatResponse;
    protected giftConfig: IGiftsConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("NotificationSendHelper") protected notificationSendHelper: NotificationSendHelper,
        @inject("MatchBotDetailsCacheService") protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("GiftService") protected giftService: GiftService,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.pmcResponsesConfig = this.configServer.getConfig(ConfigTypes.PMC_CHAT_RESPONSE);
        this.giftConfig = this.configServer.getConfig(ConfigTypes.GIFTS);
    }

    /**
     * For each PMC victim of the player, have a chance to send a message to the player, can be positive or negative
     * @param sessionId Session id
     * @param pmcVictims Array of bots killed by player
     * @param pmcData Player profile
     */
    public sendVictimResponse(sessionId: string, pmcVictims: IVictim[], pmcData: IPmcData): void {
        for (const victim of pmcVictims) {
            if (!this.randomUtil.getChance100(this.pmcResponsesConfig.victim.responseChancePercent)) {
                continue;
            }

            if (!victim.Name) {
                this.logger.warning(
                    `Victim: ${victim.ProfileId} does not have a nickname, skipping pmc response message send`,
                );

                continue;
            }

            const victimDetails = this.getVictimDetails(victim);
            const message = this.chooseMessage(true, pmcData, victim);
            if (message) {
                this.notificationSendHelper.sendMessageToPlayer(
                    sessionId,
                    victimDetails,
                    message,
                    MessageType.USER_MESSAGE,
                );
            }
        }
    }

    /**
     * Not fully implemented yet, needs method of acquiring killers details after raid
     * @param sessionId Session id
     * @param pmcData Players profile
     * @param killer The bot who killed the player
     */
    public sendKillerResponse(sessionId: string, pmcData: IPmcData, killer: IAggressor): void {
        if (!killer) {
            return;
        }

        if (!this.randomUtil.getChance100(this.pmcResponsesConfig.killer.responseChancePercent)) {
            return;
        }

        // find bot by name in cache
        const killerDetailsInCache = this.matchBotDetailsCacheService.getBotByNameAndSide(killer.Name, killer.Side);
        if (!killerDetailsInCache) {
            return;
        }

        // If kill was not a PMC, skip
        if (!["pmcUSEC", "pmcBEAR"].includes(killerDetailsInCache.Info.Settings.Role)) {
            return;
        }

        const killerDetails: IUserDialogInfo = {
            _id: killerDetailsInCache._id,
            aid: this.hashUtil.generateAccountId(), // TODO- pass correct value
            Info: {
                Nickname: killerDetailsInCache.Info.Nickname,
                Side: killerDetailsInCache.Info.Side,
                Level: killerDetailsInCache.Info.Level,
                MemberCategory: killerDetailsInCache.Info.MemberCategory,
                SelectedMemberCategory: killerDetailsInCache.Info.SelectedMemberCategory,
            },
        };

        const message = this.chooseMessage(false, pmcData);
        if (!message) {
            return;
        }

        this.notificationSendHelper.sendMessageToPlayer(sessionId, killerDetails, message, MessageType.USER_MESSAGE);
    }

    /**
     * Choose a localised message to send the player (different if sender was killed or killed player)
     * @param isVictim Is the message coming from a bot killed by the player
     * @param pmcData Player profile
     * @param victimData OPTIMAL - details of the pmc killed
     * @returns Message from PMC to player
     */
    protected chooseMessage(isVictim: boolean, pmcData: IPmcData, victimData?: IVictim): string | undefined {
        // Positive/negative etc
        const responseType = this.chooseResponseType(isVictim);

        // Get all locale keys
        const possibleResponseLocaleKeys = this.getResponseLocaleKeys(responseType, isVictim);
        if (possibleResponseLocaleKeys.length === 0) {
            this.logger.warning(this.localisationService.getText("pmcresponse-unable_to_find_key", responseType));

            return undefined;
        }

        // Choose random response from above list and request it from localisation service
        let responseText = this.localisationService.getText(this.randomUtil.getArrayValue(possibleResponseLocaleKeys), {
            playerName: pmcData.Info.Nickname,
            playerLevel: pmcData.Info.Level,
            playerSide: pmcData.Info.Side,
            victimDeathLocation: victimData ? this.getLocationName(victimData.Location) : "",
        });

        // Give the player a gift code if they were killed and response is 'pity'.
        if (responseType === "pity") {
            const giftKeys = this.giftService.getGiftIds();
            const randomGiftKey = this.randomUtil.getStringArrayValue(giftKeys);

            const regex: RegExp = /(%giftcode%)/gi;
            responseText = responseText.replace(regex, randomGiftKey);
        }

        if (this.appendSuffixToMessageEnd(isVictim)) {
            const suffixText = this.localisationService.getText(
                this.randomUtil.getArrayValue(this.getResponseSuffixLocaleKeys()),
            );
            responseText += ` ${suffixText}`;
        }

        if (this.stripCapitalistion(isVictim)) {
            responseText = responseText.toLowerCase();
        }

        if (this.allCaps(isVictim)) {
            responseText = responseText.toUpperCase();
        }

        return responseText;
    }

    /**
     * use map key to get a localised location name
     * e.g. factory4_day becomes "Factory"
     * @param locationKey location key to localise
     * @returns Localised location name
     */
    protected getLocationName(locationKey: string) {
        return this.localeService.getLocaleDb()[locationKey] ?? locationKey;
    }

    /**
     * Should capitalisation be stripped from the message response before sending
     * @param isVictim Was responder a victim of player
     * @returns true = should be stripped
     */
    protected stripCapitalistion(isVictim: boolean): boolean {
        const chance = isVictim
            ? this.pmcResponsesConfig.victim.stripCapitalisationChancePercent
            : this.pmcResponsesConfig.killer.stripCapitalisationChancePercent;

        return this.randomUtil.getChance100(chance);
    }

    /**
     * Should capitalisation be stripped from the message response before sending
     * @param isVictim Was responder a victim of player
     * @returns true = should be stripped
     */
    protected allCaps(isVictim: boolean): boolean {
        const chance = isVictim
            ? this.pmcResponsesConfig.victim.allCapsChancePercent
            : this.pmcResponsesConfig.killer.allCapsChancePercent;

        return this.randomUtil.getChance100(chance);
    }

    /**
     * Should a suffix be appended to the end of the message being sent to player
     * @param isVictim Was responder a victim of player
     * @returns true = should be stripped
     */
    protected appendSuffixToMessageEnd(isVictim: boolean): boolean {
        const chance = isVictim
            ? this.pmcResponsesConfig.victim.appendBroToMessageEndChancePercent
            : this.pmcResponsesConfig.killer.appendBroToMessageEndChancePercent;

        return this.randomUtil.getChance100(chance);
    }

    /**
     * Choose a type of response based on the weightings in pmc response config
     * @param isVictim Was responder killed by player
     * @returns Response type (positive/negative)
     */
    protected chooseResponseType(isVictim = true): string {
        const responseWeights = isVictim
            ? this.pmcResponsesConfig.victim.responseTypeWeights
            : this.pmcResponsesConfig.killer.responseTypeWeights;

        return this.weightedRandomHelper.getWeightedValue<string>(responseWeights);
    }

    /**
     * Get locale keys related to the type of response to send (victim/killer)
     * @param keyType Positive/negative
     * @param isVictim Was responder killed by player
     * @returns
     */
    protected getResponseLocaleKeys(keyType: string, isVictim = true): string[] {
        const keyBase = isVictim ? "pmcresponse-victim_" : "pmcresponse-killer_";
        const keys = this.localisationService.getKeys();

        return keys.filter((x) => x.startsWith(`${keyBase}${keyType}`));
    }

    /**
     * Get all locale keys that start with `pmcresponse-suffix`
     * @returns array of keys
     */
    protected getResponseSuffixLocaleKeys(): string[] {
        const keys = this.localisationService.getKeys();

        return keys.filter((x) => x.startsWith("pmcresponse-suffix"));
    }

    /**
     * Randomly draw a victim of the the array and return thier details
     * @param pmcVictims Possible victims to choose from
     * @returns IUserDialogInfo
     */
    protected chooseRandomVictim(pmcVictims: IVictim[]): IUserDialogInfo {
        const randomVictim = this.randomUtil.getArrayValue(pmcVictims);

        return this.getVictimDetails(randomVictim);
    }

    /**
     * Convert a victim object into a IUserDialogInfo object
     * @param pmcVictim victim to convert
     * @returns IUserDialogInfo
     */
    protected getVictimDetails(pmcVictim: IVictim): IUserDialogInfo {
        const categories = [
            MemberCategory.UNIQUE_ID,
            MemberCategory.DEFAULT,
            MemberCategory.DEFAULT,
            MemberCategory.DEFAULT,
            MemberCategory.DEFAULT,
            MemberCategory.DEFAULT,
            MemberCategory.DEFAULT,
            MemberCategory.SHERPA,
            MemberCategory.DEVELOPER,
        ];

        const chosenCategory = this.randomUtil.getArrayValue(categories);

        return {
            _id: pmcVictim.ProfileId,
            aid: Number.parseInt(pmcVictim.AccountId),
            Info: {
                Nickname: pmcVictim.Name,
                Level: pmcVictim.Level,
                Side: pmcVictim.Side,
                MemberCategory: chosenCategory,
                SelectedMemberCategory: chosenCategory,
            },
        };
    }
}
