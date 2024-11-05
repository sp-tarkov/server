import { BotHelper } from "@spt/helpers/BotHelper";
import { IBotBase } from "@spt/models/eft/common/tables/IBotBase";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { LocalisationService } from "@spt/services/LocalisationService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotGenerationCacheService {
    protected storedBots: Map<string, IBotBase[]> = new Map();
    protected activeBotsInRaid: IBotBase[] = [];

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("BotHelper") protected botHelper: BotHelper,
    ) {}

    /**
     * Store array of bots in cache, shuffle results before storage
     * @param botsToStore Bots we want to store in the cache
     */
    public storeBots(key: string, botsToStore: IBotBase[]): void {
        for (const bot of botsToStore) {
            if (this.storedBots.has(key)) {
                this.storedBots.get(key).unshift(bot);
            } else {
                this.storedBots.set(key, [bot]);
            }
        }
    }

    /**
     * Find and return a bot based on its role
     * Remove bot from internal array so it can't be retreived again
     * @param key role to retreive (assault/bossTagilla etc)
     * @returns IBotBase object
     */
    public getBot(key: string): IBotBase {
        if (this.storedBots.has(key)) {
            const cachedOfType = this.storedBots.get(key);
            if (cachedOfType.length > 0) {
                return cachedOfType.pop();
            }

            this.logger.error(this.localisationService.getText("bot-cache_has_zero_bots_of_requested_type", key));
        }

        this.logger.error(this.localisationService.getText("bot-no_bot_type_in_cache", key));

        return undefined;
    }

    /**
     * Cache a bot that has been sent to the client in memory for later use post-raid to determine if player killed a traitor scav
     * @param botToStore Bot object to store
     */
    public storeUsedBot(botToStore: IBotBase): void {
        this.activeBotsInRaid.push(botToStore);
    }

    /**
     * Get a bot by its profileId that has been generated and sent to client for current raid
     * Cache is wiped post-raid in client/match/offline/end  endOfflineRaid()
     * @param profileId Id of bot to get
     * @returns IBotBase
     */
    public getUsedBot(profileId: string): IBotBase {
        return this.activeBotsInRaid.find((x) => x._id === profileId);
    }

    /**
     * Remove all cached bot profiles from memory
     */
    public clearStoredBots(): void {
        this.storedBots = new Map();
        this.activeBotsInRaid = [];
    }

    /**
     * Does cache have a bot with requested key
     * @returns false if empty
     */
    public cacheHasBotWithKey(key: string, size = 0): boolean {
        return this.storedBots.has(key) && this.storedBots.get(key).length > size;
    }

    public getCachedBotCount(key: string): number {
        return this.storedBots.get(key)?.length ?? 0;
    }

    public createCacheKey(role: string, difficulty: string): string {
        return `${role.toLowerCase()}${difficulty.toLowerCase()}`;
    }
}
