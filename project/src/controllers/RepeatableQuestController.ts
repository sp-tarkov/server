import { inject, injectable } from "tsyringe";

import { HandbookHelper } from "../helpers/HandbookHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { PresetHelper } from "../helpers/PresetHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { RagfairServerHelper } from "../helpers/RagfairServerHelper";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { Exit, ILocationBase } from "../models/eft/common/ILocationBase";
import { IPmcData } from "../models/eft/common/IPmcData";
import { TraderInfo } from "../models/eft/common/tables/IBotBase";
import {
    IChangeRequirement, ICompletion, ICompletionAvailableFor, IElimination, IEliminationCondition,
    IExploration, IExplorationCondition, IKillConditionProps, IPmcDataRepeatableQuest,
    IRepeatableQuest, IReward, IRewards
} from "../models/eft/common/tables/IRepeatableQuests";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IRepeatableQuestChangeRequest } from "../models/eft/quests/IRepeatableQuestChangeRequest";
import { BaseClasses } from "../models/enums/BaseClasses";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { ELocationName } from "../models/enums/ELocationName";
import { HideoutAreas } from "../models/enums/HideoutAreas";
import { Money } from "../models/enums/Money";
import { QuestStatus } from "../models/enums/QuestStatus";
import { Traders } from "../models/enums/Traders";
import {
    IEliminationConfig, IQuestConfig, IRepeatableQuestConfig
} from "../models/spt/config/IQuestConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { ItemFilterService } from "../services/ItemFilterService";
import { LocalisationService } from "../services/LocalisationService";
import { PaymentService } from "../services/PaymentService";
import { ProfileFixerService } from "../services/ProfileFixerService";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { MathUtil } from "../utils/MathUtil";
import { ObjectId } from "../utils/ObjectId";
import { ProbabilityObject, ProbabilityObjectArray, RandomUtil } from "../utils/RandomUtil";
import { TimeUtil } from "../utils/TimeUtil";

export interface IQuestTypePool
{
    types: string[],
    pool: IQuestPool
}

export interface IQuestPool
{
    Exploration: IExplorationPool
    Elimination: IEliminationPool
}

export interface IExplorationPool
{
    locations: Partial<Record<ELocationName, string[]>>
}

export interface IEliminationPool
{
    targets: IEliminationTargetPool
}

export interface IEliminationTargetPool
{
    Savage?: ITargetLocation
    AnyPmc?: ITargetLocation
    bossBully?: ITargetLocation
    bossGluhar?: ITargetLocation
    bossKilla?: ITargetLocation
    bossSanitar?: ITargetLocation
    bossTagilla?: ITargetLocation
    bossKojaniy?: ITargetLocation
}

export interface ITargetLocation
{
    locations: string[]
}

@injectable()
export class RepeatableQuestController
{
    protected questConfig: IQuestConfig;

