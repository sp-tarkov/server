import { RepeatableQuestGenerator } from "@spt/generators/RepeatableQuestGenerator";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { RepeatableQuestHelper } from "@spt/helpers/RepeatableQuestHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IPmcDataRepeatableQuest, IRepeatableQuest } from "@spt/models/eft/common/tables/IRepeatableQuests";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { IRepeatableQuestChangeRequest } from "@spt/models/eft/quests/IRepeatableQuestChangeRequest";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ELocationName } from "@spt/models/enums/ELocationName";
import { HideoutAreas } from "@spt/models/enums/HideoutAreas";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import { Traders } from "@spt/models/enums/Traders";
import { IQuestConfig, IRepeatableQuestConfig } from "@spt/models/spt/config/IQuestConfig";
import { IGetRepeatableByIdResult } from "@spt/models/spt/quests/IGetRepeatableByIdResult";
import { IQuestTypePool } from "@spt/models/spt/repeatable/IQuestTypePool";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { PaymentService } from "@spt/services/PaymentService";
import { ProfileFixerService } from "@spt/services/ProfileFixerService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { ObjectId } from "@spt/utils/ObjectId";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RepeatableQuestController {
    protected questConfig: IQuestConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("RepeatableQuestGenerator") protected repeatableQuestGenerator: RepeatableQuestGenerator,
        @inject("RepeatableQuestHelper") protected repeatableQuestHelper: RepeatableQuestHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * Handle client/repeatalbeQuests/activityPeriods
     * Returns an array of objects in the format of repeatable quests to the client.
     * repeatableQuestObject = {
     *  id: Unique Id,
     *  name: "Daily",
     *  endTime: the time when the quests expire
     *  activeQuests: currently available quests in an array. Each element of quest type format (see assets/database/templates/repeatableQuests.json).
     *  inactiveQuests: the quests which were previously active (required by client to fail them if they are not completed)
     * }
     *
     * The method checks if the player level requirement for repeatable quests (e.g. daily lvl5, weekly lvl15) is met and if the previously active quests
     * are still valid. This ischecked by endTime persisted in profile accordning to the resetTime configured for each repeatable kind (daily, weekly)
     * in QuestCondig.js
     *
     * If the condition is met, new repeatableQuests are created, old quests (which are persisted in the profile.RepeatableQuests[i].activeQuests) are
     * moved to profile.RepeatableQuests[i].inactiveQuests. This memory is required to get rid of old repeatable quest data in the profile, otherwise
     * they'll litter the profile's Quests field.
     * (if the are on "Succeed" but not "Completed" we keep them, to allow the player to complete them and get the rewards)
     * The new quests generated are again persisted in profile.RepeatableQuests
     *
     * @param   {string}    sessionID   Player's session id
     *
     * @returns  {array}                Array of "repeatableQuestObjects" as described above
     */
    public getClientRepeatableQuests(sessionID: string): IPmcDataRepeatableQuest[] {
        const returnData: Array<IPmcDataRepeatableQuest> = [];
        const fullProfile = this.profileHelper.getFullProfile(sessionID);
        const pmcData = fullProfile.characters.pmc;
        const currentTime = this.timeUtil.getTimestamp();

        // Daily / weekly / Daily_Savage
        for (const repeatableConfig of this.questConfig.repeatableQuests) {
            // Get daily/weekly data from profile, add empty object if missing
            const generatedRepeatables = this.getRepeatableQuestSubTypeFromProfile(repeatableConfig, pmcData);
            const repeatableTypeLower = repeatableConfig.name.toLowerCase();

            const canAccessRepeatables = this.canProfileAccessRepeatableQuests(repeatableConfig, pmcData);
            if (!canAccessRepeatables) {
                // Dont send any repeatables, even existing ones
                continue;
            }

            // Existing repeatables are still valid, add to return data and move to next sub-type
            if (currentTime < generatedRepeatables.endTime - 1) {
                returnData.push(generatedRepeatables);

                this.logger.debug(`[Quest Check] ${repeatableTypeLower} quests are still valid.`);

                continue;
            }

            // Current time is past expiry time

            // Set endtime to be now + new duration
            generatedRepeatables.endTime = currentTime + repeatableConfig.resetTime;
            generatedRepeatables.inactiveQuests = [];
            this.logger.debug(`Generating new ${repeatableTypeLower}`);

            // Put old quests to inactive (this is required since only then the client makes them fail due to non-completion)
            // Also need to push them to the "inactiveQuests" list since we need to remove them from offraidData.profile.Quests
            // after a raid (the client seems to keep quests internally and we want to get rid of old repeatable quests)
            // and remove them from the PMC's Quests and RepeatableQuests[i].activeQuests
            this.processExpiredQuests(generatedRepeatables, pmcData);

            // Create dynamic quest pool to avoid generating duplicates
            const questTypePool = this.generateQuestPool(repeatableConfig, pmcData.Info.Level);

            // Add repeatable quests of this loops sub-type (daily/weekly)
            for (let i = 0; i < this.getQuestCount(repeatableConfig, pmcData); i++) {
                let quest: IRepeatableQuest | undefined = undefined;
                let lifeline = 0;
                while (!quest && questTypePool.types.length > 0) {
                    quest = this.repeatableQuestGenerator.generateRepeatableQuest(
                        sessionID,
                        pmcData.Info.Level,
                        pmcData.TradersInfo,
                        questTypePool,
                        repeatableConfig,
                    );
                    lifeline++;
                    if (lifeline > 10) {
                        this.logger.debug(
                            "We were stuck in repeatable quest generation. This should never happen. Please report",
                        );
                        break;
                    }
                }

                // check if there are no more quest types available
                if (questTypePool.types.length === 0) {
                    break;
                }
                quest.side = repeatableConfig.side;
                generatedRepeatables.activeQuests.push(quest);
            }

            // Nullguard
            fullProfile.spt.freeRepeatableRefreshUsedCount ||= {};

            // Reset players free quest count for this repeatable sub-type as we're generating new repeatables for this group (daily/weekly)
            fullProfile.spt.freeRepeatableRefreshUsedCount[repeatableTypeLower] = 0;

            // Create stupid redundant change requirements from quest data
            for (const quest of generatedRepeatables.activeQuests) {
                generatedRepeatables.changeRequirement[quest._id] = {
                    changeCost: quest.changeCost,
                    changeStandingCost: this.randomUtil.getArrayValue([0, 0.01]), // Randomise standing cost to replace
                };
            }

            // Reset free repeatable values in player profile to defaults
            generatedRepeatables.freeChanges = repeatableConfig.freeChanges;
            generatedRepeatables.freeChangesAvailable = repeatableConfig.freeChanges;

            returnData.push({
                id: repeatableConfig.id,
                name: generatedRepeatables.name,
                endTime: generatedRepeatables.endTime,
                activeQuests: generatedRepeatables.activeQuests,
                inactiveQuests: generatedRepeatables.inactiveQuests,
                changeRequirement: generatedRepeatables.changeRequirement,
                freeChanges: generatedRepeatables.freeChanges,
                freeChangesAvailable: generatedRepeatables.freeChanges,
            });
        }

        return returnData;
    }

    /**
     * Expire quests and replace expired quests with ready-to-hand-in quests inside generatedRepeatables.activeQuests
     * @param generatedRepeatables Repeatables to process (daily/weekly)
     * @param pmcData Player profile
     */
    protected processExpiredQuests(generatedRepeatables: IPmcDataRepeatableQuest, pmcData: IPmcData): void {
        const questsToKeep = [];
        for (const activeQuest of generatedRepeatables.activeQuests) {
            const questStatusInProfile = pmcData.Quests.find((quest) => quest.qid === activeQuest._id);
            if (!questStatusInProfile) {
                continue;
            }

            // Keep finished quests in list so player can hand in
            if (questStatusInProfile.status === QuestStatus.AvailableForFinish) {
                questsToKeep.push(activeQuest);
                this.logger.debug(
                    `Keeping repeatable quest: ${activeQuest._id} in activeQuests since it is available to hand in`,
                );

                continue;
            }

            // Clean up quest-related counters being left in profile
            this.profileFixerService.removeDanglingConditionCounters(pmcData);

            // Remove expired quest from pmc.quest array
            pmcData.Quests = pmcData.Quests.filter((quest) => quest.qid !== activeQuest._id);

            // Store in inactive array
            generatedRepeatables.inactiveQuests.push(activeQuest);
        }

        generatedRepeatables.activeQuests = questsToKeep;
    }

    /**
     * Check if a repeatable quest type (daily/weekly) is active for the given profile
     * @param repeatableConfig Repeatable quest config
     * @param pmcData Player profile
     * @returns True if profile is allowed to access dailies
     */
    protected canProfileAccessRepeatableQuests(repeatableConfig: IRepeatableQuestConfig, pmcData: IPmcData): boolean {
        // PMC and daily quests not unlocked yet
        if (repeatableConfig.side === "Pmc" && !this.playerHasDailyPmcQuestsUnlocked(pmcData, repeatableConfig)) {
            return false;
        }

        // Scav and daily quests not unlocked yet
        if (repeatableConfig.side === "Scav" && !this.playerHasDailyScavQuestsUnlocked(pmcData)) {
            this.logger.debug("Daily scav quests still locked, Intel center not built");

            return false;
        }

        return true;
    }

    /**
     * Does player have daily scav quests unlocked
     * @param pmcData Player profile to check
     * @returns True if unlocked
     */
    protected playerHasDailyScavQuestsUnlocked(pmcData: IPmcData): boolean {
        return (
            pmcData?.Hideout?.Areas?.find((hideoutArea) => hideoutArea.type === HideoutAreas.INTEL_CENTER)?.level >= 1
        );
    }

    /**
     * Does player have daily pmc quests unlocked
     * @param pmcData Player profile to check
     * @param repeatableConfig Config of daily type to check
     * @returns True if unlocked
     */
    protected playerHasDailyPmcQuestsUnlocked(pmcData: IPmcData, repeatableConfig: IRepeatableQuestConfig): boolean {
        return pmcData.Info.Level >= repeatableConfig.minPlayerLevel;
    }

    /**
     * Get the number of quests to generate - takes into account charisma state of player
     * @param repeatableConfig Config
     * @param pmcData Player profile
     * @returns Quest count
     */
    protected getQuestCount(repeatableConfig: IRepeatableQuestConfig, pmcData: IPmcData): number {
        if (
            repeatableConfig.name.toLowerCase() === "daily" &&
            this.profileHelper.hasEliteSkillLevel(SkillTypes.CHARISMA, pmcData)
        ) {
            // Elite charisma skill gives extra daily quest(s)
            return (
                repeatableConfig.numQuests +
                this.databaseService.getGlobals().config.SkillsSettings.Charisma.BonusSettings.EliteBonusSettings
                    .RepeatableQuestExtraCount
            );
        }

        return repeatableConfig.numQuests;
    }

    /**
     * Get repeatable quest data from profile from name (daily/weekly), creates base repeatable quest object if none exists
     * @param repeatableConfig daily/weekly config
     * @param pmcData Profile to search
     * @returns IPmcDataRepeatableQuest
     */
    protected getRepeatableQuestSubTypeFromProfile(
        repeatableConfig: IRepeatableQuestConfig,
        pmcData: IPmcData,
    ): IPmcDataRepeatableQuest {
        // Get from profile, add if missing
        let repeatableQuestDetails = pmcData.RepeatableQuests.find(
            (repeatable) => repeatable.name === repeatableConfig.name,
        );
        if (!repeatableQuestDetails) {
            // Not in profile, generate
            const hasAccess = this.profileHelper.hasAccessToRepeatableFreeRefreshSystem(pmcData);
            repeatableQuestDetails = {
                id: repeatableConfig.id,
                name: repeatableConfig.name,
                activeQuests: [],
                inactiveQuests: [],
                endTime: 0,
                changeRequirement: {},
                freeChanges: hasAccess ? repeatableConfig.freeChanges : 0,
                freeChangesAvailable: hasAccess ? repeatableConfig.freeChangesAvailable : 0,
            };

            // Add base object that holds repeatable data to profile
            pmcData.RepeatableQuests.push(repeatableQuestDetails);
        }

        return repeatableQuestDetails;
    }

    /**
     * Just for debug reasons. Draws dailies a random assort of dailies extracted from dumps
     */
    public generateDebugDailies(dailiesPool: any, factory: any, number: number): any {
        let randomQuests = [];
        let numberOfQuests = number;

        if (factory) {
            // First is factory extract always add for debugging
            randomQuests.push(dailiesPool[0]);
            numberOfQuests -= 1;
        }

        randomQuests = randomQuests.concat(this.randomUtil.drawRandomFromList(dailiesPool, numberOfQuests, false));

        for (const element of randomQuests) {
            element._id = this.objectId.generate();
            const conditions = element.conditions.AvailableForFinish;
            for (const condition of conditions) {
                if ("counter" in condition._props) {
                    condition._props.counter.id = this.objectId.generate();
                }
            }
        }
        return randomQuests;
    }

    /**
     * Used to create a quest pool during each cycle of repeatable quest generation. The pool will be subsequently
     * narrowed down during quest generation to avoid duplicate quests. Like duplicate extractions or elimination quests
     * where you have to e.g. kill scavs in same locations.
     * @param repeatableConfig main repeatable quest config
     * @param pmcLevel level of pmc generating quest pool
     * @returns IQuestTypePool
     */
    protected generateQuestPool(repeatableConfig: IRepeatableQuestConfig, pmcLevel: number): IQuestTypePool {
        const questPool = this.createBaseQuestPool(repeatableConfig);

        // Get the allowed locations based on the PMC's level
        const locations = this.getAllowedLocationsForPmcLevel(repeatableConfig.locations, pmcLevel);

        // Populate Exploration and Pickup quest locations
        for (const location in locations) {
            if (location !== ELocationName.ANY) {
                questPool.pool.Exploration.locations[location] = locations[location];
                questPool.pool.Pickup.locations[location] = locations[location];
            }
        }

        // Add "any" to pickup quest pool
        questPool.pool.Pickup.locations.any = ["any"];

        const eliminationConfig = this.repeatableQuestHelper.getEliminationConfigByPmcLevel(pmcLevel, repeatableConfig);
        const targetsConfig = this.repeatableQuestHelper.probabilityObjectArray(eliminationConfig.targets);

        // Populate Elimination quest targets and their locations
        for (const { data: target, key: targetKey } of targetsConfig) {
            // Target is boss
            if (target.isBoss) {
                questPool.pool.Elimination.targets[targetKey] = { locations: ["any"] };
            } else {
                // Non-boss targets
                const possibleLocations = Object.keys(locations);

                const allowedLocations =
                    targetKey === "Savage"
                        ? possibleLocations.filter((location) => location !== "laboratory") // Exclude labs for Savage targets.
                        : possibleLocations;

                questPool.pool.Elimination.targets[targetKey] = { locations: allowedLocations };
            }
        }

        return questPool;
    }

    protected createBaseQuestPool(repeatableConfig: IRepeatableQuestConfig): IQuestTypePool {
        return {
            types: repeatableConfig.types.slice(),
            pool: { Exploration: { locations: {} }, Elimination: { targets: {} }, Pickup: { locations: {} } },
        };
    }

    /**
     * Return the locations this PMC is allowed to get daily quests for based on their level
     * @param locations The original list of locations
     * @param pmcLevel The players level
     * @returns A filtered list of locations that allow the player PMC level to access it
     */
    protected getAllowedLocationsForPmcLevel(
        locations: Record<ELocationName, string[]>,
        pmcLevel: number,
    ): Partial<Record<ELocationName, string[]>> {
        const allowedLocation: Partial<Record<ELocationName, string[]>> = {};

        for (const location in locations) {
            const locationNames = [];
            for (const locationName of locations[location]) {
                if (this.isPmcLevelAllowedOnLocation(locationName, pmcLevel)) {
                    locationNames.push(locationName);
                }
            }

            if (locationNames.length > 0) {
                allowedLocation[location] = locationNames;
            }
        }

        return allowedLocation;
    }

    /**
     * Return true if the given pmcLevel is allowed on the given location
     * @param location The location name to check
     * @param pmcLevel The level of the pmc
     * @returns True if the given pmc level is allowed to access the given location
     */
    protected isPmcLevelAllowedOnLocation(location: string, pmcLevel: number): boolean {
        // All PMC levels are allowed for 'any' location requirement
        if (location === ELocationName.ANY) {
            return true;
        }

        const locationBase = this.databaseService.getLocation(location.toLowerCase())?.base;
        if (!locationBase) {
            return true;
        }

        return pmcLevel <= locationBase.RequiredPlayerLevelMax && pmcLevel >= locationBase.RequiredPlayerLevelMin;
    }

    public debugLogRepeatableQuestIds(pmcData: IPmcData): void {
        for (const repeatable of pmcData.RepeatableQuests) {
            const activeQuestsIds = [];
            const inactiveQuestsIds = [];
            for (const active of repeatable.activeQuests) {
                activeQuestsIds.push(active._id);
            }

            for (const inactive of repeatable.inactiveQuests) {
                inactiveQuestsIds.push(inactive._id);
            }

            this.logger.debug(`${repeatable.name} activeIds ${activeQuestsIds}`);
            this.logger.debug(`${repeatable.name} inactiveIds ${inactiveQuestsIds}`);
        }
    }

    /**
     * Handle RepeatableQuestChange event
     *
     * Replace a players repeatable quest
     * @param pmcData Player profile
     * @param changeRequest Request object
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public changeRepeatableQuest(
        pmcData: IPmcData,
        changeRequest: IRepeatableQuestChangeRequest,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        const fullProfile = this.profileHelper.getFullProfile(sessionID);

        // Check for existing quest in (daily/weekly/scav arrays)
        const { quest: questToReplace, repeatableType: repeatablesOfTypeInProfile } = this.getRepeatableById(
            changeRequest.qid,
            pmcData,
        );
        if (!repeatablesOfTypeInProfile || !questToReplace) {
            // Unable to find quest being replaced
            const message = this.localisationService.getText("quest-unable_to_find_repeatable_to_replace");
            this.logger.error(message);

            return this.httpResponse.appendErrorToOutput(output, message);
        }

        // Subtype name of quest - daily/weekly/scav
        const repeatableTypeLower = repeatablesOfTypeInProfile.name.toLowerCase();

        // Save for later standing loss calculation
        const replacedQuestTraderId = questToReplace.traderId;

        // Update active quests to exclude the quest we're replacing
        repeatablesOfTypeInProfile.activeQuests = repeatablesOfTypeInProfile.activeQuests.filter(
            (quest) => quest._id !== changeRequest.qid,
        );

        // Save for later cost calculations
        const previousChangeRequirement = this.cloner.clone(
            repeatablesOfTypeInProfile.changeRequirement[changeRequest.qid],
        );

        // Delete the replaced quest change requirement data as we're going to add new data below
        delete repeatablesOfTypeInProfile.changeRequirement[changeRequest.qid];

        // Get config for this repeatable sub-type (daily/weekly/scav)
        const repeatableConfig = this.questConfig.repeatableQuests.find(
            (config) => config.name === repeatablesOfTypeInProfile.name,
        );

        // If the configuration dictates to replace with the same quest type, adjust the available quest types
        if (repeatableConfig?.keepDailyQuestTypeOnReplacement) {
            repeatableConfig.types = [questToReplace.type];
        }

        // Generate meta-data for what type/levelrange of quests can be generated for player
        const allowedQuestTypes = this.generateQuestPool(repeatableConfig, pmcData.Info.Level);
        const newRepeatableQuest = this.attemptToGenerateRepeatableQuest(
            sessionID,
            pmcData,
            allowedQuestTypes,
            repeatableConfig,
        );
        if (!newRepeatableQuest) {
            // Unable to find quest being replaced
            const message = `Unable to generate repeatable quest of type: ${repeatableTypeLower} to replace trader: ${replacedQuestTraderId} quest ${changeRequest.qid}`;
            this.logger.error(message);

            return this.httpResponse.appendErrorToOutput(output, message);
        }

        // Add newly generated quest to daily/weekly/scav type array
        newRepeatableQuest.side = repeatableConfig.side;
        repeatablesOfTypeInProfile.activeQuests.push(newRepeatableQuest);

        this.logger.debug(
            `Removing: ${repeatableConfig.name} quest: ${questToReplace._id} from trader: ${questToReplace.traderId} as its been replaced`,
        );

        this.removeQuestFromProfile(fullProfile, questToReplace._id);

        // Delete the replaced quest change requirement from profile
        this.cleanUpRepeatableChangeRequirements(repeatablesOfTypeInProfile, questToReplace._id);

        // Add replacement quests change requirement data to profile
        repeatablesOfTypeInProfile.changeRequirement[newRepeatableQuest._id] = {
            changeCost: newRepeatableQuest.changeCost,
            changeStandingCost: this.randomUtil.getArrayValue([0, 0.01]),
        };

        // Check if we should charge player for replacing quest
        const isFreeToReplace = this.useFreeRefreshIfAvailable(
            fullProfile,
            repeatablesOfTypeInProfile,
            repeatableTypeLower,
        );
        if (!isFreeToReplace) {
            // Reduce standing with trader for not doing their quest
            const traderOfReplacedQuest = pmcData.TradersInfo[replacedQuestTraderId];
            traderOfReplacedQuest.standing -= previousChangeRequirement.changeStandingCost;

            const charismaBonus = this.profileHelper.getSkillFromProfile(pmcData, SkillTypes.CHARISMA)?.Progress ?? 0;
            for (const cost of previousChangeRequirement.changeCost) {
                // Not free, Charge player + appy charisma bonus to cost of replacement
                cost.count = Math.trunc(cost.count * (1 - Math.trunc(charismaBonus / 100) * 0.001) ?? 1);
                this.paymentService.addPaymentToOutput(pmcData, cost.templateId, cost.count, sessionID, output);
                if (output.warnings.length > 0) {
                    return output;
                }
            }
        }

        // Clone data before we send it to client
        const repeatableToChangeClone = this.cloner.clone(repeatablesOfTypeInProfile);

        // Purge inactive repeatables
        repeatableToChangeClone.inactiveQuests = [];

        // Nullguard
        output.profileChanges[sessionID].repeatableQuests ||= [];

        // Update client output with new repeatable
        output.profileChanges[sessionID].repeatableQuests.push(repeatableToChangeClone);

        return output;
    }

    /**
     * Remove the provided quest from pmc and scav character profiles
     * @param fullProfile Profile to remove quest from
     * @param questToReplaceId Quest id to remove from profile
     */
    protected removeQuestFromProfile(fullProfile: ISptProfile, questToReplaceId: string): void {
        // Find quest we're replacing in pmc profile quests array and remove it
        this.questHelper.findAndRemoveQuestFromArrayIfExists(questToReplaceId, fullProfile.characters.pmc.Quests);

        // Find quest we're replacing in scav profile quests array and remove it
        if (fullProfile.characters.scav) {
            this.questHelper.findAndRemoveQuestFromArrayIfExists(questToReplaceId, fullProfile.characters.scav.Quests);
        }
    }

    /**
     * Clean up the repeatables `changeRequirement` dictionary of expired data
     * @param repeatablesOfTypeInProfile The repeatables that have the replaced and new quest
     * @param replacedQuestId Id of the replaced quest
     */
    protected cleanUpRepeatableChangeRequirements(
        repeatablesOfTypeInProfile: IPmcDataRepeatableQuest,
        replacedQuestId: string,
    ): void {
        if (repeatablesOfTypeInProfile.activeQuests.length === 1) {
            // Only one repeatable quest being replaced (e.g. scav_daily), remove everything ready for new quest requirement to be added
            // Will assist in cleanup of existing profiles data
            repeatablesOfTypeInProfile.changeRequirement = {};
        } else {
            // Multiple active quests of this type (e.g. daily or weekly) are active, just remove the single replaced quest
            delete repeatablesOfTypeInProfile.changeRequirement[replacedQuestId];
        }
    }

    /**
     * Find a repeatable (daily/weekly/scav) from a players profile by its id
     * @param questId Id of quest to find
     * @param pmcData Profile that contains quests to look through
     * @returns IGetRepeatableByIdResult
     */
    protected getRepeatableById(questId: string, pmcData: IPmcData): IGetRepeatableByIdResult {
        for (const repeatablesInProfile of pmcData.RepeatableQuests) {
            // Check for existing quest in (daily/weekly/scav arrays)
            const questToReplace = repeatablesInProfile.activeQuests.find((repeatable) => repeatable._id === questId);
            if (!questToReplace) {
                // Not found, skip to next repeatable sub-type
                continue;
            }

            return { quest: questToReplace, repeatableType: repeatablesInProfile };
        }

        return undefined;
    }

    protected attemptToGenerateRepeatableQuest(
        sessionId: string,
        pmcData: IPmcData,
        questTypePool: IQuestTypePool,
        repeatableConfig: IRepeatableQuestConfig,
    ): IRepeatableQuest {
        const maxAttempts = 10;
        let newRepeatableQuest: IRepeatableQuest = undefined;
        let attempts = 0;
        while (attempts < maxAttempts && questTypePool.types.length > 0) {
            newRepeatableQuest = this.repeatableQuestGenerator.generateRepeatableQuest(
                sessionId,
                pmcData.Info.Level,
                pmcData.TradersInfo,
                questTypePool,
                repeatableConfig,
            );

            if (newRepeatableQuest) {
                // Successfully generated a quest, exit loop
                break;
            }

            attempts++;
        }

        if (attempts > maxAttempts) {
            this.logger.debug("We were stuck in repeatable quest generation. This should never happen. Please report");
        }

        return newRepeatableQuest;
    }

    /**
     * Some accounts have access to free repeatable quest refreshes
     * Track the usage of them inside players profile
     * @param fullProfile Player profile
     * @param repeatableSubType Can be daily / weekly / scav repeatable
     * @param repeatableTypeName Subtype of repeatable quest: daily / weekly / scav
     * @returns Is the repeatable being replaced for free
     */
    protected useFreeRefreshIfAvailable(
        fullProfile: ISptProfile,
        repeatableSubType: IPmcDataRepeatableQuest,
        repeatableTypeName: string,
    ): boolean {
        // No free refreshes, exit early
        if (repeatableSubType.freeChangesAvailable <= 0) {
            // Reset counter to 0
            repeatableSubType.freeChangesAvailable = 0;

            return false;
        }

        // Only certain game versions have access to free refreshes
        const hasAccessToFreeRefreshSystem = this.profileHelper.hasAccessToRepeatableFreeRefreshSystem(
            fullProfile.characters.pmc,
        );

        // If the player has access and available refreshes:
        if (hasAccessToFreeRefreshSystem) {
            // Initialize/retrieve free refresh count for the desired subtype: daily/weekly
            fullProfile.spt.freeRepeatableRefreshUsedCount ||= {};
            const repeatableRefreshCounts = fullProfile.spt.freeRepeatableRefreshUsedCount;
            repeatableRefreshCounts[repeatableTypeName] ||= 0; // Set to 0 if undefined

            // Increment the used count and decrement the available count.
            repeatableRefreshCounts[repeatableTypeName]++;
            repeatableSubType.freeChangesAvailable--;

            return true;
        }

        return false;
    }
}
