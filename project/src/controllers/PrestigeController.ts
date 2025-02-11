import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IPrestige } from "@spt/models/eft/common/tables/IPrestige";
import { IObtainPrestigeRequest } from "@spt/models/eft/prestige/IObtainPrestigeRequest";
import { IPendingPrestige } from "@spt/models/eft/profile/ISptProfile";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { inject, injectable } from "tsyringe";
import type { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";

@injectable()
export class PrestigeController {
    constructor(
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
    ) {}

    /**
     * Handle /client/prestige/list
     */
    public getPrestige(sessionID: string, info: IEmptyRequestData): IPrestige {
        return this.databaseService.getTemplates().prestige;
    }

    /**
     * Handle /client/prestige/obtain
     */
    public async obtainPrestige(sessionId: string, request: IObtainPrestigeRequest[]): Promise<void> {
        // Going to prestige 1
        // transfer
        // 5% of skills should be transfered over
        // 5% of mastering should be transfered over
        // earned achievements should be transfered over
        // profile stats should be transfered over
        // prestige progress should be transfered over
        // reset
        // trader standing
        // task progress
        // character level
        // stash
        // hideout progress

        const profile = this.profileHelper.getFullProfile(sessionId);

        if (profile) {
            const pendingPrestige: IPendingPrestige = {
                prestigeLevel: profile.characters.pmc.Info.PrestigeLevel + 1,
                items: request,
            };

            profile.spt.pendingPrestige = pendingPrestige;
            profile.info.wipe = true;

            await this.saveServer.saveProfile(sessionId);
        }
    }
}
