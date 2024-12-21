import type { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import type { Warning } from "@spt/models/eft/itemEvent/IItemEventRouterBase";
import type { IItemEventRouterRequest } from "@spt/models/eft/itemEvent/IItemEventRouterRequest";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { BackendErrorCodes } from "@spt/models/enums/BackendErrorCodes";
import type { ItemEventRouter } from "@spt/routers/ItemEventRouter";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class ItemEventCallbacks {
    constructor(
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ItemEventRouter") protected itemEventRouter: ItemEventRouter,
    ) {}

    public async handleEvents(
        url: string,
        info: IItemEventRouterRequest,
        sessionID: string,
    ): Promise<IGetBodyResponseData<IItemEventRouterResponse>> {
        const eventResponse = await this.itemEventRouter.handleEvents(info, sessionID);
        const result = this.isCriticalError(eventResponse.warnings)
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
    private isCriticalError(warnings: Warning[]): boolean {
        // List of non-critical error codes, we return true if any error NOT included is passed in
        const nonCriticalErrorCodes: BackendErrorCodes[] = [BackendErrorCodes.NOTENOUGHSPACE];

        for (const warning of warnings) {
            if (!nonCriticalErrorCodes.includes(+(warning?.code ?? "0"))) {
                return true;
            }
        }

        return false;
    }

    protected getErrorCode(warnings: Warning[]): number {
        if (warnings[0]?.code) {
            return Number(warnings[0].code);
        }
        return BackendErrorCodes.UNKNOWN_ERROR;
    }
}
