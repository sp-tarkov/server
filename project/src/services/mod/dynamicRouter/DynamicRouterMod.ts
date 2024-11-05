import { DynamicRouter, RouteAction } from "@spt/di/Router";

export class DynamicRouterMod extends DynamicRouter {
    public constructor(
        routes: RouteAction[],
        private topLevelRoute: string,
    ) {
        super(routes);
    }

    public override getTopLevelRoute(): string {
        return this.topLevelRoute;
    }
}
