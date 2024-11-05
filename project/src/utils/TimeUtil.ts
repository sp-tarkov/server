import { formatInTimeZone } from "date-fns-tz";
import { injectable } from "tsyringe";

/**
 * Utility class to handle time related operations.
 */
@injectable()
export class TimeUtil {
    public static readonly ONE_HOUR_AS_SECONDS = 3600; // Number of seconds in one hour.

    /**
     * Pads a number with a leading zero if it is less than 10.
     *
     * @param {number} number - The number to pad.
     * @returns {string} The padded number as a string.
     */
    protected pad(number: number): string {
        return String(number).padStart(2, "0");
    }

    /**
     * Formats the time part of a date as a UTC string.
     *
     * @param {Date} date - The date to format in UTC.
     * @returns {string} The formatted time as 'HH-MM-SS'.
     */
    public formatTime(date: Date): string {
        const hours = this.pad(date.getUTCHours());
        const minutes = this.pad(date.getUTCMinutes());
        const seconds = this.pad(date.getUTCSeconds());
        return `${hours}-${minutes}-${seconds}`;
    }

    /**
     * Formats the date part of a date as a UTC string.
     *
     * @param {Date} date - The date to format in UTC.
     * @returns {string} The formatted date as 'YYYY-MM-DD'.
     */
    public formatDate(date: Date): string {
        const day = this.pad(date.getUTCDate());
        const month = this.pad(date.getUTCMonth() + 1); // getUTCMonth returns 0-11
        const year = date.getUTCFullYear();
        return `${year}-${month}-${day}`;
    }

    /**
     * Gets the current date as a formatted UTC string.
     *
     * @returns {string} The current date as 'YYYY-MM-DD'.
     */
    public getDate(): string {
        return this.formatDate(new Date());
    }

    /**
     * Gets the current time as a formatted UTC string.
     *
     * @returns {string} The current time as 'HH-MM-SS'.
     */
    public getTime(): string {
        return this.formatTime(new Date());
    }

    /**
     * Gets the current timestamp in seconds in UTC.
     *
     * @returns {number} The current timestamp in seconds since the Unix epoch in UTC.
     */
    public getTimestamp(): number {
        return Math.floor(new Date().getTime() / 1000);
    }

    public getStartOfDayTimestamp(timestamp?: number): number {
        const now = timestamp ? new Date(timestamp) : new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const day = now.getDate();

        const todayTimestamp = new Date(year, month, day, 0, 0, 0);

        return todayTimestamp.getTime();
    }

    /**
     * Get timestamp of today + passed in day count
     * @param daysFromNow Days from now
     */
    public getTimeStampFromNowDays(daysFromNow: number): number {
        const currentTimeStamp = this.getTimestamp();
        const desiredDaysAsSeconds = this.getHoursAsSeconds(daysFromNow * 24);

        return currentTimeStamp + desiredDaysAsSeconds;
    }

    /**
     * Get timestamp of today + passed in hour count
     * @param daysFromNow Days from now
     */
    public getTimeStampFromNowHours(hoursFromNow: number): number {
        const currentTimeStamp = this.getTimestamp();
        const desiredHoursAsSeconds = this.getHoursAsSeconds(hoursFromNow);

        return currentTimeStamp + desiredHoursAsSeconds;
    }

    /**
     * Gets the current time in UTC in a format suitable for mail in EFT.
     *
     * @returns {string} The current time as 'HH:MM' in UTC.
     */
    public getTimeMailFormat(): string {
        return formatInTimeZone(new Date(), "UTC", "HH:mm");
    }

    /**
     * Gets the current date in UTC in a format suitable for emails in EFT.
     *
     * @returns {string} The current date as 'DD.MM.YYYY' in UTC.
     */
    public getDateMailFormat(): string {
        return formatInTimeZone(new Date(), "UTC", "dd.MM.yyyy");
    }

    /**
     * Converts a number of hours into seconds.
     *
     * @param {number} hours - The number of hours to convert.
     * @returns {number} The equivalent number of seconds.
     */
    public getHoursAsSeconds(hours: number): number {
        return hours * TimeUtil.ONE_HOUR_AS_SECONDS;
    }

    public getTimestampOfNextHour(): number {
        const now = new Date();
        const millisecondsUntilNextHour =
            (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();
        return (now.getTime() + millisecondsUntilNextHour) / 1000;
    }

    /**
     * Returns the current days timestamp at 00:00
     * e.g. current time: 13th march 14:22 will return 13th march 00:00
     * @returns Timestamp
     */
    public getTodaysMidnightTimestamp(): number {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes();

        // If minutes greater than 0, subtract 1 hour to get last full hour
        if (minutes > 0) {
            hours--;
        }

        // Create a new Date object with the last full hour, 0 minutes, and 0 seconds
        const lastFullHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, 0, 0);

        // Return above as timestamp
        return lastFullHour.getTime();
    }
}
