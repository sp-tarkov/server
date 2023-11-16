import { inject, injectable } from "tsyringe";

import { RagfairAssortGenerator } from "@spt-aki/generators/RagfairAssortGenerator";
import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { RagfairServerHelper } from "@spt-aki/helpers/RagfairServerHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt-aki/models/eft/common/tables/ITemplateItem";
import { IBarterScheme } from "@spt-aki/models/eft/common/tables/ITrader";
import { IRagfairOffer, OfferRequirement } from "@spt-aki/models/eft/ragfair/IRagfairOffer";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { MemberCategory } from "@spt-aki/models/enums/MemberCategory";
import { Money } from "@spt-aki/models/enums/Money";
import { Dynamic, IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { FenceService } from "@spt-aki/services/FenceService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { RagfairCategoriesService } from "@spt-aki/services/RagfairCategoriesService";
import { RagfairOfferService } from "@spt-aki/services/RagfairOfferService";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class RagfairOfferGenerator
{
    protected ragfairConfig: IRagfairConfig;
    protected allowedFleaPriceItemsForBarter: { tpl: string; price: number; }[];

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("RagfairAssortGenerator") protected ragfairAssortGenerator: RagfairAssortGenerator,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("RagfairCategoriesService") protected ragfairCategoriesService: RagfairCategoriesService,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Create a flea offer and store it in the Ragfair server offers array
     * @param userID Owner of the offer
     * @param time Time offer is listed at
     * @param items Items in the offer
     * @param barterScheme Cost of item (currency or barter)
     * @param loyalLevel Loyalty level needed to buy item
     * @param sellInOnePiece Flags sellInOnePiece to be true
     * @returns IRagfairOffer
     */
    public createFleaOffer(
        userID: string,
        time: number,
        items: Item[],
        barterScheme: IBarterScheme[],
        loyalLevel: number,
        sellInOnePiece = false,
    ): IRagfairOffer
    {
        const offer = this.createOffer(userID, time, items, barterScheme, loyalLevel, sellInOnePiece);
        this.ragfairOfferService.addOffer(offer);

        return offer;
    }

    /**
     * Create an offer object ready to send to ragfairOfferService.addOffer()
     * @param userID Owner of the offer
     * @param time Time offer is listed at
     * @param items Items in the offer
     * @param barterScheme Cost of item (currency or barter)
     * @param loyalLevel Loyalty level needed to buy item
     * @param sellInOnePiece Set StackObjectsCount to 1
     * @returns IRagfairOffer
     */
    protected createOffer(
        userID: string,
        time: number,
        items: Item[],
        barterScheme: IBarterScheme[],
        loyalLevel: number,
        sellInOnePiece = false,
    ): IRagfairOffer
    {
        const isTrader = this.ragfairServerHelper.isTrader(userID);

        const offerRequirements: OfferRequirement[] = [];
        for (const barter of barterScheme)
        {
            const requirement: OfferRequirement = {
                _tpl: barter._tpl,
                count: +barter.count.toFixed(2),
                onlyFunctional: barter.onlyFunctional ?? false,
            };

            offerRequirements.push(requirement);
        }

        const itemCount = items.filter((x) => x.slotId === "hideout").length;
        const roublePrice = Math.round(this.convertOfferRequirementsIntoRoubles(offerRequirements));

        const offer: IRagfairOffer = {
            _id: this.hashUtil.generate(),
            intId: 0,
            user: {
                id: this.getTraderId(userID),
                memberType: (userID === "ragfair")
                    ? MemberCategory.DEFAULT
                    : this.ragfairServerHelper.getMemberType(userID),
                nickname: this.ragfairServerHelper.getNickname(userID),
                rating: this.getRating(userID),
                isRatingGrowing: this.getRatingGrowing(userID),
                avatar: this.getAvatarUrl(isTrader, userID),
            },
            root: items[0]._id,
            items: this.jsonUtil.clone(items),
            requirements: offerRequirements,
            requirementsCost: roublePrice,
            itemsCost: Math.round(this.handbookHelper.getTemplatePrice(items[0]._tpl)), // Handbook price
            summaryCost: roublePrice,
            startTime: time,
            endTime: this.getOfferEndTime(userID, time),
            loyaltyLevel: loyalLevel,
            sellInOnePiece: sellInOnePiece,
            priority: false,
            locked: false,
            unlimitedCount: false,
            notAvailable: false,
            CurrentItemCount: itemCount,
        };

        return offer;
    }

    /**
     * Calculate the offer price that's listed on the flea listing
     * @param offerRequirements barter requirements for offer
     * @returns rouble cost of offer
     */
    protected convertOfferRequirementsIntoRoubles(offerRequirements: OfferRequirement[]): number
    {
        let roublePrice = 0;
        for (const requirement of offerRequirements)
        {
            roublePrice += this.paymentHelper.isMoneyTpl(requirement._tpl)
                ? Math.round(this.calculateRoublePrice(requirement.count, requirement._tpl))
                : this.ragfairPriceService.getFleaPriceForItem(requirement._tpl) * requirement.count; // get flea price for barter offer items
        }

        return roublePrice;
    }

    /**
     * Get avatar url from trader table in db
     * @param isTrader Is user we're getting avatar for a trader
     * @param userId persons id to get avatar of
     * @returns url of avatar
     */
    protected getAvatarUrl(isTrader: boolean, userId: string): string
    {
        if (isTrader)
        {
            return this.databaseServer.getTables().traders[userId].base.avatar;
        }

        return "/files/trader/avatar/unknown.jpg";
    }

    /**
     * Convert a count of currency into roubles
     * @param currencyCount amount of currency to convert into roubles
     * @param currencyType Type of currency (euro/dollar/rouble)
     * @returns count of roubles
     */
    protected calculateRoublePrice(currencyCount: number, currencyType: string): number
    {
        if (currencyType === Money.ROUBLES)
        {
            return currencyCount;
        }
        else
        {
            return this.handbookHelper.inRUB(currencyCount, currencyType);
        }
    }

    /**
     * Check userId, if its a player, return their pmc _id, otherwise return userId parameter
     * @param userId Users Id to check
     * @returns Users Id
     */
    protected getTraderId(userId: string): string
    {
        if (this.ragfairServerHelper.isPlayer(userId))
        {
            return this.saveServer.getProfile(userId).characters.pmc._id;
        }

        return userId;
    }

    /**
     * Get a flea trading rating for the passed in user
     * @param userId User to get flea rating of
     * @returns Flea rating value
     */
    protected getRating(userId: string): number
    {
        if (this.ragfairServerHelper.isPlayer(userId))
        {
            // Player offer
            return this.saveServer.getProfile(userId).characters.pmc.RagfairInfo.rating;
        }

        if (this.ragfairServerHelper.isTrader(userId))
        {
            // Trader offer
            return 1;
        }

        // Generated pmc offer
        return this.randomUtil.getFloat(this.ragfairConfig.dynamic.rating.min, this.ragfairConfig.dynamic.rating.max);
    }

    /**
     * Is the offers user rating growing
     * @param userID user to check rating of
     * @returns true if its growing
     */
    protected getRatingGrowing(userID: string): boolean
    {
        if (this.ragfairServerHelper.isPlayer(userID))
        {
            // player offer
            return this.saveServer.getProfile(userID).characters.pmc.RagfairInfo.isRatingGrowing;
        }

        if (this.ragfairServerHelper.isTrader(userID))
        {
            // trader offer
            return true;
        }

        // generated offer
        // 50/50 growing/falling
        return this.randomUtil.getBool();
    }

    /**
     * Get number of section until offer should expire
     * @param userID Id of the offer owner
     * @param time Time the offer is posted
     * @returns number of seconds until offer expires
     */
    protected getOfferEndTime(userID: string, time: number): number
    {
        if (this.ragfairServerHelper.isPlayer(userID))
        {
            // Player offer
            return this.timeUtil.getTimestamp() + Math.round(12 * TimeUtil.oneHourAsSeconds);
        }

        if (this.ragfairServerHelper.isTrader(userID))
        {
            // Trader offer
            return this.databaseServer.getTables().traders[userID].base.nextResupply;
        }

        // Generated fake-player offer
        return Math.round(
            time
                + this.randomUtil.getInt(
                    this.ragfairConfig.dynamic.endTimeSeconds.min,
                    this.ragfairConfig.dynamic.endTimeSeconds.max,
                ),
        );
    }

    /**
     * Create multiple offers for items by using a unique list of items we've generated previously
     * @param expiredOffers optional, expired offers to regenerate
     */
    public async generateDynamicOffers(expiredOffers: Item[] = null): Promise<void>
    {
        const config = this.ragfairConfig.dynamic;

        // get assort items from param if they exist, otherwise grab freshly generated assorts
        const assortItemsToProcess: Item[] = expiredOffers
            ? expiredOffers
            : this.ragfairAssortGenerator.getAssortItems();

        // Store all functions to create an offer for every item and pass into Promise.all to run async
        const assorOffersForItemsProcesses = [];
        for (const assortItemIndex in assortItemsToProcess)
        {
            assorOffersForItemsProcesses.push(
                this.createOffersForItems(assortItemIndex, assortItemsToProcess, expiredOffers, config),
            );
        }

        await Promise.all(assorOffersForItemsProcesses);
    }

    /**
     * @param assortItemIndex Index of assort item
     * @param assortItemsToProcess Item array containing index
     * @param expiredOffers Currently expired offers on flea
     * @param config Ragfair dynamic config
     */
    protected async createOffersForItems(
        assortItemIndex: string,
        assortItemsToProcess: Item[],
        expiredOffers: Item[],
        config: Dynamic,
    ): Promise<void>
    {
        const assortItem = assortItemsToProcess[assortItemIndex];
        const itemDetails = this.itemHelper.getItem(assortItem._tpl);

        const isPreset = this.presetHelper.isPreset(assortItem._id);

        // Only perform checks on newly generated items, skip expired items being refreshed
        if (!(expiredOffers || this.ragfairServerHelper.isItemValidRagfairItem(itemDetails)))
        {
            return;
        }

        // Get item + sub-items if preset, otherwise just get item
        const items: Item[] = isPreset
            ? this.ragfairServerHelper.getPresetItems(assortItem)
            : [
                ...[assortItem],
                ...this.itemHelper.findAndReturnChildrenByAssort(
                    assortItem._id,
                    this.ragfairAssortGenerator.getAssortItems(),
                ),
            ];

        // Get number of offers to create
        // Limit to 1 offer when processing expired
        const offerCount = expiredOffers
            ? 1
            : Math.round(this.randomUtil.getInt(config.offerItemCount.min, config.offerItemCount.max));

        // Store all functions to create offers for this item and pass into Promise.all to run async
        const assortSingleOfferProcesses = [];
        for (let index = 0; index < offerCount; index++)
        {
            assortSingleOfferProcesses.push(this.createSingleOfferForItem(items, isPreset, itemDetails));
        }

        await Promise.all(assortSingleOfferProcesses);
    }

    /**
     * Create one flea offer for a specific item
     * @param items Item to create offer for
     * @param isPreset Is item a weapon preset
     * @param itemDetails raw db item details
     * @returns Item array
     */
    protected async createSingleOfferForItem(
        items: Item[],
        isPreset: boolean,
        itemDetails: [boolean, ITemplateItem],
    ): Promise<void>
    {
        // Set stack size to random value
        items[0].upd.StackObjectsCount = this.ragfairServerHelper.calculateDynamicStackCount(items[0]._tpl, isPreset);

        const isBarterOffer = this.randomUtil.getChance100(this.ragfairConfig.dynamic.barter.chancePercent);
        const isPackOffer = this.randomUtil.getChance100(this.ragfairConfig.dynamic.pack.chancePercent)
            && !isBarterOffer
            && items.length === 1
            && this.itemHelper.isOfBaseclasses(items[0]._tpl, this.ragfairConfig.dynamic.pack.itemTypeWhitelist);
        const randomUserId = this.hashUtil.generate();

        let barterScheme: IBarterScheme[];
        if (isPackOffer)
        {
            // Set pack size
            const stackSize = this.randomUtil.getInt(
                this.ragfairConfig.dynamic.pack.itemCountMin,
                this.ragfairConfig.dynamic.pack.itemCountMax,
            );
            items[0].upd.StackObjectsCount = stackSize;

            // Don't randomise pack items
            barterScheme = this.createCurrencyBarterScheme(items, isPackOffer, stackSize);
        }
        else if (isBarterOffer)
        {
            // Apply randomised properties
            items = this.randomiseItemUpdProperties(randomUserId, items, itemDetails[1]);
            barterScheme = this.createBarterBarterScheme(items);
        }
        else
        {
            // Apply randomised properties
            items = this.randomiseItemUpdProperties(randomUserId, items, itemDetails[1]);
            barterScheme = this.createCurrencyBarterScheme(items, isPackOffer);
        }

        const offer = this.createFleaOffer(
            randomUserId,
            this.timeUtil.getTimestamp(),
            items,
            barterScheme,
            1,
            isPreset || isPackOffer,
        ); // sellAsOnePiece

        this.ragfairCategoriesService.incrementCategory(offer);
    }

    /**
     * Generate trader offers on flea using the traders assort data
     * @param traderID Trader to generate offers for
     */
    public generateFleaOffersForTrader(traderID: string): void
    {
        // Ensure old offers don't exist
        this.ragfairOfferService.removeAllOffersByTrader(traderID);

        // Add trader offers
        const time = this.timeUtil.getTimestamp();
        const trader = this.databaseServer.getTables().traders[traderID];
        const assorts = trader.assort;

        // Trader assorts / assort items are missing
        if (!assorts?.items?.length)
        {
            this.logger.error(
                this.localisationService.getText(
                    "ragfair-no_trader_assorts_cant_generate_flea_offers",
                    trader.base.nickname,
                ),
            );
            return;
        }

        for (const item of assorts.items)
        {
            // We only want to process 'base' items, no children
            if (item.slotId !== "hideout")
            {
                // skip mod items
                continue;
            }

            // Run blacklist check on trader offers
            if (this.ragfairConfig.dynamic.blacklist.traderItems)
            {
                const itemDetails = this.itemHelper.getItem(item._tpl);
                if (!itemDetails[0])
                {
                    this.logger.warning(this.localisationService.getText("ragfair-tpl_not_a_valid_item", item._tpl));
                    continue;
                }

                // Don't include items that BSG has blacklisted from flea
                if (this.ragfairConfig.dynamic.blacklist.enableBsgList && !itemDetails[1]._props.CanSellOnRagfair)
                {
                    continue;
                }
            }

            const isPreset = this.presetHelper.isPreset(item._id);
            const items: Item[] = isPreset
                ? this.ragfairServerHelper.getPresetItems(item)
                : [...[item], ...this.itemHelper.findAndReturnChildrenByAssort(item._id, assorts.items)];

            const barterScheme = assorts.barter_scheme[item._id];
            if (!barterScheme)
            {
                this.logger.warning(
                    this.localisationService.getText("ragfair-missing_barter_scheme", {
                        itemId: item._id,
                        tpl: item._tpl,
                        name: trader.base.nickname,
                    }),
                );
                continue;
            }

            const barterSchemeItems = assorts.barter_scheme[item._id][0];
            const loyalLevel = assorts.loyal_level_items[item._id];

            const offer = this.createFleaOffer(traderID, time, items, barterSchemeItems, loyalLevel, false);

            this.ragfairCategoriesService.incrementCategory(offer);

            // Refresh complete, reset flag to false
            trader.base.refreshTraderRagfairOffers = false;
        }
    }

    /**
     * Get array of an item with its mods + condition properties (e.g durability)
     * Apply randomisation adjustments to condition if item base is found in ragfair.json/dynamic/condition
     * @param userID id of owner of item
     * @param itemWithMods Item and mods, get condition of first item (only first array item is used)
     * @param itemDetails db details of first item
     * @returns
     */
    protected randomiseItemUpdProperties(userID: string, itemWithMods: Item[], itemDetails: ITemplateItem): Item[]
    {
        // Add any missing properties to first item in array
        itemWithMods[0] = this.addMissingConditions(itemWithMods[0]);

        if (!(this.ragfairServerHelper.isPlayer(userID) || this.ragfairServerHelper.isTrader(userID)))
        {
            const parentId = this.getDynamicConditionIdForTpl(itemDetails._id);
            if (!parentId)
            {
                // No condition details found, don't proceed with modifying item conditions
                return itemWithMods;
            }

            // Roll random chance to randomise item condition
            if (this.randomUtil.getChance100(this.ragfairConfig.dynamic.condition[parentId].conditionChance * 100))
            {
                this.randomiseItemCondition(parentId, itemWithMods[0], itemDetails);
            }
        }

        return itemWithMods;
    }

    /**
     * Get the relevant condition id if item tpl matches in ragfair.json/condition
     * @param tpl Item to look for matching condition object
     * @returns condition id
     */
    protected getDynamicConditionIdForTpl(tpl: string): string
    {
        // Get keys from condition config dictionary
        const configConditions = Object.keys(this.ragfairConfig.dynamic.condition);
        for (const baseClass of configConditions)
        {
            if (this.itemHelper.isOfBaseclass(tpl, baseClass))
            {
                return baseClass;
            }
        }

        return undefined;
    }

    /**
     * Alter an items condition based on its item base type
     * @param conditionSettingsId also the parentId of item being altered
     * @param item Item to adjust condition details of
     * @param itemDetails db item details of first item in array
     */
    protected randomiseItemCondition(conditionSettingsId: string, item: Item, itemDetails: ITemplateItem): void
    {
        const multiplier = this.randomUtil.getFloat(
            this.ragfairConfig.dynamic.condition[conditionSettingsId].min,
            this.ragfairConfig.dynamic.condition[conditionSettingsId].max,
        );

        // Armor or weapons
        if (item.upd.Repairable)
        {
            // Randomise non-0 class armor
            if (itemDetails._props.armorClass && <number>itemDetails._props.armorClass >= 1)
            {
                this.randomiseDurabilityValues(item, multiplier);
            }

            // Randomise Weapons
            if (this.itemHelper.isOfBaseclass(itemDetails._id, BaseClasses.WEAPON))
            {
                this.randomiseDurabilityValues(item, multiplier);
            }

            return;
        }

        if (item.upd.MedKit)
        {
            // randomize health
            item.upd.MedKit.HpResource = Math.round(item.upd.MedKit.HpResource * multiplier) || 1;

            return;
        }

        if (item.upd.Key && itemDetails._props.MaximumNumberOfUsage > 1)
        {
            // randomize key uses
            item.upd.Key.NumberOfUsages = Math.round(itemDetails._props.MaximumNumberOfUsage * (1 - multiplier)) || 0;

            return;
        }

        if (item.upd.FoodDrink)
        {
            // randomize food/drink value
            item.upd.FoodDrink.HpPercent = Math.round(itemDetails._props.MaxResource * multiplier) || 1;

            return;
        }

        if (item.upd.RepairKit)
        {
            // randomize repair kit (armor/weapon) uses
            item.upd.RepairKit.Resource = Math.round(itemDetails._props.MaxRepairResource * multiplier) || 1;

            return;
        }

        if (this.itemHelper.isOfBaseclass(itemDetails._id, BaseClasses.FUEL))
        {
            const totalCapacity = itemDetails._props.MaxResource;
            const remainingFuel = Math.round(totalCapacity * multiplier);
            item.upd.Resource = { UnitsConsumed: totalCapacity - remainingFuel, Value: remainingFuel };
        }
    }

    /**
     * Adjust an items durability/maxDurability value
     * @param item item (weapon/armor) to adjust
     * @param multiplier Value to multiple durability by
     */
    protected randomiseDurabilityValues(item: Item, multiplier: number): void
    {
        item.upd.Repairable.Durability = Math.round(item.upd.Repairable.Durability * multiplier) || 1;

        // randomize max durability, store to a temporary value so we can still compare the max durability
        let tempMaxDurability =
            Math.round(
                this.randomUtil.getFloat(item.upd.Repairable.Durability - 5, item.upd.Repairable.MaxDurability + 5),
            ) || item.upd.Repairable.Durability;

        // clamp values to max/current
        if (tempMaxDurability >= item.upd.Repairable.MaxDurability)
        {
            tempMaxDurability = item.upd.Repairable.MaxDurability;
        }
        if (tempMaxDurability < item.upd.Repairable.Durability)
        {
            tempMaxDurability = item.upd.Repairable.Durability;
        }

        // after clamping, finally assign to the item's properties
        item.upd.Repairable.MaxDurability = tempMaxDurability;
    }

    /**
     * Add missing conditions to an item if needed
     * Durabiltiy for repairable items
     * HpResource for medical items
     * @param item item to add conditions to
     * @returns Item with conditions added
     */
    protected addMissingConditions(item: Item): Item
    {
        const props = this.itemHelper.getItem(item._tpl)[1]._props;
        const isRepairable = "Durability" in props;
        const isMedkit = "MaxHpResource" in props;
        const isKey = "MaximumNumberOfUsage" in props;
        const isConsumable = props.MaxResource > 1 && "foodUseTime" in props;
        const isRepairKit = "MaxRepairResource" in props;

        if (isRepairable && props.Durability > 0)
        {
            item.upd.Repairable = { Durability: props.Durability, MaxDurability: props.Durability };
        }

        if (isMedkit && props.MaxHpResource > 0)
        {
            item.upd.MedKit = { HpResource: props.MaxHpResource };
        }

        if (isKey)
        {
            item.upd.Key = { NumberOfUsages: 0 };
        }

        if (isConsumable)
        {
            item.upd.FoodDrink = { HpPercent: props.MaxResource };
        }

        if (isRepairKit)
        {
            item.upd.RepairKit = { Resource: props.MaxRepairResource };
        }

        return item;
    }

    /**
     * Create a barter-based barter scheme, if not possible, fall back to making barter scheme currency based
     * @param offerItems Items for sale in offer
     * @returns Barter scheme
     */
    protected createBarterBarterScheme(offerItems: Item[]): IBarterScheme[]
    {
        // get flea price of item being sold
        const priceOfItemOffer = this.ragfairPriceService.getDynamicOfferPriceForOffer(
            offerItems,
            Money.ROUBLES,
            false,
        );

        // Dont make items under a designated rouble value into barter offers
        if (priceOfItemOffer < this.ragfairConfig.dynamic.barter.minRoubleCostToBecomeBarter)
        {
            return this.createCurrencyBarterScheme(offerItems, false);
        }

        // Get a randomised number of barter items to list offer for
        const barterItemCount = this.randomUtil.getInt(
            this.ragfairConfig.dynamic.barter.itemCountMin,
            this.ragfairConfig.dynamic.barter.itemCountMax,
        );

        // Get desired cost of individual item offer will be listed for e.g. offer = 15k, item count = 3, desired item cost = 5k
        const desiredItemCost = Math.round(priceOfItemOffer / barterItemCount);

        // amount to go above/below when looking for an item (Wiggle cost of item a little)
        const offerCostVariance = desiredItemCost * this.ragfairConfig.dynamic.barter.priceRangeVariancePercent / 100;

        const fleaPrices = this.getFleaPricesAsArray();

        // Filter possible barters to items that match the price range + not itself
        const filtered = fleaPrices.filter((x) =>
            x.price >= desiredItemCost - offerCostVariance && x.price <= desiredItemCost + offerCostVariance
            && x.tpl !== offerItems[0]._tpl
        );

        // No items on flea have a matching price, fall back to currency
        if (filtered.length === 0)
        {
            return this.createCurrencyBarterScheme(offerItems, false);
        }

        // Choose random item from price-filtered flea items
        const randomItem = this.randomUtil.getArrayValue(filtered);

        return [{ count: barterItemCount, _tpl: randomItem.tpl }];
    }

    /**
     * Get an array of flea prices + item tpl, cached in generator class inside `allowedFleaPriceItemsForBarter`
     * @returns array with tpl/price values
     */
    protected getFleaPricesAsArray(): { tpl: string; price: number; }[]
    {
        // Generate if needed
        if (!this.allowedFleaPriceItemsForBarter)
        {
            const fleaPrices = this.databaseServer.getTables().templates.prices;
            const fleaArray = Object.entries(fleaPrices).map(([tpl, price]) => ({ tpl: tpl, price: price }));

            // Only get item prices for items that also exist in items.json
            const filteredItems = fleaArray.filter((x) => this.itemHelper.getItem(x.tpl)[0]);

            this.allowedFleaPriceItemsForBarter = filteredItems.filter((x) =>
                !this.itemHelper.isOfBaseclasses(x.tpl, this.ragfairConfig.dynamic.barter.itemTypeBlacklist)
            );
        }

        return this.allowedFleaPriceItemsForBarter;
    }

    /**
     * Create a random currency-based barter scheme for an array of items
     * @param offerItems Items on offer
     * @param isPackOffer Is the barter scheme being created for a pack offer
     * @param multipler What to multiply the resulting price by
     * @returns Barter scheme for offer
     */
    protected createCurrencyBarterScheme(offerItems: Item[], isPackOffer: boolean, multipler = 1): IBarterScheme[]
    {
        const currency = this.ragfairServerHelper.getDynamicOfferCurrency();
        const price = this.ragfairPriceService.getDynamicOfferPriceForOffer(offerItems, currency, isPackOffer)
            * multipler;

        return [{ count: price, _tpl: currency }];
    }
}
