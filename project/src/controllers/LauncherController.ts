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
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HashUtil } from "@spt-aki/utils/HashUtil";

@injectable()
export class LauncherController {
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("PreAkiModLoader") protected preAkiModLoader: PreAkiModLoader,
        @inject("ConfigServer") protected configServer: ConfigServer
    ) {
        this.coreConfig = this.configServer.getConfig(ConfigTypes.CORE);
    }

    public connect(): IConnectResponse {
        return {
            backendUrl: this.httpServerHelper.getBackendUrl(),
            name: this.coreConfig.serverName,
            editions: Object.keys(this.databaseServer.getTables().templates.profiles),
            profileDescriptions: this.getProfileDescriptions(),
        };
    }

    /**
     * Get descriptive text for each of the profile edtions a player can choose
     * @returns
     */
    protected getProfileDescriptions(): Record<string, string> {
        return {
            Standard: this.localisationService.getText("launcher-profile_standard"),
            "Left Behind": this.localisationService.getText("launcher-profile_leftbehind"),
            "Prepare To Escape": this.localisationService.getText("launcher-profile_preparetoescape"),
            "Edge Of Darkness": this.localisationService.getText("launcher-edgeofdarkness"),
            "SPT Easy start": this.localisationService.getText("launcher-profile_spteasystart"),
            "SPT Zero to hero": this.localisationService.getText("launcher-profile_sptzerotohero"),
            "SPT Developer": this.localisationService.getText("launcher-profile_sptdeveloper"),
        };
    }

    public find(sessionIdKey: string): Info {
        if (sessionIdKey in this.saveServer.getProfiles()) {
            return this.saveServer.getProfile(sessionIdKey).info;
        }

        return undefined;
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
        const sessionID = this.hashUtil.generate();
        const newProfileDetails: Info = {
            id: sessionID,
            aid: this.hashUtil.generateAccountId(),
            username: info.username,
            password: info.password,
            wipe: true,
            edition: info.edition,
        };
        this.saveServer.createProfile(newProfileDetails);

        this.saveServer.loadProfile(sessionID);
        this.saveServer.saveProfile(sessionID);
        return sessionID;
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

    public wipe(info: IRegisterData): string {
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
        return this.preAkiModLoader.getImportedModDetails();
    }

    /**
     * Get the mods a profile has ever loaded into game with
     * @param sessionId Player id
     * @returns Array of mod details
     */
    public getServerModsProfileUsed(sessionId: string): ModDetails[] {
        const profile = this.profileHelper.getFullProfile(sessionId);

        if (profile?.aki?.mods) {
            return this.preAkiModLoader.getProfileModsGroupedByModName(profile?.aki?.mods);
        }

        return [];
    }
}
