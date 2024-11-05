import { RepeatableQuestRewardGenerator } from "@spt/generators/RepeatableQuestRewardGenerator";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { RepeatableQuestHelper } from "@spt/helpers/RepeatableQuestHelper";
import { IExit } from "@spt/models/eft/common/ILocationBase";
import { ITraderInfo } from "@spt/models/eft/common/tables/IBotBase";
import { IQuestCondition, IQuestConditionCounterCondition } from "@spt/models/eft/common/tables/IQuest";
import { IRepeatableQuest } from "@spt/models/eft/common/tables/IRepeatableQuests";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Traders } from "@spt/models/enums/Traders";
import {
    IBossInfo,
    IEliminationConfig,
    IQuestConfig,
    IRepeatableQuestConfig,
} from "@spt/models/spt/config/IQuestConfig";
import { IQuestTypePool } from "@spt/models/spt/repeatable/IQuestTypePool";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MathUtil } from "@spt/utils/MathUtil";
import { ObjectId } from "@spt/utils/ObjectId";
import { ProbabilityObjectArray, RandomUtil } from "@spt/utils/RandomUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RepeatableQuestGenerator {
    protected questConfig: IQuestConfig;
    protected maxRandomNumberAttempts = 6;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("RepeatableQuestHelper") protected repeatableQuestHelper: RepeatableQuestHelper,
        @inject("RepeatableQuestRewardGenerator")
        protected repeatableQuestRewardGenerator: RepeatableQuestRewardGenerator,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
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
        pmcTraderInfo: Record<string, ITraderInfo>,
        questTypePool: IQuestTypePool,
        repeatableConfig: IRepeatableQuestConfig,
    ): IRepeatableQuest {
        const questType = this.randomUtil.drawRandomFromList<string>(questTypePool.types)[0];

        // get traders from whitelist and filter by quest type availability
        let traders = repeatableConfig.traderWhitelist
            .filter((x) => x.questTypes.includes(questType))
            .map((x) => x.traderId);
        // filter out locked traders
        traders = traders.filter((x) => pmcTraderInfo[x].unlocked);
        const traderId = this.randomUtil.drawRandomFromList(traders)[0];

        switch (questType) {
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
        repeatableConfig: IRepeatableQuestConfig,
    ): IRepeatableQuest {
        const eliminationConfig = this.repeatableQuestHelper.getEliminationConfigByPmcLevel(pmcLevel, repeatableConfig);
        const locationsConfig = repeatableConfig.locations;
        let targetsConfig = this.repeatableQuestHelper.probabilityObjectArray(eliminationConfig.targets);
        const bodypartsConfig = this.repeatableQuestHelper.probabilityObjectArray(eliminationConfig.bodyParts);
        let weaponCategoryRequirementConfig = this.repeatableQuestHelper.probabilityObjectArray(
            eliminationConfig.weaponCategoryRequirements,
        );
        const weaponRequirementConfig = this.repeatableQuestHelper.probabilityObjectArray(
            eliminationConfig.weaponRequirements,
        );

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
        // }
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

        function difficultyWeighing(
            target: number,
            bodyPart: number,
            dist: number,
            kill: number,
            weaponRequirement: number,
        ): number | undefined {
            return Math.sqrt(Math.sqrt(target) + bodyPart + dist + weaponRequirement) * kill;
        }

        targetsConfig = targetsConfig.filter((x) =>
            Object.keys(questTypePool.pool.Elimination.targets).includes(x.key),
        );
        if (targetsConfig.length === 0 || targetsConfig.every((x) => x.data.isBoss)) {
            // There are no more targets left for elimination; delete it as a possible quest type
            // also if only bosses are left we need to leave otherwise it's a guaranteed boss elimination
            // -> then it would not be a quest with low probability anymore
            questTypePool.types = questTypePool.types.filter((t) => t !== "Elimination");
            return undefined;
        }

        const targetKey = targetsConfig.draw()[0];
        const targetDifficulty = 1 / targetsConfig.probability(targetKey);

        let locations: string[] = questTypePool.pool.Elimination.targets[targetKey].locations;

        // we use any as location if "any" is in the pool and we do not hit the specific location random
        // we use any also if the random condition is not met in case only "any" was in the pool
        let locationKey = "any";
        if (
            locations.includes("any") &&
            (eliminationConfig.specificLocationProb < Math.random() || locations.length <= 1)
        ) {
            locationKey = "any";
            delete questTypePool.pool.Elimination.targets[targetKey];
        } else {
            locations = locations.filter((l) => l !== "any");
            if (locations.length > 0) {
                locationKey = this.randomUtil.drawRandomFromList<string>(locations)[0];
                questTypePool.pool.Elimination.targets[targetKey].locations = locations.filter(
                    (l) => l !== locationKey,
                );
                if (questTypePool.pool.Elimination.targets[targetKey].locations.length === 0) {
                    delete questTypePool.pool.Elimination.targets[targetKey];
                }
            } else {
                // never should reach this if everything works out
                this.logger.debug("Ecountered issue when creating Elimination quest. Please report.");
            }
        }

        // draw the target body part and calculate the difficulty factor
        let bodyPartsToClient = undefined;
        let bodyPartDifficulty = 0;
        if (eliminationConfig.bodyPartProb > Math.random()) {
            // if we add a bodyPart condition, we draw randomly one or two parts
            // each bodyPart of the BODYPARTS ProbabilityObjectArray includes the string(s) which need to be presented to the client in ProbabilityObjectArray.data
            // e.g. we draw "Arms" from the probability array but must present ["LeftArm", "RightArm"] to the client
            bodyPartsToClient = [];
            const bodyParts = bodypartsConfig.draw(this.randomUtil.randInt(1, 3), false);
            let probability = 0;
            for (const bi of bodyParts) {
                // more than one part lead to an "OR" condition hence more parts reduce the difficulty
                probability += bodypartsConfig.probability(bi);
                for (const biClient of bodypartsConfig.data(bi)) {
                    bodyPartsToClient.push(biClient);
                }
            }
            bodyPartDifficulty = 1 / probability;
        }

        // Draw a distance condition
        let distance = undefined;
        let distanceDifficulty = 0;
        let isDistanceRequirementAllowed = !eliminationConfig.distLocationBlacklist.includes(locationKey);

        if (targetsConfig.data(targetKey).isBoss) {
            // Get all boss spawn information
            const bossSpawns = Object.values(this.databaseService.getLocations())
                .filter((x) => "base" in x && "Id" in x.base)
                .map((x) => ({ Id: x.base.Id, BossSpawn: x.base.BossLocationSpawn }));
            // filter for the current boss to spawn on map
            const thisBossSpawns = bossSpawns
                .map((x) => ({
                    Id: x.Id,
                    BossSpawn: x.BossSpawn.filter((e) => e.BossName === targetKey),
                }))
                .filter((x) => x.BossSpawn.length > 0);
            // remove blacklisted locations
            const allowedSpawns = thisBossSpawns.filter((x) => !eliminationConfig.distLocationBlacklist.includes(x.Id));
            // if the boss spawns on nom-blacklisted locations and the current location is allowed we can generate a distance kill requirement
            isDistanceRequirementAllowed = isDistanceRequirementAllowed && allowedSpawns.length > 0;
        }

        if (eliminationConfig.distProb > Math.random() && isDistanceRequirementAllowed) {
            // Random distance with lower values more likely; simple distribution for starters...
            distance = Math.floor(
                Math.abs(Math.random() - Math.random()) * (1 + eliminationConfig.maxDist - eliminationConfig.minDist) +
                    eliminationConfig.minDist,
            );
            distance = Math.ceil(distance / 5) * 5;
            distanceDifficulty = (maxDistDifficulty * distance) / eliminationConfig.maxDist;
        }

        let allowedWeaponsCategory: string = undefined;
        if (eliminationConfig.weaponCategoryRequirementProb > Math.random()) {
            // Filter out close range weapons from far distance requirement
            if (distance > 50) {
                weaponCategoryRequirementConfig = weaponCategoryRequirementConfig.filter((category) =>
                    ["Shotgun", "Pistol"].includes(category.key),
                );
            } else if (distance < 20) {
                // Filter out far range weapons from close distance requirement
                weaponCategoryRequirementConfig = weaponCategoryRequirementConfig.filter((category) =>
                    ["MarksmanRifle", "DMR"].includes(category.key),
                );
            }

            // Pick a weighted weapon category
            const weaponRequirement = weaponCategoryRequirementConfig.draw(1, false);

            // Get the hideout id value stored in the .data array
            allowedWeaponsCategory = weaponCategoryRequirementConfig.data(weaponRequirement[0])[0];
        }

        // Only allow a specific weapon requirement if a weapon category was not chosen
        let allowedWeapon: string = undefined;
        if (!allowedWeaponsCategory && eliminationConfig.weaponRequirementProb > Math.random()) {
            const weaponRequirement = weaponRequirementConfig.draw(1, false);
            const allowedWeaponsCategory = weaponRequirementConfig.data(weaponRequirement[0])[0];
            const allowedWeapons = this.itemHelper.getItemTplsOfBaseType(allowedWeaponsCategory);
            allowedWeapon = this.randomUtil.getArrayValue(allowedWeapons);
        }

        // Draw how many npm kills are required
        const desiredKillCount = this.getEliminationKillCount(targetKey, targetsConfig, eliminationConfig);
        const killDifficulty = desiredKillCount;

        // not perfectly happy here; we give difficulty = 1 to the quest reward generation when we have the most diffucult mission
        // e.g. killing reshala 5 times from a distance of 200m with a headshot.
        const maxDifficulty = difficultyWeighing(1, 1, 1, 1, 1);
        const curDifficulty = difficultyWeighing(
            targetDifficulty / maxTargetDifficulty,
            bodyPartDifficulty / maxBodyPartsDifficulty,
            distanceDifficulty / maxDistDifficulty,
            killDifficulty / maxKillDifficulty,
            allowedWeaponsCategory || allowedWeapon ? 1 : 0,
        );

        // Aforementioned issue makes it a bit crazy since now all easier quests give significantly lower rewards than Completion / Exploration
        // I therefore moved the mapping a bit up (from 0.2...1 to 0.5...2) so that normal difficulty still gives good reward and having the
        // crazy maximum difficulty will lead to a higher difficulty reward gain factor than 1
        const difficulty = this.mathUtil.mapToRange(curDifficulty, minDifficulty, maxDifficulty, 0.5, 2);

        const quest = this.generateRepeatableTemplate("Elimination", traderId, repeatableConfig.side);

        // ASSUMPTION: All fence quests are for scavs
        if (traderId === Traders.FENCE) {
            quest.side = "Scav";
        }

        const availableForFinishCondition = quest.conditions.AvailableForFinish[0];
        availableForFinishCondition.counter.id = this.objectId.generate();
        availableForFinishCondition.counter.conditions = [];

        // Only add specific location condition if specific map selected
        if (locationKey !== "any") {
            availableForFinishCondition.counter.conditions.push(
                this.generateEliminationLocation(locationsConfig[locationKey]),
            );
        }
        availableForFinishCondition.counter.conditions.push(
            this.generateEliminationCondition(
                targetKey,
                bodyPartsToClient,
                distance,
                allowedWeapon,
                allowedWeaponsCategory,
            ),
        );
        availableForFinishCondition.value = desiredKillCount;
        availableForFinishCondition.id = this.objectId.generate();
        quest.location = this.getQuestLocationByMapId(locationKey);

        quest.rewards = this.repeatableQuestRewardGenerator.generateReward(
            pmcLevel,
            Math.min(difficulty, 1),
            traderId,
            repeatableConfig,
            eliminationConfig,
        );

        return quest;
    }

    /**
     * Get a number of kills neded to complete elimination quest
     * @param targetKey Target type desired e.g. anyPmc/bossBully/Savage
     * @param targetsConfig Config
     * @param eliminationConfig Config
     * @returns Number of AI to kill
     */
    protected getEliminationKillCount(
        targetKey: string,
        targetsConfig: ProbabilityObjectArray<string, IBossInfo>,
        eliminationConfig: IEliminationConfig,
    ): number {
        if (targetsConfig.data(targetKey).isBoss) {
            return this.randomUtil.randInt(eliminationConfig.minBossKills, eliminationConfig.maxBossKills + 1);
        }

        if (targetsConfig.data(targetKey).isPmc) {
            return this.randomUtil.randInt(eliminationConfig.minPmcKills, eliminationConfig.maxPmcKills + 1);
        }

        return this.randomUtil.randInt(eliminationConfig.minKills, eliminationConfig.maxKills + 1);
    }

    /**
     * A repeatable quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/repeatableQuests.json)
     * This is a helper method for GenerateEliminationQuest to create a location condition.
     *
     * @param   {string}    location        the location on which to fulfill the elimination quest
     * @returns {IEliminationCondition}     object of "Elimination"-location-subcondition
     */
    protected generateEliminationLocation(location: string[]): IQuestConditionCounterCondition {
        const propsObject: IQuestConditionCounterCondition = {
            id: this.objectId.generate(),
            dynamicLocale: true,
            target: location,
            conditionType: "Location",
        };

        return propsObject;
    }

    /**
     * Create kill condition for an elimination quest
     * @param target Bot type target of elimination quest e.g. "AnyPmc", "Savage"
     * @param targetedBodyParts Body parts player must hit
     * @param distance Distance from which to kill (currently only >= supported
     * @param allowedWeapon What weapon must be used - undefined = any
     * @param allowedWeaponCategory What category of weapon must be used - undefined = any
     * @returns IEliminationCondition object
     */
    protected generateEliminationCondition(
        target: string,
        targetedBodyParts: string[],
        distance: number,
        allowedWeapon: string,
        allowedWeaponCategory: string,
    ): IQuestConditionCounterCondition {
        const killConditionProps: IQuestConditionCounterCondition = {
            target: target,
            value: 1,
            id: this.objectId.generate(),
            dynamicLocale: true,
            conditionType: "Kills",
        };

        if (target.startsWith("boss")) {
            killConditionProps.target = "Savage";
            killConditionProps.savageRole = [target];
        }

        // Has specific body part hit condition
        if (targetedBodyParts) {
            killConditionProps.bodyPart = targetedBodyParts;
        }

        // Dont allow distance + melee requirement
        if (distance && allowedWeaponCategory !== "5b5f7a0886f77409407a7f96") {
            killConditionProps.distance = { compareMethod: ">=", value: distance };
        }

        // Has specific weapon requirement
        if (allowedWeapon) {
            killConditionProps.weapon = [allowedWeapon];
        }

        // Has specific weapon category requirement
        if (allowedWeaponCategory?.length > 0) {
            // TODO - fix - does weaponCategories exist?
            // killConditionProps.weaponCategories = [allowedWeaponCategory];
        }

        return killConditionProps;
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
        repeatableConfig: IRepeatableQuestConfig,
    ): IRepeatableQuest {
        const completionConfig = repeatableConfig.questConfig.Completion;
        const levelsConfig = repeatableConfig.rewardScaling.levels;
        const roublesConfig = repeatableConfig.rewardScaling.roubles;

        const quest = this.generateRepeatableTemplate("Completion", traderId, repeatableConfig.side);

        // Filter the items.json items to items the player must retrieve to complete quest: shouldn't be a quest item or "non-existant"
        const possibleItemsToRetrievePool = this.repeatableQuestRewardGenerator.getRewardableItems(
            repeatableConfig,
            traderId,
        );

        // Be fair, don't let the items be more expensive than the reward
        let roublesBudget = Math.floor(
            this.mathUtil.interp1(pmcLevel, levelsConfig, roublesConfig) * this.randomUtil.getFloat(0.5, 1),
        );
        roublesBudget = Math.max(roublesBudget, 5000);
        let itemSelection = possibleItemsToRetrievePool.filter(
            (x) => this.itemHelper.getItemPrice(x[0]) < roublesBudget,
        );

        // We also have the option to use whitelist and/or blacklist which is defined in repeatableQuests.json as
        // [{"minPlayerLevel": 1, "itemIds": ["id1",...]}, {"minPlayerLevel": 15, "itemIds": ["id3",...]}]
        if (repeatableConfig.questConfig.Completion.useWhitelist) {
            const itemWhitelist = this.databaseService.getTemplates().repeatableQuests.data.Completion.itemsWhitelist;

            // Filter and concatenate the arrays according to current player level
            const itemIdsWhitelisted = itemWhitelist
                .filter((p) => p.minPlayerLevel <= pmcLevel)
                .reduce((a, p) => a.concat(p.itemIds), []);
            itemSelection = itemSelection.filter((x) => {
                // Whitelist can contain item tpls and item base type ids
                return (
                    itemIdsWhitelisted.some((v) => this.itemHelper.isOfBaseclass(x[0], v)) ||
                    itemIdsWhitelisted.includes(x[0])
                );
            });
            // check if items are missing
            // const flatList = itemSelection.reduce((a, il) => a.concat(il[0]), []);
            // const missing = itemIdsWhitelisted.filter(l => !flatList.includes(l));
        }

        if (repeatableConfig.questConfig.Completion.useBlacklist) {
            const itemBlacklist = this.databaseService.getTemplates().repeatableQuests.data.Completion.itemsBlacklist;

            // we filter and concatenate the arrays according to current player level
            const itemIdsBlacklisted = itemBlacklist
                .filter((p) => p.minPlayerLevel <= pmcLevel)
                .reduce((a, p) => a.concat(p.itemIds), []);

            itemSelection = itemSelection.filter((x) => {
                return (
                    itemIdsBlacklisted.every((v) => !this.itemHelper.isOfBaseclass(x[0], v)) ||
                    !itemIdsBlacklisted.includes(x[0])
                );
            });
        }

        if (itemSelection.length === 0) {
            this.logger.error(
                this.localisationService.getText(
                    "repeatable-completion_quest_whitelist_too_small_or_blacklist_too_restrictive",
                ),
            );

            return undefined;
        }

        // Draw items to ask player to retrieve
        let isAmmo = 0;

        // Store the indexes of items we are asking player to provide
        const distinctItemsToRetrieveCount = this.randomUtil.getInt(1, completionConfig.uniqueItemCount);
        const chosenRequirementItemsTpls = [];
        const usedItemIndexes = new Set();
        for (let i = 0; i < distinctItemsToRetrieveCount; i++) {
            let chosenItemIndex = this.randomUtil.randInt(itemSelection.length);
            let found = false;

            for (let j = 0; j < this.maxRandomNumberAttempts; j++) {
                if (usedItemIndexes.has(chosenItemIndex)) {
                    chosenItemIndex = this.randomUtil.randInt(itemSelection.length);
                } else {
                    found = true;
                    break;
                }
            }

            if (!found) {
                this.logger.error(
                    this.localisationService.getText("repeatable-no_reward_item_found_in_price_range", {
                        minPrice: 0,
                        roublesBudget: roublesBudget,
                    }),
                );

                return undefined;
            }
            usedItemIndexes.add(chosenItemIndex);

            const itemSelected = itemSelection[chosenItemIndex];
            const itemUnitPrice = this.itemHelper.getItemPrice(itemSelected[0]);
            let minValue = completionConfig.minRequestedAmount;
            let maxValue = completionConfig.maxRequestedAmount;
            if (this.itemHelper.isOfBaseclass(itemSelected[0], BaseClasses.AMMO)) {
                // Prevent multiple ammo requirements from being picked
                if (isAmmo > 0 && isAmmo < this.maxRandomNumberAttempts) {
                    isAmmo++;
                    i--;

                    continue;
                }
                isAmmo++;
                minValue = completionConfig.minRequestedBulletAmount;
                maxValue = completionConfig.maxRequestedBulletAmount;
            }
            let value = minValue;

            // Get the value range within budget
            maxValue = Math.min(maxValue, Math.floor(roublesBudget / itemUnitPrice));
            if (maxValue > minValue) {
                // If it doesn't blow the budget we have for the request, draw a random amount of the selected
                // Item type to be requested
                value = this.randomUtil.randInt(minValue, maxValue + 1);
            }
            roublesBudget -= value * itemUnitPrice;

            // Push a CompletionCondition with the item and the amount of the item
            chosenRequirementItemsTpls.push(itemSelected[0]);
            quest.conditions.AvailableForFinish.push(this.generateCompletionAvailableForFinish(itemSelected[0], value));

            if (roublesBudget > 0) {
                // Reduce the list possible items to fulfill the new budget constraint
                itemSelection = itemSelection.filter(
                    (dbItem) => this.itemHelper.getItemPrice(dbItem[0]) < roublesBudget,
                );
                if (itemSelection.length === 0) {
                    break;
                }
            } else {
                break;
            }
        }

        quest.rewards = this.repeatableQuestRewardGenerator.generateReward(
            pmcLevel,
            1,
            traderId,
            repeatableConfig,
            completionConfig,
            chosenRequirementItemsTpls,
        );

        return quest;
    }

    /**
     * A repeatable quest, besides some more or less static components, exists of reward and condition (see assets/database/templates/repeatableQuests.json)
     * This is a helper method for GenerateCompletionQuest to create a completion condition (of which a completion quest theoretically can have many)
     *
     * @param   {string}    itemTpl    id of the item to request
     * @param   {integer}   value           amount of items of this specific type to request
     * @returns {object}                    object of "Completion"-condition
     */
    protected generateCompletionAvailableForFinish(itemTpl: string, value: number): IQuestCondition {
        let minDurability = 0;
        let onlyFoundInRaid = true;
        if (
            this.itemHelper.isOfBaseclass(itemTpl, BaseClasses.WEAPON) ||
            this.itemHelper.isOfBaseclass(itemTpl, BaseClasses.ARMOR)
        ) {
            minDurability = this.randomUtil.getArrayValue([60, 80]);
        }

        // By default all collected items must be FiR, except dog tags
        if (this.itemHelper.isDogtag(itemTpl)) {
            onlyFoundInRaid = false;
        }

        return {
            id: this.objectId.generate(),
            parentId: "",
            dynamicLocale: true,
            index: 0,
            visibilityConditions: [],
            target: [itemTpl],
            value: value,
            minDurability: minDurability,
            maxDurability: 100,
            dogtagLevel: 0,
            onlyFoundInRaid: onlyFoundInRaid,
            conditionType: "HandoverItem",
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
        repeatableConfig: IRepeatableQuestConfig,
    ): IRepeatableQuest {
        const explorationConfig = repeatableConfig.questConfig.Exploration;
        const requiresSpecificExtract =
            Math.random() < repeatableConfig.questConfig.Exploration.specificExits.probability;

        if (Object.keys(questTypePool.pool.Exploration.locations).length === 0) {
            // there are no more locations left for exploration; delete it as a possible quest type
            questTypePool.types = questTypePool.types.filter((t) => t !== "Exploration");
            return undefined;
        }

        // If location drawn is factory, it's possible to either get factory4_day and factory4_night or only one
        // of the both
        const locationKey: string = this.randomUtil.drawRandomFromDict(questTypePool.pool.Exploration.locations)[0];
        const locationTarget = questTypePool.pool.Exploration.locations[locationKey];

        // Remove the location from the available pool
        delete questTypePool.pool.Exploration.locations[locationKey];

        // Different max extract count when specific extract needed
        const exitTimesMax = requiresSpecificExtract
            ? explorationConfig.maxExtractsWithSpecificExit
            : explorationConfig.maxExtracts + 1;
        const numExtracts = this.randomUtil.randInt(1, exitTimesMax);

        const quest = this.generateRepeatableTemplate("Exploration", traderId, repeatableConfig.side);

        const exitStatusCondition: IQuestConditionCounterCondition = {
            conditionType: "ExitStatus",
            id: this.objectId.generate(),
            dynamicLocale: true,
            status: ["Survived"],
        };
        const locationCondition: IQuestConditionCounterCondition = {
            conditionType: "Location",
            id: this.objectId.generate(),
            dynamicLocale: true,
            target: locationTarget,
        };

        quest.conditions.AvailableForFinish[0].counter.id = this.objectId.generate();
        quest.conditions.AvailableForFinish[0].counter.conditions = [exitStatusCondition, locationCondition];
        quest.conditions.AvailableForFinish[0].value = numExtracts;
        quest.conditions.AvailableForFinish[0].id = this.objectId.generate();
        quest.location = this.getQuestLocationByMapId(locationKey);

        if (requiresSpecificExtract) {
            // Fetch extracts for the requested side
            const mapExits = this.getLocationExitsForSide(locationKey, repeatableConfig.side);

            // Only get exits that have a greater than 0% chance to spawn
            const exitPool = mapExits.filter((exit) => exit.Chance > 0);

            // Exclude exits with a requirement to leave (e.g. car extracts)
            const possibleExits = exitPool.filter(
                (exit) =>
                    !("PassageRequirement" in exit) ||
                    repeatableConfig.questConfig.Exploration.specificExits.passageRequirementWhitelist.includes(
                        exit.PassageRequirement,
                    ),
            );

            if (possibleExits.length === 0) {
                this.logger.error(
                    `Unable to choose specific exit on map: ${locationKey}, Possible exit pool was empty`,
                );
            } else {
                // Choose one of the exits we filtered above
                const chosenExit = this.randomUtil.drawRandomFromList(possibleExits, 1)[0];

                // Create a quest condition to leave raid via chosen exit
                const exitCondition = this.generateExplorationExitCondition(chosenExit);
                quest.conditions.AvailableForFinish[0].counter.conditions.push(exitCondition);
            }
        }

        // Difficulty for exploration goes from 1 extract to maxExtracts
        // Difficulty for reward goes from 0.2...1 -> map
        const difficulty = this.mathUtil.mapToRange(numExtracts, 1, explorationConfig.maxExtracts, 0.2, 1);
        quest.rewards = this.repeatableQuestRewardGenerator.generateReward(
            pmcLevel,
            difficulty,
            traderId,
            repeatableConfig,
            explorationConfig,
        );

        return quest;
    }

    /**
     * Filter a maps exits to just those for the desired side
     * @param locationKey Map id (e.g. factory4_day)
     * @param playerSide Scav/Pmc
     * @returns Array of Exit objects
     */
    protected getLocationExitsForSide(locationKey: string, playerSide: string): IExit[] {
        const mapExtracts = this.databaseService.getLocation(locationKey.toLocaleLowerCase()).allExtracts;

        return mapExtracts.filter((exit) => exit.Side === playerSide);
    }

    protected generatePickupQuest(
        pmcLevel: number,
        traderId: string,
        questTypePool: IQuestTypePool,
        repeatableConfig: IRepeatableQuestConfig,
    ): IRepeatableQuest {
        const pickupConfig = repeatableConfig.questConfig.Pickup;

        const quest = this.generateRepeatableTemplate("Pickup", traderId, repeatableConfig.side);

        const itemTypeToFetchWithCount = this.randomUtil.getArrayValue(pickupConfig.ItemTypeToFetchWithMaxCount);
        const itemCountToFetch = this.randomUtil.randInt(
            itemTypeToFetchWithCount.minPickupCount,
            itemTypeToFetchWithCount.maxPickupCount + 1,
        );
        // Choose location - doesnt seem to work for anything other than 'any'
        // const locationKey: string = this.randomUtil.drawRandomFromDict(questTypePool.pool.Pickup.locations)[0];
        // const locationTarget = questTypePool.pool.Pickup.locations[locationKey];

        const findCondition = quest.conditions.AvailableForFinish.find((x) => x.conditionType === "FindItem");
        findCondition.target = [itemTypeToFetchWithCount.itemType];
        findCondition.value = itemCountToFetch;

        const counterCreatorCondition = quest.conditions.AvailableForFinish.find(
            (x) => x.conditionType === "CounterCreator",
        );
        // const locationCondition = counterCreatorCondition._props.counter.conditions.find(x => x._parent === "Location");
        // (locationCondition._props as ILocationConditionProps).target = [...locationTarget];

        const equipmentCondition = counterCreatorCondition.counter.conditions.find(
            (x) => x.conditionType === "Equipment",
        );
        equipmentCondition.equipmentInclusive = [[itemTypeToFetchWithCount.itemType]];

        // Add rewards
        quest.rewards = this.repeatableQuestRewardGenerator.generateReward(
            pmcLevel,
            1,
            traderId,
            repeatableConfig,
            pickupConfig,
        );

        return quest;
    }

    /**
     * Convert a location into an quest code can read (e.g. factory4_day into 55f2d3fd4bdc2d5f408b4567)
     * @param locationKey e.g factory4_day
     * @returns guid
     */
    protected getQuestLocationByMapId(locationKey: string): string {
        return this.questConfig.locationIdMap[locationKey];
    }

    /**
     * Exploration repeatable quests can specify a required extraction point.
     * This method creates the according object which will be appended to the conditions array
     *
     * @param   {string}        exit                The exit name to generate the condition for
     * @returns {object}                            Exit condition
     */
    protected generateExplorationExitCondition(exit: IExit): IQuestConditionCounterCondition {
        return { conditionType: "ExitName", exitName: exit.Name, id: this.objectId.generate(), dynamicLocale: true };
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
    protected generateRepeatableTemplate(type: string, traderId: string, side: string): IRepeatableQuest {
        const questClone = this.cloner.clone<IRepeatableQuest>(
            this.databaseService.getTemplates().repeatableQuests.templates[type],
        );
        questClone._id = this.objectId.generate();
        questClone.traderId = traderId;

        /*  in locale, these id correspond to the text of quests
            template ids -pmc  : Elimination = 616052ea3054fc0e2c24ce6e / Completion = 61604635c725987e815b1a46 / Exploration = 616041eb031af660100c9967
            template ids -scav : Elimination = 62825ef60e88d037dc1eb428 / Completion = 628f588ebb558574b2260fe5 / Exploration = 62825ef60e88d037dc1eb42c
        */

        // Get template id from config based on side and type of quest
        questClone.templateId = this.questConfig.questTemplateIds[side.toLowerCase()][type.toLowerCase()];

        // Force REF templates to use prapors ID - solves missing text issue
        const desiredTraderId = traderId === Traders.REF ? Traders.PRAPOR : traderId;

        questClone.name = questClone.name
            .replace("{traderId}", traderId)
            .replace("{templateId}", questClone.templateId);
        questClone.note = questClone.note
            .replace("{traderId}", desiredTraderId)
            .replace("{templateId}", questClone.templateId);
        questClone.description = questClone.description
            .replace("{traderId}", desiredTraderId)
            .replace("{templateId}", questClone.templateId);
        questClone.successMessageText = questClone.successMessageText
            .replace("{traderId}", desiredTraderId)
            .replace("{templateId}", questClone.templateId);
        questClone.failMessageText = questClone.failMessageText
            .replace("{traderId}", desiredTraderId)
            .replace("{templateId}", questClone.templateId);
        questClone.startedMessageText = questClone.startedMessageText
            .replace("{traderId}", desiredTraderId)
            .replace("{templateId}", questClone.templateId);
        questClone.changeQuestMessageText = questClone.changeQuestMessageText
            .replace("{traderId}", desiredTraderId)
            .replace("{templateId}", questClone.templateId);
        questClone.acceptPlayerMessage = questClone.acceptPlayerMessage
            .replace("{traderId}", desiredTraderId)
            .replace("{templateId}", questClone.templateId);
        questClone.declinePlayerMessage = questClone.declinePlayerMessage
            .replace("{traderId}", desiredTraderId)
            .replace("{templateId}", questClone.templateId);
        questClone.completePlayerMessage = questClone.completePlayerMessage
            .replace("{traderId}", desiredTraderId)
            .replace("{templateId}", questClone.templateId);

        return questClone;
    }
}
