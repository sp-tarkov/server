import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { Product } from "@spt-aki/models/eft/common/tables/IBotBase";
import { Item, Upd } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { IHideoutScavCase } from "@spt-aki/models/eft/hideout/IHideoutScavCase";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Money } from "@spt-aki/models/enums/Money";
import { IScavCaseConfig } from "@spt-aki/models/spt/config/IScavCaseConfig";
import {
    RewardCountAndPriceDetails,
    ScavCaseRewardCountsAndPrices,
} from "@spt-aki/models/spt/hideout/ScavCaseRewardCountsAndPrices";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemFilterService } from "@spt-aki/services/ItemFilterService";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

/**
 * Handle the creation of randomised scav case rewards
 */
@injectable()
export class ScavCaseRewardGenerator
{
    protected scavCaseConfig: IScavCaseConfig;
    protected dbItemsCache: ITemplateItem[];
    protected dbAmmoItemsCache: ITemplateItem[];

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.scavCaseConfig = this.configServer.getConfig(ConfigTypes.SCAVCASE);
    }

    /**
     * Create an array of rewards that will be given to the player upon completing their scav case build
     * @param recipeId recipe of the scav case craft
     * @returns Product array
     */
    public generate(recipeId: string): Item[][]
    {
        this.cacheDbItems();

        // Get scavcase details from hideout/scavcase.json
        const scavCaseDetails = this.databaseServer.getTables().hideout.scavcase.find((r) => r._id === recipeId);
        const rewardItemCounts = this.getScavCaseRewardCountsAndPrices(scavCaseDetails);

        // Get items that fit the price criteria as set by the scavCase config
        const commonPricedItems = this.getFilteredItemsByPrice(this.dbItemsCache, rewardItemCounts.Common);
        const rarePricedItems = this.getFilteredItemsByPrice(this.dbItemsCache, rewardItemCounts.Rare);
        const superRarePricedItems = this.getFilteredItemsByPrice(this.dbItemsCache, rewardItemCounts.Superrare);

        // Get randomly picked items from each item collction, the count range of which is defined in hideout/scavcase.json
        const randomlyPickedCommonRewards = this.pickRandomRewards(
            commonPricedItems,
            rewardItemCounts.Common,
            "common",
        );
        const randomlyPickedRareRewards = this.pickRandomRewards(rarePricedItems, rewardItemCounts.Rare, "rare");
        const randomlyPickedSuperRareRewards = this.pickRandomRewards(
            superRarePricedItems,
            rewardItemCounts.Superrare,
            "superrare",
        );

        // Add randomised stack sizes to ammo and money rewards
        const commonRewards = this.randomiseContainerItemRewards(randomlyPickedCommonRewards, "common");
        const rareRewards = this.randomiseContainerItemRewards(randomlyPickedRareRewards, "rare");
        const superRareRewards = this.randomiseContainerItemRewards(randomlyPickedSuperRareRewards, "superrare");

        return [...commonRewards, ...rareRewards, ...superRareRewards];
    }

    /**
     * Get all db items that are not blacklisted in scavcase config or global blacklist
     * Store in class field
     */
    protected cacheDbItems(): void
    {
        if (!this.dbItemsCache)
        {
            this.dbItemsCache = Object.values(this.databaseServer.getTables().templates.items).filter((item) =>
            {
                // Base "Item" item has no parent, ignore it
                if (item._parent === "")
                {
                    return false;
                }

                if (item._type === "Node")
                {
                    return false;
                }

                if (item._props.QuestItem)
                {
                    return false;
                }

                // Skip item if item id is on blacklist
                if (
                    (item._type !== "Item")
                    || this.scavCaseConfig.rewardItemBlacklist.includes(item._id)
                    || this.itemFilterService.isItemBlacklisted(item._id)
                )
                {
                    return false;
                }

                if (!this.scavCaseConfig.allowBossItemsAsRewards && this.itemFilterService.isBossItem(item._id))
                {
                    return false;
                }

                // Skip item if parent id is blacklisted
                if (this.itemHelper.isOfBaseclasses(item._id, this.scavCaseConfig.rewardItemParentBlacklist))
                {
                    return false;
                }

                return true;
            });
        }

        if (!this.dbAmmoItemsCache)
        {
            this.dbAmmoItemsCache = Object.values(this.databaseServer.getTables().templates.items).filter((item) =>
            {
                // Base "Item" item has no parent, ignore it
                if (item._parent === "")
                {
                    return false;
                }

                if (item._type !== "Item")
                {
                    return false;
                }

                // Not ammo, skip
                if (!this.itemHelper.isOfBaseclass(item._id, BaseClasses.AMMO))
                {
                    return false;
                }

                // Skip ammo that doesn't stack as high as value in config
                if (item._props.StackMaxSize < this.scavCaseConfig.ammoRewards.minStackSize)
                {
                    return false;
                }

                return true;
            });
        }
    }

    /**
     * Pick a number of items to be rewards, the count is defined by the values in `itemFilters` param
     * @param items item pool to pick rewards from
     * @param itemFilters how the rewards should be filtered down (by item count)
     * @returns
     */
    protected pickRandomRewards(
        items: ITemplateItem[],
        itemFilters: RewardCountAndPriceDetails,
        rarity: string,
    ): ITemplateItem[]
    {
        const result: ITemplateItem[] = [];

        let rewardWasMoney = false;
        let rewardWasAmmo = false;
        const randomCount = this.randomUtil.getInt(itemFilters.minCount, itemFilters.maxCount);
        for (let i = 0; i < randomCount; i++)
        {
            if (this.rewardShouldBeMoney() && !rewardWasMoney)
            { // Only allow one reward to be money
                result.push(this.getRandomMoney());
                if (!this.scavCaseConfig.allowMultipleMoneyRewardsPerRarity)
                {
                    rewardWasMoney = true;
                }
            }
            else if (this.rewardShouldBeAmmo() && !rewardWasAmmo)
            { // Only allow one reward to be ammo
                result.push(this.getRandomAmmo(rarity));
                if (!this.scavCaseConfig.allowMultipleAmmoRewardsPerRarity)
                {
                    rewardWasAmmo = true;
                }
            }
            else
            {
                result.push(this.randomUtil.getArrayValue(items));
            }
        }

        return result;
    }

    /**
     * Choose if money should be a reward based on the moneyRewardChancePercent config chance in scavCaseConfig
     * @returns true if reward should be money
     */
    protected rewardShouldBeMoney(): boolean
    {
        return this.randomUtil.getChance100(this.scavCaseConfig.moneyRewards.moneyRewardChancePercent);
    }

    /**
     * Choose if ammo should be a reward based on the ammoRewardChancePercent config chance in scavCaseConfig
     * @returns true if reward should be ammo
     */
    protected rewardShouldBeAmmo(): boolean
    {
        return this.randomUtil.getChance100(this.scavCaseConfig.ammoRewards.ammoRewardChancePercent);
    }

    /**
     * Choose from rouble/dollar/euro at random
     */
    protected getRandomMoney(): ITemplateItem
    {
        const money: ITemplateItem[] = [];
        money.push(this.databaseServer.getTables().templates.items["5449016a4bdc2d6f028b456f"]); // rub
        money.push(this.databaseServer.getTables().templates.items["569668774bdc2da2298b4568"]); // euro
        money.push(this.databaseServer.getTables().templates.items["5696686a4bdc2da3298b456a"]); // dollar

        return this.randomUtil.getArrayValue(money);
    }

    /**
     * Get a random ammo from items.json that is not in the ammo blacklist AND inside the price rage defined in scavcase.json config
     * @param rarity The rarity this ammo reward is for
     * @returns random ammo item from items.json
     */
    protected getRandomAmmo(rarity: string): ITemplateItem
    {
        const possibleAmmoPool = this.dbAmmoItemsCache.filter((ammo) =>
        {
            // Is ammo handbook price between desired range
            const handbookPrice = this.ragfairPriceService.getStaticPriceForItem(ammo._id);
            if (
                handbookPrice >= this.scavCaseConfig.ammoRewards.ammoRewardValueRangeRub[rarity].min
                && handbookPrice <= this.scavCaseConfig.ammoRewards.ammoRewardValueRangeRub[rarity].max
            )
            {
                return true;
            }

            return false;
        });

        if (possibleAmmoPool.length === 0)
        {
            this.logger.warning("Unable to get a list of ammo that matches desired criteria for scav case reward");
        }

        // Get a random ammo and return it
        return this.randomUtil.getArrayValue(possibleAmmoPool);
    }

    /**
     * Take all the rewards picked create the Product object array ready to return to calling code
     * Also add a stack count to ammo and money
     * @param rewardItems items to convert
     * @returns Product array
     */
    protected randomiseContainerItemRewards(rewardItems: ITemplateItem[], rarity: string): Item[][]
    {
        /** Each array is an item + children */
        const result: Item[][] = [];
        for (const rewardItemDb of rewardItems)
        {
            let resultItem: Item[] = [{ _id: this.hashUtil.generate(), _tpl: rewardItemDb._id, upd: undefined }];
            const rootItem = resultItem[0];

            if (this.itemHelper.isOfBaseclass(rewardItemDb._id, BaseClasses.AMMO_BOX))
            {
                this.itemHelper.addCartridgesToAmmoBox(resultItem, rewardItemDb);
            }
            // Armor or weapon = use default preset from globals.json
            else if (
                this.itemHelper.armorItemCanHoldMods(rewardItemDb._id)
                || this.itemHelper.isOfBaseclass(rewardItemDb._id, BaseClasses.WEAPON)
            )
            {
                const preset = this.presetHelper.getDefaultPreset(rewardItemDb._id);
                if (!preset)
                {
                    this.logger.warning(`No preset for item: ${rewardItemDb._id} ${rewardItemDb._name}, skipping`);

                    continue;
                }

                // Ensure preset has unique ids and is cloned so we don't alter the preset data stored in memory
                const presetAndMods: Item[] = this.itemHelper.replaceIDs(preset._items);
                this.itemHelper.remapRootItemId(presetAndMods);

                resultItem = presetAndMods;
            }
            else if (this.itemHelper.isOfBaseclasses(rewardItemDb._id, [BaseClasses.AMMO, BaseClasses.MONEY]))
            {
                rootItem.upd = { StackObjectsCount: this.getRandomAmountRewardForScavCase(rewardItemDb, rarity) };
            }

            // Clean up upd object if it wasn't used
            if (!rootItem.upd)
            {
                delete rootItem.upd;
            }

            result.push(resultItem);
        }

        return result;
    }

    /**
     * @param dbItems all items from the items.json
     * @param itemFilters controls how the dbItems will be filtered and returned (handbook price)
     * @returns filtered dbItems array
     */
    protected getFilteredItemsByPrice(
        dbItems: ITemplateItem[],
        itemFilters: RewardCountAndPriceDetails,
    ): ITemplateItem[]
    {
        return dbItems.filter((item) =>
        {
            const handbookPrice = this.ragfairPriceService.getStaticPriceForItem(item._id);
            if (handbookPrice >= itemFilters.minPriceRub && handbookPrice <= itemFilters.maxPriceRub)
            {
                return true;
            }
        });
    }

    /**
     * Gathers the reward min and max count params for each reward quality level from config and scavcase.json into a single object
     * @param scavCaseDetails scavcase.json values
     * @returns ScavCaseRewardCountsAndPrices object
     */
    protected getScavCaseRewardCountsAndPrices(scavCaseDetails: IHideoutScavCase): ScavCaseRewardCountsAndPrices
    {
        const rewardTypes = Object.keys(scavCaseDetails.EndProducts) as Array<keyof ScavCaseRewardCountsAndPrices>; // Default is ["Common", "Rare", "Superrare"];
        const result: Partial<ScavCaseRewardCountsAndPrices> = {}; // Make partial object as we're going to add all the data immediately after

        // Create reward min/max counts for each type
        for (const rewardType of rewardTypes)
        {
            result[rewardType] = {
                minCount: scavCaseDetails.EndProducts[rewardType].min,
                maxCount: scavCaseDetails.EndProducts[rewardType].max,
                minPriceRub: this.scavCaseConfig.rewardItemValueRangeRub[rewardType.toLowerCase()].min,
                maxPriceRub: this.scavCaseConfig.rewardItemValueRangeRub[rewardType.toLowerCase()].max,
            };
        }

        return result as ScavCaseRewardCountsAndPrices;
    }

    /**
     * Randomises the size of ammo and money stacks
     * @param itemToCalculate ammo or money item
     * @param rarity rarity (common/rare/superrare)
     * @returns value to set stack count to
     */
    protected getRandomAmountRewardForScavCase(itemToCalculate: ITemplateItem, rarity: string): number
    {
        let amountToGive = 1;
        if (itemToCalculate._parent === BaseClasses.AMMO)
        {
            amountToGive = this.randomUtil.getInt(
                this.scavCaseConfig.ammoRewards.minStackSize,
                itemToCalculate._props.StackMaxSize,
            );
        }
        else if (itemToCalculate._parent === BaseClasses.MONEY)
        {
            switch (itemToCalculate._id)
            {
                case Money.ROUBLES:
                    amountToGive = this.randomUtil.getInt(
                        this.scavCaseConfig.moneyRewards.rubCount[rarity].min,
                        this.scavCaseConfig.moneyRewards.rubCount[rarity].max,
                    );
                    break;
                case Money.EUROS:
                    amountToGive = this.randomUtil.getInt(
                        this.scavCaseConfig.moneyRewards.eurCount[rarity].min,
                        this.scavCaseConfig.moneyRewards.eurCount[rarity].max,
                    );
                    break;
                case Money.DOLLARS:
                    amountToGive = this.randomUtil.getInt(
                        this.scavCaseConfig.moneyRewards.usdCount[rarity].min,
                        this.scavCaseConfig.moneyRewards.usdCount[rarity].max,
                    );
                    break;
            }
        }
        return amountToGive;
    }
}
