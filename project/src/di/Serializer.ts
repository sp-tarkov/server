import { IncomingMessage, ServerResponse } from "node:http";

export class Serializer {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public serialize(sessionID: string, req: IncomingMessage, resp: ServerResponse, body: any): void {
        throw new Error("Should be extended and overrode");
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public canHandle(something: string): boolean {
        throw new Error("Should be extended and overrode");
    }
}
