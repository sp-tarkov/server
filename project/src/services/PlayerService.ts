import { inject, injectable } from "tsyringe";

import { IPmcData } from "../models/eft/common/IPmcData";
import { Common } from "../models/eft/common/tables/IBotBase";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { LocalisationService } from "./LocalisationService";

@injectable()
export class PlayerService
{

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer
    )
    { }

    /**
     * increases the profile skill and updates any output
     * @param {Object} pmcData
     * @param {String} skillName
     * @param {Number} amount
     */
    public incrementSkillLevel(pmcData: IPmcData, skillName: string, amount: number): void
    {
        const profileSkill: Common = pmcData.Skills.Common.find(skill => skill.Id === skillName);

        if (!amount || amount < 0)
        {
            this.logger.error(this.localisationService.getText("player-attempt_to_increment_skill_with_negative_value", skillName));
            return;
        }

        profileSkill.Progress += amount;
    }

    /**
     * @param {Object} pmcData
     * @returns number
     */
    public calculateLevel(pmcData: IPmcData): number
    {
        let exp = 0;

        for (const level in this.databaseServer.getTables().globals.config.exp.level.exp_table)
        {
            if (pmcData.Info.Experience < exp)
            {
                break;
            }

            pmcData.Info.Level = parseInt(level);
            exp += this.databaseServer.getTables().globals.config.exp.level.exp_table[level].exp;
        }

        return pmcData.Info.Level;
    }
}