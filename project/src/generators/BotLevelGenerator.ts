import { inject, injectable } from "tsyringe";
import { MinMax } from "@spt/models/common/MinMax";
import { IRandomisedBotLevelResult } from "@spt/models/eft/bot/IRandomisedBotLevelResult";
import { IBotBase } from "@spt/models/eft/common/tables/IBotBase";
import { BotGenerationDetails } from "@spt/models/spt/bots/BotGenerationDetails";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { RandomUtil } from "@spt/utils/RandomUtil";

@injectable()
export class BotLevelGenerator
{
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
    )
    {}

    /**
     * Return a randomised bot level and exp value
     * @param levelDetails Min and max of level for bot
     * @param botGenerationDetails Details to help generate a bot
     * @param bot Bot the level is being generated for
     * @returns IRandomisedBotLevelResult object
     */
    public generateBotLevel(
        levelDetails: MinMax,
        botGenerationDetails: BotGenerationDetails,
        bot: IBotBase,
    ): IRandomisedBotLevelResult
    {
        const expTable = this.databaseServer.getTables().globals.config.exp.level.exp_table;
        const highestLevel = this.getHighestRelativeBotLevel(botGenerationDetails, levelDetails, expTable.length);
        const lowestLevel = this.getLowestRelativeBotLevel(botGenerationDetails, levelDetails, expTable.length);

        // Get random level based on the exp table.
        let exp = 0;
        const level = this.randomUtil.getInt(lowestLevel, highestLevel);

        for (let i = 0; i < level; i++)
        {
            exp += expTable[i].exp;
        }

        // Sprinkle in some random exp within the level, unless we are at max level.
        if (level < expTable.length - 1)
        {
            exp += this.randomUtil.getInt(0, expTable[level].exp - 1);
        }

        return { level, exp };
    }

    /**
     * Get the highest level a bot can be relative to the players level, but no further than the max size from globals.exp_table
     * @param botGenerationDetails Details to help generate a bot
     * @param levelDetails
     * @param maxLevel Max possible level
     * @returns Highest level possible for bot
     */
    protected getHighestRelativeBotLevel(
        botGenerationDetails: BotGenerationDetails,
        levelDetails: MinMax,
        maxLevel: number,
    ): number
    {
        const maxPossibleLevel
            = botGenerationDetails.isPmc && botGenerationDetails.locationSpecificPmcLevelOverride
                ? Math.min(botGenerationDetails.locationSpecificPmcLevelOverride.max, maxLevel) // Was a PMC and they have a level override
                : Math.min(levelDetails.max, maxLevel); // Not pmc with override or non-pmc

        let level = botGenerationDetails.playerLevel + botGenerationDetails.botRelativeLevelDeltaMax;
        if (level > maxPossibleLevel)
        {
            level = maxPossibleLevel;
        }

        return level;
    }

    /**
     * Get the lowest level a bot can be relative to the players level, but no lower than 1
     * @param botGenerationDetails Details to help generate a bot
     * @param levelDetails
     * @param maxlevel Max level allowed
     * @returns Lowest level possible for bot
     */
    protected getLowestRelativeBotLevel(
        botGenerationDetails: BotGenerationDetails,
        levelDetails: MinMax,
        maxlevel: number,
    ): number
    {
        const minPossibleLevel
            = botGenerationDetails.isPmc && botGenerationDetails.locationSpecificPmcLevelOverride
                ? Math.min(
                    Math.max(levelDetails.min, botGenerationDetails.locationSpecificPmcLevelOverride.min), // Biggest between json min and the botgen min
                    maxlevel, // Fallback if value above is crazy (default is 79)
                )
                : Math.min(levelDetails.min, maxlevel); // Not pmc with override or non-pmc

        let level = botGenerationDetails.playerLevel - botGenerationDetails.botRelativeLevelDeltaMin;
        if (level < minPossibleLevel)
        {
            level = minPossibleLevel;
        }

        return level;
    }
}
