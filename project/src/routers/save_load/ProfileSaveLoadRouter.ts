import { injectable } from "tsyringe";

import { HandledRoute, SaveLoadRouter } from "@spt-aki/di/Router";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IAkiProfile } from "@spt-aki/models/eft/profile/IAkiProfile";

@injectable()
export class ProfileSaveLoadRouter extends SaveLoadRouter
{
    public override getHandledRoutes(): HandledRoute[]
    {
        return [new HandledRoute("aki-profile", false)];
    }

    public override handleLoad(profile: IAkiProfile): IAkiProfile
    {
        if (profile.characters === null)
        {
            profile.characters = { pmc: {} as IPmcData, scav: {} as IPmcData };
        }
        return profile;
    }
}
