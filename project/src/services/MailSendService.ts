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
import { TimeUtil } from "../utils/TimeUtil";
import { LocalisationService } from "./LocalisationService";

@injectable()
export class MailSendService
{
    protected readonly systemSenderId = "59e7125688a45068a6249071";

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
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

    /**
     * Large function to send messages to players from a variety of sources (SYSTEM/NPC/USER)
     * Helper functions in this class are availble to simplify common actions
     * @param messageDetails Details needed to send a message to the player
     */
    public sendMessageToPlayer(messageDetails: ISendMessageDetails): void
    {
        // Get dialog, create if doesn't exist
        const senderDialog = this.getDialog(messageDetails);

        // Flag dialog as containing a new message to player
        senderDialog.new++;

        // Craft message
        const message = this.createDialogMessage(senderDialog._id, messageDetails);

        // Create items array 
        // Generate item stash if we have rewards.
        const itemsToSendToPlayer = this.processItemsBeforeAddingToMail(senderDialog.type, messageDetails);

        // If there's items to send to player, flag dialog as containing attachments
        if (itemsToSendToPlayer.data?.length > 0)
        {
            senderDialog.attachmentsNew += 1;
        }

        // Store reward items inside message and set appropriate flags inside message
        this.addRewardItemsToMessage(message, itemsToSendToPlayer, messageDetails.itemsMaxStorageLifetimeSeconds);

        // Add message to dialog
        senderDialog.messages.push(message);

        // TODO: clean up old code here
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

    /**
     * Send a message from the player to an NPC
     * @param sessionId Player id
     * @param targetNpcId NPC message is sent to
     * @param message Text to send to NPC
     */
    public sendPlayerMessageToNpc(sessionId: string, targetNpcId: string, message: string): void
    {
        const playerProfile = this.saveServer.getProfile(sessionId);
        const dialogWithNpc = playerProfile.dialogues[targetNpcId];
        if (!dialogWithNpc)
        {
            this.logger.error(`Dialog for: ${targetNpcId} does not exist`);
        }

        dialogWithNpc.messages.push({
            _id: sessionId, // players id
            dt: this.timeUtil.getTimestamp(),
            hasRewards: false,
            items: {},
            uid: playerProfile.characters.pmc._id,
            type: MessageType.USER_MESSAGE,
            rewardCollected: false,
            text: message
        });
    }

    /**
     * Create a message for storage inside a dialog in the player profile
     * @param senderDialog Id of dialog that will hold the message
     * @param messageDetails Various details on what the message must contain/do
     * @returns Message
     */
    protected createDialogMessage(dialogId: string, messageDetails: ISendMessageDetails): Message
    {
        const message: Message = {
            _id: this.hashUtil.generate(),
            uid: dialogId, // must match the dialog id
            type: messageDetails.sender, // Same enum is used for defining dialog type + message type, thanks bsg
            dt: Math.round(Date.now() / 1000),
            text: messageDetails.templateId ? "" : messageDetails.messageText, // store empty string if template id has value, otherwise store raw message text
            templateId: messageDetails.templateId, // used by traders to send localised text from database\locales\global
            hasRewards: false, // The default dialog message has no rewards, can be added later via addRewardItemsToMessage()
            rewardCollected: false, // The default dialog message has no rewards, can be added later via addRewardItemsToMessage()
            systemData: messageDetails.systemData ? messageDetails.systemData : undefined, // Used by ragfair
            profileChangeEvents: (messageDetails.profileChangeEvents?.length === 0) ? messageDetails.profileChangeEvents : undefined // no one knows, its never been used in any dumps
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

    /**
     * perform various sanitising actions on the items before they're considered ready for insertion into message
     * @param dialogType The type of the dialog that will hold the reward items being processed 
     * @param messageDetails 
     * @returns Sanitised items
     */
    protected processItemsBeforeAddingToMail(dialogType: MessageType, messageDetails: ISendMessageDetails): MessageItems
    {
        const db = this.databaseServer.getTables().templates.items;

        let itemsToSendToPlayer: MessageItems = {};
        if (messageDetails.items?.length > 0)
        {
            // No parent id, generate random id and add (doesnt need to be actual parentId from db, only unique)
            if (!messageDetails.items[0]?.parentId)
            {
                messageDetails.items[0].parentId = this.hashUtil.generate();
            }

            itemsToSendToPlayer = {
                stash: messageDetails.items[0].parentId,
                data: []
            };
            
            // Ensure Ids are unique and cont collide with items in player invenory later
            messageDetails.items = this.itemHelper.replaceIDs(null, messageDetails.items);

            for (const reward of messageDetails.items)
            {
                // Ensure item exists in items db
                const itemTemplate = db[reward._tpl];
                if (!itemTemplate)
                {
                    // Can happen when modded items are insured + mod is removed
                    this.logger.error(this.localisationService.getText("dialog-missing_item_template", {tpl: reward._tpl, type: dialogType}));

                    continue;
                }

                // Ensure every 'base/root' item has the same parentId + has a slotid of 'main'
                if (!("slotId" in reward) || reward.slotId === "hideout")
                {
                    // Reward items NEED a parent id + slotid
                    reward.parentId = messageDetails.items[0].parentId;
                    reward.slotId = "main";
                }

                // Item is sanitised and ready to be put into holding array
                itemsToSendToPlayer.data.push(reward);

                // Item can contain sub-items, add those to array e.g. ammo boxes
                if ("StackSlots" in itemTemplate._props)
                {
                    const stackSlotItems = this.itemHelper.generateItemsFromStackSlot(itemTemplate, reward._id);
                    for (const itemToAdd of stackSlotItems)
                    {
                        itemsToSendToPlayer.data.push(itemToAdd);
                    }
                }
            }

            // Remove empty data property if no rewards
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
     * @param messageDetails Data on what message should do
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

    /**
     * Get the appropriate sender id by the sender enum type
     * @param messageDetails 
     * @returns gets an id of the individual sending it
     */
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