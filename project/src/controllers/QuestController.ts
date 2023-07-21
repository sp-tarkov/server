import { inject, injectable } from "tsyringe";

import { DialogueHelper } from "../helpers/DialogueHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { QuestConditionHelper } from "../helpers/QuestConditionHelper";
import { QuestHelper } from "../helpers/QuestHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { IPmcData } from "../models/eft/common/IPmcData";
import { Quest } from "../models/eft/common/tables/IBotBase";
import { Item } from "../models/eft/common/tables/IItem";
import { AvailableForConditions, IQuest, Reward } from "../models/eft/common/tables/IQuest";
import { IRepeatableQuest } from "../models/eft/common/tables/IRepeatableQuests";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IAcceptQuestRequestData } from "../models/eft/quests/IAcceptQuestRequestData";
import { ICompleteQuestRequestData } from "../models/eft/quests/ICompleteQuestRequestData";
import { IFailQuestRequestData } from "../models/eft/quests/IFailQuestRequestData";
import { IHandoverQuestRequestData } from "../models/eft/quests/IHandoverQuestRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { MessageType } from "../models/enums/MessageType";
import { QuestStatus } from "../models/enums/QuestStatus";
import { SeasonalEventType } from "../models/enums/SeasonalEventType";
import { IQuestConfig } from "../models/spt/config/IQuestConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { LocaleService } from "../services/LocaleService";
import { LocalisationService } from "../services/LocalisationService";
import { MailSendService } from "../services/MailSendService";
import { PlayerService } from "../services/PlayerService";
import { SeasonalEventService } from "../services/SeasonalEventService";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class QuestController
{
    protected questConfig: IQuestConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
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
        @inject("ConfigServer") protected configServer: ConfigServer
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
            if (profile.Quests.some(x => x.qid === quest._id))
            {
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
            if (!this.playerLevelFulfillsQuestRequrement(quest, profile.Info.Level))
            {
                continue;
            }

            const questRequirements = this.questConditionHelper.getQuestConditions(quest.conditions.AvailableForStart);
            const loyaltyRequirements = this.questConditionHelper.getLoyaltyConditions(quest.conditions.AvailableForStart);

            // Quest has no conditions or loyalty conditions, add to visible quest list
            if (questRequirements.length === 0 && loyaltyRequirements.length === 0)
            {
                questsToShowPlayer.push(quest);
                continue;
            }

            // Check the status of each quest condition, if any are not completed
            // then this quest should not be visible
            let haveCompletedPreviousQuest = true;
            for (const condition of questRequirements)
            {
                // If the previous quest isn't in the user profile, it hasn't been completed or started
                const previousQuest = profile.Quests.find(pq => pq.qid === condition._props.target);
                if (!previousQuest)
                {
                    haveCompletedPreviousQuest = false;
                    break;
                }

                // If previous is in user profile, check condition requirement and current status
                if (condition._props.status.includes(previousQuest.status))
                {
                    continue;
                }

                // Chemical fix: "Started" Status is catered for above. This will include it just if it's started.
                // but maybe this is better:
                // if ((condition._props.status[0] === QuestStatus.Started)
                // && (previousQuest.status === "AvailableForFinish" || previousQuest.status ===  "Success")
                if ((condition._props.status[0] === QuestStatus.Started))
                {
                    const statusName = Object.keys(QuestStatus)[condition._props.status[0]];
                    this.logger.debug(`[QUESTS]: fix for polikhim bug: ${quest._id} (${this.questHelper.getQuestNameFromLocale(quest._id)}) ${condition._props.status[0]}, ${statusName} != ${previousQuest.status}`);
                    continue;
                }
                haveCompletedPreviousQuest = false;
                break;
            }

            let passesLoyaltyRequirements = true;
            for (const condition of loyaltyRequirements)
            {
                if (!this.questHelper.traderStandingRequirementCheck(condition._props, profile))
                {
                    passesLoyaltyRequirements = false;
                    break;
                }
            }

            if (haveCompletedPreviousQuest && passesLoyaltyRequirements)
            {
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
    protected playerLevelFulfillsQuestRequrement(quest: IQuest, playerLevel: number): boolean
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
        if (!isChristmasEventActive && this.seasonalEventService.isQuestRelatedToEvent(questId, SeasonalEventType.CHRISTMAS))
        {
            return false;
        }

        // Not halloween + quest is for halloween
        if (!isHalloweenEventActive && this.seasonalEventService.isQuestRelatedToEvent(questId, SeasonalEventType.HALLOWEEN))
        {
            return false;
        }

        // Should non-season event quests be shown to player
        if (!this.questConfig.showNonSeasonalEventQuests && this.seasonalEventService.isQuestRelatedToEvent(questId, SeasonalEventType.NONE))
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
     * @returns client response
     */
    public acceptQuest(pmcData: IPmcData, acceptedQuest: IAcceptQuestRequestData, sessionID: string): IItemEventRouterResponse
    {
        const acceptQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        const startedState = QuestStatus.Started;
        const newQuest = this.questHelper.getQuestReadyForProfile(pmcData, startedState, acceptedQuest);

        // Does quest exist in profile
        if (pmcData.Quests.find(x => x.qid === acceptedQuest.qid))
        {
            // Update existing
            this.questHelper.updateQuestState(pmcData, QuestStatus.Started, acceptedQuest.qid);
        }
        else
        {
            // Add new quest to server profile
            pmcData.Quests.push(newQuest);
        }

        // Create a dialog message for starting the quest.
        // Note that for starting quests, the correct locale field is "description", not "startedMessageText".
        const questFromDb = this.questHelper.getQuestFromDb(acceptedQuest.qid, pmcData);
        // Get messageId of text to send to player as text message in game
        const messageId = this.questHelper.getMessageIdForQuestStart(questFromDb.startedMessageText, questFromDb.description);
        const messageContent = this.dialogueHelper.createMessageContext(messageId, MessageType.QUEST_START, this.questConfig.redeemTime);

        const startedQuestRewards = this.questHelper.applyQuestReward(pmcData, acceptedQuest.qid, QuestStatus.Started, sessionID, acceptQuestResponse);
        this.dialogueHelper.addDialogueMessage(questFromDb.traderId, messageContent, sessionID, startedQuestRewards);

        acceptQuestResponse.profileChanges[sessionID].quests = this.questHelper.acceptedUnlocked(acceptedQuest.qid, sessionID);

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
    public acceptRepeatableQuest(pmcData: IPmcData, acceptedQuest: IAcceptQuestRequestData, sessionID: string): IItemEventRouterResponse
    {
        const acceptQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        const state = QuestStatus.Started;
        const newQuest = this.questHelper.getQuestReadyForProfile(pmcData, state, acceptedQuest);
        pmcData.Quests.push(newQuest);

        const repeatableQuestProfile = this.getRepeatableQuestFromProfile(pmcData, acceptedQuest);

        if (!repeatableQuestProfile)
        {
            this.logger.error(this.localisationService.getText("repeatable-accepted_repeatable_quest_not_found_in_active_quests", acceptedQuest.qid));

            throw new Error(this.localisationService.getText("repeatable-unable_to_accept_quest_see_log"));
        }

        const locale = this.localeService.getLocaleDb();
        const questStartedMessageKey = this.questHelper.getMessageIdForQuestStart(repeatableQuestProfile.startedMessageText, repeatableQuestProfile.description);

        // Can be started text or description text based on above function result
        let questStartedMessageText = locale[questStartedMessageKey];
        // TODO: remove this whole if statement, possibly not required?
        if (!questStartedMessageText)
        {
            this.logger.debug(`Unable to accept quest ${acceptedQuest.qid}, cannot find the quest started message text with id ${questStartedMessageKey}. attempting to find it in en locale instead`);

            // For some reason non-en locales dont have repeatable quest ids, fall back to en and grab it if possible
            const enLocale = this.databaseServer.getTables().locales.global["en"];
            questStartedMessageText = enLocale[repeatableQuestProfile.startedMessageText];

            if (!questStartedMessageText)
            {
                this.logger.error(this.localisationService.getText("repeatable-unable_to_accept_quest_starting_message_not_found", {questId: acceptedQuest.qid, messageId: questStartedMessageKey}));

                return this.httpResponseUtil.appendErrorToOutput(acceptQuestResponse, this.localisationService.getText("repeatable-unable_to_accept_quest_see_log"));
            }
        }

        const questRewards = this.questHelper.getQuestRewardItems(<IQuest><unknown>repeatableQuestProfile, state);
        const messageContent = this.dialogueHelper.createMessageContext(questStartedMessageKey, MessageType.QUEST_START, this.questConfig.redeemTime);

        this.dialogueHelper.addDialogueMessage(repeatableQuestProfile.traderId, messageContent, sessionID, questRewards);

        acceptQuestResponse.profileChanges[sessionID].quests = this.questHelper.acceptedUnlocked(acceptedQuest.qid, sessionID);
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
            const matchingQuest = repeatableQuest.activeQuests.find(x => x._id === acceptedQuest.qid);
            if (matchingQuest)
            {
                this.logger.debug(`Accepted repeatable quest ${acceptedQuest.qid} from ${repeatableQuest.name}`);
                
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
    public completeQuest(pmcData: IPmcData, body: ICompleteQuestRequestData, sessionID: string): IItemEventRouterResponse
    {
        const completeQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        const completedQuestId = body.qid;
        const beforeQuests = this.getClientQuests(sessionID); // Must be gathered prior to applyQuestReward() & failQuests()

        const newQuestState = QuestStatus.Success;
        this.questHelper.updateQuestState(pmcData, newQuestState, completedQuestId);
        const questRewards = this.questHelper.applyQuestReward(pmcData, body.qid, newQuestState, sessionID, completeQuestResponse);

        // Check if any of linked quest is failed, and that is unrestartable.
        const questsToFail = this.getQuestsFailedByCompletingQuest(completedQuestId);
        if (questsToFail && questsToFail.length > 0)
        {
            this.failQuests(sessionID, pmcData, questsToFail);
        }

        // Show modal on player screen
        this.sendSuccessDialogMessageOnQuestComplete(sessionID, pmcData, completedQuestId, questRewards);

        // Add diff of quests before completion vs after to client response
        const questDelta = this.questHelper.getDeltaQuests(beforeQuests, this.getClientQuests(sessionID));
        completeQuestResponse.profileChanges[sessionID].quests = questDelta;

        this.addTimeLockedQuestsToProfile(pmcData, questDelta, body.qid);

        // Update trader info data on response
        Object.assign(completeQuestResponse.profileChanges[sessionID].traderRelations, pmcData.TradersInfo);

        // Check if it's a repeatable quest. If so remove from Quests and repeatable.activeQuests list to repeatable.inactiveQuests
        for (const currentRepeatable of pmcData.RepeatableQuests)
        {
            const repeatableQuest = currentRepeatable.activeQuests.find(x => x._id === completedQuestId);
            if (repeatableQuest)
            {
                currentRepeatable.activeQuests = currentRepeatable.activeQuests.filter(x => x._id !== completedQuestId);
                currentRepeatable.inactiveQuests.push(repeatableQuest);
            }
        }

        // Recalculate level in event player leveled up
        pmcData.Info.Level = this.playerService.calculateLevel(pmcData);

        return completeQuestResponse;
    }

    /**
     * Send a popup to player on successful completion of a quest
     * @param sessionID session id
     * @param pmcData Player profile
     * @param completedQuestId Completed quest id
     * @param questRewards Rewards given to player
     */
    protected sendSuccessDialogMessageOnQuestComplete(sessionID: string, pmcData: IPmcData, completedQuestId: string, questRewards: Reward[]): void
    {
        const quest = this.questHelper.getQuestFromDb(completedQuestId, pmcData);

        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionID,
            this.traderHelper.getTraderById(quest.traderId),
            MessageType.QUEST_SUCCESS,
            quest.successMessageText,
            questRewards,
            this.timeUtil.getHoursAsSeconds(this.questConfig.redeemTime));
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
            // If newly available quest has prereq of completed quest + availableAfter value > 0 (quest has wait time)
            const nextQuestWaitCondition = quest.conditions.AvailableForStart.find(x => x._props.target === completedQuestId && x._props.availableAfter > 0);
            if (nextQuestWaitCondition)
            {
                const availableAfterTimestamp = this.timeUtil.getTimestamp() + nextQuestWaitCondition._props.availableAfter;

                // Add/update quest to profile with status of AvailableAfter
                const existingQuestInProfile = pmcData.Quests.find(x => x.qid === quest._id);
                if (existingQuestInProfile)
                {
                    existingQuestInProfile.availableAfter = availableAfterTimestamp;
                    existingQuestInProfile.status = QuestStatus.Locked;
                    existingQuestInProfile.startTime = 0;
                    existingQuestInProfile.statusTimers = {};

                    continue;
                }

                pmcData.Quests.push({
                    qid: quest._id,
                    startTime: 0,
                    status: QuestStatus.Locked,
                    statusTimers: {},
                    availableAfter: availableAfterTimestamp
                });
            }
        }
    }

    /**
     * Returns a list of quests that should be failed when a quest is completed
     * @param completedQuestId quest completed id
     * @returns array of quests
     */
    protected getQuestsFailedByCompletingQuest(completedQuestId: string): IQuest[]
    {
        return this.questHelper.getQuestsFromDb().filter((x) =>
        {
            // No fail conditions, exit early
            if (!x.conditions.Fail || x.conditions.Fail.length === 0)
            {
                return false;
            }

            for (const failCondition of x.conditions.Fail)
            {
                if (failCondition._props.target === completedQuestId)
                {
                    return true;
                }
            }

            return false;
        });
    }

    /**
     * Fail the quests provided
     * Update quest in profile, otherwise add fresh quest object with failed status
     * @param sessionID session id
     * @param pmcData player profile
     * @param questsToFail quests to fail
     */
    protected failQuests(sessionID: string, pmcData: IPmcData, questsToFail: IQuest[]): void
    {
        for (const questToFail of questsToFail)
        {
            if (questToFail.conditions.Fail[0]._props.status[0] !== QuestStatus.Success)
            {
                continue;
            }

            const isActiveQuestInPlayerProfile = pmcData.Quests.find(y => y.qid === questToFail._id);
            if (isActiveQuestInPlayerProfile)
            {
                const failBody: IFailQuestRequestData = {
                    Action: "QuestComplete",
                    qid: questToFail._id,
                    removeExcessItems: true
                };
                this.questHelper.failQuest(pmcData, failBody, sessionID);
            }
            else
            {
                const questData: Quest = {
                    qid: questToFail._id,
                    startTime: this.timeUtil.getTimestamp(),
                    status: QuestStatus.Fail
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
    public handoverQuest(pmcData: IPmcData, handoverQuestRequest: IHandoverQuestRequestData, sessionID: string): IItemEventRouterResponse
    {
        const quest = this.questHelper.getQuestFromDb(handoverQuestRequest.qid, pmcData);
        const handoverQuestTypes = ["HandoverItem", "WeaponAssembly"];
        const output = this.eventOutputHolder.getOutput(sessionID);

        let isItemHandoverQuest = true;
        let handedInCount = 0;

        // Decrement number of items handed in
        let handoverRequirements: AvailableForConditions;
        for (const condition of quest.conditions.AvailableForFinish)
        {
            if (condition._props.id === handoverQuestRequest.conditionId && handoverQuestTypes.includes(condition._parent))
            {
                handedInCount = Number.parseInt(<string>condition._props.value);
                isItemHandoverQuest = condition._parent === handoverQuestTypes[0];
                handoverRequirements = condition;

                const profileCounter = (handoverQuestRequest.conditionId in pmcData.BackendCounters)
                    ? pmcData.BackendCounters[handoverQuestRequest.conditionId].value
                    : 0;
                handedInCount -= profileCounter;

                if (handedInCount <= 0)
                {
                    this.logger.error(this.localisationService.getText("repeatable-quest_handover_failed_condition_already_satisfied", {questId: handoverQuestRequest.qid, conditionId: handoverQuestRequest.conditionId, profileCounter: profileCounter, value: handedInCount}));

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
            const matchingItemInProfile = pmcData.Inventory.items.find(x => x._id === itemHandover.id);
            if (!handoverRequirements._props.target.includes(matchingItemInProfile._tpl))
            {
                // Item handed in by player doesnt match what was requested
                return this.showQuestItemHandoverMatchError(handoverQuestRequest, matchingItemInProfile, handoverRequirements, output);
            }

            // Remove the right quantity of given items
            const itemCountToRemove = Math.min(itemHandover.count, handedInCount - totalItemCountToRemove);
            totalItemCountToRemove += itemCountToRemove;
            if (itemHandover.count - itemCountToRemove > 0)
            {
                // Remove single item with no children
                this.questHelper.changeItemStack(pmcData, itemHandover.id, itemHandover.count - itemCountToRemove, sessionID, output);
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
                output.profileChanges[sessionID].items.del.push({ "_id": itemHandover.id });

                // Important: loop backward when removing items from the array we're looping on
                while (index-- > 0)
                {
                    if (toRemove.includes(pmcData.Inventory.items[index]._id))
                    {
                        pmcData.Inventory.items.splice(index, 1);
                    }
                }
            }
        }

        this.updateProfileBackendCounterValue(pmcData, handoverQuestRequest.conditionId, handoverQuestRequest.qid, totalItemCountToRemove);

        return output;
    }

    /**
     * Show warning to user and write to log that repeatable quest failed a condition check
     * @param handoverQuestRequest Quest request
     * @param output Response to send to user
     * @returns IItemEventRouterResponse
     */
    protected showRepeatableQuestInvalidConditionError(handoverQuestRequest: IHandoverQuestRequestData, output: IItemEventRouterResponse): IItemEventRouterResponse
    {
        const errorMessage = this.localisationService.getText("repeatable-quest_handover_failed_condition_invalid", { questId: handoverQuestRequest.qid, conditionId: handoverQuestRequest.conditionId });
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
    protected showQuestItemHandoverMatchError(handoverQuestRequest: IHandoverQuestRequestData, itemHandedOver: Item, handoverRequirements: AvailableForConditions, output: IItemEventRouterResponse): IItemEventRouterResponse
    {
        const errorMessage = this.localisationService.getText("quest-handover_wrong_item", { questId: handoverQuestRequest.qid, handedInTpl: itemHandedOver._tpl, requiredTpl: handoverRequirements._props.target[0] });
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
    protected updateProfileBackendCounterValue(pmcData: IPmcData, conditionId: string, questId: string, counterValue: number): void
    {
        if (pmcData.BackendCounters[conditionId] !== undefined)
        {
            pmcData.BackendCounters[conditionId].value += counterValue;
            return;
        }

        pmcData.BackendCounters[conditionId] = { 
            "id": conditionId,
            "qid": questId,
            "value": counterValue };
    }
}