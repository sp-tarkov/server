import { RouteAction } from "@spt/di/Router";
import { DynamicRouterMod } from "@spt/services/mod/dynamicRouter/DynamicRouterMod";
import { type DependencyContainer, injectable } from "tsyringe";

@injectable()
export class DynamicRouterModService {
    constructor(private container: DependencyContainer) {}

    public registerDynamicRouter(name: string, routes: RouteAction[], topLevelRoute: string): void {
        this.container.register(name, { useValue: new DynamicRouterMod(routes, topLevelRoute) });
        this.container.registerType("DynamicRoutes", name);
    }
}
