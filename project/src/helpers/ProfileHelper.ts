import { inject, injectable } from "tsyringe";

import { IPmcData } from "../models/eft/common/IPmcData";
import { Stats } from "../models/eft/common/tables/IBotBase";
import { IAkiProfile } from "../models/eft/profile/IAkiProfile";
import { IValidateNicknameRequestData } from "../models/eft/profile/IValidateNicknameRequestData";
import { QuestStatus } from "../models/enums/QuestStatus";
import { ILogger } from "../models/spt/utils/ILogger";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { ProfileSnapshotService } from "../services/ProfileSnapshotService";
import { JsonUtil } from "../utils/JsonUtil";
import { TimeUtil } from "../utils/TimeUtil";
import { Watermark } from "../utils/Watermark";
import { ItemHelper } from "./ItemHelper";

@injectable()
export class ProfileHelper
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("Watermark") protected watermark: Watermark,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileSnapshotService") protected profileSnapshotService: ProfileSnapshotService
    )
    { }

    /**
     * Remove/reset started quest condtions in player profile
     * @param sessionID Session id
     * @param conditionIds Condition ids that need to be reset/removed
     */
    public resetProfileQuestCondition(sessionID: string, conditionIds: string[]): void
    {
        // Get all quests in progress
        const startedQuests = this.getPmcProfile(sessionID).Quests.filter(q => q.status === QuestStatus.Started);
        for (const quest of startedQuests)
        {
            let matchingConditionId: string;
            for (const conditionId of conditionIds)
            {
                if (quest.completedConditions.includes(conditionId))
                {
                    matchingConditionId = conditionId;
                    break;
                }
            }
            
            // Find index of condition in array
            const index = quest.completedConditions.indexOf(matchingConditionId);
            if (index > -1)
            {
                // Remove condition
                quest.completedConditions.splice(index, 1);
            }
        }
    } 

    /**
     * Get all profiles from server
     * @returns Dictionary of profiles
     */
    public getProfiles(): Record<string, IAkiProfile>
    {
        return this.saveServer.getProfiles();
    }

    public getCompleteProfile(sessionID: string): IPmcData[]
    {
        const output: IPmcData[] = [];

        if (this.isWiped(sessionID))
        {
            return output;
        }

        const pmcProfile = this.getPmcProfile(sessionID);
        const scavProfile = this.getScavProfile(sessionID);

        if (this.profileSnapshotService.hasProfileSnapshot(sessionID))
        {
            return this.postRaidXpWorkaroundFix(sessionID, output, pmcProfile, scavProfile);
        }

        output.push(pmcProfile);
        output.push(scavProfile);

        return output;
    }

    /**
     * Fix xp doubling on post-raid xp reward screen by sending a 'dummy' profile to the post-raid screen
     * Server saves the post-raid changes prior to the xp screen getting the profile, this results in the xp screen using
     * the now updated profile values as a base, meaning it shows x2 xp gained
     * Instead, clone the post-raid profile (so we dont alter its values), apply the pre-raid xp values to the cloned objects and return
     * Delete snapshot of pre-raid profile prior to returning profile data
     * @param sessionId Session id
     * @param output pmc and scav profiles array
     * @param pmcProfile post-raid pmc profile
     * @param scavProfile post-raid scav profile
     * @returns updated profile array
     */
    protected postRaidXpWorkaroundFix(sessionId: string, output: IPmcData[], pmcProfile: IPmcData, scavProfile: IPmcData): IPmcData[]
    {
        const clonedPmc = this.jsonUtil.clone(pmcProfile);
        const clonedScav = this.jsonUtil.clone(scavProfile);

        const profileSnapshot = this.profileSnapshotService.getProfileSnapshot(sessionId);
        clonedPmc.Info.Level = profileSnapshot.characters.pmc.Info.Level;
        clonedPmc.Info.Experience = profileSnapshot.characters.pmc.Info.Experience;

        clonedScav.Info.Level = profileSnapshot.characters.scav.Info.Level;
        clonedScav.Info.Experience = profileSnapshot.characters.scav.Info.Experience;

        this.profileSnapshotService.clearProfileSnapshot(sessionId);

        output.push(clonedPmc);
        output.push(clonedScav);

        return output;
    }

    /**
     * Check if a nickname is used by another profile loaded by the server
     * @param nicknameRequest 
     * @param sessionID Session id
     * @returns True if already used
     */
    public isNicknameTaken(nicknameRequest: IValidateNicknameRequestData, sessionID: string): boolean
    {
        for (const id in this.saveServer.getProfiles())
        {
            const profile = this.saveServer.getProfile(id);
            if (!this.profileHasInfoProperty(profile))
            {
                continue;
            }

            if (!this.sessionIdMatchesProfileId(profile.info.id, sessionID)
                && this.nicknameMatches(profile.characters.pmc.Info.LowerNickname, nicknameRequest.nickname))
            {
                return true;
            }
        }

        return false;
    }

    protected profileHasInfoProperty(profile: IAkiProfile): boolean
    {
        return !!(profile?.characters?.pmc?.Info);
    }

    protected nicknameMatches(profileName: string, nicknameRequest: string): boolean
    {
        return profileName.toLowerCase() === nicknameRequest.toLowerCase();
    }

    protected sessionIdMatchesProfileId(profileId: string, sessionId: string): boolean
    {
        return profileId === sessionId;
    }

    /**
     * Add experience to a PMC inside the players profile
     * @param sessionID Session id
     * @param experienceToAdd Experience to add to PMC character
     */
    public addExperienceToPmc(sessionID: string, experienceToAdd: number): void
    {
        const pmcData = this.getPmcProfile(sessionID);
        pmcData.Info.Experience += experienceToAdd;
    }

    public getProfileByPmcId(pmcId: string): IPmcData
    {
        for (const sessionID in this.saveServer.getProfiles())
        {
            const profile = this.saveServer.getProfile(sessionID);
            if (profile.characters.pmc._id === pmcId)
            {
                return profile.characters.pmc;
            }
        }

        return undefined;
    }

    public getExperience(level: number): number
    {
        const expTable = this.databaseServer.getTables().globals.config.exp.level.exp_table;
        let exp = 0;

        if (level >= expTable.length)
        {
            // make sure to not go out of bounds
            level = expTable.length - 1;
        }

        for (let i = 0; i < level; i++)
        {
            exp += expTable[i].exp;
        }

        return exp;
    }

    public getMaxLevel(): number
    {
        return this.databaseServer.getTables().globals.config.exp.level.exp_table.length - 1;
    }

    public getDefaultAkiDataObject(): any
    {
        return {
            "version": this.getServerVersion()
        };
    }

    public getFullProfile(sessionID: string): IAkiProfile
    {
        if (this.saveServer.getProfile(sessionID) === undefined)
        {
            return undefined;
        }
        
        return this.saveServer.getProfile(sessionID);
    }
    
    public getPmcProfile(sessionID: string): IPmcData
    {
        const fullProfile = this.getFullProfile(sessionID);
        if (fullProfile === undefined || fullProfile.characters.pmc === undefined)
        {
            return undefined;
        }
        
        return this.saveServer.getProfile(sessionID).characters.pmc;
    }
    
    public getScavProfile(sessionID: string): IPmcData
    {
        return this.saveServer.getProfile(sessionID).characters.scav;
    }

    /**
     * Get baseline counter values for a fresh profile
     * @returns Stats
     */
    public getDefaultCounters(): Stats
    {
        return {
            CarriedQuestItems: [],
            Victims: [],
            TotalSessionExperience: 0,
            LastSessionDate: this.timeUtil.getTimestamp(),
            SessionCounters: { Items: [] },
            OverallCounters: { Items: [] },
            TotalInGameTime: 0
        };
    }
    
    protected isWiped(sessionID: string): boolean
    {
        return this.saveServer.getProfile(sessionID).info.wipe;
    }

    protected getServerVersion(): string
    {
        return this.watermark.getVersionTag(true);
    }

    /**
     * Iterate over player profile inventory items and find the secure container and remove it
     * @param profile Profile to remove secure container from
     * @returns profile without secure container
     */
    public removeSecureContainer(profile: IPmcData): IPmcData
    {
        const items = profile.Inventory.items;
        const secureContainer = items.find(x => x.slotId === "SecuredContainer");
        if (secureContainer)
        {
            // Find and remove container + children
            const childItemsInSecureContainer = this.itemHelper.findAndReturnChildrenByItems(items, secureContainer._id);

            // Remove child items + secure container
            profile.Inventory.items = items.filter(x => !childItemsInSecureContainer.includes(x._id));
        }

        return profile;
    }

    /**
     *  Flag a profile as having received a gift
     * Store giftid in profile aki object
     * @param playerId Player to add gift flag to
     * @param giftId Gift player received
     */
    public addGiftReceivedFlagToProfile(playerId: string, giftId: string): void
    {
        const profileToUpdate = this.getFullProfile(playerId);
        const giftHistory = profileToUpdate.aki.receivedGifts;
        if (!giftHistory)
        {
            profileToUpdate.aki.receivedGifts = [];
        }

        profileToUpdate.aki.receivedGifts.push({giftId: giftId, timestampAccepted: this.timeUtil.getTimestamp()});
    }

    /**
     * Check if profile has recieved a gift by id
     * @param playerId Player profile to check for gift
     * @param giftId Gift to check for
     * @returns True if player has recieved gift previously
     */
    public playerHasRecievedGift(playerId: string, giftId: string): boolean
    {
        const profile = this.getFullProfile(playerId);
        if (!profile.aki.receivedGifts)
        {
            return false;
        }

        return !!profile.aki.receivedGifts.find(x => x.giftId === giftId);
    }
}