import { inject, injectable } from "tsyringe";

import { HttpServerHelper } from "@spt-aki/helpers/HttpServerHelper";
import { BundleHashCacheService } from "@spt-aki/services/cache/BundleHashCacheService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { VFS } from "@spt-aki/utils/VFS";

export class BundleInfo
{
    remote: string;
    local: string;
    filename: string;
    crc: number;
    dependencies: string[];

    constructor(bundle: BundleManifestEntry, remote: string, local: string, bundleHash: number)
    {
        this.remote = remote;
        this.local = local;
        this.filename = bundle.key;
        this.crc = bundleHash;
        this.dependencies = bundle.dependencyKeys || [];
    }
}

@injectable()
export class BundleLoader
{
    protected bundles: Record<string, BundleInfo> = {};

    constructor(
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper,
        @inject("VFS") protected vfs: VFS,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("BundleHashCacheService") protected bundleHashCacheService: BundleHashCacheService,
    )
    {}

    /**
     * Handle singleplayer/bundles
     */
    public getBundles(): BundleInfo[]
    {
        const result: BundleInfo[] = [];

        for (const bundle in this.bundles)
        {
            result.push(this.getBundle(bundle));
        }

        return result;
    }

    public getBundle(key: string): BundleInfo
    {
        const bundle = this.jsonUtil.clone(this.bundles[key]);

        // delete bundle.filepath;
        return bundle;
    }

    public addBundles(modpath: string): void
    {
        const bundleManifestArr =
            this.jsonUtil.deserialize<BundleManifest>(this.vfs.readFile(`${modpath}bundles.json`)).manifest;

        for (const bundleManifest of bundleManifestArr)
        {
            const bundleRemoteUrl = `${this.httpServerHelper.getBackendUrl()}/files/bundle/${bundleManifest.key}`;
            const bundleLocalPath = `${modpath}bundles/${bundleManifest.key}`.replace(/\\/g, "/");

            if (!this.bundleHashCacheService.calculateAndMatchHash(bundleLocalPath))
            {
                this.bundleHashCacheService.calculateAndStoreHash(bundleLocalPath);
            }

            const bundleHash = this.bundleHashCacheService.getStoredValue(bundleLocalPath);

            this.addBundle(
                bundleManifest.key,
                new BundleInfo(bundleManifest, bundleRemoteUrl, bundleLocalPath, bundleHash),
            );
        }
    }

    public addBundle(key: string, b: BundleInfo): void
    {
        this.bundles[key] = b;
    }
}

export interface BundleManifest
{
    manifest: BundleManifestEntry[];
}

export interface BundleManifestEntry
{
    key: string;
    dependencyKeys: string[];
}
