import { inject, injectable } from "tsyringe";

import { ApplicationContext } from "@spt-aki/context/ApplicationContext";
import { ContextVariableType } from "@spt-aki/context/ContextVariableType";
import { PlayerScavGenerator } from "@spt-aki/generators/PlayerScavGenerator";
import { HealthHelper } from "@spt-aki/helpers/HealthHelper";
import { InRaidHelper } from "@spt-aki/helpers/InRaidHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { QuestHelper } from "@spt-aki/helpers/QuestHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { ILocationBase } from "@spt-aki/models/eft/common/ILocationBase";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { BodyPartHealth } from "@spt-aki/models/eft/common/tables/IBotBase";
import { IRegisterPlayerRequestData } from "@spt-aki/models/eft/inRaid/IRegisterPlayerRequestData";
import { ISaveProgressRequestData } from "@spt-aki/models/eft/inRaid/ISaveProgressRequestData";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { PlayerRaidEndState } from "@spt-aki/models/enums/PlayerRaidEndState";
import { QuestStatus } from "@spt-aki/models/enums/QuestStatus";
import { Traders } from "@spt-aki/models/enums/Traders";
import { IAirdropConfig } from "@spt-aki/models/spt/config/IAirdropConfig";
import { IInRaidConfig } from "@spt-aki/models/spt/config/IInRaidConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { InsuranceService } from "@spt-aki/services/InsuranceService";
import { MatchBotDetailsCacheService } from "@spt-aki/services/MatchBotDetailsCacheService";
import { PmcChatResponseService } from "@spt-aki/services/PmcChatResponseService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

/**
 * Logic for handling In Raid callbacks
 */
