import { inject, injectable } from "tsyringe";

import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { RagfairServerHelper } from "@spt-aki/helpers/RagfairServerHelper";
import { RepeatableQuestHelper } from "@spt-aki/helpers/RepeatableQuestHelper";
import { Exit, ILocationBase } from "@spt-aki/models/eft/common/ILocationBase";
import { TraderInfo } from "@spt-aki/models/eft/common/tables/IBotBase";
import {
    ICompletion,
    ICompletionAvailableFor,
    IElimination,
    IEliminationCondition,
    IEquipmentConditionProps,
    IExploration,
    IExplorationCondition, IKillConditionProps,
    IPickup,
    IRepeatableQuest, IReward, IRewards
} from "@spt-aki/models/eft/common/tables/IRepeatableQuests";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Money } from "@spt-aki/models/enums/Money";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IQuestConfig, IRepeatableQuestConfig } from "@spt-aki/models/spt/config/IQuestConfig";
import { IQuestTypePool } from "@spt-aki/models/spt/repeatable/IQuestTypePool";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemFilterService } from "@spt-aki/services/ItemFilterService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { PaymentService } from "@spt-aki/services/PaymentService";
import { ProfileFixerService } from "@spt-aki/services/ProfileFixerService";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { MathUtil } from "@spt-aki/utils/MathUtil";
import { ObjectId } from "@spt-aki/utils/ObjectId";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class RepeatableQuestGenerator
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
        @inject("RepeatableQuestHelper") protected repeatableQuestHelper: RepeatableQuestHelper,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * This method is called by /GetClientRepeatableQuests/ and creates one element of quest type format (see assets/database/templates/repeatableQuests.json).
     * It randomly draws a quest type (currently Elimination, Completion or Exploration) as well as a trader who is providing the quest
     * @param pmcLevel Player's level for requested items and reward generation
     * @param pmcTraderInfo Players traper standing/rep levels
     * @param questTypePool Possible quest types pool
     * @param repeatableConfig Repeatable quest config
     * @returns IRepeatableQuest
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
            case "Pickup":
                return this.generatePickupQuest(pmcLevel, traderId, questTypePool, repeatableConfig);
            default:
                throw new Error(`Unknown mission type ${questType}. Should never be here!`);
        }
    }

    /**
     * Generate a randomised Elimination quest
     * @param pmcLevel Player's level for requested items and reward generation
     * @param traderId Trader from which the quest will be provided
     * @param questTypePool Pools for quests (used to avoid redundant quests)
     * @param repeatableConfig The configuration for the repeatably kind (daily, weekly) as configured in QuestConfig for the requestd quest
     * @returns Object of quest type format for "Elimination" (see assets/database/templates/repeatableQuests.json)
     */
    protected generateEliminationQuest(
        pmcLevel: number,
        traderId: string,
        questTypePool: IQuestTypePool,
        repeatableConfig: IRepeatableQuestConfig
    ): IElimination
    {
        const eliminationConfig = this.repeatableQuestHelper.getEliminationConfigByPmcLevel(pmcLevel, repeatableConfig);
        const locationsConfig = repeatableConfig.locations;
        let targetsConfig = this.repeatableQuestHelper.probabilityObjectArray(eliminationConfig.targets);
        const bodypartsConfig = this.repeatableQuestHelper.probabilityObjectArray(eliminationConfig.bodyParts);
        const weaponCategoryRequirementConfig = this.repeatableQuestHelper.probabilityObjectArray(eliminationConfig.weaponCategoryRequirements);
        const weaponRequirementConfig = this.repeatableQuestHelper.probabilityObjectArray(eliminationConfig.weaponRequirements);

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

        function difficultyWeighing(target: number, bodyPart: number, dist: number, kill: number, weaponRequirement: number): number
        {
            return Math.sqrt(Math.sqrt(target) + bodyPart + dist + weaponRequirement) * kill;
        }

        targetsConfig = targetsConfig.filter(x => Object.keys(questTypePool.pool.Elimination.targets).includes(x.key));
        if (targetsConfig.length === 0 || targetsConfig.every(x => x.data.isBoss))
        {
            // There are no more targets left for elimination; delete it as a possible quest type
            // also if only bosses are left we need to leave otherwise it's a guaranteed boss elimination
            // -> then it would not be a quest with low probability anymore
            questTypePool.types = questTypePool.types.filter(t => t !== "Elimination");
            return null;
        }

        const targetKey = targetsConfig.draw()[0];
        const targetDifficulty = 1 / targetsConfig.probability(targetKey);

        let locations: string[] = questTypePool.pool.Elimination.targets[targetKey].locations;

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

        let allowedWeaponsCategory: string = undefined;
        if (eliminationConfig.weaponCategoryRequirementProb > Math.random())
        {
            // Pick a weighted weapon categroy
            const weaponRequirement = weaponCategoryRequirementConfig.draw(1, false);

            // Get the hideout id value stored in the .data array
            allowedWeaponsCategory = weaponCategoryRequirementConfig.data(weaponRequirement[0])[0];
        }

        // Only allow a specific weapon requirement if a weapon category was not chosen
        let allowedWeapon: string = undefined;
        if (!allowedWeaponsCategory && eliminationConfig.weaponRequirementProb > Math.random())
        {
            const weaponRequirement = weaponRequirementConfig.draw(1, false);
            const allowedWeaponsCategory = weaponRequirementConfig.data(weaponRequirement[0])[0];
            const allowedWeapons = this.itemHelper.getItemTplsOfBaseType(allowedWeaponsCategory);
            allowedWeapon = this.randomUtil.getArrayValue(allowedWeapons);
        }

        // Draw how many npm kills are required
        const kills = (targetsConfig.data(targetKey).isBoss)
            ? this.randomUtil.randInt(eliminationConfig.minBossKills, eliminationConfig.maxBossKills + 1)
            : this.randomUtil.randInt(eliminationConfig.minKills, eliminationConfig.maxKills + 1);
        const killDifficulty = kills;

        // not perfectly happy here; we give difficulty = 1 to the quest reward generation when we have the most diffucult mission
        // e.g. killing reshala 5 times from a distance of 200m with a headshot.
        const maxDifficulty = difficultyWeighing(1, 1, 1, 1, 1);
        const curDifficulty = difficultyWeighing(
            targetDifficulty / maxTargetDifficulty,
            bodyPartDifficulty / maxBodyPartsDifficulty,
            distanceDifficulty / maxDistDifficulty,
            killDifficulty / maxKillDifficulty,
            (allowedWeaponsCategory || allowedWeapon) ? 1 : 0
        );

        // Aforementioned issue makes it a bit crazy since now all easier quests give significantly lower rewards than Completion / Exploration
        // I therefore moved the mapping a bit up (from 0.2...1 to 0.5...2) so that normal difficulty still gives good reward and having the
        // crazy maximum difficulty will lead to a higher difficulty reward gain factor than 1
        const difficulty = this.mathUtil.mapToRange(curDifficulty, minDifficulty, maxDifficulty, 0.5, 2);

        const quest = this.generateRepeatableTemplate("Elimination", traderId, repeatableConfig.side) as IElimination;
        
        // ASSUMPTION: All fence quests are for scavs
        if (traderId === Traders.FENCE)
        {
            quest.side = "Scav";
        }

        const availableForFinishCondition = quest.conditions.AvailableForFinish[0];
        availableForFinishCondition._props.counter.id = this.objectId.generate();
        availableForFinishCondition._props.counter.conditions = [];
        if (locationKey !== "any")
        {
            availableForFinishCondition._props.counter.conditions.push(this.generateEliminationLocation(locationsConfig[locationKey], allowedWeapon, allowedWeaponsCategory));
        }
        availableForFinishCondition._props.counter.conditions.push(this.generateEliminationCondition(targetKey, bodyPartsToClient, distance, allowedWeapon, allowedWeaponsCategory));
        availableForFinishCondition._props.value = kills;
        availableForFinishCondition._props.id = this.objectId.generate();
        quest.location = this.getQuestLocationByMapId(locationKey);

        quest.rewards = this.generateReward(pmcLevel, Math.min(difficulty, 1), traderId, repeatableConfig);

        return quest;
    }

    /**
     * A repeatable quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/repeatableQuests.json)
     * This is a helper method for GenerateEliminationQuest to create a location condition.
     *
     * @param   {string}    location        the location on which to fulfill the elimination quest
     * @returns {object}                    object of "Elimination"-location-subcondition
     */
    protected generateEliminationLocation(location: string[], allowedWeapon: string, allowedWeaponCategory: string): IEliminationCondition
    {
        const propsObject: IEliminationCondition = {
            _props: {
                target: location,
                id: this.objectId.generate(),
                dynamicLocale: true
            },
            _parent: "Location"
        };

        if (allowedWeapon)
        {
            propsObject._props.weapon = [allowedWeapon];
        }

        if (allowedWeaponCategory)
        {
            propsObject._props.weaponCategories = [allowedWeaponCategory];
        }
        
        return propsObject;
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
    protected generateEliminationCondition(target: string, bodyPart: string[], distance: number, allowedWeapon: string, allowedWeaponCategory: string): IEliminationCondition
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

        // Dont allow distance + melee requirement
        if (distance && allowedWeaponCategory !== "5b5f7a0886f77409407a7f96")
        {
            killConditionProps.distance = {
                compareMethod: ">=",
                value: distance
            };
        }

        if (allowedWeapon)
        {
            killConditionProps.weapon = [allowedWeapon];
        }

        if (allowedWeaponCategory?.length > 0)
        {
            killConditionProps.weaponCategories = [allowedWeaponCategory];
        }

        return {
            _props: killConditionProps,
            _parent: "Kills"
        };
    }

    /**
     * Generates a valid Completion quest
     *
     * @param   {integer}   pmcLevel            player's level for requested items and reward generation
     * @param   {string}    traderId            trader from which the quest will be provided
     * @param   {object}    repeatableConfig    The configuration for the repeatably kind (daily, weekly) as configured in QuestConfig for the requestd quest
     * @returns {object}                        object of quest type format for "Completion" (see assets/database/templates/repeatableQuests.json)
     */
    protected generateCompletionQuest(
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
     * A repeatable quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/repeatableQuests.json)
     * This is a helper method for GenerateCompletionQuest to create a completion condition (of which a completion quest theoretically can have many)
     *
     * @param   {string}    targetItemId    id of the item to request
     * @param   {integer}   value           amount of items of this specific type to request
     * @returns {object}                    object of "Completion"-condition
     */
    protected generateCompletionAvailableForFinish(targetItemId: string, value: number): ICompletionAvailableFor
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
     * Generates a valid Exploration quest
     *
     * @param   {integer}   pmcLevel            player's level for reward generation
     * @param   {string}    traderId            trader from which the quest will be provided
     * @param   {object}    questTypePool       Pools for quests (used to avoid redundant quests)
     * @param   {object}    repeatableConfig    The configuration for the repeatably kind (daily, weekly) as configured in QuestConfig for the requestd quest
     * @returns {object}                        object of quest type format for "Exploration" (see assets/database/templates/repeatableQuests.json)
     */
    protected generateExplorationQuest(
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

    protected generatePickupQuest(
        pmcLevel: number,
        traderId: string,
        questTypePool: IQuestTypePool,
        repeatableConfig: IRepeatableQuestConfig
    ): IPickup
    {
        const pickupConfig = repeatableConfig.questConfig.Pickup;

        const quest = this.generateRepeatableTemplate("Pickup", traderId, repeatableConfig.side) as IPickup;

        const itemTypeToFetchWithCount = this.randomUtil.getArrayValue(pickupConfig.ItemTypeToFetchWithMaxCount);
        const itemCountToFetch = this.randomUtil.randInt(itemTypeToFetchWithCount.minPickupCount, itemTypeToFetchWithCount.maxPickupCount + 1);
        // Choose location - doesnt seem to work for anything other than 'any'
        //const locationKey: string = this.randomUtil.drawRandomFromDict(questTypePool.pool.Pickup.locations)[0];
        //const locationTarget = questTypePool.pool.Pickup.locations[locationKey];

        const findCondition = quest.conditions.AvailableForFinish.find(x => x._parent === "FindItem");
        findCondition._props.target = [itemTypeToFetchWithCount.itemType];
        findCondition._props.value = itemCountToFetch;

        const counterCreatorCondition = quest.conditions.AvailableForFinish.find(x => x._parent === "CounterCreator");
        //const locationCondition = counterCreatorCondition._props.counter.conditions.find(x => x._parent === "Location");
        //(locationCondition._props as ILocationConditionProps).target = [...locationTarget];

        const equipmentCondition = counterCreatorCondition._props.counter.conditions.find(x => x._parent === "Equipment");
        (equipmentCondition._props as IEquipmentConditionProps).equipmentInclusive = [[itemTypeToFetchWithCount.itemType]];

        // Add rewards
        quest.rewards = this.generateReward(pmcLevel, 1, traderId, repeatableConfig);

        return quest;
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
    protected generateExplorationExitCondition(exit: Exit): IExplorationCondition
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
    protected generateReward(
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

        // Possible improvement -> draw trader-specific items e.g. with this.itemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.FoodDrink)
        let roublesBudget = rewardRoubles;
        let chosenRewardItems = this.chooseRewardItemsWithinBudget(repeatableConfig, roublesBudget);

        const rewards: IRewards = {
            Started: [],
            Success: [
                {
                    value: rewardXP,
                    type: "Experience",
                    index: 0
                }
            ],
            Fail: []
        };

        if (traderId === Traders.PEACEKEEPER)
        {
            // convert to equivalent dollars
            rewards.Success.push(this.generateRewardItem(Money.EUROS, this.handbookHelper.fromRUB(rewardRoubles, Money.EUROS), 1));
        }
        else
        {
            rewards.Success.push(this.generateRewardItem(Money.ROUBLES, rewardRoubles, 1));
        }

        let index = 2;
        if (chosenRewardItems.length > 0)
        {
            for (let i = 0; i < rewardNumItems; i++)
            {
                let value = 1;
                let children = null;
                const itemSelected = chosenRewardItems[this.randomUtil.randInt(chosenRewardItems.length)];
                if (this.itemHelper.isOfBaseclass(itemSelected._id, BaseClasses.AMMO))
                {
                    // Dont reward ammo that stacks to less than what's defined in config
                    if (itemSelected._props.StackMaxSize < repeatableConfig.rewardAmmoStackMinSize)
                    {
                        continue;
                    }

                    // If we provide ammo we don't want to provide just one bullet
                    value = this.randomUtil.randInt(repeatableConfig.rewardAmmoStackMinSize, itemSelected._props.StackMaxSize);
                }
                else if (this.itemHelper.isOfBaseclass(itemSelected._id, BaseClasses.WEAPON))
                {
                    const defaultPreset = this.presetHelper.getDefaultPreset(itemSelected._id);
                    if (defaultPreset)
                    {
                        children = this.ragfairServerHelper.reparentPresets(defaultPreset._items[0], defaultPreset._items);
                    }
                }
                rewards.Success.push(this.generateRewardItem(itemSelected._id, value, index, children));

                // TODO: maybe also non-default use ragfair to calculate the price
                // this.ragfairServer.getWeaponPresetPrice(item, items, existingPrice)

                roublesBudget -= value * this.itemHelper.getStaticItemPrice(itemSelected._id);
                index += 1;

                // if we still have budget narrow down the items
                if (roublesBudget > 0)
                {
                    // Filter possible reward items to only items with a price below the remaining budget
                    chosenRewardItems = chosenRewardItems.filter(x => this.itemHelper.getStaticItemPrice(x._id) < roublesBudget);
                    if (chosenRewardItems.length === 0)
                    {
                        break; // No reward items left, exit
                    }
                }
                else
                {
                    break;
                }
            }
        }

        // Add rep reward to rewards array
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
     * Select a number of items that have a colelctive value of the passed in parameter
     * @param repeatableConfig Config
     * @param roublesBudget Total value of items to return
     * @returns Array of reward items that fit budget
     */
    protected chooseRewardItemsWithinBudget(repeatableConfig: IRepeatableQuestConfig, roublesBudget: number): ITemplateItem[]
    {
        // First filter for type and baseclass to avoid lookup in handbook for non-available items
        const rewardableItems = this.getRewardableItems(repeatableConfig);
        const minPrice = Math.min(25000, 0.5 * roublesBudget);
        let itemSelection = rewardableItems.filter(x => this.itemHelper.getItemPrice(x[0]) < roublesBudget && this.itemHelper.getItemPrice(x[0]) > minPrice).map(x => x[1]);
        if (itemSelection.length === 0)
        {
            this.logger.warning(this.localisationService.getText("repeatable-no_reward_item_found_in_price_range", {minPrice: minPrice, roublesBudget: roublesBudget}));
            // In case we don't find any items in the price range
            itemSelection  = rewardableItems.filter(x => this.itemHelper.getItemPrice(x[0]) < roublesBudget).map(x => x[1]);
        }

        return itemSelection;
    }

    /**
     * Helper to create a reward item structured as required by the client
     *
     * @param   {string}    tpl             ItemId of the rewarded item
     * @param   {integer}   value           Amount of items to give
     * @param   {integer}   index           All rewards will be appended to a list, for unknown reasons the client wants the index
     * @returns {object}                    Object of "Reward"-item-type
     */
    protected generateRewardItem(tpl: string, value: number, index: number, preset = null): IReward
    {
        const id = this.objectId.generate();
        const rewardItem: IReward = {
            target: id,
            value: value,
            type: "Item",
            index: index
        };

        const rootItem = {
            _id: id,
            _tpl: tpl,
            upd: {
                StackObjectsCount: value,
                SpawnedInSession: true
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

    /**
    * Picks rewardable items from items.json. This means they need to fit into the inventory and they shouldn't be keys (debatable)
     * @param repeatableQuestConfig Config file
     * @returns List of rewardable items [[_tpl, itemTemplate],...]
     */
    protected getRewardableItems(repeatableQuestConfig: IRepeatableQuestConfig): [string, ITemplateItem][]
    {
        // check for specific baseclasses which don't make sense as reward item
        // also check if the price is greater than 0; there are some items whose price can not be found
        // those are not in the game yet (e.g. AGS grenade launcher)
        return Object.entries(this.databaseServer.getTables().templates.items).filter(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ([tpl, itemTemplate]) =>
            {
                // Base "Item" item has no parent, ignore it
                if (itemTemplate._parent === "")
                {
                    return false;
                }

                return this.isValidRewardItem(tpl, repeatableQuestConfig);
            }
        );
    }

    /**
     * Checks if an id is a valid item. Valid meaning that it's an item that may be a reward
     * or content of bot loot. Items that are tested as valid may be in a player backpack or stash.
     * @param {string} tpl template id of item to check
     * @returns True if item is valid reward
     */
    protected isValidRewardItem(tpl: string, repeatableQuestConfig: IRepeatableQuestConfig): boolean
    {
        let valid = this.itemHelper.isValidItem(tpl);
        if (!valid)
        {
            return valid;
        }

        // Item is on repeatable or global blacklist
        if (repeatableQuestConfig.rewardBlacklist.includes(tpl)
            || this.itemFilterService.isItemBlacklisted(tpl))
        {
            return false;
        }

        // Item has blacklisted base type
        if (this.itemHelper.isOfBaseclasses(tpl, [...repeatableQuestConfig.rewardBaseTypeBlacklist]))
        {
            return false;
        }

        if (this.itemHelper.isOfBaseclasses(tpl, [BaseClasses.DOG_TAG_USEC, BaseClasses.DOG_TAG_BEAR, BaseClasses.MOUNT, BaseClasses.KEY, BaseClasses.ARMBAND]))
        {
            return false;
        }

        // Skip globally blacklisted items + boss items
        // rome-ignore lint/complexity/useSimplifiedLogicExpression: <explanation>
        valid  = !this.itemFilterService.isItemBlacklisted(tpl)
            && !this.itemFilterService.isBossItem(tpl);

        return valid;
    }

    /**
     * Generates the base object of quest type format given as templates in assets/database/templates/repeatableQuests.json
     * The templates include Elimination, Completion and Extraction quest types
     *
     * @param   {string}    type            Quest type: "Elimination", "Completion" or "Extraction"
     * @param   {string}    traderId        Trader from which the quest will be provided
     * @param   {string}    side            Scav daily or pmc daily/weekly quest  
     * @returns {object}                    Object which contains the base elements for repeatable quests of the requests type
     *                                      (needs to be filled with reward and conditions by called to make a valid quest)
     */
    // @Incomplete: define Type for "type".
    protected generateRepeatableTemplate(type: string, traderId: string, side: string): IRepeatableQuest
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
}