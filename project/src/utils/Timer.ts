export class Timer {
    private startTime: bigint = process.hrtime.bigint();

    /**
     * Resets the timer to its initial state.
     */
    public restart(): void {
        this.startTime = process.hrtime.bigint();
    }

    /**
     * Returns the elapsed time in the specified unit with up to four decimal places of precision for ms and sec.
     *
     * @param unit The desired unit for the elapsed time ("ns", "ms", "sec").
     * @returns The elapsed time in the specified unit.
     */
    public getTime(unit: "ns" | "ms" | "sec"): number {
        const elapsedTime = process.hrtime.bigint() - this.startTime;

        switch (unit) {
            case "ns":
                return Number(elapsedTime);
            case "ms": {
                const ms = Number(elapsedTime) / 1_000_000;
                return Number(ms.toFixed(3));
            }
            default: {
                const sec = Number(elapsedTime) / 1_000_000_000;
                return Number(sec.toFixed(4));
            }
        }
    }
}
