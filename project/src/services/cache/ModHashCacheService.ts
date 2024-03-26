import { inject, injectable } from "tsyringe";

import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { VFS } from "@spt-aki/utils/VFS";

@injectable()
export class ModHashCacheService
{
    protected modHashes: Record<string, string>;
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

        this.modHashes = this.jsonUtil.deserialize(this.vfs.readFile(this.modCachePath), this.modCachePath);
    }

    public getStoredValue(key: string): string
    {
        return this.modHashes[key];
    }

    public storeValue(key: string, value: string): void
    {
        this.modHashes[key] = value;

        this.vfs.writeFile(this.modCachePath, this.jsonUtil.serialize(this.modHashes));

        this.logger.debug(`Mod ${key} hash stored in ${this.modCachePath}`);
    }

    public matchWithStoredHash(modName: string, hash: string): boolean
    {
        return this.getStoredValue(modName) === hash;
    }

    public calculateAndCompareHash(modName: string, modContent: string): boolean
    {
        const generatedHash = this.hashUtil.generateSha1ForData(modContent);

        return this.matchWithStoredHash(modName, generatedHash);
    }

    public calculateAndStoreHash(modName: string, modContent: string): void
    {
        const generatedHash = this.hashUtil.generateSha1ForData(modContent);

        this.storeValue(modName, generatedHash);
    }
}
