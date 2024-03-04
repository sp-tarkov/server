import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { RagfairHelper } from "@spt-aki/helpers/RagfairHelper";
import { RagfairServerHelper } from "@spt-aki/helpers/RagfairServerHelper";
import { RagfairSortHelper } from "@spt-aki/helpers/RagfairSortHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ITraderAssort } from "@spt-aki/models/eft/common/tables/ITrader";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IAkiProfile, ISystemData } from "@spt-aki/models/eft/profile/IAkiProfile";
import { IRagfairOffer } from "@spt-aki/models/eft/ragfair/IRagfairOffer";
import { ISearchRequestData, OfferOwnerType } from "@spt-aki/models/eft/ragfair/ISearchRequestData";
import { BaseClasses } from "@spt-aki/models/enums/BaseClasses";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { MemberCategory } from "@spt-aki/models/enums/MemberCategory";
import { MessageType } from "@spt-aki/models/enums/MessageType";
import { RagfairSort } from "@spt-aki/models/enums/RagfairSort";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IQuestConfig } from "@spt-aki/models/spt/config/IQuestConfig";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { LocaleService } from "@spt-aki/services/LocaleService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { MailSendService } from "@spt-aki/services/MailSendService";
import { RagfairOfferService } from "@spt-aki/services/RagfairOfferService";
import { RagfairRequiredItemsService } from "@spt-aki/services/RagfairRequiredItemsService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class RagfairOfferHelper
{
    protected static goodSoldTemplate = "5bdabfb886f7743e152e867e 0"; // Your {soldItem} {itemCount} items were bought by {buyerNickname}.
    protected ragfairConfig: IRagfairConfig;
    protected questConfig: IQuestConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("RagfairSortHelper") protected ragfairSortHelper: RagfairSortHelper,
        @inject("RagfairHelper") protected ragfairHelper: RagfairHelper,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
        @inject("RagfairRequiredItemsService") protected ragfairRequiredItemsService: RagfairRequiredItemsService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
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
    ): IRagfairOffer[]
    {
        return this.ragfairOfferService.getOffers().filter((offer) =>
        {
            if (!this.passesSearchFilterCriteria(searchRequest, offer, pmcData))
            {
                return false;
            }

            return this.isDisplayableOffer(searchRequest, itemsToAdd, traderAssorts, offer, pmcData);
        });
    }

    /**
     * Get matching offers that require the desired item and filter out offers from non traders if player is below ragfair unlock level
     * @param searchRequest Search request from client
     * @param pmcDataPlayer profile
     * @returns Matching IRagfairOffer objects
     */
    public getOffersThatRequireItem(searchRequest: ISearchRequestData, pmcData: IPmcData): IRagfairOffer[]
    {
        // Get all offers that requre the desired item and filter out offers from non traders if player below ragifar unlock
        const requiredOffers = this.ragfairRequiredItemsService.getRequiredItemsById(searchRequest.neededSearchId);
        return requiredOffers.filter((offer: IRagfairOffer) =>
        {
            if (!this.passesSearchFilterCriteria(searchRequest, offer, pmcData))
            {
                return false;
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
    ): IRagfairOffer[]
    {
        const offersMap = new Map<string, IRagfairOffer[]>();
        const offers: IRagfairOffer[] = [];
        for (const offer of this.ragfairOfferService.getOffers())
        {
            if (!this.passesSearchFilterCriteria(searchRequest, offer, pmcData))
            {
                continue;
            }

            if (this.isDisplayableOffer(searchRequest, itemsToAdd, traderAssorts, offer, pmcData))
            {
                const isTraderOffer = offer.user.memberType === MemberCategory.TRADER;

                if (isTraderOffer && this.traderBuyRestrictionReached(offer))
                {
                    continue;
                }

                if (isTraderOffer && this.traderOutOfStock(offer))
                {
                    continue;
                }

                if (isTraderOffer && this.traderOfferItemQuestLocked(offer, traderAssorts))
                {
                    continue;
                }

                if (isTraderOffer && this.traderOfferLockedBehindLoyaltyLevel(offer, pmcData))
                {
                    continue;
                }

                const key = offer.items[0]._tpl;
                if (!offersMap.has(key))
                {
                    offersMap.set(key, []);
                }

                offersMap.get(key).push(offer);
            }
        }

        // get best offer for each item to show on screen
        for (let possibleOffers of offersMap.values())
        {
            // Remove offers with locked = true (quest locked) when > 1 possible offers
            // single trader item = shows greyed out
            // multiple offers for item = is greyed out
            if (possibleOffers.length > 1)
            {
                const lockedOffers = this.getLoyaltyLockedOffers(possibleOffers, pmcData);

                // Exclude locked offers + above loyalty locked offers if at least 1 was found
                const availableOffers = possibleOffers.filter((x) => !(x.locked || lockedOffers.includes(x._id)));
                if (availableOffers.length > 0)
                {
                    possibleOffers = availableOffers;
                }
            }

            const offer = this.ragfairSortHelper.sortOffers(possibleOffers, RagfairSort.PRICE, 0)[0];
            offers.push(offer);
        }

        return offers;
    }

    /**
     * Check if offer is from trader standing the player does not have
     * @param offer Offer to check
     * @param pmcProfile Player profile
     * @returns True if item is locked, false if item is purchaseable
     */
    protected traderOfferLockedBehindLoyaltyLevel(offer: IRagfairOffer, pmcProfile: IPmcData): boolean
    {
        const userTraderSettings = pmcProfile.TradersInfo[offer.user.id];

        return userTraderSettings.loyaltyLevel < offer.loyaltyLevel;
    }

    /**
     * Check if offer item is quest locked for current player by looking at sptQuestLocked property in traders barter_scheme
     * @param offer Offer to check is quest locked
     * @param traderAssorts all trader assorts for player
     * @returns true if quest locked
     */
    public traderOfferItemQuestLocked(offer: IRagfairOffer, traderAssorts: Record<string, ITraderAssort>): boolean
    {
        return offer.items?.some((i) =>
            traderAssorts[offer.user.id].barter_scheme[i._id]?.some((bs1) => bs1?.some((bs2) => bs2.sptQuestLocked))
        );
    }

    /**
     * Has a traders offer ran out of stock to sell to player
     * @param offer Offer to check stock of
     * @returns true if out of stock
     */
    protected traderOutOfStock(offer: IRagfairOffer): boolean
    {
        if (offer?.items?.length === 0)
        {
            return true;
        }

        return offer.items[0]?.upd?.StackObjectsCount === 0;
    }

    /**
     * Check if trader offers' BuyRestrictionMax value has been reached
     * @param offer offer to check restriction properties of
     * @returns true if restriction reached, false if no restrictions/not reached
     */
    protected traderBuyRestrictionReached(offer: IRagfairOffer): boolean
    {
        const traderAssorts = this.traderHelper.getTraderAssortsByTraderId(offer.user.id).items;
        const assortData = traderAssorts.find((x) => x._id === offer.items[0]._id);

        // No trader assort data
        if (!assortData)
        {
            this.logger.warning(
                `Unable to find trader: ${offer.user.nickname} assort for item: ${
                    this.itemHelper.getItemName(offer.items[0]._tpl)
                } ${offer.items[0]._tpl}, cannot check if buy restriction reached`,
            );
            return false;
        }

        // No restriction values
        // Can't use !assortData.upd.BuyRestrictionX as value could be 0
        if (assortData.upd.BuyRestrictionMax === undefined || assortData.upd.BuyRestrictionCurrent === undefined)
        {
            return false;
        }

        // Current equals max, limit reached
        if (assortData?.upd.BuyRestrictionCurrent === assortData.upd.BuyRestrictionMax)
        {
            return true;
        }

        return false;
    }

    /**
     * Get an array of flea offers that are inaccessible to player due to their inadequate loyalty level
     * @param offers Offers to check
     * @param pmcProfile Players profile with trader loyalty levels
     * @returns array of offer ids player cannot see
     */
    protected getLoyaltyLockedOffers(offers: IRagfairOffer[], pmcProfile: IPmcData): string[]
    {
        const loyaltyLockedOffers: string[] = [];
        for (const offer of offers)
        {
            if (offer.user.memberType === MemberCategory.TRADER)
            {
                const traderDetails = pmcProfile.TradersInfo[offer.user.id];
                if (traderDetails.loyaltyLevel < offer.loyaltyLevel)
                {
                    loyaltyLockedOffers.push(offer._id);
                }
            }
        }

        return loyaltyLockedOffers;
    }

    /**
     * Process all player-listed flea offers for a desired profile
     * @param sessionID Session id to process offers for
     * @returns true = complete
     */
    public processOffersOnProfile(sessionID: string): boolean
    {
        const timestamp = this.timeUtil.getTimestamp();
        const profileOffers = this.getProfileOffers(sessionID);

        // No offers, don't do anything
        if (!profileOffers?.length)
        {
            return true;
        }

        for (const offer of profileOffers.values())
        {
            if (offer.sellResult && offer.sellResult.length > 0 && timestamp >= offer.sellResult[0].sellTime)
            {
                // Item sold
                let totalItemsCount = 1;
                let boughtAmount = 1;

                if (!offer.sellInOnePiece)
                {
                    totalItemsCount = offer.items.reduce((sum: number, item) => sum + item.upd.StackObjectsCount, 0);
                    boughtAmount = offer.sellResult[0].amount;
                }

                this.increaseProfileRagfairRating(
                    this.saveServer.getProfile(sessionID),
                    offer.summaryCost / totalItemsCount * boughtAmount,
                );

                this.completeOffer(sessionID, offer, boughtAmount);
                offer.sellResult.splice(0, 1);
            }
        }

        return true;
    }

    /**
     * Add amount to players ragfair rating
     * @param sessionId Profile to update
     * @param amountToIncrementBy Raw amount to add to players ragfair rating (excluding the reputation gain multiplier)
     */
    public increaseProfileRagfairRating(profile: IAkiProfile, amountToIncrementBy: number): void
    {
        const ragfairConfig = this.databaseServer.getTables().globals.config.RagFair;

        profile.characters.pmc.RagfairInfo.isRatingGrowing = true;
        if (Number.isNaN(amountToIncrementBy))
        {
            this.logger.warning(`Unable to increment ragfair rating, value was not a number: ${amountToIncrementBy}`);

            return;
        }
        profile.characters.pmc.RagfairInfo.rating +=
            (ragfairConfig.ratingIncreaseCount / ragfairConfig.ratingSumForIncrease) * amountToIncrementBy;
    }

    /**
     * Return all offers a player has listed on a desired profile
     * @param sessionID Session id
     * @returns Array of ragfair offers
     */
    protected getProfileOffers(sessionID: string): IRagfairOffer[]
    {
        const profile = this.profileHelper.getPmcProfile(sessionID);

        if (profile.RagfairInfo === undefined || profile.RagfairInfo.offers === undefined)
        {
            return [];
        }

        return profile.RagfairInfo.offers;
    }

    /**
     * Delete an offer from a desired profile and from ragfair offers
     * @param sessionID Session id of profile to delete offer from
     * @param offerId Id of offer to delete
     */
    protected deleteOfferById(sessionID: string, offerId: string): void
    {
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
    protected completeOffer(sessionID: string, offer: IRagfairOffer, boughtAmount: number): IItemEventRouterResponse
    {
        const itemTpl = offer.items[0]._tpl;
        let itemsToSend = [];
        const offerStackCount = offer.items[0].upd.StackObjectsCount;

        if (offer.sellInOnePiece || boughtAmount === offerStackCount)
        {
            this.deleteOfferById(sessionID, offer._id);
        }
        else
        {
            offer.items[0].upd.StackObjectsCount -= boughtAmount;
            const rootItems = offer.items.filter((i) => i.parentId === "hideout");
            rootItems.splice(0, 1);

            let removeCount = boughtAmount;
            let idsToRemove: string[] = [];

            while (removeCount > 0 && rootItems.length > 0)
            {
                const lastItem = rootItems[rootItems.length - 1];

                if (lastItem.upd.StackObjectsCount > removeCount)
                {
                    lastItem.upd.StackObjectsCount -= removeCount;
                    removeCount = 0;
                }
                else
                {
                    removeCount -= lastItem.upd.StackObjectsCount;
                    idsToRemove.push(lastItem._id);
                    rootItems.splice(rootItems.length - 1, 1);
                }
            }

            let foundNewItems = true;
            while (foundNewItems)
            {
                foundNewItems = false;

                for (const id of idsToRemove)
                {
                    const newIds = offer.items.filter((i) =>
                        !idsToRemove.includes(i._id) && idsToRemove.includes(i.parentId)
                    ).map((i) => i._id);
                    if (newIds.length > 0)
                    {
                        foundNewItems = true;
                        idsToRemove = [...idsToRemove, ...newIds];
                    }
                }
            }

            if (idsToRemove.length > 0)
            {
                offer.items = offer.items.filter((i) => !idsToRemove.includes(i._id));
            }
        }

        // Assemble the payment item(s)
        for (const requirement of offer.requirements)
        {
            // Create an item template item
            const requestedItem: Item = {
                _id: this.hashUtil.generate(),
                _tpl: requirement._tpl,
                upd: { StackObjectsCount: requirement.count * boughtAmount },
            };

            const stacks = this.itemHelper.splitStack(requestedItem);
            for (const item of stacks)
            {
                const outItems = [item];

                // TODO - is this code used?, may have been when adding barters to flea was still possible for player
                if (requirement.onlyFunctional)
                {
                    const presetItems = this.ragfairServerHelper.getPresetItemsByTpl(item);
                    if (presetItems.length)
                    {
                        outItems.push(presetItems[0]);
                    }
                }

                itemsToSend = [...itemsToSend, ...outItems];
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
            itemsToSend,
            this.timeUtil.getHoursAsSeconds(this.questConfig.redeemTime),
            null,
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
    protected getLocalisedOfferSoldMessage(itemTpl: string, boughtAmount: number): string
    {
        // Generate a message to inform that item was sold
        const globalLocales = this.localeService.getLocaleDb();
        const soldMessageLocaleGuid = globalLocales[RagfairOfferHelper.goodSoldTemplate];
        if (!soldMessageLocaleGuid)
        {
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
            buyerNickname: this.ragfairServerHelper.getNickname(this.hashUtil.generate()),
            itemCount: boughtAmount,
        };

        const offerSoldMessageText = soldMessageLocaleGuid.replace(/{\w+}/g, (matched) =>
        {
            return tplVars[matched.replace(/{|}/g, "")];
        });

        return offerSoldMessageText.replace(/"/g, "");
    }

    /**
     * Check an offer passes the various search criteria the player requested
     * @param searchRequest
     * @param offer
     * @param pmcData
     * @returns True
     */
    protected passesSearchFilterCriteria(
        searchRequest: ISearchRequestData,
        offer: IRagfairOffer,
        pmcData: IPmcData,
    ): boolean
    {
        const isDefaultUserOffer = offer.user.memberType === MemberCategory.DEFAULT;
        const offerRootItem = offer.items[0];
        const moneyTypeTpl = offer.requirements[0]._tpl;
        const isTraderOffer = offer.user.memberType === MemberCategory.TRADER;

        if (
            pmcData.Info.Level < this.databaseServer.getTables().globals.config.RagFair.minUserLevel
            && isDefaultUserOffer
        )
        {
            // Skip item if player is < global unlock level (default is 15) and item is from a dynamically generated source
            return false;
        }

        if (searchRequest.offerOwnerType === OfferOwnerType.TRADEROWNERTYPE && !isTraderOffer)
        {
            // don't include player offers
            return false;
        }

        if (searchRequest.offerOwnerType === OfferOwnerType.PLAYEROWNERTYPE && isTraderOffer)
        {
            // don't include trader offers
            return false;
        }

        if (
            searchRequest.oneHourExpiration
            && offer.endTime - this.timeUtil.getTimestamp() > TimeUtil.ONE_HOUR_AS_SECONDS
        )
        {
            // offer doesnt expire within an hour
            return false;
        }

        if (searchRequest.quantityFrom > 0 && searchRequest.quantityFrom >= offerRootItem.upd.StackObjectsCount)
        {
            // too little items to offer
            return false;
        }

        if (searchRequest.quantityTo > 0 && searchRequest.quantityTo <= offerRootItem.upd.StackObjectsCount)
        {
            // too many items to offer
            return false;
        }

        if (searchRequest.onlyFunctional && !this.isItemFunctional(offerRootItem, offer))
        {
            // don't include non-functional items
            return false;
        }

        if (offer.items.length === 1)
        {
            // Single item
            if (
                this.isConditionItem(offerRootItem)
                && !this.itemQualityInRange(offerRootItem, searchRequest.conditionFrom, searchRequest.conditionTo)
            )
            {
                return false;
            }
        }
        else
        {
            const itemQualityPercent = this.itemHelper.getItemQualityModifierForOfferItems(offer.items) * 100;
            if (itemQualityPercent < searchRequest.conditionFrom)
            {
                return false;
            }

            if (itemQualityPercent > searchRequest.conditionTo)
            {
                return false;
            }
        }

        if (searchRequest.currency > 0 && this.paymentHelper.isMoneyTpl(moneyTypeTpl))
        {
            const currencies = ["all", "RUB", "USD", "EUR"];

            if (this.ragfairHelper.getCurrencyTag(moneyTypeTpl) !== currencies[searchRequest.currency])
            {
                // don't include item paid in wrong currency
                return false;
            }
        }

        if (searchRequest.priceFrom > 0 && searchRequest.priceFrom >= offer.requirementsCost)
        {
            // price is too low
            return false;
        }

        if (searchRequest.priceTo > 0 && searchRequest.priceTo <= offer.requirementsCost)
        {
            // price is too high
            return false;
        }

        // Passes above checks, search criteria filters have not filtered offer out
        return true;
    }

    /**
     * Check that the passed in offer item is functional
     * @param offerRootItem The root item of the offer
     * @param offer The flea offer
     * @returns True if the given item is functional
     */
    public isItemFunctional(offerRootItem: Item, offer: IRagfairOffer): boolean
    {
        // Non-presets are always functional
        if (!this.presetHelper.hasPreset(offerRootItem._tpl))
        {
            return true;
        }

        // For armor items that can hold mods, make sure the item count is atleast the amount of required plates
        if (this.itemHelper.armorItemCanHoldMods(offerRootItem._tpl))
        {
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
     * @param traderAssorts Trader assort items
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
    ): boolean
    {
        const offerRootItem = offer.items[0];
        /** Currency offer is sold for */
        const moneyTypeTpl = offer.requirements[0]._tpl;

        // Offer root items tpl not in searched for array
        if (!itemsToAdd?.includes(offerRootItem._tpl))
        {
            // skip items we shouldn't include
            return false;
        }

        // Performing a required search and offer doesn't have requirement for item
        if (
            searchRequest.neededSearchId
            && !offer.requirements.some((requirement) => requirement._tpl === searchRequest.neededSearchId)
        )
        {
            return false;
        }

        // Weapon/equipment search + offer is preset
        if (
            Object.keys(searchRequest.buildItems).length === 0 // Prevent equipment loadout searches filtering out presets
            && searchRequest.buildCount
            && this.presetHelper.hasPreset(offerRootItem._tpl)
        )
        {
            return false;
        }

        // commented out as required search "which is for checking offers that are barters"
        // has info.removeBartering as true, this if statement removed barter items.
        if (searchRequest.removeBartering && !this.paymentHelper.isMoneyTpl(moneyTypeTpl))
        {
            // don't include barter offers
            return false;
        }

        if (Number.isNaN(offer.requirementsCost))
        {
            // don't include offers with null or NaN in it
            return false;
        }

        // handle trader items to remove items that are not available to the user right now
        // required search for "lamp" shows 4 items, 3 of which are not available to a new player
        // filter those out
        if (offer.user.id in this.databaseServer.getTables().traders)
        {
            if (!(offer.user.id in traderAssorts))
            {
                // trader not visible on flea market
                return false;
            }

            if (
                !traderAssorts[offer.user.id].items.find((item) =>
                {
                    return item._id === offer.root;
                })
            )
            {
                // skip (quest) locked items
                return false;
            }
        }

        return true;
    }

    public isDisplayableOfferThatNeedsItem(searchRequest: ISearchRequestData, offer: IRagfairOffer): boolean
    {
        if (offer.requirements.some((requirement) => requirement._tpl === searchRequest.neededSearchId))
        {
            return true;
        }

        return false;
    }

    /**
     * Does the passed in item have a condition property
     * @param item Item to check
     * @returns True if has condition
     */
    protected isConditionItem(item: Item): boolean
    {
        // thanks typescript, undefined assertion is not returnable since it
        // tries to return a multitype object
        return (item.upd.MedKit || item.upd.Repairable || item.upd.Resource || item.upd.FoodDrink || item.upd.Key
                || item.upd.RepairKit)
            ? true
            : false;
    }

    /**
     * Is items quality value within desired range
     * @param item Item to check quality of
     * @param min Desired minimum quality
     * @param max Desired maximum quality
     * @returns True if in range
     */
    protected itemQualityInRange(item: Item, min: number, max: number): boolean
    {
        const itemQualityPercentage = 100 * this.itemHelper.getItemQualityModifier(item);
        if (min > 0 && min > itemQualityPercentage)
        {
            // Item condition too low
            return false;
        }

        if (max < 100 && max <= itemQualityPercentage)
        {
            // Item condition too high
            return false;
        }

        return true;
    }
}
