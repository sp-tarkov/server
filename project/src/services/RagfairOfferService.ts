import { inject, injectable } from "tsyringe";

import { ProfileHelper } from "../helpers/ProfileHelper";
import { RagfairServerHelper } from "../helpers/RagfairServerHelper";
import { Item } from "../models/eft/common/tables/IItem";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IRagfairOffer } from "../models/eft/ragfair/IRagfairOffer";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { IRagfairConfig } from "../models/spt/config/IRagfairConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { RagfairOfferHolder } from "../utils/RagfairOfferHolder";
import { TimeUtil } from "../utils/TimeUtil";
import { LocalisationService } from "./LocalisationService";
import { RagfairCategoriesService } from "./RagfairCategoriesService";

@injectable()
export class RagfairOfferService
{
    protected playerOffersLoaded = false;
    protected expiredOffers: Record<string, IRagfairOffer> = {};

    protected ragfairConfig: IRagfairConfig;
    protected ragfairOfferHandler: RagfairOfferHolder = new RagfairOfferHolder();

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("RagfairCategoriesService") protected ragfairCategoriesService: RagfairCategoriesService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Get all offers
     * @returns IRagfairOffer array
     */
    public getOffers(): IRagfairOffer[]
    {
        return this.ragfairOfferHandler.getOffers();
    }

    public getOfferByOfferId(offerId: string): IRagfairOffer
    {
        return this.ragfairOfferHandler.getOfferById(offerId);
    }

    public getOffersOfType(templateId: string): IRagfairOffer[]
    {
        return this.ragfairOfferHandler.getOffersByTemplate(templateId);
    }

    public addOffer(offer: IRagfairOffer): void
    {
        this.ragfairOfferHandler.addOffer(offer);
    }

    public addOfferToExpired(staleOffer: IRagfairOffer): void
    {
        this.expiredOffers[staleOffer._id] = staleOffer;
    }

    public getExpiredOfferCount(): number
    {
        return Object.keys(this.expiredOffers).length;
    }

    /**
     * Get an array of expired items not yet processed into new offers
     * @returns items that need to be turned into offers
     */
    public getExpiredOfferItems(): Item[]
    {
        const expiredItems: Item[] = [];

        for (const expiredOfferId in this.expiredOffers)
        {
            expiredItems.push(this.expiredOffers[expiredOfferId].items[0]);
        }

        return expiredItems;
    }

    public resetExpiredOffers(): void
    {
        this.expiredOffers = {};
    }

    /**
     * Does the offer exist on the ragfair
     * @param offerId offer id to check for
     * @returns offer exists - true
     */
    public doesOfferExist(offerId: string): boolean
    {
        return this.ragfairOfferHandler.getOfferById(offerId) !== undefined;
    }

    /**
     * Remove an offer from ragfair by offer id
     * @param offerId Offer id to remove
     */
    public removeOfferById(offerId: string): void 
    {
        const offer = this.ragfairOfferHandler.getOfferById(offerId);
        if (!offer)
        {
            this.logger.warning(`Unable to remove offer with offer id: ${offerId} as it cannot be found in flea market`);

            return;
        }

        this.ragfairOfferHandler.removeOffer(offer);
    }

    /**
     * Reduce size of an offer stack by specified amount
     * @param offerId Offer to adjust stack size of
     * @param amount How much to deduct from offers stack size
     */
    public removeOfferStack(offerId: string, amount: number): void
    {
        const offer = this.ragfairOfferHandler.getOfferById(offerId);
        offer.items[0].upd.StackObjectsCount -= amount;
        if (offer.items[0].upd.StackObjectsCount <= 0)
        {
            this.processStaleOffer(offer);
        }
    }

    public removeAllOffersByTrader(traderId: string): void
    {
        this.ragfairOfferHandler.removeOfferByTrader(traderId);
    }

