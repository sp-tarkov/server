import { inject, injectable } from "tsyringe";

import { PaymentHelper } from "../helpers/PaymentHelper";
import { RagfairOfferService } from "../services/RagfairOfferService";
import { ILogger } from "../models/spt/utils/ILogger";

@injectable()
export class RagfairRequiredItemsService
{
    protected requiredItemsCache = {};

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService
    )
    { }

    public getRequiredItemsById(searchId: string): any
    {
        return this.requiredItemsCache[searchId] || [];
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