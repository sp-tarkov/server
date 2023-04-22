import { inject, injectable } from "tsyringe";

import { RagfairOfferGenerator } from "../generators/RagfairOfferGenerator";
import { HandbookHelper } from "../helpers/HandbookHelper";
import { InventoryHelper } from "../helpers/InventoryHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { PaymentHelper } from "../helpers/PaymentHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { RagfairHelper } from "../helpers/RagfairHelper";
import { RagfairOfferHelper } from "../helpers/RagfairOfferHelper";
import { RagfairSellHelper } from "../helpers/RagfairSellHelper";
import { RagfairSortHelper } from "../helpers/RagfairSortHelper";
import { RagfairTaxHelper } from "../helpers/RagfairTaxHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Item } from "../models/eft/common/tables/IItem";
import { IBarterScheme, ITraderAssort } from "../models/eft/common/tables/ITrader";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IAkiProfile } from "../models/eft/profile/IAkiProfile";
import { IAddOfferRequestData, Requirement } from "../models/eft/ragfair/IAddOfferRequestData";
import { IExtendOfferRequestData } from "../models/eft/ragfair/IExtendOfferRequestData";
import { IGetItemPriceResult } from "../models/eft/ragfair/IGetItemPriceResult";
import { IGetMarketPriceRequestData } from "../models/eft/ragfair/IGetMarketPriceRequestData";
import { IGetOffersResult } from "../models/eft/ragfair/IGetOffersResult";
import { IRagfairOffer } from "../models/eft/ragfair/IRagfairOffer";
import { ISearchRequestData } from "../models/eft/ragfair/ISearchRequestData";
import { IProcessBuyTradeRequestData } from "../models/eft/trade/IProcessBuyTradeRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MemberCategory } from "../models/enums/MemberCategory";
import { RagfairSort } from "../models/enums/RagfairSort";
import { IRagfairConfig } from "../models/spt/config/IRagfairConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { RagfairServer } from "../servers/RagfairServer";
import { SaveServer } from "../servers/SaveServer";
import { LocalisationService } from "../services/LocalisationService";
import { PaymentService } from "../services/PaymentService";
import { RagfairOfferService } from "../services/RagfairOfferService";
import { RagfairPriceService } from "../services/RagfairPriceService";
import { RagfairRequiredItemsService } from "../services/RagfairRequiredItemsService";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { TimeUtil } from "../utils/TimeUtil";

/**
 * Handle RagfairCallback events
 */
@injectable()
export class RagfairController
{
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("RagfairServer") protected ragfairServer: RagfairServer,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("RagfairSellHelper") protected ragfairSellHelper: RagfairSellHelper,
        @inject("RagfairTaxHelper") protected ragfairTaxHelper: RagfairTaxHelper,
        @inject("RagfairSortHelper") protected ragfairSortHelper: RagfairSortHelper,
        @inject("RagfairOfferHelper") protected ragfairOfferHelper: RagfairOfferHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("RagfairHelper") protected ragfairHelper: RagfairHelper,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
        @inject("RagfairRequiredItemsService") protected ragfairRequiredItemsService: RagfairRequiredItemsService,
        @inject("RagfairOfferGenerator") protected ragfairOfferGenerator: RagfairOfferGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    public getOffers(sessionID: string, searchRequest: ISearchRequestData): IGetOffersResult
    {
        const itemsToAdd = this.ragfairHelper.filterCategories(sessionID, searchRequest);
        const traderAssorts = this.ragfairHelper.getDisplayableAssorts(sessionID);
        const result: IGetOffersResult = {
            offers: [],
            offersCount: searchRequest.limit,
            selectedCategory: searchRequest.handbookId
        };

        const pmcProfile = this.profileHelper.getPmcProfile(sessionID);

        result.offers = this.getOffersForSearchType(searchRequest, itemsToAdd, traderAssorts, pmcProfile);
        result.categories = this.getSpecificCategories(searchRequest, result.offers);

        // Client requested "required search"
        if (searchRequest.neededSearchId)
        {
            this.addRequiredOffersToResult(searchRequest, traderAssorts, pmcProfile, result);
        }

        this.addIndexValueToOffers(result.offers);

        // Sort offers
        result.offers = this.ragfairSortHelper.sortOffers(result.offers, searchRequest.sortType, searchRequest.sortDirection);

        // Match offers with quests and lock unfinished quests
        const profile = this.profileHelper.getFullProfile(sessionID);
        for (const offer of result.offers)
        {
            if (offer.user.memberType === MemberCategory.TRADER)
            {
                // for the items, check the barter schemes. The method getDisplayableAssorts sets a flag sptQuestLocked to true if the quest
                // is not completed yet
                if (this.ragfairOfferHelper.traderOfferItemQuestLocked(offer, traderAssorts))
                {
                    offer.locked = true;
                }
                
                // Update offers BuyRestrictionCurrent/BuyRestrictionMax values
                this.setTraderOfferPurchaseLimits(offer, profile);
                this.setTraderOfferStackSize(offer);
            }
        }

        // Set categories count (needed for categories to show when choosing 'Linked search')
        this.ragfairHelper.countCategories(result);

        // Handle paging before returning results
        result.offersCount = result.offers.length;
        const start = searchRequest.page * searchRequest.limit;
        const end = Math.min(((searchRequest.page + 1) * searchRequest.limit), result.offers.length);
        result.offers = result.offers.slice(start, end);

        return result;
    }

