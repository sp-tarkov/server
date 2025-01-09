import { IDialogueChatBot } from "@spt/helpers/Dialogue/IDialogueChatBot";
import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import { NotificationSendHelper } from "@spt/helpers/NotificationSendHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IDeleteFriendRequest } from "@spt/models/eft/dialog/IDeleteFriendRequest";
import { IFriendRequestData } from "@spt/models/eft/dialog/IFriendRequestData";
import { IFriendRequestSendResponse } from "@spt/models/eft/dialog/IFriendRequestSendResponse";
import { IGetAllAttachmentsResponse } from "@spt/models/eft/dialog/IGetAllAttachmentsResponse";
import { IGetFriendListDataResponse } from "@spt/models/eft/dialog/IGetFriendListDataResponse";
import { IGetMailDialogViewRequestData } from "@spt/models/eft/dialog/IGetMailDialogViewRequestData";
import { IGetMailDialogViewResponseData } from "@spt/models/eft/dialog/IGetMailDialogViewResponseData";
import { ISendMessageRequest } from "@spt/models/eft/dialog/ISendMessageRequest";
import { IDialogue, IDialogueInfo, IMessage, ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { IUserDialogInfo } from "@spt/models/eft/profile/IUserDialogInfo";
import { IWsFriendsListAccept } from "@spt/models/eft/ws/IWsFriendsListAccept";
import { BackendErrorCodes } from "@spt/models/enums/BackendErrorCodes";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MessageType } from "@spt/models/enums/MessageType";
import { NotificationEventType } from "@spt/models/enums/NotificationEventType";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class DialogueController {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("NotificationSendHelper") protected notificationSendHelper: NotificationSendHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @injectAll("DialogueChatBot") protected dialogueChatBots: IDialogueChatBot[],
    ) {
        const coreConfigs = this.configServer.getConfig<ICoreConfig>(ConfigTypes.CORE);
        // if give command is disabled or commando commands are disabled
        if (!coreConfigs.features?.chatbotFeatures?.commandoEnabled) {
            const sptCommando = this.dialogueChatBots.find(
                (c) => c.getChatBot()._id.toLocaleLowerCase() === coreConfigs.features?.chatbotFeatures.ids.commando,
            );
            this.dialogueChatBots.splice(this.dialogueChatBots.indexOf(sptCommando), 1);
        }
        if (!coreConfigs.features?.chatbotFeatures?.sptFriendEnabled) {
            const sptFriend = this.dialogueChatBots.find(
                (c) => c.getChatBot()._id.toLocaleLowerCase() === coreConfigs.features?.chatbotFeatures.ids.spt,
            );
            this.dialogueChatBots.splice(this.dialogueChatBots.indexOf(sptFriend), 1);
        }
    }

    public registerChatBot(chatBot: IDialogueChatBot): void {
        if (this.dialogueChatBots.some((cb) => cb.getChatBot()._id === chatBot.getChatBot()._id)) {
            throw new Error(
                this.localisationService.getText("dialog-chatbot_id_already_exists", chatBot.getChatBot()._id),
            );
        }
        this.dialogueChatBots.push(chatBot);
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
        // Add all chatbots to the friends list
        const friends = this.dialogueChatBots.map((v) => v.getChatBot());

        // Add any friends the user has after the chatbots
        const profile = this.profileHelper.getFullProfile(sessionID);
        if (profile?.friends) {
            for (const friendId of profile.friends) {
                const friendProfile = this.profileHelper.getChatRoomMemberFromSessionId(friendId);
                if (friendProfile) {
                    friends.push(friendProfile);
                }
            }
        }

        return { Friends: friends, Ignore: [], InIgnoreList: [] };
    }

    /**
     * Handle client/mail/dialog/list
     * Create array holding trader dialogs and mail interactions with player
     * Set the content of the dialogue on the list tab.
     * @param sessionID Session Id
     * @returns array of dialogs
     */
    public generateDialogueList(sessionID: string): IDialogueInfo[] {
        const data: IDialogueInfo[] = [];
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
    public getDialogueInfo(dialogueID: string, sessionID: string): IDialogueInfo {
        const dialogs = this.dialogueHelper.getDialogsForProfile(sessionID);
        const dialogue = dialogs[dialogueID];

        const result: IDialogueInfo = {
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
    public getDialogueUsers(
        dialog: IDialogue,
        messageType: MessageType,
        sessionID: string,
    ): IUserDialogInfo[] | undefined {
        const profile = this.saveServer.getProfile(sessionID);

        // User to user messages are special in that they need the player to exist in them, add if they don't
        if (
            messageType === MessageType.USER_MESSAGE &&
            !dialog.Users?.some((userDialog) => userDialog._id === profile.characters.pmc.sessionId)
        ) {
            if (!dialog.Users) {
                dialog.Users = [];
            }

            dialog.Users.push({
                _id: profile.characters.pmc.sessionId,
                aid: profile.characters.pmc.aid,
                Info: {
                    Level: profile.characters.pmc.Info.Level,
                    Nickname: profile.characters.pmc.Info.Nickname,
                    Side: profile.characters.pmc.Info.Side,
                    MemberCategory: profile.characters.pmc.Info.MemberCategory,
                    SelectedMemberCategory: profile.characters.pmc.Info.SelectedMemberCategory,
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
        sessionId: string,
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
    protected getDialogByIdFromProfile(profile: ISptProfile, request: IGetMailDialogViewRequestData): IDialogue {
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
                const chatBot = this.dialogueChatBots.find((cb) => cb.getChatBot()._id === request.dialogId);
                if (chatBot) {
                    if (!profile.dialogues[request.dialogId].Users) {
                        profile.dialogues[request.dialogId].Users = [];
                    }
                    profile.dialogues[request.dialogId].Users.push(chatBot.getChatBot());
                }
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
    protected getProfilesForMail(fullProfile: ISptProfile, dialogUsers?: IUserDialogInfo[]): IUserDialogInfo[] {
        const result: IUserDialogInfo[] = [];
        if (dialogUsers) {
            result.push(...dialogUsers);

            if (!result.some((userDialog) => userDialog._id === fullProfile.info.id)) {
                // Player doesnt exist, add them in before returning
                const pmcProfile = fullProfile.characters.pmc;
                result.push({
                    _id: fullProfile.info.id,
                    aid: fullProfile.info.aid,
                    Info: {
                        Nickname: pmcProfile.Info.Nickname,
                        Side: pmcProfile.Info.Side,
                        Level: pmcProfile.Info.Level,
                        MemberCategory: pmcProfile.Info.MemberCategory,
                        SelectedMemberCategory: pmcProfile.Info.SelectedMemberCategory,
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
    protected messagesHaveUncollectedRewards(messages: IMessage[]): boolean {
        return messages.some((message) => (message.items?.data?.length ?? 0) > 0);
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
            this.logger.error(
                this.localisationService.getText("dialogue-unable_to_find_in_profile", {
                    sessionId: sessionId,
                    dialogueId: dialogueId,
                }),
            );

            return;
        }

        delete profile.dialogues[dialogueId];
    }

    /** Handle client/mail/dialog/pin && Handle client/mail/dialog/unpin */
    public setDialoguePin(dialogueId: string, shouldPin: boolean, sessionId: string): void {
        const dialog = this.dialogueHelper.getDialogsForProfile(sessionId)[dialogueId];
        if (!dialog) {
            this.logger.error(
                this.localisationService.getText("dialogue-unable_to_find_in_profile", {
                    sessionId: sessionId,
                    dialogueId: dialogueId,
                }),
            );

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
            this.logger.error(
                this.localisationService.getText("dialogue-unable_to_find_dialogs_in_profile", {
                    sessionId: sessionId,
                }),
            );

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
     * @returns IGetAllAttachmentsResponse
     */
    public getAllAttachments(dialogueId: string, sessionId: string): IGetAllAttachmentsResponse | undefined {
        const dialogs = this.dialogueHelper.getDialogsForProfile(sessionId);
        const dialog = dialogs[dialogueId];
        if (!dialog) {
            this.logger.error(
                this.localisationService.getText("dialogue-unable_to_find_in_profile", {
                    sessionId: sessionId,
                    dialogueId: dialogueId,
                }),
            );

            return undefined;
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

        return (
            this.dialogueChatBots
                .find((cb) => cb.getChatBot()._id === request.dialogId)
                ?.handleMessage(sessionId, request) ?? request.dialogId
        );
    }

    /**
     * Get messages from a specific dialog that have items not expired
     * @param sessionId Session id
     * @param dialogueId Dialog to get mail attachments from
     * @returns Message array
     */
    protected getActiveMessagesFromDialog(sessionId: string, dialogueId: string): IMessage[] {
        const timeNow = this.timeUtil.getTimestamp();
        const dialogs = this.dialogueHelper.getDialogsForProfile(sessionId);
        return dialogs[dialogueId].messages.filter((message) => timeNow < message.dt + (message.maxStorageTime ?? 0));
    }

    /**
     * Return array of messages with uncollected items (includes expired)
     * @param messages Messages to parse
     * @returns messages with items to collect
     */
    protected getMessagesWithAttachments(messages: IMessage[]): IMessage[] {
        return messages.filter((message) => (message.items?.data?.length ?? 0) > 0);
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
    protected messageHasExpired(message: IMessage): boolean {
        return this.timeUtil.getTimestamp() > message.dt + (message.maxStorageTime ?? 0);
    }

    /** Handle client/friend/request/send  */
    public sendFriendRequest(sessionID: string, request: IFriendRequestData): IFriendRequestSendResponse {
        // To avoid needing to jump between profiles, auto-accept all friend requests
        const friendProfile = this.profileHelper.getFullProfile(request.to);
        if (!friendProfile?.characters?.pmc) {
            return {
                status: BackendErrorCodes.PLAYERPROFILENOTFOUND,
                requestId: "", // Unused in an error state
                retryAfter: 600,
            };
        }

        // Only add the profile to the friends list if it doesn't already exist
        const profile = this.saveServer.getProfile(sessionID);
        if (!profile.friends.includes(request.to)) {
            profile.friends.push(request.to);
        }

        // We need to delay this so that the friend request gets properly added to the clientside list before we accept it
        setTimeout(() => {
            const notification: IWsFriendsListAccept = {
                type: NotificationEventType.FRIEND_LIST_REQUEST_ACCEPTED,
                profile: this.profileHelper.getChatRoomMemberFromPmcProfile(friendProfile.characters.pmc),
            };
            this.notificationSendHelper.sendMessage(sessionID, notification);
        }, 1000);

        return {
            status: BackendErrorCodes.NONE,
            requestId: friendProfile.info.aid.toString(),
            retryAfter: 600,
        };
    }

    /** Handle client/friend/delete */
    public deleteFriend(sessionID: string, request: IDeleteFriendRequest): void {
        const profile = this.saveServer.getProfile(sessionID);
        const friendIndex = profile.friends.indexOf(request.friend_id);
        if (friendIndex !== -1) {
            profile.friends.splice(friendIndex, 1);
        }
    }
}
