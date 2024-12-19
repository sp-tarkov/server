import * as readline from "node:readline";

export class ProgressWriter {
    private count = 0;
    private total?: number;
    private done = false;

    constructor(total: number) {
        this.total = total;
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

        // reduce bar fill max to 50 characters to save space
        const progressHalved = Math.floor(progress / 4);

        const barFill = "=".repeat(progressHalved);
        const barEmptySpace = " ".repeat(Math.floor(25 - progressHalved));

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
