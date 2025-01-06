import { IClientLogRequest } from "@spt/models/spt/logging/IClientLogRequest";
import { LogBackgroundColor } from "@spt/models/spt/logging/LogBackgroundColor";
import { LogLevel } from "@spt/models/spt/logging/LogLevel";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { inject, injectable } from "tsyringe";

@injectable()
export class ClientLogController {
    constructor(@inject("PrimaryLogger") protected logger: ILogger) {}

    /**
     * Handle /singleplayer/log
     */
    public clientLog(logRequest: IClientLogRequest): void {
        const message = `[${logRequest.Source}] ${logRequest.Message}`;
        const color = logRequest.Color ?? LogTextColor.WHITE;
        const backgroundColor = logRequest.BackgroundColor ?? LogBackgroundColor.DEFAULT;

        // Allow supporting either string or enum levels
        // Required due to the C# modules serializing enums as their name
        let level = logRequest.Level;
        if (typeof level === "string") {
            level = LogLevel[level.toUpperCase() as keyof typeof LogLevel];
        }

        switch (level) {
            case LogLevel.ERROR:
                this.logger.error(message);
                break;
            case LogLevel.WARN:
                this.logger.warning(message);
                break;
            case LogLevel.SUCCESS:
                this.logger.success(message);
                break;
            case LogLevel.INFO:
                this.logger.info(message);
                break;
            case LogLevel.CUSTOM:
                this.logger.log(message, color, backgroundColor);
                break;
            case LogLevel.DEBUG:
                this.logger.debug(message);
                break;
            default:
                this.logger.info(message);
        }
    }
}
