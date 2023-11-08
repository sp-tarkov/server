// biome-ignore lint/suspicious/noEmptyInterface: <explanation>
export interface IAcceptFriendRequestData extends IBaseFriendRequest {}

// biome-ignore lint/suspicious/noEmptyInterface: <explanation>
export interface ICancelFriendRequestData extends IBaseFriendRequest {}

export interface IBaseFriendRequest {
    request_id: string;
}