    /**
     * Do the trader offers on flea need to be refreshed
     * @param traderID Trader to check
     * @returns true if they do
     */
    public traderOffersNeedRefreshing(traderID: string): boolean
    {
        const trader = this.databaseServer.getTables().traders[traderID];

        // No value, occurs when first run, trader offers need to be added to flea
        if (typeof trader.base.refreshTraderRagfairOffers !== "boolean")
        {
            trader.base.refreshTraderRagfairOffers = true;
        }

        return trader.base.refreshTraderRagfairOffers;
    }

    public addPlayerOffers(): void
    {
        if (!this.playerOffersLoaded)
        {
            for (const sessionID in this.saveServer.getProfiles())
            {
                const pmcData = this.saveServer.getProfile(sessionID).characters.pmc;
                
                if (pmcData.RagfairInfo === undefined || pmcData.RagfairInfo.offers === undefined)
                {
                    // Profile is wiped
                    continue;
                }
                
                this.ragfairOfferHandler.addOffers(pmcData.RagfairInfo.offers);
            }
            this.playerOffersLoaded = true;
        }
    }

    public expireStaleOffers(): void
    {
        const time = this.timeUtil.getTimestamp();
        this.ragfairOfferHandler
            .getStaleOffers(time)
            .forEach(o => this.processStaleOffer(o));
    }

    /**
     * Remove stale offer from flea
     * @param staleOffer Stale offer to process
     */
    protected processStaleOffer(staleOffer: IRagfairOffer): void
    {
        const staleOfferUserId = staleOffer.user.id;
        const isTrader = this.ragfairServerHelper.isTrader(staleOfferUserId);
        const isPlayer = this.ragfairServerHelper.isPlayer(staleOfferUserId.replace(/^pmc/, ""));

        // Skip trader offers, managed by RagfairServer.update()
        if (isTrader)
        {
            return;
        }

        // Handle dynamic offer
        if (!(isTrader || isPlayer))
        {
            // Dynamic offer
            this.addOfferToExpired(staleOffer);
        }

        // Handle player offer - items need returning/XP adjusting. Checking if offer has actually expired or not.
        if (isPlayer && staleOffer.endTime <= this.timeUtil.getTimestamp())
        {
            // TODO: something feels wrong, func returns ItemEventRouterResponse but we dont pass it back to caller?
            this.returnPlayerOffer(staleOffer);
        }

        // Reduce category count by 1 as offer is now stale and about to be removed
        this.ragfairCategoriesService.decrementCategory(staleOffer);

        // Remove expired existing offer from global offers
        this.removeOfferById(staleOffer._id);
    }

    protected returnPlayerOffer(offer: IRagfairOffer): IItemEventRouterResponse
    {
        const pmcID = String(offer.user.id);
        const profile = this.profileHelper.getProfileByPmcId(pmcID);
        const sessionID = profile.aid;
        const offerIndex = profile.RagfairInfo.offers.findIndex(o => o._id === offer._id);

        profile.RagfairInfo.rating -= this.ragfairConfig.sell.reputation.loss;
        profile.RagfairInfo.isRatingGrowing = false;

        if (offerIndex === -1)
        {
            this.logger.warning(this.localisationService.getText("ragfair-unable_to_find_offer_to_remove", offer._id));
            return this.httpResponse.appendErrorToOutput(this.eventOutputHolder.getOutput(sessionID), this.localisationService.getText("ragfair-offer_not_found_in_profile_short"));
        }

        if (offer.items[0].upd.StackObjectsCount > offer.items[0].upd.OriginalStackObjectsCount)
        {
            offer.items[0].upd.StackObjectsCount = offer.items[0].upd.OriginalStackObjectsCount;
        }
        delete offer.items[0].upd.OriginalStackObjectsCount;

        this.ragfairServerHelper.returnItems(profile.aid, offer.items);
        profile.RagfairInfo.offers.splice(offerIndex, 1);

        return this.eventOutputHolder.getOutput(sessionID);
    }
}
