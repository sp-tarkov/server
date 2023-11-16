// rome-ignore lint/suspicious/noEmptyInterface: <explanation>
export interface IAcceptFriendRequestData extends IBaseFriendRequest
{
}

// rome-ignore lint/suspicious/noEmptyInterface: <explanation>
export interface ICancelFriendRequestData extends IBaseFriendRequest
{
}

export interface IBaseFriendRequest
{
    // eslint-disable-next-line @typescript-eslint/naming-convention
    request_id: string;
}
