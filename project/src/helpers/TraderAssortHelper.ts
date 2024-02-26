import { inject, injectable } from "tsyringe";

import { RagfairAssortGenerator } from "@spt-aki/generators/RagfairAssortGenerator";
import { RagfairOfferGenerator } from "@spt-aki/generators/RagfairOfferGenerator";
import { AssortHelper } from "@spt-aki/helpers/AssortHelper";
import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { ITrader, ITraderAssort } from "@spt-aki/models/eft/common/tables/ITrader";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Traders } from "@spt-aki/models/enums/Traders";
import { ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { FenceService } from "@spt-aki/services/FenceService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { TraderAssortService } from "@spt-aki/services/TraderAssortService";
import { TraderPurchasePersisterService } from "@spt-aki/services/TraderPurchasePersisterService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { MathUtil } from "@spt-aki/utils/MathUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class TraderAssortHelper
{
    protected traderConfig: ITraderConfig;
    protected mergedQuestAssorts: Record<string, Record<string, string>> = { started: {}, success: {}, fail: {} };
    protected createdMergedQuestAssorts = false;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("AssortHelper") protected assortHelper: AssortHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("RagfairAssortGenerator") protected ragfairAssortGenerator: RagfairAssortGenerator,
        @inject("RagfairOfferGenerator") protected ragfairOfferGenerator: RagfairOfferGenerator,
        @inject("TraderAssortService") protected traderAssortService: TraderAssortService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("TraderPurchasePersisterService") protected traderPurchasePersisterService:
            TraderPurchasePersisterService,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /**
     * Get a traders assorts
     * Can be used for returning ragfair / fence assorts
     * Filter out assorts not unlocked due to level OR quest completion
     * @param sessionId session id
     * @param traderId traders id
     * @param flea Should assorts player hasn't unlocked be returned - default false
     * @returns a traders' assorts
     */
    public getAssort(sessionId: string, traderId: string, flea = false): ITraderAssort
    {
        // Special case for getting ragfair items as they're dynamically generated
        if (traderId === "ragfair")
        {
            return this.getRagfairDataAsTraderAssort();
        }

        const traderClone = this.jsonUtil.clone(this.databaseServer.getTables().traders[traderId]);
        const pmcProfile = this.profileHelper.getPmcProfile(sessionId);

        if (traderId === Traders.FENCE)
        {
            return this.fenceService.getFenceAssorts(pmcProfile);
        }

        // Strip assorts player should not see yet
        if (!flea)
        {
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
        for (const assortId in assortPurchasesfromTrader)
        {
            // Find assort we want to update current buy count of
            const assortToAdjust = traderClone.assort.items.find((x) => x._id === assortId);
            if (!assortToAdjust)
            {
                this.logger.debug(
                    `Cannot find trader: ${traderClone.base.nickname} assort: ${assortId} to adjust BuyRestrictionCurrent value, skipping`,
                );

                continue;
            }

            if (!assortToAdjust.upd)
            {
                this.logger.debug(
                    `Unable to adjust assort ${assortToAdjust._id} item: ${assortToAdjust._tpl} BuyRestrictionCurrent value, assort has an undefined upd object`,
                );

                continue;
            }

            assortToAdjust.upd.BuyRestrictionCurrent = assortPurchasesfromTrader[assortId].count;
        }

        // Get rid of quest locked assorts
        if (!this.createdMergedQuestAssorts)
        {
            this.hydrateMergedQuestAssorts();
            this.createdMergedQuestAssorts = true;
        }
        traderClone.assort = this.assortHelper.stripLockedQuestAssort(
            pmcProfile,
            traderId,
            traderClone.assort,
            this.mergedQuestAssorts,
            flea,
        );

        // Multiply price if multiplier is other than 1
        if (this.traderConfig.traderPriceMultipler !== 1)
        {
            this.multiplyItemPricesByConfigMultiplier(traderClone.assort);
        }

        return traderClone.assort;
    }

    /**
     * Reset every traders root item `BuyRestrictionCurrent` property to 0
     * @param assortItems Items to adjust
     */
    protected resetBuyRestrictionCurrentValue(assortItems: Item[]): void
    {
        // iterate over root items
        for (const assort of assortItems.filter((item) => item.slotId === "hideout"))
        {
            // no value to adjust
            if (!assort.upd.BuyRestrictionCurrent)
            {
                continue;
            }

            assort.upd.BuyRestrictionCurrent = 0;
        }
    }

    /**
     * Create a dict of all assort id = quest id mappings used to work out what items should be shown to player based on the quests they've started/completed/failed
     */
    protected hydrateMergedQuestAssorts(): void
    {
        const traders = this.databaseServer.getTables().traders;

        // Loop every trader
        for (const traderId in traders)
        {
            // Trader has quest assort data
            const trader = traders[traderId];
            if (trader.questassort)
            {
                // Started/Success/fail
                for (const questStatus in trader.questassort)
                {
                    // Each assort to quest id record
                    for (const assortId in trader.questassort[questStatus])
                    {
                        // Null guard
                        if (!this.mergedQuestAssorts[questStatus])
                        {
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
    public resetExpiredTrader(trader: ITrader): void
    {
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
    public traderAssortsHaveExpired(traderID: string): boolean
    {
        const time = this.timeUtil.getTimestamp();
        const trader = this.databaseServer.getTables().traders[traderID];

        return trader.base.nextResupply <= time;
    }

    /**
     * Iterate over all assorts barter_scheme values, find barters selling for money and multiply by multipler in config
     * @param traderAssort Assorts to multiple price of
     */
    protected multiplyItemPricesByConfigMultiplier(traderAssort: ITraderAssort): void
    {
        if (!this.traderConfig.traderPriceMultipler || this.traderConfig.traderPriceMultipler <= 0)
        {
            this.traderConfig.traderPriceMultipler = 0.01;
            this.logger.warning(this.localisationService.getText("trader-price_multipler_is_zero_use_default"));
        }

        for (const assortId in traderAssort.barter_scheme)
        {
            const schemeDetails = traderAssort.barter_scheme[assortId][0];
            if (schemeDetails.length === 1 && this.paymentHelper.isMoneyTpl(schemeDetails[0]._tpl))
            {
                schemeDetails[0].count = Math.ceil(schemeDetails[0].count * this.traderConfig.traderPriceMultipler);
            }
        }
    }

    /**
     * Get an array of pristine trader items prior to any alteration by player (as they were on server start)
     * @param traderId trader id
     * @returns array of Items
     */
    protected getPristineTraderAssorts(traderId: string): Item[]
    {
        return this.jsonUtil.clone(this.traderAssortService.getPristineTraderAssort(traderId).items);
    }

    /**
     * Returns generated ragfair offers in a trader assort format
     * @returns Trader assort object
     */
    protected getRagfairDataAsTraderAssort(): ITraderAssort
    {
        return {
            items: this.ragfairAssortGenerator.getAssortItems().flat(),
            barter_scheme: {},
            loyal_level_items: {},
            nextResupply: null,
        };
    }
}
