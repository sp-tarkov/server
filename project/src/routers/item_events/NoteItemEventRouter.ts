import { NoteCallbacks } from "@spt/callbacks/NoteCallbacks";
import { HandledRoute, ItemEventRouterDefinition } from "@spt/di/Router";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { INoteActionData } from "@spt/models/eft/notes/INoteActionData";
import { inject, injectable } from "tsyringe";

@injectable()
export class NoteItemEventRouter extends ItemEventRouterDefinition {
    constructor(
        @inject("NoteCallbacks") protected noteCallbacks: NoteCallbacks, // TODO: delay required
    ) {
        super();
    }

    public override getHandledRoutes(): HandledRoute[] {
        return [
            new HandledRoute("AddNote", false),
            new HandledRoute("EditNote", false),
            new HandledRoute("DeleteNote", false),
        ];
    }

    public override async handleItemEvent(
        url: string,
        pmcData: IPmcData,
        body: INoteActionData,
        sessionID: string,
    ): Promise<IItemEventRouterResponse> {
        switch (url) {
            case "AddNote":
                return this.noteCallbacks.addNote(pmcData, body, sessionID);
            case "EditNote":
                return this.noteCallbacks.editNote(pmcData, body, sessionID);
            case "DeleteNote":
                return this.noteCallbacks.deleteNote(pmcData, body, sessionID);
        }
    }
}
