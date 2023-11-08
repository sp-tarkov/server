export interface IAddItemRequestData {
    /** Trader id */
    tid: string;
    items: AddItem[];
}

export interface AddItem {
    count: number;
    isPreset?: boolean;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    item_id: string;
}
