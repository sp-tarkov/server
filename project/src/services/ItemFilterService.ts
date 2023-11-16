import { inject, injectable } from "tsyringe";

import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IItemConfig } from "@spt-aki/models/spt/config/IItemConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";

/** Centralise the handling of blacklisting items, uses blacklist found in config/item.json, stores items that should not be used by players / broken items */
@injectable()
export class ItemFilterService
{
    protected itemConfig: IItemConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.itemConfig = this.configServer.getConfig(ConfigTypes.ITEM);
    }

    /**
     * Check if the provided template id is blacklisted in config/item.json
     * @param tpl template id
     * @returns true if blacklisted
     */
    public isItemBlacklisted(tpl: string): boolean
    {
        return this.itemConfig.blacklist.includes(tpl);
    }

    /**
     * Return every template id blacklisted in config/item.json
     * @returns string array of blacklisted tempalte ids
     */
    public getBlacklistedItems(): string[]
    {
        return this.itemConfig.blacklist;
    }

    /**
     * Check if the provided template id is boss item in config/item.json
     * @param tpl template id
     * @returns true if boss item
     */
    public isBossItem(tpl: string): boolean
    {
        return this.itemConfig.bossItems.includes(tpl);
    }

    /**
     * Return boss items in config/item.json
     * @returns string array of boss item tempalte ids
     */
    public getBossItems(): string[]
    {
        return this.itemConfig.bossItems;
    }
}
