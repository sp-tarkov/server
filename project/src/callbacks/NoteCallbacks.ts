import { NoteController } from "@spt/controllers/NoteController";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import type { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import type { INoteActionData } from "@spt/models/eft/notes/INoteActionData";
import { inject, injectable } from "tsyringe";

@injectable()
export class NoteCallbacks {
    constructor(@inject("NoteController") protected noteController: NoteController) {}

    /** Handle AddNote event */
    public addNote(pmcData: IPmcData, body: INoteActionData, sessionID: string): IItemEventRouterResponse {
        return this.noteController.addNote(pmcData, body, sessionID);
    }

    /** Handle EditNote event */
    public editNote(pmcData: IPmcData, body: INoteActionData, sessionID: string): IItemEventRouterResponse {
        return this.noteController.editNote(pmcData, body, sessionID);
    }

    /** Handle DeleteNote event */
    public deleteNote(pmcData: IPmcData, body: INoteActionData, sessionID: string): IItemEventRouterResponse {
        return this.noteController.deleteNote(pmcData, body, sessionID);
    }
}
