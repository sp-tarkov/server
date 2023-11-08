import { inject, injectable } from "tsyringe";

import { DialogueHelper } from "@spt-aki/helpers/DialogueHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { IGetAllAttachmentsResponse } from "@spt-aki/models/eft/dialog/IGetAllAttachmentsResponse";
import { IGetFriendListDataResponse } from "@spt-aki/models/eft/dialog/IGetFriendListDataResponse";
import { IGetMailDialogViewRequestData } from "@spt-aki/models/eft/dialog/IGetMailDialogViewRequestData";
import { IGetMailDialogViewResponseData } from "@spt-aki/models/eft/dialog/IGetMailDialogViewResponseData";
import { ISendMessageRequest } from "@spt-aki/models/eft/dialog/ISendMessageRequest";
import { Dialogue, DialogueInfo, IAkiProfile, IUserDialogInfo, Message } from "@spt-aki/models/eft/profile/IAkiProfile";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { GiftSentResult } from "@spt-aki/models/enums/GiftSentResult";
import { MemberCategory } from "@spt-aki/models/enums/MemberCategory";
import { MessageType } from "@spt-aki/models/enums/MessageType";
import { ICoreConfig } from "@spt-aki/models/spt/config/ICoreConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { GiftService } from "@spt-aki/services/GiftService";
import { MailSendService } from "@spt-aki/services/MailSendService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class DialogueController {
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("GiftService") protected giftService: GiftService,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ConfigServer") protected configServer: ConfigServer
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
    }

    /** Handle onUpdate spt event */
    public update(): void {
        const profiles = this.saveServer.getProfiles();
        for (const sessionID in profiles) {
            this.removeExpiredItemsFromMessages(sessionID);
        }
    }

    /**
     * Handle client/friend/list
     * @returns IGetFriendListDataResponse
     */
    public getFriendList(sessionID: string): IGetFriendListDataResponse {
        // Force a fake friend called SPT into friend list
        return {
            Friends: [this.getSptFriendData()],
            Ignore: [],
            InIgnoreList: [],
        };
    }

    /**
     * Handle client/mail/dialog/list
     * Create array holding trader dialogs and mail interactions with player
     * Set the content of the dialogue on the list tab.
     * @param sessionID Session Id
     * @returns array of dialogs
     */
    public generateDialogueList(sessionID: string): DialogueInfo[] {
        const data: DialogueInfo[] = [];
        for (const dialogueId in this.dialogueHelper.getDialogsForProfile(sessionID)) {
            data.push(this.getDialogueInfo(dialogueId, sessionID));
        }

        return data;
    }

    /**
     * Get the content of a dialogue
     * @param dialogueID Dialog id
     * @param sessionID Session Id
     * @returns DialogueInfo
     */
    public getDialogueInfo(dialogueID: string, sessionID: string): DialogueInfo {
        const dialogs = this.dialogueHelper.getDialogsForProfile(sessionID);
        const dialogue = dialogs[dialogueID];

        const result: DialogueInfo = {
            _id: dialogueID,
            type: dialogue.type ? dialogue.type : MessageType.NPC_TRADER,
            message: this.dialogueHelper.getMessagePreview(dialogue),
            new: dialogue.new,
            attachmentsNew: dialogue.attachmentsNew,
            pinned: dialogue.pinned,
            Users: this.getDialogueUsers(dialogue, dialogue.type, sessionID),
        };

        return result;
    }
    /**
     *  Get the users involved in a dialog (player + other party)
     * @param dialog The dialog to check for users
     * @param messageType What type of message is being sent
     * @param sessionID Player id
     * @returns IUserDialogInfo array
     */
    public getDialogueUsers(dialog: Dialogue, messageType: MessageType, sessionID: string): IUserDialogInfo[] {
        const profile = this.saveServer.getProfile(sessionID);

        // User to user messages are special in that they need the player to exist in them, add if they don't
        if (
            messageType === MessageType.USER_MESSAGE &&
            !dialog.Users?.find((x) => x._id === profile.characters.pmc._id)
        ) {
            if (!dialog.Users) {
                dialog.Users = [];
            }

            dialog.Users.push({
                _id: profile.characters.pmc._id,
                info: {
                    Level: profile.characters.pmc.Info.Level,
                    Nickname: profile.characters.pmc.Info.Nickname,
                    Side: profile.characters.pmc.Info.Side,
                    MemberCategory: profile.characters.pmc.Info.MemberCategory,
                },
            });
        }

        return dialog.Users ? dialog.Users : undefined;
    }

    /**
     * Handle client/mail/dialog/view
     * Handle player clicking 'messenger' and seeing all the messages they've recieved
     * Set the content of the dialogue on the details panel, showing all the messages
     * for the specified dialogue.
     * @param request Get dialog request
     * @param sessionId Session id
     * @returns IGetMailDialogViewResponseData object
     */
    public generateDialogueView(
        request: IGetMailDialogViewRequestData,
        sessionId: string
    ): IGetMailDialogViewResponseData {
        const dialogueId = request.dialogId;
        const fullProfile = this.saveServer.getProfile(sessionId);
        const dialogue = this.getDialogByIdFromProfile(fullProfile, request);

        // Dialog was opened, remove the little [1] on screen
        dialogue.new = 0;

        // Set number of new attachments, but ignore those that have expired.
        dialogue.attachmentsNew = this.getUnreadMessagesWithAttachmentsCount(sessionId, dialogueId);

        return {
            messages: dialogue.messages,
            profiles: this.getProfilesForMail(fullProfile, dialogue.Users),
            hasMessagesWithRewards: this.messagesHaveUncollectedRewards(dialogue.messages),
        };
    }

    /**
     * Get dialog from player profile, create if doesn't exist
     * @param profile Player profile
     * @param request get dialog request (params used when dialog doesnt exist in profile)
     * @returns Dialogue
     */
    protected getDialogByIdFromProfile(profile: IAkiProfile, request: IGetMailDialogViewRequestData): Dialogue {
        if (!profile.dialogues[request.dialogId]) {
            profile.dialogues[request.dialogId] = {
                _id: request.dialogId,
                attachmentsNew: 0,
                pinned: false,
                messages: [],
                new: 0,
                type: request.type,
            };

            if (request.type === MessageType.USER_MESSAGE) {
                profile.dialogues[request.dialogId].Users = [];
                profile.dialogues[request.dialogId].Users.push(this.getSptFriendData(request.dialogId));
            }
        }

        return profile.dialogues[request.dialogId];
    }
    /**
     * Get the users involved in a mail between two entities
     * @param fullProfile Player profile
     * @param dialogUsers The participants of the mail
     * @returns IUserDialogInfo array
     */
    protected getProfilesForMail(fullProfile: IAkiProfile, dialogUsers: IUserDialogInfo[]): IUserDialogInfo[] {
        const result: IUserDialogInfo[] = [];
        if (dialogUsers) {
            result.push(...dialogUsers);

            // Player doesnt exist, add them in before returning
            if (!result.find((x) => x._id === fullProfile.info.id)) {
                const pmcProfile = fullProfile.characters.pmc;
                result.push({
                    _id: fullProfile.info.id,
                    info: {
                        Nickname: pmcProfile.Info.Nickname,
                        Side: pmcProfile.Info.Side,
                        Level: pmcProfile.Info.Level,
                        MemberCategory: pmcProfile.Info.MemberCategory,
                    },
                });
            }
        }

        return result;
    }

    /**
     * Get a count of messages with attachments from a particular dialog
     * @param sessionID Session id
     * @param dialogueID Dialog id
     * @returns Count of messages with attachments
     */
    protected getUnreadMessagesWithAttachmentsCount(sessionID: string, dialogueID: string): number {
        let newAttachmentCount = 0;
        const activeMessages = this.getActiveMessagesFromDialog(sessionID, dialogueID);
        for (const message of activeMessages) {
            if (message.hasRewards && !message.rewardCollected) {
                newAttachmentCount++;
            }
        }

        return newAttachmentCount;
    }

    /**
     * Does array have messages with uncollected rewards (includes expired rewards)
     * @param messages Messages to check
     * @returns true if uncollected rewards found
     */
    protected messagesHaveUncollectedRewards(messages: Message[]): boolean {
        return messages.some((x) => x.items?.data?.length > 0);
    }

    /**
     * Handle client/mail/dialog/remove
     * Remove an entire dialog with an entity (trader/user)
     * @param dialogueId id of the dialog to remove
     * @param sessionId Player id
     */
    public removeDialogue(dialogueId: string, sessionId: string): void {
        const profile = this.saveServer.getProfile(sessionId);
        const dialog = profile.dialogues[dialogueId];
        if (!dialog) {
            this.logger.error(`No dialog in profile: ${sessionId} found with id: ${dialogueId}`);

            return;
        }

        delete profile.dialogues[dialogueId];
    }

    /** Handle client/mail/dialog/pin && Handle client/mail/dialog/unpin */
    public setDialoguePin(dialogueId: string, shouldPin: boolean, sessionId: string): void {
        const dialog = this.dialogueHelper.getDialogsForProfile(sessionId)[dialogueId];
        if (!dialog) {
            this.logger.error(`No dialog in profile: ${sessionId} found with id: ${dialogueId}`);

            return;
        }

        dialog.pinned = shouldPin;
    }

    /**
     * Handle client/mail/dialog/read
     * Set a dialog to be read (no number alert/attachment alert)
     * @param dialogueIds Dialog ids to set as read
     * @param sessionId Player profile id
     */
    public setRead(dialogueIds: string[], sessionId: string): void {
        const dialogs = this.dialogueHelper.getDialogsForProfile(sessionId);
        if (!dialogs) {
            this.logger.error(`No dialog object in profile: ${sessionId}`);

            return;
        }

        for (const dialogId of dialogueIds) {
            dialogs[dialogId].new = 0;
            dialogs[dialogId].attachmentsNew = 0;
        }
    }

    /**
     * Handle client/mail/dialog/getAllAttachments
     * Get all uncollected items attached to mail in a particular dialog
     * @param dialogueId Dialog to get mail attachments from
     * @param sessionId Session id
     * @returns
     */
    public getAllAttachments(dialogueId: string, sessionId: string): IGetAllAttachmentsResponse {
        const dialogs = this.dialogueHelper.getDialogsForProfile(sessionId);
        const dialog = dialogs[dialogueId];
        if (!dialog) {
            this.logger.error(`No dialog in profile: ${sessionId} found with id: ${dialogueId}`);

            return;
        }

        // Removes corner 'new messages' tag
        dialog.attachmentsNew = 0;

        const activeMessages = this.getActiveMessagesFromDialog(sessionId, dialogueId);
        const messagesWithAttachments = this.getMessagesWithAttachments(activeMessages);

        return {
            messages: messagesWithAttachments,
            profiles: [],
            hasMessagesWithRewards: this.messagesHaveUncollectedRewards(messagesWithAttachments),
        };
    }

    /** client/mail/msg/send */
    public sendMessage(sessionId: string, request: ISendMessageRequest): string {
        this.mailSendService.sendPlayerMessageToNpc(sessionId, request.dialogId, request.text);

        // Handle when player types a keyword to sptFriend user
        if (request.dialogId.includes("sptFriend")) {
            this.handleChatWithSPTFriend(sessionId, request);
        }

        return request.dialogId;
    }

    /**
     * Send responses back to player when they communicate with SPT friend on friends list
     * @param sessionId Session Id
     * @param request send message request
     */
    protected handleChatWithSPTFriend(sessionId: string, request: ISendMessageRequest): void {
        const sender = this.profileHelper.getPmcProfile(sessionId);

        const sptFriendUser = this.getSptFriendData();

        const giftSent = this.giftService.sendGiftToPlayer(sessionId, request.text);

        if (giftSent === GiftSentResult.SUCCESS) {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue([
                    "Hey! you got the right code!",
                    "A secret code, how exciting!",
                    "You found a gift code!",
                ])
            );

            return;
        }

        if (giftSent === GiftSentResult.FAILED_GIFT_ALREADY_RECEIVED) {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue(["Looks like you already used that code", "You already have that!!"])
            );

            return;
        }

        if (request.text.toLowerCase().includes("love you")) {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue([
                    "That's quite forward but i love you too in a purely chatbot-human way",
                    "I love you too buddy :3!",
                    "uwu",
                    `love you too ${sender?.Info?.Nickname}`,
                ])
            );
        }

        if (request.text.toLowerCase() === "spt") {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue(["Its me!!", "spt? i've heard of that project"])
            );
        }

        if (["hello", "hi", "sup", "yo", "hey"].includes(request.text.toLowerCase())) {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue([
                    "Howdy",
                    "Hi",
                    "Greetings",
                    "Hello",
                    "bonjor",
                    "Yo",
                    "Sup",
                    "Heyyyyy",
                    "Hey there",
                    `Hello ${sender?.Info?.Nickname}`,
                ])
            );
        }

        if (request.text.toLowerCase() === "nikita") {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue([
                    "I know that guy!",
                    "Cool guy, he made EFT!",
                    "Legend",
                    "Remember when he said webel-webel-webel-webel, classic nikita moment",
                ])
            );
        }

        if (request.text.toLowerCase() === "are you a bot") {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue(["beep boop", "**sad boop**", "probably", "sometimes", "yeah lol"])
            );
        }
    }

    protected getSptFriendData(friendId = "sptFriend"): IUserDialogInfo {
        return {
            _id: friendId,
            info: {
                Level: 1,
                MemberCategory: MemberCategory.DEVELOPER,
                Nickname: this.coreConfig.sptFriendNickname,
                Side: "Usec",
            },
        };
    }

    /**
     * Get messages from a specific dialog that have items not expired
     * @param sessionId Session id
     * @param dialogueId Dialog to get mail attachments from
     * @returns Message array
     */
    protected getActiveMessagesFromDialog(sessionId: string, dialogueId: string): Message[] {
        const timeNow = this.timeUtil.getTimestamp();
        const dialogs = this.dialogueHelper.getDialogsForProfile(sessionId);
        return dialogs[dialogueId].messages.filter((x) => timeNow < x.dt + x.maxStorageTime);
    }

    /**
     * Return array of messages with uncollected items (includes expired)
     * @param messages Messages to parse
     * @returns messages with items to collect
     */
    protected getMessagesWithAttachments(messages: Message[]): Message[] {
        return messages.filter((x) => x.items?.data?.length > 0);
    }

    /**
     * Delete expired items from all messages in player profile. triggers when updating traders.
     * @param sessionId Session id
     */
    protected removeExpiredItemsFromMessages(sessionId: string): void {
        for (const dialogueId in this.dialogueHelper.getDialogsForProfile(sessionId)) {
            this.removeExpiredItemsFromMessage(sessionId, dialogueId);
        }
    }

    /**
     * Removes expired items from a message in player profile
     * @param sessionId Session id
     * @param dialogueId Dialog id
     */
    protected removeExpiredItemsFromMessage(sessionId: string, dialogueId: string): void {
        const dialogs = this.dialogueHelper.getDialogsForProfile(sessionId);
        const dialog = dialogs[dialogueId];
        if (!dialog.messages) {
            return;
        }

        for (const message of dialog.messages) {
            if (this.messageHasExpired(message)) {
                message.items = {};
            }
        }
    }

    /**
     * Has a dialog message expired
     * @param message Message to check expiry of
     * @returns true or false
     */
    protected messageHasExpired(message: Message): boolean {
        return this.timeUtil.getTimestamp() > message.dt + message.maxStorageTime;
    }
}