@injectable()
export class InraidController
{
    protected airdropConfig: IAirdropConfig;
    protected inraidConfig: IInRaidConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("PmcChatResponseService") protected pmcChatResponseService: PmcChatResponseService,
        @inject("MatchBotDetailsCacheService") protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
        @inject("QuestHelper") protected questHelper: QuestHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PlayerScavGenerator") protected playerScavGenerator: PlayerScavGenerator,
        @inject("HealthHelper") protected healthHelper: HealthHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("InsuranceService") protected insuranceService: InsuranceService,
        @inject("InRaidHelper") protected inRaidHelper: InRaidHelper,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.airdropConfig = this.configServer.getConfig(ConfigTypes.AIRDROP);
        this.inraidConfig = this.configServer.getConfig(ConfigTypes.IN_RAID);
    }

    /**
     * Save locationId to active profiles inraid object AND app context
     * @param sessionID Session id
     * @param info Register player request
     */
    public addPlayer(sessionID: string, info: IRegisterPlayerRequestData): void
    {
        this.applicationContext.addValue(ContextVariableType.REGISTER_PLAYER_REQUEST, info);
        this.saveServer.getProfile(sessionID).inraid.location = info.locationId;
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

        if (!this.inraidConfig.save.loot)
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

        const map: ILocationBase = this.databaseServer.getTables().locations[locationName].base;
        const mapHasInsuranceEnabled = map.Insurance;

        let serverPmcData = serverProfile.characters.pmc;
        const isDead = this.isPlayerDead(postRaidRequest.exit);
        const preRaidGear = this.inRaidHelper.getPlayerGear(serverPmcData.Inventory.items);

        serverProfile.inraid.character = "pmc";

        serverPmcData = this.inRaidHelper.updateProfileBaseStats(serverPmcData, postRaidRequest, sessionID);

        // Check for exit status
        this.markOrRemoveFoundInRaidItems(postRaidRequest);

        postRaidRequest.profile.Inventory.items = this.itemHelper.replaceIDs(postRaidRequest.profile, postRaidRequest.profile.Inventory.items, serverPmcData.InsuredItems, postRaidRequest.profile.Inventory.fastPanel);
        this.inRaidHelper.addUpdToMoneyFromRaid(postRaidRequest.profile.Inventory.items);

        // Purge profile of equipment/container items
        serverPmcData = this.inRaidHelper.setInventory(sessionID, serverPmcData, postRaidRequest.profile);

        this.healthHelper.saveVitality(serverPmcData, postRaidRequest.health, sessionID);

        // Remove inventory if player died and send insurance items
        if (mapHasInsuranceEnabled)
        {
            this.insuranceService.storeLostGear(serverPmcData, postRaidRequest, preRaidGear, sessionID, isDead);
        }
        else
        {
            this.insuranceService.sendLostInsuranceMessage(sessionID, locationName);
        }

        // Edge case - Handle usec players leaving lighthouse with Rogues angry at them
        if (locationName === "lighthouse" && postRaidRequest.profile.Info.Side.toLowerCase() === "usec")
        {
            // Decrement counter if it exists, don't go below 0
            const remainingCounter = serverPmcData?.Stats.Eft.OverallCounters.Items.find(x => x.Key.includes("UsecRaidRemainKills"));
            if (remainingCounter?.Value > 0)
            {
                remainingCounter.Value --;
            }
        }

        if (isDead)
        {
            this.pmcChatResponseService.sendKillerResponse(sessionID, serverPmcData, postRaidRequest.profile.Stats.Eft.Aggressor);
            this.matchBotDetailsCacheService.clearCache();

            serverPmcData = this.performPostRaidActionsWhenDead(postRaidRequest, serverPmcData, sessionID);
        }

        const victims = postRaidRequest.profile.Stats.Eft.Victims.filter(x => ["sptbear", "sptusec"].includes(x.Role.toLowerCase()));
        if (victims?.length > 0)
        {
            this.pmcChatResponseService.sendVictimResponse(sessionID, victims, serverPmcData);
        }

        if (mapHasInsuranceEnabled)
        {
            this.insuranceService.sendInsuredItems(serverPmcData, sessionID, map.Id);
        }
    }

    /**
     * Make changes to pmc profile after they've died in raid,
     * Alter bodypart hp, handle insurance, delete inventory items, remove carried quest items
     * @param postRaidSaveRequest Post-raid save request 
     * @param pmcData Pmc profile
     * @param sessionID Session id
     * @returns Updated profile object
     */
    protected performPostRaidActionsWhenDead(postRaidSaveRequest: ISaveProgressRequestData, pmcData: IPmcData, sessionID: string): IPmcData
    {
        this.updatePmcHealthPostRaid(postRaidSaveRequest, pmcData);
        this.inRaidHelper.deleteInventory(pmcData, sessionID);

        if (this.inRaidHelper.removeQuestItemsOnDeath())
        {
            // Find and remove the completed condition from profile if player died, otherwise quest is stuck in limbo and quest items cannot be picked up again
            const allQuests = this.questHelper.getQuestsFromDb();
            const activeQuestIdsInProfile = pmcData.Quests.filter(x => ![QuestStatus.AvailableForStart, QuestStatus.Success, QuestStatus.Expired].includes(x.status)).map(x => x.qid);
            for (const questItem of postRaidSaveRequest.profile.Stats.Eft.CarriedQuestItems)
            {
                // Get quest/find condition for carried quest item
                const questAndFindItemConditionId = this.questHelper.getFindItemConditionByQuestItem(questItem, activeQuestIdsInProfile, allQuests);
                if (questAndFindItemConditionId)
                {
                    this.profileHelper.removeCompletedQuestConditionFromProfile(pmcData, questAndFindItemConditionId);
                }
            }

            // Empty out stored quest items from player inventory
            pmcData.Stats.Eft.CarriedQuestItems = [];
        }

        return pmcData;
    }

    /**
     * Adjust player characters bodypart hp post-raid
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
     * @param multipler multipler to apply to max health
     */
    protected reducePmcHealthToPercent(pmcData: IPmcData, multipler: number): void
    {
        for (const bodyPart of Object.values(pmcData.Health.BodyParts))
        {
            (<BodyPartHealth>bodyPart).Health.Current = (<BodyPartHealth>bodyPart).Health.Maximum * multipler;
        }
    }

    /**
     * Handle updating the profile post-pscav raid
     * @param sessionID Session id
     * @param postRaidRequest Post-raid data of raid
     */
    protected savePlayerScavProgress(sessionID: string, postRaidRequest: ISaveProgressRequestData): void
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        let scavData = this.profileHelper.getScavProfile(sessionID);
        const isDead = this.isPlayerDead(postRaidRequest.exit);

        this.saveServer.getProfile(sessionID).inraid.character = "scav";

        scavData = this.inRaidHelper.updateProfileBaseStats(scavData, postRaidRequest, sessionID);

        // Completing scav quests create ConditionCounters, these values need to be transported to the PMC profile
        if (this.profileHasConditionCounters(scavData))
        {
            // Scav quest progress needs to be moved to pmc so player can see it in menu / hand them in
            this.migrateScavQuestProgressToPmcProfile(scavData, pmcData);
        }

        // Check for exit status
        this.markOrRemoveFoundInRaidItems(postRaidRequest);

        postRaidRequest.profile.Inventory.items = this.itemHelper.replaceIDs(postRaidRequest.profile, postRaidRequest.profile.Inventory.items, pmcData.InsuredItems, postRaidRequest.profile.Inventory.fastPanel);
        this.inRaidHelper.addUpdToMoneyFromRaid(postRaidRequest.profile.Inventory.items);

        this.handlePostRaidPlayerScavProcess(scavData, sessionID, postRaidRequest, pmcData, isDead);
    }

    /**
     * Does provided profile contain any condition counters
     * @param profile Profile to check for condition counters
     * @returns 
     */
    protected profileHasConditionCounters(profile: IPmcData): boolean
    {
        if (!profile.ConditionCounters.Counters)
        {
            return false;
        }

        return profile.ConditionCounters.Counters.length > 0;
    }

    protected migrateScavQuestProgressToPmcProfile(scavProfile: IPmcData, pmcProfile: IPmcData): void
    {
        for (const quest of scavProfile.Quests)
        {
            const pmcQuest = pmcProfile.Quests.find(x => x.qid === quest.qid);
            if (!pmcQuest)
            {
                this.logger.warning(`No PMC quest found for ID: ${quest.qid}`);
                continue;
            }

            // Post-raid status is enum word e.g. `Started` but pmc quest status is number e.g. 2
            // Status values mismatch or statusTimers counts mismatch
            if (quest.status !== <any>QuestStatus[pmcQuest.status] || quest.statusTimers.length !== pmcQuest.statusTimers.length)
            {
                this.logger.warning(`Quest: ${quest.qid} found in PMC profile has different status/statustimer. Scav: ${quest.status} vs PMC: ${pmcQuest.status}`);
                pmcQuest.status = <any>QuestStatus[quest.status];

                // Copy status timers over + fix bad enum key for each
                pmcQuest.statusTimers = quest.statusTimers;
                for (const statusTimerKey in quest.statusTimers)
                {
                    if (!Number(statusTimerKey))
                    {
                        quest.statusTimers[QuestStatus[statusTimerKey]] = quest.statusTimers[statusTimerKey];
                        delete quest.statusTimers[statusTimerKey];
                    }
                }
            }
        }

        // Loop over all scav counters and add into pmc profile
        for (const scavCounter of scavProfile.ConditionCounters.Counters)
        {
            this.logger.warning(`Processing counter: ${scavCounter.id} value:${scavCounter.value} quest:${scavCounter.qid}`);
            const counterInPmcProfile = pmcProfile.ConditionCounters.Counters.find(x => x.id === scavCounter.id);
            if (!counterInPmcProfile)
            {
                // Doesn't exist yet, push it straight in
                pmcProfile.ConditionCounters.Counters.push(scavCounter);
                
                continue;
            }

            this.logger.warning(`Counter id: ${scavCounter.id} already exists in pmc profile! with value: ${counterInPmcProfile.value} for quest: ${counterInPmcProfile.qid}`);

            // Only adjust counter value if its changed
            if (counterInPmcProfile.value !== scavCounter.value)
            {
                this.logger.warning(`OVERWRITING with values: ${scavCounter.value} quest: ${scavCounter.qid}`);
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
        return (statusOnExit !== PlayerRaidEndState.SURVIVED && statusOnExit !== PlayerRaidEndState.RUNNER);
    }

    /**
     * Mark inventory items as FiR if player survived raid, otherwise remove FiR from them
     * @param offraidData Save Progress Request
     */
    protected markOrRemoveFoundInRaidItems(offraidData: ISaveProgressRequestData): void
    {
        if (offraidData.exit !== PlayerRaidEndState.SURVIVED)
        {
            // Remove FIR status if the player havn't survived
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
    protected handlePostRaidPlayerScavProcess(scavData: IPmcData, sessionID: string, offraidData: ISaveProgressRequestData, pmcData: IPmcData, isDead: boolean): void
    {
        // Update scav profile inventory
        scavData = this.inRaidHelper.setInventory(sessionID, scavData, offraidData.profile);

        // Reset scav hp and save to json
        this.healthHelper.resetVitality(sessionID);
        this.saveServer.getProfile(sessionID).characters.scav = scavData;

        // Scav karma
        this.handlePostRaidPlayerScavKarmaChanges(pmcData, offraidData);

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
     */
    protected handlePostRaidPlayerScavKarmaChanges(pmcData: IPmcData, offraidData: ISaveProgressRequestData): void
    {
        const fenceId = Traders.FENCE;

        let fenceStanding = Number(pmcData.TradersInfo[fenceId].standing);
        this.logger.debug(`Old fence standing: ${fenceStanding}`);
        fenceStanding = this.inRaidHelper.calculateFenceStandingChangeFromKills(fenceStanding, offraidData.profile.Stats.Eft.Victims);

        // Successful extract with scav adds 0.01 standing
        if (offraidData.exit === PlayerRaidEndState.SURVIVED)
        {
            fenceStanding += this.inraidConfig.scavExtractGain;
        }
        
        // Make standing changes to pmc profile
        pmcData.TradersInfo[fenceId].standing = Math.min(Math.max(fenceStanding, -7), 15); // Ensure it stays between -7 and 15
        this.logger.debug(`New fence standing: ${pmcData.TradersInfo[fenceId].standing}`);
        this.traderHelper.lvlUp(fenceId, pmcData);
        pmcData.TradersInfo[fenceId].loyaltyLevel = Math.max(pmcData.TradersInfo[fenceId].loyaltyLevel, 1);
    }

    /**
     * Get the inraid config from configs/inraid.json
     * @returns InRaid Config
     */
    public getInraidConfig(): IInRaidConfig
    {
        return this.inraidConfig;
    }

    /**
     * Get airdrop config from configs/airdrop.json
     * @returns Airdrop config
     */
    public getAirdropConfig(): IAirdropConfig
    {
        return this.airdropConfig;
    }
}