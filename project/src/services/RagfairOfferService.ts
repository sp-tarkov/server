import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { RagfairServerHelper } from "@spt/helpers/RagfairServerHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IRagfairOffer } from "@spt/models/eft/ragfair/IRagfairOffer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { RagfairOfferHolder } from "@spt/utils/RagfairOfferHolder";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairOfferService {
    protected playerOffersLoaded = false;
    /** Offer id + offer object */
    protected expiredOffers: Record<string, IRagfairOffer> = {};

    protected ragfairConfig: IRagfairConfig;
    protected ragfairOfferHandler: RagfairOfferHolder;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.ragfairOfferHandler = new RagfairOfferHolder(
            this.ragfairConfig.dynamic.offerItemCount.max,
            ragfairServerHelper,
            profileHelper,
        );
    }

    /**
     * Get all offers
     * @returns IRagfairOffer array
     */
    public getOffers(): IRagfairOffer[] {
        return this.ragfairOfferHandler.getOffers();
    }

    public getOfferByOfferId(offerId: string): IRagfairOffer | undefined {
        return this.ragfairOfferHandler.getOfferById(offerId);
    }

    public getOffersOfType(templateId: string): IRagfairOffer[] | undefined {
        return this.ragfairOfferHandler.getOffersByTemplate(templateId);
    }

    public addOffer(offer: IRagfairOffer): void {
        this.ragfairOfferHandler.addOffer(offer);
    }

    public addOfferToExpired(staleOffer: IRagfairOffer): void {
        this.expiredOffers[staleOffer._id] = staleOffer;
    }

    /**
     * Get total count of current expired offers
     * @returns Number of expired offers
     */
    public getExpiredOfferCount(): number {
        return Object.keys(this.expiredOffers).length;
    }

    /**
     * Get an array of arrays of expired offer items + children
     * @returns Expired offer assorts
     */
    public getExpiredOfferAssorts(): IItem[][] {
        const expiredItems: IItem[][] = [];

        for (const expiredOfferId in this.expiredOffers) {
            const expiredOffer = this.expiredOffers[expiredOfferId];
            expiredItems.push(expiredOffer.items);
        }

        return expiredItems;
    }

    /**
     * Clear out internal expiredOffers dictionary of all items
     */
    public resetExpiredOffers(): void {
        this.expiredOffers = {};
    }

    /**
     * Does the offer exist on the ragfair
     * @param offerId offer id to check for
     * @returns offer exists - true
     */
    public doesOfferExist(offerId: string): boolean {
        return this.ragfairOfferHandler.getOfferById(offerId) !== undefined;
    }

    /**
     * Remove an offer from ragfair by offer id
     * @param offerId Offer id to remove
     */
    public removeOfferById(offerId: string): void {
        const offer = this.ragfairOfferHandler.getOfferById(offerId);
        if (!offer) {
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
    public removeOfferStack(offerId: string, amount: number): void {
        const offer = this.ragfairOfferHandler.getOfferById(offerId);
        if (offer) {
            offer.items[0].upd.StackObjectsCount -= amount;
            if (offer.items[0].upd.StackObjectsCount <= 0) {
                this.processStaleOffer(offer);
            }
        }
    }

    public removeAllOffersByTrader(traderId: string): void {
        this.ragfairOfferHandler.removeAllOffersByTrader(traderId);
    }

    /**
     * Do the trader offers on flea need to be refreshed
     * @param traderID Trader to check
     * @returns true if they do
     */
    public traderOffersNeedRefreshing(traderID: string): boolean {
        const trader = this.databaseService.getTrader(traderID);
        if (!trader || !trader.base) {
            this.logger.error(this.localisationService.getText("ragfair-trader_missing_base_file", traderID));

            return false;
        }

        // No value, occurs when first run, trader offers need to be added to flea
        if (typeof trader.base.refreshTraderRagfairOffers !== "boolean") {
            trader.base.refreshTraderRagfairOffers = true;
        }

        return trader.base.refreshTraderRagfairOffers;
    }

    public addPlayerOffers(): void {
        if (!this.playerOffersLoaded) {
            for (const sessionID in this.saveServer.getProfiles()) {
                const pmcData = this.saveServer.getProfile(sessionID).characters.pmc;

                if (pmcData.RagfairInfo === undefined || pmcData.RagfairInfo.offers === undefined) {
                    // Profile is wiped
                    continue;
                }

                this.ragfairOfferHandler.addOffers(pmcData.RagfairInfo.offers);
            }
            this.playerOffersLoaded = true;
        }
    }

    public expireStaleOffers(): void {
        const time = this.timeUtil.getTimestamp();
        for (const staleOffer of this.ragfairOfferHandler.getStaleOffers(time)) {
            this.processStaleOffer(staleOffer);
        }
    }

    /**
     * Remove stale offer from flea
     * @param staleOffer Stale offer to process
     */
    protected processStaleOffer(staleOffer: IRagfairOffer): void {
        const staleOfferUserId = staleOffer.user.id;
        const isTrader = this.ragfairServerHelper.isTrader(staleOfferUserId);
        const isPlayer = this.profileHelper.isPlayer(staleOfferUserId.replace(/^pmc/, ""));

        // Skip trader offers, managed by RagfairServer.update()
        if (isTrader) {
            return;
        }

        // Handle dynamic offer
        if (!(isTrader || isPlayer)) {
            // Dynamic offer
            this.addOfferToExpired(staleOffer);
        }

        // Handle player offer - items need returning/XP adjusting. Checking if offer has actually expired or not.
        if (isPlayer && staleOffer.endTime <= this.timeUtil.getTimestamp()) {
            this.returnPlayerOffer(staleOffer);
            return;
        }

        // Remove expired existing offer from global offers
        this.removeOfferById(staleOffer._id);
    }

    protected returnPlayerOffer(playerOffer: IRagfairOffer): void {
        const pmcId = String(playerOffer.user.id);
        const profile = this.profileHelper.getProfileByPmcId(pmcId);
        if (!profile) {
            this.logger.error(
                `Unable to return flea offer ${playerOffer._id} as the profile: ${pmcId} could not be found`,
            );

            return;
        }

        const offerinProfileIndex = profile.RagfairInfo.offers.findIndex((o) => o._id === playerOffer._id);
        if (offerinProfileIndex === -1) {
            this.logger.warning(
                this.localisationService.getText("ragfair-unable_to_find_offer_to_remove", playerOffer._id),
            );
            return;
        }

        // Reduce player ragfair rep
        profile.RagfairInfo.rating -= this.databaseService.getGlobals().config.RagFair.ratingDecreaseCount;
        profile.RagfairInfo.isRatingGrowing = false;

        const firstOfferItem = playerOffer.items[0];
        if (firstOfferItem.upd.StackObjectsCount > firstOfferItem.upd.OriginalStackObjectsCount) {
            playerOffer.items[0].upd.StackObjectsCount = firstOfferItem.upd.OriginalStackObjectsCount;
        }
        // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the data.
        delete playerOffer.items[0].upd.OriginalStackObjectsCount;
        // Remove player offer from flea
        this.ragfairOfferHandler.removeOffer(playerOffer);

        // Send failed offer items to player in mail
        const unstackedItems = this.unstackOfferItems(playerOffer.items);

        // Need to regenerate Ids to ensure returned item(s) have correct parent values
        const newParentId = this.hashUtil.generate();
        for (const item of unstackedItems) {
            // Refresh root items' parentIds
            if (item.parentId === "hideout") {
                item.parentId = newParentId;
            }
        }

        this.ragfairServerHelper.returnItems(profile.sessionId, unstackedItems);
        profile.RagfairInfo.offers.splice(offerinProfileIndex, 1);
    }

    /**
     * Flea offer items are stacked up often beyond the StackMaxSize limit
     * Un stack the items into an array of root items and their children
     * Will create new items equal to the
     * @param items Offer items to unstack
     * @returns Unstacked array of items
     */
    protected unstackOfferItems(items: IItem[]): IItem[] {
        const result: IItem[] = [];
        const rootItem = items[0];
        const itemDetails = this.itemHelper.getItem(rootItem._tpl);
        const itemMaxStackSize = itemDetails[1]._props.StackMaxSize ?? 1;

        const totalItemCount = rootItem.upd?.StackObjectsCount ?? 1;

        // Items within stack tolerance, return existing data - no changes needed
        if (totalItemCount <= itemMaxStackSize) {
            // Edge case - Ensure items stack count isnt < 1
            if (items[0]?.upd?.StackObjectsCount < 1) {
                items[0].upd.StackObjectsCount = 1;
            }

            return items;
        }

        // Single item with no children e.g. ammo, use existing de-stacking code
        if (items.length === 1) {
            return this.itemHelper.splitStack(rootItem);
        }

        // Item with children, needs special handling
        // Force new item to have stack size of 1
        for (let index = 0; index < totalItemCount; index++) {
            const itemAndChildrenClone = this.cloner.clone(items);

            // Ensure upd object exits
            itemAndChildrenClone[0].upd ||= {};

            // Force item to be singular
            itemAndChildrenClone[0].upd.StackObjectsCount = 1;

            // Ensure items IDs are unique to prevent collisions when added to player inventory
            const reparentedItemAndChildren = this.itemHelper.reparentItemAndChildren(
                itemAndChildrenClone[0],
                itemAndChildrenClone,
            );
            this.itemHelper.remapRootItemId(reparentedItemAndChildren);

            result.push(...reparentedItemAndChildren);
        }

        return result;
    }
}
