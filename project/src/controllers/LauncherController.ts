import { inject, injectable } from "tsyringe";

import { HttpServerHelper } from "../helpers/HttpServerHelper";
import { IChangeRequestData } from "../models/eft/launcher/IChangeRequestData";
import { ILoginRequestData } from "../models/eft/launcher/ILoginRequestData";
import { IRegisterData } from "../models/eft/launcher/IRegisterData";
import { Info } from "../models/eft/profile/IAkiProfile";
import { IConnectResponse } from "../models/eft/profile/IConnectResponse";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { ICoreConfig } from "../models/spt/config/ICoreConfig";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { SaveServer } from "../servers/SaveServer";
import { LocalisationService } from "../services/LocalisationService";
import { HashUtil } from "../utils/HashUtil";

@injectable()
export class LauncherController
{
    protected coreConfig: ICoreConfig;

    constructor(
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer
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
            profileDescriptions: this.getProfileDescriptions()
        };
    }

    /**
     * Get descriptive text for each of the profile edtions a player can choose
     * @returns 
     */
    protected getProfileDescriptions(): Record<string, string>
    {
        return {
            "Standard": this.localisationService.getText("launcher-profile_standard"),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "Left Behind": this.localisationService.getText("launcher-profile_leftbehind"),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "Prepare To Escape": this.localisationService.getText("launcher-profile_preparetoescape"),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "Edge Of Darkness": this.localisationService.getText("launcher-edgeofdarkness"),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "SPT Easy start": this.localisationService.getText("launcher-profile_spteasystart"),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "SPT Zero to hero": this.localisationService.getText("launcher-profile_sptzerotohero"),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "SPT Developer": this.localisationService.getText("launcher-profile_sptdeveloper")
        };
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
        const sessionID = this.hashUtil.generate();
        const newProfileDetails: Info = {
            id: sessionID,
            username: info.username,
            password: info.password,
            wipe: true,
            edition: info.edition
        };
        this.saveServer.createProfile(newProfileDetails);

        this.saveServer.loadProfile(sessionID);
        this.saveServer.saveProfile(sessionID);
        return sessionID;
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
}
