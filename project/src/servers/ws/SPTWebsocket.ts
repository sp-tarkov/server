import WebSocket from "ws";

class SPTWebSocket extends WebSocket {
    // biome-ignore lint/suspicious/noExplicitAny: Any is required here, I dont see any other way considering it will complain if we use BufferLike
    public sendAsync(ws: WebSocket, data: any): Promise<void> {
        return new Promise((resolve, reject) => {
            ws.send(data, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
}