    /**
     * Get offers for the client based on type of search being performed
     * @param searchRequest Client search request data
     * @param itemsToAdd 
     * @param traderAssorts Trader assorts
     * @param pmcProfile Player profile
     * @returns array of offers
     */
    protected getOffersForSearchType(searchRequest: ISearchRequestData, itemsToAdd: string[], traderAssorts: Record<string, ITraderAssort>, pmcProfile: IPmcData): IRagfairOffer[]
    {
        // Searching for items in preset menu
        if (searchRequest.buildCount)
        {
            return this.ragfairOfferHelper.getOffersForBuild(searchRequest, itemsToAdd, traderAssorts, pmcProfile);
        }

        // Searching for general items
        return this.ragfairOfferHelper.getValidOffers(searchRequest, itemsToAdd, traderAssorts, pmcProfile);
    }

    /**
     * Get categories for the type of search being performed, linked/required/all
     * @param searchRequest Client search request data
     * @param offers ragfair offers to get categories for
     * @returns record with tpls + counts
     */
    protected getSpecificCategories(searchRequest: ISearchRequestData, offers: IRagfairOffer[]): Record<string, number>
    {
        // Linked/required search categories
        if (this.isLinkedSearch(searchRequest) || this.isRequiredSearch(searchRequest))
        {
            return this.ragfairServer.getBespokeCategories(offers); 
        }

        // Get all categories
        if ((searchRequest.linkedSearchId === "" && searchRequest.neededSearchId === ""))
        {
            return this.ragfairServer.getAllCategories();
        }

        return {};
    }

    /**
     * Add Required offers to offers result
     * @param searchRequest Client search request data
     * @param assorts 
     * @param pmcProfile Player profile
     * @param result Result object being sent back to client
     */
    protected addRequiredOffersToResult(searchRequest: ISearchRequestData, assorts: Record<string, ITraderAssort>, pmcProfile: IPmcData, result: IGetOffersResult): void
    {
        const requiredOffers = this.ragfairRequiredItemsService.getRequiredItemsById(searchRequest.neededSearchId);
        for (const requiredOffer of requiredOffers)
        {
            if (this.ragfairOfferHelper.isDisplayableOffer(searchRequest, null, assorts, requiredOffer, pmcProfile))
            {
                result.offers.push(requiredOffer);
            }
        }
    }

    /**
     * Add index to all offers passed in (0-indexed)
     * @param offers Offers to add index value to
     */
    protected addIndexValueToOffers(offers: IRagfairOffer[]): void
    {
        let counter = 0;

        for (const offer of offers)
        {
            offer.intId = ++counter;
            offer.items[0].parentId = ""; //without this it causes error:  "Item deserialization error: No parent with id hideout found for item x"
        }
    }

    /**
     * Update a trader flea offer with buy restrictions stored in the traders assort
     * @param offer flea offer to update
     * @param profile full profile of player
     */
    protected setTraderOfferPurchaseLimits(offer: IRagfairOffer, profile: IAkiProfile): void
    {
        if (!profile.traderPurchases)
        {
            profile.traderPurchases = {};
        }

        // Does trader exist
        if (!profile.traderPurchases[offer.user.id])
        {
            profile.traderPurchases[offer.user.id] = {};
        }

        const traderAssorts = this.traderHelper.getTraderAssortsById(offer.user.id).items;
        const assortData = traderAssorts.find(x => x._id === offer._id);

        // Use value stored in profile, otherwise use value directly from in-memory trader assort data
        offer.buyRestrictionCurrent = profile.traderPurchases[offer.user.id][offer._id]
            ? profile.traderPurchases[offer.user.id][offer._id].count
            : assortData.upd.BuyRestrictionCurrent;

        offer.buyRestrictionMax = assortData.upd.BuyRestrictionMax;
    }

