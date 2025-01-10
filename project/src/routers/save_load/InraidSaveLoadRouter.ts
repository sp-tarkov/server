import { HandledRoute, SaveLoadRouter } from "@spt/di/Router";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { injectable } from "tsyringe";

@injectable()
export class InraidSaveLoadRouter extends SaveLoadRouter {
    public override getHandledRoutes(): HandledRoute[] {
        return [new HandledRoute("spt-inraid", false)];
    }

    public override async handleLoad(profile: ISptProfile): Promise<ISptProfile> {
        if (profile.inraid === undefined) {
            profile.inraid = { location: "none", character: "none" };
        }

        return profile;
    }
}
