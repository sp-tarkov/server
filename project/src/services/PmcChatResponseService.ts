import { inject, injectable } from "tsyringe";

import { NotificationSendHelper } from "../helpers/NotificationSendHelper";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Victim } from "../models/eft/common/tables/IBotBase";
import { IUserDialogInfo } from "../models/eft/profile/IAkiProfile";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MemberCategory } from "../models/enums/MemberCategory";
import { MessageType } from "../models/enums/MessageType";
import { IPmcChatResponse } from "../models/spt/config/IPmChatResponse";
import { ConfigServer } from "../servers/ConfigServer";
import { RandomUtil } from "../utils/RandomUtil";
import { LocalisationService } from "./LocalisationService";

@injectable()
export class PmcChatResponseService
{
    protected pmcResponsesConfig: IPmcChatResponse;

    constructor(
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("NotificationSendHelper") protected notificationSendHelper: NotificationSendHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.pmcResponsesConfig = this.configServer.getConfig(ConfigTypes.PMC_CHAT_RESPONSE);
    }

    /**
     * Chooses a random victim from those provided and sends a message to the player, can be positive or negative
     * @param sessionId Session id
     * @param pmcVictims Array of bots killed by player
     */
    public sendVictimResponse(sessionId: string, pmcVictims: Victim[]): void
    {
        const victim = this.chooseRandomVictim(pmcVictims);

        const message = this.chooseMessage(true);

        this.notificationSendHelper.sendMessageToPlayer(sessionId, victim, message, MessageType.USER_MESSAGE);
    }


    /**
     * Not fully implemented yet, needs method of acquiring killers details after raid
     * @param sessionId Session id
     * @param pmcData Players profile
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public sendKillerResponse(sessionId: string, pmcData: IPmcData): void
    {
        const killer: IUserDialogInfo = {
            _id: "",
            info: undefined
        };

        const message = this.chooseMessage(false);

        this.notificationSendHelper.sendMessageToPlayer(sessionId, killer, message, MessageType.USER_MESSAGE);
    }

    /**
     * Choose a localised message to send the player (different if sender was killed or killed player)
     * @param isVictim 
     * @returns 
     */
    protected chooseMessage(isVictim: boolean): string
    {
        // Positive/negative etc
        const responseType = this.chooseResponseType(isVictim);

        // Get all locale keys
        const possibleResponseLocaleKeys = this.getResponseLocaleKeys(responseType, isVictim);

        // Choose random response from above list and request it from localisation service
        let responseText = this.localisationService.getText(this.randomUtil.getArrayValue(possibleResponseLocaleKeys));
        if (this.appendBroToMessageEnd(isVictim))
        {
            responseText += " bro";
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
     * Should the word 'bro' be appended to the message being sent to player
     * @param isVictim Was responder a victim of player
     * @returns true = should be stripped
     */
    appendBroToMessageEnd(isVictim: boolean): boolean
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
     * Randomly draw a victim of the the array and return thier details
     * @param pmcVictims Possible victims to choose from
     * @returns IUserDialogInfo
     */
    protected chooseRandomVictim(pmcVictims: Victim[]): IUserDialogInfo
    {
        const randomVictim = this.randomUtil.getArrayValue(pmcVictims);

        return {_id: randomVictim.Name, info:{Nickname: randomVictim.Name, Level: randomVictim.Level, Side: randomVictim.Side, MemberCategory: MemberCategory.UNIQUE_ID}};
    }
}