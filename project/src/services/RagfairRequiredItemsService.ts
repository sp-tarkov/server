import { inject, injectable } from "tsyringe";

import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";
import { IRagfairOffer } from "@spt-aki/models/eft/ragfair/IRagfairOffer";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { RagfairOfferService } from "@spt-aki/services/RagfairOfferService";

@injectable()
export class RagfairRequiredItemsService
{
    protected requiredItemsCache = {};

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
    )
    {}

    public getRequiredItemsById(searchId: string): IRagfairOffer[]
    {
        return Array.from(this.requiredItemsCache[searchId] ?? {}) || [];
    }

    public buildRequiredItemTable(): void
    {
        const requiredItems = {};
        const getRequiredItems = (id: string) =>
        {
            if (!(id in requiredItems))
            {
                requiredItems[id] = new Set();
            }

            return requiredItems[id];
        };

        for (const offer of this.ragfairOfferService.getOffers())
        {
            for (const requirement of offer.requirements)
            {
                if (this.paymentHelper.isMoneyTpl(requirement._tpl))
                {
                    // This would just be too noisy.
                    continue;
                }

                getRequiredItems(requirement._tpl).add(offer);
            }
        }

        this.requiredItemsCache = requiredItems;
    }
}
