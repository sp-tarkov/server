import { HealthController } from "@spt/controllers/HealthController";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IHealthTreatmentRequestData } from "@spt/models/eft/health/IHealthTreatmentRequestData";
import type { IOffraidEatRequestData } from "@spt/models/eft/health/IOffraidEatRequestData";
import type { IOffraidHealRequestData } from "@spt/models/eft/health/IOffraidHealRequestData";
import type { ISyncHealthRequestData } from "@spt/models/eft/health/ISyncHealthRequestData";
import type { IWorkoutData } from "@spt/models/eft/health/IWorkoutData";
import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class HealthCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("HealthController") protected healthController: HealthController,
    ) {}

    /**
     * Custom spt server request found in modules/QTEPatch.cs
     * @param url
     * @param info HealthListener.Instance.CurrentHealth class
     * @param sessionID session id
     * @returns empty response, no data sent back to client
     */
    public handleWorkoutEffects(url: string, info: IWorkoutData, sessionID: string): IGetBodyResponseData<string> {
        this.healthController.applyWorkoutChanges(this.profileHelper.getPmcProfile(sessionID), info, sessionID);
        return this.httpResponse.emptyResponse();
    }

    /**
     * Handle Eat
     * @returns IItemEventRouterResponse
     */
    public offraidEat(pmcData: IPmcData, body: IOffraidEatRequestData, sessionID: string): IItemEventRouterResponse {
        return this.healthController.offraidEat(pmcData, body, sessionID);
    }

    /**
     * Handle Heal
     * @returns IItemEventRouterResponse
     */
    public offraidHeal(pmcData: IPmcData, body: IOffraidHealRequestData, sessionID: string): IItemEventRouterResponse {
        return this.healthController.offraidHeal(pmcData, body, sessionID);
    }

    /**
     * Handle RestoreHealth
     * @returns IItemEventRouterResponse
     */
    public healthTreatment(
        pmcData: IPmcData,
        info: IHealthTreatmentRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        return this.healthController.healthTreatment(pmcData, info, sessionID);
    }
}
