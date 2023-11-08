import { inject, injectable } from "tsyringe";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Common, CounterKeyValue, Stats } from "@spt-aki/models/eft/common/tables/IBotBase";
import { IAkiProfile } from "@spt-aki/models/eft/profile/IAkiProfile";
import { IValidateNicknameRequestData } from "@spt-aki/models/eft/profile/IValidateNicknameRequestData";
import { SkillTypes } from "@spt-aki/models/enums/SkillTypes";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { ProfileSnapshotService } from "@spt-aki/services/ProfileSnapshotService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";
import { Watermark } from "@spt-aki/utils/Watermark";

@injectable()
export class ProfileHelper {
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("Watermark") protected watermark: Watermark,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileSnapshotService") protected profileSnapshotService: ProfileSnapshotService,
        @inject("LocalisationService") protected localisationService: LocalisationService
    ) {}

    /**
     * Remove/reset a completed quest condtion from players profile quest data
     * @param sessionID Session id
     * @param questConditionId Quest with condition to remove
     */
    public removeCompletedQuestConditionFromProfile(pmcData: IPmcData, questConditionId: Record<string, string>): void {
        for (const questId in questConditionId) {
            const conditionId = questConditionId[questId];
            const profileQuest = pmcData.Quests.find((x) => x.qid === questId);

            // Find index of condition in array
            const index = profileQuest.completedConditions.indexOf(conditionId);
            if (index > -1) {
                // Remove condition
                profileQuest.completedConditions.splice(index, 1);
            }
        }
    }

    /**
     * Get all profiles from server
     * @returns Dictionary of profiles
     */
    public getProfiles(): Record<string, IAkiProfile> {
        return this.saveServer.getProfiles();
    }

    public getCompleteProfile(sessionID: string): IPmcData[] {
        const output: IPmcData[] = [];

        if (this.isWiped(sessionID)) {
            return output;
        }

        const pmcProfile = this.getPmcProfile(sessionID);
        const scavProfile = this.getScavProfile(sessionID);

        if (this.profileSnapshotService.hasProfileSnapshot(sessionID)) {
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
    protected postRaidXpWorkaroundFix(
        sessionId: string,
        output: IPmcData[],
        pmcProfile: IPmcData,
        scavProfile: IPmcData
    ): IPmcData[] {
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
    public isNicknameTaken(nicknameRequest: IValidateNicknameRequestData, sessionID: string): boolean {
        for (const id in this.saveServer.getProfiles()) {
            const profile = this.saveServer.getProfile(id);
            if (!this.profileHasInfoProperty(profile)) {
                continue;
            }

            if (
                !this.sessionIdMatchesProfileId(profile.info.id, sessionID) &&
                this.nicknameMatches(profile.characters.pmc.Info.LowerNickname, nicknameRequest.nickname)
            ) {
                return true;
            }
        }

        return false;
    }

    protected profileHasInfoProperty(profile: IAkiProfile): boolean {
        return !!profile?.characters?.pmc?.Info;
    }

    protected nicknameMatches(profileName: string, nicknameRequest: string): boolean {
        return profileName.toLowerCase() === nicknameRequest.toLowerCase();
    }

    protected sessionIdMatchesProfileId(profileId: string, sessionId: string): boolean {
        return profileId === sessionId;
    }

    /**
     * Add experience to a PMC inside the players profile
     * @param sessionID Session id
     * @param experienceToAdd Experience to add to PMC character
     */
    public addExperienceToPmc(sessionID: string, experienceToAdd: number): void {
        const pmcData = this.getPmcProfile(sessionID);
        pmcData.Info.Experience += experienceToAdd;
    }

    public getProfileByPmcId(pmcId: string): IPmcData {
        for (const sessionID in this.saveServer.getProfiles()) {
            const profile = this.saveServer.getProfile(sessionID);
            if (profile.characters.pmc._id === pmcId) {
                return profile.characters.pmc;
            }
        }

        return undefined;
    }

    public getExperience(level: number): number {
        const expTable = this.databaseServer.getTables().globals.config.exp.level.exp_table;
        let exp = 0;

        if (level >= expTable.length) {
            // make sure to not go out of bounds
            level = expTable.length - 1;
        }

        for (let i = 0; i < level; i++) {
            exp += expTable[i].exp;
        }

        return exp;
    }

    public getMaxLevel(): number {
        return this.databaseServer.getTables().globals.config.exp.level.exp_table.length - 1;
    }

    public getDefaultAkiDataObject(): any {
        return {
            version: this.getServerVersion(),
        };
    }

    public getFullProfile(sessionID: string): IAkiProfile {
        if (this.saveServer.getProfile(sessionID) === undefined) {
            return undefined;
        }

        return this.saveServer.getProfile(sessionID);
    }

    public getPmcProfile(sessionID: string): IPmcData {
        const fullProfile = this.getFullProfile(sessionID);
        if (fullProfile === undefined || fullProfile.characters.pmc === undefined) {
            return undefined;
        }

        return this.saveServer.getProfile(sessionID).characters.pmc;
    }

    public getScavProfile(sessionID: string): IPmcData {
        return this.saveServer.getProfile(sessionID).characters.scav;
    }

    /**
     * Get baseline counter values for a fresh profile
     * @returns Stats
     */
    public getDefaultCounters(): Stats {
        return {
            Eft: {
                CarriedQuestItems: [],
                Victims: [],
                TotalSessionExperience: 0,
                LastSessionDate: this.timeUtil.getTimestamp(),
                SessionCounters: { Items: [] },
                OverallCounters: { Items: [] },
                TotalInGameTime: 0,
            },
        };
    }

    protected isWiped(sessionID: string): boolean {
        return this.saveServer.getProfile(sessionID).info.wipe;
    }

    protected getServerVersion(): string {
        return this.watermark.getVersionTag(true);
    }

    /**
     * Iterate over player profile inventory items and find the secure container and remove it
     * @param profile Profile to remove secure container from
     * @returns profile without secure container
     */
    public removeSecureContainer(profile: IPmcData): IPmcData {
        const items = profile.Inventory.items;
        const secureContainer = items.find((x) => x.slotId === "SecuredContainer");
        if (secureContainer) {
            // Find and remove container + children
            const childItemsInSecureContainer = this.itemHelper.findAndReturnChildrenByItems(
                items,
                secureContainer._id
            );

            // Remove child items + secure container
            profile.Inventory.items = items.filter((x) => !childItemsInSecureContainer.includes(x._id));
        }

        return profile;
    }

    /**
     *  Flag a profile as having received a gift
     * Store giftid in profile aki object
     * @param playerId Player to add gift flag to
     * @param giftId Gift player received
     */
    public addGiftReceivedFlagToProfile(playerId: string, giftId: string): void {
        const profileToUpdate = this.getFullProfile(playerId);
        const giftHistory = profileToUpdate.aki.receivedGifts;
        if (!giftHistory) {
            profileToUpdate.aki.receivedGifts = [];
        }

        profileToUpdate.aki.receivedGifts.push({ giftId: giftId, timestampAccepted: this.timeUtil.getTimestamp() });
    }

    /**
     * Check if profile has recieved a gift by id
     * @param playerId Player profile to check for gift
     * @param giftId Gift to check for
     * @returns True if player has recieved gift previously
     */
    public playerHasRecievedGift(playerId: string, giftId: string): boolean {
        const profile = this.getFullProfile(playerId);
        if (!profile) {
            this.logger.debug(`Unable to gift ${giftId}, profile: ${playerId} does not exist`);
            return false;
        }

        if (!profile.aki.receivedGifts) {
            return false;
        }

        return !!profile.aki.receivedGifts.find((x) => x.giftId === giftId);
    }

    /**
     * Find Stat in profile counters and increment by one
     * @param counters Counters to search for key
     * @param keyToIncrement Key
     */
    public incrementStatCounter(counters: CounterKeyValue[], keyToIncrement: string): void {
        const stat = counters.find((x) => x.Key.includes(keyToIncrement));
        if (stat) {
            stat.Value++;
        }
    }

    /**
     * Check if player has a skill at elite level
     * @param skillType Skill to check
     * @param pmcProfile Profile to find skill in
     * @returns True if player has skill at elite level
     */
    public hasEliteSkillLevel(skillType: SkillTypes, pmcProfile: IPmcData): boolean {
        const profileSkills = pmcProfile?.Skills?.Common;
        if (!profileSkills) {
            return false;
        }

        const profileSkill = profileSkills.find((x) => x.Id === skillType);
        if (!profileSkill) {
            this.logger.warning(`Unable to check for elite skill ${skillType}, not found in profile`);

            return false;
        }
        return profileSkill.Progress >= 5100; // level 51
    }

    /**
     * Add points to a specific skill in player profile
     * @param skill Skill to add points to
     * @param pointsToAdd Points to add
     * @param pmcProfile Player profile with skill
     * @param useSkillProgressRateMultipler Skills are multiplied by a value in globals, default is off to maintain compatibility with legacy code
     * @returns
     */
    public addSkillPointsToPlayer(
        pmcProfile: IPmcData,
        skill: SkillTypes,
        pointsToAdd: number,
        useSkillProgressRateMultipler = false
    ): void {
        if (!pointsToAdd || pointsToAdd < 0) {
            this.logger.error(
                this.localisationService.getText("player-attempt_to_increment_skill_with_negative_value", skill)
            );
            return;
        }

        const profileSkills = pmcProfile?.Skills?.Common;
        if (!profileSkills) {
            this.logger.warning(`Unable to add ${pointsToAdd} points to ${skill}, profile has no skills`);

            return;
        }

        const profileSkill = profileSkills.find((x) => x.Id === skill);
        if (!profileSkill) {
            this.logger.error(this.localisationService.getText("quest-no_skill_found", skill));

            return;
        }

        if (useSkillProgressRateMultipler) {
            const globals = this.databaseServer.getTables().globals;
            const skillProgressRate = globals.config.SkillsSettings.SkillProgressRate;
            pointsToAdd = skillProgressRate * pointsToAdd;
        }

        profileSkill.Progress += pointsToAdd;
        profileSkill.LastAccess = this.timeUtil.getTimestamp();
    }

    public getSkillFromProfile(pmcData: IPmcData, skill: SkillTypes): Common {
        const skillToReturn = pmcData.Skills.Common.find((x) => x.Id === skill);
        if (!skillToReturn) {
            this.logger.warning(`Profile ${pmcData.sessionId} does not have a skill named: ${skill}`);
            return undefined;
        }

        return skillToReturn;
    }
}
