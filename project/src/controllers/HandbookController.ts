import { inject, injectable } from "tsyringe";

import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";

@injectable()
export class HandbookController
{
    constructor(
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
    )
    {}

    public load(): void
    {
        return;
    }
}
