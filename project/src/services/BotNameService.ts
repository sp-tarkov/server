import { BotHelper } from "@spt/helpers/BotHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IBotType } from "@spt/models/eft/common/tables/IBotType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IBotGenerationDetails } from "@spt/models/spt/bots/BotGenerationDetails";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";
import { DatabaseService } from "./DatabaseService";
import { LocalisationService } from "./LocalisationService";

@injectable()
export class BotNameService {
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;
    protected usedNameCache: Set<string>;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);

        this.usedNameCache = new Set<string>();
    }

    /**
     * Clear out any entries in Name Set
     */
    public clearNameCache() {
        this.usedNameCache.clear();
    }

    /**
     * Create a unique bot nickname
     * @param botJsonTemplate bot JSON data from db
     * @param botGenerationDetails
     * @param botRole role of bot e.g. assault
     * @param uniqueRoles Lowercase roles to always make unique
     * @param sessionId OPTIONAL: profile session id
     * @returns Nickname for bot
     */
    public generateUniqueBotNickname(
        botJsonTemplate: IBotType,
        botGenerationDetails: IBotGenerationDetails,
        botRole: string,
        uniqueRoles?: string[],
    ): string {
        const isPmc = botGenerationDetails.isPmc;
        const isPlayerScav = botGenerationDetails.isPlayerScav;
        const simulateScavName = isPlayerScav ? false : this.shouldSimulatePlayerScavName(botRole);
        const showTypeInNickname = this.botConfig.showTypeInNickname && !isPlayerScav;
        const roleShouldBeUnique = uniqueRoles.includes(botRole.toLowerCase());

        let isUnique = true;
        let attempts = 0;
        while (attempts <= 5) {
            // Get bot name with leading/trailing whitespace removed
            let name = isPmc // Explicit handling of PMCs, all other bots will get "first_name last_name"
                ? this.botHelper.getPmcNicknameOfMaxLength(this.botConfig.botNameLengthLimit, botGenerationDetails.side)
                : `${this.randomUtil.getArrayValue(botJsonTemplate.firstName)} ${this.randomUtil.getArrayValue(botJsonTemplate.lastName) || ""}`;
            name = name.trim();

            // Simulate bot looking like a player scav with the PMC name in brackets.
            // E.g. "ScavName (PMC Name)"
            if (simulateScavName) {
                return this.addPlayerScavNameSimulationSuffix(name);
            }

            // Config is set to add role to end of bot name
            if (showTypeInNickname) {
                name += ` ${botRole}`;
            }

            // Replace pmc bot names with player name + prefix
            if (botGenerationDetails.isPmc && botGenerationDetails.allPmcsHaveSameNameAsPlayer) {
                const prefix = this.localisationService.getRandomTextThatMatchesPartialKey("pmc-name_prefix_");
                name = `${prefix} ${name}`;
            }

            // Is this a role that must be unique
            if (roleShouldBeUnique) {
                // Check name in cache
                isUnique = !this.usedNameCache.has(name);
                if (!isUnique) {
                    // Not unique
                    if (attempts >= 5) {
                        // 5 attempts to generate a name, pool probably isn't big enough
                        const genericName = `${botGenerationDetails.side} ${this.randomUtil.getInt(100000, 999999)}`;
                        this.logger.debug(
                            `Failed to find unique name for: ${name} after 5 attempts, using: ${genericName}`,
                        );
                        return genericName;
                    }

                    attempts++;

                    // Try again
                    continue;
                }
            }

            // Add bot name to cache to prevent being used again
            this.usedNameCache.add(name);

            return name;
        }
    }

    /**
     * Should this bot have a name like "name (Pmc Name)"
     * @param botRole Role bot has
     * @returns True if name should be simulated pscav
     */
    protected shouldSimulatePlayerScavName(botRole: string): boolean {
        return botRole === "assault" && this.randomUtil.getChance100(this.botConfig.chanceAssaultScavHasPlayerScavName);
    }

    protected addPlayerScavNameSimulationSuffix(nickname: string): string {
        const pmcNames = [
            ...this.databaseService.getBots().types.usec.firstName,
            ...this.databaseService.getBots().types.bear.firstName,
        ];
        return `${nickname} (${this.randomUtil.getArrayValue(pmcNames)})`;
    }
}
