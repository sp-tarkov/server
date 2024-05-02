import { RagfairServerHelper } from "@spt-aki/helpers/RagfairServerHelper";
import { IRagfairOffer } from "@spt-aki/models/eft/ragfair/IRagfairOffer";

export class RagfairOfferHolder
{
    protected offersById: Map<string, IRagfairOffer>;
    protected offersByTemplate: Map<string, Map<string, IRagfairOffer>>;
    protected offersByTrader: Map<string, Map<string, IRagfairOffer>>;

    constructor(protected maxOffersPerTemplate: number, protected ragfairServerHelper: RagfairServerHelper)
    {
        this.offersById = new Map();
        this.offersByTemplate = new Map();
        this.offersByTrader = new Map();
    }

    public getOfferById(id: string): IRagfairOffer
    {
        if (this.offersById.has(id))
        {
            return this.offersById.get(id);
        }
        return undefined;
    }

    public getOffersByTemplate(templateId: string): Array<IRagfairOffer>
    {
        if (this.offersByTemplate.has(templateId))
        {
            return [...this.offersByTemplate.get(templateId).values()];
        }
        return undefined;
    }

    public getOffersByTrader(traderId: string): Array<IRagfairOffer>
    {
        if (this.offersByTrader.has(traderId))
        {
            return [...this.offersByTrader.get(traderId).values()];
        }
        return undefined;
    }

    public getOffers(): Array<IRagfairOffer>
    {
        if (this.offersById.size > 0)
        {
            return [...this.offersById.values()];
        }
        return [];
    }

    public addOffers(offers: Array<IRagfairOffer>): void
    {
        for (const offer of offers)
        {
            this.addOffer(offer);
        }
    }

    public addOffer(offer: IRagfairOffer): void
    {
        const trader = offer.user.id;
        const offerId = offer._id;
        const itemTpl = offer.items[0]._tpl;
        // If its an NPC PMC offer AND we have already reached the maximum amount of possible offers
        // for this template, just dont add in more
        if (
            !(this.ragfairServerHelper.isTrader(trader) || this.ragfairServerHelper.isPlayer(trader))
            && this.getOffersByTemplate(itemTpl)?.length >= this.maxOffersPerTemplate
        )
        {
            return;
        }
        this.offersById.set(offerId, offer);
        this.addOfferByTrader(trader, offer);
        this.addOfferByTemplates(itemTpl, offer);
    }

    /**
     * Purge offer from offer cache
     * @param offer Offer to remove
     */
    public removeOffer(offer: IRagfairOffer): void
    {
        if (this.offersById.has(offer._id))
        {
            this.offersById.delete(offer._id);
            const traderOffers = this.offersByTrader.get(offer.user.id);
            traderOffers.delete(offer._id);
            // This was causing a memory leak, we need to make sure that we remove
            // the user ID from the cached offers after they dont have anything else
            // on the flea placed. We regenerate the ID for the NPC users, making it
            // continously grow otherwise
            if (traderOffers.size === 0)
            {
                this.offersByTrader.delete(offer.user.id);
            }
            this.offersByTemplate.get(offer.items[0]._tpl).delete(offer._id);
        }
    }

    public removeOffers(offers: Array<IRagfairOffer>): void
    {
        for (const offer of offers)
        {
            this.removeOffer(offer);
        }
    }

    public removeAllOffersByTrader(traderId: string): void
    {
        if (this.offersByTrader.has(traderId))
        {
            this.removeOffers([...this.offersByTrader.get(traderId).values()]);
        }
    }

    /**
     * Get an array of stale offers that are still shown to player
     * @returns IRagfairOffer array
     */
    public getStaleOffers(time: number): Array<IRagfairOffer>
    {
        return this.getOffers().filter((o) => this.isStale(o, time));
    }

    protected addOfferByTemplates(template: string, offer: IRagfairOffer): void
    {
        if (this.offersByTemplate.has(template))
        {
            this.offersByTemplate.get(template).set(offer._id, offer);
        }
        else
        {
            const valueMapped = new Map<string, IRagfairOffer>();
            valueMapped.set(offer._id, offer);
            this.offersByTemplate.set(template, valueMapped);
        }
    }

    protected addOfferByTrader(trader: string, offer: IRagfairOffer): void
    {
        if (this.offersByTrader.has(trader))
        {
            this.offersByTrader.get(trader).set(offer._id, offer);
        }
        else
        {
            const valueMapped = new Map<string, IRagfairOffer>();
            valueMapped.set(offer._id, offer);
            this.offersByTrader.set(trader, valueMapped);
        }
    }

    protected isStale(offer: IRagfairOffer, time: number): boolean
    {
        return offer.endTime < time || offer.items[0].upd.StackObjectsCount < 1;
    }
}
