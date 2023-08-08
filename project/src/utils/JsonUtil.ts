import fixJson from "json-fixer";
import { inject, injectable } from "tsyringe";

import { ILogger } from "../models/spt/utils/ILogger";
import { HashUtil } from "./HashUtil";
import { VFS } from "./VFS";

@injectable()
export class JsonUtil
{
    protected fileHashes = null;
    protected jsonCacheExists = false;

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
     * From string to object
     * @param jsonString json string to turn into object
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

    public async deserializeWithCacheCheckAsync<T>(jsonString: string, filePath: string): Promise<T>
    {
        return new Promise((resolve) => 
        {
            resolve(this.deserializeWithCacheCheck<T>(jsonString, filePath));
        });
    }

    public deserializeWithCacheCheck<T>(jsonString: string, filePath: string): T
    {
        // get json cache file and ensure it exists, create if it doesnt
        const jsonCachePath = "./user/cache/jsonCache.json";
        if (!this.jsonCacheExists)
        {
            
            if (!this.vfs.exists(jsonCachePath))
            {
                this.vfs.writeFile(jsonCachePath, "{}");
            }
            this.jsonCacheExists = true;
        }


        // Generate hash of string
        const generatedHash = this.hashUtil.generateSha1ForData(jsonString);

        // Get all file hashes
        if (!this.fileHashes)
        {
            this.fileHashes = this.deserialize(this.vfs.readFile(`${jsonCachePath}`));
        }

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
                    this.vfs.writeFile(jsonCachePath, this.serialize(this.fileHashes, true));
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
        return JSON.parse(jsonString) as T;
    }

    public clone<T>(data: T): T
    {
        return JSON.parse(JSON.stringify(data));
    }
}
