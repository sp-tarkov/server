import { inject, injectable } from "tsyringe";

import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";
import { IRagfairOffer } from "@spt-aki/models/eft/ragfair/IRagfairOffer";
import { ISearchRequestData, OfferOwnerType } from "@spt-aki/models/eft/ragfair/ISearchRequestData";
import { MemberCategory } from "@spt-aki/models/enums/MemberCategory";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";

@injectable()
export class RagfairCategoriesService
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
    )
    {}

    /**
     * Get a dictionary of each item the play can see in their flea menu, filtered by what is available for them to buy
     * @param offers All offers in flea
     * @param searchRequestData Search criteria requested
     * @param fleaUnlocked Can player see full flea yet (level 15 by default)
     * @returns KVP of item tpls + count of offers
     */
    public getCategoriesFromOffers(
        offers: IRagfairOffer[],
        searchRequestData: ISearchRequestData,
        fleaUnlocked: boolean,
    ): Record<string, number>
    {
        // Get offers valid for search request, then reduce them down to just the counts
        return offers.filter((offer) =>
        {
            const isTraderOffer = offer.user.memberType === MemberCategory.TRADER;

            // Not level 15 and offer is from player, skip
            if (!(fleaUnlocked || isTraderOffer))
            {
                return false;
            }

            // Remove items not for money when `removeBartering` is enabled
            if (
                searchRequestData.removeBartering
                && (offer.requirements.length > 1 || !this.paymentHelper.isMoneyTpl(offer.requirements[0]._tpl))
            )
            {
                return false;
            }

            // Remove when filter set to players only + offer is from trader
            if (searchRequestData.offerOwnerType === OfferOwnerType.PLAYEROWNERTYPE && isTraderOffer)
            {
                return false;
            }

            // Remove when filter set to traders only + offer is not from trader
            if (searchRequestData.offerOwnerType === OfferOwnerType.TRADEROWNERTYPE && !isTraderOffer)
            {
                return false;
            }

            // Passed checks, its a valid offer to process
            return true;
        }).reduce((acc, offer) =>
        {
            const itemTpl = offer.items[0]._tpl;
            // Increment the category or add if doesnt exist
            acc[itemTpl] = (acc[itemTpl] || 0) + 1;

            return acc;
        }, {});
    }
}
