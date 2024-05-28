import { inject, injectable } from "tsyringe";
import { BotInventoryGenerator } from "@spt/generators/BotInventoryGenerator";
import { BotLevelGenerator } from "@spt/generators/BotLevelGenerator";
import { BotDifficultyHelper } from "@spt/helpers/BotDifficultyHelper";
import { BotHelper } from "@spt/helpers/BotHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { IWildBody } from "@spt/models/eft/common/IGlobals";
import {
    Common,
    IBaseJsonSkills,
    IBaseSkill,
    IBotBase,
    Info,
    Health as PmcHealth,
    Skills as botSkills,
} from "@spt/models/eft/common/tables/IBotBase";
import { Appearance, Health, IBotType } from "@spt/models/eft/common/tables/IBotType";
import { Item, Upd } from "@spt/models/eft/common/tables/IItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { BotGenerationDetails } from "@spt/models/spt/bots/BotGenerationDetails";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { BotEquipmentFilterService } from "@spt/services/BotEquipmentFilterService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";

@injectable()
export class BotGenerator
{
    protected botConfig: IBotConfig;
    protected pmcConfig: IPmcConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("BotInventoryGenerator") protected botInventoryGenerator: BotInventoryGenerator,
        @inject("BotLevelGenerator") protected botLevelGenerator: BotLevelGenerator,
        @inject("BotEquipmentFilterService") protected botEquipmentFilterService: BotEquipmentFilterService,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("BotHelper") protected botHelper: BotHelper,
        @inject("BotDifficultyHelper") protected botDifficultyHelper: BotDifficultyHelper,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    )
    {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Generate a player scav bot object
     * @param role e.g. assault / pmcbot
     * @param difficulty easy/normal/hard/impossible
     * @param botTemplate base bot template to use  (e.g. assault/pmcbot)
     * @returns
     */
    public generatePlayerScav(sessionId: string, role: string, difficulty: string, botTemplate: IBotType): IBotBase
    {
        let bot = this.getCloneOfBotBase();
        bot.Info.Settings.BotDifficulty = difficulty;
        bot.Info.Settings.Role = role;
        bot.Info.Side = "Savage";

        const botGenDetails: BotGenerationDetails = {
            isPmc: false,
            side: "Savage",
            role: role,
            botRelativeLevelDeltaMax: 0,
            botRelativeLevelDeltaMin: 0,
            botCountToGenerate: 1,
            botDifficulty: difficulty,
            isPlayerScav: true,
        };

        bot = this.generateBot(sessionId, bot, botTemplate, botGenDetails);

        return bot;
    }

    /**
     * Create 1  bots of the type/side/difficulty defined in botGenerationDetails
     * @param sessionId Session id
     * @param botGenerationDetails details on how to generate bots
     * @returns constructed bot
     */
    public prepareAndGenerateBot(sessionId: string, botGenerationDetails: BotGenerationDetails): IBotBase
    {
        let bot = this.getCloneOfBotBase();
        bot.Info.Settings.Role = botGenerationDetails.eventRole
            ? botGenerationDetails.eventRole
            : botGenerationDetails.role;
        bot.Info.Side = botGenerationDetails.side;
        bot.Info.Settings.BotDifficulty = botGenerationDetails.botDifficulty;

        // Get raw json data for bot (Cloned)
        const botJsonTemplateClone = this.cloner.clone(
            this.botHelper.getBotTemplate(botGenerationDetails.isPmc ? bot.Info.Side : botGenerationDetails.role),
        );

        bot = this.generateBot(sessionId, bot, botJsonTemplateClone, botGenerationDetails);

        return bot;
    }

    /**
     * Get a clone of the database\bots\base.json file
     * @returns IBotBase object
     */
    protected getCloneOfBotBase(): IBotBase
    {
        return this.cloner.clone(this.databaseService.getBots().base);
    }

    /**
     * Create a IBotBase object with equipment/loot/exp etc
     * @param sessionId Session id
     * @param bot bots base file
     * @param botJsonTemplate Bot template from db/bots/x.json
     * @param botGenerationDetails details on how to generate the bot
     * @returns IBotBase object
     */
    protected generateBot(
        sessionId: string,
        bot: IBotBase,
        botJsonTemplate: IBotType,
        botGenerationDetails: BotGenerationDetails,
    ): IBotBase
    {
        const botRole = botGenerationDetails.role.toLowerCase();
        const botLevel = this.botLevelGenerator.generateBotLevel(
            botJsonTemplate.experience.level,
            botGenerationDetails,
            bot,
        );

        if (!botGenerationDetails.isPlayerScav)
        {
            this.botEquipmentFilterService.filterBotEquipment(
                sessionId,
                botJsonTemplate,
                botLevel.level,
                botGenerationDetails,
            );
        }

        bot.Info.Nickname = this.generateBotNickname(botJsonTemplate, botGenerationDetails, botRole, sessionId);

        if (!this.seasonalEventService.christmasEventEnabled())
        {
            // Process all bots EXCEPT gifter, he needs christmas items
            if (botGenerationDetails.role !== "gifter")
            {
                this.seasonalEventService.removeChristmasItemsFromBotInventory(
                    botJsonTemplate.inventory,
                    botGenerationDetails.role,
                );
            }
        }

        // Remove hideout data if bot is not a PMC or pscav
        if (!(botGenerationDetails.isPmc || botGenerationDetails.isPlayerScav))
        {
            bot.Hideout = undefined;
        }

        bot.Info.Experience = botLevel.exp;
        bot.Info.Level = botLevel.level;
        bot.Info.Settings.Experience = this.randomUtil.getInt(
            botJsonTemplate.experience.reward.min,
            botJsonTemplate.experience.reward.max,
        );
        bot.Info.Settings.StandingForKill = botJsonTemplate.experience.standingForKill;
        bot.Info.Voice = this.weightedRandomHelper.getWeightedValue<string>(botJsonTemplate.appearance.voice);
        bot.Health = this.generateHealth(botJsonTemplate.health, bot.Info.Side === "Savage");
        bot.Skills = this.generateSkills(<any>botJsonTemplate.skills); // TODO: fix bad type, bot jsons store skills in dict, output needs to be array

        this.setBotAppearance(bot, botJsonTemplate.appearance, botGenerationDetails);

        bot.Inventory = this.botInventoryGenerator.generateInventory(
            sessionId,
            botJsonTemplate,
            botRole,
            botGenerationDetails.isPmc,
            botLevel.level,
        );

        if (this.botHelper.isBotPmc(botRole))
        {
            this.getRandomisedGameVersionAndCategory(bot.Info);
            bot.Info.IsStreamerModeAvailable = true; // Set to true so client patches can pick it up later - client sometimes alters botrole to assaultGroup
        }

        if (this.botConfig.botRolesWithDogTags.includes(botRole))
        {
            this.addDogtagToBot(bot);
        }

        // Generate new bot ID
        this.generateId(bot);

        // Generate new inventory ID
        this.generateInventoryID(bot);

        // Set role back to originally requested now its been generated
        if (botGenerationDetails.eventRole)
        {
            bot.Info.Settings.Role = botGenerationDetails.eventRole;
        }

        return bot;
    }

    /**
     * Choose various appearance settings for a bot using weights
     * @param bot Bot to adjust
     * @param appearance Appearance settings to choose from
     * @param botGenerationDetails Generation details
     */
    protected setBotAppearance(
        bot: IBotBase,
        appearance: Appearance,
        botGenerationDetails: BotGenerationDetails,
    ): void
    {
        bot.Customization.Head = this.weightedRandomHelper.getWeightedValue<string>(appearance.head);
        bot.Customization.Body = this.weightedRandomHelper.getWeightedValue<string>(appearance.body);
        bot.Customization.Feet = this.weightedRandomHelper.getWeightedValue<string>(appearance.feet);
        bot.Customization.Hands = this.weightedRandomHelper.getWeightedValue<string>(appearance.hands);

        const bodyGlobalDict = this.databaseService.getGlobals().config.Customization.SavageBody;
        const chosenBodyTemplate = this.databaseService.getCustomization()[bot.Customization.Body];

        // Find the body/hands mapping
        const matchingBody: IWildBody = bodyGlobalDict[chosenBodyTemplate?._name];
        if (matchingBody?.isNotRandom)
        {
            // Has fixed hands for this body, set them
            bot.Customization.Hands = matchingBody.hands;
        }
    }

    /**
     * Create a bot nickname
     * @param botJsonTemplate x.json from database
     * @param botGenerationDetails
     * @param botRole role of bot e.g. assault
     * @param sessionId profile session id
     * @returns Nickname for bot
     */
    // TODO: Remove sessionId parameter from this function in v3.9.0
    protected generateBotNickname(
        botJsonTemplate: IBotType,
        botGenerationDetails: BotGenerationDetails,
        botRole: string,
        sessionId?: string, // @deprecated as of v3.8.1
    ): string
    {
        const isPlayerScav = botGenerationDetails.isPlayerScav;

        let name = `${this.randomUtil.getArrayValue(botJsonTemplate.firstName)} ${
            this.randomUtil.getArrayValue(botJsonTemplate.lastName) || ""
        }`;
        name = name.trim();

        // Simulate bot looking like a player scav with the PMC name in brackets.
        // E.g. "ScavName (PMCName)"
        if (botRole === "assault" && this.randomUtil.getChance100(this.botConfig.chanceAssaultScavHasPlayerScavName))
        {
            if (isPlayerScav)
            {
                return name;
            }

            const botTypes = this.databaseService.getBots().types; ;
            const pmcNames = [
                ...botTypes.usec.firstName,
                ...botTypes.bear.firstName,
            ];

            return `${name} (${this.randomUtil.getArrayValue(pmcNames)})`;
        }

        if (this.botConfig.showTypeInNickname && !isPlayerScav)
        {
            name += ` ${botRole}`;
        }

        // We want to replace pmc bot names with player name + prefix
        if (botGenerationDetails.isPmc && botGenerationDetails.allPmcsHaveSameNameAsPlayer)
        {
            const prefix = this.localisationService.getRandomTextThatMatchesPartialKey("pmc-name_prefix_");
            name = `${prefix} ${name}`;
        }

        return name;
    }

    /**
     * Log the number of PMCs generated to the debug console
     * @param output Generated bot array, ready to send to client
     */
    protected logPmcGeneratedCount(output: IBotBase[]): void
    {
        const pmcCount = output.reduce((acc, cur) =>
        {
            return cur.Info.Side === "Bear" || cur.Info.Side === "Usec" ? acc + 1 : acc;
        }, 0);
        this.logger.debug(`Generated ${output.length} total bots. Replaced ${pmcCount} with PMCs`);
    }

    /**
     * Converts health object to the required format
     * @param healthObj health object from bot json
     * @param playerScav Is a pscav bot being generated
     * @returns PmcHealth object
     */
    protected generateHealth(healthObj: Health, playerScav = false): PmcHealth
    {
        const bodyParts = playerScav ? healthObj.BodyParts[0] : this.randomUtil.getArrayValue(healthObj.BodyParts);

        const newHealth: PmcHealth = {
            Hydration: {
                Current: this.randomUtil.getInt(healthObj.Hydration.min, healthObj.Hydration.max),
                Maximum: healthObj.Hydration.max,
            },
            Energy: {
                Current: this.randomUtil.getInt(healthObj.Energy.min, healthObj.Energy.max),
                Maximum: healthObj.Energy.max,
            },
            Temperature: {
                Current: this.randomUtil.getInt(healthObj.Temperature.min, healthObj.Temperature.max),
                Maximum: healthObj.Temperature.max,
            },
            BodyParts: {
                Head: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.Head.min, bodyParts.Head.max),
                        Maximum: Math.round(bodyParts.Head.max),
                    },
                },
                Chest: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.Chest.min, bodyParts.Chest.max),
                        Maximum: Math.round(bodyParts.Chest.max),
                    },
                },
                Stomach: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.Stomach.min, bodyParts.Stomach.max),
                        Maximum: Math.round(bodyParts.Stomach.max),
                    },
                },
                LeftArm: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.LeftArm.min, bodyParts.LeftArm.max),
                        Maximum: Math.round(bodyParts.LeftArm.max),
                    },
                },
                RightArm: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.RightArm.min, bodyParts.RightArm.max),
                        Maximum: Math.round(bodyParts.RightArm.max),
                    },
                },
                LeftLeg: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.LeftLeg.min, bodyParts.LeftLeg.max),
                        Maximum: Math.round(bodyParts.LeftLeg.max),
                    },
                },
                RightLeg: {
                    Health: {
                        Current: this.randomUtil.getInt(bodyParts.RightLeg.min, bodyParts.RightLeg.max),
                        Maximum: Math.round(bodyParts.RightLeg.max),
                    },
                },
            },
            UpdateTime: this.timeUtil.getTimestamp(),
        };

        return newHealth;
    }

    /**
     * Get a bots skills with randomsied progress value between the min and max values
     * @param botSkills Skills that should have their progress value randomised
     * @returns
     */
    protected generateSkills(botSkills: IBaseJsonSkills): botSkills
    {
        const skillsToReturn: botSkills = {
            Common: this.getSkillsWithRandomisedProgressValue(botSkills.Common, true),
            Mastering: this.getSkillsWithRandomisedProgressValue(botSkills.Mastering, false),
            Points: 0,
        };

        return skillsToReturn;
    }

    /**
     * Randomise the progress value of passed in skills based on the min/max value
     * @param skills Skills to randomise
     * @param isCommonSkills Are the skills 'common' skills
     * @returns Skills with randomised progress values as an array
     */
    protected getSkillsWithRandomisedProgressValue(
        skills: Record<string, IBaseSkill>,
        isCommonSkills: boolean,
    ): IBaseSkill[]
    {
        if (Object.keys(skills ?? []).length === 0)
        {
            return [];
        }

        return Object.keys(skills)
            .map((skillKey): IBaseSkill =>
            {
                // Get skill from dict, skip if not found
                const skill = skills[skillKey];
                if (!skill)
                {
                    return undefined;
                }

                // All skills have id and progress props
                const skillToAdd: IBaseSkill = { Id: skillKey, Progress: this.randomUtil.getInt(skill.min, skill.max) };

                // Common skills have additional props
                if (isCommonSkills)
                {
                    (skillToAdd as Common).PointsEarnedDuringSession = 0;
                    (skillToAdd as Common).LastAccess = 0;
                }

                return skillToAdd;
            })
            .filter((x) => x !== undefined);
    }

    /**
     * Generate a random Id for a bot and apply to bots _id and aid value
     * @param bot bot to update
     * @returns updated IBotBase object
     */
    protected generateId(bot: IBotBase): void
    {
        const botId = this.hashUtil.generate();

        bot._id = botId;
        bot.aid = this.hashUtil.generateAccountId();
    }

    protected generateInventoryID(profile: IBotBase): void
    {
        const defaultInventory = "55d7217a4bdc2d86028b456d";
        const itemsByParentHash: Record<string, Item[]> = {};
        const inventoryItemHash: Record<string, Item> = {};

        // Generate inventoryItem list
        let inventoryId = "";
        for (const item of profile.Inventory.items)
        {
            inventoryItemHash[item._id] = item;

            if (item._tpl === defaultInventory)
            {
                inventoryId = item._id;
                continue;
            }

            if (!("parentId" in item))
            {
                continue;
            }

            if (!(item.parentId in itemsByParentHash))
            {
                itemsByParentHash[item.parentId] = [];
            }

            itemsByParentHash[item.parentId].push(item);
        }

        // update inventoryId
        const newInventoryId = this.hashUtil.generate();
        inventoryItemHash[inventoryId]._id = newInventoryId;
        profile.Inventory.equipment = newInventoryId;

        // update inventoryItem id
        if (inventoryId in itemsByParentHash)
        {
            for (const item of itemsByParentHash[inventoryId])
            {
                item.parentId = newInventoryId;
            }
        }
    }

    /**
     * Randomise a bots game version and account category
     * Chooses from all the game versions (standard, eod etc)
     * Chooses account type (default, Sherpa, etc)
     * @param botInfo bot info object to update
     */
    protected getRandomisedGameVersionAndCategory(botInfo: Info): void
    {
        if (botInfo.Nickname.toLowerCase() === "nikita")
        {
            botInfo.GameVersion = "edge_of_darkness";
            botInfo.MemberCategory = MemberCategory.DEVELOPER;

            return;
        }

        // more color = more op
        botInfo.GameVersion = this.weightedRandomHelper.getWeightedValue(this.pmcConfig.gameVersionWeight);
        botInfo.MemberCategory = Number.parseInt(
            this.weightedRandomHelper.getWeightedValue(this.pmcConfig.accountTypeWeight),
        );
    }

    /**
     * Add a side-specific (usec/bear) dogtag item to a bots inventory
     * @param bot bot to add dogtag to
     * @returns Bot with dogtag added
     */
    protected addDogtagToBot(bot: IBotBase): void
    {
        const dogtagUpd: Upd = {
            SpawnedInSession: true,
            Dogtag: {
                AccountId: bot.sessionId,
                ProfileId: bot._id,
                Nickname: bot.Info.Nickname,
                Side: bot.Info.Side,
                Level: bot.Info.Level,
                Time: new Date().toISOString(),
                Status: "Killed by ",
                KillerAccountId: "Unknown",
                KillerProfileId: "Unknown",
                KillerName: "Unknown",
                WeaponName: "Unknown",
            },
        };

        const inventoryItem: Item = {
            _id: this.hashUtil.generate(),
            _tpl: bot.Info.Side === "Usec" ? BaseClasses.DOG_TAG_USEC : BaseClasses.DOG_TAG_BEAR,
            parentId: bot.Inventory.equipment,
            slotId: "Dogtag",
            location: undefined,
            upd: dogtagUpd,
        };

        bot.Inventory.items.push(inventoryItem);
    }
}
