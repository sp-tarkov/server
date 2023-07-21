import { inject, injectable } from "tsyringe";

import { Item } from "../models/eft/common/tables/IItem";
import { Dialogue, ISystemData, IUserDialogInfo, Message, MessageContent, MessageContentRagfair, MessageItems, MessagePreview } from "../models/eft/profile/IAkiProfile";
import { MessageType } from "../models/enums/MessageType";
import { Traders } from "../models/enums/Traders";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";
import { TimeUtil } from "../utils/TimeUtil";
import { ItemHelper } from "./ItemHelper";
import { NotificationSendHelper } from "./NotificationSendHelper";
import { NotifierHelper } from "./NotifierHelper";

export interface ISendMessageDetails
{
    /** Player id */
    recipientId: string
    /** Who is sending this message */
    sender: MessageType
    /** Optional - if sender is USER these details are used */
    senderDetails?: IUserDialogInfo
    /** Optional - the trader sending the message */
    trader?: Traders
    /** Optional - used in player/system messages, otherwise templateId is used */
    messageText?: string
    /** Optinal - Items to send to player */
    items?: Item[]
    /** Optional - How long items will be stored in mail before expiry */
    itemsMaxStorageLifetimeSeconds?: number
    /** Optional - Used when sending messages from traders who send text from locale json */
    templateId?: string
    /** Optional - ragfair related */
    systemData?: ISystemData
    /** Optional - Used by ragfair messages */
    ragfairDetails?: MessageContentRagfair
    /** Optional - Usage not known, unsure of purpose, even dumps dont have it */
    profileChangeEvents?: any[]
}

