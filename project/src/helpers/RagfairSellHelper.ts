import { ISellResult } from "@spt/models/eft/ragfair/IRagfairOffer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class RagfairSellHelper {
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
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
    ): number {
        const sellConfig = this.ragfairConfig.sell.chance;

        // Base sell chance modified by items quality
        const baseSellChancePercent = sellConfig.base * qualityMultiplier;

        // Modfier gets applied twice to either penalize or incentivize over/under pricing (Probably a cleaner way to do this)
        const sellModifier = (averageOfferPriceRub / playerListedPriceRub) * sellConfig.sellMultiplier;
        let sellChance = Math.round(baseSellChancePercent * sellModifier * sellModifier ** 3 + 10); // Power of 3

        // Adjust sell chance if below config value
        if (sellChance < sellConfig.minSellChancePercent) {
            sellChance = sellConfig.minSellChancePercent;
        }

        // Adjust sell chance if above config value
        if (sellChance > sellConfig.maxSellChancePercent) {
            sellChance = sellConfig.maxSellChancePercent;
        }

        return sellChance;
    }

    /**
     * Get array of item count and sell time (empty array = no sell)
     * @param sellChancePercent chance item will sell
     * @param itemSellCount count of items to sell
     * @param sellInOneGo All items listed get sold at once
     * @returns Array of purchases of item(s) listed
     */
    public rollForSale(sellChancePercent: number, itemSellCount: number, sellInOneGo = false): ISellResult[] {
        const startTime = this.timeUtil.getTimestamp();

        // Get a time in future to stop simulating sell chances at
        const endTime =
            startTime +
            this.timeUtil.getHoursAsSeconds(this.databaseService.getGlobals().config.RagFair.offerDurationTimeInHour);

        let sellTime = startTime;
        let remainingCount = itemSellCount;
        const result: ISellResult[] = [];

        // Value can sometimes be NaN for whatever reason, default to base chance if that happens
        const effectiveSellChance = Number.isNaN(sellChancePercent)
            ? this.ragfairConfig.sell.chance.base
            : sellChancePercent;
        if (Number.isNaN(sellChancePercent)) {
            this.logger.warning(
                `Sell chance was not a number: ${sellChancePercent}, defaulting to ${this.ragfairConfig.sell.chance.base}%`,
            );
        }

        this.logger.debug(`Rolling to sell: ${itemSellCount} items (chance: ${effectiveSellChance}%)`);

        // No point rolling for a sale on a 0% chance item, exit early
        if (effectiveSellChance === 0) {
            return result;
        }

        while (remainingCount > 0 && sellTime < endTime) {
            const boughtAmount = sellInOneGo ? remainingCount : this.randomUtil.getInt(1, remainingCount);
            if (this.randomUtil.getChance100(effectiveSellChance)) {
                // Passed roll check, item will be sold
                // Weight time to sell towards selling faster based on how cheap the item sold
                const weighting = (100 - effectiveSellChance) / 100;
                let maximumTime = weighting * (this.ragfairConfig.sell.time.max * 60);
                const minimumTime = this.ragfairConfig.sell.time.min * 60;
                if (maximumTime < minimumTime) {
                    maximumTime = minimumTime + 5;
                }
                // Sell time will be random between min/max
                let newSellTime = Math.floor(Math.random() * (maximumTime - minimumTime) + minimumTime);
                if (newSellTime === 0) {
                    // Ensure all sales dont occur the same exact time
                    newSellTime += 1;
                }
                sellTime += newSellTime;

                result.push({ sellTime: sellTime, amount: boughtAmount });

                this.logger.debug(
                    `Offer will sell at: ${new Date(sellTime * 1000).toLocaleTimeString("en-US")}, bought: ${boughtAmount}`,
                );
            } else {
                this.logger.debug(`Offer rolled not to sell, item count: ${boughtAmount}`);
            }

            remainingCount -= boughtAmount;
        }

        return result;
    }
}
