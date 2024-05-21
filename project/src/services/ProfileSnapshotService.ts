import { inject, injectable } from "tsyringe";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { ICloner } from "@spt/utils/cloners/ICloner";

@injectable()
export class ProfileSnapshotService
{
    protected storedProfileSnapshots: Record<string, ISptProfile> = {};

    constructor(@inject("RecursiveCloner") protected cloner: ICloner)
    {}

    /**
     * Store a profile into an in-memory object
     * @param sessionID session id - acts as the key
     * @param profile - profile to save
     */
    public storeProfileSnapshot(sessionID: string, profile: ISptProfile): void
    {
        this.storedProfileSnapshots[sessionID] = this.cloner.clone(profile);
    }

    /**
     * Retreve a stored profile
     * @param sessionID key
     * @returns A player profile object
     */
    public getProfileSnapshot(sessionID: string): ISptProfile
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
