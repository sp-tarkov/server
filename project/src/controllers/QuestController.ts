import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import type { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestConditionHelper } from "@spt/helpers/QuestConditionHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IItem } from "@spt/models/eft/common/tables/IItem";
import type { IQuest, IQuestCondition } from "@spt/models/eft/common/tables/IQuest";
import type { IPmcDataRepeatableQuest, IRepeatableQuest } from "@spt/models/eft/common/tables/IRepeatableQuests";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import type { IAcceptQuestRequestData } from "@spt/models/eft/quests/IAcceptQuestRequestData";
import type { ICompleteQuestRequestData } from "@spt/models/eft/quests/ICompleteQuestRequestData";
import type { IFailQuestRequestData } from "@spt/models/eft/quests/IFailQuestRequestData";
import type { IHandoverQuestRequestData } from "@spt/models/eft/quests/IHandoverQuestRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MessageType } from "@spt/models/enums/MessageType";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import type { IQuestConfig } from "@spt/models/spt/config/IQuestConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocaleService } from "@spt/services/LocaleService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { PlayerService } from "@spt/services/PlayerService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class QuestController {
    protected questConfig: IQuestConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HttpResponseUtil") protected httpResponseUtil: HttpResponseUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("QuestConditionHelper") protected questConditionHelper: QuestConditionHelper,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * Handle client/quest/list
     * Get all quests visible to player
     * Exclude quests with incomplete preconditions (level/loyalty)
     * @param sessionID session id
     * @returns array of IQuest
     */
    public getClientQuests(sessionID: string): IQuest[] {
        return this.questHelper.getClientQuests(sessionID);
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
    ): IItemEventRouterResponse {
        const acceptQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        // Does quest exist in profile
        // Restarting a failed quest can mean quest exists in profile
        const existingQuestStatus = pmcData.Quests.find((x) => x.qid === acceptedQuest.qid);
        if (existingQuestStatus) {
            // Update existing
            this.questHelper.resetQuestState(pmcData, QuestStatus.Started, acceptedQuest.qid);

            // Need to send client an empty list of completedConditions (Unsure if this does anything)
            acceptQuestResponse.profileChanges[sessionID].questsStatus.push(existingQuestStatus);
        } else {
            // Add new quest to server profile
            const newQuest = this.questHelper.getQuestReadyForProfile(pmcData, QuestStatus.Started, acceptedQuest);
            pmcData.Quests.push(newQuest);
        }

        // Create a dialog message for starting the quest.
        // Note that for starting quests, the correct locale field is "description", not "startedMessageText".
        const questFromDb = this.questHelper.getQuestFromDb(acceptedQuest.qid, pmcData);

        this.addTaskConditionCountersToProfile(questFromDb.conditions.AvailableForFinish, pmcData, acceptedQuest.qid);

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
            this.timeUtil.getHoursAsSeconds(this.questHelper.getMailItemRedeemTimeHoursForProfile(pmcData)),
        );

        // Having accepted new quest, look for newly unlocked quests and inform client of them
        const newlyAccessibleQuests = this.questHelper.getNewlyAccessibleQuestsWhenStartingQuest(
            acceptedQuest.qid,
            sessionID,
        );
        if (newlyAccessibleQuests.length > 0) {
            acceptQuestResponse.profileChanges[sessionID].quests.push(...newlyAccessibleQuests);
        }

        return acceptQuestResponse;
    }

    /**
     *
     * @param questConditions Conditions to iterate over and possibly add to profile
     * @param pmcData Profile to add to
     * @param questId Quest conditions came from
     */
    protected addTaskConditionCountersToProfile(
        questConditions: IQuestCondition[],
        pmcData: IPmcData,
        questId: string,
    ) {
        for (const condition of questConditions) {
            if (pmcData.TaskConditionCounters[condition.id]) {
                this.logger.error(
                    `Unable to add new task condition counter: ${condition.conditionType} for qeust: ${questId} to profile: ${pmcData.sessionId} as it already exists:`,
                );
            }

            switch (condition.conditionType) {
                case "SellItemToTrader":
                    pmcData.TaskConditionCounters[condition.id] = {
                        id: condition.id,
                        sourceId: questId,
                        type: condition.conditionType,
                        value: 0,
                    };
                    break;
            }
        }
    }

    /**
     * TODO - Move this code into RepeatableQuestController
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
    ): IItemEventRouterResponse {
        // Create and store quest status object inside player profile
        const newRepeatableQuest = this.questHelper.getQuestReadyForProfile(
            pmcData,
            QuestStatus.Started,
            acceptedQuest,
        );
        pmcData.Quests.push(newRepeatableQuest);

        // Look for the generated quest cache in profile.RepeatableQuests
        const repeatableQuestProfile = this.getRepeatableQuestFromProfile(pmcData, acceptedQuest);
        if (!repeatableQuestProfile) {
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
            repeatableQuestProfile.side === "Scav" &&
            ["PickUp", "Exploration", "Elimination"].includes(repeatableQuestProfile.type)
        ) {
            const fullProfile = this.profileHelper.getFullProfile(sessionID);
            if (!fullProfile.characters.scav.Quests) {
                fullProfile.characters.scav.Quests = [];
            }

            fullProfile.characters.scav.Quests.push(newRepeatableQuest);
        }

        const response = this.eventOutputHolder.getOutput(sessionID);

        return response;
    }

    /**
     * Look for an accepted quest inside player profile, return matching
     * @param pmcData Profile to search through
     * @param acceptedQuest Quest to search for
     * @returns IRepeatableQuest
     */
    protected getRepeatableQuestFromProfile(
        pmcData: IPmcData,
        acceptedQuest: IAcceptQuestRequestData,
    ): IRepeatableQuest {
        for (const repeatableQuest of pmcData.RepeatableQuests) {
            const matchingQuest = repeatableQuest.activeQuests.find((x) => x._id === acceptedQuest.qid);
            if (matchingQuest) {
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
    ): IItemEventRouterResponse {
        return this.questHelper.completeQuest(pmcData, body, sessionID);
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
    ): IItemEventRouterResponse {
        const quest = this.questHelper.getQuestFromDb(handoverQuestRequest.qid, pmcData);
        const handoverQuestTypes = ["HandoverItem", "WeaponAssembly"];
        const output = this.eventOutputHolder.getOutput(sessionID);

        let isItemHandoverQuest = true;
        let handedInCount = 0;

        // Decrement number of items handed in
        let handoverRequirements: IQuestCondition;
        for (const condition of quest.conditions.AvailableForFinish) {
            if (
                condition.id === handoverQuestRequest.conditionId &&
                handoverQuestTypes.includes(condition.conditionType)
            ) {
                handedInCount = Number.parseInt(<string>condition.value);
                isItemHandoverQuest = condition.conditionType === handoverQuestTypes[0];
                handoverRequirements = condition;

                const profileCounter =
                    handoverQuestRequest.conditionId in pmcData.TaskConditionCounters
                        ? pmcData.TaskConditionCounters[handoverQuestRequest.conditionId].value
                        : 0;
                handedInCount -= profileCounter;

                if (handedInCount <= 0) {
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

        if (isItemHandoverQuest && handedInCount === 0) {
            return this.showRepeatableQuestInvalidConditionError(handoverQuestRequest, output);
        }

        let totalItemCountToRemove = 0;
        for (const itemHandover of handoverQuestRequest.items) {
            const matchingItemInProfile = pmcData.Inventory.items.find((item) => item._id === itemHandover.id);
            if (!(matchingItemInProfile && handoverRequirements.target.includes(matchingItemInProfile._tpl))) {
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
            if (itemHandover.count - itemCountToRemove > 0) {
                // Remove single item with no children
                this.questHelper.changeItemStack(
                    pmcData,
                    itemHandover.id,
                    itemHandover.count - itemCountToRemove,
                    sessionID,
                    output,
                );
                if (totalItemCountToRemove === handedInCount) {
                    break;
                }
            } else {
                // Remove item with children
                const toRemove = this.itemHelper.findAndReturnChildrenByItems(pmcData.Inventory.items, itemHandover.id);
                let index = pmcData.Inventory.items.length;

                // Important: don't tell the client to remove the attachments, it will handle it
                output.profileChanges[sessionID].items.del.push({ _id: itemHandover.id });

                // Important: loop backward when removing items from the array we're looping on
                while (index-- > 0) {
                    if (toRemove.includes(pmcData.Inventory.items[index]._id)) {
                        // Remove the item
                        const removedItem = pmcData.Inventory.items.splice(index, 1)[0];

                        // If the removed item has a numeric `location` property, re-calculate all the child
                        // element `location` properties of the parent so they are sequential, while retaining order
                        if (typeof removedItem.location === "number") {
                            const childItems = this.itemHelper.findAndReturnChildrenAsItems(
                                pmcData.Inventory.items,
                                removedItem.parentId,
                            );
                            childItems.shift(); // Remove the parent

                            // Sort by the current `location` and update
                            childItems.sort((a, b) => (a.location > b.location ? 1 : -1));
                            for (const [index, item] of childItems.entries()) {
                                item.location = index;
                            }
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
    ): IItemEventRouterResponse {
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
        itemHandedOver: IItem,
        handoverRequirements: IQuestCondition,
        output: IItemEventRouterResponse,
    ): IItemEventRouterResponse {
        const errorMessage = this.localisationService.getText("quest-handover_wrong_item", {
            questId: handoverQuestRequest.qid,
            handedInTpl: itemHandedOver?._tpl ?? "UNKNOWN",
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
    ): void {
        if (pmcData.TaskConditionCounters[conditionId] !== undefined) {
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
    ): IItemEventRouterResponse {
        this.questHelper.failQuest(pmcData, request, sessionID, output);

        return output;
    }
}
