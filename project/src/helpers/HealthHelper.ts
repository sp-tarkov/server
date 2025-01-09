import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IBodyPartsHealth, IHealth } from "@spt/models/eft/common/tables/IBotBase";
import { ISyncHealthRequestData } from "@spt/models/eft/health/ISyncHealthRequestData";
import { IEffects, ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IHealthConfig } from "@spt/models/spt/config/IHealthConfig";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class HealthHelper {
    protected healthConfig: IHealthConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.healthConfig = this.configServer.getConfig(ConfigTypes.HEALTH);
    }

    /**
     * Resets the profiles vitality/health and vitality/effects properties to their defaults
     * @param sessionID Session Id
     * @returns updated profile
     */
    public resetVitality(sessionID: string): ISptProfile {
        const profile = this.saveServer.getProfile(sessionID);

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

    /**
     * Update player profile vitality values with changes from client request object
     * @param pmcData Player profile
     * @param postRaidHealth Post raid data
     * @param sessionID Session id
     * @param isDead Is player dead
     * @param addEffects Should effects be added to profile (default - true)
     * @param deleteExistingEffects Should all prior effects be removed before apply new ones  (default - true)
     */
    public updateProfileHealthPostRaid(
        pmcData: IPmcData,
        postRaidHealth: IHealth,
        sessionID: string,
        isDead: boolean,
    ): void {
        const fullProfile = this.saveServer.getProfile(sessionID);
        const profileEdition = fullProfile.info.edition;
        const profileSide = fullProfile.characters.pmc.Info.Side;

        const defaultTemperature =
            this.databaseService.getProfiles()[profileEdition][profileSide.toLowerCase()]?.character?.Health
                ?.Temperature ?? 36.6;

        this.storeHydrationEnergyTempInProfile(
            fullProfile,
            postRaidHealth.Hydration.Current,
            postRaidHealth.Energy.Current,
            defaultTemperature.Current, // Reset profile temp to the default to prevent very cold/hot temps persisting into next raid
        );

        // Store limb effects from post-raid in profile
        for (const bodyPart in postRaidHealth.BodyParts) {
            // Effects
            if (postRaidHealth.BodyParts[bodyPart].Effects) {
                fullProfile.vitality.effects[bodyPart] = postRaidHealth.BodyParts[bodyPart].Effects;
            }

            // Limb hp
            if (!isDead) {
                // Player alive, not is limb alive
                fullProfile.vitality.health[bodyPart] = postRaidHealth.BodyParts[bodyPart].Health.Current;
            } else {
                fullProfile.vitality.health[bodyPart] =
                    pmcData.Health.BodyParts[bodyPart].Health.Maximum * this.healthConfig.healthMultipliers.death;
            }
        }

        this.transferPostRaidLimbEffectsToProfile(postRaidHealth.BodyParts, pmcData);

        // Adjust hydration/energy/temp and limb hp using temp storage hydated above
        this.saveHealth(pmcData, sessionID);

        // Reset temp storage
        this.resetVitality(sessionID);

        // Update last edited timestamp
        pmcData.Health.UpdateTime = this.timeUtil.getTimestamp();
    }

    protected storeHydrationEnergyTempInProfile(
        fullProfile: ISptProfile,
        hydration: number,
        energy: number,
        temprature: number,
    ): void {
        fullProfile.vitality.health.Hydration = hydration;
        fullProfile.vitality.health.Energy = energy;
        fullProfile.vitality.health.Temperature = temprature;
    }

    /**
     * Take body part effects from client profile and apply to server profile
     * @param postRaidBodyParts Post-raid body part data
     * @param profileData Player profile on server
     */
    protected transferPostRaidLimbEffectsToProfile(postRaidBodyParts: IBodyPartsHealth, profileData: IPmcData): void {
        // Iterate over each body part
        const effectsToIgnore = ["Dehydration", "Exhaustion"];
        for (const bodyPartId in postRaidBodyParts) {
            // Get effects on body part from profile
            const bodyPartEffects = postRaidBodyParts[bodyPartId].Effects;
            for (const effect in bodyPartEffects) {
                const effectDetails = bodyPartEffects[effect];

                // Null guard
                profileData.Health.BodyParts[bodyPartId].Effects ||= {};

                // Effect already exists on limb in server profile, skip
                const profileBodyPartEffects = profileData.Health.BodyParts[bodyPartId].Effects;
                if (profileBodyPartEffects[effect]) {
                    if (effectsToIgnore.includes(effect)) {
                        // Get rid of certain effects we dont want to persist out of raid
                        profileBodyPartEffects[effect] = undefined;
                    }

                    continue;
                }

                if (effectsToIgnore.includes(effect)) {
                    // Do not pass some effects to out of raid profile
                    continue;
                }

                // Add effect to server profile
                profileBodyPartEffects[effect] = { Time: effectDetails.Time ?? -1 };
            }
        }
    }

    /**
     * Update player profile vitality values with changes from client request object
     * @param pmcData Player profile
     * @param request Heal request
     * @param sessionID Session id
     * @param addEffects Should effects be added to profile (default - true)
     * @param deleteExistingEffects Should all prior effects be removed before apply new ones  (default - true)
     */
    public saveVitality(
        pmcData: IPmcData,
        request: ISyncHealthRequestData,
        sessionID: string,
        addEffects = true,
        deleteExistingEffects = true,
    ): void {
        const postRaidBodyParts = request.Health; // post raid health settings
        const fullProfile = this.saveServer.getProfile(sessionID);
        const profileEffects = fullProfile.vitality.effects;

        this.storeHydrationEnergyTempInProfile(fullProfile, request.Hydration, request.Energy, request.Temperature);

        // Process request data into profile
        for (const bodyPart in postRaidBodyParts) {
            // Transfer effects from request to profile
            if (postRaidBodyParts[bodyPart].Effects) {
                profileEffects[bodyPart] = postRaidBodyParts[bodyPart].Effects;
            }

            if (request.IsAlive) {
                // Player alive, not is limb alive
                fullProfile.vitality.health[bodyPart] = postRaidBodyParts[bodyPart].Current;
            } else {
                fullProfile.vitality.health[bodyPart] =
                    pmcData.Health.BodyParts[bodyPart].Health.Maximum * this.healthConfig.healthMultipliers.death;
            }
        }

        // Add effects to body parts if enabled
        if (addEffects) {
            this.saveEffects(
                pmcData,
                sessionID,
                this.cloner.clone(this.saveServer.getProfile(sessionID).vitality.effects),
                deleteExistingEffects,
            );
        }

        // Adjust hydration/energy/temp and limb hp
        this.saveHealth(pmcData, sessionID);

        this.resetVitality(sessionID);

        // Update last edited timestamp
        pmcData.Health.UpdateTime = this.timeUtil.getTimestamp();
    }

    /**
     * Adjust hydration/energy/temperate and body part hp values in player profile to values in profile.vitality
     * @param pmcData Profile to update
     * @param sessionId Session id
     */
    protected saveHealth(pmcData: IPmcData, sessionID: string): void {
        if (!this.healthConfig.save.health) {
            return;
        }

        const profileHealth = this.saveServer.getProfile(sessionID).vitality.health;
        for (const healthModifier in profileHealth) {
            let target = profileHealth[healthModifier];

            if (["Hydration", "Energy", "Temperature"].includes(healthModifier)) {
                // Set resources
                if (target > pmcData.Health[healthModifier].Maximum) {
                    target = pmcData.Health[healthModifier].Maximum;
                }

                pmcData.Health[healthModifier].Current = Math.round(target);
            } else {
                // Over max, limit
                if (target > pmcData.Health.BodyParts[healthModifier].Health.Maximum) {
                    target = pmcData.Health.BodyParts[healthModifier].Health.Maximum;
                }

                // Part was zeroed out in raid
                if (target === 0) {
                    // Blacked body part
                    target = Math.round(
                        pmcData.Health.BodyParts[healthModifier].Health.Maximum *
                            this.healthConfig.healthMultipliers.blacked,
                    );
                }

                pmcData.Health.BodyParts[healthModifier].Health.Current = Math.round(target);
            }
        }
    }

    /**
     * Save effects to profile
     * Works by removing all effects and adding them back from profile
     * Removes empty 'Effects' objects if found
     * @param pmcData Player profile
     * @param sessionId Session id
     * @param bodyPartsWithEffects dict of body parts with effects that should be added to profile
     * @param addEffects Should effects be added back to profile
     */
    protected saveEffects(
        pmcData: IPmcData,
        sessionId: string,
        bodyPartsWithEffects: IEffects,
        deleteExistingEffects = true,
    ): void {
        if (!this.healthConfig.save.effects) {
            return;
        }

        for (const bodyPart in bodyPartsWithEffects) {
            // clear effects from profile bodyPart
            if (deleteExistingEffects) {
                // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the effect.
                delete pmcData.Health.BodyParts[bodyPart].Effects;
            }

            for (const effectType in bodyPartsWithEffects[bodyPart]) {
                if (typeof effectType !== "string") {
                    this.logger.warning(`Effect ${effectType} on body part ${bodyPart} not a string, report this`);
                }

                // // data can be index or the effect string (e.g. "Fracture") itself
                // const effect = /^-?\d+$/.test(effectValue) // is an int
                //     ? nodeEffects[bodyPart][effectValue]
                //     : effectValue;
                let time = bodyPartsWithEffects[bodyPart][effectType];
                if (time) {
                    // Sometimes the value can be Infinity instead of -1, blame HealthListener.cs in modules
                    if (time === "Infinity") {
                        this.logger.warning(
                            `Effect ${effectType} found with value of Infinity, changed to -1, this is an issue with HealthListener.cs`,
                        );
                        time = -1;
                    }
                    this.addEffect(pmcData, bodyPart, effectType, time);
                } else {
                    this.addEffect(pmcData, bodyPart, effectType);
                }
            }
        }
    }

    /**
     * Add effect to body part in profile
     * @param pmcData Player profile
     * @param effectBodyPart body part to edit
     * @param effectType Effect to add to body part
     * @param duration How long the effect has left in seconds (-1 by default, no duration).
     */
    protected addEffect(pmcData: IPmcData, effectBodyPart: string, effectType: string, duration = -1): void {
        const profileBodyPart = pmcData.Health.BodyParts[effectBodyPart];
        if (!profileBodyPart.Effects) {
            profileBodyPart.Effects = {};
        }

        profileBodyPart.Effects[effectType] = { Time: duration };

        // Delete empty property to prevent client bugs
        if (this.isEmpty(profileBodyPart.Effects)) {
            // biome-ignore lint/performance/noDelete: Delete is fine here, we're removing an empty property to prevent game bugs.
            delete profileBodyPart.Effects;
        }
    }

    protected isEmpty(map: Record<string, { Time: number }>): boolean {
        for (const key in map) {
            if (key in map) {
                return false;
            }
        }

        return true;
    }
}
