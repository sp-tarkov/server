import path from "node:path";
import { inject, injectable } from "tsyringe";

import { HttpServerHelper } from "@spt-aki/helpers/HttpServerHelper";
import { BundleHashCacheService } from "@spt-aki/services/cache/BundleHashCacheService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { VFS } from "@spt-aki/utils/VFS";

export class BundleInfo
{
    modPath: string;
    key: string;
    path: string;
    filepath: string;
    crc: number;
    dependencyKeys: string[];

    constructor(modpath: string, bundle: any, bundlePath: string, bundleFilepath: string, bundleHash: number)
    {
        this.modPath = modpath;
        this.key = bundle.key;
        this.path = bundlePath;
        this.filepath = bundleFilepath;
        this.crc = bundleHash;
        this.dependencyKeys = bundle.dependencyKeys || [];
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
    public getBundles(local: boolean): BundleInfo[]
    {
        const result: BundleInfo[] = [];

        for (const bundle in this.bundles)
        {
            result.push(this.getBundle(bundle, local));
        }

        return result;
    }

    public getBundle(key: string, local: boolean): BundleInfo
    {
        const bundle = this.jsonUtil.clone(this.bundles[key]);

        if (local)
        {
            bundle.path = path.join(process.cwd(), bundle.filepath);
        }

        delete bundle.filepath;
        return bundle;
    }

    public addBundles(modpath: string): void
    {
        const manifest =
            this.jsonUtil.deserialize<BundleManifest>(this.vfs.readFile(`${modpath}bundles.json`)).manifest;

        for (const bundle of manifest)
        {
            const bundlePath = `${this.httpServerHelper.getBackendUrl()}/files/bundle/${bundle.key}`;
            const bundleFilepath = bundle.path || `${modpath}bundles/${bundle.key}`.replace(/\\/g, "/");

            if (!this.bundleHashCacheService.calculateAndMatchHash(bundleFilepath))
            {
                this.bundleHashCacheService.calculateAndStoreHash(bundleFilepath);
            }

            const bundleHash = this.bundleHashCacheService.getStoredValue(bundleFilepath);

            this.addBundle(bundle.key, new BundleInfo(modpath, bundle, bundlePath, bundleFilepath, bundleHash));
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
    path: string;
}
