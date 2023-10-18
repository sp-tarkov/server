import { inject, injectable } from "tsyringe";

import { ICreateGroupRequestData } from "@spt-aki/models/eft/match/ICreateGroupRequestData";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class MatchLocationService
{
    protected locations = {};

    constructor(
        @inject("TimeUtil") protected timeUtil: TimeUtil
    )
    { }

    public createGroup(sessionID: string, info: ICreateGroupRequestData): any
    {
        const groupID = "test";

        this.locations[info.location].groups[groupID] = {
            "_id": groupID,
            "owner": `pmc${sessionID}`,
            "location": info.location,
            "gameVersion": "live",
            "region": "EUR",
            "status": "wait",
            "isSavage": false,
            "timeShift": "CURR",
            "dt": this.timeUtil.getTimestamp(),
            "players": [
                {
                    "_id": `pmc${sessionID}`,
                    "region": "EUR",
                    "ip": "127.0.0.1",
                    "savageId": `scav${sessionID}`,
                    "accessKeyId": ""
                }
            ],
            "customDataCenter": []
        };

        return this.locations[info.location].groups[groupID];
    }

    public deleteGroup(info: any): void
    {
        for (const locationID in this.locations)
        {
            for (const groupID in this.locations[locationID].groups)
            {
                if (groupID === info.groupId)
                {
                    delete this.locations[locationID].groups[groupID];
                    return;
                }
            }
        }
    }
}