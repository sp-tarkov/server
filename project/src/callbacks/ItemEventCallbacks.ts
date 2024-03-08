import { inject, injectable } from "tsyringe";

import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { Warning } from "@spt-aki/models/eft/itemEvent/IItemEventRouterBase";
import { IItemEventRouterRequest } from "@spt-aki/models/eft/itemEvent/IItemEventRouterRequest";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { BackendErrorCodes } from "@spt-aki/models/enums/BackendErrorCodes";
import { ItemEventRouter } from "@spt-aki/routers/ItemEventRouter";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";

@injectable()
export class ItemEventCallbacks
{
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ItemEventRouter") protected itemEventRouter: ItemEventRouter,
    )
    {}

    public handleEvents(
        url: string,
        info: IItemEventRouterRequest,
        sessionID: string,
    ): IGetBodyResponseData<IItemEventRouterResponse>
    {
        const eventResponse = this.itemEventRouter.handleEvents(info, sessionID);
        const result = (this.isCriticalError(eventResponse.warnings))
            ? this.httpResponse.getBody(
                eventResponse,
                this.getErrorCode(eventResponse.warnings),
                eventResponse.warnings[0].errmsg,
            )
            : this.httpResponse.getBody(eventResponse);

        return result;
    }

    /**
     * Return true if the passed in list of warnings contains critical issues
     * @param warnings The list of warnings to check for critical errors
     * @returns
     */
    private isCriticalError(warnings: Warning[]): boolean
    {
        // List of non-critical error codes, we return true if any error NOT included is passed in
        const nonCriticalErrorCodes: BackendErrorCodes[] = [BackendErrorCodes.NOTENOUGHSPACE];

        for (const warning of warnings)
        {
            if (!nonCriticalErrorCodes.includes(+warning.code))
            {
                return true;
            }
        }

        return false;
    }

    protected getErrorCode(warnings: Warning[]): number
    {
        if (warnings[0]?.code)
        {
            return Number(warnings[0].code);
        }
        return BackendErrorCodes.UNKNOWN_ERROR;
    }
}
