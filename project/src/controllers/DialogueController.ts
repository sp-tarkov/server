import { inject, injectable } from "tsyringe";

import { GiftSentResult } from "@spt-aki/models/enums/GiftSentResult";
import { DialogueHelper } from "../helpers/DialogueHelper";
import { IGetAllAttachmentsResponse } from "../models/eft/dialog/IGetAllAttachmentsResponse";
import { IGetFriendListDataResponse } from "../models/eft/dialog/IGetFriendListDataResponse";
import { IGetMailDialogViewRequestData } from "../models/eft/dialog/IGetMailDialogViewRequestData";
import {
    IGetMailDialogViewResponseData
} from "../models/eft/dialog/IGetMailDialogViewResponseData";
import { ISendMessageRequest } from "../models/eft/dialog/ISendMessageRequest";
import { Dialogue, DialogueInfo, IAkiProfile, IUserDialogInfo, Message } from "../models/eft/profile/IAkiProfile";
import { MemberCategory } from "../models/enums/MemberCategory";
import { MessageType } from "../models/enums/MessageType";
import { ILogger } from "../models/spt/utils/ILogger";
import { SaveServer } from "../servers/SaveServer";
import { GiftService } from "../services/GiftService";
import { MailSendService } from "../services/MailSendService";
import { HashUtil } from "../utils/HashUtil";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class DialogueController
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("GiftService") protected giftService: GiftService,
        @inject("HashUtil") protected hashUtil: HashUtil
    )
    {}

    /** Handle onUpdate spt event */
    public update(): void
    {
        const profiles = this.saveServer.getProfiles();
        for (const sessionID in profiles)
        {
            this.removeExpiredItemsFromMessages(sessionID);
        }
    }

    /**
     * Handle client/friend/list
     * @returns IGetFriendListDataResponse
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getFriendList(sessionID: string): IGetFriendListDataResponse
    {
        return {
            "Friends": [
                {
                    _id: "sptFriend",
                    Info: {
                        Level: 1,
                        MemberCategory: MemberCategory.DEVELOPER,
                        Nickname: "SPT",
                        Side: "Usec"
                    }
                }
            ],
            "Ignore": [],
            "InIgnoreList": []
        };
    }

    /**
     * Handle client/mail/dialog/list
     * Create array holding trader dialogs and mail interactions with player
     * Set the content of the dialogue on the list tab.
     * @param sessionID Session Id
     * @returns array of dialogs
     */
    public generateDialogueList(sessionID: string): DialogueInfo[]
    {
        const data: DialogueInfo[] = [];
        for (const dialogueId in this.saveServer.getProfile(sessionID).dialogues)
        {
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
    public getDialogueInfo(dialogueID: string, sessionID: string): DialogueInfo
    {
        const dialogue = this.saveServer.getProfile(sessionID).dialogues[dialogueID];

        const result: DialogueInfo = {
            _id: dialogueID,
            type: dialogue.type ? dialogue.type : MessageType.NPC_TRADER,
            message: this.dialogueHelper.getMessagePreview(dialogue),
            new: dialogue.new,
            attachmentsNew: dialogue.attachmentsNew,
            pinned: dialogue.pinned,
            Users: this.getDialogueUsers(dialogue, dialogue.type, sessionID)
        };

        return result;
    }
    /**
     *  Todo
     * @param users 
     * @param messageType 
     * @param sessionID 
     * @returns 
     */
    public getDialogueUsers(dialog: Dialogue, messageType: MessageType, sessionID: string): IUserDialogInfo[]
    {
        const profile = this.saveServer.getProfile(sessionID);

        if (messageType === MessageType.USER_MESSAGE && !dialog.Users?.find(x => x._id === profile.characters.pmc._id))
        {
            if (!dialog.Users)
            {
                dialog.Users = [];
            }

            dialog.Users.push({
                _id: profile.characters.pmc._id,
                info: {
                    Level: profile.characters.pmc.Info.Level,
                    Nickname: profile.characters.pmc.Info.Nickname,
                    Side: profile.characters.pmc.Info.Side,
                    MemberCategory: profile.characters.pmc.Info.MemberCategory
                }
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
    public generateDialogueView(request: IGetMailDialogViewRequestData, sessionId: string): IGetMailDialogViewResponseData
    {
        const dialogueId = request.dialogId;
        const profile = this.saveServer.getProfile(sessionId);
        const dialogue = this.getDialogByIdFromProfile(profile, request);

        dialogue.new = 0;

        // Set number of new attachments, but ignore those that have expired.
        dialogue.attachmentsNew = this.getUnreadMessagesWithAttachmentsCount(sessionId, dialogueId);

        return { 
            messages: dialogue.messages,
            profiles: this.getProfilesForMail(profile, dialogue.Users),
            hasMessagesWithRewards: this.messagesHaveUncollectedRewards(dialogue.messages)
        };
    }

    /**
     * Get dialog from player profile, create if doesn't exist
     * @param profile Player profile
     * @param request get dialog request (params used when dialog doesnt exist in profile)
     * @returns Dialogue
     */
    protected getDialogByIdFromProfile(profile: IAkiProfile, request: IGetMailDialogViewRequestData): Dialogue
    {
        if (!profile.dialogues[request.dialogId])
        {
            profile.dialogues[request.dialogId] = {
                _id: request.dialogId,
                attachmentsNew: 0,
                pinned: false,
                messages: [],
                new: 0,
                type: request.type
            };

            if (request.type === MessageType.USER_MESSAGE)
            {
                profile.dialogues[request.dialogId].Users = [];
                profile.dialogues[request.dialogId].Users.push({
                    _id: request.dialogId,
                    info: {
                        Level:1,
                        Nickname: "SPT",
                        Side: "Usec",
                        MemberCategory: MemberCategory.DEFAULT
                    }
                });
            }
        }

        return profile.dialogues[request.dialogId];
    }
    /**
     *  TODO
     * @param pmcProfile 
     * @param dialogUsers 
     * @returns 
     */
    protected getProfilesForMail(pmcProfile: IAkiProfile, dialogUsers: IUserDialogInfo[]): IUserDialogInfo[]
    {
        const result: IUserDialogInfo[] = [];
        if (dialogUsers)
        {
            result.push(...dialogUsers);
            const profile = pmcProfile.characters.pmc;
            result.push({
                _id: pmcProfile.info.id,
                info: {
                    Nickname: profile.Info.Nickname,
                    Side: profile.Info.Side,
                    Level: profile.Info.Level,
                    MemberCategory: profile.Info.MemberCategory
                }
            });
        }

        return result;
    }

    /**
     * Get a count of messages with attachments from a particular dialog
     * @param sessionID Session id
     * @param dialogueID Dialog id
     * @returns Count of messages with attachments
     */
    protected getUnreadMessagesWithAttachmentsCount(sessionID: string, dialogueID: string): number
    {
        let newAttachmentCount = 0;
        const activeMessages = this.getActiveMessagesFromDialog(sessionID, dialogueID);
        for (const message of activeMessages)
        {
            if (message.hasRewards && !message.rewardCollected)
            {
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
    protected messagesHaveUncollectedRewards(messages: Message[]): boolean
    {
        return messages.some(x => x.items?.data?.length > 0);
    }

    /** Handle client/mail/dialog/remove */
    public removeDialogue(dialogueID: string, sessionID: string): void
    {
        delete this.saveServer.getProfile(sessionID).dialogues[dialogueID];
    }

    public setDialoguePin(dialogueID: string, shouldPin: boolean, sessionID: string): void
    {
        this.saveServer.getProfile(sessionID).dialogues[dialogueID].pinned = shouldPin;
    }

    /** Handle client/mail/dialog/read */
    public setRead(dialogueIDs: string[], sessionID: string): void
    {
        const dialogueData = this.saveServer.getProfile(sessionID).dialogues;
        for (const dialogID of dialogueIDs)
        {
            dialogueData[dialogID].new = 0;
            dialogueData[dialogID].attachmentsNew = 0;
        }
    }

    /**
     * Handle client/mail/dialog/getAllAttachments
     * Get all uncollected items attached to mail in a particular dialog
     * @param dialogueID Dialog to get mail attachments from
     * @param sessionID Session id
     * @returns 
     */
    public getAllAttachments(dialogueID: string, sessionID: string): IGetAllAttachmentsResponse
    {
        // Removes corner 'new messages' tag
        this.saveServer.getProfile(sessionID).dialogues[dialogueID].attachmentsNew = 0;
        
        const activeMessages = this.getActiveMessagesFromDialog(sessionID, dialogueID);
        const messagesWithAttachments = this.getMessagesWithAttachments(activeMessages);

        return { 
            messages: messagesWithAttachments,
            profiles: [],
            hasMessagesWithRewards: this.messagesHaveUncollectedRewards(messagesWithAttachments)
        };
    }

    /** client/mail/msg/send */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public sendMessage(sessionId: string, request: ISendMessageRequest): string
    {
        this.mailSendService.sendPlayerMessageToNpc(sessionId, request.dialogId, request.text);

        // Handle when player types a keyword to sptfriend user
        if (request.dialogId.includes("sptFriend"))
        {
            this.handleChatWithSPTFriend(sessionId, request);
        }

        return request.dialogId;
    }

    protected handleChatWithSPTFriend(sessionId: string, request: ISendMessageRequest): void
    {
        const sptFriendUser: IUserDialogInfo = {
            _id: "sptFriend",
            info: {
                Level: 1,
                MemberCategory: MemberCategory.DEVELOPER,
                Nickname: "SPT",
                Side: "Usec"
            }
        };
        const giftSent = this.giftService.sendGiftToPlayer(sessionId, request.text);

        if (giftSent === GiftSentResult.SUCCESS) 
        {
            this.mailSendService.sendUserMessageToPlayer(sessionId, sptFriendUser, "hey! you got the right code!");
        }

        if (giftSent === GiftSentResult.FAILED_GIFT_ALREADY_RECEIVED) 
        {
            this.mailSendService.sendUserMessageToPlayer(sessionId, sptFriendUser, "You already have that!!");
        }

        if (request.text.toLowerCase().includes("love you")) 
        {
            this.mailSendService.sendUserMessageToPlayer(sessionId, sptFriendUser, "I love you too buddy :3!");
        }

        if (request.text.toLowerCase() === "spt") 
        {
            this.mailSendService.sendUserMessageToPlayer(sessionId, sptFriendUser, "its me!!");
        }
    }

    /**
     * Get messages from a specific dialog that have items not expired
     * @param sessionId Session id
     * @param dialogueId Dialog to get mail attachments from
     * @returns Message array
     */
    protected getActiveMessagesFromDialog(sessionId: string, dialogueId: string): Message[]
    {
        const timeNow = this.timeUtil.getTimestamp();
        return this.saveServer.getProfile(sessionId).dialogues[dialogueId].messages.filter(x => timeNow < (x.dt + x.maxStorageTime));
    }

    /**
     * Return array of messages with uncollected items (includes expired)
     * @param messages Messages to parse
     * @returns messages with items to collect
     */
    protected getMessagesWithAttachments(messages: Message[]): Message[]
    {
        return messages.filter(x => x.items?.data?.length > 0);
    }

    /**
     * Delete expired items from all messages in player profile. triggers when updating traders.
     * @param sessionId Session id
     */
    protected removeExpiredItemsFromMessages(sessionId: string): void
    {
        for (const dialogueId in this.saveServer.getProfile(sessionId).dialogues)
        {
            this.removeExpiredItemsFromMessage(sessionId, dialogueId);
        }
    }

    /**
     * Removes expired items from a message in player profile
     * @param sessionId Session id
     * @param dialogueId Dialog id
     */
    protected removeExpiredItemsFromMessage(sessionId: string, dialogueId: string): void
    {
        for (const message of this.saveServer.getProfile(sessionId).dialogues[dialogueId].messages)
        {
            if (this.messageHasExpired(message))
            {
                message.items = {};
            }
        }
    }

    /**
     * Has a dialog message expired
     * @param message Message to check expiry of
     * @returns true or false
     */
    protected messageHasExpired(message: Message): boolean
    {
        return (this.timeUtil.getTimestamp()) > (message.dt + message.maxStorageTime);
    }
}