import { inject, injectable } from "tsyringe";

import { DialogueHelper } from "../helpers/DialogueHelper";
import { IGetAllAttachmentsResponse } from "../models/eft/dialog/IGetAllAttachmentsResponse";
import { IGetFriendListDataResponse } from "../models/eft/dialog/IGetFriendListDataResponse";
import {
    IGetMailDialogViewResponseData
} from "../models/eft/dialog/IGetMailDialogViewResponseData";
import { DialogueInfo, IAkiProfile, IUserDialogInfo, Message } from "../models/eft/profile/IAkiProfile";
import { MessageType } from "../models/enums/MessageType";
import { SaveServer } from "../servers/SaveServer";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class DialogueController
{
    constructor(
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper
    )
    { }

    public update(): void
    {
        const profiles = this.saveServer.getProfiles();
        for (const sessionID in profiles)
        {
            this.removeExpiredItemsFromMessages(sessionID);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public getFriendList(sessionID: string): IGetFriendListDataResponse
    {
        return {
            "Friends": [],
            "Ignore": [],
            "InIgnoreList": []
        };
    }

    /**
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
            "_id": dialogueID,
            "type": dialogue.type ? dialogue.type : MessageType.NPC_TRADER,
            "message": this.dialogueHelper.getMessagePreview(dialogue),
            "new": dialogue.new,
            "attachmentsNew": dialogue.attachmentsNew,
            "pinned": dialogue.pinned,
            Users: dialogue.Users ? dialogue.Users : undefined
        };

        return result;
    }

    /**
     * Handle player clicking 'messenger' and seeing all the messages they've recieved
     * Set the content of the dialogue on the details panel, showing all the messages
     * for the specified dialogue.
     * @param dialogueID Dialog id
     * @param sessionID Session id
     * @returns IGetMailDialogViewResponseData object
     */
    public generateDialogueView(dialogueID: string, sessionID: string): IGetMailDialogViewResponseData
    {
        const profile = this.saveServer.getProfile(sessionID);
        const dialogue = profile.dialogues[dialogueID];
        dialogue.new = 0;

        // Set number of new attachments, but ignore those that have expired.
        dialogue.attachmentsNew = this.getUnreadMessagesWithAttachmentsCount(sessionID, dialogueID);

        return { 
            messages: dialogue.messages,
            profiles: this.getProfilesForMail(profile, dialogue.Users),
            hasMessagesWithRewards: this.messagesHaveUncollectedRewards(dialogue.messages)
        };
    }

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

    public removeDialogue(dialogueID: string, sessionID: string): void
    {
        delete this.saveServer.getProfile(sessionID).dialogues[dialogueID];
    }

    public setDialoguePin(dialogueID: string, shouldPin: boolean, sessionID: string): void
    {
        this.saveServer.getProfile(sessionID).dialogues[dialogueID].pinned = shouldPin;
    }

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