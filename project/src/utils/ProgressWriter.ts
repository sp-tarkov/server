import * as readline from "node:readline";

export class ProgressWriter {
    private count = 0;
    private total?: number;
    private done = false;
    private barFillChar: string;
    private barEmptyChar: string;
    private maxBarLength: number;

    constructor(total: number, maxBarLength = 25, barFillChar = "\u25A0", barEmptyChar = " ") {
        if (total <= 0) {
            throw new Error("Total must be a positive number.");
        }
        if ((barFillChar && barFillChar.length !== 1) || (barEmptyChar && barEmptyChar.length !== 1)) {
            throw new Error("Bar character values must be a single character.");
        }

        this.total = total;
        this.maxBarLength = maxBarLength;
        this.barFillChar = barFillChar;
        this.barEmptyChar = barEmptyChar;
    }

    /**
     * Increment the progress counter and update the progress bar display.
     */
    public increment(): void {
        if (this.done) {
            return;
        }

        this.count++;

        const progress = Math.floor((this.count / this.total) * 100);
        const filledChars = Math.floor((progress / 100) * this.maxBarLength);
        const emptyChars = this.maxBarLength - filledChars;

        const barFill = this.barFillChar.repeat(filledChars);
        const barEmptySpace = this.barEmptyChar.repeat(emptyChars);

        const progressBar = `  -> ${this.count} / ${this.total} [${barFill}${barEmptySpace}] ${progress}%`;

        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0, null);
        process.stdout.write(progressBar);

        if (progress === 100) {
            process.stdout.write("\n");
            this.done = true;
        }
    }
}
