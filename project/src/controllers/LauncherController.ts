import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { IChangeRequestData } from "@spt/models/eft/launcher/IChangeRequestData";
import { ILoginRequestData } from "@spt/models/eft/launcher/ILoginRequestData";
import { IRegisterData } from "@spt/models/eft/launcher/IRegisterData";
import { IConnectResponse } from "@spt/models/eft/profile/IConnectResponse";
import { IModDetails, Info } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt/models/spt/config/ICoreConfig";
import { IPackageJsonData } from "@spt/models/spt/mod/IPackageJsonData";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class LauncherController {
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PreSptModLoader") protected preSptModLoader: PreSptModLoader,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
    }

    public connect(): IConnectResponse {
        // Get all possible profile types + filter out any that are blacklisted
        const profileKeys = Object.keys(this.databaseService.getProfiles()).filter(
            (key) => !this.coreConfig.features.createNewProfileTypesBlacklist.includes(key),
        );

        return {
            backendUrl: this.httpServerHelper.getBackendUrl(),
            name: this.coreConfig.serverName,
            editions: profileKeys,
            profileDescriptions: this.getProfileDescriptions(),
        };
    }

    /**
     * Get descriptive text for each of the profile edtions a player can choose, keyed by profile.json profile type e.g. "Edge Of Darkness"
     * @returns Dictionary of profile types with related descriptive text
     */
    protected getProfileDescriptions(): Record<string, string> {
        const result = {};
        const dbProfiles = this.databaseService.getProfiles();
        for (const profileKey in dbProfiles) {
            const localeKey = dbProfiles[profileKey]?.descriptionLocaleKey;
            if (!localeKey) {
                this.logger.warning(this.localisationService.getText("launcher-missing_property", profileKey));
                continue;
            }

            result[profileKey] = this.localisationService.getText(localeKey);
        }

        return result;
    }

    public find(sessionId: string): Info {
        return this.saveServer.getProfiles()[sessionId]?.info;
    }

    public login(info: ILoginRequestData): string {
        for (const sessionID in this.saveServer.getProfiles()) {
            const account = this.saveServer.getProfile(sessionID).info;
            if (info.username === account.username) {
                return sessionID;
            }
        }

        return "";
    }

    public register(info: IRegisterData): string {
        for (const sessionID in this.saveServer.getProfiles()) {
            if (info.username === this.saveServer.getProfile(sessionID).info.username) {
                return "";
            }
        }

        return this.createAccount(info);
    }

    protected createAccount(info: IRegisterData): string {
        const profileId = this.generateProfileId();
        const scavId = this.generateProfileId();
        const newProfileDetails: Info = {
            id: profileId,
            scavId: scavId,
            aid: this.hashUtil.generateAccountId(),
            username: info.username,
            password: info.password,
            wipe: true,
            edition: info.edition,
        };
        this.saveServer.createProfile(newProfileDetails);

        this.saveServer.loadProfile(profileId);
        this.saveServer.saveProfile(profileId);

        return profileId;
    }

    protected generateProfileId(): string {
        const timestamp = this.timeUtil.getTimestamp();

        return this.formatID(timestamp, timestamp * this.randomUtil.getInt(1, 1000000));
    }

    protected formatID(timeStamp: number, counter: number): string {
        const timeStampStr = timeStamp.toString(16).padStart(8, "0");
        const counterStr = counter.toString(16).padStart(16, "0");

        return timeStampStr.toLowerCase() + counterStr.toLowerCase();
    }

    public changeUsername(info: IChangeRequestData): string {
        const sessionID = this.login(info);

        if (sessionID) {
            this.saveServer.getProfile(sessionID).info.username = info.change;
        }

        return sessionID;
    }

    public changePassword(info: IChangeRequestData): string {
        const sessionID = this.login(info);

        if (sessionID) {
            this.saveServer.getProfile(sessionID).info.password = info.change;
        }

        return sessionID;
    }

    /**
     * Handle launcher requesting profile be wiped
     * @param info IRegisterData
     * @returns Session id
     */
    public wipe(info: IRegisterData): string {
        if (!this.coreConfig.allowProfileWipe) {
            return;
        }

        const sessionID = this.login(info);

        if (sessionID) {
            const profile = this.saveServer.getProfile(sessionID);
            profile.info.edition = info.edition;
            profile.info.wipe = true;
        }

        return sessionID;
    }

    public getCompatibleTarkovVersion(): string {
        return this.coreConfig.compatibleTarkovVersion;
    }

    /**
     * Get the mods the server has currently loaded
     * @returns Dictionary of mod name and mod details
     */
    public getLoadedServerMods(): Record<string, IPackageJsonData> {
        return this.preSptModLoader.getImportedModDetails();
    }

    /**
     * Get the mods a profile has ever loaded into game with
     * @param sessionId Player id
     * @returns Array of mod details
     */
    public getServerModsProfileUsed(sessionId: string): IModDetails[] {
        const profile = this.profileHelper.getFullProfile(sessionId);

        if (profile?.spt?.mods) {
            return this.preSptModLoader.getProfileModsGroupedByModName(profile?.spt?.mods);
        }

        return [];
    }
}
