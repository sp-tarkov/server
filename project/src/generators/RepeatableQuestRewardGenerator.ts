import { inject, injectable } from "tsyringe";

import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { IPreset } from "@spt-aki/models/eft/common/IGlobals";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { IQuestReward, IQuestRewards } from "@spt-aki/models/eft/common/tables/IQuest";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Money } from "@spt-aki/models/enums/Money";
import { QuestRewardType } from "@spt-aki/models/enums/QuestRewardType";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IBaseQuestConfig, IQuestConfig, IRepeatableQuestConfig } from "@spt-aki/models/spt/config/IQuestConfig";
import { ExhaustableArray } from "@spt-aki/models/spt/server/ExhaustableArray";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemFilterService } from "@spt-aki/services/ItemFilterService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { SeasonalEventService } from "@spt-aki/services/SeasonalEventService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { MathUtil } from "@spt-aki/utils/MathUtil";
import { ObjectId } from "@spt-aki/utils/ObjectId";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class RepeatableQuestRewardGenerator
{
    protected questConfig: IQuestConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
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
     * Additionally, a scaling factor w.r.t. quest difficulty going from 0.2...1 can be used
     *
     * @param   {integer}   pmcLevel            player's level
     * @param   {number}    difficulty          a reward scaling factor from 0.2 to 1
     * @param   {string}    traderId            the trader for reputation gain (and possible in the future filtering of reward item type based on trader)
     * @param   {object}    repeatableConfig    The configuration for the repeatable kind (daily, weekly) as configured in QuestConfig for the requested quest
     * @returns {object}                        object of "Reward"-type that can be given for a repeatable mission
     */
    public generateReward(
        pmcLevel: number,
        difficulty: number,
        traderId: string,
        repeatableConfig: IRepeatableQuestConfig,
        questConfig: IBaseQuestConfig,
    ): IQuestRewards
    {
        // difficulty could go from 0.2 ... -> for lowest difficulty receive 0.2*nominal reward
        const levelsConfig = repeatableConfig.rewardScaling.levels;
        const roublesConfig = repeatableConfig.rewardScaling.roubles;
        const xpConfig = repeatableConfig.rewardScaling.experience;
        const itemsConfig = repeatableConfig.rewardScaling.items;
        const rewardSpreadConfig = repeatableConfig.rewardScaling.rewardSpread;
        const skillRewardChanceConfig = repeatableConfig.rewardScaling.skillRewardChance;
        const skillPointRewardConfig = repeatableConfig.rewardScaling.skillPointReward;
        const reputationConfig = repeatableConfig.rewardScaling.reputation;

        const effectiveDifficulty = Number.isNaN(difficulty) ? 1 : difficulty;
        if (Number.isNaN(difficulty))
        {
            this.logger.warning(this.localisationService.getText("repeatable-difficulty_was_nan"));
        }

        // rewards are generated based on pmcLevel, difficulty and a random spread
        const rewardXP = Math.floor(
            effectiveDifficulty * this.mathUtil.interp1(pmcLevel, levelsConfig, xpConfig)
                * this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig),
        );
        const rewardRoubles = Math.floor(
            effectiveDifficulty * this.mathUtil.interp1(pmcLevel, levelsConfig, roublesConfig)
                * this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig),
        );
        const rewardNumItems = this.randomUtil.randInt(
            1,
            Math.round(this.mathUtil.interp1(pmcLevel, levelsConfig, itemsConfig)) + 1,
        );
        const rewardReputation =
            Math.round(
                100 * effectiveDifficulty * this.mathUtil.interp1(pmcLevel, levelsConfig, reputationConfig)
                    * this.randomUtil.getFloat(1 - rewardSpreadConfig, 1 + rewardSpreadConfig),
            ) / 100;
        const skillRewardChance = this.mathUtil.interp1(pmcLevel, levelsConfig, skillRewardChanceConfig);
        const skillPointReward = this.mathUtil.interp1(pmcLevel, levelsConfig, skillPointRewardConfig);

        // Possible improvement -> draw trader-specific items e.g. with this.itemHelper.isOfBaseclass(val._id, ItemHelper.BASECLASS.FoodDrink)
        let roublesBudget = rewardRoubles;
        let rewardItemPool = this.chooseRewardItemsWithinBudget(repeatableConfig, roublesBudget, traderId);
        this.logger.debug(
            `Generating daily quest for ${traderId} with budget ${roublesBudget} for ${rewardNumItems} items`,
        );

        const rewards: IQuestRewards = { Started: [], Success: [], Fail: [] };

        let rewardIndex = 0;
        // Add xp reward
        if (rewardXP > 0)
        {
            rewards.Success.push({ value: rewardXP, type: QuestRewardType.EXPERIENCE, index: rewardIndex });
            rewardIndex++;
        }

        // Add money reward
        this.addMoneyReward(traderId, rewards, rewardRoubles, rewardIndex);
        rewardIndex++;

        const traderWhitelistDetails = repeatableConfig.traderWhitelist.find((x) => x.traderId === traderId);
        if (
            traderWhitelistDetails.rewardCanBeWeapon
            && this.randomUtil.getChance100(traderWhitelistDetails.weaponRewardChancePercent)
        )
        {
            // Add a random default preset weapon as reward
            const defaultPresetPool = new ExhaustableArray(
                Object.values(this.presetHelper.getDefaultWeaponPresets()),
                this.randomUtil,
                this.jsonUtil,
            );
            let chosenPreset: IPreset;
            while (defaultPresetPool.hasValues())
            {
                const randomPreset = defaultPresetPool.getRandomValue();
                const tpls = randomPreset._items.map((item) => item._tpl);
                const presetPrice = this.itemHelper.getItemAndChildrenPrice(tpls);
                if (presetPrice <= roublesBudget)
                {
                    this.logger.debug(`  Added weapon ${tpls[0]} with price ${presetPrice}`);
                    roublesBudget -= presetPrice;
                    chosenPreset = this.jsonUtil.clone(randomPreset);
                    break;
                }
            }

            if (chosenPreset)
            {
                // use _encyclopedia as its always the base items _tpl, items[0] isn't guaranteed to be base item
                rewards.Success.push(
                    this.generateRewardItem(chosenPreset._encyclopedia, 1, rewardIndex, chosenPreset._items),
                );
                rewardIndex++;
            }
        }

        if (rewardItemPool.length > 0)
        {
            for (let i = 0; i < rewardNumItems; i++)
            {
                let rewardItemStackCount = 1;
                const itemSelected = rewardItemPool[this.randomUtil.randInt(rewardItemPool.length)];

                if (this.itemHelper.isOfBaseclass(itemSelected._id, BaseClasses.AMMO))
                {
                    // Don't reward ammo that stacks to less than what's defined in config
                    if (itemSelected._props.StackMaxSize < repeatableConfig.rewardAmmoStackMinSize)
                    {
                        i--;
                        continue;
                    }

                    // Choose smallest value between budget fitting size and stack max
                    rewardItemStackCount = this.calculateAmmoStackSizeThatFitsBudget(
                        itemSelected,
                        roublesBudget,
                        rewardNumItems,
                    );
                }

                // 25% chance to double, triple quadruple reward stack (Only occurs when item is stackable and not weapon, armor or ammo)
                if (this.canIncreaseRewardItemStackSize(itemSelected, 70000))
                {
                    rewardItemStackCount = this.getRandomisedRewardItemStackSizeByPrice(itemSelected);
                }

                rewards.Success.push(this.generateRewardItem(itemSelected._id, rewardItemStackCount, rewardIndex));
                rewardIndex++;

                const itemCost = this.presetHelper.getDefaultPresetOrItemPrice(itemSelected._id);
                roublesBudget -= rewardItemStackCount * itemCost;
                this.logger.debug(`  Added item ${itemSelected._id} with price ${rewardItemStackCount * itemCost}`);

                // If we still have budget narrow down possible items
                if (roublesBudget > 0)
                {
                    // Filter possible reward items to only items with a price below the remaining budget
                    rewardItemPool = this.filterRewardPoolWithinBudget(rewardItemPool, roublesBudget, 0);
                    if (rewardItemPool.length === 0)
                    {
                        this.logger.debug(`  Reward pool empty with ${roublesBudget} remaining`);
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
            const reward: IQuestReward = {
                target: traderId,
                value: rewardReputation,
                type: QuestRewardType.TRADER_STANDING,
                index: rewardIndex,
            };
            rewards.Success.push(reward);
            rewardIndex++;

            this.logger.debug(`  Adding ${rewardReputation} trader reputation reward`);
        }

        // Chance of adding skill reward
        if (this.randomUtil.getChance100(skillRewardChance * 100))
        {
            const targetSkill = this.randomUtil.getArrayValue(questConfig.possibleSkillRewards);
            const reward: IQuestReward = {
                target: targetSkill,
                value: skillPointReward,
                type: QuestRewardType.SKILL,
                index: rewardIndex,
            };
            rewards.Success.push(reward);

            this.logger.debug(`  Adding ${skillPointReward} skill points to ${targetSkill}`);
        }

        return rewards;
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
    ): ITemplateItem[]
    {
        return rewardItems.filter((item) =>
        {
            const itemPrice = this.presetHelper.getDefaultPresetOrItemPrice(item._id);
            return itemPrice < roublesBudget && itemPrice > minPrice;
        });
    }

    /**
     * Get a randomised number a reward items stack size should be based on its handbook price
     * @param item Reward item to get stack size for
     * @returns Stack size value
     */
    protected getRandomisedRewardItemStackSizeByPrice(item: ITemplateItem): number
    {
        const rewardItemPrice = this.presetHelper.getDefaultPresetOrItemPrice(item._id);
        if (rewardItemPrice < 3000)
        {
            return this.randomUtil.getArrayValue([2, 3, 4]);
        }

        if (rewardItemPrice < 10000)
        {
            return this.randomUtil.getArrayValue([2, 3]);
        }

        return 2;
    }

    /**
     * Should reward item have stack size increased (25% chance)
     * @param item Item to possibly increase stack size of
     * @param maxRoublePriceToStack Maximum rouble price an item can be to still be chosen for stacking
     * @returns True if it should
     */
    protected canIncreaseRewardItemStackSize(item: ITemplateItem, maxRoublePriceToStack: number): boolean
    {
        return this.presetHelper.getDefaultPresetOrItemPrice(item._id) < maxRoublePriceToStack
            && !this.itemHelper.isOfBaseclasses(item._id, [
                BaseClasses.WEAPON,
                BaseClasses.ARMORED_EQUIPMENT,
                BaseClasses.AMMO,
            ])
            && !this.itemHelper.itemRequiresSoftInserts(item._id)
            && this.randomUtil.getChance100(25);
    }

    protected calculateAmmoStackSizeThatFitsBudget(
        itemSelected: ITemplateItem,
        roublesBudget: number,
        rewardNumItems: number,
    ): number
    {
        // The budget for this ammo stack
        const stackRoubleBudget = roublesBudget / rewardNumItems;

        const singleCartridgePrice = this.handbookHelper.getTemplatePrice(itemSelected._id);

        // Get a stack size of ammo that fits rouble budget
        const stackSizeThatFitsBudget = Math.round(stackRoubleBudget / singleCartridgePrice);

        // Get itemDbs max stack size for ammo - don't go above 100 (some mods mess around with stack sizes)
        const stackMaxCount = Math.min(itemSelected._props.StackMaxSize, 100);

        // Don't let result fall below 1
        return Math.max(1, Math.min(stackSizeThatFitsBudget, stackMaxCount));
    }

    /**
     * Select a number of items that have a colelctive value of the passed in parameter
     * @param repeatableConfig Config
     * @param roublesBudget Total value of items to return
     * @returns Array of reward items that fit budget
     */
    protected chooseRewardItemsWithinBudget(
        repeatableConfig: IRepeatableQuestConfig,
        roublesBudget: number,
        traderId: string,
    ): ITemplateItem[]
    {
        // First filter for type and baseclass to avoid lookup in handbook for non-available items
        const rewardableItemPool = this.getRewardableItems(repeatableConfig, traderId);
        const minPrice = Math.min(25000, 0.5 * roublesBudget);

        let rewardableItemPoolWithinBudget = rewardableItemPool.map((x) => x[1]);
        rewardableItemPoolWithinBudget = this.filterRewardPoolWithinBudget(
            rewardableItemPoolWithinBudget,
            roublesBudget,
            minPrice,
        );
        if (rewardableItemPoolWithinBudget.length === 0)
        {
            this.logger.warning(
                this.localisationService.getText("repeatable-no_reward_item_found_in_price_range", {
                    minPrice: minPrice,
                    roublesBudget: roublesBudget,
                }),
            );
            // In case we don't find any items in the price range
            rewardableItemPoolWithinBudget = rewardableItemPool.filter((x) =>
                this.itemHelper.getItemPrice(x[0]) < roublesBudget
            ).map((x) => x[1]);
        }

        return rewardableItemPoolWithinBudget;
    }

    /**
     * Helper to create a reward item structured as required by the client
     *
     * @param   {string}    tpl             ItemId of the rewarded item
     * @param   {integer}   value           Amount of items to give
     * @param   {integer}   index           All rewards will be appended to a list, for unknown reasons the client wants the index
     * @returns {object}                    Object of "Reward"-item-type
     */
    protected generateRewardItem(tpl: string, value: number, index: number, preset: Item[] = null): IQuestReward
    {
        const id = this.objectId.generate();
        const rewardItem: IQuestReward = { target: id, value: value, type: QuestRewardType.ITEM, index: index };

        if (preset)
        {
            const rootItem = preset.find((x) => x._tpl === tpl);
            rewardItem.items = this.itemHelper.reparentItemAndChildren(rootItem, preset);
            rewardItem.target = rootItem._id; // Target property and root items id must match
        }
        else
        {
            const rootItem = { _id: id, _tpl: tpl, upd: { StackObjectsCount: value, SpawnedInSession: true } };
            rewardItem.items = [rootItem];
        }
        return rewardItem;
    }

    /**
     * Picks rewardable items from items.json. This means they need to fit into the inventory and they shouldn't be keys (debatable)
     * @param repeatableQuestConfig Config file
     * @returns List of rewardable items [[_tpl, itemTemplate],...]
     */
    public getRewardableItems(
        repeatableQuestConfig: IRepeatableQuestConfig,
        traderId: string,
    ): [string, ITemplateItem][]
    {
        // Get an array of seasonal items that should not be shown right now as seasonal event is not active
        const seasonalItems = this.seasonalEventService.getInactiveSeasonalEventItems();

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

                if (seasonalItems.includes(tpl))
                {
                    return false;
                }

                const traderWhitelist = repeatableQuestConfig.traderWhitelist.find((trader) =>
                    trader.traderId === traderId
                );
                return this.isValidRewardItem(tpl, repeatableQuestConfig, traderWhitelist?.rewardBaseWhitelist);
            },
        );
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
    ): boolean
    {
        if (!this.itemHelper.isValidItem(tpl))
        {
            return false;
        }

        // Check global blacklist
        if (this.itemFilterService.isItemBlacklisted(tpl))
        {
            return false;
        }

        // item is reward blacklisted
        if (this.itemFilterService.isItemRewardBlacklisted(tpl))
        {
            return false;
        }

        // Item is on repeatable or global blacklist
        if (repeatableQuestConfig.rewardBlacklist.includes(tpl) || this.itemFilterService.isItemBlacklisted(tpl))
        {
            return false;
        }

        // Item has blacklisted base type
        if (this.itemHelper.isOfBaseclasses(tpl, [...repeatableQuestConfig.rewardBaseTypeBlacklist]))
        {
            return false;
        }

        // Skip boss items
        if (this.itemFilterService.isBossItem(tpl))
        {
            return false;
        }

        // Trader has specific item base types they can give as rewards to player
        if (itemBaseWhitelist !== undefined)
        {
            if (!this.itemHelper.isOfBaseclasses(tpl, [...itemBaseWhitelist]))
            {
                return false;
            }
        }

        return true;
    }

    protected addMoneyReward(traderId: string, rewards: IQuestRewards, rewardRoubles: number, rewardIndex: number): void
    {
        // PK and Fence use euros
        if (traderId === Traders.PEACEKEEPER || traderId === Traders.FENCE)
        {
            rewards.Success.push(
                this.generateRewardItem(
                    Money.EUROS,
                    this.handbookHelper.fromRUB(rewardRoubles, Money.EUROS),
                    rewardIndex,
                ),
            );
        }
        else
        {
            // Everyone else uses roubles
            rewards.Success.push(this.generateRewardItem(Money.ROUBLES, rewardRoubles, rewardIndex));
        }
    }
}
