/**
 * A utility class for measuring elapsed time using high-resolution nanosecond precision.
 */
export class BunTimer {
    private startTime: number;
    private endTime: number;

    /**
     * Initializes a new instance of the `BunTimer` class and starts the timer.
     */
    constructor() {
        this.start();
    }

    /**
     * Starts or restarts the timer.
     */
    public start(): void {
        this.startTime = Bun.nanoseconds();
    }

    /**
     * Stops the timer and returns the elapsed time.
     *
     * @returns {Object} An object containing the elapsed time in nanoseconds, milliseconds, and seconds.
     * @returns {number} ns - The elapsed time in nanoseconds.
     * @returns {number} ms - The elapsed time in milliseconds.
     * @returns {number} sec - The elapsed time in seconds.
     */
    public finish(): { ns: number; ms: number; sec: number } {
        this.endTime = Bun.nanoseconds();
        return {
            ns: this.endTime - this.startTime,
            ms: (this.endTime - this.startTime) / 1_000_000,
            sec: (this.endTime - this.startTime) / 1_000_000 / 1000,
        };
    }
}
