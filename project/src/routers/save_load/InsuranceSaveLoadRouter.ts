import { HandledRoute, SaveLoadRouter } from "@spt/di/Router";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { injectable } from "tsyringe";

@injectable()
export class InsuranceSaveLoadRouter extends SaveLoadRouter {
    public override getHandledRoutes(): HandledRoute[] {
        return [new HandledRoute("spt-insurance", false)];
    }

    public override async handleLoad(profile: ISptProfile): Promise<ISptProfile> {
        if (profile.insurance === undefined) {
            profile.insurance = [];
        }
        return profile;
    }
}