    constructor(
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * This is the method reached by the /client/repeatalbeQuests/activityPeriods endpoint
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
     *
     * @param   {string}    sessionId       Player's session id
     * @returns  {array}                    array of "repeatableQuestObjects" as descibed above
     */
    public getClientRepeatableQuests(_info: IEmptyRequestData, sessionID: string): IPmcDataRepeatableQuest[]
    {
        const returnData: Array<IPmcDataRepeatableQuest> = [];
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const time = this.timeUtil.getTimestamp();
        const scavQuestUnlocked = pmcData?.Hideout?.Areas?.find(hideoutArea => hideoutArea.type === HideoutAreas.INTEL_CENTER)?.level >= 1;
        
        // Daily / weekly / Daily_Savage
        for (const repeatableConfig of this.questConfig.repeatableQuests)
        {
            // get daily/weekly data from profile, add empty object if missing
            const currentRepeatableType = this.getRepeatableQuestSubTypeFromProfile(repeatableConfig, pmcData);
            
            if (repeatableConfig.side === "Pmc"
                && pmcData.Info.Level >= repeatableConfig.minPlayerLevel || repeatableConfig.side === "Scav" && scavQuestUnlocked)
            {
                if (time > currentRepeatableType.endTime - 1)
                {
                    currentRepeatableType.endTime = time + repeatableConfig.resetTime;
                    currentRepeatableType.inactiveQuests = [];
                    this.logger.debug(`Generating new ${repeatableConfig.name}`);

                    // put old quests to inactive (this is required since only then the client makes them fail due to non-completion)
                    // we also need to push them to the "inactiveQuests" list since we need to remove them from offraidData.profile.Quests
                    // after a raid (the client seems to keep quests internally and we want to get rid of old repeatable quests)
                    // and remove them from the PMC's Quests and RepeatableQuests[i].activeQuests
                    const questsToKeep = [];
                    //for (let i = 0; i < currentRepeatable.activeQuests.length; i++)
                    for (const activeQuest of currentRepeatableType.activeQuests)
                    {
                        // check if the quest is ready to be completed, if so, don't remove it
                        const quest = pmcData.Quests.filter(q => q.qid === activeQuest._id);
                        if (quest.length > 0)
                        {
                            if (quest[0].status === QuestStatus.AvailableForFinish)
                            {
                                questsToKeep.push(activeQuest);
                                this.logger.debug(`Keeping repeatable quest ${activeQuest._id} in activeQuests since it is available to AvailableForFinish`);
                                continue;
                            }
                        }
                        this.profileFixerService.removeDanglingConditionCounters(pmcData);
                        pmcData.Quests = pmcData.Quests.filter(q => q.qid !== activeQuest._id);
                        currentRepeatableType.inactiveQuests.push(activeQuest);
                    }
                    currentRepeatableType.activeQuests = questsToKeep;

                    // introduce a dynamic quest pool to avoid duplicates
                    const questTypePool = this.generateQuestPool(repeatableConfig, pmcData.Info.Level);

                    for (let i = 0; i < repeatableConfig.numQuests; i++)
                    {
                        let quest = null;
                        let lifeline = 0;
                        while (!quest && questTypePool.types.length > 0)
                        {
                            quest = this.generateRepeatableQuest(
                                pmcData.Info.Level,
                                pmcData.TradersInfo,
                                questTypePool,
                                repeatableConfig
                            );
                            lifeline++;
                            if (lifeline > 10)
                            {
                                this.logger.debug("We were stuck in repeatable quest generation. This should never happen. Please report.");
                                break;
                            }
                        }

                        // check if there are no more quest types available
                        if (questTypePool.types.length === 0)
                        {
                            break;
                        }
                        quest.side = repeatableConfig.side;
                        currentRepeatableType.activeQuests.push(quest);
                    }
                }
                else
                {
                    this.logger.debug(`[Quest Check] ${repeatableConfig.name} quests are still valid.`);
                }
            }

            // create stupid redundant change requirements from quest data
            for (const quest of currentRepeatableType.activeQuests)
            {
                currentRepeatableType.changeRequirement[quest._id] = {
                    changeCost: quest.changeCost,
                    changeStandingCost: quest.changeStandingCost
                };
            }

            returnData.push({
                id: this.objectId.generate(),
                name: currentRepeatableType.name,
                endTime: currentRepeatableType.endTime,
                activeQuests: currentRepeatableType.activeQuests,
                inactiveQuests: currentRepeatableType.inactiveQuests,
                changeRequirement: currentRepeatableType.changeRequirement
            });
        }

        return returnData;
    }

    /**
     * Get repeatable quest data from profile from name (daily/weekly), creates base repeatable quest object if none exists
     * @param repeatableConfig daily/weekly config
     * @param pmcData Profile to search
     * @returns IPmcDataRepeatableQuest
     */
    protected getRepeatableQuestSubTypeFromProfile(repeatableConfig: IRepeatableQuestConfig, pmcData: IPmcData): IPmcDataRepeatableQuest 
    {
        // Get from profile, add if missing
        let repeatableQuestDetails = pmcData.RepeatableQuests.find(x => x.name === repeatableConfig.name);
        if (!repeatableQuestDetails)
        {
            repeatableQuestDetails = {
                name: repeatableConfig.name,
                activeQuests: [],
                inactiveQuests: [],
                endTime: 0,
                changeRequirement: {}
            };

            // Add base object that holds repeatable data to profile
            pmcData.RepeatableQuests.push(repeatableQuestDetails);
        }

        return repeatableQuestDetails;
    }

    /**
     * This method is called by GetClientRepeatableQuests and creates one element of quest type format (see assets/database/templates/repeatableQuests.json).
     * It randomly draws a quest type (currently Elimination, Completion or Exploration) as well as a trader who is providing the quest
     */
    public generateRepeatableQuest(
        pmcLevel: number,
        pmcTraderInfo: Record<string, TraderInfo>,
        questTypePool: IQuestTypePool,
        repeatableConfig: IRepeatableQuestConfig
    ): IRepeatableQuest
    {
        const questType = this.randomUtil.drawRandomFromList<string>(questTypePool.types)[0];

        // get traders from whitelist and filter by quest type availability
        let traders = repeatableConfig.traderWhitelist.filter(x => x.questTypes.includes(questType)).map(x => x.traderId);
        // filter out locked traders
        traders = traders.filter(x => pmcTraderInfo[x].unlocked);
        const traderId = this.randomUtil.drawRandomFromList(traders)[0];

        switch (questType)
        {
            case "Elimination":
                return this.generateEliminationQuest(pmcLevel, traderId, questTypePool, repeatableConfig);
            case "Completion":
                return this.generateCompletionQuest(pmcLevel, traderId, repeatableConfig);
            case "Exploration":
                return this.generateExplorationQuest(pmcLevel, traderId, questTypePool, repeatableConfig);
            default:
                throw new Error(`Unknown mission type ${questType}. Should never be here!`);
        }
    }

    /**
     * Just for debug reasons. Draws dailies a random assort of dailies extracted from dumps
     */
    public generateDebugDailies(dailiesPool: any, factory: any, number: number): any
    {
        let randomQuests = [];
        if (factory)
        {
            // First is factory extract always add for debugging
            randomQuests.push(dailiesPool[0]);
            number -= 1;
        }

        randomQuests = randomQuests.concat(this.randomUtil.drawRandomFromList(dailiesPool, number, false));

        for (let i = 0; i < randomQuests.length; i++)
        {
            randomQuests[i]._id = this.objectId.generate();
            const conditions = randomQuests[i].conditions.AvailableForFinish;
            for (let j = 0; j < conditions.length; j++)
            {
                if ("counter" in conditions[j]._props)
                {
                    conditions[j]._props.counter.id = this.objectId.generate();
                }
            }
        }
        return randomQuests;
    }

    /**
     * Generates the base object of quest type format given as templates in assets/database/templates/repeatableQuests.json
     * The templates include Elimination, Completion and Extraction quest types
     *
     * @param   {string}    type            quest type: "Elimination", "Completion" or "Extraction"
     * @param   {string}    traderId        trader from which the quest will be provided
     * @param   {string}    side            scav daily or pmc daily/weekly quest  
     * @returns {object}                    a object which contains the base elements for repeatable quests of the requests type
     *                                      (needs to be filled with reward and conditions by called to make a valid quest)
     */
    // @Incomplete: define Type for "type".
    public generateRepeatableTemplate(type: string, traderId: string, side: string): IRepeatableQuest
    {
        const quest = this.jsonUtil.clone<IRepeatableQuest>(this.databaseServer.getTables().templates.repeatableQuests.templates[type]);
        quest._id = this.objectId.generate();
        quest.traderId = traderId;

        /*  in locale, these id correspond to the text of quests
            template ids -pmc  : Elimination = 616052ea3054fc0e2c24ce6e / Completion = 61604635c725987e815b1a46 / Exploration = 616041eb031af660100c9967
            template ids -scav : Elimination = 62825ef60e88d037dc1eb428 / Completion = 628f588ebb558574b2260fe5 / Exploration = 62825ef60e88d037dc1eb42c               
        */

        // Get template id from config based on side and type of quest
        quest.templateId = this.questConfig.questTemplateIds[side.toLowerCase()][type.toLowerCase()];

        quest.name = quest.name.replace("{traderId}", traderId).replace("{templateId}",quest.templateId);
        quest.note = quest.note.replace("{traderId}", traderId).replace("{templateId}",quest.templateId);
        quest.description = quest.description.replace("{traderId}", traderId).replace("{templateId}",quest.templateId);
        quest.successMessageText = quest.successMessageText.replace("{traderId}", traderId).replace("{templateId}",quest.templateId);
        quest.failMessageText = quest.failMessageText.replace("{traderId}", traderId).replace("{templateId}",quest.templateId);
        quest.startedMessageText = quest.startedMessageText.replace("{traderId}", traderId).replace("{templateId}",quest.templateId);
        quest.changeQuestMessageText = quest.changeQuestMessageText.replace("{traderId}", traderId).replace("{templateId}",quest.templateId);

        return quest;
    }

    /**
     * Generates a valid Exploration quest
     *
     * @param   {integer}   pmcLevel            player's level for reward generation
     * @param   {string}    traderId            trader from which the quest will be provided
     * @param   {object}    questTypePool       Pools for quests (used to avoid redundant quests)
     * @param   {object}    repeatableConfig    The configuration for the repeatably kind (daily, weekly) as configured in QuestConfig for the requestd quest
     * @returns {object}                        object of quest type format for "Exploration" (see assets/database/templates/repeatableQuests.json)
     */
    public generateExplorationQuest(
        pmcLevel: number,
        traderId: string,
        questTypePool: IQuestTypePool,
        repeatableConfig: IRepeatableQuestConfig
    ): IExploration
    {
        const explorationConfig = repeatableConfig.questConfig.Exploration;

        if (Object.keys(questTypePool.pool.Exploration.locations).length === 0)
        {
            // there are no more locations left for exploration; delete it as a possible quest type
            questTypePool.types = questTypePool.types.filter(t => t !== "Exploration");
            return null;
        }

        // if the location we draw is factory, it's possible to either get factory4_day and factory4_night or only one
        // of the both
        const locationKey: string = this.randomUtil.drawRandomFromDict(questTypePool.pool.Exploration.locations)[0];
        const locationTarget = questTypePool.pool.Exploration.locations[locationKey];

        // remove the location from the available pool
        delete questTypePool.pool.Exploration.locations[locationKey];

        const numExtracts = this.randomUtil.randInt(1, explorationConfig.maxExtracts + 1);

        const quest = this.generateRepeatableTemplate("Exploration", traderId,repeatableConfig.side) as IExploration;

        const exitStatusCondition: IExplorationCondition = {
            _parent: "ExitStatus",
            _props: {
                id: this.objectId.generate(),
                dynamicLocale: true,
                status: [
                    "Survived"
                ]
            }
        };
        const locationCondition: IExplorationCondition = {
            _parent: "Location",
            _props: {
                id: this.objectId.generate(),
                dynamicLocale: true,
                target: locationTarget
            }
        };

        quest.conditions.AvailableForFinish[0]._props.counter.id = this.objectId.generate();
        quest.conditions.AvailableForFinish[0]._props.counter.conditions = [
            exitStatusCondition,
            locationCondition
        ];
        quest.conditions.AvailableForFinish[0]._props.value = numExtracts;
        quest.conditions.AvailableForFinish[0]._props.id = this.objectId.generate();
        quest.location = this.getQuestLocationByMapId(locationKey);

        if (Math.random() < repeatableConfig.questConfig.Exploration.specificExits.probability)
        {
            // Filter by whitelist, it's also possible that the field "PassageRequirement" does not exist (e.g. Shoreline)
            // Scav exits are not listed at all in locations.base currently. If that changes at some point, additional filtering will be required
            const mapExits = (this.databaseServer.getTables().locations[locationKey.toLowerCase()].base as ILocationBase).exits;
            const possibleExists = mapExits.filter(
                x => (!("PassageRequirement" in x)
                    || repeatableConfig.questConfig.Exploration.specificExits.passageRequirementWhitelist.includes(x.PassageRequirement))
                    && x.Chance > 0
            );
            const exit = this.randomUtil.drawRandomFromList(possibleExists, 1)[0];
            const exitCondition = this.generateExplorationExitCondition(exit);
            quest.conditions.AvailableForFinish[0]._props.counter.conditions.push(exitCondition);
        }

        // Difficulty for exploration goes from 1 extract to maxExtracts
        // Difficulty for reward goes from 0.2...1 -> map
        const difficulty = this.mathUtil.mapToRange(numExtracts, 1, explorationConfig.maxExtracts, 0.2, 1);
        quest.rewards = this.generateReward(pmcLevel, difficulty, traderId, repeatableConfig);

        return quest;
    }

    /**
     * Generates a valid Completion quest
     *
     * @param   {integer}   pmcLevel            player's level for requested items and reward generation
     * @param   {string}    traderId            trader from which the quest will be provided
     * @param   {object}    repeatableConfig    The configuration for the repeatably kind (daily, weekly) as configured in QuestConfig for the requestd quest
     * @returns {object}                        object of quest type format for "Completion" (see assets/database/templates/repeatableQuests.json)
     */
    public generateCompletionQuest(
        pmcLevel: number,
        traderId: string,
        repeatableConfig: IRepeatableQuestConfig
    ): ICompletion
    {
        const completionConfig = repeatableConfig.questConfig.Completion;
        const levelsConfig = repeatableConfig.rewardScaling.levels;
        const roublesConfig = repeatableConfig.rewardScaling.roubles;

        // in the available dumps only 2 distinct items were ever requested
        let numberDistinctItems = 1;
        if (Math.random() > 0.75)
        {
            numberDistinctItems = 2;
        }

        const quest = this.generateRepeatableTemplate("Completion", traderId,repeatableConfig.side) as ICompletion;

        // Filter the items.json items to items the player must retrieve to complete queist: shouldn't be a quest item or "non-existant"
        let itemSelection = this.getRewardableItems(repeatableConfig);

        // Be fair, don't let the items be more expensive than the reward
        let roublesBudget = Math.floor(this.mathUtil.interp1(pmcLevel, levelsConfig, roublesConfig) * this.randomUtil.getFloat(0.5, 1));
        roublesBudget = Math.max(roublesBudget, 5000);
        itemSelection = itemSelection.filter(x => this.itemHelper.getItemPrice(x[0]) < roublesBudget);

        // We also have the option to use whitelist and/or blacklist which is defined in repeatableQuests.json as
        // [{"minPlayerLevel": 1, "itemIds": ["id1",...]}, {"minPlayerLevel": 15, "itemIds": ["id3",...]}]
        if (repeatableConfig.questConfig.Completion.useWhitelist)
        {
            const itemWhitelist = this.databaseServer.getTables().templates.repeatableQuests.data.Completion.itemsWhitelist;

            // Filter and concatenate the arrays according to current player level
            const itemIdsWhitelisted = itemWhitelist.filter(p => p.minPlayerLevel <= pmcLevel).reduce((a, p) => a.concat(p.itemIds), []);
            itemSelection = itemSelection.filter(x =>
            {
                // Whitelist can contain item tpls and item base type ids
                return (itemIdsWhitelisted.some(v => this.itemHelper.isOfBaseclass(x[0], v)) || itemIdsWhitelisted.includes(x[0]));
            });
            // check if items are missing
            //const flatList = itemSelection.reduce((a, il) => a.concat(il[0]), []);
            //const missing = itemIdsWhitelisted.filter(l => !flatList.includes(l));
        }

        if (repeatableConfig.questConfig.Completion.useBlacklist)
        {
            const itemBlacklist = this.databaseServer.getTables().templates.repeatableQuests.data.Completion.itemsBlacklist;
            // we filter and concatenate the arrays according to current player level
            const itemIdsBlacklisted = itemBlacklist.filter(p => p.minPlayerLevel <= pmcLevel).reduce((a, p) => a.concat(p.itemIds), []);
            itemSelection = itemSelection.filter(x =>
            {
                return itemIdsBlacklisted.every(v => !this.itemHelper.isOfBaseclass(x[0], v)) || !itemIdsBlacklisted.includes(x[0]);
            });
        }

        if (itemSelection.length === 0)
        {
            this.logger.error(this.localisationService.getText("repeatable-completion_quest_whitelist_too_small_or_blacklist_too_restrictive"));

            return null;
        }

        // Draw items to ask player to retrieve
        for (let i = 0; i < numberDistinctItems; i++)
        {
            const itemSelected = itemSelection[this.randomUtil.randInt(itemSelection.length)];
            const itemUnitPrice = this.itemHelper.getItemPrice(itemSelected[0]);
            let minValue = completionConfig.minRequestedAmount;
            let maxValue = completionConfig.maxRequestedAmount;
            if (this.itemHelper.isOfBaseclass(itemSelected[0], BaseClasses.AMMO))
            {
                minValue = completionConfig.minRequestedBulletAmount;
                maxValue = completionConfig.maxRequestedBulletAmount;
            }
            let value = minValue;

            // get the value range within budget
            maxValue = Math.min(maxValue, Math.floor(roublesBudget / itemUnitPrice));
            if (maxValue > minValue)
            {
                // if it doesn't blow the budget we have for the request, draw a random amount of the selected
                // item type to be requested
                value = this.randomUtil.randInt(minValue, maxValue + 1);
            }
            roublesBudget -= value * itemUnitPrice;

            // push a CompletionCondition with the item and the amount of the item
            quest.conditions.AvailableForFinish.push(this.generateCompletionAvailableForFinish(itemSelected[0], value));

            if (roublesBudget > 0)
            {
                // reduce the list possible items to fulfill the new budget constraint
                itemSelection = itemSelection.filter(x => this.itemHelper.getItemPrice(x[0]) < roublesBudget);
                if (itemSelection.length === 0)
                {
                    break;
                }
            }
            else
            {
                break;
            }
        }

        quest.rewards = this.generateReward(pmcLevel, 1, traderId, repeatableConfig);

        return quest;
    }

    /**
     * Generates a valid Elimination quest
     *
     * @param   {integer}   pmcLevel            player's level for requested items and reward generation
     * @param   {string}    traderId            trader from which the quest will be provided
     * @param   {object}    questTypePool       Pools for quests (used to avoid redundant quests)
     * @param   {object}    repeatableConfig    The configuration for the repeatably kind (daily, weekly) as configured in QuestConfig for the requestd quest
     * @returns {object}                        object of quest type format for "Elimination" (see assets/database/templates/repeatableQuests.json)
     */
    public generateEliminationQuest(
        pmcLevel: number,
        traderId: string,
        questTypePool: IQuestTypePool,
        repeatableConfig: IRepeatableQuestConfig
    ): IElimination
    {
        const eliminationConfig = this.getEliminationConfigByPmcLevel(pmcLevel, repeatableConfig);
        const locationsConfig = repeatableConfig.locations;
        let targetsConfig = this.probabilityObjectArray(eliminationConfig.targets);
        const bodypartsConfig = this.probabilityObjectArray(eliminationConfig.bodyParts);

        // the difficulty of the quest varies in difficulty depending on the condition
        // possible conditions are
        // - amount of npcs to kill
        // - type of npc to kill (scav, boss, pmc)
        // - with hit to what body part they should be killed
        // - from what distance they should be killed
        // a random combination of listed conditions can be required
        // possible conditions elements and their relative probability can be defined in QuestConfig.js
        // We use ProbabilityObjectArray to draw by relative probability. e.g. for targets:
        // "targets": {
        //    "Savage": 7,
        //    "AnyPmc": 2,
        //    "bossBully": 0.5
        //}
        // higher is more likely. We define the difficulty to be the inverse of the relative probability.

        // We want to generate a reward which is scaled by the difficulty of this mission. To get a upper bound with which we scale
        // the actual difficulty we calculate the minimum and maximum difficulty (max being the sum of max of each condition type
        // times the number of kills we have to perform):

        // the minumum difficulty is the difficulty for the most probable (= easiest target) with no additional conditions
        const minDifficulty = 1 / targetsConfig.maxProbability(); // min difficulty is lowest amount of scavs without any constraints

        // Target on bodyPart max. difficulty is that of the least probable element
        const maxTargetDifficulty = 1 / targetsConfig.minProbability();
        const maxBodyPartsDifficulty = eliminationConfig.minKills / bodypartsConfig.minProbability();

        // maxDistDifficulty is defined by 2, this could be a tuning parameter if we don't like the reward generation
        const maxDistDifficulty = 2;

        const maxKillDifficulty = eliminationConfig.maxKills;

        function difficultyWeighing(target: number, bodyPart: number, dist: number, kill: number): number
        {
            return Math.sqrt(Math.sqrt(target) + bodyPart + dist) * kill;
        }

        targetsConfig = targetsConfig.filter(x => Object.keys(questTypePool.pool.Elimination.targets).includes(x.key));
        if (targetsConfig.length === 0 || targetsConfig.every(x => x.data.isBoss))
        {
            // there are no more targets left for elimination; delete it as a possible quest type
            // also if only bosses are left we need to leave otherwise it's a guaranteed boss elimination
            // -> then it would not be a quest with low probability anymore
            questTypePool.types = questTypePool.types.filter(t => t !== "Elimination");
            return null;
        }

        const targetKey = targetsConfig.draw()[0];
        const targetDifficulty = 1 / targetsConfig.probability(targetKey);

        let locations = questTypePool.pool.Elimination.targets[targetKey].locations;
        // we use any as location if "any" is in the pool and we do not hit the specific location random
        // we use any also if the random condition is not met in case only "any" was in the pool
        let locationKey = "any";
        if (locations.includes("any") && (eliminationConfig.specificLocationProb < Math.random() || locations.length <= 1))
        {
            locationKey = "any";
            delete questTypePool.pool.Elimination.targets[targetKey];
        }
        else
        {
            locations = locations.filter(l => l !== "any");
            if (locations.length > 0)
            {
                locationKey = this.randomUtil.drawRandomFromList<string>(locations)[0];
                questTypePool.pool.Elimination.targets[targetKey].locations = locations.filter(l => l !== locationKey);
                if (questTypePool.pool.Elimination.targets[targetKey].locations.length === 0)
                {
                    delete questTypePool.pool.Elimination.targets[targetKey];
                }
            }
            else
            {
                // never should reach this if everything works out
                this.logger.debug("Ecountered issue when creating Elimination quest. Please report.");
            }
        }

        // draw the target body part and calculate the difficulty factor
        let bodyPartsToClient = null;
        let bodyPartDifficulty = 0;
        if (eliminationConfig.bodyPartProb > Math.random())
        {
            // if we add a bodyPart condition, we draw randomly one or two parts
            // each bodyPart of the BODYPARTS ProbabilityObjectArray includes the string(s) which need to be presented to the client in ProbabilityObjectArray.data
            // e.g. we draw "Arms" from the probability array but must present ["LeftArm", "RightArm"] to the client
            bodyPartsToClient = [];
            const bodyParts = bodypartsConfig.draw(this.randomUtil.randInt(1, 3), false);
            let probability = 0;
            for (const bi of bodyParts)
            {
                // more than one part lead to an "OR" condition hence more parts reduce the difficulty
                probability += bodypartsConfig.probability(bi);
                for (const biClient of bodypartsConfig.data(bi))
                {
                    bodyPartsToClient.push(biClient);
                }
            }
            bodyPartDifficulty = 1 / probability;
        }

        // draw a distance condition
        let distance = null;
        let distanceDifficulty = 0;
        let isDistanceRequirementAllowed = !eliminationConfig.distLocationBlacklist.includes(locationKey);

        if (targetsConfig.data(targetKey).isBoss)
        {
            // get all boss spawn information
            const bossSpawns = Object.values(this.databaseServer.getTables().locations).filter(x => "base" in x && "Id" in x.base).map(
                (x) => ({ "Id": x.base.Id, "BossSpawn": x.base.BossLocationSpawn })
            );
            // filter for the current boss to spawn on map
            const thisBossSpawns = bossSpawns.map(
                (x) => ({ "Id": x.Id, "BossSpawn": x.BossSpawn.filter(e => e.BossName === targetKey) })
            ).filter(x => x.BossSpawn.length > 0);
            // remove blacklisted locations
            const allowedSpawns = thisBossSpawns.filter(x => !eliminationConfig.distLocationBlacklist.includes(x.Id));
            // if the boss spawns on nom-blacklisted locations and the current location is allowed we can generate a distance kill requirement
            isDistanceRequirementAllowed = isDistanceRequirementAllowed && (allowedSpawns.length > 0);
        }

        if (eliminationConfig.distProb > Math.random() && isDistanceRequirementAllowed)
        {
            // random distance with lower values more likely; simple distribution for starters...
            distance = Math.floor(Math.abs(Math.random() - Math.random()) * (1 + eliminationConfig.maxDist - eliminationConfig.minDist) + eliminationConfig.minDist);
            distance = Math.ceil(distance / 5) * 5;
            distanceDifficulty = maxDistDifficulty * distance / eliminationConfig.maxDist;
        }

        // draw how many npcs are required to be killed
        const kills = this.randomUtil.randInt(eliminationConfig.minKills, eliminationConfig.maxKills + 1);
        const killDifficulty = kills;

        // not perfectly happy here; we give difficulty = 1 to the quest reward generation when we have the most diffucult mission
        // e.g. killing reshala 5 times from a distance of 200m with a headshot.
        const maxDifficulty = difficultyWeighing(1, 1, 1, 1);
        const curDifficulty = difficultyWeighing(
            targetDifficulty / maxTargetDifficulty,
            bodyPartDifficulty / maxBodyPartsDifficulty,
            distanceDifficulty / maxDistDifficulty,
            killDifficulty / maxKillDifficulty
        );

        // aforementioned issue makes it a bit crazy since now all easier quests give significantly lower rewards than Completion / Exploration
        // I therefore moved the mapping a bit up (from 0.2...1 to 0.5...2) so that normal difficulty still gives good reward and having the
        // crazy maximum difficulty will lead to a higher difficulty reward gain factor than 1
        const difficulty = this.mathUtil.mapToRange(curDifficulty, minDifficulty, maxDifficulty, 0.5, 2);

        const quest = this.generateRepeatableTemplate("Elimination", traderId,repeatableConfig.side) as IElimination;

        quest.conditions.AvailableForFinish[0]._props.counter.id = this.objectId.generate();
        quest.conditions.AvailableForFinish[0]._props.counter.conditions = [];
        if (locationKey !== "any")
        {
            quest.conditions.AvailableForFinish[0]._props.counter.conditions.push(this.generateEliminationLocation(locationsConfig[locationKey]));
        }
        quest.conditions.AvailableForFinish[0]._props.counter.conditions.push(this.generateEliminationCondition(targetKey, bodyPartsToClient, distance));
        quest.conditions.AvailableForFinish[0]._props.value = kills;
        quest.conditions.AvailableForFinish[0]._props.id = this.objectId.generate();
        quest.location = this.getQuestLocationByMapId(locationKey);

        quest.rewards = this.generateReward(pmcLevel, Math.min(difficulty, 1), traderId, repeatableConfig);

        return quest;
    }

    /**
     * Get the relevant elimination config based on the current players PMC level
     * @param pmcLevel Level of PMC character
     * @param repeatableConfig Main repeatable config
     * @returns IEliminationConfig
     */
    protected getEliminationConfigByPmcLevel(pmcLevel: number, repeatableConfig: IRepeatableQuestConfig): IEliminationConfig
    {
        return repeatableConfig.questConfig.Elimination.find(x => pmcLevel >= x.levelRange.min && pmcLevel <= x.levelRange.max);
    }

    /**
     * Convert a location into an quest code can read (e.g. factory4_day into 55f2d3fd4bdc2d5f408b4567)
     * @param locationKey e.g factory4_day
     * @returns guid
     */
    protected getQuestLocationByMapId(locationKey: string): string
    {
        return this.questConfig.locationIdMap[locationKey];
    }

    /**
     * Exploration repeatable quests can specify a required extraction point.
     * This method creates the according object which will be appended to the conditions array
     *
     * @param   {string}        exit                The exit name to generate the condition for
     * @returns {object}                            Exit condition
     */
    public generateExplorationExitCondition(exit: Exit): IExplorationCondition
    {
        return {
            _parent: "ExitName",
            _props: {
                exitName: exit.Name,
                id: this.objectId.generate(),
                dynamicLocale: true
            }
        };
    }


    /**
     * A repeatable quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/repeatableQuests.json)
     * This is a helper method for GenerateCompletionQuest to create a completion condition (of which a completion quest theoretically can have many)
     *
     * @param   {string}    targetItemId    id of the item to request
     * @param   {integer}   value           amount of items of this specific type to request
     * @returns {object}                    object of "Completion"-condition
     */
    public generateCompletionAvailableForFinish(targetItemId: string, value: number): ICompletionAvailableFor
    {
        let minDurability = 0;
        let onlyFoundInRaid = true;
        if (this.itemHelper.isOfBaseclass(targetItemId, BaseClasses.WEAPON) || this.itemHelper.isOfBaseclass(targetItemId, BaseClasses.ARMOR))
        {
            minDurability = 80;
        }

        if (this.itemHelper.isOfBaseclass(targetItemId, BaseClasses.DOG_TAG_USEC) || this.itemHelper.isOfBaseclass(targetItemId, BaseClasses.DOG_TAG_BEAR))
        {
            onlyFoundInRaid = false;
        }

        return {
            _props: {
                id: this.objectId.generate(),
                parentId: "",
                dynamicLocale: true,
                index: 0,
                visibilityConditions: [],
                target: [targetItemId],
                value: value,
                minDurability: minDurability,
                maxDurability: 100,
                dogtagLevel: 0,
                onlyFoundInRaid: onlyFoundInRaid
            },
            _parent: "HandoverItem",
            dynamicLocale: true
        };
    }

    /**
     * A repeatable quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/repeatableQuests.json)
     * This is a helper method for GenerateEliminationQuest to create a location condition.
     *
     * @param   {string}    location        the location on which to fulfill the elimination quest
     * @returns {object}                    object of "Elimination"-location-subcondition
     */
    public generateEliminationLocation(location: string[]): IEliminationCondition
    {

        return {
            _props: {
                target: location,
                id: this.objectId.generate(),
                dynamicLocale: true
            },
            _parent: "Location"
        };
    }

    /**
     * A repeatable quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/repeatableQuests.json)
     * This is a helper method for GenerateEliminationQuest to create a kill condition.
     *
     * @param   {string}    target          array of target npcs e.g. "AnyPmc", "Savage"
     * @param   {array}     bodyParts       array of body parts with which to kill e.g. ["stomach", "thorax"]
     * @param   {number}    distance        distance from which to kill (currently only >= supported)
     * @returns {object}                    object of "Elimination"-kill-subcondition
     */
    public generateEliminationCondition(target: string, bodyPart: string[], distance: number): IEliminationCondition
    {
        const killConditionProps: IKillConditionProps = {
            target: target,
            value: 1,
            id: this.objectId.generate(),
            dynamicLocale: true
        };

        if (target.startsWith("boss"))
        {
            killConditionProps.target = "Savage";
            killConditionProps.savageRole = [target];
        }

        if (bodyPart)
        {
            killConditionProps.bodyPart = bodyPart;
        }

        if (distance)
        {
            killConditionProps.distance = {
                compareMethod: ">=",
                value: distance
            };
        }

        return {
            _props: killConditionProps,
            _parent: "Kills"
        };
    }

    /**
     * Used to create a quest pool during each cycle of repeatable quest generation. The pool will be subsequently
     * narrowed down during quest generation to avoid duplicate quests. Like duplicate extractions or elimination quests
     * where you have to e.g. kill scavs in same locations.
     * @param repeatableConfig main repeatable quest config
     * @param pmcLevel level of pmc generating quest pool
     * @returns IQuestTypePool
     */
    public generateQuestPool(repeatableConfig: IRepeatableQuestConfig, pmcLevel: number): IQuestTypePool
    {
        const questPool: IQuestTypePool = {
            types: repeatableConfig.types.slice(),
            pool: {
                Exploration: {
                    locations: {}
                },
                Elimination: {
                    targets: {}
                }
            }
        };
        for (const location in repeatableConfig.locations)
        {
            if (location !== ELocationName.ANY)
            {
                questPool.pool.Exploration.locations[location] = repeatableConfig.locations[location];
            }
        }
        const eliminationConfig = this.getEliminationConfigByPmcLevel(pmcLevel, repeatableConfig);
        const targetsConfig = this.probabilityObjectArray(eliminationConfig.targets);
        for (const probabilityObject of targetsConfig)
        {
            // Target is boss
            if (probabilityObject.data.isBoss)
            {
                questPool.pool.Elimination.targets[probabilityObject.key] = { locations: ["any"] };
            }
            else
            {
                const possibleLocations = Object.keys(repeatableConfig.locations);

                // Set possible locations for elimination task, ift arget is savage, exclude labs from locations
                questPool.pool.Elimination.targets[probabilityObject.key] = (probabilityObject.key === "Savage")
                    ? { locations: possibleLocations.filter(x => x !== "laboratory")}
                    : { locations: possibleLocations };
            }
        }

        return questPool;
    }

    /**
     * Generate the reward for a mission. A reward can consist of
     * - Experience
     * - Money
     * - Items
     * - Trader Reputation
     *
     * The reward is dependent on the player level as given by the wiki. The exact mapping of pmcLevel to
     * experience / money / items / trader reputation can be defined in QuestConfig.js
     *
     * There's also a random variation of the reward the spread of which can be also defined in the config.
     *
     * Additonaly, a scaling factor w.r.t. quest difficulty going from 0.2...1 can be used
     *
     * @param   {integer}   pmcLevel            player's level
     * @param   {number}    difficulty          a reward scaling factor goint from 0.2 to 1
     * @param   {string}    traderId            the trader for reputation gain (and possible in the future filtering of reward item type based on trader)
     * @param   {object}    repeatableConfig    The configuration for the repeatably kind (daily, weekly) as configured in QuestConfig for the requestd quest
     * @returns {object}                        object of "Reward"-type that can be given for a repeatable mission
     */
    public generateReward(
        pmcLevel: number,
        difficulty: number,
        traderId: string,
        repeatableConfig: IRepeatableQuestConfig
    ): IRewards
    {
        // difficulty could go from 0.2 ... -> for lowest diffuculty receive 0.2*nominal reward
        const levelsConfig = repeatableConfig.rewardScaling.levels;
        const roublesConfig = repeatableConfig.rewardScaling.roubles;
        const xpConfig = repeatableConfig.rewardScaling.experience;
        const itemsConfig = repeatableConfig.rewardScaling.items;
        const rewardSpreadConfig = repeatableConfig.rewardScaling.rewardSpread;
        const reputationConfig = repeatableConfig.rewardScaling.reputation;

        if (isNaN(difficulty))
        {
            difficulty = 1;
            this.logger.warning(this.localisationService.getText("repeatable-difficulty_was_nan"));
        }

        // rewards are generated based on pmcLevel, difficulty and a random spread
        const rewardXP = Math.floor(difficulty * this.mathUtil.interp1(pmcLevel, levelsConfig, xpConfig) * this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig));
        const rewardRoubles = Math.floor(difficulty * this.mathUtil.interp1(pmcLevel, levelsConfig, roublesConfig) * this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig));
        const rewardNumItems = this.randomUtil.randInt(1, Math.round(this.mathUtil.interp1(pmcLevel, levelsConfig, itemsConfig)) + 1);
        const rewardReputation = Math.round(100 * difficulty * this.mathUtil.interp1(pmcLevel, levelsConfig, reputationConfig)
            * this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig)) / 100;


        // possible improvement -> draw trader-specific items e.g. with this.itemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.FoodDrink)
        let roublesBudget = rewardRoubles;

        // first filter for type and baseclass to avoid lookup in handbook for non-available items
        const rewardableItems = this.getRewardableItems(repeatableConfig);
        // blacklist
        // rome-ignore lint/complexity/useSimplifiedLogicExpression: <explanation>
        let  itemSelection = rewardableItems.filter(x => !this.itemHelper.isOfBaseclass(x[0], BaseClasses.DOG_TAG_USEC)
            && !this.itemHelper.isOfBaseclass(x[0], BaseClasses.DOG_TAG_BEAR)
            && !this.itemHelper.isOfBaseclass(x[0], BaseClasses.MOUNT)
        );
        const minPrice = Math.min(25000, 0.5 * roublesBudget);
        itemSelection = itemSelection.filter(x => this.itemHelper.getItemPrice(x[0]) < roublesBudget && this.itemHelper.getItemPrice(x[0]) > minPrice);
        if (itemSelection.length === 0)
        {
            this.logger.warning(this.localisationService.getText("repeatable-no_reward_item_found_in_price_range", {minPrice: minPrice, roublesBudget: roublesBudget}));
            // in case we don't find any items in the price range
            // rome-ignore lint/complexity/useSimplifiedLogicExpression: <explanation>
            itemSelection  = rewardableItems.filter(x => !this.itemHelper.isOfBaseclass(x[0], BaseClasses.DOG_TAG_USEC)
                && !this.itemHelper.isOfBaseclass(x[0], BaseClasses.DOG_TAG_BEAR)
                && !this.itemHelper.isOfBaseclass(x[0], BaseClasses.MOUNT)
                && this.itemHelper.getItemPrice(x[0]) < roublesBudget
            );
        }


        const rewards: IRewards = {
            Started: [],
            Success: [
                {
                    "value": rewardXP,
                    "type": "Experience",
                    "index": 0
                }
            ],
            Fail: []
        };

        if (traderId === Traders.PEACEKEEPER)
        {
            // convert to equivalent dollars
            rewards.Success.push(this.generateRewardItem(Money.DOLLARS, this.handbookHelper.fromRUB(rewardRoubles, Money.DOLLARS), 1));
        }
        else
        {
            rewards.Success.push(this.generateRewardItem(Money.ROUBLES, rewardRoubles, 1));
        }

        let index = 2;
        if (itemSelection.length > 0)
        {
            for (let i = 0; i < rewardNumItems; i++)
            {
                let value = 1;
                let children = null;
                const itemSelected = itemSelection[this.randomUtil.randInt(itemSelection.length)];
                if (this.itemHelper.isOfBaseclass(itemSelected[0], BaseClasses.AMMO))
                {
                    // Dont reward ammo that stacks to less than what's defined in config
                    if (itemSelected[1]._props.StackMaxSize < repeatableConfig.rewardAmmoStackMinSize)
                    {
                        continue;
                    }

                    // if we provide ammo we don't want to provide just one bullet
                    value = this.randomUtil.randInt(repeatableConfig.rewardAmmoStackMinSize, itemSelected[1]._props.StackMaxSize);
                }
                else if (this.itemHelper.isOfBaseclass(itemSelected[0], BaseClasses.WEAPON))
                {
                    const presets = this.presetHelper.getPresets(itemSelected[0]);
                    const defaultPreset = presets.find(x => x._encyclopedia);
                    if (defaultPreset)
                    {
                        children = this.ragfairServerHelper.reparentPresets(defaultPreset._items[0], defaultPreset._items);
                    }
                }
                rewards.Success.push(this.generateRewardItem(itemSelected[0], value, index, children));

                // TODO: maybe also non-default use ragfair to calculate the price
                // this.ragfairServer.getWeaponPresetPrice(item, items, existingPrice)

                roublesBudget -= value * this.itemHelper.getItemPrice(itemSelected[0]);
                index += 1;

                // if we still have budget narrow down the items
                if (roublesBudget > 0)
                {
                    itemSelection = itemSelection.filter(x => this.itemHelper.getItemPrice(x[0]) < roublesBudget);
                    if (itemSelection.length === 0)
                    {
                        break;
                    }
                }
                else
                {
                    break;
                }
            }
        }

        if (rewardReputation > 0)
        {
            const reward: IReward = {
                target: traderId,
                value: rewardReputation,
                type: "TraderStanding",
                index: index
            };
            rewards.Success.push(reward);
        }

        return rewards;
    }

    /**
     * Helper to create a reward item structured as required by the client
     *
     * @param   {string}    tpl             itemId of the rewarded item
     * @param   {integer}   value           amount of items to give
     * @param   {integer}   index           all rewards will be appended to a list, for unkown reasons the client wants the index
     * @returns {object}                    object of "Reward"-item-type
     */
    public generateRewardItem(tpl: string, value: number, index: number, preset = null): IReward
    {
        const id = this.objectId.generate();
        const rewardItem: IReward = {
            target: id,
            value: value,
            type: "Item",
            index: index
        };

        const rootItem = {
            "_id": id,
            "_tpl": tpl,
            "upd": {
                "StackObjectsCount": value
            }
        };

        if (preset)
        {
            rewardItem.items = this.ragfairServerHelper.reparentPresets(rootItem, preset);
        }
        else
        {
            rewardItem.items = [rootItem];
        }
        return rewardItem;
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

    public probabilityObjectArray<K, V>(configArrayInput: ProbabilityObject<K, V>[]): ProbabilityObjectArray<K, V>
    {
        const configArray = this.jsonUtil.clone(configArrayInput);
        const probabilityArray = new ProbabilityObjectArray<K, V>(this.mathUtil);
        for (const configObject of configArray)
        {
            probabilityArray.push(new ProbabilityObject(configObject.key, configObject.relativeProbability, configObject.data));
        }
        return probabilityArray;
    }

    public changeRepeatableQuest(pmcData: IPmcData, body: IRepeatableQuestChangeRequest, sessionID: string): IItemEventRouterResponse
    {
        let repeatableToChange: IPmcDataRepeatableQuest;
        let changeRequirement: IChangeRequirement;
        let existingQuestTraderId: string;

        // Daily or weekly
        for (const currentRepeatable of pmcData.RepeatableQuests)
        {
            // Check for existing quest in (daily/weekly arrays)
            const existingQuest = currentRepeatable.activeQuests.find(x => x._id === body.qid);
            if (existingQuest)
            {
                existingQuestTraderId = existingQuest.traderId;
            }

            const numQuests = currentRepeatable.activeQuests.length;
            currentRepeatable.activeQuests = currentRepeatable.activeQuests.filter(x => x._id !== body.qid);
            if (numQuests > currentRepeatable.activeQuests.length)
            {
                // Get saved costs to replace existing quest
                changeRequirement = this.jsonUtil.clone(currentRepeatable.changeRequirement[body.qid]);
                delete currentRepeatable.changeRequirement[body.qid];
                const repeatableConfig = this.questConfig.repeatableQuests.find(x => x.name === currentRepeatable.name);
                const questTypePool = this.generateQuestPool(repeatableConfig, pmcData.Info.Level);
                // TODO: somehow we need to reduce the questPool by the currently active quests (for all repeatables)
                let quest: IRepeatableQuest = null;
                let lifeline = 0;
                while (!quest && questTypePool.types.length > 0)
                {
                    quest = this.generateRepeatableQuest(
                        pmcData.Info.Level,
                        pmcData.TradersInfo,
                        questTypePool,
                        repeatableConfig
                    );
                    lifeline++;
                    if (lifeline > 10)
                    {
                        this.logger.debug("We were stuck in repeatable quest generation. This should never happen. Please report.");
                        break;
                    }
                }
                if (quest)
                {
                    // Add newly generated quest to daily/weekly array
                    quest.side = repeatableConfig.side;
                    currentRepeatable.activeQuests.push(quest);
                    currentRepeatable.changeRequirement[quest._id] = {
                        changeCost: quest.changeCost,
                        changeStandingCost: quest.changeStandingCost
                    };
                }
                // we found and replaced the quest in current repeatable
                repeatableToChange = this.jsonUtil.clone(currentRepeatable);
                delete repeatableToChange.inactiveQuests;
                break;
            }
        }
        let output = this.eventOutputHolder.getOutput(sessionID);

        if (!repeatableToChange)
        {
            return this.httpResponse.appendErrorToOutput(output, "Could not find repeatable to replace");
        }

        for (const cost of changeRequirement.changeCost)
        {
            output = this.paymentService.addPaymentToOutput(pmcData, cost.templateId, cost.count, sessionID, output);
            if (output.warnings.length > 0)
            {
                return output;
            }
        }

        // Reduce standing with trader for not doing their quest
        const droppedQuestTrader = pmcData.TradersInfo[existingQuestTraderId];
        output.profileChanges[sessionID].traderRelations = {
            traderId: {
                saleSum: droppedQuestTrader.salesSum,
                standing: droppedQuestTrader.standing
            }
        };

        output.profileChanges[sessionID].repeatableQuests = [repeatableToChange];

        return output;
    }

    /**
    * Picks rewardable items from items.json. This means they need to fit into the inventory and they shouldn't be keys (debatable)
     * @param repeatableQuestConfig config file
     * @returns a list of rewardable items [[_tpl, itemTemplate],...]
     */
    protected getRewardableItems(repeatableQuestConfig: IRepeatableQuestConfig): [string, ITemplateItem][]
    {
        // check for specific baseclasses which don't make sense as reward item
        // also check if the price is greater than 0; there are some items whose price can not be found
        // those are not in the game yet (e.g. AGS grenade launcher)
        return Object.entries(this.databaseServer.getTables().templates.items).filter(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ([tpl, itemTemplate]) => this.isValidRewardItem(tpl, repeatableQuestConfig)
        );
    }

    /**
     * Checks if an id is a valid item. Valid meaning that it's an item that may be a reward
     * or content of bot loot. Items that are tested as valid may be in a player backpack or stash.
     * @param {string} tpl template id of item to check
     * @returns boolean: true if item is valid reward
     */
    public isValidRewardItem(tpl: string, repeatableQuestConfig: IRepeatableQuestConfig): boolean
    {
        let valid = this.itemHelper.isValidItem(tpl);
        if (!valid)
        {
            return valid; // not valid item
        }

        // Item is on repeatable or global blacklist
        if (repeatableQuestConfig.rewardBlacklist.includes(tpl)
            || this.itemFilterService.isItemBlacklisted(tpl))
        {
            return false;
        }

        // Item has blacklisted base type
        for (const baseType of repeatableQuestConfig.rewardBaseTypeBlacklist)
        {
            if (this.itemHelper.isOfBaseclass(tpl, baseType))
            {
                return false;
            }
        }

        // rome-ignore lint/complexity/useSimplifiedLogicExpression: <explanation>
        valid  = !this.itemHelper.isOfBaseclass(tpl, BaseClasses.KEY)
            && !this.itemHelper.isOfBaseclass(tpl, BaseClasses.ARMBAND)
            && !this.itemFilterService.isItemBlacklisted(tpl);

        return valid;
    }
}
