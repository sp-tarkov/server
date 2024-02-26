import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IAkiProfile } from "@spt-aki/models/eft/profile/IAkiProfile";

export class Router
{
    protected handledRoutes: HandledRoute[] = [];

    public getTopLevelRoute(): string
    {
        return "aki";
    }

    protected getHandledRoutes(): HandledRoute[]
    {
        throw new Error("This method needs to be overrode by the router classes");
    }

    protected getInternalHandledRoutes(): HandledRoute[]
    {
        if (this.handledRoutes.length === 0)
        {
            this.handledRoutes = this.getHandledRoutes();
        }
        return this.handledRoutes;
    }

    public canHandle(url: string, partialMatch = false): boolean
    {
        if (partialMatch)
        {
            return this.getInternalHandledRoutes().filter((r) => r.dynamic).some((r) => url.includes(r.route));
        }
        return this.getInternalHandledRoutes().filter((r) => !r.dynamic).some((r) => r.route === url);
    }
}

export class StaticRouter extends Router
{
    constructor(private routes: RouteAction[])
    {
        super();
    }

    public handleStatic(url: string, info: any, sessionID: string, output: string): any
    {
        return this.routes.find((route) => route.url === url).action(url, info, sessionID, output);
    }

    public override getHandledRoutes(): HandledRoute[]
    {
        return this.routes.map((route) => new HandledRoute(route.url, false));
    }
}

export class DynamicRouter extends Router
{
    constructor(private routes: RouteAction[])
    {
        super();
    }

    public handleDynamic(url: string, info: any, sessionID: string, output: string): any
    {
        return this.routes.find((r) => url.includes(r.url)).action(url, info, sessionID, output);
    }

    public override getHandledRoutes(): HandledRoute[]
    {
        return this.routes.map((route) => new HandledRoute(route.url, true));
    }
}

// The name of this class should be ItemEventRouter, but that name is taken,
// So instead I added the definition
export class ItemEventRouterDefinition extends Router
{
    public handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void
    {
        throw new Error("This method needs to be overrode by the router classes");
    }
}

export class SaveLoadRouter extends Router
{
    public handleLoad(profile: IAkiProfile): IAkiProfile
    {
        throw new Error("This method needs to be overrode by the router classes");
    }
}

export class HandledRoute
{
    constructor(public route: string, public dynamic: boolean)
    {}
}

export class RouteAction
{
    constructor(public url: string, public action: (url: string, info: any, sessionID: string, output: string) => any)
    {}
}