    /**
     * Adjust ragfair offer stack count to match same value as traders assort stack count
     * @param offer Flea offer to adjust
     */
    protected setTraderOfferStackSize(offer: IRagfairOffer): void
    {
        const firstItem = offer.items[0];
        const traderAssorts = this.traderHelper.getTraderAssortsById(offer.user.id).items;

        const assortPurchased = traderAssorts.find(x => x._id === offer._id);
        if (!assortPurchased)
        {
            this.logger.warning(`Flea offer ${offer._id} could not have its stack count adjusted to match trader ${offer.user.id} value`);
            return;
        }

        firstItem.upd.StackObjectsCount = assortPurchased.upd.StackObjectsCount;
    }

    protected isLinkedSearch(info: ISearchRequestData): boolean
    {
        return info.linkedSearchId !== "";
    }

    protected isRequiredSearch(info: ISearchRequestData): boolean
    {
        return info.neededSearchId !== "";
    }

    public update(): void
    {
        for (const sessionID in this.saveServer.getProfiles())
        {
            if (this.saveServer.getProfile(sessionID).characters.pmc.RagfairInfo !== undefined)
            {
                this.ragfairOfferHelper.processOffersOnProfile(sessionID);
            }
        }
    }

    /**
     * Called when creating an offer on flea, fills values in top right corner
     * @param getPriceRequest 
     * @returns min/avg/max values for an item based on flea offers available
     */
    public getItemMinAvgMaxFleaPriceValues(getPriceRequest: IGetMarketPriceRequestData): IGetItemPriceResult
    {
        // Get all items of tpl (sort by price)
        let offers = this.ragfairOfferService.getOffersOfType(getPriceRequest.templateId);

        // Offers exist for item, get averages of what's listed
        if (typeof(offers) === "object" && offers.length > 0)
        {
            offers = this.ragfairSortHelper.sortOffers(offers, RagfairSort.PRICE);
            const min = offers[0].requirementsCost; // Get first item from array as its pre-sorted
            const max = offers.at(-1).requirementsCost; // Get last item from array as its pre-sorted

            return {
                avg: (min + max) / 2,
                min: min,
                max: max
            };
        }
        else // No offers listed, get price from live ragfair price list prices.json
        {
            const templatesDb = this.databaseServer.getTables().templates;

            let tplPrice = templatesDb.prices[getPriceRequest.templateId];
            if (!tplPrice)
            {
                // No flea price, get handbook price
                tplPrice = this.handbookHelper.getTemplatePrice(getPriceRequest.templateId);
            }

            return {
                avg: tplPrice,
                min: tplPrice,
                max: tplPrice
            };
        }
    }

