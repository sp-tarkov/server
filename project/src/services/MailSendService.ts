import { inject, injectable } from "tsyringe";
import { ItemHelper } from "../helpers/ItemHelper";
import { NotificationSendHelper } from "../helpers/NotificationSendHelper";
import { NotifierHelper } from "../helpers/NotifierHelper";
import { Item } from "../models/eft/common/tables/IItem";
import { Dialogue, IUserDialogInfo, Message, MessageItems } from "../models/eft/profile/IAkiProfile";
import { MessageType } from "../models/enums/MessageType";
import { Traders } from "../models/enums/Traders";
import { ISendMessageDetails } from "../models/spt/dialog/ISendMessageDetails";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { HashUtil } from "../utils/HashUtil";
import { LocalisationService } from "./LocalisationService";

@injectable()
export class MailSendService
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
     * Send a message from an NPC (e.g. prapor) to the player with or without items using direct message text, do not look up any locale
     * @param playerId Players id to send message to
     * @param sender The trader sending the message
     * @param messageType What type the message will assume (e.g. QUEST_SUCCESS)
     * @param message Text to send to the player
     * @param items Optional items to send to player
     * @param maxStorageTimeSeconds Optional time to collect items before they expire
     */
    public sendDirectNpcMessageToPlayer(playerId: string, sender: Traders, messageType: MessageType, message: string, items: Item[] = [], maxStorageTimeSeconds = null): void
    {
        const details: ISendMessageDetails = {
            recipientId: playerId,
            sender: messageType,
            dialogType: MessageType.NPC_TRADER,
            trader: sender,
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
     * Send a message from an NPC (e.g. prapor) to the player with or without items
     * @param playerId Players id to send message to
     * @param sender The trader sending the message
     * @param messageType What type the message will assume (e.g. QUEST_SUCCESS)
     * @param messageLocaleId The localised text to send to player
     * @param items Optional items to send to player
     * @param maxStorageTimeSeconds Optional time to collect items before they expire
     */
    public sendLocalisedNpcMessageToPlayer(playerId: string, sender: Traders, messageType: MessageType, messageLocaleId: string, items: Item[] = [], maxStorageTimeSeconds = null): void
    {
        const details: ISendMessageDetails = {
            recipientId: playerId,
            sender: messageType,
            dialogType: MessageType.NPC_TRADER,
            trader: sender,
            templateId: messageLocaleId
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
            type: messageDetails.sender,
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
            message.rewardCollected = false;
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
                type: messageDetails.dialogType ? messageDetails.dialogType : messageDetails.sender,
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

}