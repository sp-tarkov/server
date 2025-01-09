import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { FileSystemSync } from "@spt/utils/FileSystemSync";
import { HashUtil } from "@spt/utils/HashUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class ModHashCacheService {
    protected modHashes: Record<string, string>;
    protected readonly modCachePath = "./user/cache/modCache.json";

    constructor(
        @inject("FileSystemSync") protected fileSystemSync: FileSystemSync,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("PrimaryLogger") protected logger: ILogger,
    ) {
        if (!this.fileSystemSync.exists(this.modCachePath)) {
            this.fileSystemSync.writeJson(this.modCachePath, {});
        }

        this.modHashes = this.fileSystemSync.readJson(this.modCachePath);
    }

    public getStoredValue(key: string): string {
        return this.modHashes[key];
    }

    public storeValue(key: string, value: string): void {
        this.modHashes[key] = value;

        this.fileSystemSync.writeJson(this.modCachePath, this.modHashes);

        this.logger.debug(`Mod ${key} hash stored in ${this.modCachePath}`);
    }

    public matchWithStoredHash(modName: string, hash: string): boolean {
        return this.getStoredValue(modName) === hash;
    }

    public async calculateAndCompareHash(modName: string, modContent: string): Promise<boolean> {
        const generatedHash = await this.hashUtil.generateSha1ForDataAsync(modContent);

        return this.matchWithStoredHash(modName, generatedHash);
    }

    public async calculateAndStoreHash(modName: string, modContent: string): Promise<void> {
        const generatedHash = await this.hashUtil.generateSha1ForDataAsync(modContent);

        this.storeValue(modName, generatedHash);
    }
}
