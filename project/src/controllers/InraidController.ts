import { inject, injectable } from "tsyringe";

import { ApplicationContext } from "../context/ApplicationContext";
import { ContextVariableType } from "../context/ContextVariableType";
import { PlayerScavGenerator } from "../generators/PlayerScavGenerator";
import { HealthHelper } from "../helpers/HealthHelper";
import { InRaidHelper } from "../helpers/InRaidHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { QuestHelper } from "../helpers/QuestHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { ILocationBase } from "../models/eft/common/ILocationBase";
import { IPmcData } from "../models/eft/common/IPmcData";
import { BodyPartHealth } from "../models/eft/common/tables/IBotBase";
import { Item } from "../models/eft/common/tables/IItem";
import { IRegisterPlayerRequestData } from "../models/eft/inRaid/IRegisterPlayerRequestData";
import { ISaveProgressRequestData } from "../models/eft/inRaid/ISaveProgressRequestData";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { Traders } from "../models/enums/Traders";
import { IAirdropConfig } from "../models/spt/config/IAirdropConfig";
import { IInRaidConfig } from "../models/spt/config/IInRaidConfig";
import { ILogger } from "../models/spt/utils/ILogger";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { InsuranceService } from "../services/InsuranceService";
import { JsonUtil } from "../utils/JsonUtil";
import { TimeUtil } from "../utils/TimeUtil";

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
     * Save profile state to disk
     * Handles pmc/pscav
     * @param offraidData post-raid request data
     * @param sessionID Session id
     */
    public savePostRaidProgress(offraidData: ISaveProgressRequestData, sessionID: string): void
    {
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
     * @param sessionID session id
     * @param offraidData post-raid data
     */
    protected savePmcProgress(sessionID: string, offraidData: ISaveProgressRequestData): void
    {
        const currentProfile = this.saveServer.getProfile(sessionID);
        const locationName = currentProfile.inraid.location.toLowerCase();

        const map: ILocationBase = this.databaseServer.getTables().locations[locationName].base;
        const insuranceEnabled = map.Insurance;
        let pmcData = currentProfile.characters.pmc;
        const isDead = this.isPlayerDead(offraidData.exit);
        const preRaidGear = this.inRaidHelper.getPlayerGear(pmcData.Inventory.items);

        currentProfile.inraid.character = "pmc";

        pmcData = this.inRaidHelper.updateProfileBaseStats(pmcData, offraidData, sessionID);

        // Check for exit status
        this.markOrRemoveFoundInRaidItems(offraidData, pmcData, false);

        offraidData.profile.Inventory.items = this.itemHelper.replaceIDs(offraidData.profile, offraidData.profile.Inventory.items, pmcData.InsuredItems, offraidData.profile.Inventory.fastPanel);
        this.inRaidHelper.addUpdToMoneyFromRaid(offraidData.profile.Inventory.items);

        pmcData = this.inRaidHelper.setInventory(sessionID, pmcData, offraidData.profile);
        this.healthHelper.saveVitality(pmcData, offraidData.health, sessionID);

        // Remove inventory if player died and send insurance items
        if (insuranceEnabled)
        {
            this.insuranceService.storeLostGear(pmcData, offraidData, preRaidGear, sessionID, isDead);
        }
        else
        {
            if (locationName === "Laboratory")
            {
                // TODO: dump of prapor/therapist dialogues that are sent when you die in lab with insured items
            }
        }

        if (isDead)
        {
            pmcData = this.performPostRaidActionsWhenDead(offraidData, pmcData, insuranceEnabled, preRaidGear, sessionID);
        }

        if (insuranceEnabled)
        {
            this.insuranceService.sendInsuredItems(pmcData, sessionID, map.Id);
        }
    }

    /**
     * Make changes to pmc profile after they've died in raid,
     * Alter bodypart hp, handle insurance, delete inventory items, remove carried quest items
     * @param postRaidSaveRequest Post-raid save request 
     * @param pmcData Pmc profile
     * @param insuranceEnabled Is insurance enabled
     * @param preRaidGear Gear player had before raid
     * @param sessionID Session id
     * @returns Updated profile object
     */
    protected performPostRaidActionsWhenDead(postRaidSaveRequest: ISaveProgressRequestData, pmcData: IPmcData, insuranceEnabled: boolean, preRaidGear: Item[], sessionID: string): IPmcData
    {
        this.updatePmcHealthPostRaid(postRaidSaveRequest, pmcData);
        this.inRaidHelper.deleteInventory(pmcData, sessionID);

        if (insuranceEnabled)
        {
            this.insuranceService.storeInsuredItemsForReturn(pmcData, postRaidSaveRequest, preRaidGear, sessionID);
        }

        // Remove quest items
        if (this.inRaidHelper.removeQuestItemsOnDeath())
        {
            for (const questItem of postRaidSaveRequest.profile.Stats.CarriedQuestItems)
            {
                const findItemConditionIds = this.questHelper.getFindItemIdForQuestHandIn(questItem);
                this.profileHelper.resetProfileQuestCondition(sessionID, findItemConditionIds);
            }

            pmcData.Stats.CarriedQuestItems = [];
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
            case "left":
                // Naughty pmc left the raid early!
                this.reducePmcHealthToPercent(pmcData, 0.01); // 1%
                break;
            case "missinginaction":
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
     * @param sessionID session id
     * @param offraidData post-raid data of raid
     */
    protected savePlayerScavProgress(sessionID: string, offraidData: ISaveProgressRequestData): void
    {
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        let scavData = this.profileHelper.getScavProfile(sessionID);
        const isDead = this.isPlayerDead(offraidData.exit);

        this.saveServer.getProfile(sessionID).inraid.character = "scav";

        scavData = this.inRaidHelper.updateProfileBaseStats(scavData, offraidData, sessionID);

        // Check for exit status
        this.markOrRemoveFoundInRaidItems(offraidData, pmcData, true);

        offraidData.profile.Inventory.items = this.itemHelper.replaceIDs(offraidData.profile, offraidData.profile.Inventory.items, pmcData.InsuredItems, offraidData.profile.Inventory.fastPanel);
        this.inRaidHelper.addUpdToMoneyFromRaid(offraidData.profile.Inventory.items);

        this.handlePostRaidPlayerScavProcess(scavData, sessionID, offraidData, pmcData, isDead);
    }

    /**
     * Is the player dead after a raid - dead is anything other than "survived" / "runner"
     * @param statusOnExit exit value from offraidData object
     * @returns true if dead
     */
    protected isPlayerDead(statusOnExit: string): boolean
    {
        return (statusOnExit !== "survived" && statusOnExit !== "runner");
    }

    /**
     * Mark inventory items as FiR if player survived raid, otherwise remove FiR from them
     * @param offraidData Save Progress Request
     * @param pmcData player profile
     * @param isPlayerScav Was the player a pScav
     */
    protected markOrRemoveFoundInRaidItems(offraidData: ISaveProgressRequestData, pmcData: IPmcData, isPlayerScav: boolean): void
    {
        if (offraidData.exit.toLowerCase() === "survived")
        {
            // Mark found items and replace item ID's if the player survived
            offraidData.profile = this.inRaidHelper.addSpawnedInSessionPropertyToItems(pmcData, offraidData.profile, isPlayerScav);
        }
        else
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
        this.handlePostRaidPlayerScavKarmaChanges(pmcData, offraidData, scavData, sessionID);

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
     * @param sessionID Session id
     */
    protected handlePostRaidPlayerScavKarmaChanges(pmcData: IPmcData, offraidData: ISaveProgressRequestData, scavData: IPmcData, sessionID: string): void
    {
        const fenceId = Traders.FENCE;

        let fenceStanding = Number(pmcData.TradersInfo[fenceId].standing);
        fenceStanding = this.inRaidHelper.calculateFenceStandingChangeFromKills(fenceStanding, offraidData.profile.Stats.Victims);

        // Successful extract with scav adds 0.01 standing
        if (offraidData.exit === "survived")
        {
            fenceStanding += this.inraidConfig.scavExtractGain;
        }

        // no fence trader info, copy from pmc profile
        if (!scavData.TradersInfo[fenceId])
        {
            scavData.TradersInfo[fenceId] = this.jsonUtil.clone(pmcData.TradersInfo[fenceId]);
        }

        // Make standing changes to scav profile
        scavData.TradersInfo[fenceId].standing = Math.min(Math.max(fenceStanding, -7), 15);

        // Make standing changes to pmc profile
        pmcData.TradersInfo[fenceId].standing = scavData.TradersInfo[fenceId].standing;
        this.traderHelper.lvlUp(fenceId, sessionID);
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