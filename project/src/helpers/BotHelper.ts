import { MinMax } from "@spt/models/common/MinMax";
import { IBotType, IDifficultyCategories } from "@spt/models/eft/common/tables/IBotType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { EquipmentFilters, IBotConfig, IRandomisationDetails } from "@spt/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { max } from "date-fns";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotHelper {
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Get a template object for the specified botRole from bots.types db
     * @param role botRole to get template for
     * @returns IBotType object
     */
    public getBotTemplate(role: string): IBotType {
        return this.databaseService.getBots().types[role.toLowerCase()];
    }

    /**
     * Is the passed in bot role a PMC (usec/bear/pmc)
     * @param botRole bot role to check
     * @returns true if is pmc
     */
    public isBotPmc(botRole: string): boolean {
        return ["usec", "bear", "pmc", "pmcbear", "pmcusec"].includes(botRole?.toLowerCase());
    }

    public isBotBoss(botRole: string): boolean {
        return this.botConfig.bosses.some((x) => x.toLowerCase() === botRole?.toLowerCase());
    }

    public isBotFollower(botRole: string): boolean {
        return botRole?.toLowerCase().startsWith("follower");
    }

    /**
     * Add a bot to the FRIENDLY_BOT_TYPES array
     * @param difficultySettings bot settings to alter
     * @param typeToAdd bot type to add to friendly list
     */
    public addBotToFriendlyList(difficultySettings: IDifficultyCategories, typeToAdd: string): void {
        const friendlyBotTypesKey = "FRIENDLY_BOT_TYPES";

        // Null guard
        if (!difficultySettings.Mind[friendlyBotTypesKey]) {
            difficultySettings.Mind[friendlyBotTypesKey] = [];
        }

        (<string[]>difficultySettings.Mind[friendlyBotTypesKey]).push(typeToAdd);
    }

    /**
     * Add a bot to the REVENGE_BOT_TYPES array
     * @param difficultySettings bot settings to alter
     * @param typesToAdd bot type to add to revenge list
     */
    public addBotToRevengeList(difficultySettings: IDifficultyCategories, typesToAdd: string[]): void {
        const revengePropKey = "REVENGE_BOT_TYPES";

        // Nothing to add
        if (!typesToAdd) {
            return;
        }

        // Null guard
        if (!difficultySettings.Mind[revengePropKey]) {
            difficultySettings.Mind[revengePropKey] = [];
        }

        const revengeArray = <string[]>difficultySettings.Mind[revengePropKey];
        for (const botTypeToAdd of typesToAdd) {
            if (!revengeArray.includes(botTypeToAdd)) {
                revengeArray.push(botTypeToAdd);
            }
        }
    }

    public rollChanceToBePmc(botConvertMinMax: MinMax): boolean {
        return this.randomUtil.getChance100(this.randomUtil.getInt(botConvertMinMax.min, botConvertMinMax.max));
    }

    protected getPmcConversionValuesForLocation(location: string) {
        const result = this.pmcConfig.convertIntoPmcChance[location.toLowerCase()];
        if (!result) {
            this.pmcConfig.convertIntoPmcChance.default;
        }

        return result;
    }

    /**
     * is the provided role a PMC, case-agnostic
     * @param botRole Role to check
     * @returns True if role is PMC
     */
    public botRoleIsPmc(botRole: string): boolean {
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
    public getBotRandomizationDetails(
        botLevel: number,
        botEquipConfig: EquipmentFilters,
    ): IRandomisationDetails | undefined {
        // No randomisation details found, skip
        if (!botEquipConfig || Object.keys(botEquipConfig).length === 0 || !botEquipConfig.randomisation) {
            return undefined;
        }

        return botEquipConfig.randomisation.find(
            (randDetails) => botLevel >= randDetails.levelRange.min && botLevel <= randDetails.levelRange.max,
        );
    }

    /**
     * Choose between pmcBEAR and pmcUSEC at random based on the % defined in pmcConfig.isUsec
     * @returns pmc role
     */
    public getRandomizedPmcRole(): string {
        return this.randomUtil.getChance100(this.pmcConfig.isUsec) ? this.pmcConfig.usecType : this.pmcConfig.bearType;
    }

    /**
     * Get the corresponding side when pmcBEAR or pmcUSEC is passed in
     * @param botRole role to get side for
     * @returns side (usec/bear)
     */
    public getPmcSideByRole(botRole: string): string {
        switch (botRole.toLowerCase()) {
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
    protected getRandomizedPmcSide(): string {
        return this.randomUtil.getChance100(this.pmcConfig.isUsec) ? "Usec" : "Bear";
    }

    /**
     * Get a name from a PMC that fits the desired length
     * @param maxLength Max length of name, inclusive
     * @param side OPTIONAL - what side PMC to get name from (usec/bear)
     * @returns name of PMC
     */
    public getPmcNicknameOfMaxLength(maxLength: number, side?: string): string {
        const randomType = side ? side : this.randomUtil.getInt(0, 1) === 0 ? "usec" : "bear";
        const allNames = this.databaseService.getBots().types[randomType.toLowerCase()].firstName;
        const filteredNames = allNames.filter((name) => name.length <= maxLength);
        if (filteredNames.length === 0) {
            this.logger.warning(
                `Unable to filter: ${randomType} PMC names to only those under: ${maxLength}, none found that match that criteria, selecting from entire name pool instead`,
            );

            return this.randomUtil.getStringArrayValue(allNames);
        }

        return this.randomUtil.getStringArrayValue(filteredNames);
    }
}
