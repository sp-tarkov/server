import { inject, injectable } from "tsyringe";

import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { IHideoutImprovement, Productive, TraderInfo } from "@spt-aki/models/eft/common/tables/IBotBase";
import { ProfileChange, TraderData } from "@spt-aki/models/eft/itemEvent/IItemEventRouterBase";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class EventOutputHolder
{
    /** What has client been informed of this game session */
    protected clientActiveSessionStorage: Record<string, { clientInformed: boolean; }> = {};

    constructor(
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
    )
    {}

    // TODO REMEMBER TO CHANGE OUTPUT
    protected output: IItemEventRouterResponse = { warnings: [], profileChanges: {} };

    public getOutput(sessionID: string): IItemEventRouterResponse
    {
        if (!this.output.profileChanges[sessionID])
        {
            this.resetOutput(sessionID);
        }

        return this.output;
    }

    /**
     * Reset the response object to a default state
     * Occurs prior to event being handled by server
     * @param sessionID Players id
     */
    public resetOutput(sessionID: string): void
    {
        const pmcData: IPmcData = this.profileHelper.getPmcProfile(sessionID);

        this.output.warnings = [];
        this.output.profileChanges[sessionID] = {
            _id: sessionID,
            experience: pmcData.Info.Experience,
            quests: [],
            ragFairOffers: [],
            weaponBuilds: [],
            equipmentBuilds: [],
            items: { new: [], change: [], del: [] },
            production: {},
            improvements: {},
            skills: { Common: [], Mastering: [], Points: 0 },
            health: this.jsonUtil.clone(pmcData.Health),
            traderRelations: {},
            // changedHideoutStashes: {},
            recipeUnlocked: {},
            questsStatus: [],
        };
    }

    /**
     * Update output object with most recent values from player profile
     * @param sessionId Session id
     */
    public updateOutputProperties(sessionId: string): void
    {
        const pmcData: IPmcData = this.profileHelper.getPmcProfile(sessionId);
        const profileChanges: ProfileChange = this.output.profileChanges[sessionId];

        profileChanges.experience = pmcData.Info.Experience;
        profileChanges.health = this.jsonUtil.clone(pmcData.Health);
        profileChanges.skills.Common = this.jsonUtil.clone(pmcData.Skills.Common); // Always send skills for Item event route response
        profileChanges.skills.Mastering = this.jsonUtil.clone(pmcData.Skills.Mastering);

        // Clone productions to ensure we preseve the profile jsons data
        profileChanges.production = this.getProductionsFromProfileAndFlagComplete(
            this.jsonUtil.clone(pmcData.Hideout.Production),
        );
        profileChanges.improvements = this.jsonUtil.clone(this.getImprovementsFromProfileAndFlagComplete(pmcData));
        profileChanges.traderRelations = this.constructTraderRelations(pmcData.TradersInfo);

        // Fixes container craft from water collector not resetting after collection + removed completed normal crafts
        this.cleanUpCompleteCraftsInProfile(pmcData.Hideout.Production);
    }

    /**
     * Convert the internal trader data object into an object we can send to the client
     * @param traderData server data for traders
     * @returns dict of trader id + TraderData
     */
    protected constructTraderRelations(traderData: Record<string, TraderInfo>): Record<string, TraderData>
    {
        const result: Record<string, TraderData> = {};

        for (const traderId in traderData)
        {
            const baseData = traderData[traderId];
            result[traderId] = {
                salesSum: baseData.salesSum,
                disabled: baseData.disabled,
                loyalty: baseData.loyaltyLevel,
                standing: baseData.standing,
                unlocked: baseData.unlocked,
            };
        }

        return result;
    }

    /**
     * Return all hideout Improvements from player profile, adjust completed Improvements' completed property to be true
     * @param pmcData Player profile
     * @returns dictionary of hideout improvements
     */
    protected getImprovementsFromProfileAndFlagComplete(pmcData: IPmcData): Record<string, IHideoutImprovement>
    {
        for (const improvementKey in pmcData.Hideout.Improvement)
        {
            const improvement = pmcData.Hideout.Improvement[improvementKey];

            // Skip completed
            if (improvement.completed)
            {
                continue;
            }

            if (improvement.improveCompleteTimestamp < this.timeUtil.getTimestamp())
            {
                improvement.completed = true;
            }
        }

        return pmcData.Hideout.Improvement;
    }

    /**
     * Return productions from player profile except those completed crafts the client has already seen
     * @param pmcData Player profile
     * @returns dictionary of hideout productions
     */
    protected getProductionsFromProfileAndFlagComplete(
        productions: Record<string, Productive>,
    ): Record<string, Productive>
    {
        for (const productionKey in productions)
        {
            const production = productions[productionKey];
            if (!production)
            {
                // Could be cancelled production, skip item to save processing
                continue;
            }

            // Complete and is Continuous e.g. water collector
            if (production.sptIsComplete && production.sptIsContinuous)
            {
                continue;
            }

            // Skip completed
            if (!production.inProgress)
            {
                continue;
            }

            // Client informed of craft, remove from data returned
            if (this.clientActiveSessionStorage[productionKey]?.clientInformed)
            {
                delete productions[productionKey];

                continue;
            }

            // Flag started craft as having been seen by client
            if (production.Progress > 0 && !this.clientActiveSessionStorage[productionKey]?.clientInformed)
            {
                this.clientActiveSessionStorage[productionKey] = { clientInformed: true };
            }
        }

        // Return null if there's no crafts to send to client to match live behaviour
        return (Object.keys(productions).length > 0) ? productions : null;
    }

    /**
     * Required as continuous productions don't reset and stay at 100% completion but client thinks it hasn't started
     * @param productions Productions in a profile
     */
    protected cleanUpCompleteCraftsInProfile(productions: Record<string, Productive>): void
    {
        for (const productionKey in productions)
        {
            const production = productions[productionKey];
            if (production?.sptIsComplete && production?.sptIsContinuous)
            {
                // Water collector / Bitcoin etc
                production.sptIsComplete = false;
                production.Progress = 0;
                production.StartTimestamp = this.timeUtil.getTimestamp();
            }
            else if (!production?.inProgress)
            {
                // Normal completed craft, delete
                delete productions[productionKey];
            }
        }
    }
}
