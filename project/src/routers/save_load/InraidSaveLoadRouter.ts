import { injectable } from "tsyringe";
import { HandledRoute, SaveLoadRouter } from "@spt/di/Router";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";

@injectable()
export class InraidSaveLoadRouter extends SaveLoadRouter
{
    public override getHandledRoutes(): HandledRoute[]
    {
        return [new HandledRoute("spt-inraid", false)];
    }

    public override handleLoad(profile: ISptProfile): ISptProfile
    {
        if (profile.inraid === undefined)
        {
            profile.inraid = { location: "none", character: "none" };
        }

        return profile;
    }
}
