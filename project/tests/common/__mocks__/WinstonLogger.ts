import { Daum } from "@spt-aki/models/eft/itemEvent/IItemEventRouterRequest";
import { LogBackgroundColor } from "@spt-aki/models/spt/logging/LogBackgroundColor";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";

export default class WinstonLogger implements ILogger {
    writeToLogFile(data: string | Daum): void {
        console.log(`writeToLogFile ${data}`);
    }
    logWithColor(
        data: string | Record<string, unknown>,
        textColor: LogTextColor,
        backgroundColor?: LogBackgroundColor | undefined
    ): void {
        console.log(`logWithColor ${data}`);
    }
    error(data: string): void {
        console.log(`error ${data}`);
    }
    warning(data: string): void {
        console.log(`warning ${data}`);
    }
    success(data: string): void {
        console.log(`success ${data}`);
    }
    info(data: string): void {
        console.log(`info ${data}`);
    }
    debug(data: string | Record<string, unknown>, onlyShowInConsole?: boolean | undefined): void {
        console.log(`debug ${data}`);
    }

    log(msg: string): void {
        console.log(msg);
    }
}
