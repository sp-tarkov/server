import { HandledRoute, SaveLoadRouter } from "@spt/di/Router";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { injectable } from "tsyringe";

@injectable()
export class HealthSaveLoadRouter extends SaveLoadRouter {
    public override getHandledRoutes(): HandledRoute[] {
        return [new HandledRoute("spt-health", false)];
    }

    public override handleLoad(profile: ISptProfile): ISptProfile {
        if (!profile.vitality) {
            // Occurs on newly created profiles
            profile.vitality = { health: undefined, effects: undefined };
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
