import path from "node:path";
import { ProgramStatics } from "@spt/ProgramStatics";
import { IDaum } from "@spt/models/eft/itemEvent/IItemEventRouterRequest";
import { LogBackgroundColor } from "@spt/models/spt/logging/LogBackgroundColor";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import { SptLogger } from "@spt/models/spt/logging/SptLogger";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { FileSystem } from "@spt/utils/FileSystem";
import { FileSystemSync } from "@spt/utils/FileSystemSync";
import winston, { createLogger, format, transports, addColors } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export abstract class AbstractWinstonLogger implements ILogger {
    protected showDebugInConsole = false;
    protected filePath: string;
    protected fileSystem: FileSystem;
    protected fileSystemSync: FileSystemSync;
    protected logLevels = {
        levels: { error: 0, warn: 1, succ: 2, info: 3, custom: 4, debug: 5 },
        colors: { error: "red", warn: "yellow", succ: "green", info: "white", custom: "black", debug: "gray" },
        bgColors: {
            default: "",
            blackBG: "blackBG",
            redBG: "redBG",
            greenBG: "greenBG",
            yellowBG: "yellowBG",
            blueBG: "blueBG",
            magentaBG: "magentaBG",
            cyanBG: "cyanBG",
            whiteBG: "whiteBG",
        },
    };
    protected logger: winston.Logger & SptLogger;

    constructor(fileSystem: FileSystem, fileSystemSync: FileSystemSync) {
        this.fileSystem = fileSystem;
        this.fileSystemSync = fileSystemSync;
        this.filePath = path.join(this.getFilePath(), this.getFileName());
        this.showDebugInConsole = ProgramStatics.DEBUG;

        this.fileSystemSync.ensureDir(this.getFilePath());

        const transportsList: winston.transport[] = [];

        if (this.isLogToConsole()) {
            transportsList.push(
                new transports.Console({
                    level: this.showDebugInConsole ? "debug" : "custom",
                    format: format.combine(
                        format.colorize({ all: true, colors: this.logLevels.colors }),
                        format.printf(({ message }) => {
                            return `${message}`;
                        }),
                    ),
                }),
            );
        }

        if (this.isLogToFile()) {
            transportsList.push(
                new DailyRotateFile({
                    level: "debug",
                    filename: this.filePath,
                    datePattern: "YYYY-MM-DD",
                    zippedArchive: true,
                    frequency: this.getLogFrequency(),
                    maxSize: this.getLogMaxSize(),
                    maxFiles: this.getLogMaxFiles(),
                    format: format.combine(
                        format.timestamp(),
                        format.align(),
                        format.json(),
                        format.printf(({ timestamp, level, message }) => {
                            return `[${timestamp}] ${level}: ${message}`;
                        }),
                    ),
                }),
            );
        }

        addColors(this.logLevels.colors);
        this.logger = createLogger({ levels: this.logLevels.levels, transports: [...transportsList] });

        if (this.isLogExceptions()) {
            process.on("uncaughtException", (error) => {
                this.error(`${error.name}: ${error.message}`);
                this.error(error.stack ?? "No stack");
            });
        }
    }

    protected abstract isLogToFile(): boolean;

    protected abstract isLogToConsole(): boolean;

    protected abstract isLogExceptions(): boolean;

    protected abstract getFilePath(): string;

    protected abstract getFileName(): string;

    protected getLogFrequency(): string {
        return "3h";
    }

    protected getLogMaxSize(): string {
        return "5m";
    }

    protected getLogMaxFiles(): string {
        return "14d";
    }

    public async writeToLogFile(data: string | IDaum): Promise<void> {
        try {
            this.fileSystem.append(this.filePath, `${data}\n`);
        } catch (error) {
            this.error(`Failed to write to log file: ${error}`);
        }
    }

    public async log(
        data: string | Error | Record<string, unknown>,
        color: string,
        backgroundColor = "",
    ): Promise<void> {
        const textColor = `${color} ${backgroundColor}`.trimEnd();
        const tmpLogger = createLogger({
            levels: { custom: 0 },
            level: "custom",
            transports: [
                new transports.Console({
                    format: format.combine(
                        format.colorize({ all: true, colors: { custom: textColor } }),
                        format.printf(({ message }) => message),
                    ),
                }),
            ],
        });

        if (typeof data === "string") {
            tmpLogger.log("custom", data);
        } else {
            tmpLogger.log("custom", JSON.stringify(data, undefined, 4));
        }
    }

    public async error(data: string | Record<string, unknown>): Promise<void> {
        this.logger.error(data);
    }

    public async warning(data: string | Record<string, unknown>): Promise<void> {
        this.logger.warn(data);
    }

    public async success(data: string | Record<string, unknown>): Promise<void> {
        this.logger.succ(data);
    }

    public async info(data: string | Record<string, unknown>): Promise<void> {
        this.logger.info(data);
    }

    /**
     * Log to console text with a customisable text and background color. Background defaults to black
     * @param data text to log
     * @param textColor color of text
     * @param backgroundColor color of background
     */
    public async logWithColor(
        data: string | Record<string, unknown>,
        textColor: LogTextColor,
        backgroundColor = LogBackgroundColor.DEFAULT,
    ): Promise<void> {
        this.log(data, textColor.toString(), backgroundColor.toString());
    }

    public async debug(data: string | Record<string, unknown>, onlyShowInConsole = false): Promise<void> {
        if (onlyShowInConsole) {
            this.log(data, this.logLevels.colors.debug);
        } else {
            this.logger.debug(data);
        }
    }
}
