import { IRagfairOffer } from "@spt/models/eft/ragfair/IRagfairOffer";
import { Money } from "@spt/models/enums/Money";
import { RagfairSort } from "@spt/models/enums/RagfairSort";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { LocaleService } from "@spt/services/LocaleService";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairSortHelper {
    constructor(
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocaleService") protected localeService: LocaleService,
    ) {}

    /**
     * Sort a list of ragfair offers by something (id/rating/offer name/price/expiry time)
     * @param offers Offers to sort
     * @param type How to sort it
     * @param direction Ascending/descending
     * @returns Sorted offers
     */
    public sortOffers(offers: IRagfairOffer[], type: RagfairSort, direction = 0): IRagfairOffer[] {
        // Sort results
        switch (type) {
            case RagfairSort.ID:
                offers.sort(this.sortOffersByID);
                break;

            case RagfairSort.BARTER:
                offers.sort(this.sortOffersByBarter);
                break;

            case RagfairSort.RATING:
                offers.sort(this.sortOffersByRating);
                break;

            case RagfairSort.OFFER_TITLE:
                offers.sort((a, b) => this.sortOffersByName(a, b));
                break;

            case RagfairSort.PRICE:
                offers.sort(this.sortOffersByPrice);
                break;

            case RagfairSort.EXPIRY:
                offers.sort(this.sortOffersByExpiry);
                break;
        }

        // 0=ASC 1=DESC
        if (direction === 1) {
            offers.reverse();
        }

        return offers;
    }

    protected sortOffersByID(a: IRagfairOffer, b: IRagfairOffer): number {
        return a.intId - b.intId;
    }

    protected sortOffersByBarter(a: IRagfairOffer, b: IRagfairOffer): number {
        const moneyTpls = Object.values<string>(Money);
        const aIsOnlyMoney = a.requirements.length === 1 && moneyTpls.includes(a.requirements[0]._tpl) ? 1 : 0;
        const bIsOnlyMoney = b.requirements.length === 1 && moneyTpls.includes(b.requirements[0]._tpl) ? 1 : 0;
        return aIsOnlyMoney - bIsOnlyMoney;
    }

    protected sortOffersByRating(a: IRagfairOffer, b: IRagfairOffer): number {
        return a.user.rating - b.user.rating;
    }

    protected sortOffersByName(a: IRagfairOffer, b: IRagfairOffer): number {
        const locale = this.localeService.getLocaleDb();

        const tplA = a.items[0]._tpl;
        const tplB = b.items[0]._tpl;
        const nameA = locale[`${tplA} Name`] || tplA;
        const nameB = locale[`${tplB} Name`] || tplB;

        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    }

    /**
     * Order two offers by rouble price value
     * @param a Offer a
     * @param b Offer b
     * @returns
     */
    protected sortOffersByPrice(a: IRagfairOffer, b: IRagfairOffer): number {
        return a.requirementsCost - b.requirementsCost;
    }

    protected sortOffersByExpiry(a: IRagfairOffer, b: IRagfairOffer): number {
        return a.endTime - b.endTime;
    }
}
