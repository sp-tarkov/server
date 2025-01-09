import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { FileSystem } from "@spt/utils/FileSystem";
import { HashUtil } from "@spt/utils/HashUtil";
import { parse, stringify } from "json5";
import { jsonc } from "jsonc";
import { IParseOptions, IStringifyOptions, Reviver } from "jsonc/lib/interfaces";
import { jsonrepair } from "jsonrepair";
import { inject, injectable } from "tsyringe";

@injectable()
export class JsonUtil {
    protected fileHashes?: Map<string, string> = undefined;
    protected jsonCacheExists = false;
    protected jsonCachePath = "./user/cache/jsonCache.json";

    constructor(
        @inject("FileSystem") protected fileSystem: FileSystem,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("PrimaryLogger") protected logger: ILogger,
    ) {}

    /**
     * From object to string
     * @param data object to turn into JSON
     * @param prettify Should output be prettified
     * @returns string
     */
    public serialize(data: any, prettify = false): string {
        if (prettify) {
            return JSON.stringify(data, undefined, "\t");
        }

        return JSON.stringify(data);
    }

    /**
     * From object to string
     * @param data object to turn into JSON
     * @param replacer An array of strings and numbers that acts as an approved list for selecting the object properties that will be stringified.
     * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
     * @returns string
     */
    public serializeAdvanced(
        data: any,
        replacer?: (this: any, key: string, value: any) => any,
        space?: string | number,
    ): string {
        return JSON.stringify(data, replacer, space);
    }

    /**
     * From object to string
     * @param data object to turn into JSON
     * @param filename Name of file being serialized
     * @param options Stringify options or a replacer.
     * @returns The string converted from the JavaScript value
     */
    public serializeJsonC(
        data: any,
        filename?: string | undefined,
        options?: IStringifyOptions | Reviver,
    ): string | undefined {
        try {
            return jsonc.stringify(data, options);
        } catch (error) {
            this.logger.error(
                `unable to stringify jsonC file: ${filename} message: ${error.message}, stack: ${error.stack}`,
            );
        }
    }

    public serializeJson5(data: any, filename?: string | undefined, prettify = false): string | undefined {
        try {
            if (prettify) {
                return stringify(data, undefined, "\t");
            }

            return stringify(data);
        } catch (error) {
            this.logger.error(
                `unable to stringify json5 file: ${filename} message: ${error.message}, stack: ${error.stack}`,
            );
        }
    }

    /**
     * From string to object
     * @param jsonString json string to turn into object
     * @param filename Name of file being deserialized
     * @returns object
     */
    public deserialize<T>(jsonString: string, filename = ""): T | undefined {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            this.logger.error(
                `unable to parse json file: ${filename} message: ${error.message}, stack: ${error.stack}`,
            );
        }
    }

    /**
     * From string to object
     * @param jsonString json string to turn into object
     * @param filename Name of file being deserialized
     * @param options Parsing options
     * @returns object
     */
    public deserializeJsonC<T>(jsonString: string, filename = "", options?: IParseOptions): T | undefined {
        try {
            return jsonc.parse(jsonString, options);
        } catch (error) {
            this.logger.error(
                `unable to parse jsonC file: ${filename} message: ${error.message}, stack: ${error.stack}`,
            );
        }
    }

    public deserializeJson5<T>(jsonString: string, filename = ""): T | undefined {
        try {
            return parse(jsonString);
        } catch (error) {
            this.logger.error(
                `unable to parse json file: ${filename} message: ${error.message}, stack: ${error.stack}`,
            );
        }
    }

    /**
     * Take json from file and convert into object
     * Perform valadation on json during process if json file has not been processed before
     * @param jsonString String to turn into object
     * @param filePath Path to json file being processed
     * @returns A promise that resolves with the object if successful, if not returns undefined
     */
    public async deserializeWithCacheCheck<T>(
        jsonString: string,
        filePath: string,
        writeHashes = true,
    ): Promise<T | undefined> {
        await this.ensureJsonCacheExists(this.jsonCachePath);
        await this.hydrateJsonCache(this.jsonCachePath);

        // Generate hash of string
        const generatedHash = await this.hashUtil.generateSha1ForDataAsync(jsonString);

        if (!this.fileHashes) {
            throw new Error("Unable to deserialize with Cache, file hashes have not been hydrated yet");
        }
        // Get hash of file and check if missing or hash mismatch
        let savedHash = this.fileHashes[filePath];
        if (!savedHash || savedHash !== generatedHash) {
            try {
                const fixedJsonString = jsonrepair(jsonString);
                const data = this.deserialize<T>(fixedJsonString);
                const changed = jsonString !== fixedJsonString;

                if (changed) {
                    // data invalid, return it
                    this.logger.error(`${filePath} - Detected faulty JSON, please fix using a validator`);
                } else {
                    // data valid, save hash and call function again
                    this.fileHashes[filePath] = generatedHash;

                    if (writeHashes) {
                        await this.fileSystem.writeJson(this.jsonCachePath, this.fileHashes);
                    }

                    savedHash = generatedHash;
                }
                return data as T;
            } catch (error) {
                const errorMessage = `Attempted to parse file: ${filePath}. Error: ${error.message}`;
                this.logger.error(errorMessage);
                throw new Error(errorMessage);
            }
        }

        // Doesn't match
        if (savedHash !== generatedHash) {
            throw new Error(`Catastrophic failure processing file ${filePath}`);
        }

        // Match!
        return this.deserialize<T>(jsonString);
    }

    /**
     * Writes the file hashes to the cache path, to be used manually if writeHashes was set to false on deserializeWithCacheCheck
     */
    public async writeCache(): Promise<void> {
        if (!this.fileHashes) {
            return;
        }

        await this.fileSystem.writeJson(this.jsonCachePath, this.fileHashes);
    }

    /**
     * Create file if nothing found asynchronously
     * @param jsonCachePath path to cache
     */
    protected async ensureJsonCacheExists(jsonCachePath: string): Promise<void> {
        if (!this.jsonCacheExists) {
            if (!(await this.fileSystem.exists(jsonCachePath))) {
                // Create empty object at path
                await this.fileSystem.writeJson(jsonCachePath, {});
            }
            this.jsonCacheExists = true;
        }
    }

    /**
     * Read contents of json cache and add to class field
     * @param jsonCachePath Path to cache
     */
    protected async hydrateJsonCache(jsonCachePath: string): Promise<void> {
        // Get all file hashes
        if (!this.fileHashes) {
            this.fileHashes = await this.fileSystem.readJson(`${jsonCachePath}`);
        }
    }

    /**
     * Convert into string and back into object to clone object
     * @param objectToClone Item to clone
     * @returns Cloned parameter
     * @deprecated Use ICloner implementations, such as RecursiveCloner or StructuredCloner
     */
    public clone<T>(objectToClone: T): T {
        return structuredClone(objectToClone);
    }
}
