import { injectable } from "tsyringe";

/**
 * Utility class to handle time related problems
 */
@injectable()
export class TimeUtil
{
    public static readonly oneHourAsSeconds = 3600;

    public formatTime(date: Date): string
    {
        const hours = `0${date.getHours()}`.substr(-2);
        const minutes = `0${date.getMinutes()}`.substr(-2);
        const seconds = `0${date.getSeconds()}`.substr(-2);
        return `${hours}-${minutes}-${seconds}`;
    }

    public formatDate(date: Date): string
    {
        const day = `0${date.getDate()}`.substr(-2);
        const month = `0${date.getMonth() + 1}`.substr(-2);
        return `${date.getFullYear()}-${month}-${day}`;
    }

    public getDate(): string
    {
        return this.formatDate(new Date());
    }

    public getTime(): string
    {
        return this.formatTime(new Date());
    }

    /**
     * Get timestamp in seconds
     * @returns
     */
    public getTimestamp(): number
    {
        return Math.floor(new Date().getTime() / 1000);
    }

    /**
     * mail in eft requires time be in a specific format
     * @returns current time in format: 00:00 (hh:mm)
     */
    public getTimeMailFormat(): string
    {
        const date = new Date();
        const hours = `0${date.getHours()}`.substr(-2);
        const minutes = `0${date.getMinutes()}`.substr(-2);
        return `${hours}:${minutes}`;
    }

    /**
     * Mail in eft requires date be in a specific format
     * @returns current date in format: 00.00.0000 (dd.mm.yyyy)
     */
    public getDateMailFormat(): string
    {
        const date = new Date();
        const day = `0${date.getDate()}`.substr(-2);
        const month = `0${date.getMonth() + 1}`.substr(-2);
        return `${day}.${month}.${date.getFullYear()}`;
    }

    /**
     * Convert hours into seconds
     * @param hours hours to convert to seconds
     * @returns number
     */
    public getHoursAsSeconds(hours: number): number
    {
        return hours * 3600;
    }
}
