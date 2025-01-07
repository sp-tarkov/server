import WebSocket from "ws";

export class SPTWebSocket extends WebSocket {
    // biome-ignore lint/suspicious/noExplicitAny: Any is required here, I dont see any other way considering it will complain if we use BufferLike
    public sendAsync(data: any): Promise<void> {
        return new Promise((resolve, reject) => {
            this.send(data, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    public closeAsync(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.on("close", () => resolve());
            this.on("error", (err) => reject(err));
            this.close();
        });
    }
}
