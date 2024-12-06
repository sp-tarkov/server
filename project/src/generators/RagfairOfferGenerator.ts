import { RagfairAssortGenerator } from "@spt/generators/RagfairAssortGenerator";
import { BotHelper } from "@spt/helpers/BotHelper";
import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PaymentHelper } from "@spt/helpers/PaymentHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { RagfairServerHelper } from "@spt/helpers/RagfairServerHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { IBarterScheme } from "@spt/models/eft/common/tables/ITrader";
import { IOfferRequirement, IRagfairOffer, IRagfairOfferUser } from "@spt/models/eft/ragfair/IRagfairOffer";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { Money } from "@spt/models/enums/Money";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import {
    Condition,
    IArmorPlateBlacklistSettings,
    IBarterDetails,
    IDynamic,
    IRagfairConfig,
} from "@spt/models/spt/config/IRagfairConfig";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { ITplWithFleaPrice } from "@spt/models/spt/ragfair/ITplWithFleaPrice";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { FenceService } from "@spt/services/FenceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RagfairOfferService } from "@spt/services/RagfairOfferService";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairOfferGenerator {
    protected ragfairConfig: IRagfairConfig;
    protected traderConfig: ITraderConfig;
    protected botConfig: IBotConfig;
    protected allowedFleaPriceItemsForBarter: { tpl: string; price: number }[];

    /** Internal counter to ensure each offer created has a unique value for its intId property */
    protected offerCounter = 0;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("RagfairAssortGenerator") protected ragfairAssortGenerator: RagfairAssortGenerator,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Create a flea offer and store it in the Ragfair server offers array
     * @param userID Owner of the offer
     * @param time Time offer is listed at
     * @param items Items in the offer
     * @param barterScheme Cost of item (currency or barter)
     * @param loyalLevel Loyalty level needed to buy item
     * @param sellInOnePiece Flags sellInOnePiece to be true
     * @returns Created flea offer
     */
    public createAndAddFleaOffer(
        userID: string,
        time: number,
        items: IItem[],
        barterScheme: IBarterScheme[],
        loyalLevel: number,
        sellInOnePiece = false,
    ): IRagfairOffer {
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
     * @param isPackOffer Is offer being created flaged as a pack
     * @returns IRagfairOffer
     */
    protected createOffer(
        userID: string,
        time: number,
        items: IItem[],
        barterScheme: IBarterScheme[],
        loyalLevel: number,
        isPackOffer = false,
    ): IRagfairOffer {
        const isTrader = this.ragfairServerHelper.isTrader(userID);

        const offerRequirements = barterScheme.map((barter) => {
            const offerRequirement: IOfferRequirement = {
                _tpl: barter._tpl,
                count: +barter.count.toFixed(2),
                onlyFunctional: barter.onlyFunctional ?? false,
            };

            // Dogtags define level and side
            if (barter.level !== undefined) {
                offerRequirement.level = barter.level;
                offerRequirement.side = barter.side;
            }

            return offerRequirement;
        });

        // Clone to avoid modifying original array
        const itemsClone = this.cloner.clone(items);
        const itemStackCount = itemsClone[0].upd?.StackObjectsCount ?? 1;

        // Hydrate ammo boxes with cartridges + ensure only 1 item is present (ammo box)
        // On offer refresh dont re-add cartridges to ammo box that already has cartridges
        if (this.itemHelper.isOfBaseclass(itemsClone[0]._tpl, BaseClasses.AMMO_BOX) && itemsClone.length === 1) {
            this.itemHelper.addCartridgesToAmmoBox(itemsClone, this.itemHelper.getItem(items[0]._tpl)[1]);
        }

        const roubleListingPrice = Math.round(this.convertOfferRequirementsIntoRoubles(offerRequirements));
        const singleItemListingPrice = isPackOffer ? roubleListingPrice / itemStackCount : roubleListingPrice;

        const offer: IRagfairOffer = {
            _id: this.hashUtil.generate(),
            intId: this.offerCounter,
            user: this.createUserDataForFleaOffer(userID, isTrader),
            root: items[0]._id,
            items: itemsClone,
            itemsCost: Math.round(this.handbookHelper.getTemplatePrice(items[0]._tpl)), // Handbook price
            requirements: offerRequirements,
            requirementsCost: Math.round(singleItemListingPrice),
            summaryCost: roubleListingPrice,
            startTime: time,
            endTime: this.getOfferEndTime(userID, time),
            loyaltyLevel: loyalLevel,
            sellInOnePiece: isPackOffer,
            locked: false,
        };

        this.offerCounter++;

        return offer;
    }

    /**
     * Create the user object stored inside each flea offer object
     * @param userID user creating the offer
     * @param isTrader Is the user creating the offer a trader
     * @returns IRagfairOfferUser
     */
    protected createUserDataForFleaOffer(userID: string, isTrader: boolean): IRagfairOfferUser {
        // Trader offer
        if (isTrader) {
            return {
                id: userID,
                memberType: MemberCategory.TRADER,
            };
        }

        const isPlayerOffer = this.profileHelper.isPlayer(userID);
        if (isPlayerOffer) {
            const playerProfile = this.profileHelper.getPmcProfile(userID);
            return {
                id: playerProfile._id,
                memberType: playerProfile.Info.MemberCategory,
                selectedMemberCategory: playerProfile.Info.SelectedMemberCategory,
                nickname: playerProfile.Info.Nickname,
                rating: playerProfile.RagfairInfo.rating ?? 0,
                isRatingGrowing: playerProfile.RagfairInfo.isRatingGrowing,
                avatar: undefined,
                aid: playerProfile.aid,
            };
        }

        // Fake pmc offer
        return {
            id: userID,
            memberType: MemberCategory.DEFAULT,
            nickname: this.botHelper.getPmcNicknameOfMaxLength(this.botConfig.botNameLengthLimit),
            rating: this.randomUtil.getFloat(
                this.ragfairConfig.dynamic.rating.min,
                this.ragfairConfig.dynamic.rating.max,
            ),
            isRatingGrowing: this.randomUtil.getBool(),
            avatar: undefined,
            aid: this.hashUtil.generateAccountId(),
        };
    }

    /**
     * Calculate the offer price that's listed on the flea listing
     * @param offerRequirements barter requirements for offer
     * @returns rouble cost of offer
     */
    protected convertOfferRequirementsIntoRoubles(offerRequirements: IOfferRequirement[]): number {
        let roublePrice = 0;
        for (const requirement of offerRequirements) {
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
    protected getAvatarUrl(isTrader: boolean, userId: string): string {
        if (isTrader) {
            return this.databaseService.getTrader(userId).base.avatar;
        }

        return "/files/trader/avatar/unknown.jpg";
    }

    /**
     * Convert a count of currency into roubles
     * @param currencyCount amount of currency to convert into roubles
     * @param currencyType Type of currency (euro/dollar/rouble)
     * @returns count of roubles
     */
    protected calculateRoublePrice(currencyCount: number, currencyType: string): number {
        if (currencyType === Money.ROUBLES) {
            return currencyCount;
        }

        return this.handbookHelper.inRUB(currencyCount, currencyType);
    }

    /**
     * Check userId, if its a player, return their pmc _id, otherwise return userId parameter
     * @param userId Users Id to check
     * @returns Users Id
     */
    protected getTraderId(userId: string): string {
        if (this.profileHelper.isPlayer(userId)) {
            return this.saveServer.getProfile(userId).characters.pmc._id;
        }

        return userId;
    }

    /**
     * Get a flea trading rating for the passed in user
     * @param userId User to get flea rating of
     * @returns Flea rating value
     */
    protected getRating(userId: string): number {
        if (this.profileHelper.isPlayer(userId)) {
            // Player offer
            return this.saveServer.getProfile(userId).characters.pmc.RagfairInfo.rating;
        }

        if (this.ragfairServerHelper.isTrader(userId)) {
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
    protected getRatingGrowing(userID: string): boolean {
        if (this.profileHelper.isPlayer(userID)) {
            // player offer
            return this.saveServer.getProfile(userID).characters.pmc.RagfairInfo.isRatingGrowing;
        }

        if (this.ragfairServerHelper.isTrader(userID)) {
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
    protected getOfferEndTime(userID: string, time: number): number {
        if (this.profileHelper.isPlayer(userID)) {
            // Player offer = current time + offerDurationTimeInHour;
            const offerDurationTimeHours = this.databaseService.getGlobals().config.RagFair.offerDurationTimeInHour;
            return this.timeUtil.getTimestamp() + Math.round(offerDurationTimeHours * TimeUtil.ONE_HOUR_AS_SECONDS);
        }

        if (this.ragfairServerHelper.isTrader(userID)) {
            // Trader offer
            return this.databaseService.getTrader(userID).base.nextResupply;
        }

        // Generated fake-player offer
        return Math.round(
            time +
                this.randomUtil.getInt(
                    this.ragfairConfig.dynamic.endTimeSeconds.min,
                    this.ragfairConfig.dynamic.endTimeSeconds.max,
                ),
        );
    }

    /**
     * Create multiple offers for items by using a unique list of items we've generated previously
     * @param expiredOffers optional, expired offers to regenerate
     */
    public async generateDynamicOffers(expiredOffers?: IItem[][]): Promise<void> {
        const replacingExpiredOffers = Boolean(expiredOffers?.length);

        // get assort items from param if they exist, otherwise grab freshly generated assorts
        const assortItemsToProcess: IItem[][] = replacingExpiredOffers
            ? expiredOffers
            : this.ragfairAssortGenerator.getAssortItems();

        // Create offers for each item set concurrently
        await Promise.all(
            assortItemsToProcess.map((assortItemWithChildren) =>
                this.createOffersFromAssort(assortItemWithChildren, replacingExpiredOffers, this.ragfairConfig.dynamic),
            ),
        );
    }

    /**
     * @param assortItemWithChildren Item with its children to process into offers
     * @param isExpiredOffer is an expired offer
     * @param config Ragfair dynamic config
     */
    protected async createOffersFromAssort(
        assortItemWithChildren: IItem[],
        isExpiredOffer: boolean,
        config: IDynamic,
    ): Promise<void> {
        const itemToSellDetails = this.itemHelper.getItem(assortItemWithChildren[0]._tpl);
        const isPreset = this.presetHelper.isPreset(assortItemWithChildren[0].upd.sptPresetId);

        // Only perform checks on newly generated items, skip expired items being refreshed
        if (!(isExpiredOffer || this.ragfairServerHelper.isItemValidRagfairItem(itemToSellDetails))) {
            return;
        }

        // Armor presets can hold plates above the allowed flea level, remove if necessary
        if (isPreset && this.ragfairConfig.dynamic.blacklist.enableBsgList) {
            this.removeBannedPlatesFromPreset(assortItemWithChildren, this.ragfairConfig.dynamic.blacklist.armorPlate);
        }

        // Get number of offers to create
        // Limit to 1 offer when processing expired - like-for-like replacement
        const offerCount = isExpiredOffer
            ? 1
            : Math.round(this.randomUtil.getInt(config.offerItemCount.min, config.offerItemCount.max));

        // Store all functions to create offers for this item and pass into Promise.all to run async
        const assortSingleOfferProcesses = [];
        for (let index = 0; index < offerCount; index++) {
            // Clone the item so we don't have shared references and generate new item IDs
            const clonedAssort = this.cloner.clone(assortItemWithChildren);
            this.itemHelper.reparentItemAndChildren(clonedAssort[0], clonedAssort);

            // Clear unnecessary properties
            delete clonedAssort[0].parentId;
            delete clonedAssort[0].slotId;

            assortSingleOfferProcesses.push(
                this.createSingleOfferForItem(this.hashUtil.generate(), clonedAssort, isPreset, itemToSellDetails[1]),
            );
        }

        await Promise.all(assortSingleOfferProcesses);
    }

    /**
     * iterate over an items chidren and look for plates above desired level and remove them
     * @param presetWithChildren preset to check for plates
     * @param plateSettings Settings
     * @returns True if plate removed
     */
    protected removeBannedPlatesFromPreset(
        presetWithChildren: IItem[],
        plateSettings: IArmorPlateBlacklistSettings,
    ): boolean {
        if (!this.itemHelper.armorItemCanHoldMods(presetWithChildren[0]._tpl)) {
            // Cant hold armor inserts, skip
            return false;
        }

        const plateSlots = presetWithChildren.filter((item) =>
            this.itemHelper.getRemovablePlateSlotIds().includes(item.slotId?.toLowerCase()),
        );
        if (plateSlots.length === 0) {
            // Has no plate slots e.g. "front_plate", exit
            return false;
        }

        let removedPlate = false;
        for (const plateSlot of plateSlots) {
            const plateDetails = this.itemHelper.getItem(plateSlot._tpl)[1];
            if (plateSettings.ignoreSlots.includes(plateSlot.slotId.toLowerCase())) {
                continue;
            }

            const plateArmorLevel = Number.parseInt(<string>plateDetails._props.armorClass) ?? 0;
            if (plateArmorLevel > plateSettings.maxProtectionLevel) {
                presetWithChildren.splice(presetWithChildren.indexOf(plateSlot), 1);
                removedPlate = true;
            }
        }

        return removedPlate;
    }

    /**
     * Create one flea offer for a specific item
     * @param sellerId Id of seller
     * @param itemWithChildren Item to create offer for
     * @param isPreset Is item a weapon preset
     * @param itemToSellDetails Raw db item details
     * @returns Item array
     */
    protected async createSingleOfferForItem(
        sellerId: string,
        itemWithChildren: IItem[],
        isPreset: boolean,
        itemToSellDetails: ITemplateItem,
    ): Promise<void> {
        // Set stack size to random value
        itemWithChildren[0].upd.StackObjectsCount = this.ragfairServerHelper.calculateDynamicStackCount(
            itemWithChildren[0]._tpl,
            isPreset,
        );

        const isBarterOffer = this.randomUtil.getChance100(this.ragfairConfig.dynamic.barter.chancePercent);
        const isPackOffer =
            this.randomUtil.getChance100(this.ragfairConfig.dynamic.pack.chancePercent) &&
            !isBarterOffer &&
            itemWithChildren.length === 1 &&
            this.itemHelper.isOfBaseclasses(
                itemWithChildren[0]._tpl,
                this.ragfairConfig.dynamic.pack.itemTypeWhitelist,
            );

        // Remove removable plates if % check passes
        if (this.itemHelper.armorItemCanHoldMods(itemWithChildren[0]._tpl)) {
            const armorConfig = this.ragfairConfig.dynamic.armor;

            const shouldRemovePlates = this.randomUtil.getChance100(armorConfig.removeRemovablePlateChance);
            if (shouldRemovePlates && this.itemHelper.armorItemHasRemovablePlateSlots(itemWithChildren[0]._tpl)) {
                const offerItemPlatesToRemove = itemWithChildren.filter((item) =>
                    armorConfig.plateSlotIdToRemovePool.includes(item.slotId?.toLowerCase()),
                );

                for (const plateItem of offerItemPlatesToRemove) {
                    itemWithChildren.splice(itemWithChildren.indexOf(plateItem), 1);
                }
            }
        }

        let barterScheme: IBarterScheme[];
        if (isPackOffer) {
            // Set pack size
            const stackSize = this.randomUtil.getInt(
                this.ragfairConfig.dynamic.pack.itemCountMin,
                this.ragfairConfig.dynamic.pack.itemCountMax,
            );
            itemWithChildren[0].upd.StackObjectsCount = stackSize;

            // Don't randomise pack items
            barterScheme = this.createCurrencyBarterScheme(itemWithChildren, isPackOffer, stackSize);
        } else if (isBarterOffer) {
            // Apply randomised properties
            this.randomiseOfferItemUpdProperties(sellerId, itemWithChildren, itemToSellDetails);
            barterScheme = this.createBarterBarterScheme(itemWithChildren, this.ragfairConfig.dynamic.barter);
            if (this.ragfairConfig.dynamic.barter.makeSingleStackOnly) {
                itemWithChildren[0].upd.StackObjectsCount = 1;
            }
        } else {
            // Apply randomised properties
            this.randomiseOfferItemUpdProperties(sellerId, itemWithChildren, itemToSellDetails);
            barterScheme = this.createCurrencyBarterScheme(itemWithChildren, isPackOffer);
        }

        const offer = this.createAndAddFleaOffer(
            sellerId,
            this.timeUtil.getTimestamp(),
            itemWithChildren,
            barterScheme,
            1,
            isPreset || isPackOffer,
        ); // sellAsOnePiece
    }

    /**
     * Generate trader offers on flea using the traders assort data
     * @param traderID Trader to generate offers for
     */
    public generateFleaOffersForTrader(traderID: string): void {
        // Purge
        this.ragfairOfferService.removeAllOffersByTrader(traderID);

        const time = this.timeUtil.getTimestamp();
        const trader = this.databaseService.getTrader(traderID);
        const assorts = trader.assort;

        // Trader assorts / assort items are missing
        if (!assorts?.items?.length) {
            this.logger.error(
                this.localisationService.getText(
                    "ragfair-no_trader_assorts_cant_generate_flea_offers",
                    trader.base.nickname,
                ),
            );
            return;
        }

        const blacklist = this.ragfairConfig.dynamic.blacklist;
        for (const item of assorts.items) {
            // We only want to process 'base/root' items, no children
            if (item.slotId !== "hideout") {
                // skip mod items
                continue;
            }

            // Run blacklist check on trader offers
            if (blacklist.traderItems) {
                const itemDetails = this.itemHelper.getItem(item._tpl);
                if (!itemDetails[0]) {
                    this.logger.warning(this.localisationService.getText("ragfair-tpl_not_a_valid_item", item._tpl));
                    continue;
                }

                // Don't include items that BSG has blacklisted from flea
                if (blacklist.enableBsgList && !itemDetails[1]._props.CanSellOnRagfair) {
                    continue;
                }
            }

            const isPreset = this.presetHelper.isPreset(item._id);
            const items: IItem[] = isPreset
                ? this.ragfairServerHelper.getPresetItems(item)
                : [...[item], ...this.itemHelper.findAndReturnChildrenByAssort(item._id, assorts.items)];

            const barterScheme = assorts.barter_scheme[item._id];
            if (!barterScheme) {
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

            // Adjust price by traderPriceMultipler config property
            if (this.traderConfig.traderPriceMultipler > 0) {
                if (barterSchemeItems.length === 1 && this.paymentHelper.isMoneyTpl(barterSchemeItems[0]._tpl)) {
                    barterSchemeItems[0].count = Math.ceil(
                        barterSchemeItems[0].count * this.traderConfig.traderPriceMultipler,
                    );
                }
            }

            const loyalLevel = assorts.loyal_level_items[item._id];

            const offer = this.createAndAddFleaOffer(traderID, time, items, barterSchemeItems, loyalLevel, false);

            // Refresh complete, reset flag to false
            trader.base.refreshTraderRagfairOffers = false;
        }
    }

    /**
     * Get array of an item with its mods + condition properties (e.g durability)
     * Apply randomisation adjustments to condition if item base is found in ragfair.json/dynamic/condition
     * @param userID id of owner of item
     * @param itemWithMods Item and mods, get condition of first item (only first array item is modified)
     * @param itemDetails db details of first item
     */
    protected randomiseOfferItemUpdProperties(userID: string, itemWithMods: IItem[], itemDetails: ITemplateItem): void {
        // Add any missing properties to first item in array
        this.addMissingConditions(itemWithMods[0]);

        if (!(this.profileHelper.isPlayer(userID) || this.ragfairServerHelper.isTrader(userID))) {
            const parentId = this.getDynamicConditionIdForTpl(itemDetails._id);
            if (!parentId) {
                // No condition details found, don't proceed with modifying item conditions
                return;
            }

            // Roll random chance to randomise item condition
            if (this.randomUtil.getChance100(this.ragfairConfig.dynamic.condition[parentId].conditionChance * 100)) {
                this.randomiseItemCondition(parentId, itemWithMods, itemDetails);
            }
        }
    }

    /**
     * Get the relevant condition id if item tpl matches in ragfair.json/condition
     * @param tpl Item to look for matching condition object
     * @returns condition id
     */
    protected getDynamicConditionIdForTpl(tpl: string): string | undefined {
        // Get keys from condition config dictionary
        const configConditions = Object.keys(this.ragfairConfig.dynamic.condition);
        for (const baseClass of configConditions) {
            if (this.itemHelper.isOfBaseclass(tpl, baseClass)) {
                return baseClass;
            }
        }

        return undefined;
    }

    /**
     * Alter an items condition based on its item base type
     * @param conditionSettingsId also the parentId of item being altered
     * @param itemWithMods Item to adjust condition details of
     * @param itemDetails db item details of first item in array
     */
    protected randomiseItemCondition(
        conditionSettingsId: string,
        itemWithMods: IItem[],
        itemDetails: ITemplateItem,
    ): void {
        const rootItem = itemWithMods[0];

        const itemConditionValues: Condition = this.ragfairConfig.dynamic.condition[conditionSettingsId];
        const maxMultiplier = this.randomUtil.getFloat(itemConditionValues.max.min, itemConditionValues.max.max);
        const currentMultiplier = this.randomUtil.getFloat(
            itemConditionValues.current.min,
            itemConditionValues.current.max,
        );

        // Randomise armor + plates + armor related things
        if (
            this.itemHelper.armorItemCanHoldMods(rootItem._tpl) ||
            this.itemHelper.isOfBaseclasses(rootItem._tpl, [BaseClasses.ARMOR_PLATE, BaseClasses.ARMORED_EQUIPMENT])
        ) {
            this.randomiseArmorDurabilityValues(itemWithMods, currentMultiplier, maxMultiplier);

            // Add hits to visor
            const visorMod = itemWithMods.find(
                (item) => item.parentId === BaseClasses.ARMORED_EQUIPMENT && item.slotId === "mod_equipment_000",
            );
            if (this.randomUtil.getChance100(25) && visorMod) {
                this.itemHelper.addUpdObjectToItem(visorMod);

                visorMod.upd.FaceShield = { Hits: this.randomUtil.getInt(1, 3) };
            }

            return;
        }

        // Randomise Weapons
        if (this.itemHelper.isOfBaseclass(itemDetails._id, BaseClasses.WEAPON)) {
            this.randomiseWeaponDurability(itemWithMods[0], itemDetails, maxMultiplier, currentMultiplier);

            return;
        }

        if (rootItem.upd.MedKit) {
            // Randomize health
            rootItem.upd.MedKit.HpResource = Math.round(rootItem.upd.MedKit.HpResource * maxMultiplier) || 1;

            return;
        }

        if (rootItem.upd.Key && itemDetails._props.MaximumNumberOfUsage > 1) {
            // Randomize key uses
            rootItem.upd.Key.NumberOfUsages =
                Math.round(itemDetails._props.MaximumNumberOfUsage * (1 - maxMultiplier)) || 0;

            return;
        }

        if (rootItem.upd.FoodDrink) {
            // randomize food/drink value
            rootItem.upd.FoodDrink.HpPercent = Math.round(itemDetails._props.MaxResource * maxMultiplier) || 1;

            return;
        }

        if (rootItem.upd.RepairKit) {
            // randomize repair kit (armor/weapon) uses
            rootItem.upd.RepairKit.Resource = Math.round(itemDetails._props.MaxRepairResource * maxMultiplier) || 1;

            return;
        }

        if (this.itemHelper.isOfBaseclass(itemDetails._id, BaseClasses.FUEL)) {
            const totalCapacity = itemDetails._props.MaxResource;
            const remainingFuel = Math.round(totalCapacity * maxMultiplier);
            rootItem.upd.Resource = { UnitsConsumed: totalCapacity - remainingFuel, Value: remainingFuel };
        }
    }

    /**
     * Adjust an items durability/maxDurability value
     * @param item item (weapon/armor) to Adjust
     * @param itemDbDetails Weapon details from db
     * @param maxMultiplier Value to multiply max durability by
     * @param currentMultiplier Value to multiply current durability by
     */
    protected randomiseWeaponDurability(
        item: IItem,
        itemDbDetails: ITemplateItem,
        maxMultiplier: number,
        currentMultiplier: number,
    ): void {
        // Max
        const baseMaxDurability = itemDbDetails._props.MaxDurability;
        const lowestMaxDurability = this.randomUtil.getFloat(maxMultiplier, 1) * baseMaxDurability;
        const chosenMaxDurability = Math.round(this.randomUtil.getFloat(lowestMaxDurability, baseMaxDurability));

        // Current
        const lowestCurrentDurability = this.randomUtil.getFloat(currentMultiplier, 1) * chosenMaxDurability;
        const chosenCurrentDurability = Math.round(
            this.randomUtil.getFloat(lowestCurrentDurability, chosenMaxDurability),
        );

        item.upd.Repairable.Durability = chosenCurrentDurability || 1; // Never let value become 0
        item.upd.Repairable.MaxDurability = chosenMaxDurability;
    }

    /**
     * Randomise the durabiltiy values for an armors plates and soft inserts
     * @param armorWithMods Armor item with its child mods
     * @param currentMultiplier Chosen multipler to use for current durability value
     * @param maxMultiplier Chosen multipler to use for max durability value
     */
    protected randomiseArmorDurabilityValues(
        armorWithMods: IItem[],
        currentMultiplier: number,
        maxMultiplier: number,
    ): void {
        for (const armorItem of armorWithMods) {
            const itemDbDetails = this.itemHelper.getItem(armorItem._tpl)[1];
            if (Number.parseInt(<string>itemDbDetails._props.armorClass) > 1) {
                this.itemHelper.addUpdObjectToItem(armorItem);

                const baseMaxDurability = itemDbDetails._props.MaxDurability;
                const lowestMaxDurability = this.randomUtil.getFloat(maxMultiplier, 1) * baseMaxDurability;
                const chosenMaxDurability = Math.round(
                    this.randomUtil.getFloat(lowestMaxDurability, baseMaxDurability),
                );

                const lowestCurrentDurability = this.randomUtil.getFloat(currentMultiplier, 1) * chosenMaxDurability;
                const chosenCurrentDurability = Math.round(
                    this.randomUtil.getFloat(lowestCurrentDurability, chosenMaxDurability),
                );

                armorItem.upd.Repairable = {
                    Durability: chosenCurrentDurability || 1, // Never let value become 0
                    MaxDurability: chosenMaxDurability,
                };
            }
        }
    }

    /**
     * Add missing conditions to an item if needed
     * Durabiltiy for repairable items
     * HpResource for medical items
     * @param item item to add conditions to
     */
    protected addMissingConditions(item: IItem): void {
        const props = this.itemHelper.getItem(item._tpl)[1]._props;
        const isRepairable = "Durability" in props;
        const isMedkit = "MaxHpResource" in props;
        const isKey = "MaximumNumberOfUsage" in props;
        const isConsumable = props.MaxResource > 1 && "foodUseTime" in props;
        const isRepairKit = "MaxRepairResource" in props;

        if (isRepairable && props.Durability > 0) {
            item.upd.Repairable = { Durability: props.Durability, MaxDurability: props.Durability };

            return;
        }

        if (isMedkit && props.MaxHpResource > 0) {
            item.upd.MedKit = { HpResource: props.MaxHpResource };

            return;
        }

        if (isKey) {
            item.upd.Key = { NumberOfUsages: 0 };

            return;
        }

        // Food/drink
        if (isConsumable) {
            item.upd.FoodDrink = { HpPercent: props.MaxResource };

            return;
        }

        if (isRepairKit) {
            item.upd.RepairKit = { Resource: props.MaxRepairResource };
        }
    }

    /**
     * Create a barter-based barter scheme, if not possible, fall back to making barter scheme currency based
     * @param offerItems Items for sale in offer
     * @param barterConfig Barter config from ragfairConfig.dynamic.barter
     * @returns Barter scheme
     */
    protected createBarterBarterScheme(offerItems: IItem[], barterConfig: IBarterDetails): IBarterScheme[] {
        // Get flea price of item being sold
        const priceOfOfferItem = this.ragfairPriceService.getDynamicOfferPriceForOffer(
            offerItems,
            Money.ROUBLES,
            false,
        );

        // Dont make items under a designated rouble value into barter offers
        if (priceOfOfferItem < barterConfig.minRoubleCostToBecomeBarter) {
            return this.createCurrencyBarterScheme(offerItems, false);
        }

        // Get a randomised number of barter items to list offer for
        const barterItemCount = this.randomUtil.getInt(barterConfig.itemCountMin, barterConfig.itemCountMax);

        // Get desired cost of individual item offer will be listed for e.g. offer = 15k, item count = 3, desired item cost = 5k
        const desiredItemCostRouble = Math.round(priceOfOfferItem / barterItemCount);

        // Rouble amount to go above/below when looking for an item (Wiggle cost of item a little)
        const offerCostVarianceRoubles = (desiredItemCostRouble * barterConfig.priceRangeVariancePercent) / 100;

        // Dict of items and their flea price (cached on first use)
        const itemFleaPrices = this.getFleaPricesAsArray();

        // Filter possible barters to items that match the price range + not itself
        const itemsInsidePriceBounds = itemFleaPrices.filter(
            (itemAndPrice) =>
                itemAndPrice.price >= desiredItemCostRouble - offerCostVarianceRoubles &&
                itemAndPrice.price <= desiredItemCostRouble + offerCostVarianceRoubles &&
                itemAndPrice.tpl !== offerItems[0]._tpl, // Don't allow the item being sold to be chosen
        );

        // No items on flea have a matching price, fall back to currency
        if (itemsInsidePriceBounds.length === 0) {
            return this.createCurrencyBarterScheme(offerItems, false);
        }

        // Choose random item from price-filtered flea items
        const randomItem = this.randomUtil.getArrayValue(itemsInsidePriceBounds);

        return [{ count: barterItemCount, _tpl: randomItem.tpl }];
    }

    /**
     * Get an array of flea prices + item tpl, cached in generator class inside `allowedFleaPriceItemsForBarter`
     * @returns array with tpl/price values
     */
    protected getFleaPricesAsArray(): ITplWithFleaPrice[] {
        // Generate if needed
        if (!this.allowedFleaPriceItemsForBarter) {
            const fleaPrices = this.databaseService.getPrices();

            // Only get prices for items that also exist in items.json
            const filteredFleaItems = Object.entries(fleaPrices)
                .map(([tpl, price]) => ({ tpl: tpl, price: price }))
                .filter((item) => this.itemHelper.getItem(item.tpl)[0]);

            const itemTypeBlacklist = this.ragfairConfig.dynamic.barter.itemTypeBlacklist;
            this.allowedFleaPriceItemsForBarter = filteredFleaItems.filter(
                (item) => !this.itemHelper.isOfBaseclasses(item.tpl, itemTypeBlacklist),
            );
        }

        return this.allowedFleaPriceItemsForBarter;
    }

    /**
     * Create a random currency-based barter scheme for an array of items
     * @param offerWithChildren Items on offer
     * @param isPackOffer Is the barter scheme being created for a pack offer
     * @param multipler What to multiply the resulting price by
     * @returns Barter scheme for offer
     */
    protected createCurrencyBarterScheme(
        offerWithChildren: IItem[],
        isPackOffer: boolean,
        multipler = 1,
    ): IBarterScheme[] {
        const currency = this.ragfairServerHelper.getDynamicOfferCurrency();
        const price =
            this.ragfairPriceService.getDynamicOfferPriceForOffer(offerWithChildren, currency, isPackOffer) * multipler;

        return [{ count: price, _tpl: currency }];
    }
}
