import { inject, injectable } from "tsyringe";

import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { RagfairServerHelper } from "@spt-aki/helpers/RagfairServerHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IRagfairOffer } from "@spt-aki/models/eft/ragfair/IRagfairOffer";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { RagfairOfferHolder } from "@spt-aki/utils/RagfairOfferHolder";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class RagfairOfferService
{
    protected playerOffersLoaded = false;
    /** Offer id + offer object */
    protected expiredOffers: Record<string, IRagfairOffer> = {};

    protected ragfairConfig: IRagfairConfig;
    protected ragfairOfferHandler: RagfairOfferHolder = new RagfairOfferHolder();

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
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

    /**
     * Get total count of current expired offers
     * @returns Number of expired offers
     */
    public getExpiredOfferCount(): number
    {
        return Object.keys(this.expiredOffers).length;
    }

    /**
     * Get an array of arrays of expired offer items + children
     * @returns Expired offer assorts
     */
    public getExpiredOfferAssorts(): Item[][]
    {
        const expiredItems: Item[][] = [];

        for (const expiredOfferId in this.expiredOffers)
        {
            const expiredOffer = this.expiredOffers[expiredOfferId];
            expiredItems.push(expiredOffer.items);
        }

        return expiredItems;
    }

    /**
     * Clear out internal expiredOffers dictionary of all items
     */
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
            this.logger.warning(
                this.localisationService.getText("ragfair-unable_to_remove_offer_doesnt_exist", offerId),
            );

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
        this.ragfairOfferHandler.removeAllOffersByTrader(traderId);
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
        for (const staleOffer of this.ragfairOfferHandler.getStaleOffers(time))
        {
            this.processStaleOffer(staleOffer);
        }
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
            this.returnPlayerOffer(staleOffer);
            return;
        }

        // Remove expired existing offer from global offers
        this.removeOfferById(staleOffer._id);
    }

    protected returnPlayerOffer(playerOffer: IRagfairOffer): void
    {
        const pmcId = String(playerOffer.user.id);
        const profile = this.profileHelper.getProfileByPmcId(pmcId);

        const offerinProfileIndex = profile.RagfairInfo.offers.findIndex((o) => o._id === playerOffer._id);
        if (offerinProfileIndex === -1)
        {
            this.logger.warning(
                this.localisationService.getText("ragfair-unable_to_find_offer_to_remove", playerOffer._id),
            );
            return;
        }

        // Reduce player ragfair rep
        profile.RagfairInfo.rating -= this.databaseServer.getTables().globals.config.RagFair.ratingDecreaseCount;
        profile.RagfairInfo.isRatingGrowing = false;

        const firstOfferItem = playerOffer.items[0];
        if (firstOfferItem.upd.StackObjectsCount > firstOfferItem.upd.OriginalStackObjectsCount)
        {
            playerOffer.items[0].upd.StackObjectsCount = firstOfferItem.upd.OriginalStackObjectsCount;
        }
        delete playerOffer.items[0].upd.OriginalStackObjectsCount;
        // Remove player offer from flea
        this.ragfairOfferHandler.removeOffer(playerOffer);

        // Send failed offer items to player in mail
        this.ragfairServerHelper.returnItems(profile.sessionId, playerOffer.items);
        profile.RagfairInfo.offers.splice(offerinProfileIndex, 1);
    }
}
