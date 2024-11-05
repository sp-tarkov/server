import { SaveServer } from "@spt/servers/SaveServer";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class MatchLocationService {
    protected locations = {};

    constructor(
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
    ) {}

    public deleteGroup(info: any): void {
        for (const locationID in this.locations) {
            for (const groupID in this.locations[locationID].groups) {
                if (groupID === info.groupId) {
                    delete this.locations[locationID].groups[groupID];
                    return;
                }
            }
        }
    }
}
