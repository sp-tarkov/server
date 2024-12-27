export interface IHttpListener {
    canHandle(sessionId: string, req: Request): boolean;
    handle(sessionId: string, req: Request): Promise<Response>;
}
