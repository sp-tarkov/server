import type { IDialogueChatBot } from "@spt/helpers/Dialogue/IDialogueChatBot";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import type { ISendMessageRequest } from "@spt/models/eft/dialog/ISendMessageRequest";
import type { IUserDialogInfo } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { GiftSentResult } from "@spt/models/enums/GiftSentResult";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { Season } from "@spt/models/enums/Season";
import { SeasonalEventType } from "@spt/models/enums/SeasonalEventType";
import type { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import type { IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { GiftService } from "@spt/services/GiftService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class SptDialogueChatBot implements IDialogueChatBot {
    protected coreConfig: ICoreConfig;
    protected weatherConfig: IWeatherConfig;

    public constructor(
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("GiftService") protected giftService: GiftService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        this.weatherConfig = this.configServer.getConfig(ConfigTypes.WEATHER);
    }

    public getChatBot(): IUserDialogInfo {
        return {
            _id: this.coreConfig.features.chatbotFeatures.ids.spt,
            aid: 1234566,
            Info: {
                Level: 1,
                MemberCategory: MemberCategory.DEVELOPER,
                SelectedMemberCategory: MemberCategory.DEVELOPER,
                Nickname: this.coreConfig.sptFriendNickname,
                Side: "Usec",
            },
        };
    }

    /**
     * Send responses back to player when they communicate with SPT friend on friends list
     * @param sessionId Session Id
     * @param request send message request
     */
    public handleMessage(sessionId: string, request: ISendMessageRequest): string {
        const sender = this.profileHelper.getPmcProfile(sessionId);

        const sptFriendUser = this.getChatBot();
        const requestInput = request.text.toLowerCase();

        // only check if entered text is gift code when feature enabled
        if (this.coreConfig.features.chatbotFeatures.sptFriendGiftsEnabled) {
            const giftSent = this.giftService.sendGiftToPlayer(sessionId, request.text);
            if (giftSent === GiftSentResult.SUCCESS) {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    sptFriendUser,
                    this.randomUtil.getArrayValue([
                        "Hey! you got the right code!",
                        "A secret code, how exciting!",
                        "You found a gift code!",
                        "A gift code! incredible",
                        "A gift! what could it be!",
                    ]),
                );

                return;
            }

            if (giftSent === GiftSentResult.FAILED_GIFT_ALREADY_RECEIVED) {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    sptFriendUser,
                    this.randomUtil.getArrayValue(["Looks like you already used that code", "You already have that!!"]),
                );

                return;
            }
        }

        if (requestInput.includes("love you")) {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue([
                    "That's quite forward but i love you too in a purely chatbot-human way",
                    "I love you too buddy :3!",
                    "uwu",
                    `love you too ${sender?.Info?.Nickname}`,
                ]),
            );
        }

        if (requestInput === "spt") {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue(["Its me!!", "spt? i've heard of that project"]),
            );
        }

        if (requestInput === "fish") {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue(["blub"]),
            );
        }

        if (["hello", "hi", "sup", "yo", "hey"].includes(requestInput)) {
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
                ]),
            );
        }

        if (requestInput === "nikita") {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue([
                    "I know that guy!",
                    "Cool guy, he made EFT!",
                    "Legend",
                    "Remember when he said webel-webel-webel-webel, classic Nikita moment",
                ]),
            );
        }

        if (requestInput === "are you a bot") {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue(["beep boop", "**sad boop**", "probably", "sometimes", "yeah lol"]),
            );
        }

        if (requestInput === "itsonlysnowalan") {
            this.weatherConfig.overrideSeason = Season.WINTER;

            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                sptFriendUser,
                this.randomUtil.getArrayValue([this.localisationService.getText("chatbot-snow_enabled")]),
            );
        }

        if (requestInput === "veryspooky") {
            const enableEventResult = this.seasonalEventService.forceSeasonalEvent(SeasonalEventType.HALLOWEEN);
            if (enableEventResult) {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    sptFriendUser,
                    this.randomUtil.getArrayValue([
                        this.localisationService.getText("chatbot-halloween_event_enabled"),
                    ]),
                );
            }
        }

        if (requestInput === "givemespace") {
            const stashRowGiftId = "StashRows";
            const maxGiftsToSendCount = this.coreConfig.features.chatbotFeatures.commandUseLimits[stashRowGiftId] ?? 5;
            if (this.profileHelper.playerHasRecievedMaxNumberOfGift(sessionId, stashRowGiftId, maxGiftsToSendCount)) {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    sptFriendUser,
                    this.localisationService.getText("chatbot-cannot_accept_any_more_of_gift"),
                );
            } else {
                this.profileHelper.addStashRowsBonusToProfile(sessionId, 2);

                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    sptFriendUser,
                    this.randomUtil.getArrayValue([
                        this.localisationService.getText("chatbot-added_stash_rows_please_restart"),
                    ]),
                );

                this.profileHelper.flagGiftReceivedInProfile(sessionId, stashRowGiftId, maxGiftsToSendCount);
            }
        }

        return request.dialogId;
    }
}
