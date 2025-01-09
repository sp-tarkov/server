import { HideoutHelper } from "@spt/helpers/HideoutHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IBotHideoutArea } from "@spt/models/eft/common/tables/IBotBase";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IStageRequirement } from "@spt/models/eft/hideout/IHideoutArea";
import { IHideoutCircleOfCultistProductionStartRequestData } from "@spt/models/eft/hideout/IHideoutCircleOfCultistProductionStartRequestData";
import { IRequirement, IRequirementBase } from "@spt/models/eft/hideout/IHideoutProduction";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IAcceptedCultistReward } from "@spt/models/eft/profile/ISptProfile";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { HideoutAreas } from "@spt/models/enums/HideoutAreas";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import { CircleRewardType } from "@spt/models/enums/hideout/CircleRewardType";
import {
    ICraftTimeThreshhold,
    ICultistCircleSettings,
    IDirectRewardSettings,
    IHideoutConfig,
} from "@spt/models/spt/config/IHideoutConfig";
import { ICircleCraftDetails } from "@spt/models/spt/hideout/ICircleCraftDetails";
import { IHideout } from "@spt/models/spt/hideout/IHideout";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class CircleOfCultistService {
    protected static circleOfCultistSlotId = "CircleOfCultistsGrid1";
    protected hideoutConfig: IHideoutConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
    }

    /**
     * Start a sacrifice event
     * Generate rewards
     * Delete sacrificed items
     * @param sessionId Session id
     * @param pmcData Player profile doing sacrifice
     * @param request Client request
     * @returns IItemEventRouterResponse
     */
    public startSacrifice(
        sessionId: string,
        pmcData: IPmcData,
        request: IHideoutCircleOfCultistProductionStartRequestData,
    ): IItemEventRouterResponse {
        const cultistCircleStashId = pmcData.Inventory.hideoutAreaStashes[HideoutAreas.CIRCLE_OF_CULTISTS];

        // `cultistRecipes` just has single recipeId
        const cultistCraftData = this.databaseService.getHideout().production.cultistRecipes[0];
        const sacrificedItems: IItem[] = this.getSacrificedItems(pmcData);
        const sacrificedItemCostRoubles = sacrificedItems.reduce(
            (sum, curr) => sum + (this.itemHelper.getItemPrice(curr._tpl) ?? 0),
            0,
        );

        const rewardAmountMultiplier = this.getRewardAmountMultipler(pmcData, this.hideoutConfig.cultistCircle);

        // Get the rouble amount we generate rewards with from cost of sacrified items * above multipler
        const rewardAmountRoubles = Math.round(sacrificedItemCostRoubles * rewardAmountMultiplier);

        // Check if it matches any direct swap recipes
        const directRewardsCache = this.generateSacrificedItemsCache(this.hideoutConfig.cultistCircle.directRewards);
        const directRewardSettings = this.checkForDirectReward(sessionId, sacrificedItems, directRewardsCache);
        const hasDirectReward = directRewardSettings?.reward.length > 0;

        // Get craft time and bonus status
        const craftingInfo = this.getCircleCraftingInfo(
            rewardAmountRoubles,
            this.hideoutConfig.cultistCircle,
            directRewardSettings,
        );

        // Create production in pmc profile
        this.registerCircleOfCultistProduction(
            sessionId,
            pmcData,
            cultistCraftData._id,
            sacrificedItems,
            craftingInfo.time,
        );

        const output = this.eventOutputHolder.getOutput(sessionId);

        // Remove sacrificed items from circle inventory
        for (const item of sacrificedItems) {
            if (item.slotId === CircleOfCultistService.circleOfCultistSlotId) {
                this.inventoryHelper.removeItem(pmcData, item._id, sessionId, output);
            }
        }

        const rewards = hasDirectReward
            ? this.getDirectRewards(sessionId, directRewardSettings, cultistCircleStashId)
            : this.getRewardsWithinBudget(
                  this.getCultistCircleRewardPool(sessionId, pmcData, craftingInfo, this.hideoutConfig.cultistCircle),
                  rewardAmountRoubles,
                  cultistCircleStashId,
                  this.hideoutConfig.cultistCircle,
              );

        // Get the container grid for cultist stash area
        const cultistStashDbItem = this.itemHelper.getItem(ItemTpl.HIDEOUTAREACONTAINER_CIRCLEOFCULTISTS_STASH_1);

        // Ensure rewards fit into container
        const containerGrid = this.inventoryHelper.getContainerSlotMap(cultistStashDbItem[1]._id);
        this.addRewardsToCircleContainer(sessionId, pmcData, rewards, containerGrid, cultistCircleStashId, output);

        return output;
    }

    /**
     * Attempt to add all rewards to cultist circle, if they dont fit remove one and try again until they fit
     * @param sessionId Session id
     * @param pmcData Player profile
     * @param rewards Rewards to send to player
     * @param containerGrid Cultist grid to add rewards to
     * @param cultistCircleStashId Stash id
     * @param output Client output
     */
    protected addRewardsToCircleContainer(
        sessionId: string,
        pmcData: IPmcData,
        rewards: IItem[][],
        containerGrid: number[][],
        cultistCircleStashId: string,
        output: IItemEventRouterResponse,
    ): void {
        let canAddToContainer = false;
        while (!canAddToContainer && rewards.length > 0) {
            canAddToContainer = this.inventoryHelper.canPlaceItemsInContainer(
                this.cloner.clone(containerGrid), // MUST clone grid before passing in as function modifies grid
                rewards,
            );

            // Doesn't fit, remove one item
            if (!canAddToContainer) {
                rewards.pop();
            }
        }

        for (const itemToAdd of rewards) {
            this.inventoryHelper.placeItemInContainer(
                containerGrid,
                itemToAdd,
                cultistCircleStashId,
                CircleOfCultistService.circleOfCultistSlotId,
            );
            // Add item + mods to output and profile inventory
            output.profileChanges[sessionId].items.new.push(...itemToAdd);
            pmcData.Inventory.items.push(...itemToAdd);
        }
    }

    /**
     * Create a map of the possible direct rewards, keyed by the items needed to be sacrificed
     * @param directRewards Direct rewards array from hideout config
     * @returns Map
     */
    protected generateSacrificedItemsCache(directRewards: IDirectRewardSettings[]): Map<string, IDirectRewardSettings> {
        const result = new Map<string, IDirectRewardSettings>();
        for (const rewardSettings of directRewards) {
            const key = this.hashUtil.generateMd5ForData(rewardSettings.requiredItems.sort().join(","));
            result.set(key, rewardSettings);
        }

        return result;
    }

    /**
     * Get the reward amount multiple value based on players hideout management skill + configs rewardPriceMultiplerMinMax values
     * @param pmcData Player profile
     * @param cultistCircleSettings Circle config settings
     * @returns Reward Amount Multipler
     */
    protected getRewardAmountMultipler(pmcData: IPmcData, cultistCircleSettings: ICultistCircleSettings): number {
        // Get a randomised value to multiply the sacrificed rouble cost by
        let rewardAmountMultiplier = this.randomUtil.getFloat(
            cultistCircleSettings.rewardPriceMultiplerMinMax.min,
            cultistCircleSettings.rewardPriceMultiplerMinMax.max,
        );

        // Adjust value generated by the players hideout management skill
        const hideoutManagementSkill = this.profileHelper.getSkillFromProfile(pmcData, SkillTypes.HIDEOUT_MANAGEMENT);
        if (hideoutManagementSkill) {
            rewardAmountMultiplier *= 1 + hideoutManagementSkill.Progress / 10000; // 5100 becomes 0.51, add 1 to it, 1.51, multiply the bonus by it (e.g. 1.2 x 1.51)
        }

        return rewardAmountMultiplier;
    }

    /**
     * Register production inside player profile
     * @param sessionId Session id
     * @param pmcData Player profile
     * @param recipeId Recipe id
     * @param sacrificedItems Items player sacrificed
     * @param craftingTime How long the ritual should take
     */
    protected registerCircleOfCultistProduction(
        sessionId: string,
        pmcData: IPmcData,
        recipeId: string,
        sacrificedItems: IItem[],
        craftingTime: number,
    ): void {
        // Create circle production/craft object to add to player profile
        const cultistProduction = this.hideoutHelper.initProduction(recipeId, craftingTime, false);

        // Flag as cultist circle for code to pick up later
        cultistProduction.sptIsCultistCircle = true;

        // Add items player sacrificed
        cultistProduction.GivenItemsInStart = sacrificedItems;

        // Add circle production to profile keyed to recipe id
        pmcData.Hideout.Production[recipeId] = cultistProduction;
    }

    /**
     * Get the circle craft time as seconds, value is based on reward item value
     * And get the bonus status to determine what tier of reward is given
     * @param rewardAmountRoubles Value of rewards in roubles
     * @param circleConfig Circle config values
     * @param directRewardSettings OPTIONAL - Values related to direct reward being given
     * @returns craft time + type of reward + reward details
     */
    protected getCircleCraftingInfo(
        rewardAmountRoubles: number,
        circleConfig: ICultistCircleSettings,
        directRewardSettings?: IDirectRewardSettings,
    ): ICircleCraftDetails {
        const result = {
            time: -1,
            rewardType: CircleRewardType.RANDOM,
            rewardAmountRoubles: rewardAmountRoubles,
            rewardDetails: null,
        };

        // Direct reward edge case
        if (directRewardSettings) {
            result.time = directRewardSettings.craftTimeSeconds;

            return result;
        }

        // Get a threshold where sacrificed amount is between thresholds min and max
        const matchingThreshold = this.getMatchingThreshold(circleConfig.craftTimeThreshholds, rewardAmountRoubles);
        if (
            rewardAmountRoubles >= circleConfig.hideoutCraftSacrificeThresholdRub &&
            Math.random() <= circleConfig.bonusChanceMultiplier
        ) {
            // Sacrifice amount is enough + passed 25% check to get hideout/task rewards
            result.time =
                circleConfig.craftTimeOverride !== -1
                    ? circleConfig.craftTimeOverride
                    : circleConfig.hideoutTaskRewardTimeSeconds;
            result.rewardType = CircleRewardType.HIDEOUT_TASK;

            return result;
        }

        // Edge case, check if override exists, Otherwise use matching threshold craft time
        result.time =
            circleConfig.craftTimeOverride !== -1 ? circleConfig.craftTimeOverride : matchingThreshold.craftTimeSeconds;

        result.rewardDetails = matchingThreshold;

        return result;
    }

    protected getMatchingThreshold(
        thresholds: ICraftTimeThreshhold[],
        rewardAmountRoubles: number,
    ): ICraftTimeThreshhold {
        const matchingThreshold = thresholds.find(
            (craftThreshold) => craftThreshold.min <= rewardAmountRoubles && craftThreshold.max >= rewardAmountRoubles,
        );

        // No matching threshold, make one
        if (!matchingThreshold) {
            // None found, use a defalt
            this.logger.warning("Unable to find a matching cultist circle threshold, using fallback of 12 hours");

            // Use first threshold value (cheapest) from parameter array, otherwise use 12 hours
            const firstThreshold = thresholds[0];
            const craftTime = firstThreshold?.craftTimeSeconds
                ? firstThreshold.craftTimeSeconds
                : this.timeUtil.getHoursAsSeconds(12);

            return { min: firstThreshold?.min ?? 1, max: firstThreshold?.max ?? 34999, craftTimeSeconds: craftTime };
        }

        return matchingThreshold;
    }

    /**
     * Get the items player sacrificed in circle
     * @param pmcData Player profile
     * @returns Array of its from player inventory
     */
    protected getSacrificedItems(pmcData: IPmcData): IItem[] {
        // Get root items that are in the cultist sacrifice window
        const inventoryRootItemsInCultistGrid = pmcData.Inventory.items.filter(
            (item) => item.slotId === CircleOfCultistService.circleOfCultistSlotId,
        );

        // Get rootitem + its children
        const sacrificedItems: IItem[] = [];
        for (const rootItem of inventoryRootItemsInCultistGrid) {
            const rootItemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(
                pmcData.Inventory.items,
                rootItem._id,
            );
            sacrificedItems.push(...rootItemWithChildren);
        }

        return sacrificedItems;
    }

    /**
     * Given a pool of items + rouble budget, pick items until the budget is reached
     * @param rewardItemTplPool Items that can be picekd
     * @param rewardBudget Rouble budget to reach
     * @param cultistCircleStashId Id of stash item
     * @returns Array of item arrays
     */
    protected getRewardsWithinBudget(
        rewardItemTplPool: string[],
        rewardBudget: number,
        cultistCircleStashId: string,
        circleConfig: ICultistCircleSettings,
    ): IItem[][] {
        // Prep rewards array (reward can be item with children, hence array of arrays)
        const rewards: IItem[][] = [];

        // Pick random rewards until we have exhausted the sacrificed items budget
        let totalRewardCost = 0;
        let rewardItemCount = 0;
        let failedAttempts = 0;
        while (
            totalRewardCost < rewardBudget &&
            rewardItemTplPool.length > 0 &&
            rewardItemCount < circleConfig.maxRewardItemCount
        ) {
            if (failedAttempts > circleConfig.maxAttemptsToPickRewardsWithinBudget) {
                this.logger.warning(`Exiting reward generation after ${failedAttempts} failed attempts`);

                break;
            }

            // Choose a random tpl from pool
            const randomItemTplFromPool = this.randomUtil.getArrayValue(rewardItemTplPool);

            // Is weapon/armor, handle differently
            if (
                this.itemHelper.armorItemHasRemovableOrSoftInsertSlots(randomItemTplFromPool) ||
                this.itemHelper.isOfBaseclass(randomItemTplFromPool, BaseClasses.WEAPON)
            ) {
                const defaultPreset = this.presetHelper.getDefaultPreset(randomItemTplFromPool);
                if (!defaultPreset) {
                    this.logger.warning(`Reward tpl: ${randomItemTplFromPool} lacks a default preset, skipping reward`);
                    failedAttempts++;

                    continue;
                }

                // Ensure preset has unique ids and is cloned so we don't alter the preset data stored in memory
                const presetAndMods = this.itemHelper.replaceIDs(defaultPreset._items);
                this.itemHelper.remapRootItemId(presetAndMods);

                rewardItemCount++;
                totalRewardCost += this.itemHelper.getItemPrice(randomItemTplFromPool);
                rewards.push(presetAndMods);

                continue;
            }

            // Some items can have variable stack size, e.g. ammo / currency
            const stackSize = this.getRewardStackSize(
                randomItemTplFromPool,
                rewardBudget / (rewardItemCount === 0 ? 1 : rewardItemCount), // Remaining rouble budget
            );

            // Not a weapon/armor, standard single item
            const rewardItem: IItem[] = [
                {
                    _id: this.hashUtil.generate(),
                    _tpl: randomItemTplFromPool,
                    parentId: cultistCircleStashId,
                    slotId: CircleOfCultistService.circleOfCultistSlotId,
                    upd: {
                        StackObjectsCount: stackSize,
                        SpawnedInSession: true,
                    },
                },
            ];

            // Edge case - item is ammo container and needs cartridges added
            if (this.itemHelper.isOfBaseclass(randomItemTplFromPool, BaseClasses.AMMO_BOX)) {
                const itemDetails = this.itemHelper.getItem(randomItemTplFromPool)[1];
                this.itemHelper.addCartridgesToAmmoBox(rewardItem, itemDetails);
            }

            // Increment price of rewards to give to player + add to reward array
            rewardItemCount++;
            const singleItemPrice = this.itemHelper.getItemPrice(randomItemTplFromPool);
            const itemPrice = singleItemPrice * stackSize;
            totalRewardCost += itemPrice;

            rewards.push(rewardItem);
        }

        return rewards;
    }

    /**
     * Get direct rewards
     * @param sessionId sessionId
     * @param directReward Items sacrificed
     * @param cultistCircleStashId Id of stash item
     * @returns The reward object
     */
    protected getDirectRewards(
        sessionId: string,
        directReward: IDirectRewardSettings,
        cultistCircleStashId: string,
    ): IItem[][] {
        // Prep rewards array (reward can be item with children, hence array of arrays)
        const rewards: IItem[][] = [];

        // Handle special case of tagilla helmets - only one reward is allowed
        if (directReward.reward.includes(ItemTpl.FACECOVER_TAGILLAS_WELDING_MASK_GORILLA)) {
            directReward.reward = [this.randomUtil.getArrayValue(directReward.reward)];
        }

        // Loop because these can include multiple rewards
        for (const rewardTpl of directReward.reward) {
            // Is weapon/armor, handle differently
            if (
                this.itemHelper.armorItemHasRemovableOrSoftInsertSlots(rewardTpl) ||
                this.itemHelper.isOfBaseclass(rewardTpl, BaseClasses.WEAPON)
            ) {
                const defaultPreset = this.presetHelper.getDefaultPreset(rewardTpl);
                if (!defaultPreset) {
                    this.logger.warning(`Reward tpl: ${rewardTpl} lacks a default preset, skipping reward`);

                    continue;
                }

                // Ensure preset has unique ids and is cloned so we don't alter the preset data stored in memory
                const presetAndMods = this.itemHelper.replaceIDs(defaultPreset._items);
                this.itemHelper.remapRootItemId(presetAndMods);

                rewards.push(presetAndMods);

                continue;
            }

            // 'Normal' item, non-preset
            const stackSize = this.getDirectRewardBaseTypeStackSize(rewardTpl);
            const rewardItem: IItem[] = [
                {
                    _id: this.hashUtil.generate(),
                    _tpl: rewardTpl,
                    parentId: cultistCircleStashId,
                    slotId: CircleOfCultistService.circleOfCultistSlotId,
                    upd: {
                        StackObjectsCount: stackSize,
                        SpawnedInSession: true,
                    },
                },
            ];

            // Edge case - item is ammo container and needs cartridges added
            if (this.itemHelper.isOfBaseclass(rewardTpl, BaseClasses.AMMO_BOX)) {
                const itemDetails = this.itemHelper.getItem(rewardTpl)[1];
                this.itemHelper.addCartridgesToAmmoBox(rewardItem, itemDetails);
            }

            rewards.push(rewardItem);
        }
        // Direct reward is not repeatable, flag collected in profile
        if (!directReward.repeatable) {
            this.flagDirectRewardAsAcceptedInProfile(sessionId, directReward);
        }

        return rewards;
    }

    /**
     * Check for direct rewards from what player sacrificed
     * @param sessionId sessionId
     * @param sacrificedItems Items sacrificed
     * @returns Direct reward items to send to player
     */
    protected checkForDirectReward(
        sessionId: string,
        sacrificedItems: IItem[],
        directRewardsCache: Map<string, IDirectRewardSettings>,
    ): IDirectRewardSettings {
        // Get sacrificed tpls
        const sacrificedItemTpls = sacrificedItems.map((item) => item._tpl);

        // Create md5 key of the items player sacrificed so we can compare against the direct reward cache
        const sacrificedItemsKey = this.hashUtil.generateMd5ForData(sacrificedItemTpls.sort().join(","));

        const matchingDirectReward = directRewardsCache.get(sacrificedItemsKey);
        if (!matchingDirectReward) {
            // No direct reward
            return null;
        }

        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        const directRewardHash = this.getDirectRewardHashKey(matchingDirectReward);
        if (fullProfile.spt.cultistRewards?.[directRewardHash]) {
            // Player has already received this direct reward
            return null;
        }

        return matchingDirectReward;
    }

    /**
     * Create an md5 key of the sacrificed + reward items
     * @param directReward Direct reward to create key for
     * @returns Key
     */
    protected getDirectRewardHashKey(directReward: IDirectRewardSettings): string {
        // Key is sacrificed items separated by commas, a dash, then the rewards separated by commas
        const key = `{${directReward.requiredItems.sort().join(",")}-${directReward.reward.sort().join(",")}`;

        return this.hashUtil.generateMd5ForData(key);
    }

    /**
     * Explicit rewards have thier own stack sizes as they dont use a reward rouble pool
     * @param rewardTpl Item being rewarded to get stack size of
     * @returns stack size of item
     */
    protected getDirectRewardBaseTypeStackSize(rewardTpl: string): number {
        const itemDetails = this.itemHelper.getItem(rewardTpl);
        if (!itemDetails[0]) {
            this.logger.warning(`${rewardTpl} is not an item, setting stack size to 1`);

            return 1;
        }

        // Look for parent in dict
        const settings = this.hideoutConfig.cultistCircle.directRewardStackSize[itemDetails[1]._parent];
        if (!settings) {
            return 1;
        }

        return this.randomUtil.getInt(settings.min, settings.max);
    }

    /**
     * Add a record to the players profile to signal they have accepted a non-repeatable direct reward
     * @param sessionId Session id
     * @param directReward Reward sent to player
     */
    protected flagDirectRewardAsAcceptedInProfile(sessionId: string, directReward: IDirectRewardSettings) {
        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        const dataToStoreInProfile: IAcceptedCultistReward = {
            timestamp: this.timeUtil.getTimestamp(),
            sacrificeItems: directReward.requiredItems,
            rewardItems: directReward.reward,
        };

        fullProfile.spt.cultistRewards[this.getDirectRewardHashKey(directReward)] = dataToStoreInProfile;
    }

    /**
     * Get the size of a reward items stack
     * 1 for everything except ammo, ammo can be between min stack and max stack
     * @param itemTpl Item chosen
     * @param rewardPoolRemaining Rouble amount of pool remaining to fill
     * @returns Size of stack
     */
    protected getRewardStackSize(itemTpl: string, rewardPoolRemaining: number) {
        if (this.itemHelper.isOfBaseclass(itemTpl, BaseClasses.AMMO)) {
            const ammoTemplate = this.itemHelper.getItem(itemTpl)[1];
            return this.itemHelper.getRandomisedAmmoStackSize(ammoTemplate);
        }

        if (this.itemHelper.isOfBaseclass(itemTpl, BaseClasses.MONEY)) {
            // Get currency-specific values from config
            const settings = this.hideoutConfig.cultistCircle.currencyRewards[itemTpl];

            // What % of the pool remaining should be rewarded as chosen currency
            const percentOfPoolToUse = this.randomUtil.getInt(settings.min, settings.max);

            // Rouble amount of pool we want to reward as currency
            const roubleAmountToFill = this.randomUtil.getPercentOfValue(percentOfPoolToUse, rewardPoolRemaining);

            // Convert currency to roubles
            const currencyPriceAsRouble = this.itemHelper.getItemPrice(itemTpl);

            // How many items can we fit into chosen pool
            const itemCountToReward = Math.round(roubleAmountToFill / currencyPriceAsRouble);

            return itemCountToReward ?? 1;
        }

        return 1;
    }

    /**
     * Get a pool of tpl IDs of items the player needs to complete hideout crafts/upgrade areas
     * @param sessionId Session id
     * @param pmcData Profile of player who will be getting the rewards
     * @param rewardType Do we return bonus items (hideout/task items)
     * @param cultistCircleConfig Circle config
     * @returns Array of tpls
     */
    protected getCultistCircleRewardPool(
        sessionId: string,
        pmcData: IPmcData,
        craftingInfo: ICircleCraftDetails,
        cultistCircleConfig: ICultistCircleSettings,
    ): string[] {
        const rewardPool = new Set<string>();
        const hideoutDbData = this.databaseService.getHideout();
        const itemsDb = this.databaseService.getItems();

        // Get all items that match the blacklisted types and fold into item blacklist below
        const itemTypeBlacklist = this.itemFilterService.getItemRewardBaseTypeBlacklist();
        const itemsMatchingTypeBlacklist = Object.values(itemsDb)
            .filter((templateItem) => this.itemHelper.isOfBaseclasses(templateItem._id, itemTypeBlacklist))
            .map((templateItem) => templateItem._id);

        // Create set of unique values to ignore
        const itemRewardBlacklist = new Set([
            ...this.seasonalEventService.getInactiveSeasonalEventItems(),
            ...this.itemFilterService.getItemRewardBlacklist(),
            ...cultistCircleConfig.rewardItemBlacklist,
            ...itemsMatchingTypeBlacklist,
        ]);

        // Hideout and task rewards are ONLY if the bonus is active
        switch (craftingInfo.rewardType) {
            case CircleRewardType.RANDOM: {
                // Does reward pass the high value threshold
                const isHighValueReward = craftingInfo.rewardAmountRoubles >= cultistCircleConfig.highValueThresholdRub;
                this.generateRandomisedItemsAndAddToRewardPool(rewardPool, itemRewardBlacklist, isHighValueReward);

                break;
            }
            case CircleRewardType.HIDEOUT_TASK: {
                // Hideout/Task loot
                this.addHideoutUpgradeRequirementsToRewardPool(hideoutDbData, pmcData, itemRewardBlacklist, rewardPool);
                this.addTaskItemRequirementsToRewardPool(pmcData, itemRewardBlacklist, rewardPool);

                // If we have no tasks or hideout stuff left or need more loot to fill it out, default to high value
                if (rewardPool.size < cultistCircleConfig.maxRewardItemCount + 2) {
                    this.generateRandomisedItemsAndAddToRewardPool(rewardPool, itemRewardBlacklist, true);
                }
                break;
            }
        }

        // Add custom rewards from config
        if (cultistCircleConfig.additionalRewardItemPool.length > 0) {
            for (const additionalReward of cultistCircleConfig.additionalRewardItemPool) {
                if (itemRewardBlacklist.has(additionalReward)) {
                    continue;
                }

                // Add tpl to reward pool
                rewardPool.add(additionalReward);
            }
        }

        return Array.from(rewardPool);
    }

    /**
     * Check players profile for quests with hand-in requirements and add those required items to the pool
     * @param pmcData Player profile
     * @param itemRewardBlacklist Items not to add to pool
     * @param rewardPool Pool to add items to
     */
    protected addTaskItemRequirementsToRewardPool(
        pmcData: IPmcData,
        itemRewardBlacklist: Set<string>,
        rewardPool: Set<string>,
    ): void {
        const activeTasks = pmcData.Quests.filter((quest) => quest.status === QuestStatus.Started);
        for (const task of activeTasks) {
            const questData = this.questHelper.getQuestFromDb(task.qid, pmcData);
            const handoverConditions = questData.conditions.AvailableForFinish.filter(
                (condition) => condition.conditionType === "HandoverItem",
            );
            for (const condition of handoverConditions) {
                for (const neededItem of condition.target) {
                    if (itemRewardBlacklist.has(neededItem) || !this.itemHelper.isValidItem(neededItem)) {
                        continue;
                    }
                    this.logger.debug(`Added Task Loot: ${this.itemHelper.getItemName(neededItem)}`);
                    rewardPool.add(neededItem);
                }
            }
        }
    }

    /**
     * Adds items the player needs to complete hideout crafts/upgrades to the reward pool
     * @param hideoutDbData Hideout area data
     * @param pmcData Player profile
     * @param itemRewardBlacklist Items not to add to pool
     * @param rewardPool Pool to add items to
     */
    protected addHideoutUpgradeRequirementsToRewardPool(
        hideoutDbData: IHideout,
        pmcData: IPmcData,
        itemRewardBlacklist: Set<string>,
        rewardPool: Set<string>,
    ): void {
        const dbAreas = hideoutDbData.areas;
        for (const profileArea of this.getPlayerAccessibleHideoutAreas(pmcData.Hideout.Areas)) {
            const currentStageLevel = profileArea.level;
            const areaType = profileArea.type;

            // Get next stage of area
            const dbArea = dbAreas.find((area) => area.type === areaType);
            const nextStageDbData = dbArea?.stages[currentStageLevel + 1];
            if (nextStageDbData) {
                // Next stage exists, gather up requirements and add to pool
                const itemRequirements = this.getItemRequirements(nextStageDbData.requirements);
                for (const rewardToAdd of itemRequirements) {
                    if (
                        itemRewardBlacklist.has(rewardToAdd.templateId) ||
                        !this.itemHelper.isValidItem(rewardToAdd.templateId)
                    ) {
                        // Dont reward items sacrificed
                        continue;
                    }
                    this.logger.debug(`Added Hideout Loot: ${this.itemHelper.getItemName(rewardToAdd.templateId)}`);
                    rewardPool.add(rewardToAdd.templateId);
                }
            }
        }
    }

    /**
     * Get all active hideout areas
     * @param areas Hideout areas to iterate over
     * @returns Active area array
     */
    protected getPlayerAccessibleHideoutAreas(areas: IBotHideoutArea[]): IBotHideoutArea[] {
        return areas.filter((area) => {
            if (area.type === HideoutAreas.CHRISTMAS_TREE && !this.seasonalEventService.christmasEventEnabled()) {
                // Christmas tree area and not Christmas, skip
                return false;
            }

            return true;
        });
    }

    /**
     * Get array of random reward items
     * @param rewardPool Reward pool to add to
     * @param itemRewardBlacklist Item tpls to ignore
     * @param itemsShouldBeHighValue Should these items meet the valuable threshold
     * @returns Set of item tpls
     */
    protected generateRandomisedItemsAndAddToRewardPool(
        rewardPool: Set<string>,
        itemRewardBlacklist: Set<string>,
        itemsShouldBeHighValue: boolean,
    ): Set<string> {
        const allItems = this.itemHelper.getItems();
        let currentItemCount = 0;
        let attempts = 0;
        // `currentItemCount` var will look for the correct number of items, `attempts` var will keep this from never stopping if the highValueThreshold is too high
        while (
            currentItemCount < this.hideoutConfig.cultistCircle.maxRewardItemCount + 2 &&
            attempts < allItems.length
        ) {
            attempts++;
            const randomItem = this.randomUtil.getArrayValue(allItems);
            if (itemRewardBlacklist.has(randomItem._id) || !this.itemHelper.isValidItem(randomItem._id)) {
                continue;
            }

            // Valuable check
            if (itemsShouldBeHighValue) {
                const itemValue = this.itemHelper.getItemMaxPrice(randomItem._id);
                if (itemValue < this.hideoutConfig.cultistCircle.highValueThresholdRub) {
                    continue;
                }
            }
            this.logger.debug(`Added: ${this.itemHelper.getItemName(randomItem._id)}`);
            rewardPool.add(randomItem._id);
            currentItemCount++;
        }

        return rewardPool;
    }

    /**
     * Iterate over passed in hideout requirements and return the Item
     * @param requirements Requirements to iterate over
     * @returns Array of item requirements
     */
    protected getItemRequirements(requirements: IRequirementBase[]): (IStageRequirement | IRequirement)[] {
        return requirements.filter((requirement) => requirement.type === "Item");
    }
}
