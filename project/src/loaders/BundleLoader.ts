
import { inject, injectable } from "tsyringe";
import { HttpServerHelper } from "../helpers/HttpServerHelper";
import { JsonUtil } from "../utils/JsonUtil";
import { VFS } from "../utils/VFS";

class BundleInfo
{
    modPath: string;
    key: string;
    path: string;
    filepath: string;
    dependencyKeys: string[];

    constructor(modpath: string, bundle: any, bundlePath: string, bundleFilepath: string)
    {
        this.modPath = modpath;
        this.key = bundle.key;
        this.path = bundlePath;
        this.filepath = bundleFilepath;
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
        @inject("JsonUtil") protected jsonUtil: JsonUtil
    )
    { }

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
            bundle.path = bundle.filepath;
        }

        delete bundle.filepath;
        return bundle;
    }

    public addBundles(modpath: string): void
    {
        const manifest = this.jsonUtil.deserialize<BundleManifest>(this.vfs.readFile(`${modpath}bundles.json`)).manifest;

        for (const bundle of manifest)
        {
            const bundlePath = `${this.httpServerHelper.getBackendUrl()}/files/bundle/${bundle.key}`;
            const bundleFilepath = bundle.path || `${modpath}bundles/${bundle.key}`.replace(/\\/g, "/");
            this.addBundle(bundle.key, new BundleInfo(modpath, bundle, bundlePath, bundleFilepath));
        }
    }

    public addBundle(key: string, b: BundleInfo): void {
        this.bundles[key] = b;
    }
}

export interface BundleManifest
{
    manifest: Array<BundleManifestEntry>
}

export interface BundleManifestEntry
{
    key: string
    path: string
}