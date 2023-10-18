import { inject, injectable, injectAll } from "tsyringe";

import { ItemEventRouterDefinition } from "@spt-aki/di/Router";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { IItemEventRouterRequest } from "@spt-aki/models/eft/itemEvent/IItemEventRouterRequest";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { LocalisationService } from "@spt-aki/services/LocalisationService";

@injectable()
export class ItemEventRouter 
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @injectAll("IERouters") protected itemEventRouters: ItemEventRouterDefinition[],
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder
    ) 
    { }

    /**
     * 
     * @param info Event request
     * @param sessionID Session id
     * @returns Item response
     */
    public handleEvents(info: IItemEventRouterRequest, sessionID: string): IItemEventRouterResponse 
    {
        this.eventOutputHolder.resetOutput(sessionID);

        let result = this.eventOutputHolder.getOutput(sessionID);

        for (const body of info.data)
        {
            const pmcData = this.profileHelper.getPmcProfile(sessionID);

            const eventRouter = this.itemEventRouters.find(r => r.canHandle(body.Action));
            if (eventRouter) 
            {
                this.logger.debug(`event: ${body.Action}`);
                result = eventRouter.handleItemEvent(body.Action, pmcData, body, sessionID);
            }
            else 
            {
                this.logger.error(this.localisationService.getText("event-unhandled_event", body.Action));
                this.logger.writeToLogFile(body);
            }
        }

        this.eventOutputHolder.updateOutputProperties(sessionID);

        return result;
    }
}
