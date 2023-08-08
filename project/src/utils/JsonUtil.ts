import fixJson from "json-fixer";
import { inject, injectable } from "tsyringe";

import json5 from "json5";
import { ILogger } from "../models/spt/utils/ILogger";
import { HashUtil } from "./HashUtil";
import { VFS } from "./VFS";

@injectable()
export class JsonUtil
{
    protected fileHashes = null;
    protected jsonCacheExists = false;
    protected jsonCachePath = "./user/cache/jsonCache.json";

    constructor(
        @inject("VFS") protected vfs: VFS,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("WinstonLogger") protected logger: ILogger
    )
    { }

    /**
     * From object to string
     * @param data object to turn into JSON
     * @param prettify Should output be prettified?
     * @returns string
     */
    public serialize(data: any, prettify = false): string
    {
        if (prettify)
        {
            return JSON.stringify(data, null, "\t");
        }
        else
        {
            return JSON.stringify(data);
        }
    }

    /**
     * From object to string
     * @param data object to turn into JSON
     * @param prettify Should output be prettified?
     * @returns string
     */
    public serializeAdvanced(data: any, replacer?: (this: any, key: string, value: any) => any, space?: string | number): string
    {

        return JSON.stringify(data, replacer, space);
    }

    /**
     * From object to string
     * @param data object to turn into JSON
     * @param replacer An array of String and Number objects that serve as a
    * allowlist for selecting/filtering the properties of the value object to be
    * included in the JSON5 string. If this value is null or not provided, all
    * properties of the object are included in the resulting JSON5 string.
    * @param space A String or Number object that's used to insert white space into
    * the output JSON5 string for readability purposes. If this is a Number, it
    * indicates the number of space characters to use as white space; this number
    * is capped at 10 (if it is greater, the value is just 10). Values less than 1
    * indicate that no space should be used. If this is a String, the string (or
    * the first 10 characters of the string, if it's longer than that) is used as
    * white space. If this parameter is not provided (or is null), no white space
    * is used. If white space is used, trailing commas will be used in objects and
    * arrays.
    * @param space A String representing the quote character to use when serializing
    * @param filename Name of file being serialized
    * @returns The JSON5 string converted from the JavaScript value.
     */
    public serializeJson5(
        data: any,
        replacer?: | ((this: any, key: string, value: any) => any) | (string | number)[] | null,
        space?: string | number | null,
        quote?: string | null,
        filename?: string | null): string
    {
        try
        {
            return json5.stringify(data, {replacer, space, quote});
        }
        catch (error)
        {
            this.logger.error(`unable to stringify json5 file: ${filename} message: ${error.message}, stack: ${error.stack}`);
        }
        
    }

    /**
     * From string to object
     * @param jsonString json string to turn into object
     * @param filename Name of file being deserialized
     * @returns object
     */
    public deserialize<T>(jsonString: string, filename = ""): T
    {
        const { data, changed } = fixJson(`${jsonString}`);
        if (changed)
        {
            this.logger.error(`Invalid JSON ${filename} was detected and automatically fixed, please ensure any edits performed recently are valid, always run your JSON through an online JSON validator prior to starting the server`);
        }

        return data;
    }

    /**
     * From string to object
     * @param jsonString json string to turn into object
     * @param filename Name of file being deserialized
     * @param reviver A function that prescribes how the value originally produced
     * by parsing is transformed before being returned.
     * @returns object
     */
    public deserializeJson5<T>(jsonString: string, filename = "", reviver?: ((this: any, key: string, value: any) => any) | null): T
    {
        try
        {
            return json5.parse(jsonString, reviver);
        }
        catch (error)
        {
            this.logger.error(`unable to parse json5 file: ${filename} message: ${error.message}, stack: ${error.stack}`);
        }
        
    }

    public async deserializeWithCacheCheckAsync<T>(jsonString: string, filePath: string): Promise<T>
    {
        return new Promise((resolve) => 
        {
            resolve(this.deserializeWithCacheCheck<T>(jsonString, filePath));
        });
    }

    public deserializeWithCacheCheck<T>(jsonString: string, filePath: string): T
    {
        this.ensureJsonCacheExists(this.jsonCachePath);
        this.hydrateJsonCache(this.jsonCachePath);

        // Generate hash of string
        const generatedHash = this.hashUtil.generateSha1ForData(jsonString);

        // Get hash of file and check if missing or hash mismatch
        let savedHash = this.fileHashes[filePath];
        if (!savedHash || savedHash !== generatedHash)
        {
            try
            {
                const { data, changed } = fixJson(jsonString);
                if (changed) // data invalid, return it
                {
                    this.logger.error(`${filePath} - Detected faulty json, please fix your json file using VSCodium`);
                }
                else
                {
                    // data valid, save hash and call function again
                    this.fileHashes[filePath] = generatedHash;
                    this.vfs.writeFile(this.jsonCachePath, this.serialize(this.fileHashes, true));
                    savedHash = generatedHash;
                }
                return data as T;
            }
            catch (error)
            {
                const errorMessage = `Attempted to parse file: ${filePath}. Error: ${error.message}`;
                this.logger.error(errorMessage);
                throw new Error(errorMessage);
            }
        }

        // Doesn't match
        if (savedHash !== generatedHash)
        {
            throw new Error(`Catastrophic failure processing file ${filePath}`);
        }

        // Match!
        return this.deserialize<T>(jsonString);
    }

    
    /**
     * Create file if nothing found
     * @param jsonCachePath path to cache
     */
    protected ensureJsonCacheExists(jsonCachePath: string): void
    {
        if (!this.jsonCacheExists)
        {
            if (!this.vfs.exists(jsonCachePath))
            {
                // Create empty object at path
                this.vfs.writeFile(jsonCachePath, "{}");
            }
            this.jsonCacheExists = true;
        }
    }

    /**
     * Read contents of json cache and add to class field
     * @param jsonCachePath Path to cache
     */
    protected hydrateJsonCache(jsonCachePath: string) : void
    {
        // Get all file hashes
        if (!this.fileHashes)
        {
            this.fileHashes = this.deserialize(this.vfs.readFile(`${jsonCachePath}`));
        }
    }

    /**
     * Convert into string and back into object to clone object
     * @param objectToClone Item to clone
     * @returns Cloned parameter
     */
    public clone<T>(objectToClone: T): T
    {
        return this.deserialize<T>(this.serialize(objectToClone));
    }
}
