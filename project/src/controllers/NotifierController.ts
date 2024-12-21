import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { NotifierHelper } from "@spt/helpers/NotifierHelper";
import type { INotifierChannel } from "@spt/models/eft/notifier/INotifier";
import { NotificationService } from "@spt/services/NotificationService";
import { inject, injectable } from "tsyringe";

@injectable()
export class NotifierController {
    protected pollInterval = 300;
    protected timeout = 15000;

    constructor(
        @inject("NotifierHelper") protected notifierHelper: NotifierHelper,
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("NotificationService") protected notificationService: NotificationService,
    ) {}

    /**
     * Resolve an array of session notifications.
     *
     * If no notifications are currently queued then intermittently check for new notifications until either
     * one or more appear or when a timeout expires.
     * If no notifications are available after the timeout, use a default message.
     */
    public async notifyAsync(sessionID: string): Promise<unknown> {
        return new Promise((resolve) => {
            // keep track of our timeout
            let counter = 0;

            /**
             * Check for notifications, resolve if any, otherwise poll
             *  intermittently for a period of time.
             */
            const checkNotifications = () => {
                /**
                 * If there are no pending messages we should either check again later
                 *  or timeout now with a default response.
                 */
                if (!this.notificationService.has(sessionID)) {
                    // have we exceeded timeout? if so reply with default ping message
                    if (counter > this.timeout) {
                        return resolve([this.notifierHelper.getDefaultNotification()]);
                    }

                    // check again
                    setTimeout(checkNotifications, this.pollInterval);

                    // update our timeout counter
                    counter += this.pollInterval;
                    return;
                }

                /**
                 * Maintaining array reference is not necessary, so we can just copy and reinitialize
                 */
                const messages = this.notificationService.get(sessionID);

                this.notificationService.updateMessageOnQueue(sessionID, []);
                resolve(messages);
            };

            // immediately check
            checkNotifications();
        });
    }

    public getServer(sessionID: string): string {
        return `${this.httpServerHelper.getBackendUrl()}/notifierServer/get/${sessionID}`;
    }

    /** Handle client/notifier/channel/create */
    public getChannel(sessionID: string): INotifierChannel {
        return {
            server: this.httpServerHelper.buildUrl(),
            channel_id: sessionID,
            url: "",
            notifierServer: this.getServer(sessionID),
            ws: this.notifierHelper.getWebSocketServer(sessionID),
        };
    }
}
