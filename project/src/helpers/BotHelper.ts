import { inject, injectable } from "tsyringe";

import { MinMax } from "@spt-aki/models/common/MinMax";
import { Difficulty, IBotType } from "@spt-aki/models/eft/common/tables/IBotType";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { EquipmentFilters, IBotConfig, RandomisationDetails } from "@spt-aki/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt-aki/models/spt/config/IPmcConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class BotHelper
{
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Get a template object for the specified botRole from bots.types db
     * @param role botRole to get template for
     * @returns IBotType object
     */
    public getBotTemplate(role: string): IBotType
    {
        return this.databaseServer.getTables().bots.types[role.toLowerCase()];
    }

    /**
     * Randomize the chance the PMC will attack their own side
     * Look up value in bot.json/chanceSameSideIsHostilePercent
     * @param difficultySettings pmc difficulty settings
     */
    public randomizePmcHostility(difficultySettings: Difficulty): void
    {
        if (this.randomUtil.getChance100(this.pmcConfig.chanceSameSideIsHostilePercent))
        {
            difficultySettings.Mind.CAN_RECEIVE_PLAYER_REQUESTS_BEAR = false;
            difficultySettings.Mind.CAN_RECEIVE_PLAYER_REQUESTS_USEC = false;
            difficultySettings.Mind.DEFAULT_USEC_BEHAVIOUR = "Attack";
            difficultySettings.Mind.DEFAULT_BEAR_BEHAVIOUR = "Attack";
        }
    }

    /**
     * Is the passed in bot role a PMC (usec/bear/pmc)
     * @param botRole bot role to check
     * @returns true if is pmc
     */
    public isBotPmc(botRole: string): boolean
    {
        return (["usec", "bear", "pmc", "sptbear", "sptusec"].includes(botRole?.toLowerCase()));
    }

    public isBotBoss(botRole: string): boolean
    {
        return this.botConfig.bosses.some((x) => x.toLowerCase() === botRole?.toLowerCase());
    }

    public isBotFollower(botRole: string): boolean
    {
        return botRole?.toLowerCase().startsWith("follower");
    }

    /**
     * Add a bot to the FRIENDLY_BOT_TYPES array
     * @param difficultySettings bot settings to alter
     * @param typeToAdd bot type to add to friendly list
     */
    public addBotToFriendlyList(difficultySettings: Difficulty, typeToAdd: string): void
    {
        const friendlyBotTypesKey = "FRIENDLY_BOT_TYPES";

        // Null guard
        if (!difficultySettings.Mind[friendlyBotTypesKey])
        {
            difficultySettings.Mind[friendlyBotTypesKey] = [];
        }

        (<string[]>difficultySettings.Mind[friendlyBotTypesKey]).push(typeToAdd);
    }

    /**
     * Add a bot to the ENEMY_BOT_TYPES array, do not add itself if its on the enemy list
     * @param difficultySettings bot settings to alter
     * @param typesToAdd bot type to add to enemy list
     */
    public addBotToEnemyList(difficultySettings: Difficulty, typesToAdd: string[], typeBeingEdited: string): void
    {
        const enemyBotTypesKey = "ENEMY_BOT_TYPES";

        // Null guard
        if (!difficultySettings.Mind[enemyBotTypesKey])
        {
            difficultySettings.Mind[enemyBotTypesKey] = [];
        }

        const enemyArray = <string[]>difficultySettings.Mind[enemyBotTypesKey];
        for (const botTypeToAdd of typesToAdd)
        {
            if (botTypeToAdd.toLowerCase() === typeBeingEdited.toLowerCase())
            {
                this.logger.debug(`unable to add enemy ${botTypeToAdd} to its own enemy list, skipping`);
                continue;
            }

            if (!enemyArray.includes(botTypeToAdd))
            {
                enemyArray.push(botTypeToAdd);
            }
        }
    }

    /**
     * Add a bot to the REVENGE_BOT_TYPES array
     * @param difficultySettings bot settings to alter
     * @param typesToAdd bot type to add to revenge list
     */
    public addBotToRevengeList(difficultySettings: Difficulty, typesToAdd: string[]): void
    {
        const revengePropKey = "REVENGE_BOT_TYPES";

        // Nothing to add
        if (!typesToAdd)
        {
            return;
        }

        // Null guard
        if (!difficultySettings.Mind[revengePropKey])
        {
            difficultySettings.Mind[revengePropKey] = [];
        }

        const revengeArray = <string[]>difficultySettings.Mind[revengePropKey];
        for (const botTypeToAdd of typesToAdd)
        {
            if (!revengeArray.includes(botTypeToAdd))
            {
                revengeArray.push(botTypeToAdd);
            }
        }
    }

    /**
     * Choose if a bot should become a PMC by checking if bot type is allowed to become a Pmc in botConfig.convertFromChances and doing a random int check
     * @param botRole the bot role to check if should be a pmc
     * @returns true if should be a pmc
     */
    public shouldBotBePmc(botRole: string): boolean
    {
        const botRoleLowered = botRole.toLowerCase();

        // Handle when map waves have these types in the bot type
        if (this.botRoleIsPmc(botRoleLowered))
        {
            return true;
        }

        const botConvertMinMax = this.pmcConfig.convertIntoPmcChance[botRoleLowered];

        // no bot type defined in config, default to false
        if (!botConvertMinMax)
        {
            return false;
        }

        return this.rollChanceToBePmc(botRoleLowered, botConvertMinMax);
    }

    public rollChanceToBePmc(role: string, botConvertMinMax: MinMax): boolean
    {
        return role.toLowerCase() in this.pmcConfig.convertIntoPmcChance
            && this.randomUtil.getChance100(this.randomUtil.getInt(botConvertMinMax.min, botConvertMinMax.max));
    }

    public botRoleIsPmc(botRole: string): boolean
    {
        return [this.pmcConfig.usecType.toLowerCase(), this.pmcConfig.bearType.toLowerCase()].includes(
            botRole.toLowerCase(),
        );
    }

    /**
     * Get randomization settings for bot from config/bot.json
     * @param botLevel level of bot
     * @param botEquipConfig bot equipment json
     * @returns RandomisationDetails
     */
    public getBotRandomizationDetails(botLevel: number, botEquipConfig: EquipmentFilters): RandomisationDetails
    {
        // No randomisation details found, skip
        if (!botEquipConfig || Object.keys(botEquipConfig).length === 0 || !botEquipConfig.randomisation)
        {
            return null;
        }

        return botEquipConfig.randomisation.find((x) => botLevel >= x.levelRange.min && botLevel <= x.levelRange.max);
    }

    /**
     * Choose between sptBear and sptUsec at random based on the % defined in pmcConfig.isUsec
     * @returns pmc role
     */
    public getRandomizedPmcRole(): string
    {
        return (this.randomUtil.getChance100(this.pmcConfig.isUsec))
            ? this.pmcConfig.usecType
            : this.pmcConfig.bearType;
    }

    /**
     * Get the corresponding side when sptBear or sptUsec is passed in
     * @param botRole role to get side for
     * @returns side (usec/bear)
     */
    public getPmcSideByRole(botRole: string): string
    {
        switch (botRole.toLowerCase())
        {
            case this.pmcConfig.bearType.toLowerCase():
                return "Bear";
            case this.pmcConfig.usecType.toLowerCase():
                return "Usec";
            default:
                return this.getRandomizedPmcSide();
        }
    }

    /**
     * Get a randomized PMC side based on bot config value 'isUsec'
     * @returns pmc side as string
     */
    protected getRandomizedPmcSide(): string
    {
        return (this.randomUtil.getChance100(this.pmcConfig.isUsec)) ? "Usec" : "Bear";
    }
}
