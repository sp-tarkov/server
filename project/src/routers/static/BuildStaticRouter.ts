import { BuildsCallbacks } from "@spt/callbacks/BuildsCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { IUserBuilds } from "@spt/models/eft/profile/ISptProfile";
import { inject, injectable } from "tsyringe";

@injectable()
export class BuildsStaticRouter extends StaticRouter {
    constructor(@inject("BuildsCallbacks") protected buildsCallbacks: BuildsCallbacks) {
        super([
            new RouteAction(
                "/client/builds/list",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IUserBuilds>> => {
                    return this.buildsCallbacks.getBuilds(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/builds/magazine/save",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.buildsCallbacks.createMagazineTemplate(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/builds/weapon/save",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.buildsCallbacks.setWeapon(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/builds/equipment/save",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.buildsCallbacks.setEquipment(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/builds/delete",
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> => {
                    return this.buildsCallbacks.deleteBuild(url, info, sessionID);
                },
            ),
        ]);
    }
}
