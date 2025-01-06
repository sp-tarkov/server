import { PaymentHelper } from "@spt/helpers/PaymentHelper";
import { IRagfairOffer } from "@spt/models/eft/ragfair/IRagfairOffer";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { RagfairOfferService } from "@spt/services/RagfairOfferService";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairRequiredItemsService {
    protected requiredItemsCache = {};

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
    ) {}

    public getRequiredItemsById(searchId: string): IRagfairOffer[] {
        return Array.from(this.requiredItemsCache[searchId] ?? {}) || [];
    }

    public buildRequiredItemTable(): void {
        const requiredItems = {};
        const getRequiredItems = (id: string) => {
            if (!(id in requiredItems)) {
                requiredItems[id] = new Set();
            }

            return requiredItems[id];
        };

        for (const offer of this.ragfairOfferService.getOffers()) {
            for (const requirement of offer.requirements) {
                if (this.paymentHelper.isMoneyTpl(requirement._tpl)) {
                    // This would just be too noisy.
                    continue;
                }

                getRequiredItems(requirement._tpl).add(offer);
            }
        }

        this.requiredItemsCache = requiredItems;
    }
}
