import { inject, injectable } from "tsyringe";

import { IBotBase } from "@spt-aki/models/eft/common/tables/IBotBase";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { LocalisationService } from "@spt-aki/services/LocalisationService";

/** Cache bots in a dictionary, keyed by the bots name, keying by name isnt ideal as its not unique but this is used by the post-raid system which doesnt have any bot ids, only name */
@injectable()
export class MatchBotDetailsCacheService
{
    protected botDetailsCache: Record<string, IBotBase> = {};

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("LocalisationService") protected localisationService: LocalisationService,
    )
    {}

    /**
     * Store a bot in the cache, keyed by its name
     * @param botToCache Bot details to cache
     */
    public cacheBot(botToCache: IBotBase): void
    {
        this.botDetailsCache[`${botToCache.Info.Nickname.trim()}${botToCache.Info.Side}`] = botToCache;
    }

    /**
     * Clean the cache of all bot details
     */
    public clearCache(): void
    {
        this.botDetailsCache = {};
    }

    /**
     * Find a bot in the cache by its name and side
     * @param botName Name of bot to find
     * @returns Bot details
     */
    public getBotByNameAndSide(botName: string, botSide: string): IBotBase
    {
        const botInCache = this.botDetailsCache[`${botName}${botSide}`];
        if (!botInCache)
        {
            this.logger.warning(`bot not found in match bot cache: ${botName} ${botSide}`);
        }

        return botInCache;
    }
}
