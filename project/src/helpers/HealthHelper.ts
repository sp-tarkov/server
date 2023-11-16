import { inject, injectable } from "tsyringe";

import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { ISyncHealthRequestData } from "@spt-aki/models/eft/health/ISyncHealthRequestData";
import { Effects, IAkiProfile } from "@spt-aki/models/eft/profile/IAkiProfile";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { IHealthConfig } from "@spt-aki/models/spt/config/IHealthConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class HealthHelper
{
    protected healthConfig: IHealthConfig;

    constructor(
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.healthConfig = this.configServer.getConfig(ConfigTypes.HEALTH);
    }

    /**
     * Resets the profiles vitality/health and vitality/effects properties to their defaults
     * @param sessionID Session Id
     * @returns updated profile
     */
    public resetVitality(sessionID: string): IAkiProfile
    {
        const profile = this.saveServer.getProfile(sessionID);

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

    /**
     * Update player profile with changes from request object
     * @param pmcData Player profile
     * @param request Heal request
     * @param sessionID Session id
     * @param addEffects Should effects be added or removed (default - add)
     * @param deleteExistingEffects Should all prior effects be removed before apply new ones
     */
    public saveVitality(
        pmcData: IPmcData,
        request: ISyncHealthRequestData,
        sessionID: string,
        addEffects = true,
        deleteExistingEffects = true,
    ): void
    {
        const postRaidBodyParts = request.Health; // post raid health settings
        const profile = this.saveServer.getProfile(sessionID);
        const profileHealth = profile.vitality.health;
        const profileEffects = profile.vitality.effects;

        profileHealth.Hydration = request.Hydration;
        profileHealth.Energy = request.Energy;
        profileHealth.Temperature = request.Temperature;

        // Transfer properties from request to profile
        for (const bodyPart in postRaidBodyParts)
        {
            // Transfer effects from request to profile
            if (postRaidBodyParts[bodyPart].Effects)
            {
                profileEffects[bodyPart] = postRaidBodyParts[bodyPart].Effects;
            }
            if (request.IsAlive === true)
            { // is player alive, not is limb alive
                profileHealth[bodyPart] = postRaidBodyParts[bodyPart].Current;
            }
            else
            {
                profileHealth[bodyPart] = pmcData.Health.BodyParts[bodyPart].Health.Maximum
                    * this.healthConfig.healthMultipliers.death;
            }
        }

        // Add effects to body parts
        if (addEffects)
        {
            this.saveEffects(
                pmcData,
                sessionID,
                this.jsonUtil.clone(this.saveServer.getProfile(sessionID).vitality.effects),
                deleteExistingEffects,
            );
        }

        // Adjust hydration/energy/temp and limb hp
        this.saveHealth(pmcData, sessionID);

        this.resetVitality(sessionID);

        pmcData.Health.UpdateTime = this.timeUtil.getTimestamp();
    }

    /**
     * Adjust hydration/energy/temperate and body part hp values in player profile to values in profile.vitality
     * @param pmcData Profile to update
     * @param sessionId Session id
     */
    protected saveHealth(pmcData: IPmcData, sessionID: string): void
    {
        if (!this.healthConfig.save.health)
        {
            return;
        }

        const profileHealth = this.saveServer.getProfile(sessionID).vitality.health;
        for (const healthModifier in profileHealth)
        {
            let target = profileHealth[healthModifier];

            if (["Hydration", "Energy", "Temperature"].includes(healthModifier))
            {
                // Set resources
                if (target > pmcData.Health[healthModifier].Maximum)
                {
                    target = pmcData.Health[healthModifier].Maximum;
                }

                pmcData.Health[healthModifier].Current = Math.round(target);
            }
            else
            {
                // Over max, limit
                if (target > pmcData.Health.BodyParts[healthModifier].Health.Maximum)
                {
                    target = pmcData.Health.BodyParts[healthModifier].Health.Maximum;
                }

                // Part was zeroed out in raid
                if (target === 0)
                {
                    // Blacked body part
                    target = Math.round(
                        pmcData.Health.BodyParts[healthModifier].Health.Maximum
                            * this.healthConfig.healthMultipliers.blacked,
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
        bodyPartsWithEffects: Effects,
        deleteExistingEffects = true,
    ): void
    {
        if (!this.healthConfig.save.effects)
        {
            return;
        }

        for (const bodyPart in bodyPartsWithEffects)
        {
            // clear effects from profile bodyPart
            if (deleteExistingEffects)
            {
                delete pmcData.Health.BodyParts[bodyPart].Effects;
            }

            for (const effectType in bodyPartsWithEffects[bodyPart])
            {
                if (typeof effectType !== "string")
                {
                    this.logger.warning(`Effect ${effectType} on body part ${bodyPart} not a string, report this`);
                }

                // // data can be index or the effect string (e.g. "Fracture") itself
                // const effect = /^-?\d+$/.test(effectValue) // is an int
                //     ? nodeEffects[bodyPart][effectValue]
                //     : effectValue;
                let time = bodyPartsWithEffects[bodyPart][effectType];
                if (time)
                {
                    // Sometimes the value can be Infinity instead of -1, blame HealthListener.cs in modules
                    if (time === "Infinity")
                    {
                        this.logger.warning(
                            `Effect ${effectType} found with value of Infinity, changed to -1, this is an issue with HealthListener.cs`,
                        );
                        time = -1;
                    }
                    this.addEffect(pmcData, bodyPart, effectType, time);
                }
                else
                {
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
    protected addEffect(pmcData: IPmcData, effectBodyPart: string, effectType: string, duration = -1): void
    {
        const profileBodyPart = pmcData.Health.BodyParts[effectBodyPart];
        if (!profileBodyPart.Effects)
        {
            profileBodyPart.Effects = {};
        }

        profileBodyPart.Effects[effectType] = { Time: duration };

        // Delete empty property to prevent client bugs
        if (this.isEmpty(profileBodyPart.Effects))
        {
            delete profileBodyPart.Effects;
        }
    }

    protected isEmpty(map: Record<string, { Time: number; }>): boolean
    {
        for (const key in map)
        {
            if (key in map)
            {
                return false;
            }
        }

        return true;
    }
}
