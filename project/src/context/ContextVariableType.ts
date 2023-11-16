export enum ContextVariableType
{
    /** Logged in users session id */
    SESSION_ID,
    /** Currently acive raid information */
    RAID_CONFIGURATION,
    /** Timestamp when client first connected */
    CLIENT_START_TIMESTAMP,
    /** When player is loading into map and loot is requested */
    REGISTER_PLAYER_REQUEST,
}
