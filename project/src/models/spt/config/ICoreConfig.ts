import { ISurveyResponseData } from "@spt/models/eft/game/ISurveyResponseData";
import { IBaseConfig } from "@spt/models/spt/config/IBaseConfig";

export interface ICoreConfig extends IBaseConfig {
    kind: "spt-core";
    sptVersion: string;
    projectName: string;
    compatibleTarkovVersion: string;
    serverName: string;
    profileSaveIntervalSeconds: number;
    sptFriendNickname: string;
    allowProfileWipe: boolean;
    bsgLogging: IBsgLogging;
    release: IRelease;
    fixes: IGameFixes;
    survey: ISurveyResponseData;
    features: IServerFeatures;
    /** Commit hash build server was created from */
    commit?: string;
    /** Timestamp of server build */
    buildTime?: string;
    /** Server locale keys that will be added to the bottom of the startup watermark */
    customWatermarkLocaleKeys?: string[];
}

export interface IBsgLogging {
    /**
     * verbosity of what to log, yes I know this is backwards, but its how nlog deals with ordinals.
     * complain to them about it! In all cases, better exceptions will be logged.
     * WARNING: trace-info logging will quickly create log files in the megabytes.
     * 0 - trace
     * 1 - debug
     * 2 - info
     * 3 - warn
     * 4 - error
     * 5 - fatal
     * 6 - off
     */
    verbosity: number;
    // Should we send the logging to the server
    sendToServer: boolean;
}

export interface IRelease {
    // Disclaimer outlining the intended usage of bleeding edge
    betaDisclaimerText?: string;
    // Text logged when users agreed to terms
    betaDisclaimerAcceptText: string;
    // Server mods loaded message
    serverModsLoadedText: string;
    // Server mods loaded debug message text
    serverModsLoadedDebugText: string;
    // Client mods loaded message
    clientModsLoadedText: string;
    // Client mods loaded debug message text
    clientModsLoadedDebugText: string;
    // Illegal plugins log message
    illegalPluginsLoadedText: string;
    // Illegal plugins exception
    illegalPluginsExceptionText: string;
    // Summary of release changes
    releaseSummaryText?: string;
    // Enables the cool watermark in-game
    isBeta?: boolean;
    // Whether mods are enabled
    isModdable?: boolean;
    // Are mods loaded on the server?
    isModded: boolean;
    // How long before the messagebox times out and closes the game
    betaDisclaimerTimeoutDelay: number;
}

export interface IGameFixes {
    /** Shotguns use a different value than normal guns causing huge pellet dispersion  */
    fixShotgunDispersion: boolean;
    /** Remove items added by mods when the mod no longer exists - can fix dead profiles stuck at game load */
    removeModItemsFromProfile: boolean;
    /** Remove invalid traders from profile - trader data can be leftover when player removes trader mod */
    removeInvalidTradersFromProfile: boolean;
    /** Fix issues that cause the game to not start due to inventory item issues */
    fixProfileBreakingInventoryItemIssues: boolean;
}

export interface IServerFeatures {
    compressProfile: boolean;
    chatbotFeatures: IChatbotFeatures;
    /** Keyed to profile type e.g. "Standard" or "SPT Developer" */
    createNewProfileTypesBlacklist: string[];
}

export interface IChatbotFeatures {
    sptFriendEnabled: boolean;
    sptFriendGiftsEnabled: boolean;
    commandoEnabled: boolean;
    commandoFeatures: ICommandoFeatures;
    commandUseLimits: Record<string, number>;
    ids: Record<string, string>;
}

export interface ICommandoFeatures {
    giveCommandEnabled: boolean;
}
