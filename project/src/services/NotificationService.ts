import type { IWsNotificationEvent } from "@spt/models/eft/ws/IWsNotificationEvent";
import { injectable } from "tsyringe";

@injectable()
export class NotificationService {
    protected messageQueue: Record<string, any[]> = {};

    public getMessageQueue(): Record<string, any[]> {
        return this.messageQueue;
    }

    public getMessageFromQueue(sessionId: string): any[] {
        return this.messageQueue[sessionId];
    }

    public updateMessageOnQueue(sessionId: string, value: any[]): void {
        this.messageQueue[sessionId] = value;
    }

    public has(sessionID: string): boolean {
        return this.get(sessionID).length > 0;
    }

    /**
     * Pop first message from queue.
     */
    public pop(sessionID: string): any {
        return this.get(sessionID).shift();
    }

    /**
     * Add message to queue
     */
    public add(sessionID: string, message: IWsNotificationEvent): void {
        this.get(sessionID).push(message);
    }

    /**
     * Get message queue for session
     * @param sessionID
     */
    public get(sessionID: string): any[] {
        if (!sessionID) {
            throw new Error("sessionID missing");
        }

        if (!this.messageQueue[sessionID]) {
            this.messageQueue[sessionID] = [];
        }

        return this.messageQueue[sessionID];
    }
}
