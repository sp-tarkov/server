import { QuestCallbacks } from "@spt/callbacks/QuestCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { inject, injectable } from "tsyringe";

@injectable()
export class QuestItemEventRouter extends ItemEventRouterDefinition {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("QuestCallbacks") protected questCallbacks: QuestCallbacks,
    ) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [
            new HandledRoute("QuestAccept", false),
            new HandledRoute("QuestComplete", false),
            new HandledRoute("QuestHandover", false),
            new HandledRoute("RepeatableQuestChange", false),
        ];
    }

    public override async handleItemEvent(
        eventAction: string,
        pmcData: IPmcData,
        body: any,
        sessionID: string,
    ): Promise<IItemEventRouterResponse> {
        this.logger.debug(`${eventAction} ${body.qid}`);
        switch (eventAction) {
            case "QuestAccept":
                return this.questCallbacks.acceptQuest(pmcData, body, sessionID);
            case "QuestComplete":
                return this.questCallbacks.completeQuest(pmcData, body, sessionID);
            case "QuestHandover":
                return this.questCallbacks.handoverQuest(pmcData, body, sessionID);
            case "RepeatableQuestChange":
                return this.questCallbacks.changeRepeatableQuest(pmcData, body, sessionID);
        }
    }
}
