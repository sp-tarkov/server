import { PlayerScavGenerator } from "@spt/generators/PlayerScavGenerator";
import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { ITemplateSide } from "@spt/models/eft/common/tables/IProfileTemplate";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IMiniProfile } from "@spt/models/eft/launcher/IMiniProfile";
import { IGetProfileStatusResponseData } from "@spt/models/eft/profile/GetProfileStatusResponseData";
import { IGetOtherProfileRequest } from "@spt/models/eft/profile/IGetOtherProfileRequest";
import { IGetOtherProfileResponse } from "@spt/models/eft/profile/IGetOtherProfileResponse";
import { IGetProfileSettingsRequest } from "@spt/models/eft/profile/IGetProfileSettingsRequest";
import { IProfileChangeNicknameRequestData } from "@spt/models/eft/profile/IProfileChangeNicknameRequestData";
import { IProfileChangeVoiceRequestData } from "@spt/models/eft/profile/IProfileChangeVoiceRequestData";
import { IProfileCreateRequestData } from "@spt/models/eft/profile/IProfileCreateRequestData";
import { ISearchFriendRequestData } from "@spt/models/eft/profile/ISearchFriendRequestData";
import { ISearchFriendResponse } from "@spt/models/eft/profile/ISearchFriendResponse";
import { IInraid, ISptProfile, IVitality } from "@spt/models/eft/profile/ISptProfile";
import { IValidateNicknameRequestData } from "@spt/models/eft/profile/IValidateNicknameRequestData";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { MessageType } from "@spt/models/enums/MessageType";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { ProfileFixerService } from "@spt/services/ProfileFixerService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class ProfileController {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("PlayerScavGenerator") protected playerScavGenerator: PlayerScavGenerator,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("DialogueHelper") protected dialogueHelper: DialogueHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
    ) {}

    /**
     * Handle /launcher/profiles
     */
    public getMiniProfiles(): IMiniProfile[] {
        const allProfiles = Object.keys(this.saveServer.getProfiles());

        return allProfiles.map((sessionId) => this.getMiniProfile(sessionId));
    }

    /**
     * Handle launcher/profile/info
     */
    public getMiniProfile(sessionID: string): IMiniProfile {
        const profile = this.saveServer.getProfile(sessionID);
        if (!profile || !profile.characters) {
            throw new Error(`Unable to find character data for id: ${sessionID}. Profile may be corrupt`);
        }

        const pmc = profile.characters.pmc;
        const maxlvl = this.profileHelper.getMaxLevel();

        // Player hasn't completed profile creation process, send defaults
        if (!pmc?.Info?.Level) {
            return {
                username: profile.info?.username ?? "",
                nickname: "unknown",
                side: "unknown",
                currlvl: 0,
                currexp: 0,
                prevexp: 0,
                nextlvl: 0,
                maxlvl: maxlvl,
                edition: profile.info?.edition ?? "",
                profileId: profile.info?.id ?? "",
                sptData: this.profileHelper.getDefaultSptDataObject(),
            };
        }

        const currlvl = pmc.Info.Level;
        const nextlvl = this.profileHelper.getExperience(currlvl + 1);
        return {
            username: profile.info.username,
            nickname: pmc.Info.Nickname,
            side: pmc.Info.Side,
            currlvl: pmc.Info.Level,
            currexp: pmc.Info.Experience ?? 0,
            prevexp: currlvl === 0 ? 0 : this.profileHelper.getExperience(currlvl),
            nextlvl: nextlvl,
            maxlvl: maxlvl,
            edition: profile.info?.edition ?? "",
            profileId: profile.info?.id ?? "",
            sptData: profile.spt,
        };
    }

    /**
     * Handle client/game/profile/list
     */
    public getCompleteProfile(sessionID: string): IPmcData[] {
        return this.profileHelper.getCompleteProfile(sessionID);
    }

    /**
     * Handle client/game/profile/create
     * @param info Client reqeust object
     * @param sessionID Player id
     * @returns Profiles _id value
     */
    public createProfile(info: IProfileCreateRequestData, sessionID: string): string {
        const account = this.saveServer.getProfile(sessionID).info;
        const profileTemplate: ITemplateSide = this.cloner.clone(
            this.databaseService.getProfiles()[account.edition][info.side.toLowerCase()],
        );
        const pmcData = profileTemplate.character;

        // Delete existing profile
        this.deleteProfileBySessionId(sessionID);

        // PMC
        pmcData._id = account.id;
        pmcData.aid = account.aid;
        pmcData.savage = account.scavId;
        pmcData.sessionId = sessionID;
        pmcData.Info.Nickname = account.username;
        pmcData.Info.LowerNickname = account.username.toLowerCase();
        pmcData.Info.RegistrationDate = this.timeUtil.getTimestamp();
        pmcData.Info.Voice = this.databaseService.getCustomization()[info.voiceId]._name;
        pmcData.Stats = this.profileHelper.getDefaultCounters();
        pmcData.Info.NeedWipeOptions = [];
        pmcData.Customization.Head = info.headId;
        pmcData.Health.UpdateTime = this.timeUtil.getTimestamp();
        pmcData.Quests = [];
        pmcData.Hideout.Seed = this.timeUtil.getTimestamp() + 8 * 60 * 60 * 24 * 365; // 8 years in future why? who knows, we saw it in live
        pmcData.RepeatableQuests = [];
        pmcData.CarExtractCounts = {};
        pmcData.CoopExtractCounts = {};
        pmcData.Achievements = {};

        this.updateInventoryEquipmentId(pmcData);

        if (!pmcData.UnlockedInfo) {
            pmcData.UnlockedInfo = { unlockedProductionRecipe: [] };
        }

        // Change item IDs to be unique
        pmcData.Inventory.items = this.itemHelper.replaceIDs(
            pmcData.Inventory.items,
            pmcData,
            undefined,
            pmcData.Inventory.fastPanel,
        );

        // Create profile
        const profileDetails: ISptProfile = {
            info: account,
            characters: { pmc: pmcData, scav: {} as IPmcData },
            suits: profileTemplate.suits,
            userbuilds: profileTemplate.userbuilds,
            dialogues: profileTemplate.dialogues,
            spt: this.profileHelper.getDefaultSptDataObject(),
            vitality: {} as IVitality,
            inraid: {} as IInraid,
            insurance: [],
            traderPurchases: {},
            achievements: {},
        };

        this.profileFixerService.checkForAndFixPmcProfileIssues(profileDetails.characters.pmc);

        this.saveServer.addProfile(profileDetails);

        if (profileTemplate.trader.setQuestsAvailableForStart) {
            this.questHelper.addAllQuestsToProfile(profileDetails.characters.pmc, [QuestStatus.AvailableForStart]);
        }

        // Profile is flagged as wanting quests set to ready to hand in and collect rewards
        if (profileTemplate.trader.setQuestsAvailableForFinish) {
            this.questHelper.addAllQuestsToProfile(profileDetails.characters.pmc, [
                QuestStatus.AvailableForStart,
                QuestStatus.Started,
                QuestStatus.AvailableForFinish,
            ]);

            // Make unused response so applyQuestReward works
            const response = this.eventOutputHolder.getOutput(sessionID);

            // Add rewards for starting quests to profile
            this.givePlayerStartingQuestRewards(profileDetails, sessionID, response);
        }

        this.resetAllTradersInProfile(sessionID);

        this.saveServer.getProfile(sessionID).characters.scav = this.generatePlayerScav(sessionID);

        // Store minimal profile and reload it
        this.saveServer.saveProfile(sessionID);
        this.saveServer.loadProfile(sessionID);

        // Completed account creation
        this.saveServer.getProfile(sessionID).info.wipe = false;
        this.saveServer.saveProfile(sessionID);

        return pmcData._id;
    }

    /**
     * make profiles pmcData.Inventory.equipment unique
     * @param pmcData Profile to update
     */
    protected updateInventoryEquipmentId(pmcData: IPmcData): void {
        const oldEquipmentId = pmcData.Inventory.equipment;
        pmcData.Inventory.equipment = this.hashUtil.generate();

        for (const item of pmcData.Inventory.items) {
            if (item.parentId === oldEquipmentId) {
                item.parentId = pmcData.Inventory.equipment;

                continue;
            }

            if (item._id === oldEquipmentId) {
                item._id = pmcData.Inventory.equipment;
            }
        }
    }

    /**
     * Delete a profile
     * @param sessionID Id of profile to delete
     */
    protected deleteProfileBySessionId(sessionID: string): void {
        if (sessionID in this.saveServer.getProfiles()) {
            this.saveServer.deleteProfileById(sessionID);
        } else {
            this.logger.warning(
                this.localisationService.getText("profile-unable_to_find_profile_by_id_cannot_delete", sessionID),
            );
        }
    }

    /**
     * Iterate over all quests in player profile, inspect rewards for the quests current state (accepted/completed)
     * and send rewards to them in mail
     * @param profileDetails Player profile
     * @param sessionID Session id
     * @param response Event router response
     */
    protected givePlayerStartingQuestRewards(
        profileDetails: ISptProfile,
        sessionID: string,
        response: IItemEventRouterResponse,
    ): void {
        for (const quest of profileDetails.characters.pmc.Quests) {
            const questFromDb = this.questHelper.getQuestFromDb(quest.qid, profileDetails.characters.pmc);

            // Get messageId of text to send to player as text message in game
            // Copy of code from QuestController.acceptQuest()
            const messageId = this.questHelper.getMessageIdForQuestStart(
                questFromDb.startedMessageText,
                questFromDb.description,
            );
            const itemRewards = this.questHelper.applyQuestReward(
                profileDetails.characters.pmc,
                quest.qid,
                QuestStatus.Started,
                sessionID,
                response,
            );

            this.mailSendService.sendLocalisedNpcMessageToPlayer(
                sessionID,
                this.traderHelper.getTraderById(questFromDb.traderId),
                MessageType.QUEST_START,
                messageId,
                itemRewards,
                this.timeUtil.getHoursAsSeconds(100),
            );
        }
    }

    /**
     * For each trader reset their state to what a level 1 player would see
     * @param sessionId Session id of profile to reset
     */
    protected resetAllTradersInProfile(sessionId: string): void {
        for (const traderId in this.databaseService.getTraders()) {
            this.traderHelper.resetTrader(sessionId, traderId);
        }
    }

    /**
     * Generate a player scav object
     * PMC profile MUST exist first before pscav can be generated
     * @param sessionID
     * @returns IPmcData object
     */
    public generatePlayerScav(sessionID: string): IPmcData {
        return this.playerScavGenerator.generate(sessionID);
    }

    /**
     * Handle client/game/profile/nickname/validate
     */
    public validateNickname(info: IValidateNicknameRequestData, sessionID: string): string {
        if (info.nickname.length < 3) {
            return "tooshort";
        }

        if (this.profileHelper.isNicknameTaken(info, sessionID)) {
            return "taken";
        }

        return "OK";
    }

    /**
     * Handle client/game/profile/nickname/change event
     * Client allows player to adjust their profile name
     */
    public changeNickname(info: IProfileChangeNicknameRequestData, sessionID: string): string {
        const output = this.validateNickname(info, sessionID);

        if (output === "OK") {
            const pmcData = this.profileHelper.getPmcProfile(sessionID);

            pmcData.Info.Nickname = info.nickname;
            pmcData.Info.LowerNickname = info.nickname.toLowerCase();
        }

        return output;
    }

    /**
     * Handle client/game/profile/voice/change event
     */
    public changeVoice(info: IProfileChangeVoiceRequestData, sessionID: string): void {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        pmcData.Info.Voice = info.voice;
    }

    /**
     * Handle client/game/profile/search
     */
    public getFriends(info: ISearchFriendRequestData, sessionID: string): ISearchFriendResponse[] {
        const profile = this.saveServer.getProfile(sessionID);

        // return some of the current player info for now
        return [
            {
                _id: profile.characters.pmc._id,
                aid: profile.characters.pmc.aid,
                Info: {
                    Nickname: info.nickname,
                    Side: "Bear",
                    Level: 1,
                    MemberCategory: profile.characters.pmc.Info.MemberCategory,
                },
            },
        ];
    }

    /**
     * Handle client/profile/status
     */
    public getProfileStatus(sessionId: string): IGetProfileStatusResponseData {
        const account = this.saveServer.getProfile(sessionId).info;
        const response: IGetProfileStatusResponseData = {
            maxPveCountExceeded: false,
            profiles: [
                { profileid: account.scavId, profileToken: undefined, status: "Free", sid: "", ip: "", port: 0 },
                {
                    profileid: account.id,
                    profileToken: undefined,
                    status: "Free",
                    sid: "",
                    ip: "",
                    port: 0,
                },
            ],
        };

        return response;
    }

    public getOtherProfile(sessionId: string, request: IGetOtherProfileRequest): IGetOtherProfileResponse {
        const player = this.profileHelper.getFullProfile(sessionId);
        const playerPmc = player.characters.pmc;
        const playerScav = player.characters.scav;

        // return player for now
        return {
            id: playerPmc._id,
            aid: playerPmc.aid,
            info: {
                nickname: playerPmc.Info.Nickname,
                side: playerPmc.Info.Side,
                experience: playerPmc.Info.Experience,
                memberCategory: playerPmc.Info.MemberCategory,
                bannedState: playerPmc.Info.BannedState,
                bannedUntil: playerPmc.Info.BannedUntil,
                registrationDate: playerPmc.Info.RegistrationDate,
            },
            customization: {
                head: playerPmc.Customization.Head,
                body: playerPmc.Customization.Body,
                feet: playerPmc.Customization.Feet,
                hands: playerPmc.Customization.Hands,
            },
            skills: playerPmc.Skills,
            equipment: {
                // Default inventory tpl
                Id: playerPmc.Inventory.items.find((item) => item._tpl === ItemTpl.INVENTORY_DEFAULT)._id,
                Items: playerPmc.Inventory.items,
            },
            achievements: playerPmc.Achievements,
            favoriteItems: playerPmc.Inventory.favoriteItems ?? [],
            pmcStats: {
                eft: {
                    totalInGameTime: playerPmc.Stats.Eft.TotalInGameTime,
                    overAllCounters: playerPmc.Stats.Eft.OverallCounters,
                },
            },
            scavStats: {
                eft: {
                    totalInGameTime: playerScav.Stats.Eft.TotalInGameTime,
                    overAllCounters: playerScav.Stats.Eft.OverallCounters,
                },
            },
        };
    }

    /**
     * Handle client/profile/settings
     */
    public setChosenProfileIcon(sessionId: string, request: IGetProfileSettingsRequest): boolean {
        const profileToUpdate = this.profileHelper.getPmcProfile(sessionId);
        if (!profileToUpdate) {
            return false;
        }

        if (request.memberCategory !== null) {
            profileToUpdate.Info.SelectedMemberCategory = request.memberCategory;
        }

        if (request.squadInviteRestriction !== null) {
            profileToUpdate.Info.SquadInviteRestriction = request.squadInviteRestriction;
        }

        return true;
    }
}
