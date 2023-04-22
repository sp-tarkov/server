import { inject, injectable } from "tsyringe";

import { IBotBase } from "../models/eft/common/tables/IBotBase";
import { ILogger } from "../models/spt/utils/ILogger";

/** Cache bots in a dictionary, keyed by the bots name, keying by name isnt idea as its not unique but this is used by the post-raid system which doesnt have any bot ids, only name */

@injectable()
export class MatchBotDetailsCacheService
{
    protected botDetailsCache: Record<string, IBotBase> = {};

    constructor(
        @inject("WinstonLogger") protected logger: ILogger
    )
    {}

    /**
     * Store a bot in the cache, keyed by its name
     * @param botToCache Bot details to cache
     */
    public cacheBot(botToCache: IBotBase): void
    {
        this.botDetailsCache[botToCache.Info.Nickname.trim()] = botToCache;
    }

    /**
     * Clean the cache of all bot details
     */
    public clearCache(): void
    {
        this.botDetailsCache = {};
    }

    /**
     * Find a bot in the cache by its name
     * @param botName Name of bot to find
     * @returns Bot details
     */
    public getBotByName(botName: string): IBotBase
    {
        const botInCache = this.botDetailsCache[botName];
        if (!botInCache)
        {
            this.logger.warning(`Bot not found in cache with name ${botName}`);
        }

        return botInCache;
    }

}