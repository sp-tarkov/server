import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestConditionHelper } from "@spt/helpers/QuestConditionHelper";
import { QuestRewardHelper } from "@spt/helpers/QuestRewardHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { Common, IQuestStatus } from "@spt/models/eft/common/tables/IBotBase";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IQuest, IQuestCondition, IQuestReward } from "@spt/models/eft/common/tables/IQuest";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IAcceptQuestRequestData } from "@spt/models/eft/quests/IAcceptQuestRequestData";
import { ICompleteQuestRequestData } from "@spt/models/eft/quests/ICompleteQuestRequestData";
import { IFailQuestRequestData } from "@spt/models/eft/quests/IFailQuestRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MessageType } from "@spt/models/enums/MessageType";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { SeasonalEventType } from "@spt/models/enums/SeasonalEventType";
import { IQuestConfig } from "@spt/models/spt/config/IQuestConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocaleService } from "@spt/services/LocaleService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { PlayerService } from "@spt/services/PlayerService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class QuestHelper {
    protected questConfig: IQuestConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("QuestConditionHelper") protected questConditionHelper: QuestConditionHelper,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("QuestRewardHelper") protected questRewardHelper: QuestRewardHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * Get status of a quest in player profile by its id
     * @param pmcData Profile to search
     * @param questId Quest id to look up
     * @returns QuestStatus enum
     */
    public getQuestStatus(pmcData: IPmcData, questId: string): QuestStatus {
        const quest = pmcData.Quests?.find((q) => q.qid === questId);

        return quest ? quest.status : QuestStatus.Locked;
    }

    /**
     * returns true is the level condition is satisfied
     * @param playerLevel Players level
     * @param condition Quest condition
     * @returns true if player level is greater than or equal to quest
     */
    public doesPlayerLevelFulfilCondition(playerLevel: number, condition: IQuestCondition): boolean {
        if (condition.conditionType === "Level") {
            switch (condition.compareMethod) {
                case ">=":
                    return playerLevel >= <number>condition.value;
                case ">":
                    return playerLevel > <number>condition.value;
                case "<":
                    return playerLevel < <number>condition.value;
                case "<=":
                    return playerLevel <= <number>condition.value;
                case "=":
                    return playerLevel === <number>condition.value;
                default:
                    this.logger.error(
                        this.localisationService.getText(
                            "quest-unable_to_find_compare_condition",
                            condition.compareMethod,
                        ),
                    );
                    return false;
            }
        }
    }

    /**
     * Get the quests found in both arrays (inner join)
     * @param before Array of quests #1
     * @param after Array of quests #2
     * @returns Reduction of cartesian product between two quest arrays
     */
    public getDeltaQuests(before: IQuest[], after: IQuest[]): IQuest[] {
        const knownQuestsIds: string[] = [];
        for (const q of before) {
            knownQuestsIds.push(q._id);
        }

        if (knownQuestsIds.length) {
            return after.filter((q) => {
                return knownQuestsIds.indexOf(q._id) === -1;
            });
        }

        return after;
    }

    /**
     * Adjust skill experience for low skill levels, mimicing the official client
     * @param profileSkill the skill experience is being added to
     * @param progressAmount the amount of experience being added to the skill
     * @returns the adjusted skill progress gain
     */
    public adjustSkillExpForLowLevels(profileSkill: Common, progressAmount: number): number {
        let currentLevel = Math.floor(profileSkill.Progress / 100);

        // Only run this if the current level is under 9
        if (currentLevel >= 9) {
            return progressAmount;
        }

        // This calculates how much progress we have in the skill's starting level
        let startingLevelProgress = (profileSkill.Progress % 100) * ((currentLevel + 1) / 10);

        // The code below assumes a 1/10th progress skill amount
        let remainingProgress = progressAmount / 10;

        // We have to do this loop to handle edge cases where the provided XP bumps your level up
        // See "CalculateExpOnFirstLevels" in client for original logic
        let adjustedSkillProgress = 0;
        while (remainingProgress > 0 && currentLevel < 9) {
            // Calculate how much progress to add, limiting it to the current level max progress
            const currentLevelRemainingProgress = (currentLevel + 1) * 10 - startingLevelProgress;
            this.logger.debug(`currentLevelRemainingProgress: ${currentLevelRemainingProgress}`);
            const progressToAdd = Math.min(remainingProgress, currentLevelRemainingProgress);
            const adjustedProgressToAdd = (10 / (currentLevel + 1)) * progressToAdd;
            this.logger.debug(`Progress To Add: ${progressToAdd}  Adjusted for level: ${adjustedProgressToAdd}`);

            // Add the progress amount adjusted by level
            adjustedSkillProgress += adjustedProgressToAdd;
            remainingProgress -= progressToAdd;
            startingLevelProgress = 0;
            currentLevel++;
        }

        // If there's any remaining progress, add it. This handles if you go from level 8 -> 9
        if (remainingProgress > 0) {
            adjustedSkillProgress += remainingProgress;
        }

        return adjustedSkillProgress;
    }

    /**
     * Get quest name by quest id
     * @param questId id to get
     * @returns
     */
    public getQuestNameFromLocale(questId: string): string {
        const questNameKey = `${questId} name`;
        return this.localeService.getLocaleDb()[questNameKey];
    }

    /**
     * Check if trader has sufficient loyalty to fulfill quest requirement
     * @param questProperties Quest props
     * @param profile Player profile
     * @returns true if loyalty is high enough to fulfill quest requirement
     */
    public traderLoyaltyLevelRequirementCheck(questProperties: IQuestCondition, profile: IPmcData): boolean {
        const requiredLoyaltyLevel = Number(questProperties.value);
        const trader = profile.TradersInfo[<string>questProperties.target];
        if (!trader) {
            this.logger.error(
                this.localisationService.getText("quest-unable_to_find_trader_in_profile", questProperties.target),
            );
        }

        return this.compareAvailableForValues(trader.loyaltyLevel, requiredLoyaltyLevel, questProperties.compareMethod);
    }

    /**
     * Check if trader has sufficient standing to fulfill quest requirement
     * @param questProperties Quest props
     * @param profile Player profile
     * @returns true if standing is high enough to fulfill quest requirement
     */
    public traderStandingRequirementCheck(questProperties: IQuestCondition, profile: IPmcData): boolean {
        const requiredStanding = Number(questProperties.value);
        const trader = profile.TradersInfo[<string>questProperties.target];
        if (!trader) {
            this.localisationService.getText("quest-unable_to_find_trader_in_profile", questProperties.target);
        }

        return this.compareAvailableForValues(trader.standing, requiredStanding, questProperties.compareMethod);
    }

    protected compareAvailableForValues(current: number, required: number, compareMethod: string): boolean {
        switch (compareMethod) {
            case ">=":
                return current >= required;
            case ">":
                return current > required;
            case "<=":
                return current <= required;
            case "<":
                return current < required;
            case "!=":
                return current !== required;
            case "==":
                return current === required;

            default:
                this.logger.error(this.localisationService.getText("quest-compare_operator_unhandled", compareMethod));

                return false;
        }
    }

    /**
     * Look up quest in db by accepted quest id and construct a profile-ready object ready to store in profile
     * @param pmcData Player profile
     * @param newState State the new quest should be in when returned
     * @param acceptedQuest Details of accepted quest from client
     */
    public getQuestReadyForProfile(
        pmcData: IPmcData,
        newState: QuestStatus,
        acceptedQuest: IAcceptQuestRequestData,
    ): IQuestStatus {
        const currentTimestamp = this.timeUtil.getTimestamp();
        const existingQuest = pmcData.Quests.find((q) => q.qid === acceptedQuest.qid);
        if (existingQuest) {
            // Quest exists, update its status
            existingQuest.startTime = currentTimestamp;
            existingQuest.status = newState;
            existingQuest.statusTimers[newState] = currentTimestamp;
            existingQuest.completedConditions = [];

            if (existingQuest.availableAfter) {
                // biome-ignore lint/performance/noDelete: Delete is fine here as we're trying to remove the entire data property.
                delete existingQuest.availableAfter;
            }

            return existingQuest;
        }

        // Quest doesn't exists, add it
        const newQuest: IQuestStatus = {
            qid: acceptedQuest.qid,
            startTime: currentTimestamp,
            status: newState,
            statusTimers: {},
        };

        // Check if quest has a prereq to be placed in a 'pending' state, otherwise set status timers value
        const questDbData = this.getQuestFromDb(acceptedQuest.qid, pmcData);
        if (!questDbData) {
            this.logger.error(
                this.localisationService.getText("quest-unable_to_find_quest_in_db", {
                    questId: acceptedQuest.qid,
                    questType: acceptedQuest.type,
                }),
            );
        }

        const waitTime = questDbData?.conditions.AvailableForStart.find((x) => x.availableAfter > 0);
        if (waitTime && acceptedQuest.type !== "repeatable") {
            // Quest should be put into 'pending' state
            newQuest.startTime = 0;
            newQuest.status = QuestStatus.AvailableAfter; // 9
            newQuest.availableAfter = currentTimestamp + waitTime.availableAfter;
        } else {
            newQuest.statusTimers[newState.toString()] = currentTimestamp;
            newQuest.completedConditions = [];
        }

        return newQuest;
    }

    /**
     * Get quests that can be shown to player after starting a quest
     * @param startedQuestId Quest started by player
     * @param sessionID Session id
     * @returns Quests accessible to player incuding newly unlocked quests now quest (startedQuestId) was started
     */
    public getNewlyAccessibleQuestsWhenStartingQuest(startedQuestId: string, sessionID: string): IQuest[] {
        // Get quest acceptance data from profile
        const profile: IPmcData = this.profileHelper.getPmcProfile(sessionID);
        const startedQuestInProfile = profile.Quests.find((profileQuest) => profileQuest.qid === startedQuestId);

        // Get quests that
        const eligibleQuests = this.getQuestsFromDb().filter((quest) => {
            // Quest is accessible to player when the accepted quest passed into param is started
            // e.g. Quest A passed in, quest B is looped over and has requirement of A to be started, include it
            const acceptedQuestCondition = quest.conditions.AvailableForStart.find((condition) => {
                return (
                    condition.conditionType === "Quest" &&
                    condition.target?.includes(startedQuestId) &&
                    condition.status?.includes(QuestStatus.Started)
                );
            });

            // Not found, skip quest
            if (!acceptedQuestCondition) {
                return false;
            }

            // Skip locked event quests
            if (!this.showEventQuestToPlayer(quest._id)) {
                return false;
            }

            // Skip quest if its flagged as for other side
            if (this.questIsForOtherSide(profile.Info.Side, quest._id)) {
                return false;
            }

            if (this.questIsProfileBlacklisted(profile.Info.GameVersion, quest._id)) {
                return false;
            }

            if (!this.questIsProfileWhitelisted(profile.Info.GameVersion, quest._id)) {
                return false;
            }

            const standingRequirements = this.questConditionHelper.getStandingConditions(
                quest.conditions.AvailableForStart,
            );
            for (const condition of standingRequirements) {
                if (!this.traderStandingRequirementCheck(condition, profile)) {
                    return false;
                }
            }

            const loyaltyRequirements = this.questConditionHelper.getLoyaltyConditions(
                quest.conditions.AvailableForStart,
            );
            for (const condition of loyaltyRequirements) {
                if (!this.traderLoyaltyLevelRequirementCheck(condition, profile)) {
                    return false;
                }
            }

            // Include if quest found in profile and is started or ready to hand in
            return (
                startedQuestInProfile &&
                [QuestStatus.Started, QuestStatus.AvailableForFinish].includes(startedQuestInProfile.status)
            );
        });

        return this.getQuestsWithOnlyLevelRequirementStartCondition(eligibleQuests);
    }

    /**
     * Should a seasonal/event quest be shown to the player
     * @param questId Quest to check
     * @returns true = show to player
     */
    public showEventQuestToPlayer(questId: string): boolean {
        const isChristmasEventActive = this.seasonalEventService.christmasEventEnabled();
        const isHalloweenEventActive = this.seasonalEventService.halloweenEventEnabled();

        // Not christmas + quest is for christmas
        if (
            !isChristmasEventActive &&
            this.seasonalEventService.isQuestRelatedToEvent(questId, SeasonalEventType.CHRISTMAS)
        ) {
            return false;
        }

        // Not halloween + quest is for halloween
        if (
            !isHalloweenEventActive &&
            this.seasonalEventService.isQuestRelatedToEvent(questId, SeasonalEventType.HALLOWEEN)
        ) {
            return false;
        }

        // Should non-season event quests be shown to player
        if (
            !this.questConfig.showNonSeasonalEventQuests &&
            this.seasonalEventService.isQuestRelatedToEvent(questId, SeasonalEventType.NONE)
        ) {
            return false;
        }

        return true;
    }

    /**
     * Is the quest for the opposite side the player is on
     * @param playerSide Player side (usec/bear)
     * @param questId QuestId to check
     */
    public questIsForOtherSide(playerSide: string, questId: string): boolean {
        const isUsec = playerSide.toLowerCase() === "usec";
        if (isUsec && this.questConfig.bearOnlyQuests.includes(questId)) {
            // Player is usec and quest is bear only, skip
            return true;
        }

        if (!isUsec && this.questConfig.usecOnlyQuests.includes(questId)) {
            // Player is bear and quest is usec only, skip
            return true;
        }

        return false;
    }

    /**
     * Is the provided quest prevented from being viewed by the provided game version
     * (Inclusive filter)
     * @param gameVersion Game version to check against
     * @param questId Quest id to check
     * @returns True Quest should not be visible to game version
     */
    protected questIsProfileBlacklisted(gameVersion: string, questId: string) {
        const questBlacklist = this.questConfig.profileBlacklist[gameVersion];
        if (!questBlacklist) {
            // Not blacklisted
            return false;
        }

        return questBlacklist.includes(questId);
    }

    /**
     * Is the provided quest able to be seen by the provided game version
     * (Exclusive filter)
     * @param gameVersion Game version to check against
     * @param questId Quest id to check
     * @returns True Quest should be visible to game version
     */
    protected questIsProfileWhitelisted(gameVersion: string, questId: string) {
        const gameVersionWhitelist = this.questConfig.profileWhitelist[questId];
        if (!gameVersionWhitelist) {
            // Quest not found in whitelist dict, assume quest is good
            return true;
        }

        // Quest in dict, return if game version is on whitelist
        return gameVersionWhitelist.includes(gameVersion);
    }

    /**
     * Get quests that can be shown to player after failing a quest
     * @param failedQuestId Id of the quest failed by player
     * @param sessionId Session id
     * @returns IQuest array
     */
    public failedUnlocked(failedQuestId: string, sessionId: string): IQuest[] {
        const profile = this.profileHelper.getPmcProfile(sessionId);
        const profileQuest = profile.Quests.find((x) => x.qid === failedQuestId);

        const quests = this.getQuestsFromDb().filter((q) => {
            const acceptedQuestCondition = q.conditions.AvailableForStart.find((c) => {
                return (
                    c.conditionType === "Quest" && c.target.includes(failedQuestId) && c.status[0] === QuestStatus.Fail
                );
            });

            if (!acceptedQuestCondition) {
                return false;
            }

            return profileQuest && profileQuest.status === QuestStatus.Fail;
        });

        if (quests.length === 0) {
            return quests;
        }

        return this.getQuestsWithOnlyLevelRequirementStartCondition(quests);
    }

    /**
     * Sets the item stack to new value, or delete the item if value <= 0
     * // TODO maybe merge this function and the one from customization
     * @param pmcData Profile
     * @param itemId id of item to adjust stack size of
     * @param newStackSize Stack size to adjust to
     * @param sessionID Session id
     * @param output ItemEvent router response
     */
    public changeItemStack(
        pmcData: IPmcData,
        itemId: string,
        newStackSize: number,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void {
        const inventoryItemIndex = pmcData.Inventory.items.findIndex((item) => item._id === itemId);
        if (inventoryItemIndex < 0) {
            this.logger.error(this.localisationService.getText("quest-item_not_found_in_inventory", itemId));

            return;
        }

        if (newStackSize > 0) {
            const item = pmcData.Inventory.items[inventoryItemIndex];
            this.itemHelper.addUpdObjectToItem(item);

            item.upd.StackObjectsCount = newStackSize;

            this.addItemStackSizeChangeIntoEventResponse(output, sessionID, item);
        } else {
            // this case is probably dead Code right now, since the only calling function
            // checks explicitly for Value > 0.
            output.profileChanges[sessionID].items.del.push({ _id: itemId });
            pmcData.Inventory.items.splice(inventoryItemIndex, 1);
        }
    }

    /**
     * Add item stack change object into output route event response
     * @param output Response to add item change event into
     * @param sessionId Session id
     * @param item Item that was adjusted
     */
    protected addItemStackSizeChangeIntoEventResponse(
        output: IItemEventRouterResponse,
        sessionId: string,
        item: IItem,
    ): void {
        output.profileChanges[sessionId].items.change.push({
            _id: item._id,
            _tpl: item._tpl,
            parentId: item.parentId,
            slotId: item.slotId,
            location: item.location,
            upd: { StackObjectsCount: item.upd.StackObjectsCount },
        });
    }

    /**
     * Get quests, strip all requirement conditions except level
     * @param quests quests to process
     * @returns quest array without conditions
     */
    protected getQuestsWithOnlyLevelRequirementStartCondition(quests: IQuest[]): IQuest[] {
        for (const i in quests) {
            quests[i] = this.getQuestWithOnlyLevelRequirementStartCondition(quests[i]);
        }

        return quests;
    }

    /**
     * Remove all quest conditions except for level requirement
     * @param quest quest to clean
     * @returns reset IQuest object
     */
    public getQuestWithOnlyLevelRequirementStartCondition(quest: IQuest): IQuest {
        const updatedQuest = this.cloner.clone(quest);
        updatedQuest.conditions.AvailableForStart = updatedQuest.conditions.AvailableForStart.filter(
            (q) => q.conditionType === "Level",
        );

        return updatedQuest;
    }

    /**
     * Fail a quest in a player profile
     * @param pmcData Player profile
     * @param failRequest Fail quest request data
     * @param sessionID Session id
     * @param output Client output
     */
    public failQuest(
        pmcData: IPmcData,
        failRequest: IFailQuestRequestData,
        sessionID: string,
        output?: IItemEventRouterResponse,
    ): void {
        let updatedOutput = output;

        // Prepare response to send back to client
        if (!updatedOutput) {
            updatedOutput = this.eventOutputHolder.getOutput(sessionID);
        }

        this.updateQuestState(pmcData, QuestStatus.Fail, failRequest.qid);
        const questRewards = this.questRewardHelper.applyQuestReward(
            pmcData,
            failRequest.qid,
            QuestStatus.Fail,
            sessionID,
            updatedOutput,
        );

        // Create a dialog message for completing the quest.
        const quest = this.getQuestFromDb(failRequest.qid, pmcData);

        // Merge all daily/weekly/scav daily quests into one array and look for the matching quest by id
        const matchingRepeatableQuest = pmcData.RepeatableQuests.flatMap(
            (repeatableType) => repeatableType.activeQuests,
        ).find((activeQuest) => activeQuest._id === failRequest.qid);

        // Quest found and no repeatable found
        if (quest && !matchingRepeatableQuest) {
            if (quest.failMessageText.trim().length > 0) {
                this.mailSendService.sendLocalisedNpcMessageToPlayer(
                    sessionID,
                    this.traderHelper.getTraderById(quest?.traderId ?? matchingRepeatableQuest?.traderId), // Can be undefined when repeatable quest has been moved to inactiveQuests
                    MessageType.QUEST_FAIL,
                    quest.failMessageText,
                    questRewards,
                    this.timeUtil.getHoursAsSeconds(this.getMailItemRedeemTimeHoursForProfile(pmcData)),
                );
            }
        }

        updatedOutput.profileChanges[sessionID].quests.push(...this.failedUnlocked(failRequest.qid, sessionID));
    }

    /**
     * Get List of All Quests from db
     * NOT CLONED
     * @returns Array of IQuest objects
     */
    public getQuestsFromDb(): IQuest[] {
        return Object.values(this.databaseService.getQuests());
    }

    /**
     * Get quest by id from database (repeatables are stored in profile, check there if questId not found)
     * @param questId Id of quest to find
     * @param pmcData Player profile
     * @returns IQuest object
     */
    public getQuestFromDb(questId: string, pmcData: IPmcData): IQuest {
        // May be a repeatable quest
        let quest = this.databaseService.getQuests()[questId];
        if (!quest) {
            // Check daily/weekly objects
            for (const repeatableType of pmcData.RepeatableQuests) {
                quest = <IQuest>(<unknown>repeatableType.activeQuests.find((repeatable) => repeatable._id === questId));
                if (quest) {
                    break;
                }
            }
        }

        return quest;
    }

    /**
     * Get a quests startedMessageText key from db, if no startedMessageText key found, use description key instead
     * @param startedMessageTextId startedMessageText property from IQuest
     * @param questDescriptionId description property from IQuest
     * @returns message id
     */
    public getMessageIdForQuestStart(startedMessageTextId: string, questDescriptionId: string): string {
        // blank or is a guid, use description instead
        const startedMessageText = this.getQuestLocaleIdFromDb(startedMessageTextId);
        if (
            !startedMessageText ||
            startedMessageText.trim() === "" ||
            startedMessageText.toLowerCase() === "test" ||
            startedMessageText.length === 24
        ) {
            return questDescriptionId;
        }

        return startedMessageTextId;
    }

    /**
     * Get the locale Id from locale db for a quest message
     * @param questMessageId Quest message id to look up
     * @returns Locale Id from locale db
     */
    public getQuestLocaleIdFromDb(questMessageId: string): string {
        const locale = this.localeService.getLocaleDb();
        return locale[questMessageId];
    }

    /**
     * Alter a quests state + Add a record to its status timers object
     * @param pmcData Profile to update
     * @param newQuestState New state the quest should be in
     * @param questId Id of the quest to alter the status of
     */
    public updateQuestState(pmcData: IPmcData, newQuestState: QuestStatus, questId: string): void {
        // Find quest in profile, update status to desired status
        const questToUpdate = pmcData.Quests.find((quest) => quest.qid === questId);
        if (questToUpdate) {
            questToUpdate.status = newQuestState;
            questToUpdate.statusTimers[newQuestState] = this.timeUtil.getTimestamp();
        }
    }

    /**
     * Resets a quests values back to its chosen state
     * @param pmcData Profile to update
     * @param newQuestState New state the quest should be in
     * @param questId Id of the quest to alter the status of
     */
    public resetQuestState(pmcData: IPmcData, newQuestState: QuestStatus, questId: string): void {
        const questToUpdate = pmcData.Quests.find((quest) => quest.qid === questId);
        if (questToUpdate) {
            const currentTimestamp = this.timeUtil.getTimestamp();

            questToUpdate.status = newQuestState;

            // Only set start time when quest is being started
            if (newQuestState === QuestStatus.Started) {
                questToUpdate.startTime = currentTimestamp;
            }

            questToUpdate.statusTimers[newQuestState] = currentTimestamp;

            // Delete all status timers after applying new status
            for (const statusKey in questToUpdate.statusTimers) {
                if (Number.parseInt(statusKey) > newQuestState) {
                    delete questToUpdate.statusTimers[statusKey];
                }
            }

            // Remove all completed conditions
            questToUpdate.completedConditions = [];
        }
    }

    /**
     * Find quest with 'findItem' condition that needs the item tpl be handed in
     * @param itemTpl item tpl to look for
     * @param questIds Quests to search through for the findItem condition
     * @returns quest id with 'FindItem' condition id
     */
    public getFindItemConditionByQuestItem(
        itemTpl: string,
        questIds: string[],
        allQuests: IQuest[],
    ): Record<string, string> {
        const result: Record<string, string> = {};
        for (const questId of questIds) {
            const questInDb = allQuests.find((x) => x._id === questId);
            if (!questInDb) {
                this.logger.debug(`Unable to find quest: ${questId} in db, cannot get 'FindItem' condition, skipping`);
                continue;
            }

            const condition = questInDb.conditions.AvailableForFinish.find(
                (c) => c.conditionType === "FindItem" && c?.target?.includes(itemTpl),
            );
            if (condition) {
                result[questId] = condition.id;

                break;
            }
        }

        return result;
    }

    /**
     * Add all quests to a profile with the provided statuses
     * @param pmcProfile profile to update
     * @param statuses statuses quests should have
     */
    public addAllQuestsToProfile(pmcProfile: IPmcData, statuses: QuestStatus[]): void {
        // Iterate over all quests in db
        const quests = this.databaseService.getQuests();
        for (const questIdKey in quests) {
            // Quest from db matches quests in profile, skip
            const questData = quests[questIdKey];
            if (pmcProfile.Quests.some((x) => x.qid === questData._id)) {
                continue;
            }

            const statusesDict = {} as Record<QuestStatus, number>;
            for (const status of statuses) {
                statusesDict[status] = this.timeUtil.getTimestamp();
            }

            const questRecordToAdd: IQuestStatus = {
                qid: questIdKey,
                startTime: this.timeUtil.getTimestamp(),
                status: statuses[statuses.length - 1],
                statusTimers: statusesDict,
                completedConditions: [],
                availableAfter: 0,
            };

            // Does quest already exist in profile
            if (pmcProfile.Quests.some((questStatus) => questStatus.qid === questIdKey)) {
                // Update existing
                const existingQuest = pmcProfile.Quests.find((x) => x.qid === questIdKey);
                existingQuest.status = questRecordToAdd.status;
                existingQuest.statusTimers = questRecordToAdd.statusTimers;
            } else {
                // Add new
                pmcProfile.Quests.push(questRecordToAdd);
            }
        }
    }

    public findAndRemoveQuestFromArrayIfExists(questId: string, quests: IQuestStatus[]): void {
        const pmcQuestToReplaceStatus = quests.find((quest) => quest.qid === questId);
        if (pmcQuestToReplaceStatus) {
            quests.splice(quests.indexOf(pmcQuestToReplaceStatus), 1);
        }
    }

    /**
     * Return a list of quests that would fail when supplied quest is completed
     * @param completedQuestId quest completed id
     * @returns array of IQuest objects
     */
    public getQuestsFailedByCompletingQuest(completedQuestId: string): IQuest[] {
        const questsInDb = this.getQuestsFromDb();
        return questsInDb.filter((quest) => {
            // No fail conditions, exit early
            if (!quest.conditions.Fail || quest.conditions.Fail.length === 0) {
                return false;
            }

            return quest.conditions.Fail.some((condition) => condition.target?.includes(completedQuestId));
        });
    }

    /**
     * Get the hours a mails items can be collected for by profile type
     * @param pmcData Profile to get hours for
     * @returns Hours item will be available for
     */
    public getMailItemRedeemTimeHoursForProfile(pmcData: IPmcData): number {
        const value = this.questConfig.mailRedeemTimeHours[pmcData.Info.GameVersion];
        if (!value) {
            return this.questConfig.mailRedeemTimeHours.default;
        }

        return value;
    }

    public completeQuest(
        pmcData: IPmcData,
        body: ICompleteQuestRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const completeQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        const completedQuest = this.getQuestFromDb(body.qid, pmcData);
        const preCompleteProfileQuests = this.cloner.clone(pmcData.Quests);

        const completedQuestId = body.qid;
        const clientQuestsClone = this.cloner.clone(this.getClientQuests(sessionID)); // Must be gathered prior to applyQuestReward() & failQuests()

        const newQuestState = QuestStatus.Success;
        this.updateQuestState(pmcData, newQuestState, completedQuestId);
        const questRewards = this.questRewardHelper.applyQuestReward(
            pmcData,
            body.qid,
            newQuestState,
            sessionID,
            completeQuestResponse,
        );

        // Check for linked failed + unrestartable quests (only get quests not already failed
        const questsToFail = this.getQuestsFromProfileFailedByCompletingQuest(completedQuestId, pmcData);
        if (questsToFail?.length > 0) {
            this.failQuests(sessionID, pmcData, questsToFail, completeQuestResponse);
        }

        // Show modal on player screen
        this.sendSuccessDialogMessageOnQuestComplete(sessionID, pmcData, completedQuestId, questRewards);

        // Add diff of quests before completion vs after for client response
        const questDelta = this.getDeltaQuests(clientQuestsClone, this.getClientQuests(sessionID));

        // Check newly available + failed quests for timegates and add them to profile
        this.addTimeLockedQuestsToProfile(pmcData, [...questDelta], body.qid);

        // Inform client of quest changes
        completeQuestResponse.profileChanges[sessionID].quests.push(...questDelta);

        // Check if it's a repeatable quest. If so, remove from Quests
        for (const currentRepeatable of pmcData.RepeatableQuests) {
            const repeatableQuest = currentRepeatable.activeQuests.find(
                (activeRepeatable) => activeRepeatable._id === completedQuestId,
            );
            if (repeatableQuest) {
                // Need to remove redundant scav quest object as its no longer necessary, is tracked in pmc profile
                if (repeatableQuest.side === "Scav") {
                    this.removeQuestFromScavProfile(sessionID, repeatableQuest._id);
                }
            }
        }

        // Hydrate client response questsStatus array with data
        const questStatusChanges = this.getQuestsWithDifferentStatuses(preCompleteProfileQuests, pmcData.Quests);
        if (questStatusChanges) {
            completeQuestResponse.profileChanges[sessionID].questsStatus.push(...questStatusChanges);
        }

        // Recalculate level in event player leveled up
        pmcData.Info.Level = this.playerService.calculateLevel(pmcData);

        return completeQuestResponse;
    }

    /**
     * Handle client/quest/list
     * Get all quests visible to player
     * Exclude quests with incomplete preconditions (level/loyalty)
     * @param sessionID session id
     * @returns array of IQuest
     */
    public getClientQuests(sessionID: string): IQuest[] {
        const questsToShowPlayer: IQuest[] = [];
        const allQuests = this.getQuestsFromDb();
        const profile: IPmcData = this.profileHelper.getPmcProfile(sessionID);
        const gameVersion = profile.Info.GameVersion;

        for (const quest of allQuests) {
            // Player already accepted the quest, show it regardless of status
            const questInProfile = profile.Quests.find((x) => x.qid === quest._id);
            if (questInProfile) {
                quest.sptStatus = questInProfile.status;
                questsToShowPlayer.push(quest);
                continue;
            }

            // Filter out bear quests for usec and vice versa
            if (this.questIsForOtherSide(profile.Info.Side, quest._id)) {
                continue;
            }

            if (!this.showEventQuestToPlayer(quest._id)) {
                continue;
            }

            // Don't add quests that have a level higher than the user's
            if (!this.playerLevelFulfillsQuestRequirement(quest, profile.Info.Level)) {
                continue;
            }

            // Player can use trader mods then remove them, leaving quests behind
            const trader = profile.TradersInfo[quest.traderId];
            if (!trader) {
                this.logger.debug(
                    `Unable to show quest: ${quest.QuestName} as its for a trader: ${quest.traderId} that no longer exists.`,
                );

                continue;
            }

            const questRequirements = this.questConditionHelper.getQuestConditions(quest.conditions.AvailableForStart);
            const loyaltyRequirements = this.questConditionHelper.getLoyaltyConditions(
                quest.conditions.AvailableForStart,
            );
            const standingRequirements = this.questConditionHelper.getStandingConditions(
                quest.conditions.AvailableForStart,
            );

            // Quest has no conditions, standing or loyalty conditions, add to visible quest list
            if (
                questRequirements.length === 0 &&
                loyaltyRequirements.length === 0 &&
                standingRequirements.length === 0
            ) {
                quest.sptStatus = QuestStatus.AvailableForStart;
                questsToShowPlayer.push(quest);
                continue;
            }

            // Check the status of each quest condition, if any are not completed
            // then this quest should not be visible
            let haveCompletedPreviousQuest = true;
            for (const conditionToFulfil of questRequirements) {
                // If the previous quest isn't in the user profile, it hasn't been completed or started
                const prerequisiteQuest = profile.Quests.find((profileQuest) =>
                    conditionToFulfil.target.includes(profileQuest.qid),
                );
                if (!prerequisiteQuest) {
                    haveCompletedPreviousQuest = false;
                    break;
                }

                // Prereq does not have its status requirement fulfilled
                // Some bsg status ids are strings, MUST convert to number before doing includes check
                if (!conditionToFulfil.status.map((status) => Number(status)).includes(prerequisiteQuest.status)) {
                    haveCompletedPreviousQuest = false;
                    break;
                }

                // Has a wait timer
                if (conditionToFulfil.availableAfter > 0) {
                    // Compare current time to unlock time for previous quest
                    const previousQuestCompleteTime = prerequisiteQuest.statusTimers[prerequisiteQuest.status];
                    const unlockTime = previousQuestCompleteTime + conditionToFulfil.availableAfter;
                    if (unlockTime > this.timeUtil.getTimestamp()) {
                        this.logger.debug(
                            `Quest ${quest.QuestName} is locked for another ${
                                unlockTime - this.timeUtil.getTimestamp()
                            } seconds`,
                        );
                    }
                }
            }

            // Previous quest not completed, skip
            if (!haveCompletedPreviousQuest) {
                continue;
            }

            let passesLoyaltyRequirements = true;
            for (const condition of loyaltyRequirements) {
                if (!this.traderLoyaltyLevelRequirementCheck(condition, profile)) {
                    passesLoyaltyRequirements = false;
                    break;
                }
            }

            let passesStandingRequirements = true;
            for (const condition of standingRequirements) {
                if (!this.traderStandingRequirementCheck(condition, profile)) {
                    passesStandingRequirements = false;
                    break;
                }
            }

            if (haveCompletedPreviousQuest && passesLoyaltyRequirements && passesStandingRequirements) {
                quest.sptStatus = QuestStatus.AvailableForStart;
                questsToShowPlayer.push(quest);
            }
        }

        return this.updateQuestsForGameEdition(questsToShowPlayer, gameVersion);
    }

    /**
     * Create a clone of the given quest array with the rewards updated to reflect the
     * given game version
     * @param quests List of quests to check
     * @param gameVersion Game version of the profile
     * @returns Array of IQuest objects with the rewards filtered correctly for the game version
     */
    protected updateQuestsForGameEdition(quests: IQuest[], gameVersion: string): IQuest[] {
        const modifiedQuests = this.cloner.clone(quests);
        for (const quest of modifiedQuests) {
            // Remove any reward that doesn't pass the game edition check
            for (const rewardType of Object.keys(quest.rewards)) {
                quest.rewards[rewardType] = quest.rewards[rewardType].filter((reward: IQuestReward) =>
                    this.questRewardHelper.questRewardIsForGameEdition(reward, gameVersion),
                );
            }
        }

        return modifiedQuests;
    }

    /**
     * Return a list of quests that would fail when supplied quest is completed
     * @param completedQuestId Quest completed id
     * @returns Array of IQuest objects
     */
    protected getQuestsFromProfileFailedByCompletingQuest(completedQuestId: string, pmcProfile: IPmcData): IQuest[] {
        const questsInDb = this.getQuestsFromDb();
        return questsInDb.filter((quest) => {
            // No fail conditions, skip
            if (!quest.conditions.Fail || quest.conditions.Fail.length === 0) {
                return false;
            }

            // Quest already failed in profile, skip
            if (
                pmcProfile.Quests.some(
                    (profileQuest) => profileQuest.qid === quest._id && profileQuest.status === QuestStatus.Fail,
                )
            ) {
                return false;
            }

            return quest.conditions.Fail.some((condition) => condition.target?.includes(completedQuestId));
        });
    }

    /**
     * Fail the provided quests
     * Update quest in profile, otherwise add fresh quest object with failed status
     * @param sessionID session id
     * @param pmcData player profile
     * @param questsToFail quests to fail
     * @param output Client output
     */
    protected failQuests(
        sessionID: string,
        pmcData: IPmcData,
        questsToFail: IQuest[],
        output: IItemEventRouterResponse,
    ): void {
        for (const questToFail of questsToFail) {
            // Skip failing a quest that has a fail status of something other than success
            if (questToFail.conditions.Fail?.some((x) => x.status?.some((status) => status !== QuestStatus.Success))) {
                continue;
            }

            const isActiveQuestInPlayerProfile = pmcData.Quests.find((quest) => quest.qid === questToFail._id);
            if (isActiveQuestInPlayerProfile) {
                if (isActiveQuestInPlayerProfile.status !== QuestStatus.Fail) {
                    const failBody: IFailQuestRequestData = {
                        Action: "QuestFail",
                        qid: questToFail._id,
                        removeExcessItems: true,
                    };
                    this.failQuest(pmcData, failBody, sessionID, output);
                }
            } else {
                // Failing an entirely new quest that doesn't exist in profile
                const statusTimers = {} as Record<QuestStatus, number>;
                statusTimers[QuestStatus.Fail] = this.timeUtil.getTimestamp();
                const questData: IQuestStatus = {
                    qid: questToFail._id,
                    startTime: this.timeUtil.getTimestamp(),
                    statusTimers: statusTimers,
                    status: QuestStatus.Fail,
                };
                pmcData.Quests.push(questData);
            }
        }
    }

    /**
     * Send a popup to player on successful completion of a quest
     * @param sessionID session id
     * @param pmcData Player profile
     * @param completedQuestId Completed quest id
     * @param questRewards Rewards given to player
     */
    protected sendSuccessDialogMessageOnQuestComplete(
        sessionID: string,
        pmcData: IPmcData,
        completedQuestId: string,
        questRewards: IItem[],
    ): void {
        const quest = this.getQuestFromDb(completedQuestId, pmcData);

        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionID,
            this.traderHelper.getTraderById(quest.traderId),
            MessageType.QUEST_SUCCESS,
            quest.successMessageText,
            questRewards,
            this.timeUtil.getHoursAsSeconds(this.getMailItemRedeemTimeHoursForProfile(pmcData)),
        );
    }

    /**
     * Look for newly available quests after completing a quest with a requirement to wait x minutes (time-locked) before being available and add data to profile
     * @param pmcData Player profile to update
     * @param quests Quests to look for wait conditions in
     * @param completedQuestId Quest just completed
     */
    protected addTimeLockedQuestsToProfile(pmcData: IPmcData, quests: IQuest[], completedQuestId: string): void {
        // Iterate over quests, look for quests with right criteria
        for (const quest of quests) {
            // If quest has prereq of completed quest + availableAfter value > 0 (quest has wait time)
            const nextQuestWaitCondition = quest.conditions.AvailableForStart.find(
                (x) => x.target?.includes(completedQuestId) && x.availableAfter > 0,
            );
            if (nextQuestWaitCondition) {
                // Now + wait time
                const availableAfterTimestamp = this.timeUtil.getTimestamp() + nextQuestWaitCondition.availableAfter;

                // Update quest in profile with status of AvailableAfter
                const existingQuestInProfile = pmcData.Quests.find((x) => x.qid === quest._id);
                if (existingQuestInProfile) {
                    existingQuestInProfile.availableAfter = availableAfterTimestamp;
                    existingQuestInProfile.status = QuestStatus.AvailableAfter;
                    existingQuestInProfile.startTime = 0;
                    existingQuestInProfile.statusTimers = {};

                    continue;
                }

                pmcData.Quests.push({
                    qid: quest._id,
                    startTime: 0,
                    status: QuestStatus.AvailableAfter,
                    statusTimers: {
                        9: this.timeUtil.getTimestamp(),
                    },
                    availableAfter: availableAfterTimestamp,
                });
            }
        }
    }

    /**
     * Remove a quest entirely from a profile
     * @param sessionId Player id
     * @param questIdToRemove Qid of quest to remove
     */
    protected removeQuestFromScavProfile(sessionId: string, questIdToRemove: string): void {
        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        const repeatableInScavProfile = fullProfile.characters.scav.Quests?.find((x) => x.qid === questIdToRemove);
        if (!repeatableInScavProfile) {
            this.logger.warning(
                this.localisationService.getText("quest-unable_to_remove_scav_quest_from_profile", {
                    scavQuestId: questIdToRemove,
                    profileId: sessionId,
                }),
            );

            return;
        }

        fullProfile.characters.scav.Quests.splice(
            fullProfile.characters.scav.Quests.indexOf(repeatableInScavProfile),
            1,
        );
    }

    /**
     * Return quests that have different statuses
     * @param preQuestStatusus Quests before
     * @param postQuestStatuses Quests after
     * @returns QuestStatusChange array
     */
    protected getQuestsWithDifferentStatuses(
        preQuestStatusus: IQuestStatus[],
        postQuestStatuses: IQuestStatus[],
    ): IQuestStatus[] | undefined {
        const result: IQuestStatus[] = [];

        for (const quest of postQuestStatuses) {
            // Add quest if status differs or quest not found
            const preQuest = preQuestStatusus.find((x) => x.qid === quest.qid);
            if (!preQuest || preQuest.status !== quest.status) {
                result.push(quest);
            }
        }

        if (result.length === 0) {
            return undefined;
        }

        return result;
    }

    /**
     * Does a provided quest have a level requirement equal to or below defined level
     * @param quest Quest to check
     * @param playerLevel level of player to test against quest
     * @returns true if quest can be seen/accepted by player of defined level
     */
    protected playerLevelFulfillsQuestRequirement(quest: IQuest, playerLevel: number): boolean {
        if (!quest.conditions) {
            // No conditions
            return true;
        }

        const levelConditions = this.questConditionHelper.getLevelConditions(quest.conditions.AvailableForStart);
        if (levelConditions.length) {
            for (const levelCondition of levelConditions) {
                if (!this.doesPlayerLevelFulfilCondition(playerLevel, levelCondition)) {
                    // Not valid, exit out
                    return false;
                }
            }
        }

        // All conditions passed / has no level requirement, valid
        return true;
    }
}
