import * as readline from "node:readline";

export class ProgressWriter {
    private count = 0;
    private total?: number;
    private done = false;
    private barFillChar: string;
    private barEmptyChar: string;
    private maxBarLength: number;

    constructor(total: number, maxBarLength = 25, barFillChar = "\u2593", barEmptyChar = "\u2591") {
        if (total <= 0) {
            throw new Error("Total must be a positive number.");
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

        const progress = this.count / this.total;
        const percent = Math.floor(progress * 100);

        const filledChars = Math.floor(progress * this.maxBarLength);
        const emptyChars = this.maxBarLength - filledChars;

        const barFill = this.barFillChar.repeat(filledChars);
        const barEmptySpace = this.barEmptyChar.repeat(emptyChars);

        const progressBar = `-> ${this.count} / ${this.total} ${barFill}${barEmptySpace} ${percent}% `;

        readline.cursorTo(process.stdout, 0, null);
        process.stdout.write(progressBar);

        if (percent >= 100) {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0, null);
            this.done = true;
        }
    }
}
