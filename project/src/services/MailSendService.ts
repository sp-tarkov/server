import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { NotificationSendHelper } from "@spt/helpers/NotificationSendHelper";
import { NotifierHelper } from "@spt/helpers/NotifierHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IMessageContentRagfair } from "@spt/models/eft/profile/IMessageContentRagfair";
import { IDialogue, IMessage, IMessageItems, IReplyTo } from "@spt/models/eft/profile/ISptProfile";
import { ISystemData } from "@spt/models/eft/profile/ISystemData";
import { IUserDialogInfo } from "@spt/models/eft/profile/IUserDialogInfo";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { MessageType } from "@spt/models/enums/MessageType";
import { Traders } from "@spt/models/enums/Traders";
import { IProfileChangeEvent, ISendMessageDetails } from "@spt/models/spt/dialog/ISendMessageDetails";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class MailSendService {
    protected readonly systemSenderId = "59e7125688a45068a6249071";

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("NotifierHelper") protected notifierHelper: NotifierHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("NotificationSendHelper") protected notificationSendHelper: NotificationSendHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
    ) { }

    /**
     * Send a message from an NPC (e.g. prapor) to the player with or without items using direct message text, do not look up any locale
     * @param sessionId The session ID to send the message to
     * @param trader The trader sending the message
     * @param messageType What type the message will assume (e.g. QUEST_SUCCESS)
     * @param message Text to send to the player
     * @param items Optional items to send to player
     * @param maxStorageTimeSeconds Optional time to collect items before they expire
     */
    public sendDirectNpcMessageToPlayer(
        sessionId: string,
        trader: Traders,
        messageType: MessageType,
        message: string,
        items: IItem[] = [],
        maxStorageTimeSeconds?: number,
        systemData?: ISystemData,
        ragfair?: IMessageContentRagfair,
    ): void {
        if (!trader) {
            this.logger.error(
                this.localisationService.getText("mailsend-missing_trader", {
                    messageType: messageType,
                    sessionId: sessionId,
                }),
            );

            return;
        }

        const details: ISendMessageDetails = {
            recipientId: sessionId,
            sender: messageType,
            dialogType: MessageType.NPC_TRADER,
            trader: trader,
            messageText: message,
        };

        // Add items to message
        if (items?.length > 0) {
            details.items = items;
            details.itemsMaxStorageLifetimeSeconds = maxStorageTimeSeconds ?? 172800; // 48 hours if no value supplied
        }

        if (systemData) {
            details.systemData = systemData;
        }

        if (ragfair) {
            details.ragfairDetails = ragfair;
        }

        this.sendMessageToPlayer(details);
    }

    /**
     * Send a message from an NPC (e.g. prapor) to the player with or without items
     * @param sessionId The session ID to send the message to
     * @param trader The trader sending the message
     * @param messageType What type the message will assume (e.g. QUEST_SUCCESS)
     * @param messageLocaleId The localised text to send to player
     * @param items Optional items to send to player
     * @param maxStorageTimeSeconds Optional time to collect items before they expire
     */
    public sendLocalisedNpcMessageToPlayer(
        sessionId: string,
        trader: Traders,
        messageType: MessageType,
        messageLocaleId: string,
        items: IItem[] = [],
        maxStorageTimeSeconds?: number,
        systemData?: ISystemData,
        ragfair?: IMessageContentRagfair,
    ): void {
        if (!trader) {
            this.logger.error(
                this.localisationService.getText("mailsend-missing_trader", {
                    messageType: messageType,
                    sessionId: sessionId,
                }),
            );

            return;
        }

        const details: ISendMessageDetails = {
            recipientId: sessionId,
            sender: messageType,
            dialogType: MessageType.NPC_TRADER,
            trader: trader,
            templateId: messageLocaleId,
        };

        // Add items to message
        if (items?.length > 0) {
            details.items = items;
            details.itemsMaxStorageLifetimeSeconds = maxStorageTimeSeconds ?? 172800; // 48 hours if no value supplied
        }

        if (systemData) {
            details.systemData = systemData;
        }

        if (ragfair) {
            details.ragfairDetails = ragfair;
        }

        this.sendMessageToPlayer(details);
    }

    /**
     * Send a message from SYSTEM to the player with or without items
     * @param sessionId The session ID to send the message to
     * @param message The text to send to player
     * @param items Optional items to send to player
     * @param maxStorageTimeSeconds Optional time to collect items before they expire
     */
    public sendSystemMessageToPlayer(
        sessionId: string,
        message: string,
        items: IItem[] = [],
        maxStorageTimeSeconds?: number,
        profileChangeEvents?: IProfileChangeEvent[],
    ): void {
        const details: ISendMessageDetails = {
            recipientId: sessionId,
            sender: MessageType.SYSTEM_MESSAGE,
            messageText: message,
        };

        // Add items to message
        if (items.length > 0) {
            const rootItemParentID = this.hashUtil.generate();

            details.items = this.itemHelper.adoptOrphanedItems(rootItemParentID, items);

            details.itemsMaxStorageLifetimeSeconds = maxStorageTimeSeconds ?? 172800; // 48 hours if no value supplied
        }

        if ((profileChangeEvents?.length ?? 0) > 0) {
            details.profileChangeEvents = profileChangeEvents;
        }

        this.sendMessageToPlayer(details);
    }

    /**
     * Send a message from SYSTEM to the player with or without items with localised text
     * @param sessionId The session ID to send the message to
     * @param messageLocaleId Id of key from locale file to send to player
     * @param items Optional items to send to player
     * @param maxStorageTimeSeconds Optional time to collect items before they expire
     */
    public sendLocalisedSystemMessageToPlayer(
        sessionId: string,
        messageLocaleId: string,
        items: IItem[] = [],
        profileChangeEvents?: IProfileChangeEvent[],
        maxStorageTimeSeconds?: number,
    ): void {
        const details: ISendMessageDetails = {
            recipientId: sessionId,
            sender: MessageType.SYSTEM_MESSAGE,
            templateId: messageLocaleId,
        };

        // Add items to message
        if (items?.length > 0) {
            details.items = items;
            details.itemsMaxStorageLifetimeSeconds = maxStorageTimeSeconds ?? 172800; // 48 hours if no value supplied
        }

        if ((profileChangeEvents?.length ?? 0) > 0) {
            details.profileChangeEvents = profileChangeEvents;
        }

        this.sendMessageToPlayer(details);
    }

    /**
     * Send a USER message to a player with or without items
     * @param sessionId The session ID to send the message to
     * @param senderId Who is sending the message
     * @param message The text to send to player
     * @param items Optional items to send to player
     * @param maxStorageTimeSeconds Optional time to collect items before they expire
     */
    public sendUserMessageToPlayer(
        sessionId: string,
        senderDetails: IUserDialogInfo,
        message: string,
        items: IItem[] = [],
        maxStorageTimeSeconds?: number,
    ): void {
        const details: ISendMessageDetails = {
            recipientId: sessionId,
            sender: MessageType.USER_MESSAGE,
            senderDetails: senderDetails,
            messageText: message,
        };

        // Add items to message
        if (items?.length > 0) {
            details.items = items;
            details.itemsMaxStorageLifetimeSeconds = maxStorageTimeSeconds ?? 172800; // 48 hours if no value supplied
        }

        this.sendMessageToPlayer(details);
    }

    /**
     * Large function to send messages to players from a variety of sources (SYSTEM/NPC/USER)
     * Helper functions in this class are available to simplify common actions
     * @param messageDetails Details needed to send a message to the player
     */
    public sendMessageToPlayer(messageDetails: ISendMessageDetails): void {
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
        if ((itemsToSendToPlayer.data?.length ?? 0) > 0) {
            senderDialog.attachmentsNew += 1;
        }

        // Store reward items inside message and set appropriate flags inside message
        this.addRewardItemsToMessage(message, itemsToSendToPlayer, messageDetails.itemsMaxStorageLifetimeSeconds);

        if (messageDetails.profileChangeEvents) {
            message.profileChangeEvents = messageDetails.profileChangeEvents;
        }

        // Add message to dialog
        senderDialog.messages.push(message);

        // TODO: clean up old code here
        // Offer Sold notifications are now separate from the main notification
        if (
            [MessageType.NPC_TRADER, MessageType.FLEAMARKET_MESSAGE].includes(senderDialog.type) &&
            messageDetails.ragfairDetails
        ) {
            const offerSoldMessage = this.notifierHelper.createRagfairOfferSoldNotification(
                message,
                messageDetails.ragfairDetails,
            );
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
    public sendPlayerMessageToNpc(sessionId: string, targetNpcId: string, message: string): void {
        const playerProfile = this.saveServer.getProfile(sessionId);
        const dialogWithNpc = playerProfile.dialogues[targetNpcId];
        if (!dialogWithNpc) {
            this.logger.error(this.localisationService.getText("mailsend-missing_npc_dialog", targetNpcId));

            return;
        }

        dialogWithNpc.messages.push({
            _id: this.hashUtil.generate(),
            dt: this.timeUtil.getTimestamp(),
            hasRewards: false,
            uid: playerProfile.characters.pmc._id,
            type: MessageType.USER_MESSAGE,
            rewardCollected: false,
            text: message,
        });
    }

    /**
     * Create a message for storage inside a dialog in the player profile
     * @param senderDialog Id of dialog that will hold the message
     * @param messageDetails Various details on what the message must contain/do
     * @returns Message
     */
    protected createDialogMessage(dialogId: string, messageDetails: ISendMessageDetails): IMessage {
        const message: IMessage = {
            _id: this.hashUtil.generate(),
            uid: dialogId, // must match the dialog id
            type: messageDetails.sender, // Same enum is used for defining dialog type + message type, thanks bsg
            dt: Math.round(Date.now() / 1000),
            text: messageDetails.templateId ? "" : messageDetails.messageText, // store empty string if template id has value, otherwise store raw message text
            templateId: messageDetails.templateId, // used by traders to send localised text from database\locales\global
            hasRewards: false, // The default dialog message has no rewards, can be added later via addRewardItemsToMessage()
            rewardCollected: false, // The default dialog message has no rewards, can be added later via addRewardItemsToMessage()
            systemData: messageDetails.systemData ? messageDetails.systemData : undefined, // Used by ragfair / localised messages that need "location" or "time"
            profileChangeEvents:
                messageDetails.profileChangeEvents?.length === 0 ? messageDetails.profileChangeEvents : undefined, // no one knows, its never been used in any dumps
        };

        // handle replyTo
        if (messageDetails.replyTo) {
            const replyMessage = this.getMessageToReplyTo(messageDetails.recipientId, messageDetails.replyTo, dialogId);
            if (replyMessage) {
                message.replyTo = replyMessage;
            }
        }

        // Clean up empty system data
        if (!message.systemData) {
            // biome-ignore lint/performance/noDelete: Delete is fine here as we're trying to remove the entire data property.
            delete message.systemData;
        }

        // Clean up empty template id
        if (!message.templateId) {
            // biome-ignore lint/performance/noDelete: Delete is fine here as we're trying to remove the entire data property.
            delete message.templateId;
        }

        return message;
    }

    /**
     * @param recipientId The id of the recipient
     * @param replyToId The id of the message to reply to
     * @param dialogueId The id of the dialogue (traderId or profileId)
     * @returns A new instance with data from the found message, otherwise undefined
     */
    private getMessageToReplyTo(recipientId: string, replyToId: string, dialogueId: string): IReplyTo | undefined {
        let message: IReplyTo | undefined = undefined;
        const currentDialogue = this.dialogueHelper.getDialogueFromProfile(recipientId, dialogueId);

        if (!currentDialogue) {
            this.logger.warning(`Could not find dialogue ${dialogueId} from sender`);
            return message;
        }

        for (const dialogueMessage of currentDialogue.messages) {
            if (dialogueMessage._id === replyToId) {
                message = {
                    _id: dialogueMessage._id,
                    dt: dialogueMessage.dt,
                    type: dialogueMessage.type,
                    uid: dialogueMessage.uid,
                    text: dialogueMessage.text
                };
                break;
            }
        }

        return message;
    }

    /**
     * Add items to message and adjust various properties to reflect the items being added
     * @param message Message to add items to
     * @param itemsToSendToPlayer Items to add to message
     * @param maxStorageTimeSeconds total time items are stored in mail before being deleted
     */
    protected addRewardItemsToMessage(
        message: IMessage,
        itemsToSendToPlayer: IMessageItems | undefined,
        maxStorageTimeSeconds: number | undefined,
    ): void {
        if ((itemsToSendToPlayer?.data?.length ?? 0) > 0) {
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
    protected processItemsBeforeAddingToMail(
        dialogType: MessageType,
        messageDetails: ISendMessageDetails,
    ): IMessageItems {
        const items = this.databaseService.getItems();

        let itemsToSendToPlayer: IMessageItems = {};
        if ((messageDetails.items?.length ?? 0) > 0) {
            // Find base item that should be the 'primary' + have its parent id be used as the dialogs 'stash' value
            const parentItem = this.getBaseItemFromRewards(messageDetails.items);
            if (!parentItem) {
                this.localisationService.getText("mailsend-missing_parent", {
                    traderId: messageDetails.trader,
                    sender: messageDetails.sender,
                });

                return itemsToSendToPlayer;
            }

            // No parent id, generate random id and add (doesn't need to be actual parentId from db, only unique)
            if (!parentItem?.parentId) {
                parentItem.parentId = this.hashUtil.generate();
            }

            itemsToSendToPlayer = { stash: parentItem.parentId, data: [] };

            // Ensure Ids are unique and cont collide with items in player inventory later
            messageDetails.items = this.itemHelper.replaceIDs(messageDetails.items);

            for (const reward of messageDetails.items) {
                // Ensure item exists in items db
                const itemTemplate = items[reward._tpl];
                if (!itemTemplate) {
                    // Can happen when modded items are insured + mod is removed
                    this.logger.error(
                        this.localisationService.getText("dialog-missing_item_template", {
                            tpl: reward._tpl,
                            type: dialogType,
                        }),
                    );

                    continue;
                }

                // Ensure every 'base/root' item has the same parentId + has a slotid of 'main'
                if (!("slotId" in reward) || reward.slotId === "hideout" || reward.parentId === parentItem.parentId) {
                    // Reward items NEED a parent id + slotid
                    reward.parentId = parentItem.parentId;
                    reward.slotId = "main";
                }

                // Boxes can contain sub-items
                if (this.itemHelper.isOfBaseclass(itemTemplate._id, BaseClasses.AMMO_BOX)) {
                    const boxAndCartridges: IItem[] = [reward];
                    this.itemHelper.addCartridgesToAmmoBox(boxAndCartridges, itemTemplate);

                    // Push box + cartridge children into array
                    itemsToSendToPlayer.data.push(...boxAndCartridges);
                } else {
                    if ("StackSlots" in itemTemplate._props) {
                        this.logger.error(
                            this.localisationService.getText("mail-unable_to_give_gift_not_handled", itemTemplate._id),
                        );
                    }

                    // Item is sanitised and ready to be pushed into holding array
                    itemsToSendToPlayer.data.push(reward);
                }
            }

            // Remove empty data property if no rewards
            if (itemsToSendToPlayer.data.length === 0) {
                // biome-ignore lint/performance/noDelete: Delete is fine here as we're trying to remove the empty data property.
                delete itemsToSendToPlayer.data;
            }
        }

        return itemsToSendToPlayer;
    }

    /**
     * Try to find the most correct item to be the 'primary' item in a reward mail
     * @param items Possible items to choose from
     * @returns Chosen 'primary' item
     */
    protected getBaseItemFromRewards(items: IItem[]): IItem {
        // Only one item in reward, return it
        if (items?.length === 1) {
            return items[0];
        }

        // Find first item with slotId that indicates its a 'base' item
        let item = items.find((x) => ["hideout", "main"].includes(x.slotId ?? ""));
        if (item) {
            return item;
        }

        // Not a singlular item + no items have a hideout/main slotid
        // Look for first item without parent id
        item = items.find((x) => !x.parentId);
        if (item) {
            return item;
        }

        // Just return first item in array
        return items[0];
    }

    /**
     * Get a dialog with a specified entity (user/trader)
     * Create and store empty dialog if none exists in profile
     * @param messageDetails Data on what message should do
     * @returns Relevant Dialogue
     */
    protected getDialog(messageDetails: ISendMessageDetails): IDialogue {
        const dialogsInProfile = this.dialogueHelper.getDialogsForProfile(messageDetails.recipientId);
        const senderId = this.getMessageSenderIdByType(messageDetails);
        if (!senderId) {
            throw new Error(
                this.localisationService.getText("mail-unable_to_find_message_sender_by_id", messageDetails.sender),
            );
        }
        // Does dialog exist
        let senderDialog = dialogsInProfile[senderId];
        if (!senderDialog) {
            // Create if doesn't
            dialogsInProfile[senderId] = {
                _id: senderId,
                type: messageDetails.dialogType ? messageDetails.dialogType : messageDetails.sender,
                messages: [],
                pinned: false,
                new: 0,
                attachmentsNew: 0,
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
    protected getMessageSenderIdByType(messageDetails: ISendMessageDetails): string | undefined {
        if (messageDetails.sender === MessageType.SYSTEM_MESSAGE) {
            return this.systemSenderId;
        }

        if (messageDetails.sender === MessageType.NPC_TRADER || messageDetails.dialogType === MessageType.NPC_TRADER) {
            return messageDetails.trader
                ? this.traderHelper.getValidTraderIdByEnumValue(messageDetails.trader)
                : undefined;
        }

        if (messageDetails.sender === MessageType.USER_MESSAGE) {
            return messageDetails.senderDetails?._id;
        }

        if (messageDetails.senderDetails?._id) {
            return messageDetails.senderDetails._id;
        }

        if (messageDetails.trader) {
            return this.traderHelper.getValidTraderIdByEnumValue(messageDetails.trader);
        }

        this.logger.warning(`Unable to handle message of type: ${messageDetails.sender}`);
    }
}
