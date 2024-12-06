import { RagfairAssortGenerator } from "@spt/generators/RagfairAssortGenerator";
import { RagfairOfferGenerator } from "@spt/generators/RagfairOfferGenerator";
import { AssortHelper } from "@spt/helpers/AssortHelper";
import { PaymentHelper } from "@spt/helpers/PaymentHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITrader, ITraderAssort } from "@spt/models/eft/common/tables/ITrader";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Traders } from "@spt/models/enums/Traders";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { FenceService } from "@spt/services/FenceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { TraderAssortService } from "@spt/services/TraderAssortService";
import { TraderPurchasePersisterService } from "@spt/services/TraderPurchasePersisterService";
import { MathUtil } from "@spt/utils/MathUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class TraderAssortHelper {
    protected traderConfig: ITraderConfig;
    protected mergedQuestAssorts: Record<string, Record<string, string>> = { started: {}, success: {}, fail: {} };
    protected createdMergedQuestAssorts = false;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("AssortHelper") protected assortHelper: AssortHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("RagfairAssortGenerator") protected ragfairAssortGenerator: RagfairAssortGenerator,
        @inject("RagfairOfferGenerator") protected ragfairOfferGenerator: RagfairOfferGenerator,
        @inject("TraderAssortService") protected traderAssortService: TraderAssortService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("TraderPurchasePersisterService")
        protected traderPurchasePersisterService: TraderPurchasePersisterService,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /**
     * Get a traders assorts
     * Can be used for returning ragfair / fence assorts
     * Filter out assorts not unlocked due to level OR quest completion
     * @param sessionId session id
     * @param traderId traders id
     * @param showLockedAssorts Should assorts player hasn't unlocked be returned - default false
     * @returns a traders' assorts
     */
    public getAssort(sessionId: string, traderId: string, showLockedAssorts = false): ITraderAssort {
        const traderClone = this.cloner.clone(this.databaseService.getTrader(traderId));
        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        const pmcProfile = fullProfile.characters.pmc;

        if (traderId === Traders.FENCE) {
            return this.fenceService.getFenceAssorts(pmcProfile);
        }

        // Strip assorts player should not see yet
        if (!showLockedAssorts) {
            traderClone.assort = this.assortHelper.stripLockedLoyaltyAssort(pmcProfile, traderId, traderClone.assort);
        }

        this.resetBuyRestrictionCurrentValue(traderClone.assort.items);

        // Append nextResupply value to assorts so client knows when refresh is occuring
        traderClone.assort.nextResupply = traderClone.base.nextResupply;

        // Adjust displayed assort counts based on values stored in profile
        const assortPurchasesfromTrader = this.traderPurchasePersisterService.getProfileTraderPurchases(
            sessionId,
            traderId,
        );
        for (const assortId in assortPurchasesfromTrader) {
            // Find assort we want to update current buy count of
            const assortToAdjust = traderClone.assort.items.find((x) => x._id === assortId);
            if (!assortToAdjust) {
                this.logger.debug(
                    `Cannot find trader: ${traderClone.base.nickname} assort: ${assortId} to adjust BuyRestrictionCurrent value, skipping`,
                );

                continue;
            }

            if (!assortToAdjust.upd) {
                this.logger.debug(
                    `Unable to adjust assort ${assortToAdjust._id} item: ${assortToAdjust._tpl} BuyRestrictionCurrent value, assort has an undefined upd object`,
                );

                continue;
            }

            assortToAdjust.upd.BuyRestrictionCurrent = assortPurchasesfromTrader[assortId].count;
        }

        // Get rid of quest locked assorts
        if (!this.createdMergedQuestAssorts) {
            this.hydrateMergedQuestAssorts();
            this.createdMergedQuestAssorts = true;
        }
        traderClone.assort = this.assortHelper.stripLockedQuestAssort(
            pmcProfile,
            traderId,
            traderClone.assort,
            this.mergedQuestAssorts,
            showLockedAssorts,
        );

        // Filter out root assorts that are blacklisted for this profile
        if (fullProfile.spt.blacklistedItemTpls?.length > 0) {
            this.removeItemsFromAssort(traderClone.assort, fullProfile.spt.blacklistedItemTpls);
        }

        return traderClone.assort;
    }

    /**
     * Given the blacklist provided, remove root items from assort
     * @param assortToFilter Trader assort to modify
     * @param itemsTplsToRemove Item TPLs the assort should not have
     */
    protected removeItemsFromAssort(assortToFilter: ITraderAssort, itemsTplsToRemove: string[]): void {
        function isValid(item: IItem, blacklist: string[]): boolean {
            // Is root item + blacklisted
            if (item.parentId === "hideout" && blacklist.includes(item._tpl)) {
                // We want it gone
                return false;
            }

            return true;
        }

        assortToFilter.items = assortToFilter.items.filter((item) => isValid(item, itemsTplsToRemove));
    }

    /**
     * Reset every traders root item `BuyRestrictionCurrent` property to 0
     * @param assortItems Items to adjust
     */
    protected resetBuyRestrictionCurrentValue(assortItems: IItem[]): void {
        // iterate over root items
        for (const assort of assortItems.filter((item) => item.slotId === "hideout")) {
            // no value to adjust
            if (!assort.upd.BuyRestrictionCurrent) {
                continue;
            }

            assort.upd.BuyRestrictionCurrent = 0;
        }
    }

    /**
     * Create a dict of all assort id = quest id mappings used to work out what items should be shown to player based on the quests they've started/completed/failed
     */
    protected hydrateMergedQuestAssorts(): void {
        // Loop every trader
        const traders = this.databaseService.getTraders();
        for (const traderId in traders) {
            // Trader has quest assort data
            const trader = traders[traderId];
            if (trader.questassort) {
                // Started/Success/fail
                for (const questStatus in trader.questassort) {
                    // Each assort to quest id record
                    for (const assortId in trader.questassort[questStatus]) {
                        // Null guard
                        if (!this.mergedQuestAssorts[questStatus]) {
                            this.mergedQuestAssorts[questStatus] = {};
                        }

                        this.mergedQuestAssorts[questStatus][assortId] = trader.questassort[questStatus][assortId];
                    }
                }
            }
        }
    }

    /**
     * Reset a traders assorts and move nextResupply value to future
     * Flag trader as needing a flea offer reset to be picked up by flea update() function
     * @param trader trader details to alter
     */
    public resetExpiredTrader(trader: ITrader): void {
        trader.assort.items = this.getPristineTraderAssorts(trader.base._id);

        // Update resupply value to next timestamp
        trader.base.nextResupply = this.traderHelper.getNextUpdateTimestamp(trader.base._id);

        // Flag a refresh is needed so ragfair update() will pick it up
        trader.base.refreshTraderRagfairOffers = true;
    }

    /**
     * Does the supplied trader need its assorts refreshed
     * @param traderID Trader to check
     * @returns true they need refreshing
     */
    public traderAssortsHaveExpired(traderID: string): boolean {
        const time = this.timeUtil.getTimestamp();
        const trader = this.databaseService.getTables().traders[traderID];

        return trader.base.nextResupply <= time;
    }

    /**
     * Get an array of pristine trader items prior to any alteration by player (as they were on server start)
     * @param traderId trader id
     * @returns array of Items
     */
    protected getPristineTraderAssorts(traderId: string): IItem[] {
        return this.cloner.clone(this.traderAssortService.getPristineTraderAssort(traderId).items);
    }
}
