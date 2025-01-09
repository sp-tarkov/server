import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { IScavRecipe } from "@spt/models/eft/hideout/IHideoutProduction";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Money } from "@spt/models/enums/Money";
import { IScavCaseConfig } from "@spt/models/spt/config/IScavCaseConfig";
import {
    IRewardCountAndPriceDetails,
    IScavCaseRewardCountsAndPrices,
} from "@spt/models/spt/hideout/ScavCaseRewardCountsAndPrices";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

/**
 * Handle the creation of randomised scav case rewards
 */
@injectable()
export class ScavCaseRewardGenerator {
    protected scavCaseConfig: IScavCaseConfig;
    protected dbItemsCache: ITemplateItem[];
    protected dbAmmoItemsCache: ITemplateItem[];

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.scavCaseConfig = this.configServer.getConfig(ConfigTypes.SCAVCASE);
    }

    /**
     * Create an array of rewards that will be given to the player upon completing their scav case build
     * @param recipeId recipe of the scav case craft
     * @returns Product array
     */
    public generate(recipeId: string): IItem[][] {
        this.cacheDbItems();

        // Get scavcase details from hideout/scavcase.json
        const scavCaseDetails = this.databaseService
            .getHideout()
            .production.scavRecipes.find((r) => r._id === recipeId);
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
    protected cacheDbItems(): void {
        // TODO: pre-loop and get array of valid items, e.g. non-node/non-blacklisted, then loop over those results for below code

        // Get an array of seasonal items that should not be shown right now as seasonal event is not active
        const inactiveSeasonalItems = this.seasonalEventService.getInactiveSeasonalEventItems();
        if (!this.dbItemsCache) {
            this.dbItemsCache = Object.values(this.databaseService.getItems()).filter((item) => {
                // Base "Item" item has no parent, ignore it
                if (item._parent === "") {
                    return false;
                }

                if (item._type === "Node") {
                    return false;
                }

                if (item._props.QuestItem) {
                    return false;
                }

                // Skip item if item id is on blacklist
                if (
                    item._type !== "Item" ||
                    this.scavCaseConfig.rewardItemBlacklist.includes(item._id) ||
                    this.itemFilterService.isItemBlacklisted(item._id)
                ) {
                    return false;
                }

                // Globally reward-blacklisted
                if (this.itemFilterService.isItemRewardBlacklisted(item._id)) {
                    return false;
                }

                if (!this.scavCaseConfig.allowBossItemsAsRewards && this.itemFilterService.isBossItem(item._id)) {
                    return false;
                }

                // Skip item if parent id is blacklisted
                if (this.itemHelper.isOfBaseclasses(item._id, this.scavCaseConfig.rewardItemParentBlacklist)) {
                    return false;
                }

                if (inactiveSeasonalItems.includes(item._id)) {
                    return false;
                }

                return true;
            });
        }

        if (!this.dbAmmoItemsCache) {
            this.dbAmmoItemsCache = Object.values(this.databaseService.getItems()).filter((item) => {
                // Base "Item" item has no parent, ignore it
                if (item._parent === "") {
                    return false;
                }

                if (item._type !== "Item") {
                    return false;
                }

                // Not ammo, skip
                if (!this.itemHelper.isOfBaseclass(item._id, BaseClasses.AMMO)) {
                    return false;
                }

                // Skip item if item id is on blacklist
                if (
                    this.scavCaseConfig.rewardItemBlacklist.includes(item._id) ||
                    this.itemFilterService.isItemBlacklisted(item._id)
                ) {
                    return false;
                }

                // Globally reward-blacklisted
                if (this.itemFilterService.isItemRewardBlacklisted(item._id)) {
                    return false;
                }

                if (!this.scavCaseConfig.allowBossItemsAsRewards && this.itemFilterService.isBossItem(item._id)) {
                    return false;
                }

                // Skip seasonal items
                if (inactiveSeasonalItems.includes(item._id)) {
                    return false;
                }

                // Skip ammo that doesn't stack as high as value in config
                if (item._props.StackMaxSize < this.scavCaseConfig.ammoRewards.minStackSize) {
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
        itemFilters: IRewardCountAndPriceDetails,
        rarity: string,
    ): ITemplateItem[] {
        const result: ITemplateItem[] = [];

        let rewardWasMoney = false;
        let rewardWasAmmo = false;
        const randomCount = this.randomUtil.getInt(itemFilters.minCount, itemFilters.maxCount);
        for (let i = 0; i < randomCount; i++) {
            if (this.rewardShouldBeMoney() && !rewardWasMoney) {
                // Only allow one reward to be money
                result.push(this.getRandomMoney());
                if (!this.scavCaseConfig.allowMultipleMoneyRewardsPerRarity) {
                    rewardWasMoney = true;
                }
            } else if (this.rewardShouldBeAmmo() && !rewardWasAmmo) {
                // Only allow one reward to be ammo
                result.push(this.getRandomAmmo(rarity));
                if (!this.scavCaseConfig.allowMultipleAmmoRewardsPerRarity) {
                    rewardWasAmmo = true;
                }
            } else {
                result.push(this.randomUtil.getArrayValue(items));
            }
        }

        return result;
    }

    /**
     * Choose if money should be a reward based on the moneyRewardChancePercent config chance in scavCaseConfig
     * @returns true if reward should be money
     */
    protected rewardShouldBeMoney(): boolean {
        return this.randomUtil.getChance100(this.scavCaseConfig.moneyRewards.moneyRewardChancePercent);
    }

    /**
     * Choose if ammo should be a reward based on the ammoRewardChancePercent config chance in scavCaseConfig
     * @returns true if reward should be ammo
     */
    protected rewardShouldBeAmmo(): boolean {
        return this.randomUtil.getChance100(this.scavCaseConfig.ammoRewards.ammoRewardChancePercent);
    }

    /**
     * Choose from rouble/dollar/euro at random
     */
    protected getRandomMoney(): ITemplateItem {
        const money: ITemplateItem[] = [];
        const items = this.databaseService.getItems();
        money.push(items[Money.ROUBLES]);
        money.push(items[Money.EUROS]);
        money.push(items[Money.DOLLARS]);
        money.push(items[Money.GP]);

        return this.randomUtil.getArrayValue(money);
    }

    /**
     * Get a random ammo from items.json that is not in the ammo blacklist AND inside the price rage defined in scavcase.json config
     * @param rarity The rarity this ammo reward is for
     * @returns random ammo item from items.json
     */
    protected getRandomAmmo(rarity: string): ITemplateItem {
        const possibleAmmoPool = this.dbAmmoItemsCache.filter((ammo) => {
            // Is ammo handbook price between desired range
            const handbookPrice = this.ragfairPriceService.getStaticPriceForItem(ammo._id);
            if (
                handbookPrice >= this.scavCaseConfig.ammoRewards.ammoRewardValueRangeRub[rarity].min &&
                handbookPrice <= this.scavCaseConfig.ammoRewards.ammoRewardValueRangeRub[rarity].max
            ) {
                return true;
            }

            return false;
        });

        if (possibleAmmoPool.length === 0) {
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
    protected randomiseContainerItemRewards(rewardItems: ITemplateItem[], rarity: string): IItem[][] {
        /** Each array is an item + children */
        const result: IItem[][] = [];
        for (const rewardItemDb of rewardItems) {
            let resultItem: IItem[] = [{ _id: this.hashUtil.generate(), _tpl: rewardItemDb._id, upd: undefined }];
            const rootItem = resultItem[0];

            if (this.itemHelper.isOfBaseclass(rewardItemDb._id, BaseClasses.AMMO_BOX)) {
                this.itemHelper.addCartridgesToAmmoBox(resultItem, rewardItemDb);
            }
            // Armor or weapon = use default preset from globals.json
            else if (
                this.itemHelper.armorItemHasRemovableOrSoftInsertSlots(rewardItemDb._id) ||
                this.itemHelper.isOfBaseclass(rewardItemDb._id, BaseClasses.WEAPON)
            ) {
                const preset = this.presetHelper.getDefaultPreset(rewardItemDb._id);
                if (!preset) {
                    this.logger.warning(`No preset for item: ${rewardItemDb._id} ${rewardItemDb._name}, skipping`);

                    continue;
                }

                // Ensure preset has unique ids and is cloned so we don't alter the preset data stored in memory
                const presetAndMods: IItem[] = this.itemHelper.replaceIDs(preset._items);
                this.itemHelper.remapRootItemId(presetAndMods);

                resultItem = presetAndMods;
            } else if (this.itemHelper.isOfBaseclasses(rewardItemDb._id, [BaseClasses.AMMO, BaseClasses.MONEY])) {
                rootItem.upd = { StackObjectsCount: this.getRandomAmountRewardForScavCase(rewardItemDb, rarity) };
            }

            // Clean up upd object if it wasn't used
            if (!rootItem.upd) {
                // biome-ignore lint/performance/noDelete: Delete is fine here, we're cleaning up this object without leaving an undefined.
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
        itemFilters: IRewardCountAndPriceDetails,
    ): ITemplateItem[] {
        return dbItems.filter((item) => {
            const handbookPrice = this.ragfairPriceService.getStaticPriceForItem(item._id);
            if (handbookPrice >= itemFilters.minPriceRub && handbookPrice <= itemFilters.maxPriceRub) {
                return true;
            }
        });
    }

    /**
     * Gathers the reward min and max count params for each reward quality level from config and scavcase.json into a single object
     * @param scavCaseDetails production.json/scavRecipes object
     * @returns ScavCaseRewardCountsAndPrices object
     */
    protected getScavCaseRewardCountsAndPrices(scavCaseDetails: IScavRecipe): IScavCaseRewardCountsAndPrices {
        const rewardTypes = Object.keys(scavCaseDetails.endProducts) as Array<keyof IScavCaseRewardCountsAndPrices>; // Default is ["Common", "Rare", "Superrare"];
        const result: Partial<IScavCaseRewardCountsAndPrices> = {}; // Make partial object as we're going to add all the data immediately after

        // Create reward min/max counts for each type
        for (const rewardType of rewardTypes) {
            result[rewardType] = {
                minCount: scavCaseDetails.endProducts[rewardType].min,
                maxCount: scavCaseDetails.endProducts[rewardType].max,
                minPriceRub: this.scavCaseConfig.rewardItemValueRangeRub[rewardType.toLowerCase()].min,
                maxPriceRub: this.scavCaseConfig.rewardItemValueRangeRub[rewardType.toLowerCase()].max,
            };
        }

        return result as IScavCaseRewardCountsAndPrices;
    }

    /**
     * Randomises the size of ammo and money stacks
     * @param itemToCalculate ammo or money item
     * @param rarity rarity (common/rare/superrare)
     * @returns value to set stack count to
     */
    protected getRandomAmountRewardForScavCase(itemToCalculate: ITemplateItem, rarity: string): number {
        let amountToGive = 1;
        if (itemToCalculate._parent === BaseClasses.AMMO) {
            amountToGive = this.randomUtil.getInt(
                this.scavCaseConfig.ammoRewards.minStackSize,
                itemToCalculate._props.StackMaxSize,
            );
        } else if (itemToCalculate._parent === BaseClasses.MONEY) {
            switch (itemToCalculate._id) {
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
                case Money.GP:
                    amountToGive = this.randomUtil.getInt(
                        this.scavCaseConfig.moneyRewards.gpCount[rarity].min,
                        this.scavCaseConfig.moneyRewards.gpCount[rarity].max,
                    );
            }
        }
        return amountToGive;
    }
}
