export class Serializer {
    public async serialize(sessionID: string, req: Request, body: any): Promise<Response> {
        throw new Error("Should be extended and overrode");
    }

    public canHandle(something: string): boolean {
        throw new Error("Should be extended and overrode");
    }
}
