import { inject, injectable } from "tsyringe";

import { BotHelper } from "@spt-aki/helpers/BotHelper";
import { IBotBase } from "@spt-aki/models/eft/common/tables/IBotBase";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class BotGenerationCacheService
{
    protected storedBots: Map<string, IBotBase[]> = new Map();

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotHelper") protected botHelper: BotHelper,
    )
    {}

    /**
     * Store array of bots in cache, shuffle results before storage
     * @param botsToStore Bots we want to store in the cache
     */
    public storeBots(key: string, botsToStore: IBotBase[]): void
    {
        botsToStore.forEach((e) =>
        {
            if (this.storedBots.has(key))
            {
                this.storedBots.get(key).unshift(e);
            }
            else
            {
                this.storedBots.set(key, [e]);
            }
        });
    }

    /**
     * Find and return a bot based on its role
     * Remove bot from internal array so it can't be retreived again
     * @param key role to retreive (assault/bossTagilla etc)
     * @returns IBotBase object
     */
    public getBot(key: string): IBotBase
    {
        if (this.storedBots.has(key))
        {
            const cachedOfType = this.storedBots.get(key);
            if (cachedOfType.length > 0)
            {
                return cachedOfType.pop();
            }

            this.logger.error(this.localisationService.getText("bot-cache_has_zero_bots_of_requested_type", key));
        }

        this.logger.error(this.localisationService.getText("bot-no_bot_type_in_cache", key));

        return undefined;
    }

    /**
     * Remove all cached bot profiles from memory
     */
    public clearStoredBots(): void
    {
        this.storedBots = new Map();
    }

    /**
     * Does cache have a bot with requested key
     * @returns false if empty
     */
    public cacheHasBotOfRole(key: string): boolean
    {
        return this.storedBots.has(key) && this.storedBots.get(key).length > 0;
    }
}
