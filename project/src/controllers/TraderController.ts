import { inject, injectable } from "tsyringe";

import { FenceBaseAssortGenerator } from "@spt-aki/generators/FenceBaseAssortGenerator";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { TraderAssortHelper } from "@spt-aki/helpers/TraderAssortHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { ITraderAssort, ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { Traders } from "@spt-aki/models/enums/Traders";
import { ITraderConfig } from "@spt-aki/models/spt/config/ITraderConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { FenceService } from "@spt-aki/services/FenceService";
import { TraderAssortService } from "@spt-aki/services/TraderAssortService";
import { TraderPurchasePersisterService } from "@spt-aki/services/TraderPurchasePersisterService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class TraderController
{
    protected traderConfig: ITraderConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("TraderAssortHelper") protected traderAssortHelper: TraderAssortHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("TraderAssortService") protected traderAssortService: TraderAssortService,
        @inject("TraderPurchasePersisterService") protected traderPurchasePersisterService:
            TraderPurchasePersisterService,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("FenceBaseAssortGenerator") protected fenceBaseAssortGenerator: FenceBaseAssortGenerator,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    /**
     * Runs when onLoad event is fired
     * Iterate over traders, ensure a pristine copy of their assorts is stored in traderAssortService
     * Store timestamp of next assort refresh in nextResupply property of traders .base object
     */
    public load(): void
    {
        const nextHourTimestamp = this.timeUtil.getTimestampOfNextHour();
        const traderResetStartsWithServer = this.traderConfig.tradersResetFromServerStart;
        for (const traderId in this.databaseServer.getTables().traders)
        {
            if (traderId === "ragfair" || traderId === Traders.LIGHTHOUSEKEEPER)
            {
                continue;
            }

            if (traderId === Traders.FENCE)
            {
                this.fenceBaseAssortGenerator.generateFenceBaseAssorts();
                this.fenceService.generateFenceAssorts();
                continue;
            }

            const trader = this.databaseServer.getTables().traders[traderId];

            // Create dict of trader assorts on server start
            if (!this.traderAssortService.getPristineTraderAssort(traderId))
            {
                const assortsClone = this.jsonUtil.clone(trader.assort);
                this.traderAssortService.setPristineTraderAssort(traderId, assortsClone);
            }

            this.traderPurchasePersisterService.removeStalePurchasesFromProfiles(traderId);

            // Set to next hour on clock or current time + 60 mins
            trader.base.nextResupply = traderResetStartsWithServer
                ? this.traderHelper.getNextUpdateTimestamp(trader.base._id)
                : nextHourTimestamp;
            this.databaseServer.getTables().traders[trader.base._id].base = trader.base;
        }
    }

    /**
     * Runs when onUpdate is fired
     * If current time is > nextResupply(expire) time of trader, refresh traders assorts and
     * Fence is handled slightly differently
     * @returns has run
     */
    public update(): boolean
    {
        for (const traderId in this.databaseServer.getTables().traders)
        {
            if (traderId === "ragfair" || traderId === Traders.LIGHTHOUSEKEEPER)
            {
                continue;
            }

            if (traderId === Traders.FENCE)
            {
                if (this.fenceService.needsPartialRefresh())
                {
                    this.fenceService.performPartialRefresh();
                }

                continue;
            }

            const trader = this.databaseServer.getTables().traders[traderId];

            // trader needs to be refreshed
            if (this.traderAssortHelper.traderAssortsHaveExpired(traderId))
            {
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
    public getAllTraders(sessionID: string): ITraderBase[]
    {
        const traders: ITraderBase[] = [];
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        for (const traderID in this.databaseServer.getTables().traders)
        {
            if (this.databaseServer.getTables().traders[traderID].base._id === "ragfair")
            {
                continue;
            }

            traders.push(this.traderHelper.getTrader(traderID, sessionID));

            if (pmcData.Info)
            {
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
    protected sortByTraderId(traderA: ITraderBase, traderB: ITraderBase): number
    {
        if (traderA._id > traderB._id)
        {
            return 1;
        }

        if (traderA._id < traderB._id)
        {
            return -1;
        }

        return 0;
    }

    /** Handle client/trading/api/getTrader */
    public getTrader(sessionID: string, traderID: string): ITraderBase
    {
        return this.traderHelper.getTrader(sessionID, traderID);
    }

    /** Handle client/trading/api/getTraderAssort */
    public getAssort(sessionId: string, traderId: string): ITraderAssort
    {
        return this.traderAssortHelper.getAssort(sessionId, traderId);
    }
}
