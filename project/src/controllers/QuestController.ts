import { inject, injectable } from "tsyringe";

import { DialogueHelper } from "@spt-aki/helpers/DialogueHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { QuestConditionHelper } from "@spt-aki/helpers/QuestConditionHelper";
import { QuestHelper } from "@spt-aki/helpers/QuestHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IQuestStatus } from "@spt-aki/models/eft/common/tables/IBotBase";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { IQuest, IQuestCondition } from "@spt-aki/models/eft/common/tables/IQuest";
import { IPmcDataRepeatableQuest, IRepeatableQuest } from "@spt-aki/models/eft/common/tables/IRepeatableQuests";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IAcceptQuestRequestData } from "@spt-aki/models/eft/quests/IAcceptQuestRequestData";
import { ICompleteQuestRequestData } from "@spt-aki/models/eft/quests/ICompleteQuestRequestData";
import { IFailQuestRequestData } from "@spt-aki/models/eft/quests/IFailQuestRequestData";
import { IHandoverQuestRequestData } from "@spt-aki/models/eft/quests/IHandoverQuestRequestData";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { MessageType } from "@spt-aki/models/enums/MessageType";
import { QuestStatus } from "@spt-aki/models/enums/QuestStatus";
import { SeasonalEventType } from "@spt-aki/models/enums/SeasonalEventType";
import { IQuestConfig } from "@spt-aki/models/spt/config/IQuestConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LocaleService } from "@spt-aki/services/LocaleService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { MailSendService } from "@spt-aki/services/MailSendService";
import { PlayerService } from "@spt-aki/services/PlayerService";
import { SeasonalEventService } from "@spt-aki/services/SeasonalEventService";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class QuestController
{
    protected questConfig: IQuestConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("HttpResponseUtil") protected httpResponseUtil: HttpResponseUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("QuestConditionHelper") protected questConditionHelper: QuestConditionHelper,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * Handle client/quest/list
     * Get all quests visible to player
     * Exclude quests with incomplete preconditions (level/loyalty)
     * @param sessionID session id
     * @returns array of IQuest
     */
    public getClientQuests(sessionID: string): IQuest[]
    {
        const questsToShowPlayer: IQuest[] = [];
        const allQuests = this.questHelper.getQuestsFromDb();
        const profile: IPmcData = this.profileHelper.getPmcProfile(sessionID);

        for (const quest of allQuests)
        {
            // Player already accepted the quest, show it regardless of status
            const questInProfile = profile.Quests.find((x) => x.qid === quest._id);
            if (questInProfile)
            {
                quest.sptStatus = questInProfile.status;
                questsToShowPlayer.push(quest);
                continue;
            }

            // Filter out bear quests for usec and vice versa
            if (this.questIsForOtherSide(profile.Info.Side, quest._id))
            {
                continue;
            }

            if (!this.showEventQuestToPlayer(quest._id))
            {
                continue;
            }

            // Don't add quests that have a level higher than the user's
            if (!this.playerLevelFulfillsQuestRequirement(quest, profile.Info.Level))
            {
                continue;
            }

            // Player can use trader mods then remove them, leaving quests behind
            const trader = profile.TradersInfo[quest.traderId];
            if (!trader)
            {
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
            if (questRequirements.length === 0 && loyaltyRequirements.length === 0 && standingRequirements.length === 0)
            {
                quest.sptStatus = QuestStatus.AvailableForStart;
                questsToShowPlayer.push(quest);
                continue;
            }

            // Check the status of each quest condition, if any are not completed
            // then this quest should not be visible
            let haveCompletedPreviousQuest = true;
            for (const conditionToFulfil of questRequirements)
            {
                // If the previous quest isn't in the user profile, it hasn't been completed or started
                const prerequisiteQuest = profile.Quests.find((profileQuest) =>
                    conditionToFulfil.target.includes(profileQuest.qid)
                );
                if (!prerequisiteQuest)
                {
                    haveCompletedPreviousQuest = false;
                    break;
                }

                // Prereq does not have its status requirement fulfilled
                // Some bsg status ids are strings, MUST convert to number before doing includes check
                if (!conditionToFulfil.status.map((status) => Number(status)).includes(prerequisiteQuest.status))
                {
                    haveCompletedPreviousQuest = false;
                    break;
                }

                // Has a wait timer
                if (conditionToFulfil.availableAfter > 0)
                {
                    // Compare current time to unlock time for previous quest
                    const previousQuestCompleteTime = prerequisiteQuest.statusTimers[prerequisiteQuest.status];
                    const unlockTime = previousQuestCompleteTime + conditionToFulfil.availableAfter;
                    if (unlockTime > this.timeUtil.getTimestamp())
                    {
                        this.logger.debug(
                            `Quest ${quest.QuestName} is locked for another ${
                                unlockTime - this.timeUtil.getTimestamp()
                            } seconds`,
                        );
                    }
                }
            }

            // Previous quest not completed, skip
            if (!haveCompletedPreviousQuest)
            {
                continue;
            }

            let passesLoyaltyRequirements = true;
            for (const condition of loyaltyRequirements)
            {
                if (!this.questHelper.traderLoyaltyLevelRequirementCheck(condition, profile))
                {
                    passesLoyaltyRequirements = false;
                    break;
                }
            }

            let passesStandingRequirements = true;
            for (const condition of standingRequirements)
            {
                if (!this.questHelper.traderStandingRequirementCheck(condition, profile))
                {
                    passesStandingRequirements = false;
                    break;
                }
            }

            if (haveCompletedPreviousQuest && passesLoyaltyRequirements && passesStandingRequirements)
            {
                quest.sptStatus = QuestStatus.AvailableForStart;
                questsToShowPlayer.push(quest);
            }
        }

        return questsToShowPlayer;
    }

    /**
     * Does a provided quest have a level requirement equal to or below defined level
     * @param quest Quest to check
     * @param playerLevel level of player to test against quest
     * @returns true if quest can be seen/accepted by player of defined level
     */
    protected playerLevelFulfillsQuestRequirement(quest: IQuest, playerLevel: number): boolean
    {
        const levelConditions = this.questConditionHelper.getLevelConditions(quest.conditions.AvailableForStart);
        if (levelConditions.length)
        {
            for (const levelCondition of levelConditions)
            {
                if (!this.questHelper.doesPlayerLevelFulfilCondition(playerLevel, levelCondition))
                {
                    // Not valid, exit out
                    return false;
                }
            }
        }

        // All conditions passed / has no level requirement, valid
        return true;
    }

    /**
     * Should a quest be shown to the player in trader quest screen
     * @param questId Quest to check
     * @returns true = show to player
     */
    protected showEventQuestToPlayer(questId: string): boolean
    {
        const isChristmasEventActive = this.seasonalEventService.christmasEventEnabled();
        const isHalloweenEventActive = this.seasonalEventService.halloweenEventEnabled();

        // Not christmas + quest is for christmas
        if (
            !isChristmasEventActive
            && this.seasonalEventService.isQuestRelatedToEvent(questId, SeasonalEventType.CHRISTMAS)
        )
        {
            return false;
        }

        // Not halloween + quest is for halloween
        if (
            !isHalloweenEventActive
            && this.seasonalEventService.isQuestRelatedToEvent(questId, SeasonalEventType.HALLOWEEN)
        )
        {
            return false;
        }

        // Should non-season event quests be shown to player
        if (
            !this.questConfig.showNonSeasonalEventQuests
            && this.seasonalEventService.isQuestRelatedToEvent(questId, SeasonalEventType.NONE)
        )
        {
            return false;
        }

        return true;
    }

    /**
     * Is the quest for the opposite side the player is on
     * @param playerSide Player side (usec/bear)
     * @param questId QuestId to check
     */
    protected questIsForOtherSide(playerSide: string, questId: string): boolean
    {
        const isUsec = playerSide.toLowerCase() === "usec";
        if (isUsec && this.questConfig.bearOnlyQuests.includes(questId))
        {
            // player is usec and quest is bear only, skip
            return true;
        }

        if (!isUsec && this.questConfig.usecOnlyQuests.includes(questId))
        {
            // player is bear and quest is usec only, skip
            return true;
        }

        return false;
    }

    /**
     * Handle QuestAccept event
     * Handle the client accepting a quest and starting it
     * Send starting rewards if any to player and
     * Send start notification if any to player
     * @param pmcData Profile to update
     * @param acceptedQuest Quest accepted
     * @param sessionID Session id
     * @returns Client response
     */
    public acceptQuest(
        pmcData: IPmcData,
        acceptedQuest: IAcceptQuestRequestData,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        const acceptQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        // Does quest exist in profile
        // Restarting a failed quest can mean quest exists in profile
        const existingQuestStatus = pmcData.Quests.find((x) => x.qid === acceptedQuest.qid);
        if (existingQuestStatus)
        {
            // Update existing
            this.questHelper.resetQuestState(pmcData, QuestStatus.Started, acceptedQuest.qid);

            // Need to send client an empty list of completedConditions (Unsure if this does anything)
            acceptQuestResponse.profileChanges[sessionID].questsStatus.push(existingQuestStatus);
        }
        else
        {
            // Add new quest to server profile
            const newQuest = this.questHelper.getQuestReadyForProfile(pmcData, QuestStatus.Started, acceptedQuest);
            pmcData.Quests.push(newQuest);
        }

        // Create a dialog message for starting the quest.
        // Note that for starting quests, the correct locale field is "description", not "startedMessageText".
        const questFromDb = this.questHelper.getQuestFromDb(acceptedQuest.qid, pmcData);

        // Get messageId of text to send to player as text message in game
        const messageId = this.questHelper.getMessageIdForQuestStart(
            questFromDb.startedMessageText,
            questFromDb.description,
        );

        // Apply non-item rewards to profile + return item rewards
        const startedQuestRewardItems = this.questHelper.applyQuestReward(
            pmcData,
            acceptedQuest.qid,
            QuestStatus.Started,
            sessionID,
            acceptQuestResponse,
        );

        // Send started text + any starting reward items found above to player
        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionID,
            this.traderHelper.getTraderById(questFromDb.traderId),
            MessageType.QUEST_START,
            messageId,
            startedQuestRewardItems,
            this.timeUtil.getHoursAsSeconds(this.questConfig.redeemTime),
        );

        // Having accepted new quest, look for newly unlocked quests and inform client of them
        acceptQuestResponse.profileChanges[sessionID].quests.push(
            ...this.questHelper.getNewlyAccessibleQuestsWhenStartingQuest(acceptedQuest.qid, sessionID),
        );

        return acceptQuestResponse;
    }

    /**
     * Handle the client accepting a repeatable quest and starting it
     * Send starting rewards if any to player and
     * Send start notification if any to player
     * @param pmcData Profile to update with new quest
     * @param acceptedQuest Quest being accepted
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public acceptRepeatableQuest(
        pmcData: IPmcData,
        acceptedQuest: IAcceptQuestRequestData,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        const acceptQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        // Create and store quest status object inside player profile
        const newRepeatableQuest = this.questHelper.getQuestReadyForProfile(
            pmcData,
            QuestStatus.Started,
            acceptedQuest,
        );
        pmcData.Quests.push(newRepeatableQuest);

        // Look for the generated quest cache in profile.RepeatableQuests
        const repeatableQuestProfile = this.getRepeatableQuestFromProfile(pmcData, acceptedQuest);
        if (!repeatableQuestProfile)
        {
            this.logger.error(
                this.localisationService.getText(
                    "repeatable-accepted_repeatable_quest_not_found_in_active_quests",
                    acceptedQuest.qid,
                ),
            );

            throw new Error(this.localisationService.getText("repeatable-unable_to_accept_quest_see_log"));
        }

        // Some scav quests need to be added to scav profile for them to show up in-raid
        if (
            repeatableQuestProfile.side === "Scav"
            && ["PickUp", "Exploration", "Elimination"].includes(repeatableQuestProfile.type)
        )
        {
            const fullProfile = this.profileHelper.getFullProfile(sessionID);
            if (!fullProfile.characters.scav.Quests)
            {
                fullProfile.characters.scav.Quests = [];
            }

            fullProfile.characters.scav.Quests.push(newRepeatableQuest);
        }

        const repeatableSettings = pmcData.RepeatableQuests.find((x) =>
            x.name === repeatableQuestProfile.sptRepatableGroupName
        );

        const change = {};
        change[repeatableQuestProfile._id] = repeatableSettings.changeRequirement[repeatableQuestProfile._id];
        const responseData: IPmcDataRepeatableQuest = {
            id: repeatableSettings.id ?? this.questConfig.repeatableQuests.find((x) =>
                x.name === repeatableQuestProfile.sptRepatableGroupName
            ).id,
            name: repeatableSettings.name,
            endTime: repeatableSettings.endTime,
            changeRequirement: change,
            activeQuests: [repeatableQuestProfile],
            inactiveQuests: [],
        };

        if (!acceptQuestResponse.profileChanges[sessionID].repeatableQuests)
        {
            acceptQuestResponse.profileChanges[sessionID].repeatableQuests = [];
        }
        acceptQuestResponse.profileChanges[sessionID].repeatableQuests.push(responseData);

        return acceptQuestResponse;
    }

    /**
     * Look for an accepted quest inside player profile, return matching
     * @param pmcData Profile to search through
     * @param acceptedQuest Quest to search for
     * @returns IRepeatableQuest
     */
    protected getRepeatableQuestFromProfile(pmcData: IPmcData, acceptedQuest: IAcceptQuestRequestData): IRepeatableQuest
    {
        for (const repeatableQuest of pmcData.RepeatableQuests)
        {
            const matchingQuest = repeatableQuest.activeQuests.find((x) => x._id === acceptedQuest.qid);
            if (matchingQuest)
            {
                this.logger.debug(`Accepted repeatable quest ${acceptedQuest.qid} from ${repeatableQuest.name}`);
                matchingQuest.sptRepatableGroupName = repeatableQuest.name;

                return matchingQuest;
            }
        }

        return undefined;
    }

    /**
     * Handle QuestComplete event
     * Update completed quest in profile
     * Add newly unlocked quests to profile
     * Also recalculate their level due to exp rewards
     * @param pmcData Player profile
     * @param body Completed quest request
     * @param sessionID Session id
     * @returns ItemEvent client response
     */
    public completeQuest(
        pmcData: IPmcData,
        body: ICompleteQuestRequestData,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        const completeQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        const completedQuest = this.questHelper.getQuestFromDb(body.qid, pmcData);
        const preCompleteProfileQuests = this.jsonUtil.clone(pmcData.Quests);

        const completedQuestId = body.qid;
        const clientQuestsClone = this.jsonUtil.clone(this.getClientQuests(sessionID)); // Must be gathered prior to applyQuestReward() & failQuests()

        const newQuestState = QuestStatus.Success;
        this.questHelper.updateQuestState(pmcData, newQuestState, completedQuestId);
        const questRewards = this.questHelper.applyQuestReward(
            pmcData,
            body.qid,
            newQuestState,
            sessionID,
            completeQuestResponse,
        );

        // Check for linked failed + unrestartable quests (only get quests not already failed
        const questsToFail = this.getQuestsFailedByCompletingQuest(completedQuestId, pmcData);
        if (questsToFail?.length > 0)
        {
            this.failQuests(sessionID, pmcData, questsToFail, completeQuestResponse);
        }

        // Show modal on player screen
        this.sendSuccessDialogMessageOnQuestComplete(sessionID, pmcData, completedQuestId, questRewards);

        // Add diff of quests before completion vs after for client response
        const questDelta = this.questHelper.getDeltaQuests(clientQuestsClone, this.getClientQuests(sessionID));

        // Check newly available + failed quests for timegates and add them to profile
        this.addTimeLockedQuestsToProfile(pmcData, [...questDelta], body.qid);

        // Inform client of quest changes
        completeQuestResponse.profileChanges[sessionID].quests.push(...questDelta);

        // Check if it's a repeatable quest. If so, remove from Quests
        for (const currentRepeatable of pmcData.RepeatableQuests)
        {
            const repeatableQuest = currentRepeatable.activeQuests.find((activeRepeatable) =>
                activeRepeatable._id === completedQuestId
            );
            if (repeatableQuest)
            {
                // Need to remove redundant scav quest object as its no longer necessary, is tracked in pmc profile
                if (repeatableQuest.side === "Scav")
                {
                    this.removeQuestFromScavProfile(sessionID, repeatableQuest._id);
                }
            }
        }

        // Hydrate client response questsStatus array with data
        const questStatusChanges = this.getQuestsWithDifferentStatuses(preCompleteProfileQuests, pmcData.Quests);
        if (questStatusChanges)
        {
            completeQuestResponse.profileChanges[sessionID].questsStatus.push(...questStatusChanges);
        }

        // Recalculate level in event player leveled up
        pmcData.Info.Level = this.playerService.calculateLevel(pmcData);

        return completeQuestResponse;
    }

    /**
     * Return a list of quests that would fail when supplied quest is completed
     * @param completedQuestId quest completed id
     * @returns array of IQuest objects
     */
    protected getQuestsFailedByCompletingQuest(completedQuestId: string, pmcProfile: IPmcData): IQuest[]
    {
        const questsInDb = this.questHelper.getQuestsFromDb();
        return questsInDb.filter((quest) =>
        {
            // No fail conditions, skip
            if (!quest.conditions.Fail || quest.conditions.Fail.length === 0)
            {
                return false;
            }

            // Quest already failed in profile, skip
            if (
                pmcProfile.Quests.some((profileQuest) =>
                    profileQuest.qid === quest._id && profileQuest.status === QuestStatus.Fail
                )
            )
            {
                return false;
            }

            return quest.conditions.Fail.some((condition) => condition.target?.includes(completedQuestId));
        });
    }

    /**
     * Remove a quest entirely from a profile
     * @param sessionId Player id
     * @param questIdToRemove Qid of quest to remove
     */
    protected removeQuestFromScavProfile(sessionId: string, questIdToRemove: string): void
    {
        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        const repeatableInScavProfile = fullProfile.characters.scav.Quests?.find((x) => x.qid === questIdToRemove);
        if (!repeatableInScavProfile)
        {
            this.logger.warning(
                `Unable to remove quest: ${questIdToRemove} from profile as scav quest cannot be found`,
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
    ): IQuestStatus[]
    {
        const result: IQuestStatus[] = [];

        for (const quest of postQuestStatuses)
        {
            // Add quest if status differs or quest not found
            const preQuest = preQuestStatusus.find((x) => x.qid === quest.qid);
            if (!preQuest || preQuest.status !== quest.status)
            {
                result.push(quest);
            }
        }

        if (result.length === 0)
        {
            return null;
        }

        return result;
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
        questRewards: Item[],
    ): void
    {
        const quest = this.questHelper.getQuestFromDb(completedQuestId, pmcData);

        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionID,
            this.traderHelper.getTraderById(quest.traderId),
            MessageType.QUEST_SUCCESS,
            quest.successMessageText,
            questRewards,
            this.timeUtil.getHoursAsSeconds(this.questConfig.redeemTime),
        );
    }

    /**
     * Look for newly available quests after completing a quest with a requirement to wait x minutes (time-locked) before being available and add data to profile
     * @param pmcData Player profile to update
     * @param quests Quests to look for wait conditions in
     * @param completedQuestId Quest just completed
     */
    protected addTimeLockedQuestsToProfile(pmcData: IPmcData, quests: IQuest[], completedQuestId: string): void
    {
        // Iterate over quests, look for quests with right criteria
        for (const quest of quests)
        {
            // If quest has prereq of completed quest + availableAfter value > 0 (quest has wait time)
            const nextQuestWaitCondition = quest.conditions.AvailableForStart.find((x) =>
                x.target?.includes(completedQuestId) && x.availableAfter > 0
            );
            if (nextQuestWaitCondition)
            {
                // Now + wait time
                const availableAfterTimestamp = this.timeUtil.getTimestamp() + nextQuestWaitCondition.availableAfter;

                // Update quest in profile with status of AvailableAfter
                const existingQuestInProfile = pmcData.Quests.find((x) => x.qid === quest._id);
                if (existingQuestInProfile)
                {
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
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        "9": this.timeUtil.getTimestamp(),
                    },
                    availableAfter: availableAfterTimestamp,
                });
            }
        }
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
    ): void
    {
        for (const questToFail of questsToFail)
        {
            // Skip failing a quest that has a fail status of something other than success
            if (questToFail.conditions.Fail?.some((x) => x.status?.some((status) => status !== QuestStatus.Success)))
            {
                continue;
            }

            const isActiveQuestInPlayerProfile = pmcData.Quests.find((quest) => quest.qid === questToFail._id);
            if (isActiveQuestInPlayerProfile)
            {
                if (isActiveQuestInPlayerProfile.status !== QuestStatus.Fail)
                {
                    const failBody: IFailQuestRequestData = {
                        Action: "QuestFail",
                        qid: questToFail._id,
                        removeExcessItems: true,
                    };
                    this.questHelper.failQuest(pmcData, failBody, sessionID, output);
                }
            }
            else
            {
                // Failing an entirely new quest that doesnt exist in profile
                const statusTimers = {};
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
     * Handle QuestHandover event
     * @param pmcData Player profile
     * @param handoverQuestRequest handover item request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public handoverQuest(
        pmcData: IPmcData,
        handoverQuestRequest: IHandoverQuestRequestData,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        const quest = this.questHelper.getQuestFromDb(handoverQuestRequest.qid, pmcData);
        const handoverQuestTypes = ["HandoverItem", "WeaponAssembly"];
        const output = this.eventOutputHolder.getOutput(sessionID);

        let isItemHandoverQuest = true;
        let handedInCount = 0;

        // Decrement number of items handed in
        let handoverRequirements: IQuestCondition;
        for (const condition of quest.conditions.AvailableForFinish)
        {
            if (
                condition.id === handoverQuestRequest.conditionId
                && handoverQuestTypes.includes(condition.conditionType)
            )
            {
                handedInCount = Number.parseInt(<string>condition.value);
                isItemHandoverQuest = condition.conditionType === handoverQuestTypes[0];
                handoverRequirements = condition;

                const profileCounter = (handoverQuestRequest.conditionId in pmcData.TaskConditionCounters)
                    ? pmcData.TaskConditionCounters[handoverQuestRequest.conditionId].value
                    : 0;
                handedInCount -= profileCounter;

                if (handedInCount <= 0)
                {
                    this.logger.error(
                        this.localisationService.getText(
                            "repeatable-quest_handover_failed_condition_already_satisfied",
                            {
                                questId: handoverQuestRequest.qid,
                                conditionId: handoverQuestRequest.conditionId,
                                profileCounter: profileCounter,
                                value: handedInCount,
                            },
                        ),
                    );

                    return output;
                }

                break;
            }
        }

        if (isItemHandoverQuest && handedInCount === 0)
        {
            return this.showRepeatableQuestInvalidConditionError(handoverQuestRequest, output);
        }

        let totalItemCountToRemove = 0;
        for (const itemHandover of handoverQuestRequest.items)
        {
            const matchingItemInProfile = pmcData.Inventory.items.find((item) => item._id === itemHandover.id);
            if (!(matchingItemInProfile && handoverRequirements.target.includes(matchingItemInProfile._tpl)))
            {
                // Item handed in by player doesnt match what was requested
                return this.showQuestItemHandoverMatchError(
                    handoverQuestRequest,
                    matchingItemInProfile,
                    handoverRequirements,
                    output,
                );
            }

            // Remove the right quantity of given items
            const itemCountToRemove = Math.min(itemHandover.count, handedInCount - totalItemCountToRemove);
            totalItemCountToRemove += itemCountToRemove;
            if (itemHandover.count - itemCountToRemove > 0)
            {
                // Remove single item with no children
                this.questHelper.changeItemStack(
                    pmcData,
                    itemHandover.id,
                    itemHandover.count - itemCountToRemove,
                    sessionID,
                    output,
                );
                if (totalItemCountToRemove === handedInCount)
                {
                    break;
                }
            }
            else
            {
                // Remove item with children
                const toRemove = this.itemHelper.findAndReturnChildrenByItems(pmcData.Inventory.items, itemHandover.id);
                let index = pmcData.Inventory.items.length;

                // Important: don't tell the client to remove the attachments, it will handle it
                output.profileChanges[sessionID].items.del.push({ _id: itemHandover.id });

                // Important: loop backward when removing items from the array we're looping on
                while (index-- > 0)
                {
                    if (toRemove.includes(pmcData.Inventory.items[index]._id))
                    {
                        // Remove the item
                        const removedItem = pmcData.Inventory.items.splice(index, 1)[0];

                        // If the removed item has a numeric `location` property, re-calculate all the child
                        // element `location` properties of the parent so they are sequential, while retaining order
                        if (typeof removedItem.location === "number")
                        {
                            const childItems = this.itemHelper.findAndReturnChildrenAsItems(
                                pmcData.Inventory.items,
                                removedItem.parentId,
                            );
                            childItems.shift(); // Remove the parent

                            // Sort by the current `location` and update
                            childItems.sort((a, b) => a.location > b.location ? 1 : -1).forEach((item, index) =>
                            {
                                item.location = index;
                            });
                        }
                    }
                }
            }
        }

        this.updateProfileTaskConditionCounterValue(
            pmcData,
            handoverQuestRequest.conditionId,
            handoverQuestRequest.qid,
            totalItemCountToRemove,
        );

        return output;
    }

    /**
     * Show warning to user and write to log that repeatable quest failed a condition check
     * @param handoverQuestRequest Quest request
     * @param output Response to send to user
     * @returns IItemEventRouterResponse
     */
    protected showRepeatableQuestInvalidConditionError(
        handoverQuestRequest: IHandoverQuestRequestData,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse
    {
        const errorMessage = this.localisationService.getText("repeatable-quest_handover_failed_condition_invalid", {
            questId: handoverQuestRequest.qid,
            conditionId: handoverQuestRequest.conditionId,
        });
        this.logger.error(errorMessage);

        return this.httpResponseUtil.appendErrorToOutput(output, errorMessage);
    }

    /**
     * Show warning to user and write to log quest item handed over did not match what is required
     * @param handoverQuestRequest Quest request
     * @param itemHandedOver Non-matching item found
     * @param handoverRequirements Quest handover requirements
     * @param output Response to send to user
     * @returns IItemEventRouterResponse
     */
    protected showQuestItemHandoverMatchError(
        handoverQuestRequest: IHandoverQuestRequestData,
        itemHandedOver: Item,
        handoverRequirements: IQuestCondition,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse
    {
        const errorMessage = this.localisationService.getText("quest-handover_wrong_item", {
            questId: handoverQuestRequest.qid,
            handedInTpl: itemHandedOver._tpl,
            requiredTpl: handoverRequirements.target[0],
        });
        this.logger.error(errorMessage);

        return this.httpResponseUtil.appendErrorToOutput(output, errorMessage);
    }

    /**
     * Increment a backend counter stored value by an amount,
     * Create counter if it does not exist
     * @param pmcData Profile to find backend counter in
     * @param conditionId backend counter id to update
     * @param questId quest id counter is associated with
     * @param counterValue value to increment the backend counter with
     */
    protected updateProfileTaskConditionCounterValue(
        pmcData: IPmcData,
        conditionId: string,
        questId: string,
        counterValue: number,
    ): void
    {
        if (pmcData.TaskConditionCounters[conditionId] !== undefined)
        {
            pmcData.TaskConditionCounters[conditionId].value += counterValue;

            return;
        }

        pmcData.TaskConditionCounters[conditionId] = {
            id: conditionId,
            sourceId: questId,
            type: "HandoverItem",
            value: counterValue,
        };
    }

    /**
     * Handle /client/game/profile/items/moving - QuestFail
     * @param pmcData Pmc profile
     * @param request Fail qeust request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public failQuest(
        pmcData: IPmcData,
        request: IFailQuestRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse
    {
        return this.questHelper.failQuest(pmcData, request, sessionID, output);
    }
}
