import { inject, injectable } from "tsyringe";

import { RepeatableQuestGenerator } from "@spt-aki/generators/RepeatableQuestGenerator";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { QuestHelper } from "@spt-aki/helpers/QuestHelper";
import { RepeatableQuestHelper } from "@spt-aki/helpers/RepeatableQuestHelper";
import { IEmptyRequestData } from "@spt-aki/models/eft/common/IEmptyRequestData";
import { ILocationBase } from "@spt-aki/models/eft/common/ILocationBase";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import {
    IChangeRequirement,
    IPmcDataRepeatableQuest,
    IRepeatableQuest,
} from "@spt-aki/models/eft/common/tables/IRepeatableQuests";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IRepeatableQuestChangeRequest } from "@spt-aki/models/eft/quests/IRepeatableQuestChangeRequest";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ELocationName } from "@spt-aki/models/enums/ELocationName";
import { HideoutAreas } from "@spt-aki/models/enums/HideoutAreas";
import { QuestStatus } from "@spt-aki/models/enums/QuestStatus";
import { SkillTypes } from "@spt-aki/models/enums/SkillTypes";
import { IQuestConfig, IRepeatableQuestConfig } from "@spt-aki/models/spt/config/IQuestConfig";
import { IQuestTypePool } from "@spt-aki/models/spt/repeatable/IQuestTypePool";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { PaymentService } from "@spt-aki/services/PaymentService";
import { ProfileFixerService } from "@spt-aki/services/ProfileFixerService";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { ObjectId } from "@spt-aki/utils/ObjectId";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class RepeatableQuestController
{
    protected questConfig: IQuestConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("RepeatableQuestGenerator") protected repeatableQuestGenerator: RepeatableQuestGenerator,
        @inject("RepeatableQuestHelper") protected repeatableQuestHelper: RepeatableQuestHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * Handle client/repeatalbeQuests/activityPeriods
     * Returns an array of objects in the format of repeatable quests to the client.
     * repeatableQuestObject = {
     *  id: Unique Id,
     *  name: "Daily",
     *  endTime: the time when the quests expire
     *  activeQuests: currently available quests in an array. Each element of quest type format (see assets/database/templates/repeatableQuests.json).
     *  inactiveQuests: the quests which were previously active (required by client to fail them if they are not completed)
     * }
     *
     * The method checks if the player level requirement for repeatable quests (e.g. daily lvl5, weekly lvl15) is met and if the previously active quests
     * are still valid. This ischecked by endTime persisted in profile accordning to the resetTime configured for each repeatable kind (daily, weekly)
     * in QuestCondig.js
     *
     * If the condition is met, new repeatableQuests are created, old quests (which are persisted in the profile.RepeatableQuests[i].activeQuests) are
     * moved to profile.RepeatableQuests[i].inactiveQuests. This memory is required to get rid of old repeatable quest data in the profile, otherwise
     * they'll litter the profile's Quests field.
     * (if the are on "Succeed" but not "Completed" we keep them, to allow the player to complete them and get the rewards)
     * The new quests generated are again persisted in profile.RepeatableQuests
     *
     * @param   {string}    _info       Request from client
     * @param   {string}    sessionID   Player's session id
     *
     * @returns  {array}                Array of "repeatableQuestObjects" as descibed above
     */
    public getClientRepeatableQuests(_info: IEmptyRequestData, sessionID: string): IPmcDataRepeatableQuest[]
    {
        const returnData: Array<IPmcDataRepeatableQuest> = [];
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const time = this.timeUtil.getTimestamp();
        const scavQuestUnlocked =
            pmcData?.Hideout?.Areas?.find((hideoutArea) => hideoutArea.type === HideoutAreas.INTEL_CENTER)?.level >= 1;

        // Daily / weekly / Daily_Savage
        for (const repeatableConfig of this.questConfig.repeatableQuests)
        {
            // get daily/weekly data from profile, add empty object if missing
            const currentRepeatableQuestType = this.getRepeatableQuestSubTypeFromProfile(repeatableConfig, pmcData);

            if (
                repeatableConfig.side === "Pmc" && pmcData.Info.Level >= repeatableConfig.minPlayerLevel
                || repeatableConfig.side === "Scav" && scavQuestUnlocked
            )
            {
                if (time > currentRepeatableQuestType.endTime - 1)
                {
                    currentRepeatableQuestType.endTime = time + repeatableConfig.resetTime;
                    currentRepeatableQuestType.inactiveQuests = [];
                    this.logger.debug(`Generating new ${repeatableConfig.name}`);

                    // put old quests to inactive (this is required since only then the client makes them fail due to non-completion)
                    // we also need to push them to the "inactiveQuests" list since we need to remove them from offraidData.profile.Quests
                    // after a raid (the client seems to keep quests internally and we want to get rid of old repeatable quests)
                    // and remove them from the PMC's Quests and RepeatableQuests[i].activeQuests
                    const questsToKeep = [];
                    // for (let i = 0; i < currentRepeatable.activeQuests.length; i++)
                    for (const activeQuest of currentRepeatableQuestType.activeQuests)
                    {
                        // Keep finished quests in list so player can hand in
                        const quest = pmcData.Quests.find((quest) => quest.qid === activeQuest._id);
                        if (quest)
                        {
                            if (quest.status === QuestStatus.AvailableForFinish)
                            {
                                questsToKeep.push(activeQuest);
                                this.logger.debug(
                                    `Keeping repeatable quest ${activeQuest._id} in activeQuests since it is available to hand in`,
                                );

                                continue;
                            }
                        }
                        this.profileFixerService.removeDanglingConditionCounters(pmcData);

                        // Remove expired quest from pmc.quest array
                        pmcData.Quests = pmcData.Quests.filter((quest) => quest.qid !== activeQuest._id);
                        currentRepeatableQuestType.inactiveQuests.push(activeQuest);
                    }
                    currentRepeatableQuestType.activeQuests = questsToKeep;

                    // introduce a dynamic quest pool to avoid duplicates
                    const questTypePool = this.generateQuestPool(repeatableConfig, pmcData.Info.Level);

                    // Add daily quests
                    for (let i = 0; i < this.getQuestCount(repeatableConfig, pmcData); i++)
                    {
                        let quest = null;
                        let lifeline = 0;
                        while (!quest && questTypePool.types.length > 0)
                        {
                            quest = this.repeatableQuestGenerator.generateRepeatableQuest(
                                pmcData.Info.Level,
                                pmcData.TradersInfo,
                                questTypePool,
                                repeatableConfig,
                            );
                            lifeline++;
                            if (lifeline > 10)
                            {
                                this.logger.debug(
                                    "We were stuck in repeatable quest generation. This should never happen. Please report",
                                );
                                break;
                            }
                        }

                        // check if there are no more quest types available
                        if (questTypePool.types.length === 0)
                        {
                            break;
                        }
                        quest.side = repeatableConfig.side;
                        currentRepeatableQuestType.activeQuests.push(quest);
                    }
                }
                else
                {
                    this.logger.debug(`[Quest Check] ${repeatableConfig.name} quests are still valid.`);
                }
            }

            // Create stupid redundant change requirements from quest data
            for (const quest of currentRepeatableQuestType.activeQuests)
            {
                currentRepeatableQuestType.changeRequirement[quest._id] = {
                    changeCost: quest.changeCost,
                    changeStandingCost: this.randomUtil.getArrayValue([0, 0.01]),
                };
            }

            returnData.push({
                id: repeatableConfig.id,
                name: currentRepeatableQuestType.name,
                endTime: currentRepeatableQuestType.endTime,
                activeQuests: currentRepeatableQuestType.activeQuests,
                inactiveQuests: currentRepeatableQuestType.inactiveQuests,
                changeRequirement: currentRepeatableQuestType.changeRequirement,
            });
        }

        return returnData;
    }

    /**
     * Get the number of quests to generate - takes into account charisma state of player
     * @param repeatableConfig Config
     * @param pmcData Player profile
     * @returns Quest count
     */
    protected getQuestCount(repeatableConfig: IRepeatableQuestConfig, pmcData: IPmcData): number
    {
        if (
            repeatableConfig.name.toLowerCase() === "daily"
            && this.profileHelper.hasEliteSkillLevel(SkillTypes.CHARISMA, pmcData)
        )
        {
            // Elite charisma skill gives extra daily quest(s)
            return repeatableConfig.numQuests
                + this.databaseServer.getTables().globals.config.SkillsSettings.Charisma.BonusSettings
                    .EliteBonusSettings.RepeatableQuestExtraCount;
        }

        return repeatableConfig.numQuests;
    }

    /**
     * Get repeatable quest data from profile from name (daily/weekly), creates base repeatable quest object if none exists
     * @param repeatableConfig daily/weekly config
     * @param pmcData Profile to search
     * @returns IPmcDataRepeatableQuest
     */
    protected getRepeatableQuestSubTypeFromProfile(
        repeatableConfig: IRepeatableQuestConfig,
        pmcData: IPmcData,
    ): IPmcDataRepeatableQuest
    {
        // Get from profile, add if missing
        let repeatableQuestDetails = pmcData.RepeatableQuests.find((x) => x.name === repeatableConfig.name);
        if (!repeatableQuestDetails)
        {
            repeatableQuestDetails = {
                id: repeatableConfig.id,
                name: repeatableConfig.name,
                activeQuests: [],
                inactiveQuests: [],
                endTime: 0,
                changeRequirement: {},
            };

            // Add base object that holds repeatable data to profile
            pmcData.RepeatableQuests.push(repeatableQuestDetails);
        }

        return repeatableQuestDetails;
    }

    /**
     * Just for debug reasons. Draws dailies a random assort of dailies extracted from dumps
     */
    public generateDebugDailies(dailiesPool: any, factory: any, number: number): any
    {
        let randomQuests = [];
        let numberOfQuests = number;

        if (factory)
        {
            // First is factory extract always add for debugging
            randomQuests.push(dailiesPool[0]);
            numberOfQuests -= 1;
        }

        randomQuests = randomQuests.concat(this.randomUtil.drawRandomFromList(dailiesPool, numberOfQuests, false));

        for (const element of randomQuests)
        {
            element._id = this.objectId.generate();
            const conditions = element.conditions.AvailableForFinish;
            for (const condition of conditions)
            {
                if ("counter" in condition._props)
                {
                    condition._props.counter.id = this.objectId.generate();
                }
            }
        }
        return randomQuests;
    }

    /**
     * Used to create a quest pool during each cycle of repeatable quest generation. The pool will be subsequently
     * narrowed down during quest generation to avoid duplicate quests. Like duplicate extractions or elimination quests
     * where you have to e.g. kill scavs in same locations.
     * @param repeatableConfig main repeatable quest config
     * @param pmcLevel level of pmc generating quest pool
     * @returns IQuestTypePool
     */
    protected generateQuestPool(repeatableConfig: IRepeatableQuestConfig, pmcLevel: number): IQuestTypePool
    {
        const questPool = this.createBaseQuestPool(repeatableConfig);

        const locations = this.getAllowedLocations(repeatableConfig.locations, pmcLevel);
        for (const location in locations)
        {
            if (location !== ELocationName.ANY)
            {
                questPool.pool.Exploration.locations[location] = locations[location];
                questPool.pool.Pickup.locations[location] = locations[location];
            }
        }

        // Add "any" to pickup quest pool
        questPool.pool.Pickup.locations.any = ["any"];

        const eliminationConfig = this.repeatableQuestHelper.getEliminationConfigByPmcLevel(pmcLevel, repeatableConfig);
        const targetsConfig = this.repeatableQuestHelper.probabilityObjectArray(eliminationConfig.targets);
        for (const probabilityObject of targetsConfig)
        {
            // Target is boss
            if (probabilityObject.data.isBoss)
            {
                questPool.pool.Elimination.targets[probabilityObject.key] = { locations: ["any"] };
            }
            else
            {
                const possibleLocations = Object.keys(locations);

                // Set possible locations for elimination task, if target is savage, exclude labs from locations
                questPool.pool.Elimination.targets[probabilityObject.key] = (probabilityObject.key === "Savage")
                    ? { locations: possibleLocations.filter((x) => x !== "laboratory") }
                    : { locations: possibleLocations };
            }
        }

        return questPool;
    }

    protected createBaseQuestPool(repeatableConfig: IRepeatableQuestConfig): IQuestTypePool
    {
        return {
            types: repeatableConfig.types.slice(),
            pool: { Exploration: { locations: {} }, Elimination: { targets: {} }, Pickup: { locations: {} } },
        };
    }

    /**
     * Return the locations this PMC is allowed to get daily quests for based on their level
     * @param locations The original list of locations
     * @param pmcLevel The level of the player PMC
     * @returns A filtered list of locations that allow the player PMC level to access it
     */
    protected getAllowedLocations(
        locations: Record<ELocationName, string[]>,
        pmcLevel: number,
    ): Partial<Record<ELocationName, string[]>>
    {
        const allowedLocation: Partial<Record<ELocationName, string[]>> = {};

        for (const location in locations)
        {
            const locationNames = [];
            for (const locationName of locations[location])
            {
                if (this.isPmcLevelAllowedOnLocation(locationName, pmcLevel))
                {
                    locationNames.push(locationName);
                }
            }

            if (locationNames.length > 0)
            {
                allowedLocation[location] = locationNames;
            }
        }

        return allowedLocation;
    }

    /**
     * Return true if the given pmcLevel is allowed on the given location
     * @param location The location name to check
     * @param pmcLevel The level of the pmc
     * @returns True if the given pmc level is allowed to access the given location
     */
    protected isPmcLevelAllowedOnLocation(location: string, pmcLevel: number): boolean
    {
        if (location === ELocationName.ANY)
        {
            return true;
        }

        const locationBase: ILocationBase = this.databaseServer.getTables().locations[location.toLowerCase()]?.base;
        if (!locationBase)
        {
            return true;
        }

        return (pmcLevel <= locationBase.RequiredPlayerLevelMax && pmcLevel >= locationBase.RequiredPlayerLevelMin);
    }

    public debugLogRepeatableQuestIds(pmcData: IPmcData): void
    {
        for (const repeatable of pmcData.RepeatableQuests)
        {
            const activeQuestsIds = [];
            const inactiveQuestsIds = [];
            for (const active of repeatable.activeQuests)
            {
                activeQuestsIds.push(active._id);
            }

            for (const inactive of repeatable.inactiveQuests)
            {
                inactiveQuestsIds.push(inactive._id);
            }

            this.logger.debug(`${repeatable.name} activeIds ${activeQuestsIds}`);
            this.logger.debug(`${repeatable.name} inactiveIds ${inactiveQuestsIds}`);
        }
    }

    /**
     * Handle RepeatableQuestChange event
     */
    public changeRepeatableQuest(
        pmcData: IPmcData,
        changeRequest: IRepeatableQuestChangeRequest,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        let repeatableToChange: IPmcDataRepeatableQuest;
        let changeRequirement: IChangeRequirement;

        // Trader existing quest is linked to
        let replacedQuestTraderId: string;

        // Daily,weekly or scav daily
        for (const currentRepeatablePool of pmcData.RepeatableQuests)
        {
            // Check for existing quest in (daily/weekly/scav arrays)
            const questToReplace = currentRepeatablePool.activeQuests.find((x) => x._id === changeRequest.qid);
            if (!questToReplace)
            {
                continue;
            }

            // Save for later standing loss calculation
            replacedQuestTraderId = questToReplace.traderId;

            // Update active quests to exclude the quest we're replacing
            currentRepeatablePool.activeQuests = currentRepeatablePool.activeQuests.filter((x) =>
                x._id !== changeRequest.qid
            );

            // Get cost to replace existing quest
            changeRequirement = this.jsonUtil.clone(currentRepeatablePool.changeRequirement[changeRequest.qid]);
            delete currentRepeatablePool.changeRequirement[changeRequest.qid];
            // TODO: somehow we need to reduce the questPool by the currently active quests (for all repeatables)

            const repeatableConfig = this.questConfig.repeatableQuests.find((x) =>
                x.name === currentRepeatablePool.name
            );
            const questTypePool = this.generateQuestPool(repeatableConfig, pmcData.Info.Level);
            const newRepeatableQuest = this.attemptToGenerateRepeatableQuest(pmcData, questTypePool, repeatableConfig);
            if (newRepeatableQuest)
            {
                // Add newly generated quest to daily/weekly array
                newRepeatableQuest.side = repeatableConfig.side;
                currentRepeatablePool.activeQuests.push(newRepeatableQuest);
                currentRepeatablePool.changeRequirement[newRepeatableQuest._id] = {
                    changeCost: newRepeatableQuest.changeCost,
                    changeStandingCost: this.randomUtil.getArrayValue([0, 0.01]),
                };

                const fullProfile = this.profileHelper.getFullProfile(sessionID);

                // Find quest we're replacing in pmc profile quests array and remove it
                this.questHelper.findAndRemoveQuestFromArrayIfExists(questToReplace._id, pmcData.Quests);

                // Find quest we're replacing in scav profile quests array and remove it
                this.questHelper.findAndRemoveQuestFromArrayIfExists(
                    questToReplace._id,
                    fullProfile.characters.scav?.Quests ?? [],
                );
            }

            // Found and replaced the quest in current repeatable
            repeatableToChange = this.jsonUtil.clone(currentRepeatablePool);
            delete repeatableToChange.inactiveQuests;

            break;
        }

        const output = this.eventOutputHolder.getOutput(sessionID);
        if (!repeatableToChange)
        {
            const message = "Unable to find repeatable quest to replace";
            this.logger.error(message);

            return this.httpResponse.appendErrorToOutput(output, message);
        }

        // Charge player money for replacing quest
        for (const cost of changeRequirement.changeCost)
        {
            this.paymentService.addPaymentToOutput(pmcData, cost.templateId, cost.count, sessionID, output);
            if (output.warnings.length > 0)
            {
                return output;
            }
        }

        // Reduce standing with trader for not doing their quest
        const droppedQuestTrader = pmcData.TradersInfo[replacedQuestTraderId];
        droppedQuestTrader.standing -= changeRequirement.changeStandingCost;

        // Update client output with new repeatable
        if (!output.profileChanges[sessionID].repeatableQuests)
        {
            output.profileChanges[sessionID].repeatableQuests = [];
        }
        output.profileChanges[sessionID].repeatableQuests.push(repeatableToChange);

        return output;
    }

    protected attemptToGenerateRepeatableQuest(
        pmcData: IPmcData,
        questTypePool: IQuestTypePool,
        repeatableConfig: IRepeatableQuestConfig,
    ): IRepeatableQuest
    {
        let newRepeatableQuest: IRepeatableQuest = null;
        let attemptsToGenerateQuest = 0;
        while (!newRepeatableQuest && questTypePool.types.length > 0)
        {
            newRepeatableQuest = this.repeatableQuestGenerator.generateRepeatableQuest(
                pmcData.Info.Level,
                pmcData.TradersInfo,
                questTypePool,
                repeatableConfig,
            );
            attemptsToGenerateQuest++;
            if (attemptsToGenerateQuest > 10)
            {
                this.logger.debug(
                    "We were stuck in repeatable quest generation. This should never happen. Please report",
                );
                break;
            }
        }

        return newRepeatableQuest;
    }
}
