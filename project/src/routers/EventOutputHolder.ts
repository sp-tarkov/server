import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import {
    IHideoutImprovement,
    IMoneyTransferLimits,
    IProductive,
    ITraderInfo,
} from "@spt/models/eft/common/tables/IBotBase";
import { IProfileChange, ITraderData } from "@spt/models/eft/itemEvent/IItemEventRouterBase";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class EventOutputHolder {
    /**
     * What has client been informed of this game session
     * Key = sessionId, then second key is prod id
     */
    protected clientActiveSessionStorage: Record<string, Record<string, { clientInformed: boolean }>> = {};
    protected outputStore: Record<string, IItemEventRouterResponse> = {};

    constructor(
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    public getOutput(sessionID: string): IItemEventRouterResponse {
        if (!this.outputStore[sessionID]?.profileChanges[sessionID]) {
            this.resetOutput(sessionID);
        }

        return this.outputStore[sessionID];
    }

    /**
     * Reset the response object to a default state
     * Occurs prior to event being handled by server
     * @param sessionID Players id
     */
    public resetOutput(sessionID: string): void {
        const pmcData: IPmcData = this.profileHelper.getPmcProfile(sessionID);

        this.outputStore[sessionID] = { warnings: [], profileChanges: {} };
        this.outputStore[sessionID].profileChanges[sessionID] = {
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
            health: this.cloner.clone(pmcData.Health),
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
    public updateOutputProperties(sessionId: string): void {
        const pmcData: IPmcData = this.profileHelper.getPmcProfile(sessionId);
        const profileChanges: IProfileChange = this.outputStore[sessionId].profileChanges[sessionId];

        profileChanges.experience = pmcData.Info.Experience;
        profileChanges.health = this.cloner.clone(pmcData.Health);
        profileChanges.skills.Common = this.cloner.clone(pmcData.Skills.Common); // Always send skills for Item event route response
        profileChanges.skills.Mastering = this.cloner.clone(pmcData.Skills.Mastering);

        // Clone productions to ensure we preseve the profile jsons data
        profileChanges.production = this.getProductionsFromProfileAndFlagComplete(
            this.cloner.clone(pmcData.Hideout.Production),
            sessionId,
        );
        profileChanges.improvements = this.cloner.clone(this.getImprovementsFromProfileAndFlagComplete(pmcData));
        profileChanges.traderRelations = this.constructTraderRelations(pmcData.TradersInfo);

        this.resetMoneyTransferLimit(pmcData.moneyTransferLimitData);
        profileChanges.moneyTransferLimitData = pmcData.moneyTransferLimitData;

        // Fixes container craft from water collector not resetting after collection + removed completed normal crafts
        this.cleanUpCompleteCraftsInProfile(pmcData.Hideout.Production);
    }

    protected resetMoneyTransferLimit(limit: IMoneyTransferLimits) {
        if (limit.nextResetTime < this.timeUtil.getTimestamp()) {
            limit.nextResetTime += limit.resetInterval;
            limit.remainingLimit = limit.totalLimit;
        }
    }

    /**
     * Convert the internal trader data object into an object we can send to the client
     * @param traderData server data for traders
     * @returns dict of trader id + TraderData
     */
    protected constructTraderRelations(traderData: Record<string, ITraderInfo>): Record<string, ITraderData> {
        const result: Record<string, ITraderData> = {};

        for (const traderId in traderData) {
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
    protected getImprovementsFromProfileAndFlagComplete(pmcData: IPmcData): Record<string, IHideoutImprovement> {
        for (const improvementKey in pmcData.Hideout.Improvements) {
            const improvement = pmcData.Hideout.Improvements[improvementKey];

            // Skip completed
            if (improvement.completed) {
                continue;
            }

            if (improvement.improveCompleteTimestamp < this.timeUtil.getTimestamp()) {
                improvement.completed = true;
            }
        }

        return pmcData.Hideout.Improvements;
    }

    /**
     * Return productions from player profile except those completed crafts the client has already seen
     * @param pmcData Player profile
     * @returns dictionary of hideout productions
     */
    protected getProductionsFromProfileAndFlagComplete(
        productions: Record<string, IProductive>,
        sessionId: string,
    ): Record<string, IProductive> | undefined {
        for (const productionKey in productions) {
            const production = productions[productionKey];
            if (!production) {
                // Could be cancelled production, skip item to save processing
                continue;
            }

            // Complete and is Continuous e.g. water collector
            if (production.sptIsComplete && production.sptIsContinuous) {
                continue;
            }

            // Skip completed
            if (!production.inProgress) {
                continue;
            }

            // Client informed of craft, remove from data returned
            let storageForSessionId = this.clientActiveSessionStorage[sessionId];
            if (typeof storageForSessionId === "undefined") {
                this.clientActiveSessionStorage[sessionId] = {};
                storageForSessionId = this.clientActiveSessionStorage[sessionId];
            }

            // Ensure we don't inform client of production again
            if (storageForSessionId[productionKey]?.clientInformed) {
                delete productions[productionKey];

                continue;
            }

            // Flag started craft as having been seen by client so it won't happen subsequent times
            if (production.Progress > 0 && !storageForSessionId[productionKey]?.clientInformed) {
                storageForSessionId[productionKey] = { clientInformed: true };
            }
        }

        // Return undefined if there's no crafts to send to client to match live behaviour
        return Object.keys(productions).length > 0 ? productions : undefined;
    }

    /**
     * Required as continuous productions don't reset and stay at 100% completion but client thinks it hasn't started
     * @param productions Productions in a profile
     */
    protected cleanUpCompleteCraftsInProfile(productions: Record<string, IProductive>): void {
        for (const productionKey in productions) {
            const production = productions[productionKey];
            if (production?.sptIsComplete && production?.sptIsContinuous) {
                // Water collector / Bitcoin etc
                production.sptIsComplete = false;
                production.Progress = 0;
                production.StartTimestamp = this.timeUtil.getTimestamp().toString();
            } else if (!production?.inProgress) {
                // Normal completed craft, delete
                delete productions[productionKey];
            }
        }
    }
}
