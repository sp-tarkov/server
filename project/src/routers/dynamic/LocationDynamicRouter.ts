import { LocationCallbacks } from "@spt/callbacks/LocationCallbacks";
import { DynamicRouter } from "@spt/di/Router";
import { inject, injectable } from "tsyringe";

@injectable()
export class LocationDynamicRouter extends DynamicRouter {
    constructor(@inject("LocationCallbacks") protected locationCallbacks: LocationCallbacks) {
        super([]);
    }

    public override getTopLevelRoute(): string {
        return "spt-loot";
    }
}
