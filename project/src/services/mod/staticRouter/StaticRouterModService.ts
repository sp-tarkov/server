import { RouteAction } from "@spt/di/Router";
import { StaticRouterMod } from "@spt/services/mod/staticRouter/StaticRouterMod";
import { type DependencyContainer, injectable } from "tsyringe";

@injectable()
export class StaticRouterModService {
    constructor(protected container: DependencyContainer) {}

    public registerStaticRouter(name: string, routes: RouteAction[], topLevelRoute: string): void {
        this.container.register(name, { useValue: new StaticRouterMod(routes, topLevelRoute) });
        this.container.registerType("StaticRoutes", name);
    }
}
