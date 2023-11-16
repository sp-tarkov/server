import { injectable } from "tsyringe";

import { HandledRoute, SaveLoadRouter } from "@spt-aki/di/Router";
import { IAkiProfile } from "@spt-aki/models/eft/profile/IAkiProfile";

@injectable()
export class HealthSaveLoadRouter extends SaveLoadRouter
{
    public override getHandledRoutes(): HandledRoute[]
    {
        return [new HandledRoute("aki-health", false)];
    }

    public override handleLoad(profile: IAkiProfile): IAkiProfile
    {
        if (!profile.vitality)
        { // Occurs on newly created profiles
            profile.vitality = { health: null, effects: null };
        }
        profile.vitality.health = {
            Hydration: 0,
            Energy: 0,
            Temperature: 0,
            Head: 0,
            Chest: 0,
            Stomach: 0,
            LeftArm: 0,
            RightArm: 0,
            LeftLeg: 0,
            RightLeg: 0,
        };

        profile.vitality.effects = {
            Head: {},
            Chest: {},
            Stomach: {},
            LeftArm: {},
            RightArm: {},
            LeftLeg: {},
            RightLeg: {},
        };

        return profile;
    }
}
