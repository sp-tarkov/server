import { inject, injectable } from "tsyringe";

import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { VFS } from "@spt-aki/utils/VFS";

@injectable()
export class HashCacheService
{
    protected jsonHashes = null;
    protected modHashes = null;
    protected readonly modCachePath = "./user/cache/modCache.json";

    constructor(
        @inject("VFS") protected vfs: VFS,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("WinstonLogger") protected logger: ILogger,
    )
    {
        if (!this.vfs.exists(this.modCachePath))
        {
            this.vfs.writeFile(this.modCachePath, "{}");
        }

        // get mod hash file
        if (!this.modHashes)
        { // empty
            this.modHashes = this.jsonUtil.deserialize(this.vfs.readFile(`${this.modCachePath}`));
        }
    }

    /**
     * Return a stored hash by key
     * @param modName Name of mod to get hash for
     * @returns Mod hash
     */
    public getStoredModHash(modName: string): string
    {
        return this.modHashes[modName];
    }

    /**
     * Does the generated hash match the stored hash
     * @param modName name of mod
     * @param modContent
     * @returns True if they match
     */
    public modContentMatchesStoredHash(modName: string, modContent: string): boolean
    {
        const storedModHash = this.getStoredModHash(modName);
        const generatedHash = this.hashUtil.generateSha1ForData(modContent);

        return storedModHash === generatedHash;
    }

    public hashMatchesStoredHash(modName: string, modHash: string): boolean
    {
        const storedModHash = this.getStoredModHash(modName);

        return storedModHash === modHash;
    }

    public storeModContent(modName: string, modContent: string): void
    {
        const generatedHash = this.hashUtil.generateSha1ForData(modContent);

        this.storeModHash(modName, generatedHash);
    }

    public storeModHash(modName: string, modHash: string): void
    {
        this.modHashes[modName] = modHash;

        this.vfs.writeFile(this.modCachePath, this.jsonUtil.serialize(this.modHashes));

        this.logger.debug(`Mod ${modName} hash stored in ${this.modCachePath}`);
    }
}
