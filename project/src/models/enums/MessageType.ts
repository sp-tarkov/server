export enum MessageType {
    // if this variables are supposed to be strings for the type
    // then the equals value should be the name that should be
    // required by the client instead of an int
    // ie: USER_MESSAGE = "userMessage"
    USER_MESSAGE = 1,
    NPC_TRADER = 2,
    AUCTION_MESSAGE = 3,
    FLEAMARKET_MESSAGE = 4,
    ADMIN_MESSAGE = 5,
    GROUP_CHAT_MESSAGE = 6,
    SYSTEM_MESSAGE = 7,
    INSURANCE_RETURN = 8,
    GLOBAL_CHAT = 9,
    QUEST_START = 10,
    QUEST_FAIL = 11,
    QUEST_SUCCESS = 12,
    MESSAGE_WITH_ITEMS = 13,
    INITIAL_SUPPORT = 14,
    BTR_ITEMS_DELIVERY = 15,
}
