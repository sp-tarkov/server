import { BotHelper } from "@spt/helpers/BotHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PaymentHelper } from "@spt/helpers/PaymentHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { RagfairHelper } from "@spt/helpers/RagfairHelper";
import { RagfairServerHelper } from "@spt/helpers/RagfairServerHelper";
import { RagfairSortHelper } from "@spt/helpers/RagfairSortHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITraderAssort } from "@spt/models/eft/common/tables/ITrader";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { ISptProfile, ISystemData } from "@spt/models/eft/profile/ISptProfile";
import { IRagfairOffer } from "@spt/models/eft/ragfair/IRagfairOffer";
import { ISearchRequestData, OfferOwnerType } from "@spt/models/eft/ragfair/ISearchRequestData";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { MessageType } from "@spt/models/enums/MessageType";
import { RagfairSort } from "@spt/models/enums/RagfairSort";
import { Traders } from "@spt/models/enums/Traders";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IQuestConfig } from "@spt/models/spt/config/IQuestConfig";
import { IRagfairConfig, ITieredFlea } from "@spt/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocaleService } from "@spt/services/LocaleService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { RagfairOfferService } from "@spt/services/RagfairOfferService";
import { RagfairRequiredItemsService } from "@spt/services/RagfairRequiredItemsService";
import { HashUtil } from "@spt/utils/HashUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairOfferHelper {
    protected static goodSoldTemplate = "5bdabfb886f7743e152e867e 0"; // Your {soldItem} {itemCount} items were bought by {buyerNickname}.
    protected ragfairConfig: IRagfairConfig;
    protected questConfig: IQuestConfig;
    protected botConfig: IBotConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("RagfairSortHelper") protected ragfairSortHelper: RagfairSortHelper,
        @inject("RagfairHelper") protected ragfairHelper: RagfairHelper,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
        @inject("RagfairRequiredItemsService") protected ragfairRequiredItemsService: RagfairRequiredItemsService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Passthrough to ragfairOfferService.getOffers(), get flea offers a player should see
     * @param searchRequest Data from client
     * @param itemsToAdd ragfairHelper.filterCategories()
     * @param traderAssorts Trader assorts
     * @param pmcData Player profile
     * @returns Offers the player should see
     */
    public getValidOffers(
        searchRequest: ISearchRequestData,
        itemsToAdd: string[],
        traderAssorts: Record<string, ITraderAssort>,
        pmcData: IPmcData,
    ): IRagfairOffer[] {
        const playerIsFleaBanned = this.profileHelper.playerIsFleaBanned(pmcData);
        const tieredFlea = this.ragfairConfig.tieredFlea;
        const tieredFleaLimitTypes = Object.keys(tieredFlea.unlocksType);
        return this.ragfairOfferService.getOffers().filter((offer) => {
            if (!this.passesSearchFilterCriteria(searchRequest, offer, pmcData)) {
                return false;
            }

            const isDisplayable = this.isDisplayableOffer(
                searchRequest,
                itemsToAdd,
                traderAssorts,
                offer,
                pmcData,
                playerIsFleaBanned,
            );

            if (!isDisplayable) {
                return false;
            }

            // Not trader offer + tiered flea enabled
            if (tieredFlea.enabled && !this.offerIsFromTrader(offer)) {
                this.checkAndLockOfferFromPlayerTieredFlea(tieredFlea, offer, tieredFleaLimitTypes, pmcData.Info.Level);
            }

            return true;
        });
    }

    /**
     * Disable offer if item is flagged by tiered flea config
     * @param tieredFlea Tiered flea settings from ragfair config
     * @param offer Ragfair offer to check
     * @param tieredFleaLimitTypes Dict of item types with player level to be viewable
     * @param playerLevel Level of player viewing offer
     */
    protected checkAndLockOfferFromPlayerTieredFlea(
        tieredFlea: ITieredFlea,
        offer: IRagfairOffer,
        tieredFleaLimitTypes: string[],
        playerLevel: number,
    ): void {
        const offerItemTpl = offer.items[0]._tpl;
        if (tieredFlea.ammoTplUnlocks && this.itemHelper.isOfBaseclass(offerItemTpl, BaseClasses.AMMO)) {
            const unlockLevel = tieredFlea.ammoTplUnlocks[offerItemTpl];
            if (unlockLevel && playerLevel < unlockLevel) {
                offer.locked = true;

                return;
            }
        }

        // Check for a direct level requirement for the offer item
        const itemLevelRequirement = tieredFlea.unlocksTpl[offerItemTpl];
        if (itemLevelRequirement) {
            if (playerLevel < itemLevelRequirement) {
                offer.locked = true;

                return;
            }
        }

        // Optimisation - Ensure the item has at least one of the limited base types
        if (this.itemHelper.isOfBaseclasses(offerItemTpl, tieredFleaLimitTypes)) {
            // Loop over all flea types to find the matching one
            for (const tieredItemType of tieredFleaLimitTypes) {
                if (this.itemHelper.isOfBaseclass(offerItemTpl, tieredItemType)) {
                    if (playerLevel < tieredFlea.unlocksType[tieredItemType]) {
                        offer.locked = true;

                        return;
                    }

                    break;
                }
            }
        }
    }

    /**
     * Get matching offers that require the desired item and filter out offers from non traders if player is below ragfair unlock level
     * @param searchRequest Search request from client
     * @param pmcDataPlayer profile
     * @returns Matching IRagfairOffer objects
     */
    public getOffersThatRequireItem(searchRequest: ISearchRequestData, pmcData: IPmcData): IRagfairOffer[] {
        // Get all offers that requre the desired item and filter out offers from non traders if player below ragifar unlock
        const requiredOffers = this.ragfairRequiredItemsService.getRequiredItemsById(searchRequest.neededSearchId);
        const tieredFlea = this.ragfairConfig.tieredFlea;
        const tieredFleaLimitTypes = Object.keys(tieredFlea.unlocksType);

        return requiredOffers.filter((offer: IRagfairOffer) => {
            if (!this.passesSearchFilterCriteria(searchRequest, offer, pmcData)) {
                return false;
            }

            if (tieredFlea.enabled && !this.offerIsFromTrader(offer)) {
                this.checkAndLockOfferFromPlayerTieredFlea(tieredFlea, offer, tieredFleaLimitTypes, pmcData.Info.Level);
            }

            return true;
        });
    }

    /**
     * Get offers from flea/traders specifically when building weapon preset
     * @param searchRequest Search request data
     * @param itemsToAdd string array of item tpls to search for
     * @param traderAssorts All trader assorts player can access/buy
     * @param pmcData Player profile
     * @returns IRagfairOffer array
     */
    public getOffersForBuild(
        searchRequest: ISearchRequestData,
        itemsToAdd: string[],
        traderAssorts: Record<string, ITraderAssort>,
        pmcData: IPmcData,
    ): IRagfairOffer[] {
        const offersMap = new Map<string, IRagfairOffer[]>();
        const offersToReturn: IRagfairOffer[] = [];
        const playerIsFleaBanned = this.profileHelper.playerIsFleaBanned(pmcData);
        const tieredFlea = this.ragfairConfig.tieredFlea;
        const tieredFleaLimitTypes = Object.keys(tieredFlea.unlocksType);

        for (const desiredItemTpl of Object.keys(searchRequest.buildItems)) {
            const matchingOffers = this.ragfairOfferService.getOffersOfType(desiredItemTpl);
            for (const offer of matchingOffers) {
                // Dont show pack offers
                if (offer.sellInOnePiece) {
                    continue;
                }

                if (!this.passesSearchFilterCriteria(searchRequest, offer, pmcData)) {
                    continue;
                }

                if (
                    !this.isDisplayableOffer(
                        searchRequest,
                        itemsToAdd,
                        traderAssorts,
                        offer,
                        pmcData,
                        playerIsFleaBanned,
                    )
                ) {
                    continue;
                }

                if (this.offerIsFromTrader(offer)) {
                    if (this.traderBuyRestrictionReached(offer)) {
                        continue;
                    }

                    if (this.traderOutOfStock(offer)) {
                        continue;
                    }

                    if (this.traderOfferItemQuestLocked(offer, traderAssorts)) {
                        continue;
                    }

                    if (this.traderOfferLockedBehindLoyaltyLevel(offer, pmcData)) {
                        continue;
                    }
                }

                // Tiered flea and not trader offer
                if (tieredFlea.enabled && !this.offerIsFromTrader(offer)) {
                    this.checkAndLockOfferFromPlayerTieredFlea(
                        tieredFlea,
                        offer,
                        tieredFleaLimitTypes,
                        pmcData.Info.Level,
                    );
                }

                const key = offer.items[0]._tpl;
                if (!offersMap.has(key)) {
                    offersMap.set(key, []);
                }

                offersMap.get(key).push(offer);
            }
        }

        // Get best offer for each item to show on screen
        for (let possibleOffers of offersMap.values()) {
            // Remove offers with locked = true (quest locked) when > 1 possible offers
            // single trader item = shows greyed out
            // multiple offers for item = is greyed out
            if (possibleOffers.length > 1) {
                const lockedOffers = this.getLoyaltyLockedOffers(possibleOffers, pmcData);

                // Exclude locked offers + above loyalty locked offers if at least 1 was found
                possibleOffers = possibleOffers.filter((offer) => !(offer.locked || lockedOffers.includes(offer._id)));

                // Exclude trader offers over their buy restriction limit
                possibleOffers = this.getOffersInsideBuyRestrictionLimits(possibleOffers);
            }

            // Sort offers by price and pick the best
            const offer = this.ragfairSortHelper.sortOffers(possibleOffers, RagfairSort.PRICE, 0)[0];
            offersToReturn.push(offer);
        }

        return offersToReturn;
    }

    /**
     * Get offers that have not exceeded buy limits
     * @param possibleOffers offers to process
     * @returns Offers
     */
    protected getOffersInsideBuyRestrictionLimits(possibleOffers: IRagfairOffer[]) {
        // Check offer has buy limit + is from trader + current buy count is at or over max
        return possibleOffers.filter((offer) => {
            if (
                typeof offer.buyRestrictionMax !== "undefined" &&
                this.offerIsFromTrader(offer) &&
                offer.buyRestrictionCurrent >= offer.buyRestrictionMax
            ) {
                if (offer.buyRestrictionCurrent >= offer.buyRestrictionMax) {
                    return false;
                }
            }

            // Doesnt have buy limits, retrun offer
            return true;
        });
    }

    /**
     * Check if offer is from trader standing the player does not have
     * @param offer Offer to check
     * @param pmcProfile Player profile
     * @returns True if item is locked, false if item is purchaseable
     */
    protected traderOfferLockedBehindLoyaltyLevel(offer: IRagfairOffer, pmcProfile: IPmcData): boolean {
        const userTraderSettings = pmcProfile.TradersInfo[offer.user.id];

        return userTraderSettings.loyaltyLevel < offer.loyaltyLevel;
    }

    /**
     * Check if offer item is quest locked for current player by looking at sptQuestLocked property in traders barter_scheme
     * @param offer Offer to check is quest locked
     * @param traderAssorts all trader assorts for player
     * @returns true if quest locked
     */
    public traderOfferItemQuestLocked(offer: IRagfairOffer, traderAssorts: Record<string, ITraderAssort>): boolean {
        return offer.items?.some((i) =>
            traderAssorts[offer.user.id].barter_scheme[i._id]?.some((bs1) => bs1?.some((bs2) => bs2.sptQuestLocked)),
        );
    }

    /**
     * Has trader offer ran out of stock to sell to player
     * @param offer Offer to check stock of
     * @returns true if out of stock
     */
    protected traderOutOfStock(offer: IRagfairOffer): boolean {
        if (offer?.items?.length === 0) {
            return true;
        }

        return offer.items[0]?.upd?.StackObjectsCount === 0;
    }

    /**
     * Check if trader offers' BuyRestrictionMax value has been reached
     * @param offer Offer to check restriction properties of
     * @returns true if restriction reached, false if no restrictions/not reached
     */
    protected traderBuyRestrictionReached(offer: IRagfairOffer): boolean {
        const traderAssorts = this.traderHelper.getTraderAssortsByTraderId(offer.user.id).items;

        // Find item being purchased from traders assorts
        const assortData = traderAssorts.find((item) => item._id === offer.items[0]._id);

        // No trader assort data
        if (!assortData) {
            this.logger.warning(
                `Unable to find trader: ${offer.user.nickname} assort for item: ${this.itemHelper.getItemName(
                    offer.items[0]._tpl,
                )} ${offer.items[0]._tpl}, cannot check if buy restriction reached`,
            );

            return false;
        }

        if (!assortData.upd) {
            return false;
        }

        // No restriction values
        // Can't use !assortData.upd.BuyRestrictionX as value could be 0
        const assortUpd = assortData.upd;
        if (assortUpd.BuyRestrictionMax === undefined || assortUpd.BuyRestrictionCurrent === undefined) {
            return false;
        }

        // Current equals max, limit reached
        if (assortUpd.BuyRestrictionCurrent >= assortUpd.BuyRestrictionMax) {
            return true;
        }

        return false;
    }

    /**
     * Get an array of flea offers that are inaccessible to player due to their inadequate loyalty level
     * @param offers Offers to check
     * @param pmcProfile Players profile with trader loyalty levels
     * @returns Array of offer ids player cannot see
     */
    protected getLoyaltyLockedOffers(offers: IRagfairOffer[], pmcProfile: IPmcData): string[] {
        const loyaltyLockedOffers: string[] = [];
        for (const offer of offers.filter((offer) => this.offerIsFromTrader(offer))) {
            const traderDetails = pmcProfile.TradersInfo[offer.user.id];
            if (traderDetails.loyaltyLevel < offer.loyaltyLevel) {
                loyaltyLockedOffers.push(offer._id);
            }
        }

        return loyaltyLockedOffers;
    }

    /**
     * Process all player-listed flea offers for a desired profile
     * @param sessionID Session id to process offers for
     * @returns true = complete
     */
    public processOffersOnProfile(sessionID: string): boolean {
        const timestamp = this.timeUtil.getTimestamp();
        const profileOffers = this.getProfileOffers(sessionID);

        // No offers, don't do anything
        if (!profileOffers?.length) {
            return true;
        }

        for (const offer of profileOffers.values()) {
            if (offer.sellResult?.length > 0 && timestamp >= offer.sellResult[0].sellTime) {
                // Checks first item, first is spliced out of array after being processed
                // Item sold
                let totalItemsCount = 1;
                let boughtAmount = 1;

                if (!offer.sellInOnePiece) {
                    // offer.items.reduce((sum, item) => sum + item.upd?.StackObjectsCount ?? 0, 0);
                    totalItemsCount = this.getTotalStackCountSize([offer.items]);
                    boughtAmount = offer.sellResult[0].amount;
                }

                const ratingToAdd = (offer.summaryCost / totalItemsCount) * boughtAmount;
                this.increaseProfileRagfairRating(this.saveServer.getProfile(sessionID), ratingToAdd);

                this.completeOffer(sessionID, offer, boughtAmount);
                offer.sellResult.splice(0, 1); // Remove the sell result object now its been processed
            }
        }

        return true;
    }

    /**
     * Count up all rootitem StackObjectsCount properties of an array of items
     * @param itemsInInventoryToList items to sum up
     * @returns Total stack count
     */
    public getTotalStackCountSize(itemsInInventoryToList: IItem[][]): number {
        let total = 0;
        for (const itemAndChildren of itemsInInventoryToList) {
            // Only count the root items stack count in total
            const rootItem = itemAndChildren[0];
            total += rootItem.upd?.StackObjectsCount ?? 1;
        }

        return total;
    }

    /**
     * Add amount to players ragfair rating
     * @param sessionId Profile to update
     * @param amountToIncrementBy Raw amount to add to players ragfair rating (excluding the reputation gain multiplier)
     */
    public increaseProfileRagfairRating(profile: ISptProfile, amountToIncrementBy: number): void {
        const ragfairGlobalsConfig = this.databaseService.getGlobals().config.RagFair;

        profile.characters.pmc.RagfairInfo.isRatingGrowing = true;
        if (Number.isNaN(amountToIncrementBy)) {
            this.logger.warning(`Unable to increment ragfair rating, value was not a number: ${amountToIncrementBy}`);

            return;
        }
        profile.characters.pmc.RagfairInfo.rating +=
            (ragfairGlobalsConfig.ratingIncreaseCount / ragfairGlobalsConfig.ratingSumForIncrease) *
            amountToIncrementBy;
    }

    /**
     * Return all offers a player has listed on a desired profile
     * @param sessionID Session id
     * @returns Array of ragfair offers
     */
    protected getProfileOffers(sessionID: string): IRagfairOffer[] {
        const profile = this.profileHelper.getPmcProfile(sessionID);

        if (profile.RagfairInfo === undefined || profile.RagfairInfo.offers === undefined) {
            return [];
        }

        return profile.RagfairInfo.offers;
    }

    /**
     * Delete an offer from a desired profile and from ragfair offers
     * @param sessionID Session id of profile to delete offer from
     * @param offerId Id of offer to delete
     */
    protected deleteOfferById(sessionID: string, offerId: string): void {
        const profileRagfairInfo = this.saveServer.getProfile(sessionID).characters.pmc.RagfairInfo;
        const index = profileRagfairInfo.offers.findIndex((o) => o._id === offerId);
        profileRagfairInfo.offers.splice(index, 1);

        // Also delete from ragfair
        this.ragfairOfferService.removeOfferById(offerId);
    }

    /**
     * Complete the selling of players' offer
     * @param sessionID Session id
     * @param offer Sold offer details
     * @param boughtAmount Amount item was purchased for
     * @returns IItemEventRouterResponse
     */
    public completeOffer(sessionID: string, offer: IRagfairOffer, boughtAmount: number): IItemEventRouterResponse {
        const itemTpl = offer.items[0]._tpl;
        let paymentItemsToSendToPlayer: IItem[] = [];
        const offerStackCount = offer.items[0].upd.StackObjectsCount;

        // Pack or ALL items of a multi-offer were bought - remove entire ofer
        if (offer.sellInOnePiece || boughtAmount === offerStackCount) {
            this.deleteOfferById(sessionID, offer._id);
        } else {
            const offerRootItem = offer.items[0];

            // Reduce offer root items stack count
            offerRootItem.upd.StackObjectsCount -= boughtAmount;
        }

        // Assemble payment to send to seller now offer was purchased
        for (const requirement of offer.requirements) {
            // Create an item template item
            const requestedItem: IItem = {
                _id: this.hashUtil.generate(),
                _tpl: requirement._tpl,
                upd: { StackObjectsCount: requirement.count * boughtAmount },
            };

            const stacks = this.itemHelper.splitStack(requestedItem);
            for (const item of stacks) {
                const outItems = [item];

                // TODO - is this code used?, may have been when adding barters to flea was still possible for player
                if (requirement.onlyFunctional) {
                    const presetItems = this.ragfairServerHelper.getPresetItemsByTpl(item);
                    if (presetItems.length) {
                        outItems.push(presetItems[0]);
                    }
                }

                paymentItemsToSendToPlayer = [...paymentItemsToSendToPlayer, ...outItems];
            }
        }

        const ragfairDetails = {
            offerId: offer._id,
            count: offer.sellInOnePiece ? offerStackCount : boughtAmount, // pack-offers NEED to the full item count otherwise it only removes 1 from the pack, leaving phantom offer on client ui
            handbookId: itemTpl,
        };

        this.mailSendService.sendDirectNpcMessageToPlayer(
            sessionID,
            this.traderHelper.getTraderById(Traders.RAGMAN),
            MessageType.FLEAMARKET_MESSAGE,
            this.getLocalisedOfferSoldMessage(itemTpl, boughtAmount),
            paymentItemsToSendToPlayer,
            this.timeUtil.getHoursAsSeconds(
                this.questHelper.getMailItemRedeemTimeHoursForProfile(this.profileHelper.getPmcProfile(sessionID)),
            ),
            undefined,
            ragfairDetails,
        );

        return this.eventOutputHolder.getOutput(sessionID);
    }

    /**
     * Get a localised message for when players offer has sold on flea
     * @param itemTpl Item sold
     * @param boughtAmount How many were purchased
     * @returns Localised message text
     */
    protected getLocalisedOfferSoldMessage(itemTpl: string, boughtAmount: number): string {
        // Generate a message to inform that item was sold
        const globalLocales = this.localeService.getLocaleDb();
        const soldMessageLocaleGuid = globalLocales[RagfairOfferHelper.goodSoldTemplate];
        if (!soldMessageLocaleGuid) {
            this.logger.error(
                this.localisationService.getText(
                    "ragfair-unable_to_find_locale_by_key",
                    RagfairOfferHelper.goodSoldTemplate,
                ),
            );
        }

        // Used to replace tokens in sold message sent to player
        const tplVars: ISystemData = {
            soldItem: globalLocales[`${itemTpl} Name`] || itemTpl,
            buyerNickname: this.botHelper.getPmcNicknameOfMaxLength(this.botConfig.botNameLengthLimit),
            itemCount: boughtAmount,
        };

        const offerSoldMessageText = soldMessageLocaleGuid.replace(/{\w+}/g, (matched) => {
            return tplVars[matched.replace(/{|}/g, "")];
        });

        return offerSoldMessageText.replace(/"/g, "");
    }

    /**
     * Check an offer passes the various search criteria the player requested
     * @param searchRequest Client search request
     * @param offer Offer to check
     * @param pmcData Player profile
     * @returns True if offer passes criteria
     */
    protected passesSearchFilterCriteria(
        searchRequest: ISearchRequestData,
        offer: IRagfairOffer,
        pmcData: IPmcData,
    ): boolean {
        const isDefaultUserOffer = offer.user.memberType === MemberCategory.DEFAULT;
        const offerRootItem = offer.items[0];
        const moneyTypeTpl = offer.requirements[0]._tpl;
        const isTraderOffer = this.offerIsFromTrader(offer);

        if (pmcData.Info.Level < this.databaseService.getGlobals().config.RagFair.minUserLevel && isDefaultUserOffer) {
            // Skip item if player is < global unlock level (default is 15) and item is from a dynamically generated source
            return false;
        }

        if (searchRequest.offerOwnerType === OfferOwnerType.TRADEROWNERTYPE && !isTraderOffer) {
            // don't include player offers
            return false;
        }

        if (searchRequest.offerOwnerType === OfferOwnerType.PLAYEROWNERTYPE && isTraderOffer) {
            // don't include trader offers
            return false;
        }

        if (
            searchRequest.oneHourExpiration &&
            offer.endTime - this.timeUtil.getTimestamp() > TimeUtil.ONE_HOUR_AS_SECONDS
        ) {
            // offer expires within an hour
            return false;
        }

        if (searchRequest.quantityFrom > 0 && searchRequest.quantityFrom >= offerRootItem.upd.StackObjectsCount) {
            // too little items to offer
            return false;
        }

        if (searchRequest.quantityTo > 0 && searchRequest.quantityTo <= offerRootItem.upd.StackObjectsCount) {
            // too many items to offer
            return false;
        }

        if (searchRequest.onlyFunctional && !this.isItemFunctional(offerRootItem, offer)) {
            // don't include non-functional items
            return false;
        }

        if (offer.items.length === 1) {
            // Single item
            if (
                this.isConditionItem(offerRootItem) &&
                !this.itemQualityInRange(offerRootItem, searchRequest.conditionFrom, searchRequest.conditionTo)
            ) {
                return false;
            }
        } else {
            const itemQualityPercent = this.itemHelper.getItemQualityModifierForItems(offer.items) * 100;
            if (itemQualityPercent < searchRequest.conditionFrom) {
                return false;
            }

            if (itemQualityPercent > searchRequest.conditionTo) {
                return false;
            }
        }

        if (searchRequest.currency > 0 && this.paymentHelper.isMoneyTpl(moneyTypeTpl)) {
            const currencies = ["all", "RUB", "USD", "EUR"];

            if (this.ragfairHelper.getCurrencyTag(moneyTypeTpl) !== currencies[searchRequest.currency]) {
                // don't include item paid in wrong currency
                return false;
            }
        }

        if (searchRequest.priceFrom > 0 && searchRequest.priceFrom >= offer.requirementsCost) {
            // price is too low
            return false;
        }

        if (searchRequest.priceTo > 0 && searchRequest.priceTo <= offer.requirementsCost) {
            // price is too high
            return false;
        }

        // Passes above checks, search criteria filters have not filtered offer out
        return true;
    }

    /**
     * Check that the passed in offer item is functional
     * @param offerRootItem The root item of the offer
     * @param offer Flea offer to check
     * @returns True if the given item is functional
     */
    public isItemFunctional(offerRootItem: IItem, offer: IRagfairOffer): boolean {
        // Non-preset weapons/armor are always functional
        if (!this.presetHelper.hasPreset(offerRootItem._tpl)) {
            return true;
        }

        // For armor items that can hold mods, make sure the item count is atleast the amount of required plates
        if (this.itemHelper.armorItemCanHoldMods(offerRootItem._tpl)) {
            const offerRootTemplate = this.itemHelper.getItem(offerRootItem._tpl)[1];
            const requiredPlateCount = offerRootTemplate._props.Slots?.filter((item) => item._required)?.length;

            return offer.items.length > requiredPlateCount;
        }

        // For other presets, make sure the offer has more than 1 item
        return offer.items.length > 1;
    }

    /**
     * Should a ragfair offer be visible to the player
     * @param searchRequest Search request
     * @param itemsToAdd ?
     * @param traderAssorts Trader assort items - used for filtering out locked trader items
     * @param offer The flea offer
     * @param pmcProfile Player profile
     * @returns True = should be shown to player
     */
    public isDisplayableOffer(
        searchRequest: ISearchRequestData,
        itemsToAdd: string[],
        traderAssorts: Record<string, ITraderAssort>,
        offer: IRagfairOffer,
        pmcProfile: IPmcData,
        playerIsFleaBanned?: boolean,
    ): boolean {
        const offerRootItem = offer.items[0];
        /** Currency offer is sold for */
        const moneyTypeTpl = offer.requirements[0]._tpl;
        const isTraderOffer = offer.user.id in this.databaseService.getTraders();

        if (!isTraderOffer && playerIsFleaBanned) {
            return false;
        }

        // Offer root items tpl not in searched for array
        if (!itemsToAdd?.includes(offerRootItem._tpl)) {
            // skip items we shouldn't include
            return false;
        }

        // Performing a required search and offer doesn't have requirement for item
        if (
            searchRequest.neededSearchId &&
            !offer.requirements.some((requirement) => requirement._tpl === searchRequest.neededSearchId)
        ) {
            return false;
        }

        // Weapon/equipment search + offer is preset
        if (
            Object.keys(searchRequest.buildItems).length === 0 && // Prevent equipment loadout searches filtering out presets
            searchRequest.buildCount &&
            this.presetHelper.hasPreset(offerRootItem._tpl)
        ) {
            return false;
        }

        // commented out as required search "which is for checking offers that are barters"
        // has info.removeBartering as true, this if statement removed barter items.
        if (searchRequest.removeBartering && !this.paymentHelper.isMoneyTpl(moneyTypeTpl)) {
            // Don't include barter offers
            return false;
        }

        if (Number.isNaN(offer.requirementsCost)) {
            // Don't include offers with undefined or NaN in it
            return false;
        }

        // Handle trader items to remove items that are not available to the user right now
        // e.g. required search for "lamp" shows 4 items, 3 of which are not available to a new player
        // filter those out
        if (isTraderOffer) {
            if (!(offer.user.id in traderAssorts)) {
                // trader not visible on flea market
                return false;
            }

            if (
                !traderAssorts[offer.user.id].items.some((item) => {
                    return item._id === offer.root;
                })
            ) {
                // skip (quest) locked items
                return false;
            }
        }

        return true;
    }

    public isDisplayableOfferThatNeedsItem(searchRequest: ISearchRequestData, offer: IRagfairOffer): boolean {
        if (offer.requirements.some((requirement) => requirement._tpl === searchRequest.neededSearchId)) {
            return true;
        }

        return false;
    }

    /**
     * Does the passed in item have a condition property
     * @param item Item to check
     * @returns True if has condition
     */
    protected isConditionItem(item: IItem): boolean {
        // thanks typescript, undefined assertion is not returnable since it
        // tries to return a multitype object
        return !!(
            item.upd.MedKit ||
            item.upd.Repairable ||
            item.upd.Resource ||
            item.upd.FoodDrink ||
            item.upd.Key ||
            item.upd.RepairKit
        );
    }

    /**
     * Is items quality value within desired range
     * @param item Item to check quality of
     * @param min Desired minimum quality
     * @param max Desired maximum quality
     * @returns True if in range
     */
    protected itemQualityInRange(item: IItem, min: number, max: number): boolean {
        const itemQualityPercentage = 100 * this.itemHelper.getItemQualityModifier(item);
        if (min > 0 && min > itemQualityPercentage) {
            // Item condition too low
            return false;
        }

        if (max < 100 && max <= itemQualityPercentage) {
            // Item condition too high
            return false;
        }

        return true;
    }

    /**
     * Does this offer come from a trader
     * @param offer Offer to check
     * @returns True = from trader
     */
    public offerIsFromTrader(offer: IRagfairOffer) {
        return offer.user.memberType === MemberCategory.TRADER;
    }
}
