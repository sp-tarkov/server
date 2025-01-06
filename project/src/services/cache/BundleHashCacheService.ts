import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { HashUtil } from "@spt/utils/HashUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { VFS } from "@spt/utils/VFS";
import { inject, injectable } from "tsyringe";

@injectable()
export class BundleHashCacheService {
    protected bundleHashes: Record<string, number>;
    protected readonly bundleHashCachePath = "./user/cache/bundleHashCache.json";

    constructor(
        @inject("VFS") protected vfs: VFS,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("PrimaryLogger") protected logger: ILogger,
    ) {
        if (!this.vfs.exists(this.bundleHashCachePath)) {
            this.vfs.writeFile(this.bundleHashCachePath, "{}");
        }

        this.bundleHashes = this.jsonUtil.deserialize(
            this.vfs.readFile(this.bundleHashCachePath),
            this.bundleHashCachePath,
        );
    }

    public getStoredValue(key: string): number {
        return this.bundleHashes[key];
    }

    public storeValue(key: string, value: number): void {
        this.bundleHashes[key] = value;

        this.vfs.writeFile(this.bundleHashCachePath, this.jsonUtil.serialize(this.bundleHashes));

        this.logger.debug(`Bundle ${key} hash stored in ${this.bundleHashCachePath}`);
    }

    public matchWithStoredHash(bundlePath: string, hash: number): boolean {
        return this.getStoredValue(bundlePath) === hash;
    }

    public calculateAndMatchHash(bundlePath: string): boolean {
        const generatedHash = this.hashUtil.generateCRC32ForFile(bundlePath);

        return this.matchWithStoredHash(bundlePath, generatedHash);
    }

    public calculateAndStoreHash(bundlePath: string): void {
        const generatedHash = this.hashUtil.generateCRC32ForFile(bundlePath);

        this.storeValue(bundlePath, generatedHash);
    }
}
