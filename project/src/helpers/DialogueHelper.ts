import { ItemHelper } from "@spt/helpers/ItemHelper";
import { NotificationSendHelper } from "@spt/helpers/NotificationSendHelper";
import { NotifierHelper } from "@spt/helpers/NotifierHelper";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IDialogue, IMessagePreview } from "@spt/models/eft/profile/ISptProfile";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class DialogueHelper {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("NotifierHelper") protected notifierHelper: NotifierHelper,
        @inject("NotificationSendHelper") protected notificationSendHelper: NotificationSendHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
    ) {}

    /**
     * Get the preview contents of the last message in a dialogue.
     * @param dialogue
     * @returns MessagePreview
     */
    public getMessagePreview(dialogue: IDialogue): IMessagePreview {
        // The last message of the dialogue should be shown on the preview.
        const message = dialogue.messages[dialogue.messages.length - 1];
        const result: IMessagePreview = {
            dt: message?.dt,
            type: message?.type,
            templateId: message?.templateId,
            uid: dialogue._id,
        };

        if (message?.text) {
            result.text = message.text;
        }

        if (message?.systemData) {
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
    public getMessageItemContents(messageID: string, sessionID: string, itemId: string): IItem[] {
        const dialogueData = this.saveServer.getProfile(sessionID).dialogues;
        for (const dialogueId in dialogueData) {
            const message = dialogueData[dialogueId].messages.find((x) => x._id === messageID);
            if (!message) {
                continue;
            }

            if (message._id === messageID) {
                const attachmentsNew = this.saveServer.getProfile(sessionID).dialogues[dialogueId].attachmentsNew;
                if (attachmentsNew > 0) {
                    this.saveServer.getProfile(sessionID).dialogues[dialogueId].attachmentsNew = attachmentsNew - 1;
                }

                // Check reward count when item being moved isn't in reward list
                // If count is 0, it means after this move occurs the reward array will be empty and all rewards collected
                if (!message.items.data) {
                    message.items.data = [];
                }

                const rewardItemCount = message.items.data?.filter((item) => item._id !== itemId);
                if (rewardItemCount.length === 0) {
                    message.rewardCollected = true;
                    message.hasRewards = false;
                }

                return message.items.data;
            }
        }

        return [];
    }

    /**
     * Get the dialogs dictionary for a profile, create if doesnt exist
     * @param sessionId Session/player id
     * @returns Dialog dictionary
     */
    public getDialogsForProfile(sessionId: string): Record<string, IDialogue> {
        const profile = this.saveServer.getProfile(sessionId);
        if (!profile.dialogues) {
            profile.dialogues = {};
        }

        return profile.dialogues;
    }
}
