import { IncomingMessage, ServerResponse } from "node:http";

export class Serializer {
    public serialize(sessionID: string, req: IncomingMessage, resp: ServerResponse, body: any): void {
        throw new Error("Should be extended and overrode");
    }

    public canHandle(something: string): boolean {
        throw new Error("Should be extended and overrode");
    }
}
