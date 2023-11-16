import { inject, injectable } from "tsyringe";

import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class PlayerService
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
    )
    {}

    /**
     * Get level of player
     * @param pmcData Player profile
     * @returns Level of player
     */
    public calculateLevel(pmcData: IPmcData): number
    {
        let accExp = 0;

        for (const [level, { exp }] of this.databaseServer.getTables().globals.config.exp.level.exp_table.entries())
        {
            accExp += exp;

            if (pmcData.Info.Experience < accExp)
            {
                break;
            }

            pmcData.Info.Level = level + 1;
        }

        return pmcData.Info.Level;
    }
}
