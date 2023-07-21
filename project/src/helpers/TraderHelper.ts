import { inject, injectable } from "tsyringe";

import { IPmcData } from "../models/eft/common/IPmcData";
import { ProfileTraderTemplate } from "../models/eft/common/tables/IProfileTemplate";
import { ITraderAssort, ITraderBase, LoyaltyLevel } from "../models/eft/common/tables/ITrader";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Money } from "../models/enums/Money";
import { Traders } from "../models/enums/Traders";
import { ITraderConfig } from "../models/spt/config/ITraderConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { FenceService } from "../services/FenceService";
import { LocalisationService } from "../services/LocalisationService";
import { PlayerService } from "../services/PlayerService";
import { RandomUtil } from "../utils/RandomUtil";
import { TimeUtil } from "../utils/TimeUtil";
import { HandbookHelper } from "./HandbookHelper";
import { ItemHelper } from "./ItemHelper";
import { ProfileHelper } from "./ProfileHelper";

@injectable()
export class TraderHelper
{
    protected traderConfig: ITraderConfig;
    /** Dictionary of item tpl and the highest trader sell rouble price */
    protected highestTraderPriceItems: Record<string, number> = null;
    /** Dictionary of item tpl and the highest trader buy back rouble price */
    protected highestTraderBuyPriceItems: Record<string, number> = null;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
    }

    public getTrader(traderID: string, sessionID: string): ITraderBase
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const trader = this.databaseServer.getTables().traders[traderID].base;

        if (!("TradersInfo" in pmcData))
        {
            // pmc profile wiped
            return trader;
        }

        if (!(traderID in pmcData.TradersInfo))
        {
            // trader doesn't exist in profile
            this.resetTrader(sessionID, traderID);
            this.lvlUp(traderID, sessionID);
        }

        return trader;
    }

    public getTraderAssortsById(traderId: string): ITraderAssort
    {
        return traderId === Traders.FENCE
            ? this.fenceService.getRawFenceAssorts()
            : this.databaseServer.getTables().traders[traderId].assort;
    }

    /**
     * Reset a profiles trader data back to its initial state as seen by a level 1 player
     * Does NOT take into account different profile levels
     * @param sessionID session id
     * @param traderID trader id to reset
     */
    public resetTrader(sessionID: string, traderID: string): void
    {
        const account = this.saveServer.getProfile(sessionID);
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const rawProfileTemplate: ProfileTraderTemplate = this.databaseServer.getTables().templates.profiles[account.info.edition][pmcData.Info.Side.toLowerCase()].trader;

        pmcData.TradersInfo[traderID] = {
            disabled: false,
            loyaltyLevel: rawProfileTemplate.initialLoyaltyLevel,
            salesSum: rawProfileTemplate.initialSalesSum,
            standing: rawProfileTemplate.initialStanding,
            nextResupply: this.databaseServer.getTables().traders[traderID].base.nextResupply,
            unlocked: this.databaseServer.getTables().traders[traderID].base.unlockedByDefault
        };

        if (traderID === Traders.JAEGER)
        {
            pmcData.TradersInfo[traderID].unlocked = rawProfileTemplate.jaegerUnlocked;
        }
    }

    /**
     * Alter a traders unlocked status
     * @param traderId Trader to alter
     * @param status New status to use
     * @param sessionId Session id
     */
    public setTraderUnlockedState(traderId: string, status: boolean, sessionId: string): void
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);
        pmcData.TradersInfo[traderId].unlocked = status;
    }

    /**
     * Add standing to a trader and level them up if exp goes over level threshold
     * @param sessionId Session id
     * @param traderId Traders id
     * @param standingToAdd Standing value to add to trader
     */
    public addStandingToTrader(sessionId: string, traderId: string, standingToAdd: number): void
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionId);
        const traderInfo = pmcData.TradersInfo[traderId];

        // Add standing to trader
        traderInfo.standing = this.addStandingValuesTogether(traderInfo.standing, standingToAdd);

        this.lvlUp(traderId, sessionId);
    }

    /**
     * Add standing to current standing and clamp value if it goes too low
     * @param currentStanding current trader standing
     * @param standingToAdd stansding to add to trader standing
     * @returns current standing + added standing (clamped if needed)
     */
    protected addStandingValuesTogether(currentStanding: number, standingToAdd: number): number
    {
        const newStanding = currentStanding + standingToAdd;

        return newStanding < 0
            ? 0
            : newStanding;
    }

    /**
     * Calculate traders level based on exp amount and increments level if over threshold
     * @param traderID trader to process
     * @param sessionID session id
     */
    public lvlUp(traderID: string, sessionID: string): void
    {
        const loyaltyLevels = this.databaseServer.getTables().traders[traderID].base.loyaltyLevels;
        const pmcData = this.profileHelper.getPmcProfile(sessionID);

        // level up player
        pmcData.Info.Level = this.playerService.calculateLevel(pmcData);

        // level up traders
        let targetLevel = 0;

        // round standing to 2 decimal places to address floating point inaccuracies
        pmcData.TradersInfo[traderID].standing = Math.round(pmcData.TradersInfo[traderID].standing * 100) / 100;

        for (const level in loyaltyLevels)
        {
            const loyalty = loyaltyLevels[level];

            if ((loyalty.minLevel <= pmcData.Info.Level
                && loyalty.minSalesSum <= pmcData.TradersInfo[traderID].salesSum
                && loyalty.minStanding <= pmcData.TradersInfo[traderID].standing)
                && targetLevel < 4)
            {
                // level reached
                targetLevel++;
            }
        }

        // set level
        pmcData.TradersInfo[traderID].loyaltyLevel = targetLevel;
    }

    /**
     * Get the next update timestamp for a trader
     * @param traderID Trader to look up update value for
     * @returns future timestamp
     */
    public getNextUpdateTimestamp(traderID: string): number
    {
        const time = this.timeUtil.getTimestamp();
        const updateSeconds = this.getTraderUpdateSeconds(traderID);
        return time + updateSeconds;
    }

    /**
     * Get the reset time between trader assort refreshes in seconds
     * @param traderId Trader to look up
     * @returns Time in seconds
     */
    public getTraderUpdateSeconds(traderId: string): number
    {
        const traderDetails = this.traderConfig.updateTime.find(x => x.traderId === traderId);
        if (!traderDetails)
        {
            this.logger.warning(this.localisationService.getText("trader-missing_trader_details_using_default_refresh_time", {traderId: traderId, updateTime: this.traderConfig.updateTimeDefault}));
            this.traderConfig.updateTime.push(  // create temporary entry to prevent logger spam
                {
                    traderId: traderId,
                    seconds: this.traderConfig.updateTimeDefault
                }
            );
        }
        else
        {
            return traderDetails.seconds;
        }
    }

    public getLoyaltyLevel(traderID: string, pmcData: IPmcData): LoyaltyLevel
    {
        const trader = this.databaseServer.getTables().traders[traderID].base;
        let loyaltyLevel = pmcData.TradersInfo[traderID].loyaltyLevel;

        if (!loyaltyLevel || loyaltyLevel < 1)
        {
            loyaltyLevel = 1;
        }

        if (loyaltyLevel > trader.loyaltyLevels.length)
        {
            loyaltyLevel = trader.loyaltyLevels.length;
        }

        return trader.loyaltyLevels[loyaltyLevel - 1];
    }

    /**
     * Store the purchase of an assort from a trader in the player profile
     * @param sessionID Session id
     * @param newPurchaseDetails New item assort id + count
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public addTraderPurchasesToPlayerProfile(sessionID: string, newPurchaseDetails: { items: { item_id: string; count: number; }[]; tid: string; }): void
    {
        const profile = this.profileHelper.getFullProfile(sessionID);
        const traderId = newPurchaseDetails.tid;

        // Iterate over assorts bought and add to profile
        for (const purchasedItem of newPurchaseDetails.items)
        {
            if (!profile.traderPurchases)
            {
                profile.traderPurchases = {};
            }

            if (!profile.traderPurchases[traderId])
            {
                profile.traderPurchases[traderId] = {};
            }

            // Null guard when dict doesnt exist
            const currentTime = this.timeUtil.getTimestamp();
            if (!profile.traderPurchases[traderId][purchasedItem.item_id])
            {
                profile.traderPurchases[traderId][purchasedItem.item_id] =
                {
                    count: purchasedItem.count,
                    purchaseTimestamp: currentTime
                };

                continue;
            }

            profile.traderPurchases[traderId][purchasedItem.item_id].count += purchasedItem.count;
            profile.traderPurchases[traderId][purchasedItem.item_id].purchaseTimestamp = currentTime;
        }
    }

    /**
     * Get the highest rouble price for an item from traders
     * UNUSED
     * @param tpl Item to look up highest pride for
     * @returns highest rouble cost for item
     */
    public getHighestTraderPriceRouble(tpl: string): number
    {
        if (this.highestTraderPriceItems)
        {
            return this.highestTraderPriceItems[tpl];
        }

        if (!this.highestTraderPriceItems)
        {
            this.highestTraderPriceItems = {};
        }

        // Init dict and fill
        for (const traderName in Traders)
        {
            // Skip some traders
            if (traderName === Traders.FENCE)
            {
                continue;
            }

            // Get assorts for trader, skip trader if no assorts found
            const traderAssorts = this.databaseServer.getTables().traders[Traders[traderName]].assort;
            if (!traderAssorts)
            {
                continue;
            }

            // Get all item assorts that have parentid of hideout (base item and not a mod of other item)
            for (const item of traderAssorts.items.filter(x => x.parentId === "hideout"))
            {
                // Get barter scheme (contains cost of item)
                const barterScheme = traderAssorts.barter_scheme[item._id][0][0];

                // Convert into roubles
                const roubleAmount = barterScheme._tpl === Money.ROUBLES
                    ? barterScheme.count
                    : this.handbookHelper.inRUB(barterScheme.count, barterScheme._tpl);

                // Existing price smaller in dict than current iteration, overwrite
                if (this.highestTraderPriceItems[item._tpl] ?? 0 < roubleAmount)
                {
                    this.highestTraderPriceItems[item._tpl] = roubleAmount;
                }
            }
        }

        return this.highestTraderPriceItems[tpl];
    }

    /**
     * Get the highest price item can be sold to trader for (roubles)
     * @param tpl Item to look up best trader sell-to price
     * @returns Rouble price
     */
    public getHighestSellToTraderPrice(tpl: string): number
    {
        // Init dict if doesn't exist
        if (!this.highestTraderBuyPriceItems)
        {
            this.highestTraderBuyPriceItems = {};
        }

        // Return result if it exists
        if (this.highestTraderBuyPriceItems[tpl])
        {
            return this.highestTraderBuyPriceItems[tpl];
        }

        
        // Find highest trader price for item
        for (const traderName in Traders)
        {
            // Get trader and check buy category allows tpl
            const traderBase = this.databaseServer.getTables().traders[Traders[traderName]]?.base;
            if (traderBase && this.itemHelper.isOfBaseclasses(tpl, traderBase.items_buy.category))
            {
                // Get loyalty level details player has achieved with this trader
                // Uses lowest loyalty level as this function is used before a player has logged into server - we have no idea what player loyalty is with traders
                const relevantLoyaltyData = traderBase.loyaltyLevels[0];
                const traderBuyBackPricePercent = relevantLoyaltyData.buy_price_coef;

                const itemHandbookPrice = this.handbookHelper.getTemplatePrice(tpl);
                const priceTraderBuysItemAt = Math.round(this.randomUtil.getPercentOfValue(traderBuyBackPricePercent, itemHandbookPrice));

                // Set new item to 1 rouble as default
                if (!this.highestTraderBuyPriceItems[tpl])
                {
                    this.highestTraderBuyPriceItems[tpl] = 1;
                }

                // Existing price smaller in dict than current iteration, overwrite
                if (this.highestTraderBuyPriceItems[tpl] < priceTraderBuysItemAt)
                {
                    this.highestTraderBuyPriceItems[tpl] = priceTraderBuysItemAt;
                }
            }
        }

        return this.highestTraderBuyPriceItems[tpl];
    }

    /**
     * Get a trader enum key by its value
     * @param traderId Traders id
     * @returns Traders key
     */
    public getTraderById(traderId: string): Traders
    {
        const keys = Object.keys(Traders).filter(x => Traders[x] === traderId);

        return keys.length > 0 ? keys[0] as Traders : null;
    }
}