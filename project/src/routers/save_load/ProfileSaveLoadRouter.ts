import { HandledRoute, SaveLoadRouter } from "@spt/di/Router";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { injectable } from "tsyringe";

@injectable()
export class ProfileSaveLoadRouter extends SaveLoadRouter {
    public override getHandledRoutes(): HandledRoute[] {
        return [new HandledRoute("spt-profile", false)];
    }

    public override handleLoad(profile: ISptProfile): ISptProfile {
        if (!profile.characters) {
            profile.characters = { pmc: {} as IPmcData, scav: {} as IPmcData };
        }
        return profile;
    }
}
