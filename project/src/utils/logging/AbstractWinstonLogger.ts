import fs from "fs";
import { promisify } from "util";
import winston, { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

import { Daum } from "../../models/eft/itemEvent/IItemEventRouterRequest";
import { LogBackgroundColor } from "../../models/spt/logging/LogBackgroundColor";
import { LogTextColor } from "../../models/spt/logging/LogTextColor";
import { SptLogger } from "../../models/spt/logging/SptLogger";
import { IAsyncQueue } from "../../models/spt/utils/IAsyncQueue";
import { ICommand } from "../../models/spt/utils/ICommand";
import { ILogger } from "../../models/spt/utils/ILogger";
import { IUUidGenerator } from "../../models/spt/utils/IUuidGenerator";

export abstract class AbstractWinstonLogger implements ILogger 
{
    protected showDebugInConsole = false;
    protected filePath: string;
    protected logLevels = {
        levels: {
            error: 0,
            warn: 1,
            succ: 2,
            info: 3,
            custom: 4,
            debug: 5
        },
        colors: {
            error: "red",
            warn: "yellow",
            succ: "green",
            info: "white",
            custom: "black",
            debug: "gray"
        },
        bgColors: {
            default: "",
            blackBG: "blackBG",
            redBG: "redBG",
            greenBG: "greenBG",
            yellowBG: "yellowBG",
            blueBG: "blueBG",
            magentaBG: "magentaBG",
            cyanBG: "cyanBG",
            whiteBG: "whiteBG"
        }
    };
    protected logger: winston.Logger & SptLogger;
    protected writeFilePromisify: (path: fs.PathLike, data: string, options?: any) => Promise<void>;

    constructor(
        protected asyncQueue: IAsyncQueue,
        protected uuidGenerator: IUUidGenerator
    ) 
    {
        this.filePath = `${this.getFilePath()}${this.getFileName()}`;
        this.writeFilePromisify = promisify(fs.writeFile);
        this.showDebugInConsole = globalThis.G_DEBUG_CONFIGURATION;
        if (!fs.existsSync(this.getFilePath())) 
        {
            fs.mkdirSync(this.getFilePath(), { recursive: true });
        }

        const transportsList: winston.transport[] = [];

        if (this.isLogToConsole())
        {
            transportsList.push(
                new transports.Console({
                    level: this.showDebugInConsole ? "debug" : "custom",
                    format: format.combine(
                        format.colorize({ all: true, colors: this.logLevels.colors }),
                        format.printf(({ message }) => 
                        {
                            return `${message}`;
                        })
                    )
                })
            );
        }
        if (this.isLogToFile())
        {
            transportsList.push(
                new DailyRotateFile({
                    level: "debug",
                    filename: this.filePath,
                    datePattern: "YYYY-MM-DD-HH",
                    zippedArchive: true,
                    maxSize: this.getLogMaxSize(),
                    maxFiles: this.getLogMaxFiles(),
                    format: format.combine(
                        format.timestamp(),
                        format.align(),
                        format.json(),
                        format.printf(({ timestamp, level, message }) => 
                        {
                            return `[${timestamp}] ${level}: ${message}`;
                        })
                    )
                })
            );
        }

        winston.addColors(this.logLevels.colors);
        this.logger = createLogger({
            levels: this.logLevels.levels,
            transports: [...transportsList]
        });

        if (this.isLogExceptions())
        {
            process.on("uncaughtException", (error) => 
            {
                this.error(`${error.name}: ${error.message}`);
                this.error(error.stack);
            });
        }
    }

    protected abstract isLogToFile(): boolean;

    protected abstract isLogToConsole(): boolean;

    protected abstract isLogExceptions(): boolean;

    protected abstract getFilePath(): string;
    
    protected abstract getFileName(): string;
    
    protected getLogMaxSize(): string
    {
        return "5m";
    }

    protected getLogMaxFiles(): string
    {
        return "14d";
    }

    public async writeToLogFile(data: string | Daum): Promise<void> 
    {
        const command: ICommand = {
            uuid: this.uuidGenerator.generate(),
            cmd: async () => await this.writeFilePromisify(this.filePath, `${data}\n`, true)
        };
        await this.asyncQueue.waitFor(command);
    }

    public async log(data: string | Error | Record<string, unknown>, color: string, backgroundColor = "" ): Promise<void> 
    {
        const textColor = `${color} ${backgroundColor}`.trimEnd();
        const tmpLogger = createLogger({
            levels: { custom: 0 },
            level: "custom",
            transports: [new transports.Console({
                format: format.combine(
                    format.colorize({ all: true, colors: { custom: textColor } }),
                    format.printf(({ message }) => message)
                )
            })]
        });

        let command: ICommand;

        if (typeof (data) === "string") 
        {
            command = {
                uuid: this.uuidGenerator.generate(),
                cmd: async () => await tmpLogger.log("custom", data)
            };
        }
        else 
        {
            command = {
                uuid: this.uuidGenerator.generate(),
                cmd: async () => await tmpLogger.log("custom", JSON.stringify(data, null, 4))
            };
        }

        await this.asyncQueue.waitFor(command);
    }

    public async error(data: string | Record<string, unknown>): Promise<void> 
    {
        const command: ICommand = {
            uuid: this.uuidGenerator.generate(),
            cmd: async () => await this.logger.error(data)
        };
        await this.asyncQueue.waitFor(command);
    }

    public async warning(data: string | Record<string, unknown>): Promise<void> 
    {
        const command: ICommand = {
            uuid: this.uuidGenerator.generate(),
            cmd: async () => await this.logger.warn(data)
        };
        await this.asyncQueue.waitFor(command);
    }

    public async success(data: string | Record<string, unknown>): Promise<void> 
    {
        const command: ICommand = {
            uuid: this.uuidGenerator.generate(),
            cmd: async () => await this.logger.succ(data)
        };
        await this.asyncQueue.waitFor(command);
    }

    public async info(data: string | Record<string, unknown>): Promise<void> 
    {
        const command: ICommand = {
            uuid: this.uuidGenerator.generate(),
            cmd: async () => await this.logger.info(data)
        };
        await this.asyncQueue.waitFor(command);
    }

    /**
     * Log to console text with a customisable text and background color. Background defaults to black
     * @param data text to log
     * @param textColor color of text
     * @param backgroundColor color of background
     */
    public async logWithColor(data: string | Record<string, unknown>, textColor: LogTextColor, backgroundColor = LogBackgroundColor.DEFAULT): Promise<void>
    {
        const command: ICommand = {
            uuid: this.uuidGenerator.generate(),
            cmd: async () => await this.log(data, textColor.toString(), backgroundColor.toString())
        };

        await this.asyncQueue.waitFor(command);
    }

    public async debug(data: string | Record<string, unknown>, onlyShowInConsole = false): Promise<void> 
    {
        let command: ICommand;

        if (onlyShowInConsole) 
        {
            command = {
                uuid: this.uuidGenerator.generate(),
                cmd: async () => await this.log(data, this.logLevels.colors.debug)
            };
        }
        else 
        {
            command = {
                uuid: this.uuidGenerator.generate(),
                cmd: async () => await this.logger.debug(data)
            };
        }

        await this.asyncQueue.waitFor(command);
    }
}
