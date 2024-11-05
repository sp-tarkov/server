import { IDialogueChatBot } from "@spt/helpers/Dialogue/IDialogueChatBot";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { ISendMessageRequest } from "@spt/models/eft/dialog/ISendMessageRequest";
import { IUserDialogInfo } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { GiftSentResult } from "@spt/models/enums/GiftSentResult";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { Season } from "@spt/models/enums/Season";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { GiftService } from "@spt/services/GiftService";
import { MailSendService } from "@spt/services/MailSendService";
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
        @inject("GiftService") protected giftService: GiftService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        this.weatherConfig = this.configServer.getConfig(ConfigTypes.WEATHER);
    }

    public getChatBot(): IUserDialogInfo {
        return {
            _id: "6723fd51c5924c57ce0ca01f",
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
                this.randomUtil.getArrayValue(["Snow will be enabled after your next raid"]),
            );
        }

        if (requestInput === "givemespace") {
            const stashRowGiftId = "StashRows";
            const maxGiftsToSendCount = this.coreConfig.features.chatbotFeatures.commandUseLimits[stashRowGiftId] ?? 5;
            if (this.profileHelper.playerHasRecievedMaxNumberOfGift(sessionId, stashRowGiftId, maxGiftsToSendCount)) {
                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    sptFriendUser,
                    "You cannot accept any more of this gift",
                );
            } else {
                this.profileHelper.addStashRowsBonusToProfile(sessionId, 2);

                this.mailSendService.sendUserMessageToPlayer(
                    sessionId,
                    sptFriendUser,
                    this.randomUtil.getArrayValue(["Added 2 rows to stash, please restart your game to see them"]),
                );

                this.profileHelper.flagGiftReceivedInProfile(sessionId, stashRowGiftId, maxGiftsToSendCount);
            }
        }

        return request.dialogId;
    }
}
