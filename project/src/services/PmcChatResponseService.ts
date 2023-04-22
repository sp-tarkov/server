import { inject, injectable } from "tsyringe";

import { NotificationSendHelper } from "../helpers/NotificationSendHelper";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Aggressor, Victim } from "../models/eft/common/tables/IBotBase";
import { IUserDialogInfo } from "../models/eft/profile/IAkiProfile";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MemberCategory } from "../models/enums/MemberCategory";
import { MessageType } from "../models/enums/MessageType";
import { IPmcChatResponse } from "../models/spt/config/IPmChatResponse";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { RandomUtil } from "../utils/RandomUtil";
import { LocalisationService } from "./LocalisationService";
import { MatchBotDetailsCacheService } from "./MatchBotDetailsCacheService";

@injectable()
export class PmcChatResponseService
{
    protected pmcResponsesConfig: IPmcChatResponse;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("NotificationSendHelper") protected notificationSendHelper: NotificationSendHelper,
        @inject("MatchBotDetailsCacheService") protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.pmcResponsesConfig = this.configServer.getConfig(ConfigTypes.PMC_CHAT_RESPONSE);
    }

    /**
     * For each PMC victim of the player, have a chance to send a message to the player, can be positive or negative
     * @param sessionId Session id
     * @param pmcVictims Array of bots killed by player
     * @param pmcData Player profile
     */
    public sendVictimResponse(sessionId: string, pmcVictims: Victim[], pmcData: IPmcData): void
    {
        for (const victim of pmcVictims)
        {
            if (!this.randomUtil.getChance100(this.pmcResponsesConfig.victim.responseChancePercent))
            {
                continue;
            }

            const victimDetails = this.getVictimDetails(victim);
            const message = this.chooseMessage(true, pmcData);
            this.notificationSendHelper.sendMessageToPlayer(sessionId, victimDetails, message, MessageType.USER_MESSAGE);
        }        
    }


    /**
     * Not fully implemented yet, needs method of acquiring killers details after raid
     * @param sessionId Session id
     * @param pmcData Players profile
     * @param killer The bot who killed the player
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public sendKillerResponse(sessionId: string, pmcData: IPmcData, killer: Aggressor): void
    {
        if (!killer)
        {
            return;
        }

        if (!this.randomUtil.getChance100(this.pmcResponsesConfig.killer.responseChancePercent))
        {
            return;
        }

        // find bot by name in cache
        const killerDetailsInCache = this.matchBotDetailsCacheService.getBotByName(killer.Name.trim());
        if (!killerDetailsInCache)
        {
            return;
        }

        // If kill was not a PMC, skip
        if (!["sptUsec", "sptBear"].includes(killerDetailsInCache.Info.Settings.Role))
        {
            return;
        }

        const killerDetails: IUserDialogInfo = {
            _id: killerDetailsInCache._id,
            info: {
                Nickname: killerDetailsInCache.Info.Nickname,
                Side: killerDetailsInCache.Info.Side,
                Level: killerDetailsInCache.Info.Level,
                MemberCategory: killerDetailsInCache.Info.MemberCategory
            }
        };

        const message = this.chooseMessage(false, pmcData);
        if (!message)
        {
            return;
        }

        this.notificationSendHelper.sendMessageToPlayer(sessionId, killerDetails, message, MessageType.USER_MESSAGE);
    }

    /**
     * Choose a localised message to send the player (different if sender was killed or killed player)
     * @param isVictim Is the message coming from a bot killed by the player
     * @param pmcData Player profile
     * @returns Message from PMC to player
     */
    protected chooseMessage(isVictim: boolean, pmcData: IPmcData): string
    {
        // Positive/negative etc
        const responseType = this.chooseResponseType(isVictim);

        // Get all locale keys
        const possibleResponseLocaleKeys = this.getResponseLocaleKeys(responseType, isVictim);
        if (possibleResponseLocaleKeys.length === 0)
        {
            this.logger.warning(`No pmc response keys found for type: ${responseType}`);

            return undefined;
        }

        // Choose random response from above list and request it from localisation service
        let responseText = this.localisationService.getText(this.randomUtil.getArrayValue(possibleResponseLocaleKeys), {playerName: pmcData.Info.Nickname, playerLevel: pmcData.Info.Level, playerSide: pmcData.Info.Side});

        if (this.appendSuffixToMessageEnd(isVictim))
        {
            const suffixText = this.localisationService.getText(this.randomUtil.getArrayValue(this.getResponseSuffixLocaleKeys()));
            responseText += ` ${suffixText}`;
        }
        
        if (this.stripCapitalistion(isVictim))
        {
            responseText = responseText.toLowerCase();
        }

        if (this.allCaps(isVictim))
        {
            responseText = responseText.toUpperCase();
        }

        return responseText;
    }

    /**
     * Should capitalisation be stripped from the message response before sending
     * @param isVictim Was responder a victim of player
     * @returns true = should be stripped
     */
    protected stripCapitalistion(isVictim: boolean): boolean
    {
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
    protected allCaps(isVictim: boolean): boolean
    {
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
    appendSuffixToMessageEnd(isVictim: boolean): boolean
    {
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
    protected chooseResponseType(isVictim = true): string
    {
        const responseWeights = isVictim
            ? this.pmcResponsesConfig.victim.responseTypeWeights
            : this.pmcResponsesConfig.killer.responseTypeWeights;

        return this.weightedRandomHelper.getWeightedInventoryItem(responseWeights);
    }

    /**
     * Get locale keys related to the type of response to send (victim/killer)
     * @param keyType Positive/negative
     * @param isVictim Was responder killed by player
     * @returns 
     */
    protected getResponseLocaleKeys(keyType: string, isVictim = true): string[]
    {
        const keyBase = isVictim ? "pmcresponse-victim_" : "pmcresponse-killer_";
        const keys = this.localisationService.getKeys();

        return keys.filter(x => x.startsWith(`${keyBase}${keyType}`));
    }

    /**
     * Get all locale keys that start with `pmcresponse-suffix`
     * @returns array of keys
     */
    protected getResponseSuffixLocaleKeys(): string[]
    {
        const keys = this.localisationService.getKeys();

        return keys.filter(x => x.startsWith("pmcresponse-suffix"));
    }

    /**
     * Randomly draw a victim of the the array and return thier details
     * @param pmcVictims Possible victims to choose from
     * @returns IUserDialogInfo
     */
    protected chooseRandomVictim(pmcVictims: Victim[]): IUserDialogInfo
    {
        const randomVictim = this.randomUtil.getArrayValue(pmcVictims);

        return this.getVictimDetails(randomVictim);
    }

    /**
     * Convert a victim object into a IUserDialogInfo object
     * @param pmcVictim victim to convert
     * @returns IUserDialogInfo
     */
    protected getVictimDetails(pmcVictim: Victim): IUserDialogInfo
    {
        const categories = [MemberCategory.UNIQUE_ID, MemberCategory.DEFAULT, MemberCategory.DEFAULT, MemberCategory.DEFAULT, MemberCategory.DEFAULT, MemberCategory.DEFAULT, MemberCategory.DEFAULT, MemberCategory.SHERPA, MemberCategory.DEVELOPER];
        return {_id: pmcVictim.Name, info:{Nickname: pmcVictim.Name, Level: pmcVictim.Level, Side: pmcVictim.Side, MemberCategory: this.randomUtil.getArrayValue(categories)}};
    }
}