    /**
     * List item(s) on flea for sale
     * @param pmcData Player profile
     * @param offerRequest Flea list creatio offer
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public addPlayerOffer(pmcData: IPmcData, offerRequest: IAddOfferRequestData, sessionID: string): IItemEventRouterResponse
    {
        let output = this.eventOutputHolder.getOutput(sessionID);

        const validationMessage = "";
        if (!this.isValidPlayerOfferRequest(offerRequest, validationMessage))
        {
            return this.httpResponse.appendErrorToOutput(output, validationMessage);
        }

        // Get an array of items from player inventory to list on flea
        const getItemsFromInventoryErrorMessage = "";
        const itemsInInventoryToList = this.getItemsToListOnFleaFromInventory(pmcData, offerRequest.items, getItemsFromInventoryErrorMessage);
        if (!itemsInInventoryToList)
        {
            this.httpResponse.appendErrorToOutput(output, getItemsFromInventoryErrorMessage);
        }

        // Preparations are done, create the offer
        const requirementsPriceInRub = this.calculateRequirementsPriceInRub(offerRequest.requirements);
        const offer = this.createPlayerOffer(this.saveServer.getProfile(sessionID), offerRequest.requirements, this.ragfairHelper.mergeStackable(itemsInInventoryToList), offerRequest.sellInOnePiece, requirementsPriceInRub);
        const rootItem = offer.items[0];
        const qualityMultiplier = this.itemHelper.getItemQualityModifier(rootItem);
        const averageOfferPrice = this.ragfairPriceService.getFleaPriceForItem(rootItem._tpl) * rootItem.upd.StackObjectsCount * qualityMultiplier;
        const itemStackCount = (!offerRequest.sellInOnePiece) ? offer.items[0].upd.StackObjectsCount : 1;
        const singleOfferValue = averageOfferPrice / itemStackCount;
        let sellChance = this.ragfairConfig.sell.chance.base * qualityMultiplier;

        sellChance = this.ragfairSellHelper.calculateSellChance(sellChance, singleOfferValue, requirementsPriceInRub);
        offer.sellResult = this.ragfairSellHelper.rollForSale(sellChance, itemStackCount);

        // Subtract flea market fee from stash
        if (this.ragfairConfig.sell.fees)
        {
            const tax = this.ragfairTaxHelper.calculateTax(rootItem, pmcData, requirementsPriceInRub, itemStackCount, offerRequest.sellInOnePiece);

            const request: IProcessBuyTradeRequestData = {
                tid: "ragfair",
                Action: "TradingConfirm",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                scheme_items: [
                    {
                        id: this.paymentHelper.getCurrency("RUB"),
                        count: Math.round(tax)
                    }
                ],
                type: "",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                item_id: "",
                count: 0,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                scheme_id: 0
            };

            output = this.paymentService.payMoney(pmcData, request, sessionID, output);
            if (output.warnings.length > 0)
            {
                return this.httpResponse.appendErrorToOutput(output, this.localisationService.getText("ragfair-unable_to_pay_commission_fee"));
            }
        }

        this.saveServer.getProfile(sessionID).characters.pmc.RagfairInfo.offers.push(offer);
        output.profileChanges[sessionID].ragFairOffers.push(offer);

        // Remove items from inventory after creating offer
        for (const itemToRemove of offerRequest.items)
        {
            this.inventoryHelper.removeItem(pmcData, itemToRemove, sessionID, output);
        }

        return output;
    }

    /**
     * Is the item to be listed on the flea valid
     * @param offerRequest Client offer request
     * @param errorMessage message to show to player when offer is invalid
     * @returns Is offer valid
     */
    protected isValidPlayerOfferRequest(offerRequest: IAddOfferRequestData, errorMessage: string): boolean
    {
        if (!offerRequest?.items || offerRequest.items.length === 0)
        {
            errorMessage = this.localisationService.getText("ragfair-invalid_player_offer_request");
            this.logger.error(errorMessage);

            return false;
        }
    
        if (!offerRequest.requirements)
        {
            errorMessage = this.localisationService.getText("ragfair-unable_to_place_offer_with_no_requirements");
            this.logger.error(errorMessage);

            return false;
        }
    
        return true;
    }

    /**
     * Get the handbook price in roubles for the items being listed
     * @param requirements 
     * @returns Rouble price
     */
    protected calculateRequirementsPriceInRub(requirements: Requirement[]): number
    {
        let requirementsPriceInRub = 0;
        for (const item of requirements)
        {
            const requestedItemTpl = item._tpl;
    
            if (this.paymentHelper.isMoneyTpl(requestedItemTpl))
            {
                requirementsPriceInRub += this.handbookHelper.inRUB(item.count, requestedItemTpl);
            }
            else
            {
                requirementsPriceInRub += this.ragfairPriceService.getDynamicPriceForItem(requestedItemTpl) * item.count;
            }
        }
    
        return requirementsPriceInRub;
    }

    /**
     * Using item ids from flea offer request, find corrispnding items from player inventory and return as array
     * @param pmcData Player profile
     * @param itemIdsFromFleaOfferRequest Ids from request
     * @param errorMessage if item is not found, add error message to this parameter
     * @returns Array of items from player inventory
     */
    protected getItemsToListOnFleaFromInventory(pmcData: IPmcData, itemIdsFromFleaOfferRequest: string[], errorMessage: string): Item[]
    {
        const itemsToReturn = [];
        // Count how many items are being sold and multiply the requested amount accordingly
        for (const itemId of itemIdsFromFleaOfferRequest)
        {
            let item = pmcData.Inventory.items.find(i => i._id === itemId);
            if (!item)
            {
                errorMessage = this.localisationService.getText("ragfair-unable_to_find_item_in_inventory", {id: itemId});
                this.logger.error(errorMessage);

                return null;
            }

            item = this.itemHelper.fixItemStackCount(item);
            itemsToReturn.push(...this.itemHelper.findAndReturnChildrenAsItems(pmcData.Inventory.items, itemId));
        }

        if (!itemsToReturn?.length)
        {
            errorMessage = this.localisationService.getText("ragfair-unable_to_find_requested_items_in_inventory");
            this.logger.error(errorMessage);

            return null;
        }

        return itemsToReturn;
    }

