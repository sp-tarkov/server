import { inject, injectable } from "tsyringe";

import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Note } from "@spt-aki/models/eft/common/tables/IBotBase";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { INoteActionData } from "@spt-aki/models/eft/notes/INoteActionData";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";

@injectable()
export class NoteController
{
    constructor(@inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder)
    {}

    public addNote(pmcData: IPmcData, body: INoteActionData, sessionID: string): IItemEventRouterResponse
    {
        const newNote: Note = { Time: body.note.Time, Text: body.note.Text };
        pmcData.Notes.Notes.push(newNote);

        return this.eventOutputHolder.getOutput(sessionID);
    }

    public editNote(pmcData: IPmcData, body: INoteActionData, sessionID: string): IItemEventRouterResponse
    {
        const noteToEdit: Note = pmcData.Notes.Notes[body.index];
        noteToEdit.Time = body.note.Time;
        noteToEdit.Text = body.note.Text;

        return this.eventOutputHolder.getOutput(sessionID);
    }

    public deleteNote(pmcData: IPmcData, body: INoteActionData, sessionID: string): IItemEventRouterResponse
    {
        pmcData.Notes.Notes.splice(body.index, 1);
        return this.eventOutputHolder.getOutput(sessionID);
    }
}
