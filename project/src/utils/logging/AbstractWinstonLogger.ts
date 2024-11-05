import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { IDaum } from "@spt/models/eft/itemEvent/IItemEventRouterRequest";
import { LogBackgroundColor } from "@spt/models/spt/logging/LogBackgroundColor";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import { SptLogger } from "@spt/models/spt/logging/SptLogger";
import { IAsyncQueue } from "@spt/models/spt/utils/IAsyncQueue";
import { ICommand } from "@spt/models/spt/utils/ICommand";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import winston, { createLogger, format, transports, addColors } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export abstract class AbstractWinstonLogger implements ILogger {
    protected showDebugInConsole = false;
    protected filePath: string;
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
    protected writeFilePromisify: (path: fs.PathLike, data: string, options?: any) => Promise<void>;

    constructor(protected asyncQueue: IAsyncQueue) {
        this.filePath = path.join(this.getFilePath(), this.getFileName());
        this.writeFilePromisify = promisify(fs.writeFile);
        this.showDebugInConsole = globalThis.G_DEBUG_CONFIGURATION;
        if (!fs.existsSync(this.getFilePath())) {
            fs.mkdirSync(this.getFilePath(), { recursive: true });
        }

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
        const command: ICommand = {
            uuid: crypto.randomUUID(),
            cmd: async () => await this.writeFilePromisify(this.filePath, `${data}\n`, true),
        };
        await this.asyncQueue.waitFor(command);
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

        let command: ICommand;

        if (typeof data === "string") {
            command = { uuid: crypto.randomUUID(), cmd: async () => await tmpLogger.log("custom", data) };
        } else {
            command = {
                uuid: crypto.randomUUID(),
                cmd: async () => await tmpLogger.log("custom", JSON.stringify(data, undefined, 4)),
            };
        }

        await this.asyncQueue.waitFor(command);
    }

    public async error(data: string | Record<string, unknown>): Promise<void> {
        const command: ICommand = { uuid: crypto.randomUUID(), cmd: async () => await this.logger.error(data) };
        await this.asyncQueue.waitFor(command);
    }

    public async warning(data: string | Record<string, unknown>): Promise<void> {
        const command: ICommand = { uuid: crypto.randomUUID(), cmd: async () => await this.logger.warn(data) };
        await this.asyncQueue.waitFor(command);
    }

    public async success(data: string | Record<string, unknown>): Promise<void> {
        const command: ICommand = { uuid: crypto.randomUUID(), cmd: async () => await this.logger.succ(data) };
        await this.asyncQueue.waitFor(command);
    }

    public async info(data: string | Record<string, unknown>): Promise<void> {
        const command: ICommand = { uuid: crypto.randomUUID(), cmd: async () => await this.logger.info(data) };
        await this.asyncQueue.waitFor(command);
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
        const command: ICommand = {
            uuid: crypto.randomUUID(),
            cmd: async () => await this.log(data, textColor.toString(), backgroundColor.toString()),
        };

        await this.asyncQueue.waitFor(command);
    }

    public async debug(data: string | Record<string, unknown>, onlyShowInConsole = false): Promise<void> {
        let command: ICommand;

        if (onlyShowInConsole) {
            command = { uuid: crypto.randomUUID(), cmd: async () => await this.log(data, this.logLevels.colors.debug) };
        } else {
            command = { uuid: crypto.randomUUID(), cmd: async () => await this.logger.debug(data) };
        }

        await this.asyncQueue.waitFor(command);
    }
}
