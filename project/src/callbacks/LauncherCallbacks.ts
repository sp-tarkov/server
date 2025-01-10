import { LauncherController } from "@spt/controllers/LauncherController";
import { IEmptyRequestData } from "@spt/models/eft/common/IEmptyRequestData";
import { IChangeRequestData } from "@spt/models/eft/launcher/IChangeRequestData";
import { ILoginRequestData } from "@spt/models/eft/launcher/ILoginRequestData";
import { IRegisterData } from "@spt/models/eft/launcher/IRegisterData";
import { IRemoveProfileData } from "@spt/models/eft/launcher/IRemoveProfileData";
import { SaveServer } from "@spt/servers/SaveServer";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { Watermark } from "@spt/utils/Watermark";
import { inject, injectable } from "tsyringe";

@injectable()
export class LauncherCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("LauncherController") protected launcherController: LauncherController,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("Watermark") protected watermark: Watermark,
    ) {}

    public connect(): string {
        return this.httpResponse.noBody(this.launcherController.connect());
    }

    public login(url: string, info: ILoginRequestData, sessionID: string): string {
        const output = this.launcherController.login(info);
        return !output ? "FAILED" : output;
    }

    public async register(url: string, info: IRegisterData, sessionID: string): Promise<"FAILED" | "OK"> {
        const output = await this.launcherController.register(info);
        return !output ? "FAILED" : "OK";
    }

    public get(url: string, info: ILoginRequestData, sessionID: string): string {
        const output = this.launcherController.find(this.launcherController.login(info));
        return this.httpResponse.noBody(output);
    }

    public changeUsername(url: string, info: IChangeRequestData, sessionID: string): "FAILED" | "OK" {
        const output = this.launcherController.changeUsername(info);
        return !output ? "FAILED" : "OK";
    }

    public changePassword(url: string, info: IChangeRequestData, sessionID: string): "FAILED" | "OK" {
        const output = this.launcherController.changePassword(info);
        return !output ? "FAILED" : "OK";
    }

    public wipe(url: string, info: IRegisterData, sessionID: string): "FAILED" | "OK" {
        const output = this.launcherController.wipe(info);
        return !output ? "FAILED" : "OK";
    }

    public getServerVersion(): string {
        return this.httpResponse.noBody(this.watermark.getVersionTag());
    }

    public ping(url: string, info: IEmptyRequestData, sessionID: string): string {
        return this.httpResponse.noBody("pong!");
    }

    public async removeProfile(url: string, info: IRemoveProfileData, sessionID: string): Promise<string> {
        return this.httpResponse.noBody(await this.saveServer.removeProfile(sessionID));
    }

    public getCompatibleTarkovVersion(): string {
        return this.httpResponse.noBody(this.launcherController.getCompatibleTarkovVersion());
    }

    public getLoadedServerMods(): string {
        return this.httpResponse.noBody(this.launcherController.getLoadedServerMods());
    }

    public getServerModsProfileUsed(url: string, info: IEmptyRequestData, sessionId: string): string {
        return this.httpResponse.noBody(this.launcherController.getServerModsProfileUsed(sessionId));
    }
}
