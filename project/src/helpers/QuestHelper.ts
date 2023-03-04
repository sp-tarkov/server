import { inject, injectable } from "tsyringe";

import { IPmcData } from "../models/eft/common/IPmcData";
import { Quest } from "../models/eft/common/tables/IBotBase";
import { Item } from "../models/eft/common/tables/IItem";
import {
    AvailableForConditions, AvailableForProps, IQuest, Reward
} from "../models/eft/common/tables/IQuest";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IAcceptQuestRequestData } from "../models/eft/quests/IAcceptQuestRequestData";
import { IFailQuestRequestData } from "../models/eft/quests/IFailQuestRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { HideoutAreas } from "../models/enums/HideoutAreas";
import { MessageType } from "../models/enums/MessageType";
import { QuestRewardType } from "../models/enums/QuestRewardType";
import { QuestStatus } from "../models/enums/QuestStatus";
import { IQuestConfig } from "../models/spt/config/IQuestConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { LocaleService } from "../services/LocaleService";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { TimeUtil } from "../utils/TimeUtil";
import { DialogueHelper } from "./DialogueHelper";
import { ItemHelper } from "./ItemHelper";
import { PaymentHelper } from "./PaymentHelper";
import { ProfileHelper } from "./ProfileHelper";
import { RagfairServerHelper } from "./RagfairServerHelper";
import { TraderHelper } from "./TraderHelper";

@injectable()
export class QuestHelper
{
    protected questConfig: IQuestConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
    * Get status of a quest in player profile by its id
    * @param pmcData Profile to search
    * @param questID Quest id to look up
    * @returns QuestStatus enum
    */
    public getQuestStatus(pmcData: IPmcData, questID: string): QuestStatus
    {
        for (const quest of pmcData.Quests)
        {
            if (quest.qid === questID)
            {
                return quest.status;
            }
        }

        return QuestStatus.Locked;
    }

