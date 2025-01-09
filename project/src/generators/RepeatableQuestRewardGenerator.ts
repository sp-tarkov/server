import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IQuestReward, IQuestRewards } from "@spt/models/eft/common/tables/IQuest";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Money } from "@spt/models/enums/Money";
import { QuestRewardType } from "@spt/models/enums/QuestRewardType";
import { Traders } from "@spt/models/enums/Traders";
import {
    IBaseQuestConfig,
    IQuestConfig,
    IRepeatableQuestConfig,
    IRewardScaling,
} from "@spt/models/spt/config/IQuestConfig";
import { IQuestRewardValues } from "@spt/models/spt/repeatable/IQuestRewardValues";
import { ExhaustableArray } from "@spt/models/spt/server/ExhaustableArray";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import { MathUtil } from "@spt/utils/MathUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RepeatableQuestRewardGenerator {
    protected questConfig: IQuestConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * Generate the reward for a mission. A reward can consist of:
     * - Experience
     * - Money
     * - GP coins
     * - Weapon preset
     * - Items
     * - Trader Reputation
     * - Skill level experience
     *
     * The reward is dependent on the player level as given by the wiki. The exact mapping of pmcLevel to
     * experience / money / items / trader reputation can be defined in QuestConfig.js
     *
     * There's also a random variation of the reward the spread of which can be also defined in the config
     *
     * Additionally, a scaling factor w.r.t. quest difficulty going from 0.2...1 can be used
     * @param pmcLevel Level of player reward is being generated for
     * @param difficulty Reward scaling factor from 0.2 to 1
     * @param traderId Trader reward will be given by
     * @param repeatableConfig Config for quest type (daily, weekly)
     * @param questConfig
     * @param rewardTplBlacklist OPTIONAL: list of tpls to NOT use when picking a reward
     * @returns IQuestRewards
     */
    public generateReward(
        pmcLevel: number,
        difficulty: number,
        traderId: string,
        repeatableConfig: IRepeatableQuestConfig,
        questConfig: IBaseQuestConfig,
        rewardTplBlacklist?: string[],
    ): IQuestRewards {
        // Get vars to configure rewards with
        const rewardParams = this.getQuestRewardValues(repeatableConfig.rewardScaling, difficulty, pmcLevel);

        // Get budget to spend on item rewards (copy of raw roubles given)
        let itemRewardBudget = rewardParams.rewardRoubles;

        // Possible improvement -> draw trader-specific items e.g. with this.itemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.FoodDrink)
        const rewards: IQuestRewards = { Started: [], Success: [], Fail: [] };

        // Start reward index to keep track
        let rewardIndex = -1;

        // Add xp reward
        if (rewardParams.rewardXP > 0) {
            rewards.Success.push({
                id: this.hashUtil.generate(),
                unknown: false,
                gameMode: [],
                availableInGameEditions: [],
                index: rewardIndex,
                value: rewardParams.rewardXP,
                type: QuestRewardType.EXPERIENCE,
            });
            rewardIndex++;
        }

        // Add money reward
        rewards.Success.push(this.getMoneyReward(traderId, rewardParams.rewardRoubles, rewardIndex));
        rewardIndex++;

        // Add GP coin reward
        rewards.Success.push(this.generateItemReward(Money.GP, rewardParams.gpCoinRewardCount, rewardIndex));
        rewardIndex++;

        // Add preset weapon to reward if checks pass
        const traderWhitelistDetails = repeatableConfig.traderWhitelist.find(
            (traderWhitelist) => traderWhitelist.traderId === traderId,
        );
        if (
            traderWhitelistDetails?.rewardCanBeWeapon &&
            this.randomUtil.getChance100(traderWhitelistDetails.weaponRewardChancePercent)
        ) {
            const chosenWeapon = this.getRandomWeaponPresetWithinBudget(itemRewardBudget, rewardIndex);
            if (chosenWeapon) {
                rewards.Success.push(chosenWeapon.weapon);

                // Subtract price of preset from item budget so we dont give player too much stuff
                itemRewardBudget -= chosenWeapon.price;
                rewardIndex++;
            }
        }

        let inBudgetRewardItemPool = this.chooseRewardItemsWithinBudget(repeatableConfig, itemRewardBudget, traderId);
        if (rewardTplBlacklist) {
            // Filter reward pool of items from blacklist, only use if there's at least 1 item remaining
            const filteredRewardItemPool = inBudgetRewardItemPool.filter(
                (item) => !rewardTplBlacklist.includes(item._id),
            );
            if (filteredRewardItemPool.length > 0) {
                inBudgetRewardItemPool = filteredRewardItemPool;
            }
        }

        this.logger.debug(
            `Generating: ${repeatableConfig.name} quest for: ${traderId} with budget: ${itemRewardBudget} totalling: ${rewardParams.rewardNumItems} items`,
        );
        if (inBudgetRewardItemPool.length > 0) {
            const itemsToReward = this.getRewardableItemsFromPoolWithinBudget(
                inBudgetRewardItemPool,
                rewardParams.rewardNumItems,
                itemRewardBudget,
                repeatableConfig,
            );

            // Add item rewards
            for (const itemReward of itemsToReward) {
                rewards.Success.push(this.generateItemReward(itemReward.item._id, itemReward.stackSize, rewardIndex));
                rewardIndex++;
            }
        }

        // Add rep reward to rewards array
        if (rewardParams.rewardReputation > 0) {
            const reward: IQuestReward = {
                id: this.hashUtil.generate(),
                unknown: false,
                gameMode: [],
                availableInGameEditions: [],
                target: traderId,
                value: rewardParams.rewardReputation,
                type: QuestRewardType.TRADER_STANDING,
                index: rewardIndex,
            };
            rewards.Success.push(reward);
            rewardIndex++;

            this.logger.debug(`Adding: ${rewardParams.rewardReputation} ${traderId} trader reputation reward`);
        }

        // Chance of adding skill reward
        if (this.randomUtil.getChance100(rewardParams.skillRewardChance * 100)) {
            const targetSkill = this.randomUtil.getArrayValue(questConfig.possibleSkillRewards);
            const reward: IQuestReward = {
                id: this.hashUtil.generate(),
                unknown: false,
                gameMode: [],
                availableInGameEditions: [],
                target: targetSkill,
                value: rewardParams.skillPointReward,
                type: QuestRewardType.SKILL,
                index: rewardIndex,
            };
            rewards.Success.push(reward);

            this.logger.debug(`  Adding ${rewardParams.skillPointReward} skill points to ${targetSkill}`);
        }

        return rewards;
    }

    protected getQuestRewardValues(
        rewardScaling: IRewardScaling,
        difficulty: number,
        pmcLevel: number,
    ): IQuestRewardValues {
        // difficulty could go from 0.2 ... -> for lowest difficulty receive 0.2*nominal reward
        const levelsConfig = rewardScaling.levels;
        const roublesConfig = rewardScaling.roubles;
        const gpCoinConfig = rewardScaling.gpCoins;
        const xpConfig = rewardScaling.experience;
        const itemsConfig = rewardScaling.items;
        const rewardSpreadConfig = rewardScaling.rewardSpread;
        const skillRewardChanceConfig = rewardScaling.skillRewardChance;
        const skillPointRewardConfig = rewardScaling.skillPointReward;
        const reputationConfig = rewardScaling.reputation;

        const effectiveDifficulty = Number.isNaN(difficulty) ? 1 : difficulty;
        if (Number.isNaN(difficulty)) {
            this.logger.warning(this.localisationService.getText("repeatable-difficulty_was_nan"));
        }

        return {
            skillPointReward: this.mathUtil.interp1(pmcLevel, levelsConfig, skillPointRewardConfig),
            skillRewardChance: this.mathUtil.interp1(pmcLevel, levelsConfig, skillRewardChanceConfig),
            rewardReputation:
                Math.round(
                    100 *
                        effectiveDifficulty *
                        this.mathUtil.interp1(pmcLevel, levelsConfig, reputationConfig) *
                        this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig),
                ) / 100,
            rewardNumItems: this.randomUtil.randInt(
                1,
                Math.round(this.mathUtil.interp1(pmcLevel, levelsConfig, itemsConfig)) + 1,
            ),
            rewardRoubles: Math.floor(
                effectiveDifficulty *
                    this.mathUtil.interp1(pmcLevel, levelsConfig, roublesConfig) *
                    this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig),
            ),
            gpCoinRewardCount: Math.ceil(
                // Ceil value to ensure it never drops below 1
                effectiveDifficulty *
                    this.mathUtil.interp1(pmcLevel, levelsConfig, gpCoinConfig) *
                    this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig),
            ),
            rewardXP: Math.floor(
                effectiveDifficulty *
                    this.mathUtil.interp1(pmcLevel, levelsConfig, xpConfig) *
                    this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig),
            ),
        };
    }

    /**
     * Get an array of items + stack size to give to player as reward that fit inside of a rouble budget
     * @param itemPool All possible items to choose rewards from
     * @param maxItemCount Total number of items to reward
     * @param itemRewardBudget Rouble buget all item rewards must fit in
     * @param repeatableConfig config for quest type
     * @returns Items and stack size
     */
    protected getRewardableItemsFromPoolWithinBudget(
        itemPool: ITemplateItem[],
        maxItemCount: number,
        itemRewardBudget: number,
        repeatableConfig: IRepeatableQuestConfig,
    ): { item: ITemplateItem; stackSize: number }[] {
        const itemsToReturn: { item: ITemplateItem; stackSize: number }[] = [];
        let exhausableItemPool = new ExhaustableArray(itemPool, this.randomUtil, this.cloner);

        for (let i = 0; i < maxItemCount; i++) {
            // Default stack size to 1
            let rewardItemStackCount = 1;

            // Get a random item
            const chosenItemFromPool = exhausableItemPool.getRandomValue();
            if (!exhausableItemPool.hasValues()) {
                break;
            }

            // Handle edge case - ammo
            if (this.itemHelper.isOfBaseclass(chosenItemFromPool._id, BaseClasses.AMMO)) {
                // Don't reward ammo that stacks to less than what's allowed in config
                if (chosenItemFromPool._props.StackMaxSize < repeatableConfig.rewardAmmoStackMinSize) {
                    i--;
                    continue;
                }

                // Choose smallest value between budget, fitting size and stack max
                rewardItemStackCount = this.calculateAmmoStackSizeThatFitsBudget(
                    chosenItemFromPool,
                    itemRewardBudget,
                    maxItemCount,
                );
            }

            // 25% chance to double, triple or quadruple reward stack
            // (Only occurs when item is stackable and not weapon, armor or ammo)
            if (this.canIncreaseRewardItemStackSize(chosenItemFromPool, 70000, 25)) {
                rewardItemStackCount = this.getRandomisedRewardItemStackSizeByPrice(chosenItemFromPool);
            }

            itemsToReturn.push({ item: chosenItemFromPool, stackSize: rewardItemStackCount });

            const itemCost = this.presetHelper.getDefaultPresetOrItemPrice(chosenItemFromPool._id);
            const calculatedItemRewardBudget = itemRewardBudget - rewardItemStackCount * itemCost;
            this.logger.debug(`Added item: ${chosenItemFromPool._id} with price: ${rewardItemStackCount * itemCost}`);

            // If we still have budget narrow down possible items
            if (calculatedItemRewardBudget > 0) {
                // Filter possible reward items to only items with a price below the remaining budget
                exhausableItemPool = new ExhaustableArray(
                    this.filterRewardPoolWithinBudget(itemPool, calculatedItemRewardBudget, 0),
                    this.randomUtil,
                    this.cloner,
                );

                if (!exhausableItemPool.hasValues()) {
                    this.logger.debug(
                        `Reward pool empty with: ${calculatedItemRewardBudget} roubles of budget remaining`,
                    );
                    break; // No reward items left, exit
                }
            }

            // No budget for more items, end loop
            break;
        }

        return itemsToReturn;
    }

    /**
     * Choose a random Weapon preset that fits inside of a rouble amount limit
     * @param roublesBudget
     * @param rewardIndex
     * @returns IQuestReward
     */
    protected getRandomWeaponPresetWithinBudget(
        roublesBudget: number,
        rewardIndex: number,
    ): { weapon: IQuestReward; price: number } | undefined {
        // Add a random default preset weapon as reward
        const defaultPresetPool = new ExhaustableArray(
            Object.values(this.presetHelper.getDefaultWeaponPresets()),
            this.randomUtil,
            this.cloner,
        );

        while (defaultPresetPool.hasValues()) {
            const randomPreset = defaultPresetPool.getRandomValue();
            if (!randomPreset) {
                continue;
            }

            // Gather all tpls so we can get prices of them
            const tpls = randomPreset._items.map((item) => item._tpl);

            // Does preset items fit our budget
            const presetPrice = this.itemHelper.getItemAndChildrenPrice(tpls);
            if (presetPrice <= roublesBudget) {
                this.logger.debug(`Added weapon: ${tpls[0]} with price: ${presetPrice}`);
                const chosenPreset = this.cloner.clone(randomPreset);

                return {
                    weapon: this.generatePresetReward(chosenPreset._encyclopedia, 1, rewardIndex, chosenPreset._items),
                    price: presetPrice,
                };
            }
        }

        return undefined;
    }

    /**
     * @param rewardItems List of reward items to filter
     * @param roublesBudget The budget remaining for rewards
     * @param minPrice The minimum priced item to include
     * @returns True if any items remain in `rewardItems`, false otherwise
     */
    protected filterRewardPoolWithinBudget(
        rewardItems: ITemplateItem[],
        roublesBudget: number,
        minPrice: number,
    ): ITemplateItem[] {
        return rewardItems.filter((item) => {
            const itemPrice = this.presetHelper.getDefaultPresetOrItemPrice(item._id);
            return itemPrice < roublesBudget && itemPrice > minPrice;
        });
    }

    /**
     * Get a randomised number a reward items stack size should be based on its handbook price
     * @param item Reward item to get stack size for
     * @returns matching stack size for the passed in items price
     */
    protected getRandomisedRewardItemStackSizeByPrice(item: ITemplateItem): number {
        const rewardItemPrice = this.presetHelper.getDefaultPresetOrItemPrice(item._id);

        // Define price tiers and corresponding stack size options
        const priceTiers: {
            priceThreshold: number;
            stackSizes: number[];
        }[] = [
            { priceThreshold: 3000, stackSizes: [2, 3, 4] },
            { priceThreshold: 10000, stackSizes: [2, 3] },
            { priceThreshold: Number.POSITIVE_INFINITY, stackSizes: [2] }, // Default for prices 10001+ RUB
        ];

        // Find the appropriate price tier and return a random stack size from its options
        const tier = priceTiers.find((tier) => rewardItemPrice < tier.priceThreshold);
        return this.randomUtil.getArrayValue(tier?.stackSizes || [2]); // Default to 2 if no tier matches
    }

    /**
     * Should reward item have stack size increased (25% chance)
     * @param item Item to increase reward stack size of
     * @param maxRoublePriceToStack Maximum rouble price an item can be to still be chosen for stacking
     * @param randomChanceToPass Additional randomised chance of passing
     * @returns True if items stack size can be increased
     */
    protected canIncreaseRewardItemStackSize(
        item: ITemplateItem,
        maxRoublePriceToStack: number,
        randomChanceToPass?: number,
    ): boolean {
        const isEligibleForStackSizeIncrease =
            this.presetHelper.getDefaultPresetOrItemPrice(item._id) < maxRoublePriceToStack &&
            !this.itemHelper.isOfBaseclasses(item._id, [
                BaseClasses.WEAPON,
                BaseClasses.ARMORED_EQUIPMENT,
                BaseClasses.AMMO,
            ]) &&
            !this.itemHelper.itemRequiresSoftInserts(item._id);

        return isEligibleForStackSizeIncrease && this.randomUtil.getChance100(randomChanceToPass ?? 100);
    }

    /**
     * Get a count of cartridges that fits the rouble budget amount provided
     * e.g. how many M80s for 50,000 roubles
     * @param itemSelected Cartridge
     * @param roublesBudget Rouble budget
     * @param rewardNumItems
     * @returns Count that fits budget (min 1)
     */
    protected calculateAmmoStackSizeThatFitsBudget(
        itemSelected: ITemplateItem,
        roublesBudget: number,
        rewardNumItems: number,
    ): number {
        // Calculate budget per reward item
        const stackRoubleBudget = roublesBudget / rewardNumItems;

        const singleCartridgePrice = this.handbookHelper.getTemplatePrice(itemSelected._id);

        // Get a stack size of ammo that fits rouble budget
        const stackSizeThatFitsBudget = Math.round(stackRoubleBudget / singleCartridgePrice);

        // Get itemDbs max stack size for ammo - don't go above 100 (some mods mess around with stack sizes)
        const stackMaxCount = Math.min(itemSelected._props.StackMaxSize, 100);

        // Ensure stack size is at least 1 + is no larger than the max possible stack size
        return Math.max(1, Math.min(stackSizeThatFitsBudget, stackMaxCount));
    }

    /**
     * Select a number of items that have a colelctive value of the passed in parameter
     * @param repeatableConfig Config
     * @param roublesBudget Total value of items to return
     * @param traderId Id of the trader who will give player reward
     * @returns Array of reward items that fit budget
     */
    protected chooseRewardItemsWithinBudget(
        repeatableConfig: IRepeatableQuestConfig,
        roublesBudget: number,
        traderId: string,
    ): ITemplateItem[] {
        // First filter for type and baseclass to avoid lookup in handbook for non-available items
        const rewardableItemPool = this.getRewardableItems(repeatableConfig, traderId);
        const minPrice = Math.min(25000, 0.5 * roublesBudget);

        let rewardableItemPoolWithinBudget = this.filterRewardPoolWithinBudget(
            rewardableItemPool.map((item) => item[1]),
            roublesBudget,
            minPrice,
        );

        if (rewardableItemPoolWithinBudget.length === 0) {
            this.logger.warning(
                this.localisationService.getText("repeatable-no_reward_item_found_in_price_range", {
                    minPrice: minPrice,
                    roublesBudget: roublesBudget,
                }),
            );
            // In case we don't find any items in the price range
            rewardableItemPoolWithinBudget = rewardableItemPool
                .filter((x) => this.itemHelper.getItemPrice(x[0]) < roublesBudget)
                .map((x) => x[1]);
        }

        return rewardableItemPoolWithinBudget;
    }

    /**
     * Helper to create a reward item structured as required by the client
     *
     * @param   {string}    tpl             ItemId of the rewarded item
     * @param   {integer}   count           Amount of items to give
     * @param   {integer}   index           All rewards will be appended to a list, for unknown reasons the client wants the index
     * @param preset Optional array of preset items
     * @returns {object}                    Object of "Reward"-item-type
     */
    protected generateItemReward(tpl: string, count: number, index: number, foundInRaid = true): IQuestReward {
        const id = this.hashUtil.generate();
        const questRewardItem: IQuestReward = {
            id: this.hashUtil.generate(),
            unknown: false,
            gameMode: [],
            availableInGameEditions: [],
            index: index,
            target: id,
            value: count,
            isEncoded: false,
            findInRaid: foundInRaid,
            type: QuestRewardType.ITEM,
            items: [],
        };

        const rootItem = { _id: id, _tpl: tpl, upd: { StackObjectsCount: count, SpawnedInSession: foundInRaid } };
        questRewardItem.items = [rootItem];

        return questRewardItem;
    }

    /**
     * Helper to create a reward item structured as required by the client
     *
     * @param   {string}    tpl             ItemId of the rewarded item
     * @param   {integer}   count           Amount of items to give
     * @param   {integer}   index           All rewards will be appended to a list, for unknown reasons the client wants the index
     * @param preset Optional array of preset items
     * @returns {object}                    Object of "Reward"-item-type
     */
    protected generatePresetReward(
        tpl: string,
        count: number,
        index: number,
        preset?: IItem[],
        foundInRaid = true,
    ): IQuestReward {
        const id = this.hashUtil.generate();
        const questRewardItem: IQuestReward = {
            id: this.hashUtil.generate(),
            unknown: false,
            gameMode: [],
            availableInGameEditions: [],
            index: index,
            target: id,
            value: count,
            isEncoded: false,
            findInRaid: foundInRaid,
            type: QuestRewardType.ITEM,
            items: [],
        };

        // Get presets root item
        const rootItem = preset.find((item) => item._tpl === tpl);
        if (!rootItem) {
            this.logger.warning(`Root item of preset: ${tpl} not found`);
        }

        if (rootItem.upd) {
            rootItem.upd.SpawnedInSession = foundInRaid;
        }

        questRewardItem.items = this.itemHelper.reparentItemAndChildren(rootItem, preset);
        questRewardItem.target = rootItem._id; // Target property and root items id must match

        return questRewardItem;
    }

    /**
     * Picks rewardable items from items.json
     * This means they must:
     * - Fit into the inventory
     * - Shouldn't be keys
     * - Have a price greater than 0
     * @param repeatableQuestConfig Config file
     * @param traderId Id of trader who will give reward to player
     * @returns List of rewardable items [[_tpl, itemTemplate],...]
     */
    public getRewardableItems(
        repeatableQuestConfig: IRepeatableQuestConfig,
        traderId: string,
    ): [string, ITemplateItem][] {
        // Get an array of seasonal items that should not be shown right now as seasonal event is not active
        const seasonalItems = this.seasonalEventService.getInactiveSeasonalEventItems();

        // Check for specific baseclasses which don't make sense as reward item
        // also check if the price is greater than 0; there are some items whose price can not be found
        // those are not in the game yet (e.g. AGS grenade launcher)
        return Object.entries(this.databaseService.getItems()).filter(([tpl, itemTemplate]) => {
            // Base "Item" item has no parent, ignore it
            if (itemTemplate._parent === "") {
                return false;
            }

            if (seasonalItems.includes(tpl)) {
                return false;
            }

            const traderWhitelist = repeatableQuestConfig.traderWhitelist.find(
                (trader) => trader.traderId === traderId,
            );
            return this.isValidRewardItem(tpl, repeatableQuestConfig, traderWhitelist?.rewardBaseWhitelist);
        });
    }

    /**
     * Checks if an id is a valid item. Valid meaning that it's an item that may be a reward
     * or content of bot loot. Items that are tested as valid may be in a player backpack or stash.
     * @param {string} tpl template id of item to check
     * @returns True if item is valid reward
     */
    protected isValidRewardItem(
        tpl: string,
        repeatableQuestConfig: IRepeatableQuestConfig,
        itemBaseWhitelist: string[],
    ): boolean {
        // Return early if not valid item to give as reward
        if (!this.itemHelper.isValidItem(tpl)) {
            return false;
        }

        // Check item is not blacklisted
        if (
            this.itemFilterService.isItemBlacklisted(tpl) ||
            this.itemFilterService.isItemRewardBlacklisted(tpl) ||
            repeatableQuestConfig.rewardBlacklist.includes(tpl) ||
            this.itemFilterService.isItemBlacklisted(tpl)
        ) {
            return false;
        }

        // Item has blacklisted base types
        if (this.itemHelper.isOfBaseclasses(tpl, [...repeatableQuestConfig.rewardBaseTypeBlacklist])) {
            return false;
        }

        // Skip boss items
        if (this.itemFilterService.isBossItem(tpl)) {
            return false;
        }

        // Trader has specific item base types they can give as rewards to player
        if (itemBaseWhitelist !== undefined && !this.itemHelper.isOfBaseclasses(tpl, [...itemBaseWhitelist])) {
            return false;
        }

        return true;
    }

    protected getMoneyReward(traderId: string, rewardRoubles: number, rewardIndex: number): IQuestReward {
        // Determine currency based on trader
        // PK and Fence use Euros, everyone else is Roubles
        const currency = traderId === Traders.PEACEKEEPER || traderId === Traders.FENCE ? Money.EUROS : Money.ROUBLES;

        // Convert reward amount to Euros if necessary
        const rewardAmountToGivePlayer =
            currency === Money.EUROS ? this.handbookHelper.fromRUB(rewardRoubles, Money.EUROS) : rewardRoubles;

        // Get chosen currency + amount and return
        return this.generateItemReward(currency, rewardAmountToGivePlayer, rewardIndex, false);
    }
}
