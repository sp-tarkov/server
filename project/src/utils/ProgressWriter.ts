export class ProgressWriter {
    count = 0;
    total: number;
    done = false;

    constructor(total: number) {
        this.total = total;
    }

    public increment(): void {
        if (this.done) {
            return;
        }

        this.count++;

        const progress = Math.floor((this.count / this.total) * 100);

        // reduce bar fill max to 50 characters to save space
        const progressHalved = Math.floor(progress / 2);

        const barFill = "=".repeat(progressHalved);
        const barEmptySpace = " ".repeat(Math.floor(50 - progressHalved));

        const progressBar = `  -> ${this.count} / ${this.total} [${barFill}${barEmptySpace}] ${progress}%`;

        process.stdout.write(progressBar);
        process.stdout.cursorTo(0);

        if (progress === 100) {
            process.stdout.write("\n");
            this.done = true;
        }
    }
}