    /**
     * returns true is the level condition is satisfied
     * @param playerLevel Players level
     * @param condition Quest condition
     * @returns true if player level is greater than or equal to quest
     */
    public doesPlayerLevelFulfilCondition(playerLevel: number, condition: AvailableForConditions): boolean
    {
        if (condition._parent === "Level")
        {
            switch (condition._props.compareMethod)
            {
                case ">=":
                    return playerLevel >= condition._props.value;
                default:
                    this.logger.debug(`Unrecognised Comparison Method: ${condition._props.compareMethod}`);
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
    public getDeltaQuests(before: IQuest[], after: IQuest[]): IQuest[]
    {
        const knownQuestsIds = [];
        for (const q of before)
        {
            knownQuestsIds.push(q._id);
        }

        if (knownQuestsIds.length)
        {
            return after.filter((q) =>
            {
                return knownQuestsIds.indexOf(q._id) === -1;
            });
        }

        return after;
    }

    /**
     * Increase skill points of a skill on player profile
     * @param sessionID Session id
     * @param pmcData Player profile
     * @param skillName Name of skill to increase skill points of
     * @param progressAmount Amount of skill points to add to skill
     */
    public rewardSkillPoints(sessionID: string, pmcData: IPmcData, skillName: string, progressAmount: number): void
    {
        const indexOfSkillToUpdate = pmcData.Skills.Common.findIndex(s => s.Id === skillName);

        if (indexOfSkillToUpdate === -1)
        {
            this.logger.error(this.localisationService.getText("quest-no_skill_found", skillName));

            return;
        }

        const profileSkill = pmcData.Skills.Common[indexOfSkillToUpdate];

        profileSkill.Progress += progressAmount;
        profileSkill.LastAccess = this.timeUtil.getTimestamp();
    }

    /**
     * Get quest name by quest id
     * @param questId id to get
     * @returns 
     */
    public getQuestNameFromLocale(questId: string): string
    {
        const questNameKey = `${questId} name`;
        return this.localeService.getLocaleDb()[questNameKey];
    }


    /**
     * Check if trader has sufficient loyalty to fulfill quest requirement
     * @param questProperties Quest props
     * @param profile Player profile
     * @returns true if loyalty is high enough to fulfill quest requirement
     */
    public traderStandingRequirementCheck(questProperties: AvailableForProps, profile: IPmcData): boolean
    {
        const requiredLoyaltyStanding = Number(questProperties.value);
        const currentTraderStanding = profile.TradersInfo[<string>questProperties.target].loyaltyLevel; // Cast target as string as 'traderLoyalty' target prop is always string

        switch (questProperties.compareMethod)
        {
            case ">=":
                return currentTraderStanding >= requiredLoyaltyStanding;
            case ">":
                return currentTraderStanding > requiredLoyaltyStanding;
            case "<=":
                return currentTraderStanding <= requiredLoyaltyStanding;
            case "<":
                return currentTraderStanding < requiredLoyaltyStanding;
            case "!=":
                return currentTraderStanding !== requiredLoyaltyStanding;
            case "==":
                return currentTraderStanding === requiredLoyaltyStanding;
        
            default:
                this.logger.error(this.localisationService.getText("quest-compare_operator_unhandled", questProperties.compareMethod));

                return false;
        }
    }

    protected processReward(reward: Reward): Reward[]
    {
        let rewardItems: Reward[] = [];
        let targets: Item[] = [];
        const mods: Item[] = [];

        for (const item of reward.items)
        {
            // reward items are granted Found in Raid status
            if (!item.upd)
            {
                item.upd = {};
            }

            item.upd.SpawnedInSession = true;

            // separate base item and mods, fix stacks
            if (item._id === reward.target)
            {
                if ((item.parentId !== undefined) && (item.parentId === "hideout")
                    && (item.upd !== undefined) && (item.upd.StackObjectsCount !== undefined)
                    && (item.upd.StackObjectsCount > 1))
                {
                    item.upd.StackObjectsCount = 1;
                }
                targets = this.itemHelper.splitStack(item);
                // splitStack created new ids for the new stacks. This would destroy the relation to possible children.
                // Instead, we reset the id to preserve relations and generate a new id in the downstream loop, where we are also reparenting if required
                for (const target of targets)
                {
                    target._id = item._id;
                }
            }
            else
            {
                mods.push(item);
            }
        }

        // Add mods to the base items, fix ids
        for (const target of targets)
        {
            // This has all the original id relations since we reset the id to the original after the splitStack
            const items = [this.jsonUtil.clone(target)];
            // Here we generate a new id for the root item
            target._id = this.hashUtil.generate();

            for (const mod of mods)
            {
                items.push(this.jsonUtil.clone(mod));
            }

            rewardItems = rewardItems.concat(<Reward[]> this.ragfairServerHelper.reparentPresets(target, items));
        }

        return rewardItems;
    }

    /**
     * Gets a flat list of reward items for the given quest at a specific state (e.g. Fail/Success)
     * @param quest quest to get rewards for
     * @param state Quest status that holds the items (Started, Success, Fail)
     * @returns array of items with the correct maxStack
     */
    public getQuestRewardItems(quest: IQuest, state: QuestStatus): Reward[]
    {
        let questRewards = [];

        // Iterate over all quest rewards
        for (const reward of quest.rewards[QuestStatus[state]]) // get string version of QuestStatus
        {
            // Gather up item rewards
            if ("Item" === reward.type)
            {
                questRewards = questRewards.concat(this.processReward(reward));
            }
        }

        return questRewards;
    }

    /**
     * Look up quest in db by accepted quest id and construct a profile-ready object ready to store in profile
     * @param pmcData Player profile
     * @param newState State the new quest should be in when returned
     * @param acceptedQuest Details of accepted quest from client
     */
    public getQuestReadyForProfile(pmcData: IPmcData, newState: QuestStatus, acceptedQuest: IAcceptQuestRequestData): Quest
    {
        const existingQuest = pmcData.Quests.find(q => q.qid === acceptedQuest.qid);
        if (existingQuest)
        {
            // Quest exists, update its status
            existingQuest.startTime = this.timeUtil.getTimestamp();
            existingQuest.status = newState;
            existingQuest.statusTimers[newState] = this.timeUtil.getTimestamp();

            return existingQuest;
        }

        // Quest doesn't exists, add it
        const newQuest: Quest = {
            qid: acceptedQuest.qid,
            startTime: this.timeUtil.getTimestamp(),
            status: newState,
            statusTimers: {}
        };
        
        // Check if quest has a prereq to be placed in a 'pending' state
        const questDbData = this.getQuestFromDb(acceptedQuest.qid, pmcData);
        const waitTime = questDbData.conditions.AvailableForStart.find(x => x._props.availableAfter > 0);
        if (waitTime && acceptedQuest.type !== "repeatable")
        {
            // Quest should be put into 'pending' state
            newQuest.startTime = 0;
            newQuest.status = QuestStatus.AvailableAfter; // 9
            newQuest.availableAfter = this.timeUtil.getTimestamp() + waitTime._props.availableAfter;
        }
        else
        {
            newQuest.statusTimers[newState.toString()] = this.timeUtil.getTimestamp();
            newQuest.completedConditions = [];
        }

        return newQuest;
    }

    /**
     * TODO: what is going on here
     * @param acceptedQuestId Quest to add to profile
     * @param sessionID Session id
     * @returns Array of quests in profile + quest passed in as param
     */
    public acceptedUnlocked(acceptedQuestId: string, sessionID: string): IQuest[]
    {
        const profile: IPmcData = this.profileHelper.getPmcProfile(sessionID);

        const quests = this.getQuestsFromDb().filter((q) =>
        {
            const acceptedQuestCondition = q.conditions.AvailableForStart.find(
                c =>
                {
                    return c._parent === "Quest"
                        && c._props.target === acceptedQuestId
                        && c._props.status[0] === QuestStatus.Started;
                });

            if (!acceptedQuestCondition)
            {
                return false;
            }

            const profileQuest = profile.Quests.find(x => x.qid === acceptedQuestId);

            return profileQuest && (profileQuest.status === QuestStatus.Started || profileQuest.status === QuestStatus.AvailableForFinish);
        });

        return this.getQuestsWithOnlyLevelRequirementStartCondition(quests);
    }

    /**
     * TODO: what is going on here
     * @param failedQuestId 
     * @param sessionID Session id
     * @returns 
     */
    public failedUnlocked(failedQuestId: string, sessionID: string): IQuest[]
    {
        const profile = this.profileHelper.getPmcProfile(sessionID);

        const quests = this.getQuestsFromDb().filter((q) =>
        {
            const acceptedQuestCondition = q.conditions.AvailableForStart.find(
                c =>
                {
                    return c._parent === "Quest"
                        && c._props.target === failedQuestId
                        && c._props.status[0] === QuestStatus.Fail;
                });

            if (!acceptedQuestCondition)
            {
                return false;
            }

            const profileQuest = profile.Quests.find(x => x.qid === failedQuestId);

            return profileQuest && (profileQuest.status === QuestStatus.Fail);
        });

        return this.getQuestsWithOnlyLevelRequirementStartCondition(quests);
    }

    /**
     * Adjust quest money rewards by passed in multiplier
     * @param quest Quest to multiple money rewards
     * @param multiplier Value to adjust money rewards by
     * @returns Updated quest
     */
    public applyMoneyBoost(quest: IQuest, multiplier: number): IQuest
    {
        for (const reward of quest.rewards.Success)
        {
            if (reward.type === "Item")
            {
                if (this.paymentHelper.isMoneyTpl(reward.items[0]._tpl))
                {
                    reward.items[0].upd.StackObjectsCount += Math.round(reward.items[0].upd.StackObjectsCount * multiplier / 100);
                }
            }
        }

        return quest;
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
    public changeItemStack(pmcData: IPmcData, itemId: string, newStackSize: number, sessionID: string, output: IItemEventRouterResponse): void
    {
        const inventoryItemIndex = pmcData.Inventory.items.findIndex(item => item._id === itemId);
        if (inventoryItemIndex < 0)
        {
            this.logger.error(this.localisationService.getText("quest-item_not_found_in_inventory", itemId));

            return;
        }

        if (newStackSize > 0)
        {
            const item = pmcData.Inventory.items[inventoryItemIndex];
            item.upd.StackObjectsCount = newStackSize;

            output.profileChanges[sessionID].items.change.push({
                "_id": item._id,
                "_tpl": item._tpl,
                "parentId": item.parentId,
                "slotId": item.slotId,
                "location": item.location,
                "upd": { "StackObjectsCount": item.upd.StackObjectsCount }
            });
        }
        else
        {
            // this case is probably dead Code right now, since the only calling function
            // checks explicitly for Value > 0.
            output.profileChanges[sessionID].items.del.push({ "_id": itemId });
            pmcData.Inventory.items.splice(inventoryItemIndex, 1);
        }
    }

    /**
     * Get quests, strip all requirement conditions except level
     * @param quests quests to process
     * @returns quest array without conditions
     */
    protected getQuestsWithOnlyLevelRequirementStartCondition(quests: IQuest[]): IQuest[]
    {
        for (const i in quests)
        {
            quests[i] = this.getQuestWithOnlyLevelRequirementStartCondition(quests[i]);
        }

        return quests;
    }

    /**
     * Remove all quest conditions except for level requirement
     * @param quest quest to clean
     * @returns reset IQuest object
     */
    public getQuestWithOnlyLevelRequirementStartCondition(quest: IQuest): IQuest
    {
        quest = this.jsonUtil.clone(quest);
        quest.conditions.AvailableForStart = quest.conditions.AvailableForStart.filter(q => q._parent === "Level");

        return quest;
    }

    /**
     * Fail a quest in a player profile
     * @param pmcData Player profile
     * @param failRequest Fail quest request data
     * @param sessionID Session id
     * @returns Item event router response
     */
    public failQuest(pmcData: IPmcData, failRequest: IFailQuestRequestData, sessionID: string): IItemEventRouterResponse
    {
        // Prepare response to send back client
        const failedQuestResponse = this.eventOutputHolder.getOutput(sessionID);

        this.updateQuestState(pmcData, QuestStatus.Fail, failRequest.qid);
        const questRewards = this.applyQuestReward(pmcData, failRequest.qid, QuestStatus.Fail, sessionID, failedQuestResponse);

        // Create a dialog message for completing the quest.
        const quest = this.getQuestFromDb(failRequest.qid, pmcData);

        const messageContent = this.dialogueHelper.createMessageContext(quest.failMessageText, MessageType.QUEST_FAIL, this.questConfig.redeemTime);

        this.dialogueHelper.addDialogueMessage(quest.traderId, messageContent, sessionID, questRewards);

        failedQuestResponse.profileChanges[sessionID].quests = this.failedUnlocked(failRequest.qid, sessionID);

        return failedQuestResponse;
    }

    /**
     * Get List of All Quests from db
     * NOT CLONED
     * @returns Array of IQuest objects
     */
    public getQuestsFromDb(): IQuest[]
    {
        return Object.values(this.databaseServer.getTables().templates.quests);
    }

    /**
     * Get quest by id from database (repeatables are stored in profile, check there if questId not found)
     * @param questId Id of quest to find
     * @param pmcData Player profile
     * @returns IQuest object
     */
    public getQuestFromDb(questId: string, pmcData: IPmcData): IQuest
    {
        let quest = this.databaseServer.getTables().templates.quests[questId];

        // May be a repeatable quest
        if (!quest)
        {
            // Check daily/weekly objects
            for (const repeatableType of pmcData.RepeatableQuests)
            {
                quest = <IQuest><unknown>repeatableType.activeQuests.find(x => x._id === questId);
                if (quest)
                {
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
    public getMessageIdForQuestStart(startedMessageTextId: string, questDescriptionId: string): string
    {
        // blank or is a guid, use description instead
        const startedMessageText = this.getQuestLocaleIdFromDb(startedMessageTextId);
        if (!startedMessageText || startedMessageText.trim() === "" || startedMessageText.toLowerCase() === "test" || startedMessageText.length === 24)
        {
            return questDescriptionId;
        }

        return startedMessageTextId;
    }

    /**
     * Get the locale Id from locale db for a quest message
     * @param questMessageId Quest message id to look up
     * @returns Locale Id from locale db
     */
    public getQuestLocaleIdFromDb(questMessageId: string): string
    {
        const locale = this.localeService.getLocaleDb();
        return locale[questMessageId];
    }

    /**
     * Alter a quests state + Add a record to its status timers object
     * @param pmcData Profile to update
     * @param newQuestState New state the quest should be in
     * @param questId Id of the quest to alter the status of
     */
    public updateQuestState(pmcData: IPmcData, newQuestState: QuestStatus, questId: string): void
    {
        // Find quest in profile, update status to desired status
        const questToUpdate = pmcData.Quests.find(quest => quest.qid === questId);
        if (questToUpdate)
        {
            questToUpdate.status = newQuestState;
            questToUpdate.statusTimers[newQuestState] = this.timeUtil.getTimestamp();
        }
    }

    /**
     * Give player quest rewards - Skills/exp/trader standing/items/assort unlocks - Returns reward items player earned
     * @param pmcData Player profile
     * @param questId questId of quest to get rewards for
     * @param state State of the quest to get rewards for
     * @param sessionId Session id
     * @param questResponse Response to send back to client
     * @returns Array of reward objects
     */
    public applyQuestReward(pmcData: IPmcData, questId: string, state: QuestStatus, sessionId: string, questResponse: IItemEventRouterResponse): Reward[]
    {        
        let questDetails = this.getQuestFromDb(questId, pmcData);
        
        // Check for and apply intel center money bonus if it exists
        const intelCenterBonus = this.getIntelCenterRewardBonus(pmcData);
        if (intelCenterBonus > 0)
        {
            questDetails = this.applyMoneyBoost(questDetails, intelCenterBonus); // money = money + (money * intelCenterBonus / 100)
        }

        // e.g. 'Success' or 'AvailableForFinish'
        const questStateAsString = QuestStatus[state];
        for (const reward of <Reward[]>questDetails.rewards[questStateAsString])
        {
            switch (reward.type)
            {
                case QuestRewardType.SKILL:
                    this.rewardSkillPoints(sessionId, pmcData, reward.target, Number(reward.value));
                    break;
                case QuestRewardType.EXPERIENCE:
                    this.profileHelper.addExperienceToPmc(sessionId, parseInt(<string>reward.value)); // this must occur first as the output object needs to take the modified profile exp value
                    break;
                case QuestRewardType.TRADER_STANDING:
                    this.traderHelper.addStandingToTrader(sessionId, reward.target, parseFloat(<string>reward.value));
                    break;
                case QuestRewardType.TRADER_UNLOCK:
                    this.traderHelper.setTraderUnlockedState(reward.target, true, sessionId);
                    break;
                case QuestRewardType.ITEM:
                    // Handled by getQuestRewardItems() below
                    break;
                case QuestRewardType.ASSORTMENT_UNLOCK:
                    // Handled elsewhere, TODO: find and say here
                    break;
                case QuestRewardType.PRODUCTIONS_SCHEME:
                    this.findAndAddHideoutProductionIdToProfile(pmcData, reward, questDetails, sessionId, questResponse);
                    break;
                default:
                    this.logger.error(this.localisationService.getText("quest-reward_type_not_handled", {rewardType: reward.type, questId: questId, questName: questDetails.QuestName}));
                    break;
            }
        }

        return this.getQuestRewardItems(questDetails, state);
    }

    /**
     * WIP - Find hideout craft id and add to unlockedProductionRecipe array in player profile
     * also update client response recipeUnlocked array with craft id
     * @param pmcData Player profile
     * @param craftUnlockReward Reward item from quest with craft unlock details
     * @param questDetails Quest with craft unlock reward
     * @param sessionID Session id
     * @param response Response to send back to client
     */
    protected findAndAddHideoutProductionIdToProfile(pmcData: IPmcData, craftUnlockReward: Reward, questDetails: IQuest, sessionID: string, response: IItemEventRouterResponse): void
    {
        // Get hideout crafts and find those that match by areatype/required level/end product tpl - hope for just one match
        const hideoutProductions = this.databaseServer.getTables().hideout.production;
        const matchingProductions = hideoutProductions.filter(x => 
            x.areaType === Number.parseInt(craftUnlockReward.traderId) 
            //&& x.requirements[0].requiredLevel === craftUnlockReward.loyaltyLevel
            && x.endProduct === craftUnlockReward.items[0]._tpl);

        // More than 1 match, above filtering wasn't strict enough
        if (matchingProductions.length !== 1)
        {
            this.logger.error(this.localisationService.getText(`QUEST ${questDetails.QuestName} ${matchingProductions.length} PRODUCTIONS MATCHES, OH NO`));

            return;
        }

        // Add above match to pmc profile + client response
        const matchingCraftId = matchingProductions[0]._id;
        pmcData.UnlockedInfo.unlockedProductionRecipe.push(matchingCraftId);
        response.profileChanges[sessionID].recipeUnlocked[matchingCraftId] = true;
    }

    /**
     * Get players intel center bonus from profile
     * @param pmcData player profile
     * @returns bonus as a percent
     */
    protected getIntelCenterRewardBonus(pmcData: IPmcData): number
    {
        let intelCenterBonus = 0;

        // Check player has intel center
        const intelCenter = pmcData.Hideout.Areas.find(area => area.type === HideoutAreas.INTEL_CENTER);
        if (intelCenter)
        {
            if (intelCenter.level === 1)
            {
                intelCenterBonus = 5;
            }

            if (intelCenter.level > 1)
            {
                intelCenterBonus = 15;
            }
        }

        return intelCenterBonus;
    }

    /**
     * Find quest with 'findItem' requirement that needs the item tpl be handed in
     * @param itemTpl item tpl to look for
     * @returns 'FindItem' condition id
     */
    public getFindItemIdForQuestHandIn(itemTpl: string): string[]
    {
        const result: string[] = [];
        for (const quest of this.getQuestsFromDb())
        {
            const condition = quest.conditions.AvailableForFinish.find(c => c._parent === "FindItem" && c._props?.target?.includes(itemTpl));
            if (condition)
            {
                result.push(condition._props.id);
            }
        }

        return result;
    }

    /**
     * Add all quests to a profile with the provided statuses
     * @param pmcProfile profile to update
     * @param statuses statuses quests should have
     */
    public addAllQuestsToProfile(pmcProfile: IPmcData, statuses: QuestStatus[]): void
    {
        // Iterate over all quests in db
        const quests = this.databaseServer.getTables().templates.quests;
        for (const questKey in quests)
        {
            // Quest from db matches quests in profile, skip
            const questData = quests[questKey];
            if (pmcProfile.Quests.find(x => x.qid === questData._id))
            {
                continue;
            }

            const statusesDict = {};
            for (const status of statuses)
            {
                statusesDict[status] = this.timeUtil.getTimestamp();
            }

            const questRecordToAdd: Quest = {
                qid: questKey,
                startTime: 0,
                status: statuses[statuses.length - 1],
                statusTimers: statusesDict,
                completedConditions: [],
                availableAfter: 0
            };
            pmcProfile.Quests.push(questRecordToAdd);
        }
    }
}