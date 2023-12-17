import { inject, injectable } from "tsyringe";

import { SellResult } from "@spt-aki/models/eft/ragfair/IRagfairOffer";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IRagfairConfig } from "@spt-aki/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class RagfairSellHelper
{
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Get the percent chance to sell an item based on its average listed price vs player chosen listing price
     * @param averageOfferPriceRub Price of average offer in roubles
     * @param playerListedPriceRub Price player listed item for in roubles
     * @param qualityMultiplier Quality multipler of item being sold
     * @returns percent value
     */
    public calculateSellChance(
        averageOfferPriceRub: number,
        playerListedPriceRub: number,
        qualityMultiplier: number,
    ): number
    {
        const baseSellChancePercent = this.ragfairConfig.sell.chance.base * qualityMultiplier;
        // Modfier gets applied twice to either penalize or incentivize over/under pricing (Probably a cleaner way to do this)
        const modifier = averageOfferPriceRub / playerListedPriceRub;
        let sellChance = Math.round((baseSellChancePercent * modifier) * modifier);
        // Never a 100% chance to sell, and eventually it's basically never gonna sell
        if (sellChance >= 100) sellChance = 99; else if (sellChance <= 5) sellChance = 1;
        return sellChance;
    }

    /**
     * Get percent chance to sell an item when price is below items average listing price
     * @param playerListedPriceRub Price player listed item for in roubles
     * @param averageOfferPriceRub Price of average offer in roubles
     * @returns percent value
    protected getSellMultiplierWhenPlayerPriceIsBelowAverageListingPrice(
        averageOfferPriceRub: number,
        playerListedPriceRub: number,
    ): number
    {
        return (playerListedPriceRub < averageOfferPriceRub) ? this.ragfairConfig.sell.chance.underpriced : 1;
    }
     */

    /**
     * Get array of item count and sell time (empty array = no sell)
     * @param sellChancePercent chance item will sell
     * @param itemSellCount count of items to sell
     * @returns Array of purchases of item(s) listed
     */
    public rollForSale(sellChancePercent: number, itemSellCount: number): SellResult[]
    {
        const startTime = this.timeUtil.getTimestamp();

        // Get a time in future to stop simulating sell chances at
        const endTime = startTime + this.timeUtil.getHoursAsSeconds(this.databaseServer.getTables().globals.config.RagFair.offerDurationTimeInHour);

        let sellTime = startTime;
        let remainingCount = itemSellCount;
        const result: SellResult[] = [];

        // Value can sometimes be NaN for whatever reason, default to base chance if that happens
        if (Number.isNaN(sellChancePercent))
        {
            this.logger.warning(
                `Sell chance was not a number: ${sellChancePercent}, defaulting to ${this.ragfairConfig.sell.chance.base} %`,
            );
            sellChancePercent = this.ragfairConfig.sell.chance.base;
        }

        this.logger.debug(`Rolling to sell: ${itemSellCount} items (chance: ${sellChancePercent}%)`);

        // No point rolling for a sale on a 0% chance item, exit early
        if (sellChancePercent === 0)
        {
            return result;
        }

        while (remainingCount > 0 && sellTime < endTime)
        {
            const boughtAmount = this.randomUtil.getInt(1, remainingCount);
            if (this.randomUtil.getChance100(sellChancePercent))
            {
                // Passed roll check, item will be sold
                // Weight time to sell towards selling faster based on how cheap the item sold
                const weighting = (100 - sellChancePercent) / 100;
                let maximumTime = weighting * (this.ragfairConfig.sell.time.max * 60);
                const minimumTime = this.ragfairConfig.sell.time.min * 60;
                if (maximumTime < minimumTime) maximumTime = minimumTime + 5;
                // Sell time will be random between min/max
                sellTime += Math.floor(Math.random() * (maximumTime - minimumTime) + minimumTime);

                result.push({ sellTime: sellTime, amount: boughtAmount });

                this.logger.debug(`Offer will sell at: ${new Date(sellTime * 1000).toLocaleTimeString("en-US")}`);
            }
            else
            {
                this.logger.debug("Offer will not sell");
            }

            remainingCount -= boughtAmount;
        }

        return result;
    }
}
