import { PlayerScavGenerator } from "@spt/generators/PlayerScavGenerator";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { QuestRewardHelper } from "@spt/helpers/QuestRewardHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { CustomisationSource, CustomisationType } from "@spt/models/eft/common/tables/ICustomisationStorage";
import { ITemplateSide } from "@spt/models/eft/common/tables/IProfileTemplate";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IProfileCreateRequestData } from "@spt/models/eft/profile/IProfileCreateRequestData";
import { IInraid, ISptProfile, IVitality } from "@spt/models/eft/profile/ISptProfile";
import { GameEditions } from "@spt/models/enums/GameEditions";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { MessageType } from "@spt/models/enums/MessageType";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { ProfileFixerService } from "@spt/services/ProfileFixerService";
import { HashUtil } from "@spt/utils/HashUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class CreateProfileService {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("PlayerScavGenerator") protected playerScavGenerator: PlayerScavGenerator,
        @inject("QuestRewardHelper") protected questRewardHelper: QuestRewardHelper,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
    ) {}

    public async createProfile(sessionID: string, info: IProfileCreateRequestData): Promise<string> {
        const account = this.saveServer.getProfile(sessionID).info;
        const profileTemplateClone: ITemplateSide = this.cloner.clone(
            this.databaseService.getProfiles()[account.edition][info.side.toLowerCase()],
        );
        const pmcData = profileTemplateClone.character;

        // Delete existing profile
        this.deleteProfileBySessionId(sessionID);

        // PMC
        pmcData._id = account.id;
        pmcData.aid = account.aid;
        pmcData.savage = account.scavId;
        pmcData.sessionId = sessionID;
        pmcData.Info.Nickname = info.nickname;
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

        if (typeof info.sptForcePrestigeLevel === "number") {
            pmcData.Info.PrestigeLevel = info.sptForcePrestigeLevel;
        }

        this.updateInventoryEquipmentId(pmcData);

        if (!pmcData.UnlockedInfo) {
            pmcData.UnlockedInfo = { unlockedProductionRecipe: [] };
        }

        // Add required items to pmc stash
        this.addMissingInternalContainersToProfile(pmcData);

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
            suits: profileTemplateClone.suits,
            userbuilds: profileTemplateClone.userbuilds,
            dialogues: profileTemplateClone.dialogues,
            spt: this.profileHelper.getDefaultSptDataObject(),
            vitality: {} as IVitality,
            inraid: {} as IInraid,
            insurance: [],
            traderPurchases: {},
            achievements: {},
            friends: [],
            customisationUnlocks: [],
        };

        this.addCustomisationUnlocksToProfile(profileDetails);

        this.profileFixerService.checkForAndFixPmcProfileIssues(profileDetails.characters.pmc);

        this.saveServer.addProfile(profileDetails);

        if (profileTemplateClone.trader.setQuestsAvailableForStart) {
            this.questHelper.addAllQuestsToProfile(profileDetails.characters.pmc, [QuestStatus.AvailableForStart]);
        }

        // Profile is flagged as wanting quests set to ready to hand in and collect rewards
        if (profileTemplateClone.trader.setQuestsAvailableForFinish) {
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

        this.saveServer.getProfile(sessionID).characters.scav = this.playerScavGenerator.generate(sessionID);

        // Store minimal profile and reload it
        await this.saveServer.saveProfile(sessionID);
        await this.saveServer.loadProfile(sessionID);

        // Completed account creation
        this.saveServer.getProfile(sessionID).info.wipe = false;
        await this.saveServer.saveProfile(sessionID);

        return pmcData._id;
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
     * For each trader reset their state to what a level 1 player would see
     * @param sessionId Session id of profile to reset
     */
    protected resetAllTradersInProfile(sessionId: string): void {
        for (const traderId in this.databaseService.getTraders()) {
            this.traderHelper.resetTrader(sessionId, traderId);
        }
    }

    /**
     * Ensure a profile has the necessary internal containers e.g. questRaidItems / sortingTable
     * DOES NOT check that stash exists
     * @param pmcData Profile to check
     */
    protected addMissingInternalContainersToProfile(pmcData: IPmcData): void {
        if (!pmcData.Inventory.items.find((item) => item._id === pmcData.Inventory.hideoutCustomizationStashId)) {
            pmcData.Inventory.items.push({
                _id: pmcData.Inventory.hideoutCustomizationStashId,
                _tpl: ItemTpl.HIDEOUTAREACONTAINER_CUSTOMIZATION,
            });
        }

        if (!pmcData.Inventory.items.find((item) => item._id === pmcData.Inventory.sortingTable)) {
            pmcData.Inventory.items.push({
                _id: pmcData.Inventory.sortingTable,
                _tpl: ItemTpl.SORTINGTABLE_SORTING_TABLE,
            });
        }

        if (!pmcData.Inventory.items.find((item) => item._id === pmcData.Inventory.questStashItems)) {
            pmcData.Inventory.items.push({
                _id: pmcData.Inventory.questStashItems,
                _tpl: ItemTpl.STASH_QUESTOFFLINE,
            });
        }

        if (!pmcData.Inventory.items.find((item) => item._id === pmcData.Inventory.questRaidItems)) {
            pmcData.Inventory.items.push({
                _id: pmcData.Inventory.questRaidItems,
                _tpl: ItemTpl.STASH_QUESTRAID,
            });
        }
    }

    protected addCustomisationUnlocksToProfile(fullProfile: ISptProfile) {
        // Some game versions have additional dogtag variants, add them
        switch (this.getGameEdition(fullProfile)) {
            case GameEditions.EDGE_OF_DARKNESS:
                // Gets EoD tags
                fullProfile.customisationUnlocks.push({
                    id: "6746fd09bafff85008048838",
                    source: CustomisationSource.DEFAULT,
                    type: CustomisationType.DOG_TAG,
                });

                fullProfile.customisationUnlocks.push({
                    id: "67471938bafff850080488b7",
                    source: CustomisationSource.DEFAULT,
                    type: CustomisationType.DOG_TAG,
                });

                break;
            case GameEditions.UNHEARD:
                // Gets EoD+Unheard tags
                fullProfile.customisationUnlocks.push({
                    id: "6746fd09bafff85008048838",
                    source: CustomisationSource.DEFAULT,
                    type: CustomisationType.DOG_TAG,
                });

                fullProfile.customisationUnlocks.push({
                    id: "67471938bafff850080488b7",
                    source: CustomisationSource.DEFAULT,
                    type: CustomisationType.DOG_TAG,
                });

                fullProfile.customisationUnlocks.push({
                    id: "67471928d17d6431550563b5",
                    source: CustomisationSource.DEFAULT,
                    type: CustomisationType.DOG_TAG,
                });

                fullProfile.customisationUnlocks.push({
                    id: "6747193f170146228c0d2226",
                    source: CustomisationSource.DEFAULT,
                    type: CustomisationType.DOG_TAG,
                });
                break;
        }

        const pretigeLevel = fullProfile?.characters?.pmc?.Info?.PrestigeLevel;
        if (pretigeLevel) {
            if (pretigeLevel >= 1) {
                fullProfile.customisationUnlocks.push({
                    id: "674dbf593bee1152d407f005",
                    source: CustomisationSource.DEFAULT,
                    type: CustomisationType.DOG_TAG,
                });
            }

            if (pretigeLevel >= 2) {
                fullProfile.customisationUnlocks.push({
                    id: "675dcfea7ae1a8792107ca99",
                    source: CustomisationSource.DEFAULT,
                    type: CustomisationType.DOG_TAG,
                });
            }
        }
    }

    protected getGameEdition(profile: ISptProfile): string {
        const edition = profile.characters?.pmc?.Info?.GameVersion;
        if (!edition) {
            // Edge case - profile not created yet, fall back to what launcher has set
            const launcherEdition = profile.info.edition;
            switch (launcherEdition.toLowerCase()) {
                case "edge of darkness":
                    return GameEditions.EDGE_OF_DARKNESS;
                case "unheard":
                    return GameEditions.UNHEARD;
                default:
                    return GameEditions.STANDARD;
            }
        }

        return edition;
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
            const itemRewards = this.questRewardHelper.applyQuestReward(
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
}
