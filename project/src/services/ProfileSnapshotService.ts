import { inject, injectable } from "tsyringe";

import { IAkiProfile } from "@spt-aki/models/eft/profile/IAkiProfile";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

@injectable()
export class ProfileSnapshotService
{
    protected storedProfileSnapshots: Record<string, IAkiProfile> = {};

    constructor(@inject("JsonUtil") protected jsonUtil: JsonUtil)
    {}

    /**
     * Store a profile into an in-memory object
     * @param sessionID session id - acts as the key
     * @param profile - profile to save
     */
    public storeProfileSnapshot(sessionID: string, profile: IAkiProfile): void
    {
        this.storedProfileSnapshots[sessionID] = this.jsonUtil.clone(profile);
    }

    /**
     * Retreve a stored profile
     * @param sessionID key
     * @returns A player profile object
     */
    public getProfileSnapshot(sessionID: string): IAkiProfile
    {
        if (this.storedProfileSnapshots[sessionID])
        {
            return this.storedProfileSnapshots[sessionID];
        }

        return null;
    }

    /**
     * Does a profile exists against the provided key
     * @param sessionID key
     * @returns true if exists
     */
    public hasProfileSnapshot(sessionID: string): boolean
    {
        if (this.storedProfileSnapshots[sessionID])
        {
            return true;
        }

        return false;
    }

    /**
     * Remove a stored profile by key
     * @param sessionID key
     */
    public clearProfileSnapshot(sessionID: string): void
    {
        delete this.storedProfileSnapshots[sessionID];
    }
}
