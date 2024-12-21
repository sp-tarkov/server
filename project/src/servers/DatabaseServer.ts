import type { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import { injectable } from "tsyringe";

@injectable()
export class DatabaseServer {
    protected tableData: IDatabaseTables = {
        bots: undefined,
        hideout: undefined,
        locales: undefined,
        locations: undefined,
        match: undefined,
        templates: undefined,
        traders: undefined,
        globals: undefined,
        server: undefined,
        settings: undefined,
    };

    public getTables(): IDatabaseTables {
        return this.tableData;
    }

    public setTables(tableData: IDatabaseTables): void {
        this.tableData = tableData;
    }
}
