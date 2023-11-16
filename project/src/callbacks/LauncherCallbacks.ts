import { inject, injectable } from "tsyringe";

import { LauncherController } from "@spt-aki/controllers/LauncherController";
import { IEmptyRequestData } from "@spt-aki/models/eft/common/IEmptyRequestData";
import { IChangeRequestData } from "@spt-aki/models/eft/launcher/IChangeRequestData";
import { ILoginRequestData } from "@spt-aki/models/eft/launcher/ILoginRequestData";
import { IRegisterData } from "@spt-aki/models/eft/launcher/IRegisterData";
import { IRemoveProfileData } from "@spt-aki/models/eft/launcher/IRemoveProfileData";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { Watermark } from "@spt-aki/utils/Watermark";

@injectable()
class LauncherCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LauncherController") protected launcherController: LauncherController,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("Watermark") protected watermark: Watermark,
    )
    {}

    public connect(): string
    {
        return this.httpResponse.noBody(this.launcherController.connect());
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public login(url: string, info: ILoginRequestData, sessionID: string): string
    {
        const output = this.launcherController.login(info);
        return (!output) ? "FAILED" : output;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public register(url: string, info: IRegisterData, sessionID: string): "FAILED" | "OK"
    {
        const output = this.launcherController.register(info);
        return (!output) ? "FAILED" : "OK";
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public get(url: string, info: ILoginRequestData, sessionID: string): string
    {
        const output = this.launcherController.find(this.launcherController.login(info));
        return this.httpResponse.noBody(output);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public changeUsername(url: string, info: IChangeRequestData, sessionID: string): "FAILED" | "OK"
    {
        const output = this.launcherController.changeUsername(info);
        return (!output) ? "FAILED" : "OK";
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public changePassword(url: string, info: IChangeRequestData, sessionID: string): "FAILED" | "OK"
    {
        const output = this.launcherController.changePassword(info);
        return (!output) ? "FAILED" : "OK";
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public wipe(url: string, info: IRegisterData, sessionID: string): "FAILED" | "OK"
    {
        const output = this.launcherController.wipe(info);
        return (!output) ? "FAILED" : "OK";
    }

    public getServerVersion(): string
    {
        return this.httpResponse.noBody(this.watermark.getVersionTag());
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public ping(url: string, info: IEmptyRequestData, sessionID: string): string
    {
        return this.httpResponse.noBody("pong!");
    }

    public removeProfile(url: string, info: IRemoveProfileData, sessionID: string): string
    {
        return this.httpResponse.noBody(this.saveServer.removeProfile(sessionID));
    }

    public getCompatibleTarkovVersion(): string
    {
        return this.httpResponse.noBody(this.launcherController.getCompatibleTarkovVersion());
    }

    public getLoadedServerMods(): string
    {
        return this.httpResponse.noBody(this.launcherController.getLoadedServerMods());
    }

    public getServerModsProfileUsed(url: string, info: IEmptyRequestData, sessionId: string): string
    {
        return this.httpResponse.noBody(this.launcherController.getServerModsProfileUsed(sessionId));
    }
}

export {LauncherCallbacks};
