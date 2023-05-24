import { inject, injectable } from "tsyringe";

import { ItemHelper } from "../helpers/ItemHelper";
import { Product } from "../models/eft/common/tables/IBotBase";
import { ITemplateItem } from "../models/eft/common/tables/ITemplateItem";
import { IHideoutScavCase } from "../models/eft/hideout/IHideoutScavCase";
import { BaseClasses } from "../models/enums/BaseClasses";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Money } from "../models/enums/Money";
import { IScavCaseConfig } from "../models/spt/config/IScavCaseConfig";
import {
    RewardCountAndPriceDetails, ScavCaseRewardCountsAndPrices
} from "../models/spt/hideout/ScavCaseRewardCountsAndPrices";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { ItemFilterService } from "../services/ItemFilterService";
import { RagfairPriceService } from "../services/RagfairPriceService";
import { HashUtil } from "../utils/HashUtil";
import { RandomUtil } from "../utils/RandomUtil";

/** 
 * Handle the creation of randomised scav case rewards
 */
@injectable()
export class ScavCaseRewardGenerator
{
    protected scavCaseConfig: IScavCaseConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.scavCaseConfig = this.configServer.getConfig(ConfigTypes.SCAVCASE);
    }
    
    /**
     * Create an array of rewards that will be given to the player upon completing their scav case build
     * @param recipeId recipe of the scav case craft
     * @returns Product array
     */
    public generate(recipeId: string): Product[]
    {
        // Get scavcase details from hideout/scavcase.json
        const scavCaseDetails = this.databaseServer.getTables().hideout.scavcase.find(r => r._id === recipeId);
        const rewardItemCounts = this.getScavCaseRewardCountsAndPrices(scavCaseDetails);

        const dbItems = this.getDbItems();

        // Get items that fit the price criteria as set by the scavCase config
        const commonPricedItems = this.getFilteredItemsByPrice(dbItems, rewardItemCounts.Common);
        const rarePricedItems = this.getFilteredItemsByPrice(dbItems, rewardItemCounts.Rare);
        const superRarePricedItems = this.getFilteredItemsByPrice(dbItems, rewardItemCounts.Superrare);

        // Get randomly picked items from each item collction, the count range of which is defined in hideout/scavcase.json
        const randomlyPickedCommonRewards = this.pickRandomRewards(commonPricedItems, rewardItemCounts.Common, "common");
        const randomlyPickedRareRewards = this.pickRandomRewards(rarePricedItems, rewardItemCounts.Rare, "rare");
        const randomlyPickedSuperRareRewards = this.pickRandomRewards(superRarePricedItems, rewardItemCounts.Superrare, "superrare");

        // Add randomised stack sizes to ammo and money rewards
        const commonRewards = this.randomiseContainerItemRewards(randomlyPickedCommonRewards, "common");
        const rareRewards = this.randomiseContainerItemRewards(randomlyPickedRareRewards, "rare");
        const superRareRewards = this.randomiseContainerItemRewards(randomlyPickedSuperRareRewards, "superrare");

        return [...commonRewards, ...rareRewards, ...superRareRewards];
    }

    /**
     * Get all db items that are not blacklisted in scavcase config
     * @returns filtered array of db items
     */
    protected getDbItems(): ITemplateItem[]
    {
        return Object.entries(this.databaseServer.getTables().templates.items).filter((item) =>
        {
            // Skip item if item id is on blacklist
            if ((item[1]._type !== "Item")
                || this.scavCaseConfig.rewardItemBlacklist.includes(item[1]._id)
                || this.itemFilterService.isItemBlacklisted(item[1]._id))
            {
                return false;
            }

            // Skip item if parent id is blacklisted
            if (this.itemHelper.isOfBaseclasses(item[1]._id, this.scavCaseConfig.rewardItemParentBlacklist))
            {
                return false;
            }

            return true;
        }).map(x => x[1]);
    }

    /**
     * Pick a number of items to be rewards, the count is defined by the values in 
     * @param items item pool to pick rewards from
     * @param itemFilters how the rewards should be filtered down (by item count)
     * @returns 
     */
    protected pickRandomRewards(items: ITemplateItem[], itemFilters: RewardCountAndPriceDetails, rarity: string): ITemplateItem[]
    {
        const result: ITemplateItem[] = [];

        const randomCount = this.randomUtil.getInt(itemFilters.minCount, itemFilters.maxCount);
        for (let i = 0; i < randomCount; i++)
        {
            if (this.rewardShouldBeMoney())
            {
                result.push(this.getRandomMoney());
            }
            else if (this.rewardShouldBeAmmo())
            {
                result.push(this.getRandomAmmo(rarity));
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
        money.push(this.databaseServer.getTables().templates.items["5449016a4bdc2d6f028b456f"]); //rub
        money.push(this.databaseServer.getTables().templates.items["569668774bdc2da2298b4568"]); //euro
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
        // Get ammo from items.json not in the blacklist
        const ammoItems = Object.entries(this.databaseServer.getTables().templates.items).filter((item) =>
        {
            // Not ammo, skip
            if (!this.itemHelper.isOfBaseclass(item[1]._id, BaseClasses.AMMO))
            {
                return false;
            }

            // Fail if on blacklist
            if (this.scavCaseConfig.ammoRewards.ammoRewardBlacklist[rarity].includes(item[1]._id))
            {
                return false;
            }

            // Skip ammo that doesn't stack as high as value in config
            if (item[1]._props.StackMaxSize < this.scavCaseConfig.ammoRewards.minStackSize)
            {
                return false;
            }

            // Is ammo handbook price between desired range
            const handbookPrice = this.ragfairPriceService.getStaticPriceForItem(item[1]._id);
            if (handbookPrice >= this.scavCaseConfig.ammoRewards.ammoRewardValueRangeRub[rarity].min 
                && handbookPrice <= this.scavCaseConfig.ammoRewards.ammoRewardValueRangeRub[rarity].max)
            {
                return true;
            }

            return false;
        }).map(x => x[1]);

        // Get a random ammo and return it
        return this.randomUtil.getArrayValue(ammoItems);
    }

    /**
     * Take all the rewards picked create the Product object array ready to return to calling code
     * Also add a stack count to ammo and money
     * @param rewardItems items to convert
     * @returns Product array
     */
    protected randomiseContainerItemRewards(rewardItems: ITemplateItem[], rarity: string): Product[]
    {
        const result: Product[] = [];
        for (const item of rewardItems)
        {
            const resultItem = {
                _id: this.hashUtil.generate(),
                _tpl: item._id,
                upd: undefined
            };

            this.addStackCountToAmmoAndMoney(item, resultItem, rarity);

            // Clean up upd object if it wasn't used
            if (!resultItem.upd)
            {
                delete resultItem.upd;
            }

            result.push(resultItem);
        }

        return result;
    }

    /**
     * Add a randomised stack count to ammo or money items
     * @param item money or ammo item
     * @param resultItem money or ammo item with a randomise stack size
     */
    protected addStackCountToAmmoAndMoney(item: ITemplateItem, resultItem: { _id: string; _tpl: string; upd: any; }, rarity: string): void
    {
        if (item._parent === BaseClasses.AMMO || item._parent === BaseClasses.MONEY)
        {
            resultItem.upd = {
                StackObjectsCount: this.getRandomAmountRewardForScavCase(item, rarity)
            };
        }
    }
    
    /**
     * 
     * @param dbItems all items from the items.json
     * @param itemFilters controls how the dbItems will be filtered and returned (handbook price)
     * @returns filtered dbItems array
     */
    protected getFilteredItemsByPrice(dbItems: ITemplateItem[], itemFilters: RewardCountAndPriceDetails): ITemplateItem[]
    {
        return dbItems.filter((item) =>
        {
            const handbookPrice = this.ragfairPriceService.getStaticPriceForItem(item._id);
            if (handbookPrice >= itemFilters.minPriceRub
                && handbookPrice <= itemFilters.maxPriceRub)
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
            result[rewardType] =
            {
                minCount: scavCaseDetails.EndProducts[rewardType].min,
                maxCount: scavCaseDetails.EndProducts[rewardType].max,
                minPriceRub: this.scavCaseConfig.rewardItemValueRangeRub[rewardType.toLowerCase()].min,
                maxPriceRub: this.scavCaseConfig.rewardItemValueRangeRub[rewardType.toLowerCase()].max
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
            amountToGive = this.randomUtil.getInt(this.scavCaseConfig.ammoRewards.minStackSize, itemToCalculate._props.StackMaxSize);
        }
        else if (itemToCalculate._parent === BaseClasses.MONEY)
        {
            switch (itemToCalculate._id)
            {
                case Money.ROUBLES:
                    amountToGive = this.randomUtil.getInt(this.scavCaseConfig.moneyRewards.rubCount[rarity].min, this.scavCaseConfig.moneyRewards.rubCount[rarity].max);
                    break;
                case Money.EUROS:
                    amountToGive = this.randomUtil.getInt(this.scavCaseConfig.moneyRewards.eurCount[rarity].min, this.scavCaseConfig.moneyRewards.eurCount[rarity].max);
                    break;
                case Money.DOLLARS:
                    amountToGive = this.randomUtil.getInt(this.scavCaseConfig.moneyRewards.usdCount[rarity].min, this.scavCaseConfig.moneyRewards.usdCount[rarity].max);
                    break;
            }
        }
        return amountToGive;
    }
}