import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { RagfairOfferHelper } from "@spt/helpers/RagfairOfferHelper";
import { TradeHelper } from "@spt/helpers/TradeHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITraderBase } from "@spt/models/eft/common/tables/ITrader";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IRagfairOffer } from "@spt/models/eft/ragfair/IRagfairOffer";
import { IProcessBaseTradeRequestData } from "@spt/models/eft/trade/IProcessBaseTradeRequestData";
import { IProcessBuyTradeRequestData } from "@spt/models/eft/trade/IProcessBuyTradeRequestData";
import { IOfferRequest, IProcessRagfairTradeRequestData } from "@spt/models/eft/trade/IProcessRagfairTradeRequestData";
import { IProcessSellTradeRequestData } from "@spt/models/eft/trade/IProcessSellTradeRequestData";
import { ISellScavItemsToFenceRequestData } from "@spt/models/eft/trade/ISellScavItemsToFenceRequestData";
import { BackendErrorCodes } from "@spt/models/enums/BackendErrorCodes";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { MessageType } from "@spt/models/enums/MessageType";
import { Money } from "@spt/models/enums/Money";
import { Traders } from "@spt/models/enums/Traders";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { RagfairServer } from "@spt/servers/RagfairServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import { HashUtil } from "@spt/utils/HashUtil";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class TradeController {
    protected ragfairConfig: IRagfairConfig;
    protected traderConfig: ITraderConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("TradeHelper") protected tradeHelper: TradeHelper,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("RagfairOfferHelper") protected ragfairOfferHelper: RagfairOfferHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("RagfairServer") protected ragfairServer: RagfairServer,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /** Handle TradingConfirm event */
    public confirmTrading(
        pmcData: IPmcData,
        request: IProcessBaseTradeRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        // Buying
        if (request.type === "buy_from_trader") {
            const foundInRaid = this.traderConfig.purchasesAreFoundInRaid;
            const buyData = <IProcessBuyTradeRequestData>request;
            this.tradeHelper.buyItem(pmcData, buyData, sessionID, foundInRaid, output);

            return output;
        }

        // Selling
        if (request.type === "sell_to_trader") {
            const sellData = <IProcessSellTradeRequestData>request;
            this.tradeHelper.sellItem(pmcData, pmcData, sellData, sessionID, output);

            return output;
        }

        const errorMessage = `Unhandled trade event: ${request.type}`;
        this.logger.error(errorMessage);

        return this.httpResponse.appendErrorToOutput(output, errorMessage, BackendErrorCodes.RAGFAIRUNAVAILABLE);
    }

    /** Handle RagFairBuyOffer event */
    public confirmRagfairTrading(
        pmcData: IPmcData,
        request: IProcessRagfairTradeRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        for (const offer of request.offers) {
            const fleaOffer = this.ragfairServer.getOffer(offer.id);
            if (!fleaOffer) {
                return this.httpResponse.appendErrorToOutput(
                    output,
                    `Offer with ID ${offer.id} not found`,
                    BackendErrorCodes.OFFERNOTFOUND,
                );
            }

            if (offer.count === 0) {
                const errorMessage = this.localisationService.getText(
                    "ragfair-unable_to_purchase_0_count_item",
                    this.itemHelper.getItem(fleaOffer.items[0]._tpl)[1]._name,
                );
                return this.httpResponse.appendErrorToOutput(output, errorMessage, BackendErrorCodes.OFFEROUTOFSTOCK);
            }

            if (this.ragfairOfferHelper.offerIsFromTrader(fleaOffer)) {
                this.buyTraderItemFromRagfair(sessionID, pmcData, fleaOffer, offer, output);
            } else {
                this.buyPmcItemFromRagfair(sessionID, pmcData, fleaOffer, offer, output);
            }

            // Exit loop early if problem found
            if (output.warnings.length > 0) {
                return output;
            }
        }

        return output;
    }

    /**
     * Buy an item off the flea sold by a trader
     * @param sessionId Session id
     * @param pmcData Player profile
     * @param fleaOffer Offer being purchased
     * @param requestOffer request data from client
     * @param output Output to send back to client
     */
    protected buyTraderItemFromRagfair(
        sessionId: string,
        pmcData: IPmcData,
        fleaOffer: IRagfairOffer,
        requestOffer: IOfferRequest,
        output: IItemEventRouterResponse,
    ): void {
        // Skip buying items when player doesn't have needed loyalty
        if (this.playerLacksTraderLoyaltyLevelToBuyOffer(fleaOffer, pmcData)) {
            const errorMessage = `Unable to buy item: ${fleaOffer.items[0]._tpl} from trader: ${fleaOffer.user.id} as loyalty level too low, skipping`;
            this.logger.debug(errorMessage);

            this.httpResponse.appendErrorToOutput(output, errorMessage, BackendErrorCodes.RAGFAIRUNAVAILABLE);

            return;
        }

        const buyData: IProcessBuyTradeRequestData = {
            Action: "TradingConfirm",
            type: "buy_from_ragfair",
            tid: fleaOffer.user.id,
            item_id: fleaOffer.root,
            count: requestOffer.count,
            scheme_id: 0,
            scheme_items: requestOffer.items,
        };

        this.tradeHelper.buyItem(pmcData, buyData, sessionId, this.traderConfig.purchasesAreFoundInRaid, output);
    }

    /**
     * Buy an item off the flea sold by a PMC
     * @param sessionId Session id
     * @param pmcData Player profile
     * @param fleaOffer Offer being purchased
     * @param requestOffer Request data from client
     * @param output Output to send back to client
     */
    protected buyPmcItemFromRagfair(
        sessionId: string,
        pmcData: IPmcData,
        fleaOffer: IRagfairOffer,
        requestOffer: IOfferRequest,
        output: IItemEventRouterResponse,
    ): void {
        const buyData: IProcessBuyTradeRequestData = {
            Action: "TradingConfirm",
            type: "buy_from_ragfair",
            tid: "ragfair",
            item_id: fleaOffer._id, // Store ragfair offerId in buyRequestData.item_id
            count: requestOffer.count,
            scheme_id: 0,
            scheme_items: requestOffer.items,
        };

        // buyItem() must occur prior to removing the offer stack, otherwise item inside offer doesn't exist for confirmTrading() to use
        this.tradeHelper.buyItem(
            pmcData,
            buyData,
            sessionId,
            this.ragfairConfig.dynamic.purchasesAreFoundInRaid,
            output,
        );
        if (output.warnings.length > 0) {
            return;
        }

        // resolve when a profile buy another profile's offer
        const offerOwnerId = fleaOffer.user?.id;
        const offerBuyCount = requestOffer.count;

        const isPlayerOffer = this.isPlayerOffer(fleaOffer._id, fleaOffer.user?.id);
        if (isPlayerOffer) {
            // Complete selling the offer now its been purchased
            this.ragfairOfferHelper.completeOffer(offerOwnerId, fleaOffer, offerBuyCount);

            return;
        }

        // Remove/lower stack count of item purchased from PMC flea offer
        this.ragfairServer.removeOfferStack(fleaOffer._id, requestOffer.count);
    }

    /**
     * Is the provided offerid and ownerid from a player made offer
     * @param offerId Id of the offer
     * @param offerOwnerId Owner id
     * @returns true if offer was made by a player
     */
    protected isPlayerOffer(offerId: string, offerOwnerId: string): boolean {
        // No ownerid, not player offer
        if (!offerOwnerId) {
            return false;
        }

        const offerCreatorProfile = this.profileHelper.getPmcProfile(offerOwnerId);
        if (!offerCreatorProfile || offerCreatorProfile.RagfairInfo.offers?.length === 0) {
            // No profile or no offers
            return false;
        }

        // Does offer id exist in profile
        return offerCreatorProfile.RagfairInfo.offers.some((offer) => offer._id === offerId);
    }

    /**
     * Does Player have necessary trader loyalty to purchase flea offer
     * @param sellerIsTrader is seller trader
     * @param fleaOffer Flea offer being bought
     * @param pmcData Player profile
     * @returns True if player can buy offer
     */
    protected playerLacksTraderLoyaltyLevelToBuyOffer(fleaOffer: IRagfairOffer, pmcData: IPmcData): boolean {
        return fleaOffer.loyaltyLevel > pmcData.TradersInfo[fleaOffer.user.id].loyaltyLevel;
    }

    /** Handle SellAllFromSavage event */
    public sellScavItemsToFence(
        pmcData: IPmcData,
        request: ISellScavItemsToFenceRequestData,
        sessionId: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionId);

        this.mailMoneyToPlayer(sessionId, request.totalValue, Traders.FENCE);

        return output;
    }

    /**
     * Send the specified rouble total to player as mail
     * @param sessionId Session id
     * @param trader Trader to sell items to
     * @param output IItemEventRouterResponse
     */
    protected mailMoneyToPlayer(sessionId: string, roublesToSend: number, trader: Traders): void {
        this.logger.debug(`Selling scav items to fence for ${roublesToSend} roubles`);

        // Create single currency item with all currency on it
        const rootCurrencyReward = {
            _id: this.hashUtil.generate(),
            _tpl: Money.ROUBLES,
            upd: { StackObjectsCount: roublesToSend },
        };

        // Ensure money is properly split to follow its max stack size limit
        const curencyReward = this.itemHelper.splitStackIntoSeparateItems(rootCurrencyReward);

        // Send mail from trader
        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionId,
            this.traderHelper.getTraderById(trader),
            MessageType.MESSAGE_WITH_ITEMS,
            this.randomUtil.getArrayValue(this.databaseService.getTrader(trader).dialogue.soldItems),
            curencyReward.flat(),
            this.timeUtil.getHoursAsSeconds(72),
        );
    }

    /**
     * Looks up an items children and gets total handbook price for them
     * @param parentItemId parent item that has children we want to sum price of
     * @param items All items (parent + children)
     * @param handbookPrices Prices of items from handbook
     * @param traderDetails Trader being sold to to perform buy category check against
     * @returns Rouble price
     */
    protected getPriceOfItemAndChildren(
        parentItemId: string,
        items: IItem[],
        handbookPrices: Record<string, number>,
        traderDetails: ITraderBase,
    ): number {
        const itemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(items, parentItemId);

        let totalPrice = 0;
        for (const itemToSell of itemWithChildren) {
            const itemDetails = this.itemHelper.getItem(itemToSell._tpl);
            if (
                !(
                    itemDetails[0] &&
                    this.itemHelper.isOfBaseclasses(itemDetails[1]._id, traderDetails.items_buy.category)
                )
            ) {
                // Skip if tpl isn't item OR item doesn't fulfil match traders buy categories
                continue;
            }

            // Get price of item multiplied by how many are in stack
            totalPrice += (handbookPrices[itemToSell._tpl] ?? 0) * (itemToSell.upd?.StackObjectsCount ?? 1);
        }

        return totalPrice;
    }
}
