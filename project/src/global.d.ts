export type {};

declare global {
    var G_DEBUG_CONFIGURATION: boolean;
    var G_RELEASE_CONFIGURATION: boolean;
    var G_MODS_ENABLED: boolean;
    var G_MODS_TRANSPILE_TS: boolean;
    var G_LOG_REQUESTS: boolean;
    var G_WATERMARK_ENABLED: boolean;

    var G_SPT_VERSION: string;
    var G_COMMIT: string;
    var G_BUILD_TIME: number;
}
