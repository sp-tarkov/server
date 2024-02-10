import { inject, injectable } from "tsyringe";

import { ICreateGroupRequestData } from "@spt-aki/models/eft/match/ICreateGroupRequestData";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";

@injectable()
export class MatchLocationService
{
    protected locations = {};

    constructor(
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
    )
    {}

    public createGroup(sessionID: string, info: ICreateGroupRequestData): any
    {
        const account = this.saveServer.getProfile(sessionID).info;
        const groupID = "test";

        this.locations[info.location].groups[groupID] = {
            _id: groupID,
            owner: account.id,
            location: info.location,
            gameVersion: "live",
            region: "EUR",
            status: "wait",
            isSavage: false,
            timeShift: "CURR",
            dt: this.timeUtil.getTimestamp(),
            players: [{ _id: account.id, region: "EUR", ip: "127.0.0.1", savageId: account.scavId, accessKeyId: "" }],
            customDataCenter: [],
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
