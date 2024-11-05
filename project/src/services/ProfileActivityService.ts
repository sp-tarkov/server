import { injectable } from "tsyringe";

@injectable()
export class ProfileActivityService {
    protected profileActivityTimestamps: Record<string, number> = {};

    /**
     * Was the requested profile active in the last requested minutes
     * @param sessionId Profile to check
     * @param minutes Minutes to check for activity in
     * @returns True when profile was active within past x minutes
     */
    public activeWithinLastMinutes(sessionId: string, minutes: number): boolean {
        const currentTimestamp = new Date().getTime() / 1000;
        const storedActivityTimestamp = this.profileActivityTimestamps[sessionId];
        if (!storedActivityTimestamp) {
            // No value, no assumed activity (server offline?)
            return false;
        }

        // True if difference since last timestamp to now is below desired amount
        return currentTimestamp - storedActivityTimestamp < minutes * 60; // convert minutes to seconds to compare
    }

    /**
     * Get an array of profile ids that were active in the last x minutes
     * @param minutes How many minutes from now to search for profiles
     * @returns String array of profile ids
     */
    public getActiveProfileIdsWithinMinutes(minutes: number): string[] {
        const currentTimestamp = new Date().getTime() / 1000;
        const result: string[] = [];

        for (const id of Object.keys(this.profileActivityTimestamps ?? {})) {
            const lastActiveTimestamp = this.profileActivityTimestamps[id];
            if (!lastActiveTimestamp) {
                continue;
            }

            // Profile was active in last x minutes, add to return list
            if (currentTimestamp - lastActiveTimestamp < minutes * 60) {
                result.push(id);
            }
        }

        return result;
    }

    /**
     * Update the timestamp a profile was last observed active
     * @param sessionId Profile to update
     */
    public setActivityTimestamp(sessionId: string): void {
        this.profileActivityTimestamps[sessionId] = new Date().getTime() / 1000;
    }
}
