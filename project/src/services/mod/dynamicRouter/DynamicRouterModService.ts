import { DependencyContainer, injectable } from "tsyringe";

import { RouteAction } from "@spt-aki/di/Router";
import { DynamicRouterMod } from "@spt-aki/services/mod/dynamicRouter/DynamicRouterMod";

@injectable()
export class DynamicRouterModService
{
    constructor(private container: DependencyContainer)
    {}
    public registerDynamicRouter(name: string, routes: RouteAction[], topLevelRoute: string): void
    {
        this.container.register(name, { useValue: new DynamicRouterMod(routes, topLevelRoute) });
        this.container.registerType("DynamicRoutes", name);
    }
}