    public createPlayerOffer(profile: IAkiProfile, requirements: Requirement[], items: Item[], sellInOnePiece: boolean, amountToSend: number): IRagfairOffer
    {
        const loyalLevel = 1;
        const formattedItems: Item[] = items.map(item =>
        {
            const isChild = items.find(it => it._id === item.parentId);

            return {
                _id: item._id,
                _tpl: item._tpl,
                parentId: (isChild) ? item.parentId : "hideout",
                slotId: (isChild) ? item.slotId : "hideout",
                upd: item.upd
            };
        });

        const formattedRequirements: IBarterScheme[] = requirements.map(item =>
        {
            return {
                _tpl: item._tpl,
                count: item.count,
                onlyFunctional: item.onlyFunctional
            };
        });

        return this.ragfairOfferGenerator.createFleaOffer(
            profile.characters.pmc.aid,
            this.timeUtil.getTimestamp(),
            formattedItems,
            formattedRequirements,
            loyalLevel,
            amountToSend,
            sellInOnePiece
        );
    }

    public getAllFleaPrices(): Record<string, number>
    {
        return this.ragfairPriceService.getAllFleaPrices();
    }

    public getStaticPrices(): Record<string, number>
    {
        return this.ragfairPriceService.getAllStaticPrices();
    }

    /*
     *  User requested removal of the offer, actually reduces the time to 71 seconds,
     *  allowing for the possibility of extending the auction before it's end time
     */
    public removeOffer(offerId: string, sessionID: string): IItemEventRouterResponse
    {
        const offers = this.saveServer.getProfile(sessionID).characters.pmc.RagfairInfo.offers;
        if (!offers)
        {
            this.logger.warning(`No offers found in profile ${sessionID}, unable to remove offer ${offerId}`);
        }

        const index = offers.findIndex(offer => offer._id === offerId);
        if (index === -1)
        {
            this.logger.warning(this.localisationService.getText("ragfair-offer_not_found_in_profile", {offerId: offerId}));
            return this.httpResponse.appendErrorToOutput(this.eventOutputHolder.getOutput(sessionID), this.localisationService.getText("ragfair-offer_not_found_in_profile_short"));
        }

        const differenceInSeconds = (offers[index].endTime - this.timeUtil.getTimestamp());
        if (differenceInSeconds > this.ragfairConfig.sell.expireSeconds)// expireSeconds Default is 71 seconds
        {
            const newEndTime = this.ragfairConfig.sell.expireSeconds + this.timeUtil.getTimestamp();
            offers[index].endTime = Math.round(newEndTime);
        }

        return this.eventOutputHolder.getOutput(sessionID);
    }

    public extendOffer(info: IExtendOfferRequestData, sessionID: string): IItemEventRouterResponse
    {
        let output = this.eventOutputHolder.getOutput(sessionID);
        const offers = this.saveServer.getProfile(sessionID).characters.pmc.RagfairInfo.offers;
        const index = offers.findIndex(offer => offer._id === info.offerId);
        const secondsToAdd = info.renewalTime * TimeUtil.oneHourAsSeconds;

        if (index === -1)
        {
            this.logger.warning(this.localisationService.getText("ragfair-offer_not_found_in_profile", {offerId: info.offerId}));
            return this.httpResponse.appendErrorToOutput(this.eventOutputHolder.getOutput(sessionID), this.localisationService.getText("ragfair-offer_not_found_in_profile_short"));
        }

        // MOD: Pay flea market fee
        if (this.ragfairConfig.sell.fees)
        {
            const count = offers[index].sellInOnePiece ? 1 : offers[index].items.reduce((sum, item) => sum += item.upd.StackObjectsCount, 0);
            const tax = this.ragfairTaxHelper.calculateTax(offers[index].items[0], this.profileHelper.getPmcProfile(sessionID), offers[index].requirementsCost, count, offers[index].sellInOnePiece);

            const request: IProcessBuyTradeRequestData = {
                tid: "ragfair",
                Action: "TradingConfirm",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                scheme_items: [
                    {
                        id: this.paymentHelper.getCurrency("RUB"),
                        count: Math.round(tax)
                    }
                ],
                type: "",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                item_id: "",
                count: 0,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                scheme_id: 0
            };

            output = this.paymentService.payMoney(this.saveServer.getProfile(sessionID).characters.pmc, request, sessionID, output);
            if (output.warnings.length > 0)
            {
                return this.httpResponse.appendErrorToOutput(output, this.localisationService.getText("ragfair-unable_to_pay_commission_fee"));
            }
        }

        offers[index].endTime += Math.round(secondsToAdd);

        return this.eventOutputHolder.getOutput(sessionID);
    }
}