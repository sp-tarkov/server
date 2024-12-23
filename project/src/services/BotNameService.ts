import { BotHelper } from "@spt/helpers/BotHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IBotBase } from "@spt/models/eft/common/tables/IBotBase";
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

        // Never show for players
        const showTypeInNickname = !botGenerationDetails.isPlayerScav && this.botConfig.showTypeInNickname;
        const roleShouldBeUnique = uniqueRoles?.includes(botRole.toLowerCase());

        let isUnique = true;
        let attempts = 0;
        while (attempts <= 5) {
            // Get bot name with leading/trailing whitespace removed
            let name = isPmc // Explicit handling of PMCs, all other bots will get "first_name last_name"
                ? this.botHelper.getPmcNicknameOfMaxLength(this.botConfig.botNameLengthLimit, botGenerationDetails.side)
                : `${this.randomUtil.getArrayValue(botJsonTemplate.firstName)} ${this.randomUtil.getArrayValue(botJsonTemplate.lastName) || ""}`;
            name = name.trim();

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
     * Add random PMC name to bots MainProfileNickname property
     * @param bot Bot to update
     */
    public addRandomPmcNameToBotMainProfileNicknameProperty(bot: IBotBase): void {
        // Simulate bot looking like a player scav with the PMC name in brackets.
        // E.g. "ScavName (PMC Name)"
        bot.Info.MainProfileNickname = this.getRandomPMCName();
    }

    /**
     * Choose a random PMC name from bear or usec bot jsons
     * @returns PMC name as string
     */
    protected getRandomPMCName(): string {
        const bots = this.databaseService.getBots().types;

        const pmcNames = new Set([...bots.usec.firstName, ...bots.bear.firstName]);
        return this.randomUtil.getArrayValue(Array.from(pmcNames));
    }
}
