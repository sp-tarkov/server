import { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class PlayerService {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("DatabaseService") protected databaseService: DatabaseService,
    ) {}

    /**
     * Get level of player
     * @param pmcData Player profile
     * @returns Level of player
     */
    public calculateLevel(pmcData: IPmcData): number {
        let accExp = 0;

        for (const [level, { exp }] of this.databaseService.getGlobals().config.exp.level.exp_table.entries()) {
            accExp += exp;

            if (pmcData.Info.Experience < accExp) {
                break;
            }

            pmcData.Info.Level = level + 1;
        }

        return pmcData.Info.Level;
    }
}
