import { inject, injectAll, injectable } from "tsyringe";

import { ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { IItemEventRouterRequest } from "@spt-aki/models/eft/itemEvent/IItemEventRouterRequest";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class ItemEventRouter
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @injectAll("IERouters") protected itemEventRouters: ItemEventRouterDefinition[],
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
    )
    {}

    /**
     * @param info Event request
     * @param sessionID Session id
     * @returns Item response
     */
    public handleEvents(info: IItemEventRouterRequest, sessionID: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);

        for (const body of info.data)
        {
            const pmcData = this.profileHelper.getPmcProfile(sessionID);

            const eventRouter = this.itemEventRouters.find((r) => r.canHandle(body.Action));
            if (eventRouter)
            {
                this.logger.debug(`event: ${body.Action}`);
                eventRouter.handleItemEvent(body.Action, pmcData, body, sessionID, output);
                if (output.warnings.length > 0)
                {
                    break;
                }
            }
            else
            {
                this.logger.error(this.localisationService.getText("event-unhandled_event", body.Action));
                this.logger.writeToLogFile(body);
            }
        }

        this.eventOutputHolder.updateOutputProperties(sessionID);

        // Clone output before resetting the output object ready for use next time
        const outputClone = this.jsonUtil.clone(output);
        this.eventOutputHolder.resetOutput(sessionID);

        return outputClone;
    }
}
