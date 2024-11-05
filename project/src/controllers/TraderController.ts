import { FenceBaseAssortGenerator } from "@spt/generators/FenceBaseAssortGenerator";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { TraderAssortHelper } from "@spt/helpers/TraderAssortHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { ITraderAssort, ITraderBase } from "@spt/models/eft/common/tables/ITrader";
import { IGetItemPricesResponse } from "@spt/models/eft/game/IGetItemPricesResponse";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { Money } from "@spt/models/enums/Money";
import { Traders } from "@spt/models/enums/Traders";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { FenceService } from "@spt/services/FenceService";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import { TraderAssortService } from "@spt/services/TraderAssortService";
import { TraderPurchasePersisterService } from "@spt/services/TraderPurchasePersisterService";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class TraderController {
    protected traderConfig: ITraderConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("TraderAssortHelper") protected traderAssortHelper: TraderAssortHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("TraderAssortService") protected traderAssortService: TraderAssortService,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("TraderPurchasePersisterService")
        protected traderPurchasePersisterService: TraderPurchasePersisterService,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("FenceBaseAssortGenerator") protected fenceBaseAssortGenerator: FenceBaseAssortGenerator,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /**
     * Runs when onLoad event is fired
     * Iterate over traders, ensure a pristine copy of their assorts is stored in traderAssortService
     * Store timestamp of next assort refresh in nextResupply property of traders .base object
     */
    public load(): void {
        const nextHourTimestamp = this.timeUtil.getTimestampOfNextHour();
        const traderResetStartsWithServer = this.traderConfig.tradersResetFromServerStart;

        const traders = this.databaseService.getTraders();
        for (const traderId in traders) {
            if (traderId === "ragfair" || traderId === Traders.LIGHTHOUSEKEEPER) {
                continue;
            }

            if (traderId === Traders.FENCE) {
                this.fenceBaseAssortGenerator.generateFenceBaseAssorts();
                this.fenceService.generateFenceAssorts();
                continue;
            }

            const trader = traders[traderId];

            // Create dict of trader assorts on server start
            if (!this.traderAssortService.getPristineTraderAssort(traderId)) {
                const assortsClone = this.cloner.clone(trader.assort);
                this.traderAssortService.setPristineTraderAssort(traderId, assortsClone);
            }

            this.traderPurchasePersisterService.removeStalePurchasesFromProfiles(traderId);

            // Set to next hour on clock or current time + 60 mins
            trader.base.nextResupply = traderResetStartsWithServer
                ? this.traderHelper.getNextUpdateTimestamp(trader.base._id)
                : nextHourTimestamp;
            traders[trader.base._id].base = trader.base;
        }
    }

    /**
     * Runs when onUpdate is fired
     * If current time is > nextResupply(expire) time of trader, refresh traders assorts and
     * Fence is handled slightly differently
     * @returns has run
     */
    public update(): boolean {
        for (const traderId in this.databaseService.getTables().traders) {
            if (traderId === "ragfair" || traderId === Traders.LIGHTHOUSEKEEPER) {
                continue;
            }

            if (traderId === Traders.FENCE) {
                if (this.fenceService.needsPartialRefresh()) {
                    this.fenceService.performPartialRefresh();
                }

                continue;
            }

            // Trader needs to be refreshed
            const trader = this.databaseService.getTrader(traderId);
            if (this.traderAssortHelper.traderAssortsHaveExpired(traderId)) {
                this.traderAssortHelper.resetExpiredTrader(trader);

                // Reset purchase data per trader as they have independent reset times
                this.traderPurchasePersisterService.resetTraderPurchasesStoredInProfile(trader.base._id);
            }
        }

        return true;
    }

    /**
     * Handle client/trading/api/traderSettings
     * Return an array of all traders
     * @param sessionID Session id
     * @returns array if ITraderBase objects
     */
    public getAllTraders(sessionID: string): ITraderBase[] {
        const traders: ITraderBase[] = [];
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        for (const traderID in this.databaseService.getTables().traders) {
            if (this.databaseService.getTables().traders[traderID].base._id === "ragfair") {
                continue;
            }

            traders.push(this.traderHelper.getTrader(traderID, sessionID));

            if (pmcData.Info) {
                this.traderHelper.lvlUp(traderID, pmcData);
            }
        }

        return traders.sort((a, b) => this.sortByTraderId(a, b));
    }

    /**
     * Order traders by their traderId (Ttid)
     * @param traderA First trader to compare
     * @param traderB Second trader to compare
     * @returns 1,-1 or 0
     */
    protected sortByTraderId(traderA: ITraderBase, traderB: ITraderBase): number {
        if (traderA._id > traderB._id) {
            return 1;
        }

        if (traderA._id < traderB._id) {
            return -1;
        }

        return 0;
    }

    /** Handle client/trading/api/getTrader */
    public getTrader(sessionID: string, traderID: string): ITraderBase {
        return this.traderHelper.getTrader(sessionID, traderID);
    }

    /** Handle client/trading/api/getTraderAssort */
    public getAssort(sessionId: string, traderId: string): ITraderAssort {
        return this.traderAssortHelper.getAssort(sessionId, traderId);
    }

    /** Handle client/items/prices/TRADERID */
    public getItemPrices(sessionId: string, traderId: string): IGetItemPricesResponse {
        const handbookPrices = this.ragfairPriceService.getAllStaticPrices();
        const handbookPricesClone = this.cloner.clone(handbookPrices);

        return {
            supplyNextTime: this.traderHelper.getNextUpdateTimestamp(traderId),
            prices: handbookPricesClone,
            currencyCourses: {
                "5449016a4bdc2d6f028b456f": handbookPrices[Money.ROUBLES],
                "569668774bdc2da2298b4568": handbookPrices[Money.EUROS],
                "5696686a4bdc2da3298b456a": handbookPrices[Money.DOLLARS],
            },
        };
    }
}
