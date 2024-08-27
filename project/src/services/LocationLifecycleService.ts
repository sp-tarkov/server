import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { QuestController } from "@spt/controllers/QuestController";
import { LocationLootGenerator } from "@spt/generators/LocationLootGenerator";
import { LootGenerator } from "@spt/generators/LootGenerator";
import { PlayerScavGenerator } from "@spt/generators/PlayerScavGenerator";
import { HealthHelper } from "@spt/helpers/HealthHelper";
import { InRaidHelper } from "@spt/helpers/InRaidHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { ILocationBase } from "@spt/models/eft/common/ILocationBase";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { Common, TraderInfo } from "@spt/models/eft/common/tables/IBotBase";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { IEndLocalRaidRequestData, IEndRaidResult } from "@spt/models/eft/match/IEndLocalRaidRequestData";
import { IStartLocalRaidRequestData } from "@spt/models/eft/match/IStartLocalRaidRequestData";
import { IStartLocalRaidResponseData } from "@spt/models/eft/match/IStartLocalRaidResponseData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { MessageType } from "@spt/models/enums/MessageType";
import { Traders } from "@spt/models/enums/Traders";
import { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import { IInRaidConfig } from "@spt/models/spt/config/IInRaidConfig";
import { ILocationConfig } from "@spt/models/spt/config/ILocationConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ITraderConfig } from "@spt/models/spt/config/ITraderConfig";
import { IRaidChanges } from "@spt/models/spt/location/IRaidChanges";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { BotGenerationCacheService } from "@spt/services/BotGenerationCacheService";
import { BotLootCacheService } from "@spt/services/BotLootCacheService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { InsuranceService } from "@spt/services/InsuranceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { MailSendService } from "@spt/services/MailSendService";
import { MatchBotDetailsCacheService } from "@spt/services/MatchBotDetailsCacheService";
import { PmcChatResponseService } from "@spt/services/PmcChatResponseService";
import { RaidTimeAdjustmentService } from "@spt/services/RaidTimeAdjustmentService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class LocationLifecycleService {
    protected inRaidConfig: IInRaidConfig;
    protected traderConfig: ITraderConfig;
    protected ragfairConfig: IRagfairConfig;
    protected hideoutConfig: IHideoutConfig;
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("InRaidHelper") protected inRaidHelper: InRaidHelper,
        @inject("HealthHelper") protected healthHelper: HealthHelper,
        @inject("MatchBotDetailsCacheService") protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
        @inject("PmcChatResponseService") protected pmcChatResponseService: PmcChatResponseService,
        @inject("PlayerScavGenerator") protected playerScavGenerator: PlayerScavGenerator,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("InsuranceService") protected insuranceService: InsuranceService,
        @inject("BotLootCacheService") protected botLootCacheService: BotLootCacheService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("BotGenerationCacheService") protected botGenerationCacheService: BotGenerationCacheService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("RaidTimeAdjustmentService") protected raidTimeAdjustmentService: RaidTimeAdjustmentService,
        @inject("LootGenerator") protected lootGenerator: LootGenerator,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("LocationLootGenerator") protected locationLootGenerator: LocationLootGenerator,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("QuestController") protected questController: QuestController,
        @inject("QuestHelper") protected questHelper: QuestHelper,
    ) {
        this.inRaidConfig = this.configServer.getConfig(ConfigTypes.IN_RAID);
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    public startLocalRaid(sessionId: string, request: IStartLocalRaidRequestData): IStartLocalRaidResponseData {
        const playerProfile = this.profileHelper.getPmcProfile(sessionId);

        const result: IStartLocalRaidResponseData = {
            serverId: `${request.location}.${request.playerSide}.${this.timeUtil.getTimestamp()}`, // TODO - does this need to be more verbose - investigate client?
            serverSettings: this.databaseService.getLocationServices(), // TODO - is this per map or global?
            profile: { insuredItems: playerProfile.InsuredItems },
            locationLoot: this.generateLocationAndLoot(request.location),
        };

        // Clear bot cache ready for a fresh raid
        this.botGenerationCacheService.clearStoredBots();

        return result;
    }

    /**
     * Generate a maps base location and loot
     * @param name Map name
     * @returns ILocationBase
     */
    protected generateLocationAndLoot(name: string): ILocationBase {
        const location = this.databaseService.getLocation(name);
        const locationBaseClone = this.cloner.clone(location.base);

        // Update datetime property to now
        locationBaseClone.UnixDateTime = this.timeUtil.getTimestamp();

        // Don't generate loot for hideout
        if (name === "hideout") {
            return locationBaseClone;
        }

        // Check for a loot multipler adjustment in app context and apply if one is found
        let locationConfigClone: ILocationConfig;
        const raidAdjustments = this.applicationContext
            .getLatestValue(ContextVariableType.RAID_ADJUSTMENTS)
            ?.getValue<IRaidChanges>();
        if (raidAdjustments) {
            locationConfigClone = this.cloner.clone(this.locationConfig); // Clone values so they can be used to reset originals later
            this.raidTimeAdjustmentService.makeAdjustmentsToMap(raidAdjustments, locationBaseClone);
        }

        const staticAmmoDist = this.cloner.clone(location.staticAmmo);

        // Create containers and add loot to them
        const staticLoot = this.locationLootGenerator.generateStaticContainers(locationBaseClone, staticAmmoDist);
        locationBaseClone.Loot.push(...staticLoot);

        // Add dynamic loot to output loot
        const dynamicLootDistClone = this.cloner.clone(location.looseLoot);
        const dynamicSpawnPoints = this.locationLootGenerator.generateDynamicLoot(
            dynamicLootDistClone,
            staticAmmoDist,
            name,
        );

        for (const spawnPoint of dynamicSpawnPoints) {
            locationBaseClone.Loot.push(spawnPoint);
        }

        // Done generating, log results
        this.logger.success(
            this.localisationService.getText("location-dynamic_items_spawned_success", dynamicSpawnPoints.length),
        );
        this.logger.success(this.localisationService.getText("location-generated_success", name));

        // Reset loot multipliers back to original values
        if (raidAdjustments) {
            this.logger.debug("Resetting loot multipliers back to their original values");
            this.locationConfig.staticLootMultiplier = locationConfigClone.staticLootMultiplier;
            this.locationConfig.looseLootMultiplier = locationConfigClone.looseLootMultiplier;

            this.applicationContext.clearValues(ContextVariableType.RAID_ADJUSTMENTS);
        }

        return locationBaseClone;
    }

    public endLocalRaid(sessionId: string, request: IEndLocalRaidRequestData): void {
        // Clear bot loot cache
        this.botLootCacheService.clearCache();

        const fullProfile = this.profileHelper.getFullProfile(sessionId);
        const pmcProfile = fullProfile.characters.pmc;
        const scavProfile = fullProfile.characters.scav;
        const postRaidProfile = request.results.profile;

        // TODO:
        // Rep gain/loss?
        // Quest status?
        // stats/eft/aggressor - weird values (EFT.IProfileDataContainer.Nickname)

        this.logger.debug(`Raid outcome: ${request.results.result}`);

        // Set flea interval time to out-of-raid value
        this.ragfairConfig.runIntervalSeconds = this.ragfairConfig.runIntervalValues.outOfRaid;
        this.hideoutConfig.runIntervalSeconds = this.hideoutConfig.runIntervalValues.outOfRaid;

        // ServerId has various info stored in it, delimited by a period
        const serverDetails = request.serverId.split(".");

        const locationName = serverDetails[0].toLowerCase();
        const isPmc = serverDetails[1].toLowerCase() === "pmc";
        const mapBase = this.databaseService.getLocation(locationName).base;
        const isDead = this.isPlayerDead(request.results);
        const isSurvived = this.isPlayerSurvived(request.results);

        if (!isPmc) {
            this.handlePostRaidPlayerScav(sessionId, pmcProfile, scavProfile, isDead, request);

            return;
        }

        this.handlePostRaidPmc(
            sessionId,
            pmcProfile,
            scavProfile,
            postRaidProfile,
            isDead,
            isSurvived,
            request,
            locationName,
        );

        // Handle car extracts
        if (this.extractWasViaCar(request.results.exitName)) {
            this.handleCarExtract(request.results.exitName, pmcProfile, sessionId);
        }

        // Handle coop exit
        if (
            request.results.exitName &&
            this.extractTakenWasCoop(request.results.exitName) &&
            this.traderConfig.fence.coopExtractGift.sendGift
        ) {
            this.handleCoopExtract(sessionId, pmcProfile, request.results.exitName);
            this.sendCoopTakenFenceMessage(sessionId);
        }
    }

    /**
     * Was extract by car
     * @param extractName name of extract
     * @returns True if extract was by car
     */
    protected extractWasViaCar(extractName: string): boolean {
        // exit name is undefined on death
        if (!extractName) {
            return false;
        }

        if (extractName.toLowerCase().includes("v-ex")) {
            return true;
        }

        return this.inRaidConfig.carExtracts.includes(extractName.trim());
    }

    /**
     * Handle when a player extracts using a car - Add rep to fence
     * @param extractName name of the extract used
     * @param pmcData Player profile
     * @param sessionId Session id
     */
    protected handleCarExtract(extractName: string, pmcData: IPmcData, sessionId: string): void {
        // Ensure key exists for extract
        if (!(extractName in pmcData.CarExtractCounts)) {
            pmcData.CarExtractCounts[extractName] = 0;
        }

        // Increment extract count value
        pmcData.CarExtractCounts[extractName] += 1;

        // Not exact replica of Live behaviour
        // Simplified for now, no real reason to do the whole (unconfirmed) extra 0.01 standing per day regeneration mechanic
        const newFenceStanding = this.getFenceStandingAfterExtract(
            pmcData,
            this.inRaidConfig.carExtractBaseStandingGain,
            pmcData.CarExtractCounts[extractName],
        );
        const fenceId: string = Traders.FENCE;
        pmcData.TradersInfo[fenceId].standing = newFenceStanding;

        // Check if new standing has leveled up trader
        this.traderHelper.lvlUp(fenceId, pmcData);
        pmcData.TradersInfo[fenceId].loyaltyLevel = Math.max(pmcData.TradersInfo[fenceId].loyaltyLevel, 1);

        this.logger.debug(
            `Car extract: ${extractName} used, total times taken: ${pmcData.CarExtractCounts[extractName]}`,
        );

        // Copy updated fence rep values into scav profile to ensure consistency
        const scavData: IPmcData = this.profileHelper.getScavProfile(sessionId);
        scavData.TradersInfo[fenceId].standing = pmcData.TradersInfo[fenceId].standing;
        scavData.TradersInfo[fenceId].loyaltyLevel = pmcData.TradersInfo[fenceId].loyaltyLevel;
    }

    /**
     * Handle when a player extracts using a coop extract - add rep to fence
     * @param sessionId Session/player id
     * @param pmcData Profile
     * @param extractName Name of extract taken
     */
    protected handleCoopExtract(sessionId: string, pmcData: IPmcData, extractName: string): void {
        pmcData.CoopExtractCounts ||= {};

        // Ensure key exists for extract
        if (!(extractName in pmcData.CoopExtractCounts)) {
            pmcData.CoopExtractCounts[extractName] = 0;
        }

        // Increment extract count value
        pmcData.CoopExtractCounts[extractName] += 1;

        // Get new fence standing value
        const newFenceStanding = this.getFenceStandingAfterExtract(
            pmcData,
            this.inRaidConfig.coopExtractBaseStandingGain,
            pmcData.CoopExtractCounts[extractName],
        );
        const fenceId: string = Traders.FENCE;
        pmcData.TradersInfo[fenceId].standing = newFenceStanding;

        // Check if new standing has leveled up trader
        this.traderHelper.lvlUp(fenceId, pmcData);
        pmcData.TradersInfo[fenceId].loyaltyLevel = Math.max(pmcData.TradersInfo[fenceId].loyaltyLevel, 1);

        // Copy updated fence rep values into scav profile to ensure consistency
        const scavData: IPmcData = this.profileHelper.getScavProfile(sessionId);
        scavData.TradersInfo[fenceId].standing = pmcData.TradersInfo[fenceId].standing;
        scavData.TradersInfo[fenceId].loyaltyLevel = pmcData.TradersInfo[fenceId].loyaltyLevel;
    }

    /**
     * Get the fence rep gain from using a car or coop extract
     * @param pmcData Profile
     * @param baseGain amount gained for the first extract
     * @param extractCount Number of times extract was taken
     * @returns Fence standing after taking extract
     */
    protected getFenceStandingAfterExtract(pmcData: IPmcData, baseGain: number, extractCount: number): number {
        // Get current standing
        const fenceId: string = Traders.FENCE;
        let fenceStanding = Number(pmcData.TradersInfo[fenceId].standing);

        // get standing after taking extract x times, x.xx format, gain from extract can be no smaller than 0.01
        fenceStanding += Math.max(baseGain / extractCount, 0.01);

        // Ensure fence loyalty level is not above/below the range -7 to 15
        const newFenceStanding = Math.min(Math.max(fenceStanding, -7), 15);
        this.logger.debug(`Old vs new fence standing: ${pmcData.TradersInfo[fenceId].standing}, ${newFenceStanding}`);

        return Number(newFenceStanding.toFixed(2));
    }

    protected sendCoopTakenFenceMessage(sessionId: string): void {
        // Generate reward for taking coop extract
        const loot = this.lootGenerator.createRandomLoot(this.traderConfig.fence.coopExtractGift);
        const mailableLoot: Item[] = [];

        const parentId = this.hashUtil.generate();
        for (const item of loot) {
            item.parentId = parentId;
            mailableLoot.push(item);
        }

        // Send message from fence giving player reward generated above
        this.mailSendService.sendLocalisedNpcMessageToPlayer(
            sessionId,
            this.traderHelper.getTraderById(Traders.FENCE),
            MessageType.MESSAGE_WITH_ITEMS,
            this.randomUtil.getArrayValue(this.traderConfig.fence.coopExtractGift.messageLocaleIds),
            mailableLoot,
            this.timeUtil.getHoursAsSeconds(this.traderConfig.fence.coopExtractGift.giftExpiryHours),
        );
    }

    /**
     * Did player take a COOP extract
     * @param extractName Name of extract player took
     * @returns True if coop extract
     */
    protected extractTakenWasCoop(extractName: string): boolean {
        // No extract name, not a coop extract
        if (!extractName) {
            return false;
        }

        return this.inRaidConfig.coopExtracts.includes(extractName.trim());
    }

    protected handlePostRaidPlayerScav(
        sessionId: string,
        pmcProfile: IPmcData,
        scavProfile: IPmcData,
        isDead: boolean,
        request: IEndLocalRaidRequestData,
    ): void {
        // Scav died, regen scav loadout and reset timer
        if (isDead) {
            this.playerScavGenerator.generate(sessionId);
        }

        scavProfile.Info.Level = request.results.profile.Info.Level;
        scavProfile.Skills = request.results.profile.Skills;
        scavProfile.Stats.Eft = request.results.profile.Stats.Eft;
        scavProfile.Encyclopedia = request.results.profile.Encyclopedia;
        scavProfile.TaskConditionCounters = request.results.profile.TaskConditionCounters;
        scavProfile.SurvivorClass = request.results.profile.SurvivorClass;
        // Scavs dont have achievements, but copy anyway
        scavProfile.Achievements = request.results.profile.Achievements;

        scavProfile.Info.Experience = request.results.profile.Info.Experience;

        // Must occur after experience is set and stats copied over
        scavProfile.Stats.Eft.TotalSessionExperience = 0;

        this.applyTraderStandingAdjustments(scavProfile.TradersInfo, request.results.profile.TradersInfo);

        const fenceId = Traders.FENCE;

        // Clamp fence standing
        const currentFenceStanding = request.results.profile.TradersInfo[fenceId].standing;
        pmcProfile.TradersInfo[fenceId].standing = Math.min(Math.max(currentFenceStanding, -7), 15); // Ensure it stays between -7 and 15

        // Copy fence values to PMC
        pmcProfile.TradersInfo[fenceId] = scavProfile.TradersInfo[fenceId];

        // Must occur after encyclopedia updated
        this.mergePmcAndScavEncyclopedias(scavProfile, pmcProfile);

        // Remove skill fatigue values
        this.resetSkillPointsEarnedDuringRaid(scavProfile.Skills.Common);

        // Update last played property
        pmcProfile.Info.LastTimePlayedAsSavage = this.timeUtil.getTimestamp();

        // Force a profile save
        this.saveServer.saveProfile(sessionId);
    }

    protected handlePostRaidPmc(
        sessionId: string,
        pmcProfile: IPmcData,
        scavProfile: IPmcData,
        postRaidProfile: IPmcData,
        isDead: boolean,
        isSurvived: boolean,
        request: IEndLocalRaidRequestData,
        locationName: string,
    ): void {
        // Update inventory
        this.inRaidHelper.setInventory(sessionId, pmcProfile, postRaidProfile, isSurvived);

        pmcProfile.Info.Level = postRaidProfile.Info.Level;
        pmcProfile.Skills = postRaidProfile.Skills;
        pmcProfile.Stats.Eft = postRaidProfile.Stats.Eft;
        pmcProfile.Encyclopedia = postRaidProfile.Encyclopedia;
        pmcProfile.TaskConditionCounters = postRaidProfile.TaskConditionCounters;
        pmcProfile.SurvivorClass = postRaidProfile.SurvivorClass;
        pmcProfile.Achievements = postRaidProfile.Achievements;
        pmcProfile.Quests = postRaidProfile.Quests;

        pmcProfile.Info.Experience = postRaidProfile.Info.Experience;

        this.applyTraderStandingAdjustments(pmcProfile.TradersInfo, postRaidProfile.TradersInfo);

        // Must occur after experience is set and stats copied over
        pmcProfile.Stats.Eft.TotalSessionExperience = 0;

        const fenceId = Traders.FENCE;

        // Clamp fence standing
        const currentFenceStanding = postRaidProfile.TradersInfo[fenceId].standing;
        pmcProfile.TradersInfo[fenceId].standing = Math.min(Math.max(currentFenceStanding, -7), 15); // Ensure it stays between -7 and 15

        // Copy fence values to Scav
        scavProfile.TradersInfo[fenceId] = pmcProfile.TradersInfo[fenceId];

        // Must occur after encyclopedia updated
        this.mergePmcAndScavEncyclopedias(pmcProfile, scavProfile);

        // Remove skill fatigue values
        this.resetSkillPointsEarnedDuringRaid(pmcProfile.Skills.Common);

        // Handle temp, hydration, limb hp/effects
        this.healthHelper.updateProfileHealthPostRaid(pmcProfile, postRaidProfile.Health, sessionId, isDead);

        if (isDead) {
            // Remove pickup quest conditions so those quest items can spawn again.
            if (postRaidProfile.Stats.Eft.CarriedQuestItems) {
                const pmcQuests = this.questController.getClientQuests(sessionId);
                const pmcQuestIds = pmcQuests.map((a) => a._id);
                for (const item of postRaidProfile.Stats.Eft.CarriedQuestItems) {
                    const failedQuestId = this.questHelper.getFindItemConditionByQuestItem(
                        item,
                        pmcQuestIds,
                        pmcQuests,
                    );
                    this.profileHelper.removeQuestConditionFromProfile(pmcProfile, failedQuestId);
                }
            }

            this.pmcChatResponseService.sendKillerResponse(sessionId, pmcProfile, postRaidProfile.Stats.Eft.Aggressor);

            this.inRaidHelper.deleteInventory(pmcProfile, sessionId);

            this.inRaidHelper.removeFiRStatusFromItemsInContainer(sessionId, pmcProfile, "SecuredContainer");
        }

        // Must occur AFTER killer messages have been sent
        this.matchBotDetailsCacheService.clearCache();

        const victims = postRaidProfile.Stats.Eft.Victims.filter((victim) =>
            ["pmcbear", "pmcusec"].includes(victim.Role.toLowerCase()),
        );
        if (victims?.length > 0) {
            // Player killed PMCs, send some responses to them
            this.pmcChatResponseService.sendVictimResponse(sessionId, victims, pmcProfile);
        }

        // Handle items transferred via BTR to player
        this.handleBTRItemTransferEvent(sessionId, request);

        this.handleInsuredItemLostEvent(sessionId, pmcProfile, request, locationName);
    }

    /**
     * Adjust server trader settings if they differ from data sent by client
     * @param tradersServerProfile Server
     * @param tradersClientProfile Client
     */
    protected applyTraderStandingAdjustments(
        tradersServerProfile: Record<string, TraderInfo>,
        tradersClientProfile: Record<string, TraderInfo>,
    ): void {
        for (const traderId in tradersClientProfile) {
            const serverProfileTrader = tradersServerProfile[traderId];
            const clientProfileTrader = tradersClientProfile[traderId];
            if (!(serverProfileTrader && clientProfileTrader)) {
                continue;
            }

            if (clientProfileTrader.standing !== serverProfileTrader.standing) {
                // Difference found, update server profile with values from client profile
                tradersServerProfile[traderId].standing = clientProfileTrader.standing;
            }
        }
    }

    /**
     * Check if player used BTR item sending service and send items to player via mail if found
     * @param sessionId Session id
     * @param request End raid request
     */
    protected handleBTRItemTransferEvent(sessionId: string, request: IEndLocalRaidRequestData): void {
        const btrKey = "BTRTransferStash";
        const btrContainerAndItems = request.transferItems[btrKey] ?? [];
        if (btrContainerAndItems.length > 0) {
            const itemsToSend = btrContainerAndItems.filter((item) => item._id !== btrKey);
            this.btrItemDelivery(sessionId, Traders.BTR, itemsToSend);
        }
    }

    protected btrItemDelivery(sessionId: string, traderId: string, items: Item[]): void {
        const serverProfile = this.saveServer.getProfile(sessionId);
        const pmcData = serverProfile.characters.pmc;

        const dialogueTemplates = this.databaseService.getTrader(traderId).dialogue;
        if (!dialogueTemplates) {
            this.logger.error(
                this.localisationService.getText("inraid-unable_to_deliver_item_no_trader_found", traderId),
            );

            return;
        }
        const messageId = this.randomUtil.getArrayValue(dialogueTemplates.itemsDelivered);
        const messageStoreTime = this.timeUtil.getHoursAsSeconds(this.traderConfig.fence.btrDeliveryExpireHours);

        // Remove any items that were returned by the item delivery, but also insured, from the player's insurance list
        // This is to stop items being duplicated by being returned from both item delivery and insurance
        const deliveredItemIds = items.map((item) => item._id);
        pmcData.InsuredItems = pmcData.InsuredItems.filter(
            (insuredItem) => !deliveredItemIds.includes(insuredItem.itemId),
        );

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

    protected handleInsuredItemLostEvent(
        sessionId: string,
        preRaidPmcProfile: IPmcData,
        request: IEndLocalRaidRequestData,
        locationName: string,
    ) {
        if (request.lostInsuredItems?.length > 0) {
            const mappedItems = this.insuranceService.mapInsuredItemsToTrader(
                sessionId,
                request.lostInsuredItems,
                request.results.profile,
            );

            this.insuranceService.storeGearLostInRaidToSendLater(sessionId, mappedItems);

            this.insuranceService.sendInsuredItems(preRaidPmcProfile, sessionId, locationName);
        }
    }

    /**
     * Return the equipped items from a players inventory
     * @param items Players inventory to search through
     * @returns an array of equipped items
     */
    protected getEquippedGear(items: Item[]): Item[] {
        // Player Slots we care about
        const inventorySlots = [
            "FirstPrimaryWeapon",
            "SecondPrimaryWeapon",
            "Holster",
            "Scabbard",
            "Compass",
            "Headwear",
            "Earpiece",
            "Eyewear",
            "FaceCover",
            "ArmBand",
            "ArmorVest",
            "TacticalVest",
            "Backpack",
            "pocket1",
            "pocket2",
            "pocket3",
            "pocket4",
            "SpecialSlot1",
            "SpecialSlot2",
            "SpecialSlot3",
        ];

        let inventoryItems: Item[] = [];

        // Get an array of root player items
        for (const item of items) {
            if (inventorySlots.includes(item.slotId)) {
                inventoryItems.push(item);
            }
        }

        // Loop through these items and get all of their children
        let newItems = inventoryItems;
        while (newItems.length > 0) {
            const foundItems = [];

            for (const item of newItems) {
                // Find children of this item
                for (const newItem of items) {
                    if (newItem.parentId === item._id) {
                        foundItems.push(newItem);
                    }
                }
            }

            // Add these new found items to our list of inventory items
            inventoryItems = [...inventoryItems, ...foundItems];

            // Now find the children of these items
            newItems = foundItems;
        }

        return inventoryItems;
    }

    /**
     * Checks to see if player survives. run through will return false
     * @param statusOnExit Exit value from offraidData object
     * @returns true if Survived
     */
    protected isPlayerSurvived(results: IEndRaidResult): boolean {
        return results.result.toLowerCase() === "survived";
    }

    /**
     * Is the player dead after a raid - dead = anything other than "survived" / "runner"
     * @param statusOnExit Exit value from offraidData object
     * @returns true if dead
     */
    protected isPlayerDead(results: IEndRaidResult): boolean {
        return ["killed", "missinginaction", "left"].includes(results.result.toLowerCase());
    }

    /**
     * Reset the skill points earned in a raid to 0, ready for next raid
     * @param commonSkills Profile common skills to update
     */
    protected resetSkillPointsEarnedDuringRaid(commonSkills: Common[]): void {
        for (const skill of commonSkills) {
            skill.PointsEarnedDuringSession = 0.0;
        }
    }

    /**
     * merge two dictionaries together
     * Prioritise pair that has true as a value
     * @param primary main dictionary
     * @param secondary Secondary dictionary
     */
    protected mergePmcAndScavEncyclopedias(primary: IPmcData, secondary: IPmcData): void {
        function extend(target: { [key: string]: boolean }, source: Record<string, boolean>) {
            for (const key in source) {
                if (Object.hasOwn(source, key)) {
                    target[key] = source[key];
                }
            }
            return target;
        }

        const merged = extend(extend({}, primary.Encyclopedia), secondary.Encyclopedia);
        primary.Encyclopedia = merged;
        secondary.Encyclopedia = merged;
    }
}
