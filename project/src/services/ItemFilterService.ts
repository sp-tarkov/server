import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IItemConfig } from "@spt/models/spt/config/IItemConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

/** Centralise the handling of blacklisting items, uses blacklist found in config/item.json, stores items that should not be used by players / broken items */
@injectable()
export class ItemFilterService {
    protected itemConfig: IItemConfig;
    protected itemBlacklistCache: Set<string> = new Set<string>();
    protected lootableItemBlacklistCache: Set<string> = new Set<string>();

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.itemConfig = this.configServer.getConfig(ConfigTypes.ITEM);
    }

    /**
     * Check if the provided template id is blacklisted in config/item.json/blacklist
     * @param tpl template id
     * @returns true if blacklisted
     */
    public isItemBlacklisted(tpl: string): boolean {
        if (this.itemBlacklistCache.size === 0) {
            for (const item of this.itemConfig.blacklist) {
                this.itemBlacklistCache.add(item);
            }
        }

        return this.itemBlacklistCache.has(tpl);
    }

    /**
     * Check if the provided template id is blacklisted in config/item.json/lootableItemBlacklist
     * @param tpl template id
     * @returns true if blacklisted
     */
    public isLootableItemBlacklisted(tpl: string): boolean {
        if (this.lootableItemBlacklistCache.size === 0) {
            for (const item of this.itemConfig.lootableItemBlacklist) {
                this.itemBlacklistCache.add(item);
            }
        }

        return this.lootableItemBlacklistCache.has(tpl);
    }

    /**
     * Check if item is blacklisted from being a reward for player
     * @param tpl item tpl to check is on blacklist
     * @returns True when blacklisted
     */
    public isItemRewardBlacklisted(tpl: string): boolean {
        return this.itemConfig.rewardItemBlacklist.includes(tpl);
    }

    /**
     * Get an array of items that should never be given as a reward to player
     * @returns string array of item tpls
     */
    public getItemRewardBlacklist(): string[] {
        return this.cloner.clone(this.itemConfig.rewardItemBlacklist);
    }

    /**
     * Get an array of item types that should never be given as a reward to player
     * @returns string array of item base ids
     */
    public getItemRewardBaseTypeBlacklist(): string[] {
        return this.cloner.clone(this.itemConfig.rewardItemTypeBlacklist);
    }

    /**
     * Return every template id blacklisted in config/item.json
     * @returns string array of blacklisted tempalte ids
     */
    public getBlacklistedItems(): string[] {
        return this.cloner.clone(this.itemConfig.blacklist);
    }

    /**
     * Return every template id blacklisted in config/item.json/lootableItemBlacklist
     * @returns string array of blacklisted tempalte ids
     */
    public getBlacklistedLootableItems(): string[] {
        return this.cloner.clone(this.itemConfig.lootableItemBlacklist);
    }

    /**
     * Check if the provided template id is boss item in config/item.json
     * @param tpl template id
     * @returns true if boss item
     */
    public isBossItem(tpl: string): boolean {
        return this.itemConfig.bossItems.includes(tpl);
    }

    /**
     * Return boss items in config/item.json
     * @returns string array of boss item tempalte ids
     */
    public getBossItems(): string[] {
        return this.cloner.clone(this.itemConfig.bossItems);
    }
}
