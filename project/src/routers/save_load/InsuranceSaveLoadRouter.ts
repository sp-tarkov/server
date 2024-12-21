import { HandledRoute, SaveLoadRouter } from "@spt/di/Router";
import type { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { injectable } from "tsyringe";

@injectable()
export class InsuranceSaveLoadRouter extends SaveLoadRouter {
    public override getHandledRoutes(): HandledRoute[] {
        return [new HandledRoute("spt-insurance", false)];
    }

    public override handleLoad(profile: ISptProfile): ISptProfile {
        if (profile.insurance === undefined) {
            profile.insurance = [];
        }
        return profile;
    }
}
