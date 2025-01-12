import { BotInventoryGenerator } from "@spt/generators/BotInventoryGenerator";
import { BotLevelGenerator } from "@spt/generators/BotLevelGenerator";
import { BotGeneratorHelper } from "@spt/helpers/BotGeneratorHelper";
import { BotHelper } from "@spt/helpers/BotHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { MinMax } from "@spt/models/common/MinMax";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import {
    Common,
    IBaseJsonSkills,
    IBaseSkill,
    IBotBase,
    IInfo,
    IHealth as PmcHealth,
    ISkills as botSkills,
} from "@spt/models/eft/common/tables/IBotBase";
import { IAppearance, IBodyPart, IBotType, IHealth, IInventory } from "@spt/models/eft/common/tables/IBotType";
import { IItem, IUpd } from "@spt/models/eft/common/tables/IItem";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { GameEditions } from "@spt/models/enums/GameEditions";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { SideType } from "@spt/models/enums/SideType";
import { IBotGenerationDetails } from "@spt/models/spt/bots/BotGenerationDetails";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IPmcConfig } from "@spt/models/spt/config/IPmcConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { BotEquipmentFilterService } from "@spt/services/BotEquipmentFilterService";
import { BotNameService } from "@spt/services/BotNameService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class BotGenerator {
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
        @inject("BotGeneratorHelper") protected botGeneratorHelper: BotGeneratorHelper,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("BotNameService") protected botNameService: BotNameService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
        this.pmcConfig = this.configServer.getConfig(ConfigTypes.PMC);
    }

    /**
     * Generate a player scav bot object
     * @param role e.g. assault / pmcbot
     * @param difficulty easy/normal/hard/impossible
     * @param botTemplate base bot template to use  (e.g. assault/pmcbot)
     * profile PMC profile of player generating pscav
     * @returns IBotBase
     */
    public generatePlayerScav(
        sessionId: string,
        role: string,
        difficulty: string,
        botTemplate: IBotType,
        profile: IPmcData,
    ): IBotBase {
        let bot = this.getCloneOfBotBase();
        bot.Info.Settings.BotDifficulty = difficulty;
        bot.Info.Settings.Role = role;
        bot.Info.Side = SideType.SAVAGE;

        const botGenDetails: IBotGenerationDetails = {
            isPmc: false,
            side: SideType.SAVAGE,
            role: role,
            botRelativeLevelDeltaMax: 0,
            botRelativeLevelDeltaMin: 0,
            botCountToGenerate: 1,
            botDifficulty: difficulty,
            isPlayerScav: true,
        };

        bot = this.generateBot(sessionId, bot, botTemplate, botGenDetails);

        // Sets the name after scav name shown in parenthesis
        bot.Info.MainProfileNickname = profile.Info.Nickname;

        return bot;
    }

    /**
     * Create 1 bot of the type/side/difficulty defined in botGenerationDetails
     * @param sessionId Session id
     * @param botGenerationDetails details on how to generate bots
     * @returns constructed bot
     */
    public async prepareAndGenerateBot(
        sessionId: string,
        botGenerationDetails: IBotGenerationDetails,
    ): Promise<IBotBase> {
        const preparedBotBase = this.getPreparedBotBase(
            botGenerationDetails.eventRole ?? botGenerationDetails.role, // Use eventRole if provided,
            botGenerationDetails.side,
            botGenerationDetails.botDifficulty,
        );

        // Get raw json data for bot (Cloned)
        const botRole = botGenerationDetails.isPmc
            ? preparedBotBase.Info.Side // Use side to get usec.json or bear.json when bot will be PMC
            : botGenerationDetails.role;
        const botJsonTemplateClone = await this.cloner.cloneAsync(this.botHelper.getBotTemplate(botRole));
        if (!botJsonTemplateClone) {
            this.logger.error(`Unable to retrieve: ${botRole} bot template, cannot generate bot of this type`);
        }

        return this.generateBot(sessionId, preparedBotBase, botJsonTemplateClone, botGenerationDetails);
    }

    /**
     * Get a clone of the default bot base object and adjust its role/side/difficulty values
     * @param botRole Role bot should have
     * @param botSide Side bot should have
     * @param difficulty Difficult bot should have
     * @returns Cloned bot base
     */
    protected getPreparedBotBase(botRole: string, botSide: string, difficulty: string): IBotBase {
        const botBaseClone = this.getCloneOfBotBase();
        botBaseClone.Info.Settings.Role = botRole;
        botBaseClone.Info.Side = botSide;
        botBaseClone.Info.Settings.BotDifficulty = difficulty;

        return botBaseClone;
    }

    /**
     * Get a clone of the database\bots\base.json file
     * @returns IBotBase object
     */
    protected getCloneOfBotBase(): IBotBase {
        return this.cloner.clone(this.databaseService.getBots().base);
    }

    /**
     * Create a IBotBase object with equipment/loot/exp etc
     * @param sessionId Session id
     * @param bot Bots base file
     * @param botJsonTemplate Bot template from db/bots/x.json
     * @param botGenerationDetails details on how to generate the bot
     * @returns IBotBase object
     */
    protected generateBot(
        sessionId: string,
        bot: IBotBase,
        botJsonTemplate: IBotType,
        botGenerationDetails: IBotGenerationDetails,
    ): IBotBase {
        const botRoleLowercase = botGenerationDetails.role.toLowerCase();
        const botLevel = this.botLevelGenerator.generateBotLevel(
            botJsonTemplate.experience.level,
            botGenerationDetails,
            bot,
        );

        // Only filter bot equipment, never players
        if (!botGenerationDetails.isPlayerScav) {
            this.botEquipmentFilterService.filterBotEquipment(
                sessionId,
                botJsonTemplate,
                botLevel.level,
                botGenerationDetails,
            );
        }

        bot.Info.Nickname = this.botNameService.generateUniqueBotNickname(
            botJsonTemplate,
            botGenerationDetails,
            botRoleLowercase,
            this.botConfig.botRolesThatMustHaveUniqueName,
        );
        bot.Info.LowerNickname = bot.Info.Nickname.toLowerCase();

        // Only run when generating a 'fake' playerscav, not actual player scav
        if (!botGenerationDetails.isPlayerScav && this.shouldSimulatePlayerScav(botRoleLowercase)) {
            this.botNameService.addRandomPmcNameToBotMainProfileNicknameProperty(bot);
            this.setRandomisedGameVersionAndCategory(bot.Info);
        }

        if (!this.seasonalEventService.christmasEventEnabled()) {
            // Process all bots EXCEPT gifter, he needs christmas items
            if (botGenerationDetails.role !== "gifter") {
                this.seasonalEventService.removeChristmasItemsFromBotInventory(
                    botJsonTemplate.inventory,
                    botGenerationDetails.role,
                );
            }
        }

        this.removeBlacklistedLootFromBotTemplate(botJsonTemplate.inventory);

        // Remove hideout data if bot is not a PMC or pscav - match what live sends
        if (!(botGenerationDetails.isPmc || botGenerationDetails.isPlayerScav)) {
            bot.Hideout = undefined;
        }

        bot.Info.Experience = botLevel.exp;
        bot.Info.Level = botLevel.level;
        bot.Info.Settings.Experience = this.getExperienceRewardForKillByDifficulty(
            botJsonTemplate.experience.reward,
            botGenerationDetails.botDifficulty,
            botGenerationDetails.role,
        );
        bot.Info.Settings.StandingForKill = this.getStandingChangeForKillByDifficulty(
            botJsonTemplate.experience.standingForKill,
            botGenerationDetails.botDifficulty,
            botGenerationDetails.role,
        );
        bot.Info.Settings.AggressorBonus = this.getAgressorBonusByDifficulty(
            botJsonTemplate.experience.standingForKill,
            botGenerationDetails.botDifficulty,
            botGenerationDetails.role,
        );
        bot.Info.Settings.UseSimpleAnimator = botJsonTemplate.experience.useSimpleAnimator ?? false;
        bot.Info.Voice = this.weightedRandomHelper.getWeightedValue<string>(botJsonTemplate.appearance.voice);
        bot.Health = this.generateHealth(botJsonTemplate.health, botGenerationDetails.isPlayerScav);
        bot.Skills = this.generateSkills(<any>botJsonTemplate.skills); // TODO: fix bad type, bot jsons store skills in dict, output needs to be array

        if (botGenerationDetails.isPmc) {
            bot.Info.IsStreamerModeAvailable = true; // Set to true so client patches can pick it up later - client sometimes alters botrole to assaultGroup
            this.setRandomisedGameVersionAndCategory(bot.Info);
            if (bot.Info.GameVersion === GameEditions.UNHEARD) {
                this.addAdditionalPocketLootWeightsForUnheardBot(botJsonTemplate);
            }
        }

        // Add drip
        this.setBotAppearance(bot, botJsonTemplate.appearance, botGenerationDetails);

        // Filter out blacklisted gear from the base template
        this.filterBlacklistedGear(botJsonTemplate, botGenerationDetails);

        bot.Inventory = this.botInventoryGenerator.generateInventory(
            sessionId,
            botJsonTemplate,
            botRoleLowercase,
            botGenerationDetails.isPmc,
            botLevel.level,
            bot.Info.GameVersion,
        );

        if (this.botConfig.botRolesWithDogTags.includes(botRoleLowercase)) {
            this.addDogtagToBot(bot);
        }

        // Generate new bot ID
        this.addIdsToBot(bot);

        // Generate new inventory ID
        this.generateInventoryId(bot);

        // Set role back to originally requested now its been generated
        if (botGenerationDetails.eventRole) {
            bot.Info.Settings.Role = botGenerationDetails.eventRole;
        }

        return bot;
    }

    /**
     * Should this bot have a name like "name (Pmc Name)" and be alterd by client patch to be hostile to player
     * @param botRole Role bot has
     * @returns True if name should be simulated pscav
     */
    protected shouldSimulatePlayerScav(botRole: string): boolean {
        return botRole === "assault" && this.randomUtil.getChance100(this.botConfig.chanceAssaultScavHasPlayerScavName);
    }

    /**
     * Get exp for kill by bot difficulty
     * @param experience Dict of difficulties and experience
     * @param botDifficulty the killed bots difficulty
     * @param role Role of bot (optional, used for error logging)
     * @returns Experience for kill
     */
    protected getExperienceRewardForKillByDifficulty(
        experience: Record<string, MinMax>,
        botDifficulty: string,
        role: string,
    ): number {
        const result = experience[botDifficulty.toLowerCase()];
        if (typeof result === "undefined") {
            this.logger.debug(
                `Unable to find experience for kill value for: ${role} ${botDifficulty}, falling back to "normal"`,
            );

            return this.randomUtil.getInt(experience.normal.min, experience.normal.max);
        }

        return this.randomUtil.getInt(result.min, result.max);
    }

    /**
     * Get the standing value change when player kills a bot
     * @param standingForKill Dictionary of standing values keyed by bot difficulty
     * @param botDifficulty Difficulty of bot to look up
     * @param role Role of bot (optional, used for error logging)
     * @returns Standing change value
     */
    protected getStandingChangeForKillByDifficulty(
        standingForKill: Record<string, number>,
        botDifficulty: string,
        role: string,
    ): number {
        const result = standingForKill[botDifficulty.toLowerCase()];
        if (typeof result === "undefined") {
            this.logger.warning(
                `Unable to find standing for kill value for: ${role} ${botDifficulty}, falling back to "normal"`,
            );

            return standingForKill.normal;
        }

        return result;
    }

    /**
     * Get the agressor bonus value when player kills a bot
     * @param standingForKill Dictionary of standing values keyed by bot difficulty
     * @param botDifficulty Difficulty of bot to look up
     * @param role Role of bot (optional, used for error logging)
     * @returns Standing change value
     */
    protected getAgressorBonusByDifficulty(
        aggressorBonus: Record<string, number>,
        botDifficulty: string,
        role: string,
    ): number {
        const result = aggressorBonus[botDifficulty.toLowerCase()];
        if (typeof result === "undefined") {
            this.logger.warning(
                `Unable to find aggressor bonus for kill value for: ${role} ${botDifficulty}, falling back to "normal"`,
            );

            return aggressorBonus.normal;
        }

        return result;
    }

    /**
     * Set weighting of flagged equipment to 0
     * @param botJsonTemplate Bot data to adjust
     * @param botGenerationDetails Generation details of bot
     */
    protected filterBlacklistedGear(botJsonTemplate: IBotType, botGenerationDetails: IBotGenerationDetails): void {
        const blacklist = this.botEquipmentFilterService.getBotEquipmentBlacklist(
            this.botGeneratorHelper.getBotEquipmentRole(botGenerationDetails.role),
            botGenerationDetails.playerLevel,
        );

        if (!blacklist?.gear) {
            // Nothing to filter by
            return;
        }

        for (const equipmentKey of Object.keys(blacklist?.gear)) {
            const equipmentTpls: Record<string, number> = botJsonTemplate.inventory.equipment[equipmentKey];

            const blacklistedTpls = blacklist?.gear[equipmentKey];
            for (const tpl of blacklistedTpls) {
                // Set weighting to 0, will never be picked
                equipmentTpls[tpl] = 0;
            }
        }
    }

    protected addAdditionalPocketLootWeightsForUnheardBot(botJsonTemplate: IBotType): void {
        // Adjust pocket loot weights to allow for 5 or 6 items
        const pocketWeights = botJsonTemplate.generation.items.pocketLoot.weights;
        pocketWeights["5"] = 1;
        pocketWeights["6"] = 1;
    }

    /**
     * Remove items from item.json/lootableItemBlacklist from bots inventory
     * @param botInventory Bot to filter
     */
    protected removeBlacklistedLootFromBotTemplate(botInventory: IInventory): void {
        const lootContainersToFilter = ["Backpack", "Pockets", "TacticalVest"];

        // Remove blacklisted loot from loot containers
        for (const lootContainerKey of lootContainersToFilter) {
            // No container, skip
            if (botInventory.items[lootContainerKey]?.length === 0) {
                continue;
            }

            const tplsToRemove: string[] = [];
            const containerItems = botInventory.items[lootContainerKey];
            for (const tplKey of Object.keys(containerItems)) {
                if (this.itemFilterService.isLootableItemBlacklisted(tplKey)) {
                    tplsToRemove.push(tplKey);
                }
            }

            for (const blacklistedTplToRemove of tplsToRemove) {
                delete containerItems[blacklistedTplToRemove];
            }
        }
    }

    /**
     * Choose various appearance settings for a bot using weights: head/body/feet/hands
     * @param bot Bot to adjust
     * @param appearance Appearance settings to choose from
     * @param botGenerationDetails Generation details
     */
    protected setBotAppearance(
        bot: IBotBase,
        appearance: IAppearance,
        botGenerationDetails: IBotGenerationDetails,
    ): void {
        // Choose random values by weight
        bot.Customization.Head = this.weightedRandomHelper.getWeightedValue<string>(appearance.head);
        bot.Customization.Feet = this.weightedRandomHelper.getWeightedValue<string>(appearance.feet);
        bot.Customization.Body = this.weightedRandomHelper.getWeightedValue<string>(appearance.body);

        const bodyGlobalDictDb = this.databaseService.getGlobals().config.Customization.SavageBody;
        const chosenBodyTemplate = this.databaseService.getCustomization()[bot.Customization.Body];

        // Some bodies have matching hands, look up body to see if this is the case
        const chosenBody = bodyGlobalDictDb[chosenBodyTemplate?._name.trim()];
        bot.Customization.Hands = chosenBody?.isNotRandom
            ? chosenBody.hands // Has fixed hands for chosen body, update to match
            : this.weightedRandomHelper.getWeightedValue<string>(appearance.hands); // Hands can be random, choose any from weighted dict
    }

    /**
     * Log the number of PMCs generated to the debug console
     * @param output Generated bot array, ready to send to client
     */
    protected logPmcGeneratedCount(output: IBotBase[]): void {
        const pmcCount = output.reduce((acc, cur) => {
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
    protected generateHealth(healthObj: IHealth, playerScav = false): PmcHealth {
        const bodyParts = playerScav
            ? this.getLowestHpBody(healthObj.BodyParts)
            : this.randomUtil.getArrayValue(healthObj.BodyParts);

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
     * Sum up body parts max hp values, return the bodypart collection with lowest value
     * @param bodies Body parts to sum up
     * @returns Lowest hp collection
     */
    protected getLowestHpBody(bodies: IBodyPart[]): IBodyPart | undefined {
        if (bodies.length === 0) {
            // Handle empty input
            return undefined;
        }

        let result: IBodyPart;
        let currentHighest = Number.POSITIVE_INFINITY;
        for (const bodyParts of bodies) {
            const hpTotal = Object.values(bodyParts).reduce((acc, curr) => acc + curr.max, 0);
            if (hpTotal < currentHighest) {
                // Found collection with lower value that previous, use it
                currentHighest = hpTotal;
                result = bodyParts;
            }
        }

        return result;
    }

    /**
     * Get a bots skills with randomsied progress value between the min and max values
     * @param botSkills Skills that should have their progress value randomised
     * @returns
     */
    protected generateSkills(botSkills: IBaseJsonSkills): botSkills {
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
    ): IBaseSkill[] {
        if (Object.keys(skills ?? []).length === 0) {
            return [];
        }

        return Object.keys(skills)
            .map((skillKey): IBaseSkill => {
                // Get skill from dict, skip if not found
                const skill = skills[skillKey];
                if (!skill) {
                    return undefined;
                }

                // All skills have id and progress props
                const skillToAdd: IBaseSkill = { Id: skillKey, Progress: this.randomUtil.getInt(skill.min, skill.max) };

                // Common skills have additional props
                if (isCommonSkills) {
                    (skillToAdd as Common).PointsEarnedDuringSession = 0;
                    (skillToAdd as Common).LastAccess = 0;
                }

                return skillToAdd;
            })
            .filter((baseSkill) => baseSkill !== undefined);
    }

    /**
     * Generate an id+aid for a bot and apply
     * @param bot bot to update
     * @returns updated IBotBase object
     */
    protected addIdsToBot(bot: IBotBase): void {
        const botId = this.hashUtil.generate();

        bot._id = botId;
        bot.aid = this.hashUtil.generateAccountId();
    }

    /**
     * Update a profiles profile.Inventory.equipment value with a freshly generated one
     * Update all inventory items that make use of this value too
     * @param profile Profile to update
     */
    protected generateInventoryId(profile: IBotBase): void {
        const newInventoryItemId = this.hashUtil.generate();

        for (const item of profile.Inventory.items) {
            // Root item found, update its _id value to newly generated id
            if (item._tpl === ItemTpl.INVENTORY_DEFAULT) {
                item._id = newInventoryItemId;

                continue;
            }

            // Optimisation - skip items without a parentId
            // They are never linked to root inventory item + we already handled root item above
            if (!item.parentId) {
                continue;
            }

            // Item is a child of root inventory item, update its parentId value to newly generated id
            if (item.parentId === profile.Inventory.equipment) {
                item.parentId = newInventoryItemId;
            }
        }

        // Update inventory equipment id to new one we generated
        profile.Inventory.equipment = newInventoryItemId;
    }

    /**
     * Randomise a bots game version and account category
     * Chooses from all the game versions (standard, eod etc)
     * Chooses account type (default, Sherpa, etc)
     * @param botInfo bot info object to update
     * @returns Chosen game version
     */
    protected setRandomisedGameVersionAndCategory(botInfo: IInfo): string {
        // Special case
        if (botInfo.Nickname?.toLowerCase() === "nikita") {
            botInfo.GameVersion = GameEditions.UNHEARD;
            botInfo.MemberCategory = MemberCategory.DEVELOPER;

            return botInfo.GameVersion;
        }

        // Choose random weighted game version for bot
        botInfo.GameVersion = this.weightedRandomHelper.getWeightedValue(this.pmcConfig.gameVersionWeight);

        // Choose appropriate member category value
        switch (botInfo.GameVersion) {
            case GameEditions.EDGE_OF_DARKNESS:
                botInfo.MemberCategory = MemberCategory.UNIQUE_ID;
                break;
            case GameEditions.UNHEARD:
                botInfo.MemberCategory = MemberCategory.UNHEARD;
                break;
            default:
                // Everyone else gets a weighted randomised category
                botInfo.MemberCategory = Number.parseInt(
                    this.weightedRandomHelper.getWeightedValue(this.pmcConfig.accountTypeWeight),
                    10,
                );
        }

        // Ensure selected category matches
        botInfo.SelectedMemberCategory = botInfo.MemberCategory;

        return botInfo.GameVersion;
    }

    /**
     * Add a side-specific (usec/bear) dogtag item to a bots inventory
     * @param bot bot to add dogtag to
     * @returns Bot with dogtag added
     */
    protected addDogtagToBot(bot: IBotBase): void {
        const inventoryItem: IItem = {
            _id: this.hashUtil.generate(),
            _tpl: this.getDogtagTplByGameVersionAndSide(bot.Info.Side, bot.Info.GameVersion),
            parentId: bot.Inventory.equipment,
            slotId: "Dogtag",
            upd: {
                SpawnedInSession: true,
            },
        };

        bot.Inventory.items.push(inventoryItem);
    }

    /**
     * Get a dogtag tpl that matches the bots game version and side
     * @param side Usec/Bear
     * @param gameVersion edge_of_darkness / standard
     * @returns item tpl
     */
    protected getDogtagTplByGameVersionAndSide(side: string, gameVersion: string): string {
        if (side.toLowerCase() === "usec") {
            switch (gameVersion) {
                case GameEditions.EDGE_OF_DARKNESS:
                    return ItemTpl.BARTER_DOGTAG_USEC_EOD;
                case GameEditions.UNHEARD:
                    return ItemTpl.BARTER_DOGTAG_USEC_TUE;
                default:
                    return ItemTpl.BARTER_DOGTAG_USEC;
            }
        }

        switch (gameVersion) {
            case GameEditions.EDGE_OF_DARKNESS:
                return ItemTpl.BARTER_DOGTAG_BEAR_EOD;
            case GameEditions.UNHEARD:
                return ItemTpl.BARTER_DOGTAG_BEAR_TUE;
            default:
                return ItemTpl.BARTER_DOGTAG_BEAR;
        }
    }

    /**
     * Adjust a PMCs pocket tpl to UHD if necessary, otherwise do nothing
     * @param bot Pmc object to adjust
     */
    protected setPmcPocketsByGameVersion(bot: IBotBase): void {
        if (bot.Info.GameVersion === GameEditions.UNHEARD) {
            const pockets = bot.Inventory.items.find((item) => item.slotId === "Pockets");
            pockets._tpl = ItemTpl.POCKETS_1X4_TUE;
        }
    }
}
