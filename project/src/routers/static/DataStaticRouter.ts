import { inject, injectable } from "tsyringe";

import { DataCallbacks } from "@spt-aki/callbacks/DataCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class DataStaticRouter extends StaticRouter 
{
    constructor(
        @inject("DataCallbacks") protected dataCallbacks: DataCallbacks
    ) 
    {
        super(
            [
                new RouteAction(
                    "/client/settings",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getSettings(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/globals",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getGlobals(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/items",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getTemplateItems(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/handbook/templates",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getTemplateHandbook(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/customization",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getTemplateSuits(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/account/customization",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getTemplateCharacter(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/hideout/production/recipes",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.gethideoutProduction(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/hideout/settings",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getHideoutSettings(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/hideout/areas",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getHideoutAreas(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/hideout/production/scavcase/recipes",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getHideoutScavcase(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/languages",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getLocalesLanguages(url, info, sessionID);
                    }
                ),
                new RouteAction(
                    "/client/hideout/qte/list",
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    (url: string, info: any, sessionID: string, output: string): any => 
                    {
                        return this.dataCallbacks.getQteList(url, info, sessionID);
                    }
                )
            ]
        );
    }
}