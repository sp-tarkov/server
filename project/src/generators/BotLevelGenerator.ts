import { inject, injectable } from "tsyringe";

import { MinMax } from "@spt-aki/models/common/MinMax";
import { IRandomisedBotLevelResult } from "@spt-aki/models/eft/bot/IRandomisedBotLevelResult";
import { IExpTable } from "@spt-aki/models/eft/common/IGlobals";
import { IBotBase } from "@spt-aki/models/eft/common/tables/IBotBase";
import { BotGenerationDetails } from "@spt-aki/models/spt/bots/BotGenerationDetails";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class BotLevelGenerator
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
    )
    {}

    /**
     * Return a randomised bot level and exp value
     * @param levelDetails min and max of level for bot
     * @param botGenerationDetails Deatils to help generate a bot
     * @param bot being level is being generated for
     * @returns IRandomisedBotLevelResult object
     */
    public generateBotLevel(
        levelDetails: MinMax,
        botGenerationDetails: BotGenerationDetails,
        bot: IBotBase,
    ): IRandomisedBotLevelResult
    {
        const expTable = this.databaseServer.getTables().globals.config.exp.level.exp_table;
        const highestLevel = this.getHighestRelativeBotLevel(
            botGenerationDetails.playerLevel,
            botGenerationDetails.botRelativeLevelDeltaMax,
            levelDetails,
            expTable,
        );
        const lowestLevel = this.getLowestRelativeBotLevel(
            botGenerationDetails.playerLevel,
            botGenerationDetails.botRelativeLevelDeltaMin,
            levelDetails,
            expTable,
        );

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
     * @param playerLevel Players current level
     * @param relativeDeltaMax max delta above player level to go
     * @returns highest level possible for bot
     */
    protected getHighestRelativeBotLevel(
        playerLevel: number,
        relativeDeltaMax: number,
        levelDetails: MinMax,
        expTable: IExpTable[],
    ): number
    {
        // Some bots have a max level of 1
        const maxPossibleLevel = Math.min(levelDetails.max, expTable.length);

        let level = playerLevel + relativeDeltaMax;
        if (level > maxPossibleLevel)
        {
            level = maxPossibleLevel;
        }

        return level;
    }

    /**
     * Get the lowest level a bot can be relative to the players level, but no lower than 1
     * @param playerLevel Players current level
     * @param relativeDeltaMin Min delta below player level to go
     * @returns lowest level possible for bot
     */
    protected getLowestRelativeBotLevel(
        playerLevel: number,
        relativeDeltaMin: number,
        levelDetails: MinMax,
        expTable: IExpTable[],
    ): number
    {
        // Some bots have a max level of 1
        const minPossibleLevel = Math.min(levelDetails.min, expTable.length);

        let level = playerLevel - relativeDeltaMin;
        if (level < minPossibleLevel)
        {
            level = minPossibleLevel;
        }

        return level;
    }
}
