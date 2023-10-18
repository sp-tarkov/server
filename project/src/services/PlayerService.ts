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
        @inject("DatabaseServer") protected databaseServer: DatabaseServer
    )
    { }

    /**
     * Dupe of QuestHelper.rewardsSkillPoints()
     * Add xp to a player skill
     * @param pmcData Player profile
     * @param skillName Name of skill to increment
     * @param amount Amount of skill points to add to skill
     * @param useSkillProgressRateMultipler Skills are multiplied by a value in globals, default is off to maintain compatibility with legacy code
     */
    public incrementSkillLevel(pmcData: IPmcData, skillName: string, amount: number, useSkillProgressRateMultipler = false): void
    {
        if (!amount || amount < 0)
        {
            this.logger.error(this.localisationService.getText("player-attempt_to_increment_skill_with_negative_value", skillName));
            return;
        }

        const profileSkill = pmcData.Skills.Common.find(skill => skill.Id === skillName);
        if (!profileSkill)
        {
            this.logger.error(this.localisationService.getText("quest-no_skill_found", skillName));

            return;
        }

        if (useSkillProgressRateMultipler)
        {
            const globals = this.databaseServer.getTables().globals;
            const skillProgressRate = globals.config.SkillsSettings.SkillProgressRate;
            amount = skillProgressRate * amount;
        }

        profileSkill.Progress += amount;
        profileSkill.LastAccess = this.timeUtil.getTimestamp();
    }

    /**
     * Get level of player
     * @param pmcData Player profile
     * @returns Level of player
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