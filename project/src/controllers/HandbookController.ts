import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { inject, injectable } from "tsyringe";

@injectable()
export class HandbookController {
    constructor(
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
    ) {}

    public load(): void {
        return;
    }
}
