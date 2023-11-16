import { DependencyContainer, injectable } from "tsyringe";

import { RouteAction } from "@spt-aki/di/Router";
import { StaticRouterMod } from "@spt-aki/services/mod/staticRouter/StaticRouterMod";

@injectable()
export class StaticRouterModService
{
    constructor(protected container: DependencyContainer)
    {}
    public registerStaticRouter(name: string, routes: RouteAction[], topLevelRoute: string): void
    {
        this.container.register(name, { useValue: new StaticRouterMod(routes, topLevelRoute) });
        this.container.registerType("StaticRoutes", name);
    }
}
