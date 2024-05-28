import { inject, injectable } from "tsyringe";
import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { PlayerScavGenerator } from "@spt/generators/PlayerScavGenerator";
import { HealthHelper } from "@spt/helpers/HealthHelper";
import { InRaidHelper } from "@spt/helpers/InRaidHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { BodyPartHealth } from "@spt/models/eft/common/tables/IBotBase";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { IRegisterPlayerRequestData } from "@spt/models/eft/inRaid/IRegisterPlayerRequestData";
import { ISaveProgressRequestData } from "@spt/models/eft/inRaid/ISaveProgressRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MessageType } from "@spt/models/enums/MessageType";
import { PlayerRaidEndState } from "@spt/models/enums/PlayerRaidEndState";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import { Traders } from "@spt/models/enums/Traders";
import { IAirdropConfig } from "@spt/models/spt/config/IAirdropConfig";
import { IBTRConfig } from "@spt/models/spt/config/IBTRConfig";
import { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import { IInRaidConfig } from "@spt/models/spt/config/IInRaidConfig";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { ITraderServiceModel } from "@spt/models/spt/services/ITraderServiceModel";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { InsuranceService } from "@spt/services/InsuranceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { MatchBotDetailsCacheService } from "@spt/services/MatchBotDetailsCacheService";
import { PmcChatResponseService } from "@spt/services/PmcChatResponseService";
import { TraderServicesService } from "@spt/services/TraderServicesService";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";

/**
 * Logic for handling In Raid callbacks
 */
@injectable()
export class InraidController
{
    protected airdropConfig: IAirdropConfig;
    protected btrConfig: IBTRConfig;
    protected inRaidConfig: IInRaidConfig;
    protected traderConfig: ITraderConfig;
    protected locationConfig: ILocationConfig;
    protected ragfairConfig: IRagfairConfig;
    protected hideoutConfig: IHideoutConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("PmcChatResponseService") protected pmcChatResponseService: PmcChatResponseService,
        @inject("MatchBotDetailsCacheService") protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PlayerScavGenerator") protected playerScavGenerator: PlayerScavGenerator,
        @inject("HealthHelper") protected healthHelper: HealthHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("TraderServicesService") protected traderServicesService: TraderServicesService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("InsuranceService") protected insuranceService: InsuranceService,
        @inject("InRaidHelper") protected inRaidHelper: InRaidHelper,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
    )
    {
        this.airdropConfig = this.configServer.getConfig(ConfigTypes.AIRDROP);
        this.btrConfig = this.configServer.getConfig(ConfigTypes.BTR);
        this.inRaidConfig = this.configServer.getConfig(ConfigTypes.IN_RAID);
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
    }

    /**
     * Save locationId to active profiles inraid object AND app context
     * @param sessionID Session id
     * @param info Register player request
     */
    public addPlayer(sessionID: string, info: IRegisterPlayerRequestData): void
    {
        this.applicationContext.addValue(ContextVariableType.REGISTER_PLAYER_REQUEST, info);
        const profile = this.saveServer.getProfile(sessionID);
        if (!profile)
        {
            this.logger.error(this.localisationService.getText("inraid-no_profile_found", sessionID));

            return;
        }
        if (!profile.inraid)
        {
            profile.inraid = { character: sessionID, location: info.locationId };

            return;
        }

        profile.inraid.location = info.locationId;
    }

    /**
     * Handle raid/profile/save
     * Save profile state to disk
     * Handles pmc/pscav
     * @param offraidData post-raid request data
     * @param sessionID Session id
     */
    public savePostRaidProgress(offraidData: ISaveProgressRequestData, sessionID: string): void
    {
        this.logger.debug(`Raid outcome: ${offraidData.exit}`);

        if (!this.inRaidConfig.save.loot)
        {
            return;
        }

        if (offraidData.isPlayerScav)
        {
            this.savePlayerScavProgress(sessionID, offraidData);
        }
        else
        {
            this.savePmcProgress(sessionID, offraidData);
        }

        // Set flea interval time to out-of-raid value
        this.ragfairConfig.runIntervalSeconds = this.ragfairConfig.runIntervalValues.outOfRaid;
        this.hideoutConfig.runIntervalSeconds = this.hideoutConfig.runIntervalValues.outOfRaid;
    }

    /**
     * Handle updating player profile post-pmc raid
     * @param sessionID Session id
     * @param postRaidRequest Post-raid data
     */
    protected savePmcProgress(sessionID: string, postRaidRequest: ISaveProgressRequestData): void
    {
        const serverProfile = this.saveServer.getProfile(sessionID);

        const locationName = serverProfile.inraid.location.toLowerCase();

        const map: ILocationBase = this.databaseService.getLocation(locationName).base;

        const serverPmcProfile = serverProfile.characters.pmc;
        const serverScavProfile = serverProfile.characters.scav;

        const isDead = this.isPlayerDead(postRaidRequest.exit);
        const preRaidGear = this.inRaidHelper.getPlayerGear(serverPmcProfile.Inventory.items);

        serverProfile.inraid.character = "pmc";

        this.inRaidHelper.updateProfileBaseStats(serverPmcProfile, postRaidRequest, sessionID);
        this.inRaidHelper.updatePmcProfileDataPostRaid(serverPmcProfile, postRaidRequest, sessionID);

        this.mergePmcAndScavEncyclopedias(serverPmcProfile, serverScavProfile);

        // Check for exit status
        this.markOrRemoveFoundInRaidItems(postRaidRequest);

        postRaidRequest.profile.Inventory.items = this.itemHelper.replaceIDs(
            postRaidRequest.profile.Inventory.items,
            postRaidRequest.profile,
            serverPmcProfile.InsuredItems,
            postRaidRequest.profile.Inventory.fastPanel,
        );
        this.inRaidHelper.addUpdToMoneyFromRaid(postRaidRequest.profile.Inventory.items);

        // Purge profile of equipment/container items
        this.inRaidHelper.setInventory(sessionID, serverPmcProfile, postRaidRequest.profile);

        this.healthHelper.saveVitality(serverPmcProfile, postRaidRequest.health, sessionID);

        // Get array of insured items+child that were lost in raid
        const gearToStore = this.insuranceService.getGearLostInRaid(
            serverPmcProfile,
            postRaidRequest,
            preRaidGear,
            sessionID,
            isDead,
        );

        if (gearToStore.length > 0)
        {
            this.insuranceService.storeGearLostInRaidToSendLater(sessionID, gearToStore);
        }

        // Edge case - Handle usec players leaving lighthouse with Rogues angry at them
        if (locationName === "lighthouse" && postRaidRequest.profile.Info.Side.toLowerCase() === "usec")
        {
            // Decrement counter if it exists, don't go below 0
            const remainingCounter = serverPmcProfile?.Stats.Eft.OverallCounters.Items.find((x) =>
                x.Key.includes("UsecRaidRemainKills"),
            );
            if (remainingCounter?.Value > 0)
            {
                remainingCounter.Value--;
            }
        }

        if (isDead)
        {
            this.pmcChatResponseService.sendKillerResponse(
                sessionID,
                serverPmcProfile,
                postRaidRequest.profile.Stats.Eft.Aggressor,
            );
            this.matchBotDetailsCacheService.clearCache();

            this.performPostRaidActionsWhenDead(postRaidRequest, serverPmcProfile, sessionID);
        }
        else
        {
            // Not dead

            // Check for cultist amulets in special slot (only slot it can fit)
            const amuletOnPlayer = serverPmcProfile.Inventory.items
                .filter((item) => item.slotId?.startsWith("SpecialSlot"))
                .find((item) => item._tpl === "64d0b40fbe2eed70e254e2d4");
            if (amuletOnPlayer)
            {
                // No charges left, delete it
                if (amuletOnPlayer.upd.CultistAmulet.NumberOfUsages <= 0)
                {
                    serverPmcProfile.Inventory.items.splice(
                        serverPmcProfile.Inventory.items.indexOf(amuletOnPlayer),
                        1,
                    );
                }
                else if (amuletOnPlayer.upd.CultistAmulet.NumberOfUsages > 0)
                {
                    // Charges left, reduce by 1
                    amuletOnPlayer.upd.CultistAmulet.NumberOfUsages--;
                }
            }
        }

        const victims = postRaidRequest.profile.Stats.Eft.Victims.filter((x) =>
            ["sptbear", "sptusec"].includes(x.Role.toLowerCase()),
        );
        if (victims?.length > 0)
        {
            this.pmcChatResponseService.sendVictimResponse(sessionID, victims, serverPmcProfile);
        }

        this.insuranceService.sendInsuredItems(serverPmcProfile, sessionID, map.Id);
    }

    /**
     * Make changes to PMC profile after they've died in raid,
     * Alter body part hp, handle insurance, delete inventory items, remove carried quest items
     * @param postRaidSaveRequest Post-raid save request
     * @param pmcData Pmc profile
     * @param sessionID Session id
     * @returns Updated profile object
     */
    protected performPostRaidActionsWhenDead(
        postRaidSaveRequest: ISaveProgressRequestData,
        pmcData: IPmcData,
        sessionID: string,
    ): IPmcData
    {
        this.updatePmcHealthPostRaid(postRaidSaveRequest, pmcData);
        this.inRaidHelper.deleteInventory(pmcData, sessionID);

        if (this.inRaidHelper.removeQuestItemsOnDeath())
        {
            // Find and remove the completed condition from profile if player died, otherwise quest is stuck in limbo
            // and quest items cannot be picked up again
            const allQuests = this.questHelper.getQuestsFromDb();
            const activeQuestIdsInProfile = pmcData.Quests.filter(
                (profileQuest) =>
                    ![QuestStatus.AvailableForStart, QuestStatus.Success, QuestStatus.Expired].includes(
                        profileQuest.status,
                    ),
            ).map((x) => x.qid);
            for (const questItem of postRaidSaveRequest.profile.Stats.Eft.CarriedQuestItems)
            {
                // Get quest/find condition for carried quest item
                const questAndFindItemConditionId = this.questHelper.getFindItemConditionByQuestItem(
                    questItem,
                    activeQuestIdsInProfile,
                    allQuests,
                );
                if (Object.keys(questAndFindItemConditionId)?.length > 0)
                {
                    this.profileHelper.removeQuestConditionFromProfile(pmcData, questAndFindItemConditionId);
                }
            }

            // Empty out stored quest items from player inventory
            pmcData.Stats.Eft.CarriedQuestItems = [];
        }

        return pmcData;
    }

    /**
     * Adjust player characters body part hp post-raid
     * @param postRaidSaveRequest post raid data
     * @param pmcData player profile
     */
    protected updatePmcHealthPostRaid(postRaidSaveRequest: ISaveProgressRequestData, pmcData: IPmcData): void
    {
        switch (postRaidSaveRequest.exit)
        {
            case PlayerRaidEndState.LEFT.toString():
                // Naughty pmc left the raid early!
                this.reducePmcHealthToPercent(pmcData, 0.01); // 1%
                break;
            case PlayerRaidEndState.MISSING_IN_ACTION.toString():
                // Didn't reach exit in time
                this.reducePmcHealthToPercent(pmcData, 0.3); // 30%
                break;
            default:
                // Left raid properly, don't make any adjustments
                break;
        }
    }

    /**
     * Reduce body part hp to % of max
     * @param pmcData profile to edit
     * @param multiplier multiplier to apply to max health
     */
    protected reducePmcHealthToPercent(pmcData: IPmcData, multiplier: number): void
    {
        for (const bodyPart of Object.values(pmcData.Health.BodyParts))
        {
            (<BodyPartHealth>bodyPart).Health.Current = (<BodyPartHealth>bodyPart).Health.Maximum * multiplier;
        }
    }

    /**
     * Handle updating the profile post-pscav raid
     * @param sessionID Session id
     * @param postRaidRequest Post-raid data of raid
     */
    protected savePlayerScavProgress(sessionID: string, postRaidRequest: ISaveProgressRequestData): void
    {
        const serverPmcProfile = this.profileHelper.getPmcProfile(sessionID);
        const serverScavProfile = this.profileHelper.getScavProfile(sessionID);
        const isDead = this.isPlayerDead(postRaidRequest.exit);
        const preRaidScavCharismaProgress = this.profileHelper.getSkillFromProfile(
            serverScavProfile,
            SkillTypes.CHARISMA,
        )?.Progress;

        this.saveServer.getProfile(sessionID).inraid.character = "scav";

        this.inRaidHelper.updateProfileBaseStats(serverScavProfile, postRaidRequest, sessionID);
        this.inRaidHelper.updateScavProfileDataPostRaid(serverScavProfile, postRaidRequest, sessionID);

        this.mergePmcAndScavEncyclopedias(serverScavProfile, serverPmcProfile);

        this.updatePmcCharismaSkillPostScavRaid(serverScavProfile, serverPmcProfile, preRaidScavCharismaProgress);

        // Completing scav quests create ConditionCounters, these values need to be transported to the PMC profile
        if (this.profileHasConditionCounters(serverScavProfile))
        {
            // Scav quest progress needs to be moved to pmc so player can see it in menu / hand them in
            this.migrateScavQuestProgressToPmcProfile(serverScavProfile, serverPmcProfile);
        }

        // Change loot FiR status based on exit status
        this.markOrRemoveFoundInRaidItems(postRaidRequest);

        postRaidRequest.profile.Inventory.items = this.itemHelper.replaceIDs(
            postRaidRequest.profile.Inventory.items,
            postRaidRequest.profile,
            serverPmcProfile.InsuredItems,
            postRaidRequest.profile.Inventory.fastPanel,
        );

        // Some items from client profile don't have upd objects when they're single stack items
        this.inRaidHelper.addUpdToMoneyFromRaid(postRaidRequest.profile.Inventory.items);

        // Reset hp/regenerate loot
        this.handlePostRaidPlayerScavProcess(serverScavProfile, sessionID, postRaidRequest, serverPmcProfile, isDead);
    }

    /**
     * merge two dictionaries together
     * Prioritise pair that has true as a value
     * @param primary main dictionary
     * @param secondary Secondary dictionary
     */
    protected mergePmcAndScavEncyclopedias(primary: IPmcData, secondary: IPmcData): void
    {
        function extend(target: { [key: string]: boolean }, source: Record<string, boolean>)
        {
            for (const key in source)
            {
                if (Object.hasOwn(source, key))
                {
                    target[key] = source[key];
                }
            }
            return target;
        }

        const merged = extend(extend({}, primary.Encyclopedia), secondary.Encyclopedia);
        primary.Encyclopedia = merged;
        secondary.Encyclopedia = merged;
    }

    /**
     * Post-scav-raid any charisma increase must be propigated into PMC profile
     * @param postRaidServerScavProfile Scav profile after adjustments made from raid
     * @param postRaidServerPmcProfile Pmc profile after raid
     * @param preRaidScavCharismaProgress charisma progress value pre-raid
     */
    protected updatePmcCharismaSkillPostScavRaid(
        postRaidServerScavProfile: IPmcData,
        postRaidServerPmcProfile: IPmcData,
        preRaidScavCharismaProgress: number,
    ): void
    {
        const postRaidScavCharismaSkill = this.profileHelper.getSkillFromProfile(
            postRaidServerScavProfile,
            SkillTypes.CHARISMA,
        );
        const pmcCharismaSkill = this.profileHelper.getSkillFromProfile(postRaidServerPmcProfile, SkillTypes.CHARISMA);
        const postRaidScavCharismaGain = postRaidScavCharismaSkill?.Progress - preRaidScavCharismaProgress ?? 0;

        // Scav gained charisma, add to pmc
        if (postRaidScavCharismaGain > 0)
        {
            this.logger.debug(`Applying ${postRaidScavCharismaGain} Charisma skill gained in scav raid to PMC profile`);
            pmcCharismaSkill.Progress += postRaidScavCharismaGain;
        }
    }

    /**
     * Does provided profile contain any condition counters
     * @param profile Profile to check for condition counters
     * @returns Profile has condition counters
     */
    protected profileHasConditionCounters(profile: IPmcData): boolean
    {
        if (!profile.TaskConditionCounters)
        {
            return false;
        }

        return Object.keys(profile.TaskConditionCounters).length > 0;
    }

    /**
     * Scav quest progress isnt transferred automatically from scav to pmc, we do this manually
     * @param scavProfile Scav profile with quest progress post-raid
     * @param pmcProfile Server pmc profile to copy scav quest progress into
     */
    protected migrateScavQuestProgressToPmcProfile(scavProfile: IPmcData, pmcProfile: IPmcData): void
    {
        const achievements = this.databaseService.getAchievements();

        for (const quest of scavProfile.Quests)
        {
            const pmcQuest = pmcProfile.Quests.find((x) => x.qid === quest.qid);
            if (!pmcQuest)
            {
                this.logger.warning(this.localisationService.getText("inraid-unable_to_migrate_pmc_quest_not_found_in_profile", quest.qid));
                continue;
            }

            // Status values mismatch or statusTimers counts mismatch
            if (
                quest.status !== pmcQuest.status
                || Object.keys(quest.statusTimers).length !== Object.keys(pmcQuest.statusTimers).length
            )
            {
                this.logger.debug(
                    `Quest: ${quest.qid} found in PMC profile has different status/statustimer. Scav: ${quest.status} vs PMC: ${pmcQuest.status}`,
                );
                pmcQuest.status = quest.status;

                // Copy status timers over + fix bad enum key for each
                pmcQuest.statusTimers = quest.statusTimers;
                for (const statusTimerKey in quest.statusTimers)
                {
                    if (Number.isNaN(Number.parseInt(statusTimerKey)))
                    {
                        quest.statusTimers[QuestStatus[statusTimerKey]] = quest.statusTimers[statusTimerKey];
                        delete quest.statusTimers[statusTimerKey];
                    }
                }
            }
        }

        // Loop over all scav counters and add into pmc profile
        for (const scavCounter of Object.values(scavProfile.TaskConditionCounters))
        {
            // If this is an achievement that isn't for the scav, don't process it
            const achievement = achievements.find((achievement) => achievement.id === scavCounter.sourceId);
            if (achievement && achievement.side !== "Savage")
            {
                continue;
            }

            this.logger.debug(
                `Processing counter: ${scavCounter.id} value: ${scavCounter.value} quest: ${scavCounter.sourceId}`,
            );
            const counterInPmcProfile = pmcProfile.TaskConditionCounters[scavCounter.id];
            if (!counterInPmcProfile)
            {
                // Doesn't exist yet, push it straight in
                pmcProfile.TaskConditionCounters[scavCounter.id] = scavCounter;
                continue;
            }

            this.logger.debug(
                `Counter id: ${scavCounter.id} already exists in pmc profile! with value: ${counterInPmcProfile.value} for quest: ${counterInPmcProfile.id}`,
            );

            // Only adjust counter value if its changed
            if (counterInPmcProfile.value !== scavCounter.value)
            {
                this.logger.debug(`OVERWRITING with values: ${scavCounter.value} quest: ${scavCounter.sourceId}`);
                counterInPmcProfile.value = scavCounter.value;
            }
        }
    }

    /**
     * Is the player dead after a raid - dead is anything other than "survived" / "runner"
     * @param statusOnExit exit value from offraidData object
     * @returns true if dead
     */
    protected isPlayerDead(statusOnExit: PlayerRaidEndState): boolean
    {
        return statusOnExit !== PlayerRaidEndState.SURVIVED && statusOnExit !== PlayerRaidEndState.RUNNER;
    }

    /**
     * Mark inventory items as FiR if player survived raid, otherwise remove FiR from them
     * @param offraidData Save Progress Request
     */
    protected markOrRemoveFoundInRaidItems(offraidData: ISaveProgressRequestData): void
    {
        if (offraidData.exit !== PlayerRaidEndState.SURVIVED)
        {
            // Remove FIR status if the player hasn't survived
            offraidData.profile = this.inRaidHelper.removeSpawnedInSessionPropertyFromItems(offraidData.profile);
        }
    }

    /**
     * Update profile after player completes scav raid
     * @param scavData Scav profile
     * @param sessionID Session id
     * @param offraidData Post-raid save request
     * @param pmcData Pmc profile
     * @param isDead Is player dead
     */
    protected handlePostRaidPlayerScavProcess(
        scavData: IPmcData,
        sessionID: string,
        offraidData: ISaveProgressRequestData,
        pmcData: IPmcData,
        isDead: boolean,
    ): void
    {
        // Update scav profile inventory
        this.inRaidHelper.setInventory(sessionID, scavData, offraidData.profile);

        // Reset scav hp and save to json
        this.healthHelper.resetVitality(sessionID);
        this.saveServer.getProfile(sessionID).characters.scav = scavData;

        // Scav karma
        this.handlePostRaidPlayerScavKarmaChanges(pmcData, offraidData, scavData);

        // Scav died, regen scav loadout and set timer
        if (isDead)
        {
            this.playerScavGenerator.generate(sessionID);
        }

        // Update last played property
        pmcData.Info.LastTimePlayedAsSavage = this.timeUtil.getTimestamp();

        this.saveServer.saveProfile(sessionID);
    }

    /**
     * Update profile with scav karma values based on in-raid actions
     * @param pmcData Pmc profile
     * @param offraidData Post-raid save request
     * @param scavData Scav profile
     */
    protected handlePostRaidPlayerScavKarmaChanges(
        pmcData: IPmcData,
        offraidData: ISaveProgressRequestData,
        scavData: IPmcData,
    ): void
    {
        const fenceId = Traders.FENCE;

        let fenceStanding = Number(offraidData.profile.TradersInfo[fenceId].standing);

        // Client doesn't calcualte car extract rep changes, must be done manually
        // Successful extracts give rep
        if (offraidData.exit === PlayerRaidEndState.SURVIVED)
        {
            fenceStanding += this.inRaidConfig.scavExtractGain;
        }

        // Make standing changes to pmc profile
        pmcData.TradersInfo[fenceId].standing = Math.min(Math.max(fenceStanding, -7), 15); // Ensure it stays between -7 and 15
        this.logger.debug(`New fence standing: ${pmcData.TradersInfo[fenceId].standing}`);

        this.traderHelper.lvlUp(fenceId, pmcData);
        pmcData.TradersInfo[fenceId].loyaltyLevel = Math.max(pmcData.TradersInfo[fenceId].loyaltyLevel, 1);

        // Copy updated fence rep values into scav profile to ensure consistency
        scavData.TradersInfo[fenceId].standing = pmcData.TradersInfo[fenceId].standing;
        scavData.TradersInfo[fenceId].loyaltyLevel = pmcData.TradersInfo[fenceId].loyaltyLevel;
    }

    /**
     * Get the inraid config from configs/inraid.json
     * @returns InRaid Config
     */
    public getInraidConfig(): IInRaidConfig
    {
        return this.inRaidConfig;
    }

    /**
     * Get airdrop config from configs/airdrop.json
     * @returns Airdrop config
     */
    public getAirdropConfig(): IAirdropConfig
    {
        return this.airdropConfig;
    }

    /**
     * Get BTR config from configs/btr.json
     * @returns Airdrop config
     */
    public getBTRConfig(): IBTRConfig
    {
        return this.btrConfig;
    }

    /**
     * Handle singleplayer/traderServices/getTraderServices
     * @returns Trader services data
     */
    public getTraderServices(sessionId: string, traderId: string): ITraderServiceModel[]
    {
        return this.traderServicesService.getTraderServices(sessionId, traderId);
    }

    /**
     * Handle singleplayer/traderServices/itemDelivery
     */
    public itemDelivery(sessionId: string, traderId: string, items: Item[]): void
    {
        const serverProfile = this.saveServer.getProfile(sessionId);
        const pmcData = serverProfile.characters.pmc;

        const dialogueTemplates = this.databaseService.getTrader(traderId).dialogue;
        if (!dialogueTemplates)
        {
            this.logger.error(this.localisationService.getText("inraid-unable_to_deliver_item_no_trader_found", traderId));

            return;
        }
        const messageId = this.randomUtil.getArrayValue(dialogueTemplates.itemsDelivered);
        const messageStoreTime = this.timeUtil.getHoursAsSeconds(this.traderConfig.fence.btrDeliveryExpireHours);

        // Remove any items that were returned by the item delivery, but also insured, from the player's insurance list
        // This is to stop items being duplicated by being returned from both the item delivery, and insurance
        const deliveredItemIds = items.map((x) => x._id);
        pmcData.InsuredItems = pmcData.InsuredItems.filter((x) => !deliveredItemIds.includes(x.itemId));

        // Send the items to the player
        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionId,
            this.traderHelper.getTraderById(traderId),
            MessageType.BTR_ITEMS_DELIVERY,
            messageId,
            items,
            messageStoreTime,
        );
    }

    public getTraitorScavHostileChance(url: string, sessionID: string): number
    {
        return this.inRaidConfig.playerScavHostileChancePercent;
    }

    public getSandboxMaxPatrolValue(url: string, sessionID: string): number
    {
        return this.locationConfig.sandboxMaxPatrolvalue;
    }
}
