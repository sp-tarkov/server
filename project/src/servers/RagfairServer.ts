import { RagfairOfferGenerator } from "@spt/generators/RagfairOfferGenerator";
import { TraderAssortHelper } from "@spt/helpers/TraderAssortHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IRagfairOffer } from "@spt/models/eft/ragfair/IRagfairOffer";
import { ISearchRequestData } from "@spt/models/eft/ragfair/ISearchRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Traders } from "@spt/models/enums/Traders";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RagfairCategoriesService } from "@spt/services/RagfairCategoriesService";
import { RagfairOfferService } from "@spt/services/RagfairOfferService";
import { RagfairRequiredItemsService } from "@spt/services/RagfairRequiredItemsService";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairServer {
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RagfairOfferGenerator") protected ragfairOfferGenerator: RagfairOfferGenerator,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
        @inject("RagfairCategoriesService") protected ragfairCategoriesService: RagfairCategoriesService,
        @inject("RagfairRequiredItemsService") protected ragfairRequiredItemsService: RagfairRequiredItemsService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("TraderAssortHelper") protected traderAssortHelper: TraderAssortHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    public async load(): Promise<void> {
        this.logger.info(this.localisationService.getText("ragfair-generating_offers"));
        await this.ragfairOfferGenerator.generateDynamicOffers();
        await this.update();
    }

    public async update(): Promise<void> {
        this.ragfairOfferService.expireStaleOffers();

        // Generate trader offers
        const traders = this.getUpdateableTraders();
        for (const traderId of traders) {
            // Skip generating fence offers
            if (traderId === Traders.FENCE) {
                continue;
            }

            if (this.ragfairOfferService.traderOffersNeedRefreshing(traderId)) {
                this.ragfairOfferGenerator.generateFleaOffersForTrader(traderId);
            }
        }

        // Regenerate expired offers when over threshold limit
        if (this.ragfairOfferService.getExpiredOfferCount() >= this.ragfairConfig.dynamic.expiredOfferThreshold) {
            const expiredAssortsWithChildren = this.ragfairOfferService.getExpiredOfferAssorts();
            await this.ragfairOfferGenerator.generateDynamicOffers(expiredAssortsWithChildren);

            // Clear out expired offers now we've generated them
            this.ragfairOfferService.resetExpiredOffers();
        }

        this.ragfairRequiredItemsService.buildRequiredItemTable();
    }

    /**
     * Get traders who need to be periodically refreshed
     * @returns string array of traders
     */
    public getUpdateableTraders(): string[] {
        return Object.keys(this.ragfairConfig.traders).filter((x) => this.ragfairConfig.traders[x]);
    }

    public getAllActiveCategories(
        fleaUnlocked: boolean,
        searchRequestData: ISearchRequestData,
        offers: IRagfairOffer[],
    ): Record<string, number> {
        return this.ragfairCategoriesService.getCategoriesFromOffers(offers, searchRequestData, fleaUnlocked);
    }

    /**
     * Disable/Hide an offer from flea
     * @param offerId
     */
    public hideOffer(offerId: string): void {
        const offers = this.ragfairOfferService.getOffers();
        const offer = offers.find((x) => x._id === offerId);

        if (!offer) {
            this.logger.error(this.localisationService.getText("ragfair-offer_not_found_unable_to_hide", offerId));

            return;
        }

        offer.locked = true;
    }

    public getOffer(offerID: string): IRagfairOffer {
        return this.ragfairOfferService.getOfferByOfferId(offerID);
    }

    public getOffers(): IRagfairOffer[] {
        return this.ragfairOfferService.getOffers();
    }

    public removeOfferStack(offerID: string, amount: number): void {
        this.ragfairOfferService.removeOfferStack(offerID, amount);
    }

    public doesOfferExist(offerId: string): boolean {
        return this.ragfairOfferService.doesOfferExist(offerId);
    }

    public addPlayerOffers(): void {
        this.ragfairOfferService.addPlayerOffers();
    }
}
