import { injectable } from "tsyringe";
import { HandledRoute, SaveLoadRouter } from "@spt/di/Router";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";

@injectable()
export class InsuranceSaveLoadRouter extends SaveLoadRouter
{
    public override getHandledRoutes(): HandledRoute[]
    {
        return [new HandledRoute("spt-insurance", false)];
    }

    public override handleLoad(profile: ISptProfile): ISptProfile
    {
        if (profile.insurance === undefined)
        {
            profile.insurance = [];
        }
        return profile;
    }
}
