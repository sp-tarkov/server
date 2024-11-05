import { IAsyncQueue } from "@spt/models/spt/utils/IAsyncQueue";
import { ICommand } from "@spt/models/spt/utils/ICommand";

export class AsyncQueue implements IAsyncQueue {
    protected commandsQueue: ICommand[];

    constructor() {
        this.commandsQueue = [];
    }

    // Wait for the right command to execute
    // This ensures that the commands execute in the right order, thus no data corruption
    public async waitFor(command: ICommand): Promise<any> {
        // Add to the queue
        this.commandsQueue.push(command);

        while (this.commandsQueue[0].uuid !== command.uuid) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 100);
            });
        }

        // When the command is ready, execute it
        return this.commandsQueue.shift().cmd();
    }
}
