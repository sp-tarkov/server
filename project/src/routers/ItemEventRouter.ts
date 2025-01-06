import { ItemEventRouterDefinition } from "@spt/di/Router";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IItemEventRouterRequest } from "@spt/models/eft/itemEvent/IItemEventRouterRequest";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { LocalisationService } from "@spt/services/LocalisationService";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectAll, injectable } from "tsyringe";

@injectable()
export class ItemEventRouter {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @injectAll("IERouters") protected itemEventRouters: ItemEventRouterDefinition[],
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    /**
     * @param info Event request
     * @param sessionID Session id
     * @returns Item response
     */
    public async handleEvents(info: IItemEventRouterRequest, sessionID: string): Promise<IItemEventRouterResponse> {
        const output = this.eventOutputHolder.getOutput(sessionID);

        for (const body of info.data) {
            const pmcData = this.profileHelper.getPmcProfile(sessionID);

            const eventRouter = this.itemEventRouters.find((r) => r.canHandle(body.Action));
            if (eventRouter) {
                this.logger.debug(`event: ${body.Action}`);
                await eventRouter.handleItemEvent(body.Action, pmcData, body, sessionID, output);
                if (output.warnings.length > 0) {
                    break;
                }
            } else {
                this.logger.error(this.localisationService.getText("event-unhandled_event", body.Action));
                this.logger.writeToLogFile(body);
            }
        }

        this.eventOutputHolder.updateOutputProperties(sessionID);

        // Clone output before resetting the output object ready for use next time
        const outputClone = this.cloner.clone(output);
        this.eventOutputHolder.resetOutput(sessionID);

        return outputClone;
    }
}
