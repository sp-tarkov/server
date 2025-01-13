import { PlayerScavGenerator } from "@spt/generators/PlayerScavGenerator";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
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
import { IValidateNicknameRequestData } from "@spt/models/eft/profile/IValidateNicknameRequestData";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { SaveServer } from "@spt/servers/SaveServer";
import { CreateProfileService } from "@spt/services/CreateProfileService";
import { DatabaseService } from "@spt/services/DatabaseService";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class ProfileController {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("CreateProfileService") protected createProfileService: CreateProfileService,
        @inject("PlayerScavGenerator") protected playerScavGenerator: PlayerScavGenerator,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
    ) { }

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
    public async createProfile(info: IProfileCreateRequestData, sessionID: string): Promise<string> {
        return await this.createProfileService.createProfile(sessionID, info);
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
        // TODO: We should probably rename this method in the next client update
        const result: ISearchFriendResponse[] = [];

        // Find any profiles with a nickname containing the entered name
        const allProfiles = Object.values(this.saveServer.getProfiles());

        for (const profile of allProfiles) {
            const pmcProfile = profile?.characters?.pmc;

            if (!pmcProfile?.Info?.LowerNickname?.includes(info.nickname.toLocaleLowerCase())) {
                continue;
            }

            result.push(this.profileHelper.getChatRoomMemberFromPmcProfile(pmcProfile));
        }

        return result;
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

    /**
     * Handle client/profile/view
     */
    public getOtherProfile(sessionId: string, request: IGetOtherProfileRequest): IGetOtherProfileResponse {
        // Find the profile by the account ID, fall back to the current player if we can't find the account
        let profile = this.profileHelper.getFullProfileByAccountId(request.accountId);
        if (!profile?.characters?.pmc || !profile?.characters?.scav) {
            profile = this.profileHelper.getFullProfile(sessionId);
        }
        const playerPmc = profile.characters.pmc;
        const playerScav = profile.characters.scav;
        const hideoutKeys = [...Object.values(playerPmc.Inventory.hideoutAreaStashes), playerPmc.Inventory.hideoutCustomizationStashId];

        const hideoutItems = playerPmc.Inventory.items.filter(x => hideoutKeys.includes(x._id));
        const itemsToReturn = [];
        for (const item of hideoutItems) {
            const foundItems = this.itemHelper.findAndReturnChildrenAsItems(playerPmc.Inventory.items, item._id);
            itemsToReturn.push(...foundItems);
        }

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
                dogtag: playerPmc.Customization.DogTag,
            },
            skills: playerPmc.Skills,
            equipment: {
                Id: playerPmc.Inventory.equipment,
                Items: playerPmc.Inventory.items,
            },
            achievements: playerPmc.Achievements,
            favoriteItems: this.profileHelper.getOtherProfileFavorites(playerPmc),
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
            hideout: playerPmc.Hideout,
            customizationStash: playerPmc.Inventory.hideoutCustomizationStashId,
            hideoutAreaStashes: playerPmc.Inventory.hideoutAreaStashes,
            items: itemsToReturn
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