@injectable()
export class DialogueHelper
{
    protected readonly systemSenderId = "59e7125688a45068a6249071";

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("NotifierHelper") protected notifierHelper: NotifierHelper,
        @inject("NotificationSendHelper") protected notificationSendHelper: NotificationSendHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemHelper") protected itemHelper: ItemHelper
    )
    { }

    /**
     * Send a message from SYSTEM to the player with or without items
     * @param playerId Players id to send message to
     * @param message The text to send to player
     * @param items Optional items to send to player
     * @param maxStorageTimeSeconds Optional time to collect items before they expire
     */
    public sendSystemMessageToPlayer(playerId: string, message: string, items: Item[] = [], maxStorageTimeSeconds = null): void
    {
        const details: ISendMessageDetails = {
            recipientId: playerId,
            sender: MessageType.SYSTEM_MESSAGE,
            messageText: message
        };

        // Add items to message
        if (items.length > 0)
        {
            details.items = items;
            details.itemsMaxStorageLifetimeSeconds = maxStorageTimeSeconds;
        }

        this.sendMessageToPlayer(details);
    }

    /**
     * Send a USER message to a player with or without items
     * @param playerId Players id to send message to
     * @param senderId Who is sending the message
     * @param message The text to send to player
     * @param items Optional items to send to player
     * @param maxStorageTimeSeconds Optional time to collect items before they expire
     */
    public sendUserMessageToPlayer(playerId: string, senderDetails: IUserDialogInfo, message: string, items: Item[] = [], maxStorageTimeSeconds = null): void
    {
        const details: ISendMessageDetails = {
            recipientId: playerId,
            sender: MessageType.USER_MESSAGE,
            senderDetails: senderDetails,
            messageText: message
        };

        // Add items to message
        if (items.length > 0)
        {
            details.items = items;
            details.itemsMaxStorageLifetimeSeconds = maxStorageTimeSeconds;
        }

        this.sendMessageToPlayer(details);
    }

    public sendMessageToPlayer(messageDetails: ISendMessageDetails): void
    {
        // Get dialog, create if doesn't exist
        const senderDialog = this.getDialog(messageDetails);

        // Flag dialog as containing a new message to player
        senderDialog.new++;

        // Craft message
        const message = this.createDialogMessage(senderDialog, messageDetails);

        // Create items array 
        // Generate item stash if we have rewards.
        const itemsToSendToPlayer = this.processItemsBeforeAddingToMail(senderDialog, messageDetails);

        // If there's items to send to player, flag dialog as containing attachments
        if (itemsToSendToPlayer.data?.length > 0)
        {
            senderDialog.attachmentsNew += 1;
        }

        // Store reward items inside message and set appropriate flags
        this.addRewardItemsToMessage(message, itemsToSendToPlayer, messageDetails.itemsMaxStorageLifetimeSeconds);

        // Add message to dialog
        senderDialog.messages.push(message);

        // Offer Sold notifications are now separate from the main notification
        if (senderDialog.type === MessageType.FLEAMARKET_MESSAGE && messageDetails.ragfairDetails)
        {
            const offerSoldMessage = this.notifierHelper.createRagfairOfferSoldNotification(message, messageDetails.ragfairDetails);
            this.notificationSendHelper.sendMessage(messageDetails.recipientId, offerSoldMessage);
            message.type = MessageType.MESSAGE_WITH_ITEMS; // Should prevent getting the same notification popup twice
        }

        // Send message off to player so they get it in client
        const notificationMessage = this.notifierHelper.createNewMessageNotification(message);
        this.notificationSendHelper.sendMessage(messageDetails.recipientId, notificationMessage);
    }

    protected createDialogMessage(senderDialog: Dialogue, messageDetails: ISendMessageDetails): Message
    {
        const message: Message = {
            _id: this.hashUtil.generate(),
            uid: senderDialog._id,
            type: senderDialog.type,
            dt: Math.round(Date.now() / 1000),
            text: messageDetails.templateId ? "" : messageDetails.messageText,
            templateId: messageDetails.templateId,
            hasRewards: false,
            rewardCollected: false,
            systemData: messageDetails.systemData ? messageDetails.systemData : undefined,
            profileChangeEvents: (messageDetails.profileChangeEvents?.length === 0) ? messageDetails.profileChangeEvents : undefined
        };

        // Clean up empty system data
        if (!message.systemData)
        {
            delete message.systemData;
        }

        // Clean up empty template id
        if (!message.templateId)
        {
            delete message.templateId;
        }

        return message;
    }

    /**
     * Add items to message and adjust various properties to reflect the items being added
     * @param message Message to add items to
     * @param itemsToSendToPlayer Items to add to message
     * @param maxStorageTimeSeconds total time items are stored in mail before being deleted
     */
    protected addRewardItemsToMessage(message: Message, itemsToSendToPlayer: MessageItems, maxStorageTimeSeconds: number): void
    {
        if (itemsToSendToPlayer?.data?.length > 0)
        {
            message.items = itemsToSendToPlayer;
            message.hasRewards = true;
            message.maxStorageTime = maxStorageTimeSeconds;
        }
    }

    protected processItemsBeforeAddingToMail(senderDialog: Dialogue, messageDetails: ISendMessageDetails): MessageItems
    {
        const db = this.databaseServer.getTables().templates.items;

        let itemsToSendToPlayer: MessageItems = {};
        if (messageDetails.items?.length > 0)
        {
            // No parent id, generate random id and add (doesnt need to be actual parentId from db)
            if (!messageDetails.items[0]?.parentId)
            {
                messageDetails.items[0].parentId = this.hashUtil.generate();
            }

            // Store parent id of first item as stash id
            itemsToSendToPlayer = {
                stash: messageDetails.items[0].parentId,
                data: []
            };
            
            // Ensure Ids are unique
            messageDetails.items = this.itemHelper.replaceIDs(null, messageDetails.items);

            for (const reward of messageDetails.items)
            {
                const itemTemplate = db[reward._tpl];
                if (!itemTemplate)
                {
                    // Can happen when modded items are insured + mod is removed
                    this.logger.error(this.localisationService.getText("dialog-missing_item_template", {tpl: reward._tpl, type: MessageType[senderDialog.type]}));

                    continue;
                }

                // Ensure every 'base' item has the same parentid + has a slotid of 'main'
                if (!("slotId" in reward) || reward.slotId === "hideout")
                {
                    // Reward items NEED a parent id + slotid
                    reward.parentId = messageDetails.items[0].parentId;
                    reward.slotId = "main";
                }

                itemsToSendToPlayer.data.push(reward);

                // Item can contain sub-items, add those to array
                if ("StackSlots" in itemTemplate._props)
                {
                    const stackSlotItems = this.itemHelper.generateItemsFromStackSlot(itemTemplate, reward._id);
                    for (const itemToAdd of stackSlotItems)
                    {
                        itemsToSendToPlayer.data.push(itemToAdd);
                    }
                }
            }

            // Remove empty data property
            if (itemsToSendToPlayer.data.length === 0)
            {
                delete itemsToSendToPlayer.data;
            }
        }

        return itemsToSendToPlayer;
    }

    /**
     * Get a dialog with a specified entity (user/trader)
     * Create and store empty dialog if none exists in profile
     * @param messageDetails 
     * @returns Relevant Dialogue
     */
    protected getDialog(messageDetails: ISendMessageDetails): Dialogue
    {
        const dialogsInProfile = this.saveServer.getProfile(messageDetails.recipientId).dialogues;
        const senderId = this.getMessageSenderIdByType(messageDetails);

        // Does dialog exist
        let senderDialog = dialogsInProfile[senderId];
        if (!senderDialog)
        {
            // Create if doesnt
            dialogsInProfile[senderId] = {
                _id: senderId,
                type: messageDetails.sender,
                messages: [],
                pinned: false,
                new: 0,
                attachmentsNew: 0
            };

            senderDialog = dialogsInProfile[senderId];
        }

        return senderDialog;
    }

    protected getMessageSenderIdByType(messageDetails: ISendMessageDetails): string
    {
        if (messageDetails.sender === MessageType.SYSTEM_MESSAGE)
        {
            return this.systemSenderId;
        }

        if (messageDetails.sender === MessageType.NPC_TRADER)
        {
            return messageDetails.trader;
        }

        if (messageDetails.sender === MessageType.USER_MESSAGE)
        {
            return messageDetails.senderDetails?._id;
        }

        if (messageDetails.senderDetails?._id)
        {
            return messageDetails.senderDetails._id;
        }

        if (messageDetails.trader)
        {
            return Traders[messageDetails.trader];
        }

        this.logger.warning(`Unable to handle message of type: ${messageDetails.sender}`);
    }

    /**
     * @deprecated Use DialogueHelper.sendMessage()
     */
    public createMessageContext(templateId: string, messageType: MessageType, maxStoreTime = null): MessageContent
    {
        const result: MessageContent = {
            templateId: templateId,
            type: messageType
        };

        if (maxStoreTime)
        {
            result.maxStorageTime = maxStoreTime * TimeUtil.oneHourAsSeconds;
        }

        return result;
    }

    /**
     * @deprecated Use DialogueHelper.sendMessage()
     */
    public addDialogueMessage(dialogueID: string, messageContent: MessageContent, sessionID: string, rewards: Item[] = [], messageType = MessageType.NPC_TRADER): void
    {
        const dialogueData = this.saveServer.getProfile(sessionID).dialogues;
        const isNewDialogue = !(dialogueID in dialogueData);
        let dialogue: Dialogue = dialogueData[dialogueID];

        if (isNewDialogue)
        {
            dialogue = {
                _id: dialogueID,
                type: messageType,
                messages: [],
                pinned: false,
                new: 0,
                attachmentsNew: 0
            };

            dialogueData[dialogueID] = dialogue;
        }

        dialogue.new += 1;

        // Generate item stash if we have rewards.
        let items: MessageItems = {};

        if (rewards.length > 0)
        {
            const stashId = this.hashUtil.generate();
            items = {
                stash: stashId,
                data: []
            };

            rewards = this.itemHelper.replaceIDs(null, rewards);
            for (const reward of rewards)
            {
                if (!("slotId" in reward) || reward.slotId === "hideout")
                {
                    reward.parentId = stashId;
                    reward.slotId = "main";
                }

                const itemTemplate = this.databaseServer.getTables().templates.items[reward._tpl];
                if (!itemTemplate)
                {
                    // Can happen when modded items are insured + mod is removed
                    this.logger.error(this.localisationService.getText("dialog-missing_item_template", {tpl: reward._tpl, type: MessageType[messageContent.type]}));

                    continue;
                }

                items.data.push(reward);

                if ("StackSlots" in itemTemplate._props)
                {
                    const stackSlotItems = this.itemHelper.generateItemsFromStackSlot(itemTemplate, reward._id);
                    for (const itemToAdd of stackSlotItems)
                    {
                        items.data.push(itemToAdd);
                    }
                }
            }

            if (items.data.length === 0)
            {
                delete items.data;
            }

            dialogue.attachmentsNew += 1;
        }

        const message: Message = {
            _id: this.hashUtil.generate(),
            uid: dialogueID,
            type: messageContent.type,
            dt: Math.round(Date.now() / 1000),
            text: messageContent.text ?? "",
            templateId: messageContent.templateId,
            hasRewards: items.data?.length > 0,
            rewardCollected: false,
            items: items,
            maxStorageTime: messageContent.maxStorageTime,
            systemData: messageContent.systemData ? messageContent.systemData : undefined,
            profileChangeEvents: (messageContent.profileChangeEvents?.length === 0) ? messageContent.profileChangeEvents : undefined
        };

        if (!message.templateId)
        {
            delete message.templateId;
        }

        dialogue.messages.push(message);

        // Offer Sold notifications are now separate from the main notification
        if (messageContent.type === MessageType.FLEAMARKET_MESSAGE && messageContent.ragfair)
        {
            const offerSoldMessage = this.notifierHelper.createRagfairOfferSoldNotification(message, messageContent.ragfair);
            this.notificationSendHelper.sendMessage(sessionID, offerSoldMessage);
            message.type = MessageType.MESSAGE_WITH_ITEMS; // Should prevent getting the same notification popup twice
        }

        const notificationMessage = this.notifierHelper.createNewMessageNotification(message);
        this.notificationSendHelper.sendMessage(sessionID, notificationMessage);
    }

    /**
     * Get the preview contents of the last message in a dialogue.
     * @param dialogue 
     * @returns MessagePreview
     */
    public getMessagePreview(dialogue: Dialogue): MessagePreview
    {
        // The last message of the dialogue should be shown on the preview.
        const message = dialogue.messages[dialogue.messages.length - 1];
        const result: MessagePreview = {
            dt: message?.dt,
            type: message?.type,
            templateId: message?.templateId,
            uid: dialogue._id
        };

        if (message?.text)
        {
            result.text = message.text;
        }

        if (message?.systemData)
        {
            result.systemData = message.systemData;
        }

        return result;
    }

    /**
     * Get the item contents for a particular message.
     * @param messageID 
     * @param sessionID 
     * @param itemId Item being moved to inventory
     * @returns 
     */
    public getMessageItemContents(messageID: string, sessionID: string, itemId: string): Item[]
    {
        const dialogueData = this.saveServer.getProfile(sessionID).dialogues;
        for (const dialogueId in dialogueData)
        {
            const message = dialogueData[dialogueId].messages.find(x => x._id === messageID);
            if (!message)
            {
                continue;
            }

            if (message._id === messageID)
            {
                const attachmentsNew = this.saveServer.getProfile(sessionID).dialogues[dialogueId].attachmentsNew;
                if (attachmentsNew > 0)
                {
                    this.saveServer.getProfile(sessionID).dialogues[dialogueId].attachmentsNew = attachmentsNew - 1;
                }

                // Check reward count when item being moved isn't in reward list
                // if count is 0, it means after this move the reward array will be empty and all rewards collected
                const rewardItemCount = message.items.data.filter(x => x._id !== itemId );
                if (rewardItemCount.length === 0)
                {
                    message.rewardCollected = true;
                }

                return message.items.data;
            }
        }

        return [];
    }
}