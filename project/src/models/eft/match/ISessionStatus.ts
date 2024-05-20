export interface ISessionStatus
{
    profileid: string
    profileToken: string
    status: string
    ip: string
    port: number
    sid: string
    version?: string
    location?: string
    raidMode?: string
    mode?: string
    shortId?: string
    // eslint-disable-next-line @typescript-eslint/naming-convention
    additional_info?: any[]
}
