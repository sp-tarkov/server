import { inject, injectable } from "tsyringe";

import { HttpServerHelper } from "@spt-aki/helpers/HttpServerHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { IChangeRequestData } from "@spt-aki/models/eft/launcher/IChangeRequestData";
import { ILoginRequestData } from "@spt-aki/models/eft/launcher/ILoginRequestData";
import { IRegisterData } from "@spt-aki/models/eft/launcher/IRegisterData";
import { Info, ModDetails } from "@spt-aki/models/eft/profile/IAkiProfile";
import { IConnectResponse } from "@spt-aki/models/eft/profile/IConnectResponse";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt-aki/models/spt/config/ICoreConfig";
import { IPackageJsonData } from "@spt-aki/models/spt/mod/IPackageJsonData";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class LauncherController
{
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PreAkiModLoader") protected preAkiModLoader: PreAkiModLoader,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
    }

    public connect(): IConnectResponse
    {
        return {
            backendUrl: this.httpServerHelper.getBackendUrl(),
            name: this.coreConfig.serverName,
            editions: Object.keys(this.databaseServer.getTables().templates.profiles),
            profileDescriptions: this.getProfileDescriptions(),
        };
    }

    /**
     * Get descriptive text for each of the profile edtions a player can choose, keyed by profile.json profile type e.g. "Edge Of Darkness"
     * @returns Dictionary of profile types with related descriptive text
     */
    protected getProfileDescriptions(): Record<string, string>
    {
        const result = {};
        const dbProfiles = this.databaseServer.getTables().templates.profiles;
        for (const profileKey in dbProfiles)
        {
            const localeKey = dbProfiles[profileKey]?.descriptionLocaleKey;
            if (!localeKey)
            {
                this.logger.warning(this.localisationService.getText("launcher-missing_property", profileKey));
                continue;
            }

            result[profileKey] = this.localisationService.getText(localeKey);
        }

        return result;
    }

    public find(sessionIdKey: string): Info
    {
        if (sessionIdKey in this.saveServer.getProfiles())
        {
            return this.saveServer.getProfile(sessionIdKey).info;
        }

        return undefined;
    }

    public login(info: ILoginRequestData): string
    {
        for (const sessionID in this.saveServer.getProfiles())
        {
            const account = this.saveServer.getProfile(sessionID).info;
            if (info.username === account.username)
            {
                return sessionID;
            }
        }

        return "";
    }

    public register(info: IRegisterData): string
    {
        for (const sessionID in this.saveServer.getProfiles())
        {
            if (info.username === this.saveServer.getProfile(sessionID).info.username)
            {
                return "";
            }
        }

        return this.createAccount(info);
    }

    protected createAccount(info: IRegisterData): string
    {
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

    protected generateProfileId(): string
    {
        const timestamp = this.timeUtil.getTimestamp();

        return this.formatID(timestamp, timestamp * this.randomUtil.getInt(1, 1000000));
    }

    protected formatID(timeStamp: number, counter: number): string
    {
        const timeStampStr = timeStamp.toString(16).padStart(8, "0");
        const counterStr = counter.toString(16).padStart(16, "0");

        return timeStampStr.toLowerCase() + counterStr.toLowerCase();
    }

    public changeUsername(info: IChangeRequestData): string
    {
        const sessionID = this.login(info);

        if (sessionID)
        {
            this.saveServer.getProfile(sessionID).info.username = info.change;
        }

        return sessionID;
    }

    public changePassword(info: IChangeRequestData): string
    {
        const sessionID = this.login(info);

        if (sessionID)
        {
            this.saveServer.getProfile(sessionID).info.password = info.change;
        }

        return sessionID;
    }

    public wipe(info: IRegisterData): string
    {
        const sessionID = this.login(info);

        if (sessionID)
        {
            const profile = this.saveServer.getProfile(sessionID);
            profile.info.edition = info.edition;
            profile.info.wipe = true;
        }

        return sessionID;
    }

    public getCompatibleTarkovVersion(): string
    {
        return this.coreConfig.compatibleTarkovVersion;
    }

    /**
     * Get the mods the server has currently loaded
     * @returns Dictionary of mod name and mod details
     */
    public getLoadedServerMods(): Record<string, IPackageJsonData>
    {
        return this.preAkiModLoader.getImportedModDetails();
    }

    /**
     * Get the mods a profile has ever loaded into game with
     * @param sessionId Player id
     * @returns Array of mod details
     */
    public getServerModsProfileUsed(sessionId: string): ModDetails[]
    {
        const profile = this.profileHelper.getFullProfile(sessionId);

        if (profile?.aki?.mods)
        {
            return this.preAkiModLoader.getProfileModsGroupedByModName(profile?.aki?.mods);
        }

        return [];
    }
}
