import crypto from "node:crypto";
import { ProgramStatics } from "@spt/ProgramStatics";
import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { HideoutHelper } from "@spt/helpers/HideoutHelper";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { RewardHelper } from "@spt/helpers/RewardHelper";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IBodyPartHealth } from "@spt/models/eft/common/tables/IBotBase";
import {
    CustomisationSource,
    CustomisationType,
    ICustomisationStorage,
} from "@spt/models/eft/common/tables/ICustomisationStorage";
import { ICheckVersionResponse } from "@spt/models/eft/game/ICheckVersionResponse";
import { ICurrentGroupResponse } from "@spt/models/eft/game/ICurrentGroupResponse";
import { IGameConfigResponse } from "@spt/models/eft/game/IGameConfigResponse";
import { IGameKeepAliveResponse } from "@spt/models/eft/game/IGameKeepAliveResponse";
import { IGameModeRequestData } from "@spt/models/eft/game/IGameModeRequestData";
import { ESessionMode, IGameModeResponse } from "@spt/models/eft/game/IGameModeResponse";
import { IGetRaidTimeRequest } from "@spt/models/eft/game/IGetRaidTimeRequest";
import { IGetRaidTimeResponse } from "@spt/models/eft/game/IGetRaidTimeResponse";
import { IServerDetails } from "@spt/models/eft/game/IServerDetails";
import { ISurveyResponseData } from "@spt/models/eft/game/ISurveyResponseData";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { BonusType } from "@spt/models/enums/BonusType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { HideoutAreas } from "@spt/models/enums/HideoutAreas";
import { RewardType } from "@spt/models/enums/RewardType";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { CreateProfileService } from "@spt/services/CreateProfileService";
import { CustomLocationWaveService } from "@spt/services/CustomLocationWaveService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { GiftService } from "@spt/services/GiftService";
import { ItemBaseClassService } from "@spt/services/ItemBaseClassService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { OpenZoneService } from "@spt/services/OpenZoneService";
import { PostDbLoadService } from "@spt/services/PostDbLoadService";
import { ProfileActivityService } from "@spt/services/ProfileActivityService";
import { ProfileFixerService } from "@spt/services/ProfileFixerService";
import { RaidTimeAdjustmentService } from "@spt/services/RaidTimeAdjustmentService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class GameController {
    protected httpConfig: IHttpConfig;
    protected coreConfig: ICoreConfig;
    protected ragfairConfig: IRagfairConfig;
    protected hideoutConfig: IHideoutConfig;
    protected botConfig: IBotConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("PreSptModLoader") protected preSptModLoader: PreSptModLoader,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("RewardHelper") protected rewardHelper: RewardHelper,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PostDbLoadService") protected postDbLoadService: PostDbLoadService,
        @inject("CreateProfileService") protected createProfileService: CreateProfileService,
        @inject("CustomLocationWaveService") protected customLocationWaveService: CustomLocationWaveService,
        @inject("OpenZoneService") protected openZoneService: OpenZoneService,
        @inject("SeasonalEventService") protected seasonalEventService: SeasonalEventService,
        @inject("ItemBaseClassService") protected itemBaseClassService: ItemBaseClassService,
        @inject("GiftService") protected giftService: GiftService,
        @inject("RaidTimeAdjustmentService") protected raidTimeAdjustmentService: RaidTimeAdjustmentService,
        @inject("ProfileActivityService") protected profileActivityService: ProfileActivityService,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    public load(): void {
        // Runs on server start
        this.postDbLoadService.performPostDbLoadActions();
    }

    /**
     * Handle client/game/start
     */
    public gameStart(_url: string, _info: IEmptyRequestData, sessionID: string, startTimeStampMS: number): void {
        // Store client start time in app context
        this.applicationContext.addValue(
            ContextVariableType.CLIENT_START_TIMESTAMP,
            `${sessionID}_${startTimeStampMS}`,
        );

        // repeatableQuests are stored by in profile.Quests due to the responses of the client (e.g. Quests in
        // offraidData). Since we don't want to clutter the Quests list, we need to remove all completed (failed or
        // successful) repeatable quests. We also have to remove the Counters from the repeatableQuests
        if (sessionID) {
            const fullProfile = this.profileHelper.getFullProfile(sessionID);

            if (!fullProfile) {
                this.logger.error("gameStart requested but the profile linked to the sessionID does not exist!");
                return;
            }

            if (fullProfile.info.wipe) {
                // Don't bother doing any fixes, we're resetting profile
                return;
            }

            if (typeof fullProfile.spt.migrations === "undefined") {
                fullProfile.spt.migrations = {};
            }

            // Track one time use cultist rewards
            if (typeof fullProfile.spt.cultistRewards === "undefined") {
                fullProfile.spt.cultistRewards = new Map();
            }

            // Make sure we have a friends list array
            if (typeof fullProfile.friends === "undefined") {
                fullProfile.friends = [];
            }

            // In 0.16.1.3.35312 BSG changed this to from an int to a hex64 encoded value
            // Handle this outside of the migrations so even BE created profiles get changed
            if (typeof fullProfile.characters.pmc.Hideout.Seed === "number") {
                fullProfile.characters.pmc.Hideout.Seed = crypto.randomBytes(16).toString("hex");
            }

            //3.9 migration
            if (fullProfile.spt.version.includes("3.9.") && !fullProfile.spt.migrations["39x"]) {
                // Check every item has a valid mongoid
                this.inventoryHelper.validateInventoryUsesMongoIds(fullProfile.characters.pmc.Inventory.items);

                this.migrate39xProfile(fullProfile);

                // Flag as migrated
                fullProfile.spt.migrations["39x"] = this.timeUtil.getTimestamp();

                this.logger.success(`Migration of 3.9.x profile: ${fullProfile.info.username} completed successfully`);
            }

            //3.10 migration
            if (fullProfile.spt.version.includes("3.10.") && !fullProfile.spt.migrations["310x"]) {
                this.migrate310xProfile(fullProfile);

                // Flag as migrated
                fullProfile.spt.migrations["310x"] = this.timeUtil.getTimestamp();

                this.logger.success(`Migration of 3.10.x profile: ${fullProfile.info.username} completed successfully`);
            }

            if (Array.isArray(fullProfile.characters.pmc.WishList)) {
                fullProfile.characters.pmc.WishList = {};
            }

            if (Array.isArray(fullProfile.characters.scav.WishList)) {
                fullProfile.characters.scav.WishList = {};
            }

            if (fullProfile.dialogues) {
                this.profileFixerService.checkForAndFixDialogueAttachments(fullProfile);
            }

            this.logger.debug(`Started game with sessionId: ${sessionID} ${fullProfile.info.username}`);

            const pmcProfile = fullProfile.characters.pmc;

            if (this.coreConfig.fixes.fixProfileBreakingInventoryItemIssues) {
                this.profileFixerService.fixProfileBreakingInventoryItemIssues(pmcProfile);
            }

            if (pmcProfile.Health) {
                this.updateProfileHealthValues(pmcProfile);
            }

            if (pmcProfile.Inventory) {
                this.sendPraporGiftsToNewProfiles(pmcProfile);

                this.sendMechanicGiftsToNewProfile(pmcProfile);

                this.profileFixerService.checkForOrphanedModdedItems(sessionID, fullProfile);
            }

            this.profileFixerService.checkForAndRemoveInvalidTraders(fullProfile);

            this.profileFixerService.checkForAndFixPmcProfileIssues(pmcProfile);

            if (pmcProfile.Hideout) {
                this.profileFixerService.addMissingHideoutBonusesToProfile(pmcProfile);
                this.hideoutHelper.setHideoutImprovementsToCompleted(pmcProfile);
                this.hideoutHelper.unlockHideoutWallInProfile(pmcProfile);
                // Handle if player has been inactive for a long time, catch up on hideout update before the user goes to his hideout
                if (
                    !this.profileActivityService.activeWithinLastMinutes(
                        sessionID,
                        this.hideoutConfig.updateProfileHideoutWhenActiveWithinMinutes,
                    )
                ) {
                    this.hideoutHelper.updatePlayerHideout(sessionID);
                }
            }

            this.logProfileDetails(fullProfile);

            this.saveActiveModsToProfile(fullProfile);

            if (pmcProfile.Info) {
                this.addPlayerToPMCNames(pmcProfile);

                this.checkForAndRemoveUndefinedDialogs(fullProfile);
            }

            if (pmcProfile?.Skills?.Common) {
                this.warnOnActiveBotReloadSkill(pmcProfile);
            }

            this.seasonalEventService.givePlayerSeasonalGifts(sessionID);
        }

        // Set activity timestamp at the end of the method, so that code that checks for an older timestamp (Updating hideout) can still run
        this.profileActivityService.setActivityTimestamp(sessionID);
    }

    protected migrate310xProfile(fullProfile: ISptProfile) {
        if (typeof fullProfile.customisationUnlocks === "undefined") {
            fullProfile.customisationUnlocks = [];
            this.createProfileService.addCustomisationUnlocksToProfile(fullProfile);
        }

        if (typeof fullProfile.characters.pmc.Prestige === "undefined") {
            fullProfile.characters.pmc.Prestige = {};
        }

        if (typeof fullProfile.characters.pmc.Info.PrestigeLevel === "undefined") {
            fullProfile.characters.pmc.Info.PrestigeLevel = 0;
        }

        if (typeof fullProfile.characters.pmc.Inventory.hideoutCustomizationStashId === "undefined") {
            fullProfile.characters.pmc.Inventory.hideoutCustomizationStashId = "676db384777490e23c45b657";
            this.createProfileService.addMissingInternalContainersToProfile(fullProfile.characters.pmc);
        }

        if (typeof fullProfile.characters.pmc.Hideout.Customization === "undefined") {
            fullProfile.characters.pmc.Hideout.Customization = {
                Wall: "675844bdf94a97cbbe096f1a",
                Floor: "6758443ff94a97cbbe096f18",
                Light: "675fe8abbc3deae49a0b947f",
                Ceiling: "673b3f977038192ee006aa09",
                ShootingRangeMark: "67585d416c72998cf60ed85a",
            };
        }

        if (fullProfile.characters.pmc.Info.Side === "Bear") {
            // Reset clothing customization back to default as customization changed in 4.0
            fullProfile.characters.pmc.Customization.Body = "5cc0858d14c02e000c6bea66"; //Bear default clothing
            fullProfile.characters.pmc.Customization.Feet = "5cc085bb14c02e000e67a5c5";
            fullProfile.characters.pmc.Customization.Hands = "5cc0876314c02e000c6bea6b";
            fullProfile.characters.pmc.Customization.DogTag = "674731c8bafff850080488bb"; //Bear base dogtag

            if (fullProfile.characters.pmc.Info.GameVersion === "edge_of_darkness") {
                fullProfile.characters.pmc.Customization.DogTag = "6746fd09bafff85008048838";
            }

            if (fullProfile.characters.pmc.Info.GameVersion === "unheard_edition") {
                fullProfile.characters.pmc.Customization.DogTag = "67471928d17d6431550563b5";
            }

            for (const clothing of fullProfile.suits) {
                // Default Bear clothing, dont need to add this
                if (
                    clothing === "5cd946231388ce000d572fe3" ||
                    clothing === "5cd945d71388ce000a659dfb" ||
                    clothing === "666841a02537107dc508b704"
                ) {
                    continue;
                }

                const traderClothing = this.databaseService
                    .getTrader("5ac3b934156ae10c4430e83c")
                    .suits?.find((item) => item.suiteId === clothing);

                if (traderClothing) {
                    const clothingToAdd: ICustomisationStorage = {
                        id: traderClothing.suiteId,
                        source: CustomisationSource.UNLOCKED_IN_GAME,
                        type: CustomisationType.SUITE,
                    };

                    fullProfile.customisationUnlocks.push(clothingToAdd);
                }
            }

            // Remove array, not used in 3.11
            delete fullProfile.suits;
        }

        if (fullProfile.characters.pmc.Info.Side === "Usec") {
            // Reset clothing customization back to default as customization changed in 3.11
            fullProfile.characters.pmc.Customization.Body = "5cde95d97d6c8b647a3769b0"; //Usec default clothing
            fullProfile.characters.pmc.Customization.Feet = "5cde95ef7d6c8b04713c4f2d";
            fullProfile.characters.pmc.Customization.Hands = "5cde95fa7d6c8b04737c2d13";
            fullProfile.characters.pmc.Customization.DogTag = "674731d1170146228c0d222a"; //Usec base dogtag

            if (fullProfile.characters.pmc.Info.GameVersion === "edge_of_darkness") {
                fullProfile.characters.pmc.Customization.DogTag = "67471938bafff850080488b7";
            }

            if (fullProfile.characters.pmc.Info.GameVersion === "unheard_edition") {
                fullProfile.characters.pmc.Customization.DogTag = "6747193f170146228c0d2226";
            }

            for (const clothing of fullProfile.suits) {
                // Default Usec clothing, dont need to add this
                if (
                    clothing === "5cde9ec17d6c8b04723cf479" ||
                    clothing === "5cde9e957d6c8b0474535da7" ||
                    clothing === "666841a02537107dc508b704"
                ) {
                    continue;
                }

                const traderClothing = this.databaseService
                    .getTrader("5ac3b934156ae10c4430e83c")
                    .suits?.find((item) => item.suiteId === clothing);

                if (traderClothing) {
                    const clothingToAdd: ICustomisationStorage = {
                        id: traderClothing.suiteId,
                        source: CustomisationSource.UNLOCKED_IN_GAME,
                        type: CustomisationType.SUITE,
                    };

                    fullProfile.customisationUnlocks.push(clothingToAdd);
                }
            }

            // Remove array, not used in 3.11
            delete fullProfile.suits;
        }

        if (Object.keys(fullProfile.characters.pmc.Achievements).length > 0) {
            const achievementsDb = this.databaseService.getTemplates().achievements;

            for (const achievementId in fullProfile.characters.pmc.Achievements) {
                let rewards = achievementsDb.find((achievementDb) => achievementDb.id === achievementId)?.rewards;

                if (!rewards) {
                    continue;
                }

                // Only hand out the new hideout customization rewards.
                rewards = rewards.filter(
                    (achievementReward) => achievementReward.type === RewardType.CUSTOMIZATION_DIRECT,
                );

                this.rewardHelper.applyRewards(
                    rewards,
                    CustomisationSource.ACHIEVEMENT,
                    fullProfile,
                    fullProfile.characters.pmc,
                    achievementId,
                );
            }
        }

        fullProfile.spt.version = `${this.profileHelper.getDefaultSptDataObject().version} (Migrated from 3.10)`;
    }

    protected migrate39xProfile(fullProfile: ISptProfile) {
        // Karma & Favorite items
        if (typeof fullProfile.characters.pmc.karmaValue === "undefined") {
            this.logger.warning("Migration: Added karma value of 0.2 to profile");
            fullProfile.characters.pmc.karmaValue = 0.2;

            // Reset the PMC's favorite items, as the previous data was incorrect.
            this.logger.warning("Migration: Emptied out favoriteItems array on profile.");
            fullProfile.characters.pmc.Inventory.favoriteItems = [];
        }

        // Remove wall debuffs
        const wallAreaDb = this.databaseService
            .getHideout()
            .areas.find((area) => area.type === HideoutAreas.EMERGENCY_WALL);
        this.hideoutHelper.removeHideoutWallBuffsAndDebuffs(wallAreaDb, fullProfile.characters.pmc);

        // Equipment area
        const equipmentArea = fullProfile.characters.pmc.Hideout.Areas.find(
            (area) => area.type === HideoutAreas.EQUIPMENT_PRESETS_STAND,
        );
        if (!equipmentArea) {
            this.logger.warning("Migration: Added equipment preset stand hideout area to profile, level 0");
            fullProfile.characters.pmc.Hideout.Areas.push({
                active: true,
                completeTime: 0,
                constructing: false,
                lastRecipe: "",
                level: 0,
                passiveBonusesEnabled: true,
                slots: [],
                type: HideoutAreas.EQUIPMENT_PRESETS_STAND,
            });
        }

        // Cultist circle area
        const circleArea = fullProfile.characters.pmc.Hideout.Areas.find(
            (area) => area.type === HideoutAreas.CIRCLE_OF_CULTISTS,
        );
        if (!circleArea) {
            this.logger.warning("Migration: Added cultist circle hideout area to profile, level 0");
            fullProfile.characters.pmc.Hideout.Areas.push({
                active: true,
                completeTime: 0,
                constructing: false,
                lastRecipe: "",
                level: 0,
                passiveBonusesEnabled: true,
                slots: [],
                type: HideoutAreas.CIRCLE_OF_CULTISTS,
            });
        }

        // Hideout Improvement property changed name
        if ((fullProfile.characters.pmc.Hideout as any).Improvement) {
            fullProfile.characters.pmc.Hideout.Improvements = (fullProfile.characters.pmc.Hideout as any).Improvement;
            // biome-ignore lint/performance/noDelete: Delete is fine here, as we're seeking to remove these entirely
            delete (fullProfile.characters.pmc.Hideout as any).Improvement;
            this.logger.warning(`Migration: Moved Hideout Improvement data to new property 'Improvements'`);
        }

        // Remove invalid dialogs (MUST be a valid mongo id)
        // 100% removes commando + spyFriend
        for (const dialogKey in fullProfile.dialogues) {
            const isValidKey = this.hashUtil.isValidMongoId(dialogKey);
            if (!isValidKey) {
                this.logger.warning(`Migration: deleting: ${dialogKey} dialog`);
                delete fullProfile.dialogues[dialogKey];
            }
        }

        // Remove PMC 'ragfair' from trader list
        if (fullProfile.characters.pmc.TradersInfo.ragfair) {
            this.logger.warning("Migration: deleting: ragfair traderinfo object from PMC");
            // biome-ignore lint/performance/noDelete: Delete is fine here, as we're seeking to remove these entirely
            delete fullProfile.characters.pmc.TradersInfo.ragfair;
        }

        // Remove SCAV 'ragfair' from trader list
        if (fullProfile.characters.scav.TradersInfo.ragfair) {
            this.logger.warning("Migration: deleting: ragfair traderinfo object from PMC");
            // biome-ignore lint/performance/noDelete: Delete is fine here, as we're seeking to remove these entirely
            delete fullProfile.characters.scav.TradersInfo.ragfair;
        }

        // Insured armors/helmets will return without soft inserts, remove all to be safe
        fullProfile.insurance = [];
    }

    /**
     * Handle client/game/config
     */
    public getGameConfig(sessionID: string): IGameConfigResponse {
        const profile = this.profileHelper.getPmcProfile(sessionID);
        const gameTime =
            profile.Stats?.Eft.OverallCounters.Items?.find(
                (counter) => counter.Key.includes("LifeTime") && counter.Key.includes("Pmc"),
            )?.Value ?? 0;

        const config: IGameConfigResponse = {
            languages: this.databaseService.getLocales().languages,
            ndaFree: false,
            reportAvailable: false,
            twitchEventMember: false,
            lang: "en",
            aid: profile.aid,
            taxonomy: 6,
            activeProfileId: sessionID,
            backend: {
                Lobby: this.httpServerHelper.getBackendUrl(),
                Trading: this.httpServerHelper.getBackendUrl(),
                Messaging: this.httpServerHelper.getBackendUrl(),
                Main: this.httpServerHelper.getBackendUrl(),
                RagFair: this.httpServerHelper.getBackendUrl(),
            },
            useProtobuf: false,
            utc_time: new Date().getTime() / 1000,
            totalInGame: gameTime,
            sessionMode: "pve",
            purchasedGames: {
                eft: true,
                arena: false,
            },
            isGameSynced: true,
        };

        return config;
    }

    /**
     * Handle client/game/mode
     */
    public getGameMode(sessionID: string, info: IGameModeRequestData): IGameModeResponse {
        return { gameMode: ESessionMode.PVE, backendUrl: this.httpServerHelper.getBackendUrl() };
    }

    /**
     * Handle client/server/list
     */
    public getServer(sessionId: string): IServerDetails[] {
        return [{ ip: this.httpConfig.backendIp, port: this.httpConfig.backendPort }];
    }

    /**
     * Handle client/match/group/current
     */
    public getCurrentGroup(sessionId: string): ICurrentGroupResponse {
        return { squad: [] };
    }

    /**
     * Handle client/checkVersion
     */
    public getValidGameVersion(sessionId: string): ICheckVersionResponse {
        return { isvalid: true, latestVersion: this.coreConfig.compatibleTarkovVersion };
    }

    /**
     * Handle client/game/keepalive
     */
    public getKeepAlive(sessionId: string): IGameKeepAliveResponse {
        this.profileActivityService.setActivityTimestamp(sessionId);
        return { msg: "OK", utc_time: new Date().getTime() / 1000 };
    }

    /**
     * Handle singleplayer/settings/getRaidTime
     */
    public getRaidTime(sessionId: string, request: IGetRaidTimeRequest): IGetRaidTimeResponse {
        return this.raidTimeAdjustmentService.getRaidAdjustments(sessionId, request);
    }

    /**
     * Players set botReload to a high value and don't expect the crazy fast reload speeds, give them a warn about it
     * @param pmcProfile Player profile
     */
    protected warnOnActiveBotReloadSkill(pmcProfile: IPmcData): void {
        const botReloadSkill = this.profileHelper.getSkillFromProfile(pmcProfile, SkillTypes.BOT_RELOAD);
        if (botReloadSkill?.Progress > 0) {
            this.logger.warning(this.localisationService.getText("server_start_player_active_botreload_skill"));
        }
    }

    /**
     * When player logs in, iterate over all active effects and reduce timer
     * @param pmcProfile Profile to adjust values for
     */
    protected updateProfileHealthValues(pmcProfile: IPmcData): void {
        const healthLastUpdated = pmcProfile.Health.UpdateTime;
        const currentTimeStamp = this.timeUtil.getTimestamp();
        const diffSeconds = currentTimeStamp - healthLastUpdated;

        // Last update is in past
        if (healthLastUpdated < currentTimeStamp) {
            // Base values
            let energyRegenPerHour = 60;
            let hydrationRegenPerHour = 60;
            let hpRegenPerHour = 456.6;

            // Set new values, whatever is smallest
            energyRegenPerHour += pmcProfile.Bonuses.filter(
                (bonus) => bonus.type === BonusType.ENERGY_REGENERATION,
            ).reduce((sum, curr) => sum + (curr.value ?? 0), 0);
            hydrationRegenPerHour += pmcProfile.Bonuses.filter(
                (bonus) => bonus.type === BonusType.HYDRATION_REGENERATION,
            ).reduce((sum, curr) => sum + (curr.value ?? 0), 0);
            hpRegenPerHour += pmcProfile.Bonuses.filter((bonus) => bonus.type === BonusType.HEALTH_REGENERATION).reduce(
                (sum, curr) => sum + (curr.value ?? 0),
                0,
            );

            // Player has energy deficit
            if (pmcProfile.Health.Energy.Current !== pmcProfile.Health.Energy.Maximum) {
                // Set new value, whatever is smallest
                pmcProfile.Health.Energy.Current += Math.round(energyRegenPerHour * (diffSeconds / 3600));
                if (pmcProfile.Health.Energy.Current > pmcProfile.Health.Energy.Maximum) {
                    pmcProfile.Health.Energy.Current = pmcProfile.Health.Energy.Maximum;
                }
            }

            // Player has hydration deficit
            if (pmcProfile.Health.Hydration.Current !== pmcProfile.Health.Hydration.Maximum) {
                pmcProfile.Health.Hydration.Current += Math.round(hydrationRegenPerHour * (diffSeconds / 3600));
                if (pmcProfile.Health.Hydration.Current > pmcProfile.Health.Hydration.Maximum) {
                    pmcProfile.Health.Hydration.Current = pmcProfile.Health.Hydration.Maximum;
                }
            }

            // Check all body parts
            for (const bodyPartKey in pmcProfile.Health.BodyParts) {
                const bodyPart = pmcProfile.Health.BodyParts[bodyPartKey] as IBodyPartHealth;

                // Check part hp
                if (bodyPart.Health.Current < bodyPart.Health.Maximum) {
                    bodyPart.Health.Current += Math.round(hpRegenPerHour * (diffSeconds / 3600));
                }
                if (bodyPart.Health.Current > bodyPart.Health.Maximum) {
                    bodyPart.Health.Current = bodyPart.Health.Maximum;
                }

                // Look for effects
                if (Object.keys(bodyPart.Effects ?? {}).length > 0) {
                    for (const effectKey in bodyPart.Effects) {
                        // remove effects below 1, .e.g. bleeds at -1
                        if (bodyPart.Effects[effectKey].Time < 1) {
                            // More than 30 mins has passed
                            if (diffSeconds > 1800) {
                                delete bodyPart.Effects[effectKey];
                            }

                            continue;
                        }

                        // Decrement effect time value by difference between current time and time health was last updated
                        bodyPart.Effects[effectKey].Time -= diffSeconds;
                        if (bodyPart.Effects[effectKey].Time < 1) {
                            // effect time was sub 1, set floor it can be
                            bodyPart.Effects[effectKey].Time = 1;
                        }
                    }
                }
            }

            // Update both values as they've both been updated
            pmcProfile.Health.UpdateTime = currentTimeStamp;
        }
    }

    /**
     * Send starting gifts to profile after x days
     * @param pmcProfile Profile to add gifts to
     */
    protected sendPraporGiftsToNewProfiles(pmcProfile: IPmcData): void {
        const timeStampProfileCreated = pmcProfile.Info.RegistrationDate;
        const oneDaySeconds = this.timeUtil.getHoursAsSeconds(24);
        const currentTimeStamp = this.timeUtil.getTimestamp();

        // One day post-profile creation
        if (currentTimeStamp > timeStampProfileCreated + oneDaySeconds) {
            this.giftService.sendPraporStartingGift(pmcProfile.sessionId, 1);
        }

        // Two day post-profile creation
        if (currentTimeStamp > timeStampProfileCreated + oneDaySeconds * 2) {
            this.giftService.sendPraporStartingGift(pmcProfile.sessionId, 2);
        }
    }

    /**
     * Mechanic sends players a measuring tape on profile start for some reason
     * @param pmcProfile Player profile
     */
    protected sendMechanicGiftsToNewProfile(pmcProfile: IPmcData) {
        this.giftService.sendGiftWithSilentReceivedCheck("MechanicGiftDay1", pmcProfile.sessionId, 1);
    }

    /**
     * Get a list of installed mods and save their details to the profile being used
     * @param fullProfile Profile to add mod details to
     */
    protected saveActiveModsToProfile(fullProfile: ISptProfile): void {
        // Add empty mod array if undefined
        if (!fullProfile.spt.mods) {
            fullProfile.spt.mods = [];
        }

        // Get active mods
        const activeMods = this.preSptModLoader.getImportedModDetails();
        for (const modKey in activeMods) {
            const modDetails = activeMods[modKey];
            if (
                fullProfile.spt.mods.some(
                    (mod) =>
                        mod.author === modDetails.author &&
                        mod.name === modDetails.name &&
                        mod.version === modDetails.version,
                )
            ) {
                // Exists already, skip
                continue;
            }

            fullProfile.spt.mods.push({
                author: modDetails.author,
                dateAdded: Date.now(),
                name: modDetails.name,
                version: modDetails.version,
                url: modDetails.url,
            });
        }
    }

    /**
     * Add the logged in players name to PMC name pool
     * @param pmcProfile Profile of player to get name from
     */
    protected addPlayerToPMCNames(pmcProfile: IPmcData): void {
        const playerName = pmcProfile.Info.Nickname;
        if (playerName) {
            const bots = this.databaseService.getBots().types;

            // Official names can only be 15 chars in length
            if (playerName.length > this.botConfig.botNameLengthLimit) {
                return;
            }

            // Skip if player name exists already
            if (bots.bear?.firstName.some((x) => x === playerName)) {
                return;
            }

            if (bots.bear) {
                bots.bear.firstName.push(playerName);
            }

            if (bots.usec) {
                bots.usec.firstName.push(playerName);
            }
        }
    }

    /**
     * Check for a dialog with the key 'undefined', and remove it
     * @param fullProfile Profile to check for dialog in
     */
    protected checkForAndRemoveUndefinedDialogs(fullProfile: ISptProfile): void {
        const undefinedDialog = fullProfile.dialogues.undefined;
        if (undefinedDialog) {
            // biome-ignore lint/performance/noDelete: Delete is fine here, as we're seeking to delete undefined dialogs.
            delete fullProfile.dialogues.undefined;
        }
    }

    protected logProfileDetails(fullProfile: ISptProfile): void {
        this.logger.debug(`Profile made with: ${fullProfile.spt.version}`);
        this.logger.debug(
            `Server version: ${ProgramStatics.SPT_VERSION || this.coreConfig.sptVersion} ${ProgramStatics.COMMIT}`,
        );
        this.logger.debug(`Debug enabled: ${ProgramStatics.DEBUG}`);
        this.logger.debug(`Mods enabled: ${ProgramStatics.MODS}`);
    }

    public getSurvey(sessionId: string): ISurveyResponseData {
        return this.coreConfig.survey;
    }
}
