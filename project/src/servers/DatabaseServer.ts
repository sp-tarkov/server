import { injectable } from "tsyringe";

import { IDatabaseTables } from "@spt-aki/models/spt/server/IDatabaseTables";

@injectable()
export class DatabaseServer
{
    protected tableData: IDatabaseTables = {
        bots: undefined,
        hideout: undefined,
        locales: undefined,
        locations: undefined,
        loot: undefined,
        match: undefined,
        templates: undefined,
        traders: undefined,
        globals: undefined,
        server: undefined,
        settings: undefined,
    };

    public getTables(): IDatabaseTables
    {
        return this.tableData;
    }

    public setTables(tableData: IDatabaseTables): void
    {
        this.tableData = tableData;
    }
}
