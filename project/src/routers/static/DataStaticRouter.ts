import { DataCallbacks } from "@spt/callbacks/DataCallbacks";
import { RouteAction, StaticRouter } from "@spt/di/Router";
import type { IGlobals } from "@spt/models/eft/common/IGlobals";
import type { ICustomizationItem } from "@spt/models/eft/common/tables/ICustomizationItem";
import type { IHandbookBase } from "@spt/models/eft/common/tables/IHandbookBase";
import type { IHideoutArea } from "@spt/models/eft/hideout/IHideoutArea";
import type { IHideoutProductionData } from "@spt/models/eft/hideout/IHideoutProduction";
import type { IHideoutSettingsBase } from "@spt/models/eft/hideout/IHideoutSettingsBase";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { ISettingsBase } from "@spt/models/spt/server/ISettingsBase";
import { inject, injectable } from "tsyringe";

@injectable()
export class DataStaticRouter extends StaticRouter {
    constructor(@inject("DataCallbacks") protected dataCallbacks: DataCallbacks) {
        super([
            new RouteAction(
                "/client/settings",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ISettingsBase>> => {
                    return this.dataCallbacks.getSettings(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/globals",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGlobals>> => {
                    return this.dataCallbacks.getGlobals(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/items",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.dataCallbacks.getTemplateItems(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/handbook/templates",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHandbookBase>> => {
                    return this.dataCallbacks.getTemplateHandbook(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/customization",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<Record<string, ICustomizationItem>>> => {
                    return this.dataCallbacks.getTemplateSuits(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/account/customization",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string[]>> => {
                    return this.dataCallbacks.getTemplateCharacter(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/production/recipes",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHideoutProductionData>> => {
                    return this.dataCallbacks.getHideoutProduction(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/settings",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHideoutSettingsBase>> => {
                    return this.dataCallbacks.getHideoutSettings(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/areas",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHideoutArea[]>> => {
                    return this.dataCallbacks.getHideoutAreas(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/languages",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<Record<string, string>>> => {
                    return this.dataCallbacks.getLocalesLanguages(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/qte/list",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> => {
                    return this.dataCallbacks.getQteList(url, info, sessionID);
                },
            ),
        ]);
    }
}
