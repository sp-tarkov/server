import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ISeasonalEventConfig } from "@spt/models/spt/config/ISeasonalEventConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { inject, injectable } from "tsyringe";

@injectable()
export class GameEventHelper {
    protected seasonalEventConfig: ISeasonalEventConfig;

    constructor(
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.seasonalEventConfig = this.configServer.getConfig(ConfigTypes.SEASONAL_EVENT);
    }
}
