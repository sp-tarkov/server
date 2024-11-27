import { AchievementCallbacks } from "@spt/callbacks/AchievementCallbacks";
import { BotCallbacks } from "@spt/callbacks/BotCallbacks";
import { BuildsCallbacks } from "@spt/callbacks/BuildsCallbacks";
import { BundleCallbacks } from "@spt/callbacks/BundleCallbacks";
import { ClientLogCallbacks } from "@spt/callbacks/ClientLogCallbacks";
import { CustomizationCallbacks } from "@spt/callbacks/CustomizationCallbacks";
import { DataCallbacks } from "@spt/callbacks/DataCallbacks";
import { DialogueCallbacks } from "@spt/callbacks/DialogueCallbacks";
import { GameCallbacks } from "@spt/callbacks/GameCallbacks";
import { HandbookCallbacks } from "@spt/callbacks/HandbookCallbacks";
import { HealthCallbacks } from "@spt/callbacks/HealthCallbacks";
import { HideoutCallbacks } from "@spt/callbacks/HideoutCallbacks";
import { HttpCallbacks } from "@spt/callbacks/HttpCallbacks";
import { InraidCallbacks } from "@spt/callbacks/InraidCallbacks";
import { InsuranceCallbacks } from "@spt/callbacks/InsuranceCallbacks";
import { InventoryCallbacks } from "@spt/callbacks/InventoryCallbacks";
import { ItemEventCallbacks } from "@spt/callbacks/ItemEventCallbacks";
import { LauncherCallbacks } from "@spt/callbacks/LauncherCallbacks";
import { LocationCallbacks } from "@spt/callbacks/LocationCallbacks";
import { MatchCallbacks } from "@spt/callbacks/MatchCallbacks";
import { ModCallbacks } from "@spt/callbacks/ModCallbacks";
import { NoteCallbacks } from "@spt/callbacks/NoteCallbacks";
import { NotifierCallbacks } from "@spt/callbacks/NotifierCallbacks";
import { PresetCallbacks } from "@spt/callbacks/PresetCallbacks";
import { ProfileCallbacks } from "@spt/callbacks/ProfileCallbacks";
import { QuestCallbacks } from "@spt/callbacks/QuestCallbacks";
import { RagfairCallbacks } from "@spt/callbacks/RagfairCallbacks";
import { RepairCallbacks } from "@spt/callbacks/RepairCallbacks";
import { SaveCallbacks } from "@spt/callbacks/SaveCallbacks";
import { TradeCallbacks } from "@spt/callbacks/TradeCallbacks";
import { TraderCallbacks } from "@spt/callbacks/TraderCallbacks";
import { WeatherCallbacks } from "@spt/callbacks/WeatherCallbacks";
import { WishlistCallbacks } from "@spt/callbacks/WishlistCallbacks";
import { ApplicationContext } from "@spt/context/ApplicationContext";
import { AchievementController } from "@spt/controllers/AchievementController";
import { BotController } from "@spt/controllers/BotController";
import { BuildController } from "@spt/controllers/BuildController";
import { ClientLogController } from "@spt/controllers/ClientLogController";
import { CustomizationController } from "@spt/controllers/CustomizationController";
import { DialogueController } from "@spt/controllers/DialogueController";
import { GameController } from "@spt/controllers/GameController";
import { HandbookController } from "@spt/controllers/HandbookController";
import { HealthController } from "@spt/controllers/HealthController";
import { HideoutController } from "@spt/controllers/HideoutController";
import { InraidController } from "@spt/controllers/InraidController";
import { InsuranceController } from "@spt/controllers/InsuranceController";
import { InventoryController } from "@spt/controllers/InventoryController";
import { LauncherController } from "@spt/controllers/LauncherController";
import { LocationController } from "@spt/controllers/LocationController";
import { MatchController } from "@spt/controllers/MatchController";
import { NoteController } from "@spt/controllers/NoteController";
import { NotifierController } from "@spt/controllers/NotifierController";
import { PresetController } from "@spt/controllers/PresetController";
import { ProfileController } from "@spt/controllers/ProfileController";
import { QuestController } from "@spt/controllers/QuestController";
import { RagfairController } from "@spt/controllers/RagfairController";
import { RepairController } from "@spt/controllers/RepairController";
import { RepeatableQuestController } from "@spt/controllers/RepeatableQuestController";
import { TradeController } from "@spt/controllers/TradeController";
import { TraderController } from "@spt/controllers/TraderController";
import { WeatherController } from "@spt/controllers/WeatherController";
import { WishlistController } from "@spt/controllers/WishlistController";
import { BotEquipmentModGenerator } from "@spt/generators/BotEquipmentModGenerator";
import { BotGenerator } from "@spt/generators/BotGenerator";
import { BotInventoryGenerator } from "@spt/generators/BotInventoryGenerator";
import { BotLevelGenerator } from "@spt/generators/BotLevelGenerator";
import { BotLootGenerator } from "@spt/generators/BotLootGenerator";
import { BotWeaponGenerator } from "@spt/generators/BotWeaponGenerator";
import { FenceBaseAssortGenerator } from "@spt/generators/FenceBaseAssortGenerator";
import { LocationLootGenerator } from "@spt/generators/LocationLootGenerator";
import { LootGenerator } from "@spt/generators/LootGenerator";
import { PMCLootGenerator } from "@spt/generators/PMCLootGenerator";
import { PlayerScavGenerator } from "@spt/generators/PlayerScavGenerator";
import { RagfairAssortGenerator } from "@spt/generators/RagfairAssortGenerator";
import { RagfairOfferGenerator } from "@spt/generators/RagfairOfferGenerator";
import { RepeatableQuestGenerator } from "@spt/generators/RepeatableQuestGenerator";
import { RepeatableQuestRewardGenerator } from "@spt/generators/RepeatableQuestRewardGenerator";
import { ScavCaseRewardGenerator } from "@spt/generators/ScavCaseRewardGenerator";
import { WeatherGenerator } from "@spt/generators/WeatherGenerator";
import { BarrelInventoryMagGen } from "@spt/generators/weapongen/implementations/BarrelInventoryMagGen";
import { ExternalInventoryMagGen } from "@spt/generators/weapongen/implementations/ExternalInventoryMagGen";
import { InternalMagazineInventoryMagGen } from "@spt/generators/weapongen/implementations/InternalMagazineInventoryMagGen";
import { UbglExternalMagGen } from "@spt/generators/weapongen/implementations/UbglExternalMagGen";
import { AssortHelper } from "@spt/helpers/AssortHelper";
import { BotDifficultyHelper } from "@spt/helpers/BotDifficultyHelper";
import { BotGeneratorHelper } from "@spt/helpers/BotGeneratorHelper";
import { BotHelper } from "@spt/helpers/BotHelper";
import { BotWeaponGeneratorHelper } from "@spt/helpers/BotWeaponGeneratorHelper";
import { ContainerHelper } from "@spt/helpers/ContainerHelper";
import { SptCommandoCommands } from "@spt/helpers/Dialogue/Commando/SptCommandoCommands";
import { GiveSptCommand } from "@spt/helpers/Dialogue/Commando/SptCommands/GiveCommand/GiveSptCommand";
import { ProfileSptCommand } from "@spt/helpers/Dialogue/Commando/SptCommands/ProfileCommand/ProfileSptCommand";
import { TraderSptCommand } from "@spt/helpers/Dialogue/Commando/SptCommands/TraderCommand/TraderSptCommand";
import { CommandoDialogueChatBot } from "@spt/helpers/Dialogue/CommandoDialogueChatBot";
import { SptDialogueChatBot } from "@spt/helpers/Dialogue/SptDialogueChatBot";
import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import { DurabilityLimitsHelper } from "@spt/helpers/DurabilityLimitsHelper";
import { GameEventHelper } from "@spt/helpers/GameEventHelper";
import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { HealthHelper } from "@spt/helpers/HealthHelper";
import { HideoutHelper } from "@spt/helpers/HideoutHelper";
import { HttpServerHelper } from "@spt/helpers/HttpServerHelper";
import { InRaidHelper } from "@spt/helpers/InRaidHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { NotificationSendHelper } from "@spt/helpers/NotificationSendHelper";
import { NotifierHelper } from "@spt/helpers/NotifierHelper";
import { PaymentHelper } from "@spt/helpers/PaymentHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ProbabilityHelper } from "@spt/helpers/ProbabilityHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { QuestConditionHelper } from "@spt/helpers/QuestConditionHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { RagfairHelper } from "@spt/helpers/RagfairHelper";
import { RagfairOfferHelper } from "@spt/helpers/RagfairOfferHelper";
import { RagfairSellHelper } from "@spt/helpers/RagfairSellHelper";
import { RagfairServerHelper } from "@spt/helpers/RagfairServerHelper";
import { RagfairSortHelper } from "@spt/helpers/RagfairSortHelper";
import { RepairHelper } from "@spt/helpers/RepairHelper";
import { RepeatableQuestHelper } from "@spt/helpers/RepeatableQuestHelper";
import { SecureContainerHelper } from "@spt/helpers/SecureContainerHelper";
import { TradeHelper } from "@spt/helpers/TradeHelper";
import { TraderAssortHelper } from "@spt/helpers/TraderAssortHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { UtilityHelper } from "@spt/helpers/UtilityHelper";
import { WeatherHelper } from "@spt/helpers/WeatherHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { BundleLoader } from "@spt/loaders/BundleLoader";
import { ModLoadOrder } from "@spt/loaders/ModLoadOrder";
import { ModTypeCheck } from "@spt/loaders/ModTypeCheck";
import { PostDBModLoader } from "@spt/loaders/PostDBModLoader";
import { PostSptModLoader } from "@spt/loaders/PostSptModLoader";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { IAsyncQueue } from "@spt/models/spt/utils/IAsyncQueue";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { HttpRouter } from "@spt/routers/HttpRouter";
import { ImageRouter } from "@spt/routers/ImageRouter";
import { ItemEventRouter } from "@spt/routers/ItemEventRouter";
import { BotDynamicRouter } from "@spt/routers/dynamic/BotDynamicRouter";
import { BundleDynamicRouter } from "@spt/routers/dynamic/BundleDynamicRouter";
import { CustomizationDynamicRouter } from "@spt/routers/dynamic/CustomizationDynamicRouter";
import { DataDynamicRouter } from "@spt/routers/dynamic/DataDynamicRouter";
import { HttpDynamicRouter } from "@spt/routers/dynamic/HttpDynamicRouter";
import { InraidDynamicRouter } from "@spt/routers/dynamic/InraidDynamicRouter";
import { LocationDynamicRouter } from "@spt/routers/dynamic/LocationDynamicRouter";
import { NotifierDynamicRouter } from "@spt/routers/dynamic/NotifierDynamicRouter";
import { TraderDynamicRouter } from "@spt/routers/dynamic/TraderDynamicRouter";
import { CustomizationItemEventRouter } from "@spt/routers/item_events/CustomizationItemEventRouter";
import { HealthItemEventRouter } from "@spt/routers/item_events/HealthItemEventRouter";
import { HideoutItemEventRouter } from "@spt/routers/item_events/HideoutItemEventRouter";
import { InsuranceItemEventRouter } from "@spt/routers/item_events/InsuranceItemEventRouter";
import { InventoryItemEventRouter } from "@spt/routers/item_events/InventoryItemEventRouter";
import { NoteItemEventRouter } from "@spt/routers/item_events/NoteItemEventRouter";
import { QuestItemEventRouter } from "@spt/routers/item_events/QuestItemEventRouter";
import { RagfairItemEventRouter } from "@spt/routers/item_events/RagfairItemEventRouter";
import { RepairItemEventRouter } from "@spt/routers/item_events/RepairItemEventRouter";
import { TradeItemEventRouter } from "@spt/routers/item_events/TradeItemEventRouter";
import { WishlistItemEventRouter } from "@spt/routers/item_events/WishlistItemEventRouter";
import { HealthSaveLoadRouter } from "@spt/routers/save_load/HealthSaveLoadRouter";
import { InraidSaveLoadRouter } from "@spt/routers/save_load/InraidSaveLoadRouter";
import { InsuranceSaveLoadRouter } from "@spt/routers/save_load/InsuranceSaveLoadRouter";
import { ProfileSaveLoadRouter } from "@spt/routers/save_load/ProfileSaveLoadRouter";
import { BundleSerializer } from "@spt/routers/serializers/BundleSerializer";
import { ImageSerializer } from "@spt/routers/serializers/ImageSerializer";
import { NotifySerializer } from "@spt/routers/serializers/NotifySerializer";
import { AchievementStaticRouter } from "@spt/routers/static/AchievementStaticRouter";
import { BotStaticRouter } from "@spt/routers/static/BotStaticRouter";
import { BuildsStaticRouter } from "@spt/routers/static/BuildStaticRouter";
import { BundleStaticRouter } from "@spt/routers/static/BundleStaticRouter";
import { ClientLogStaticRouter } from "@spt/routers/static/ClientLogStaticRouter";
import { CustomizationStaticRouter } from "@spt/routers/static/CustomizationStaticRouter";
import { DataStaticRouter } from "@spt/routers/static/DataStaticRouter";
import { DialogStaticRouter } from "@spt/routers/static/DialogStaticRouter";
import { GameStaticRouter } from "@spt/routers/static/GameStaticRouter";
import { HealthStaticRouter } from "@spt/routers/static/HealthStaticRouter";
import { InraidStaticRouter } from "@spt/routers/static/InraidStaticRouter";
import { InsuranceStaticRouter } from "@spt/routers/static/InsuranceStaticRouter";
import { ItemEventStaticRouter } from "@spt/routers/static/ItemEventStaticRouter";
import { LauncherStaticRouter } from "@spt/routers/static/LauncherStaticRouter";
import { LocationStaticRouter } from "@spt/routers/static/LocationStaticRouter";
import { MatchStaticRouter } from "@spt/routers/static/MatchStaticRouter";
import { NotifierStaticRouter } from "@spt/routers/static/NotifierStaticRouter";
import { ProfileStaticRouter } from "@spt/routers/static/ProfileStaticRouter";
import { QuestStaticRouter } from "@spt/routers/static/QuestStaticRouter";
import { RagfairStaticRouter } from "@spt/routers/static/RagfairStaticRouter";
import { TraderStaticRouter } from "@spt/routers/static/TraderStaticRouter";
import { WeatherStaticRouter } from "@spt/routers/static/WeatherStaticRouter";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { HttpServer } from "@spt/servers/HttpServer";
import { RagfairServer } from "@spt/servers/RagfairServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { WebSocketServer } from "@spt/servers/WebSocketServer";
import { SptHttpListener } from "@spt/servers/http/SptHttpListener";
import { IWebSocketConnectionHandler } from "@spt/servers/ws/IWebSocketConnectionHandler";
import { SptWebSocketConnectionHandler } from "@spt/servers/ws/SptWebSocketConnectionHandler";
import { DefaultSptWebSocketMessageHandler } from "@spt/servers/ws/message/DefaultSptWebSocketMessageHandler";
import { ISptWebSocketMessageHandler } from "@spt/servers/ws/message/ISptWebSocketMessageHandler";
import { AirdropService } from "@spt/services/AirdropService";
import { BotEquipmentFilterService } from "@spt/services/BotEquipmentFilterService";
import { BotEquipmentModPoolService } from "@spt/services/BotEquipmentModPoolService";
import { BotGenerationCacheService } from "@spt/services/BotGenerationCacheService";
import { BotLootCacheService } from "@spt/services/BotLootCacheService";
import { BotNameService } from "@spt/services/BotNameService";
import { BotWeaponModLimitService } from "@spt/services/BotWeaponModLimitService";
import { CircleOfCultistService } from "@spt/services/CircleOfCultistService";
import { CustomLocationWaveService } from "@spt/services/CustomLocationWaveService";
import { DatabaseService } from "@spt/services/DatabaseService";
import { FenceService } from "@spt/services/FenceService";
import { GiftService } from "@spt/services/GiftService";
import { InMemoryCacheService } from "@spt/services/InMemoryCacheService";
import { InsuranceService } from "@spt/services/InsuranceService";
import { ItemBaseClassService } from "@spt/services/ItemBaseClassService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocaleService } from "@spt/services/LocaleService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { LocationLifecycleService } from "@spt/services/LocationLifecycleService";
import { MailSendService } from "@spt/services/MailSendService";
import { MapMarkerService } from "@spt/services/MapMarkerService";
import { MatchBotDetailsCacheService } from "@spt/services/MatchBotDetailsCacheService";
import { MatchLocationService } from "@spt/services/MatchLocationService";
import { ModCompilerService } from "@spt/services/ModCompilerService";
import { NotificationService } from "@spt/services/NotificationService";
import { OpenZoneService } from "@spt/services/OpenZoneService";
import { PaymentService } from "@spt/services/PaymentService";
import { PlayerService } from "@spt/services/PlayerService";
import { PmcChatResponseService } from "@spt/services/PmcChatResponseService";
import { PostDbLoadService } from "@spt/services/PostDbLoadService";
import { ProfileActivityService } from "@spt/services/ProfileActivityService";
import { ProfileFixerService } from "@spt/services/ProfileFixerService";
import { RagfairCategoriesService } from "@spt/services/RagfairCategoriesService";
import { RagfairLinkedItemService } from "@spt/services/RagfairLinkedItemService";
import { RagfairOfferService } from "@spt/services/RagfairOfferService";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import { RagfairRequiredItemsService } from "@spt/services/RagfairRequiredItemsService";
import { RagfairTaxService } from "@spt/services/RagfairTaxService";
import { RaidTimeAdjustmentService } from "@spt/services/RaidTimeAdjustmentService";
import { RaidWeatherService } from "@spt/services/RaidWeatherService";
import { RepairService } from "@spt/services/RepairService";
import { SeasonalEventService } from "@spt/services/SeasonalEventService";
import { TraderAssortService } from "@spt/services/TraderAssortService";
import { TraderPurchasePersisterService } from "@spt/services/TraderPurchasePersisterService";
import { BundleHashCacheService } from "@spt/services/cache/BundleHashCacheService";
import { ModHashCacheService } from "@spt/services/cache/ModHashCacheService";
import { CustomItemService } from "@spt/services/mod/CustomItemService";
import { DynamicRouterModService } from "@spt/services/mod/dynamicRouter/DynamicRouterModService";
import { HttpListenerModService } from "@spt/services/mod/httpListener/HttpListenerModService";
import { ImageRouteService } from "@spt/services/mod/image/ImageRouteService";
import { OnLoadModService } from "@spt/services/mod/onLoad/OnLoadModService";
import { OnUpdateModService } from "@spt/services/mod/onUpdate/OnUpdateModService";
import { StaticRouterModService } from "@spt/services/mod/staticRouter/StaticRouterModService";
import { App } from "@spt/utils/App";
import { AsyncQueue } from "@spt/utils/AsyncQueue";
import { CompareUtil } from "@spt/utils/CompareUtil";
import { DatabaseDecompressionUtil } from "@spt/utils/DatabaseDecompressionUtil";
import { DatabaseImporter } from "@spt/utils/DatabaseImporter";
import { EncodingUtil } from "@spt/utils/EncodingUtil";
import { HashUtil } from "@spt/utils/HashUtil";
import { HttpFileUtil } from "@spt/utils/HttpFileUtil";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { ImporterUtil } from "@spt/utils/ImporterUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { MathUtil } from "@spt/utils/MathUtil";
import { ObjectId } from "@spt/utils/ObjectId";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { VFS } from "@spt/utils/VFS";
import { Watermark, WatermarkLocale } from "@spt/utils/Watermark";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { JsonCloner } from "@spt/utils/cloners/JsonCloner";
import { RecursiveCloner } from "@spt/utils/cloners/RecursiveCloner";
import { StructuredCloner } from "@spt/utils/cloners/StructuredCloner";
import { WinstonMainLogger } from "@spt/utils/logging/WinstonMainLogger";
import { WinstonRequestLogger } from "@spt/utils/logging/WinstonRequestLogger";
import { DependencyContainer, Lifecycle } from "tsyringe";

/**
 * Handle the registration of classes to be used by the Dependency Injection code
 */
// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class Container {
    public static registerPostLoadTypes(container: DependencyContainer, childContainer: DependencyContainer): void {
        container.register<SptHttpListener>("SptHttpListener", SptHttpListener, { lifecycle: Lifecycle.Singleton });
        childContainer.registerType("HttpListener", "SptHttpListener");
    }

    public static registerTypes(depContainer: DependencyContainer): void {
        depContainer.register("ApplicationContext", ApplicationContext, { lifecycle: Lifecycle.Singleton });
        Container.registerUtils(depContainer);

        Container.registerRouters(depContainer);

        Container.registerGenerators(depContainer);

        Container.registerHelpers(depContainer);

        Container.registerLoaders(depContainer);

        Container.registerCallbacks(depContainer);

        Container.registerServers(depContainer);

        Container.registerServices(depContainer);

        Container.registerControllers(depContainer);

        Container.registerPrimaryDependencies(depContainer);
    }

    public static registerPrimaryDependencies(depContainer: DependencyContainer): void {
        depContainer.register<ILogger>(
            "PrimaryLogger",
            { useToken: "WinstonLogger" },
            { lifecycle: Lifecycle.Singleton },
        );
        depContainer.register<ICloner>(
            "PrimaryCloner",
            { useToken: "RecursiveCloner" },
            { lifecycle: Lifecycle.Singleton },
        );
    }

    public static registerListTypes(depContainer: DependencyContainer): void {
        depContainer.register("OnLoadModService", { useValue: new OnLoadModService(depContainer) });
        depContainer.register("HttpListenerModService", { useValue: new HttpListenerModService(depContainer) });
        depContainer.register("OnUpdateModService", { useValue: new OnUpdateModService(depContainer) });
        depContainer.register("DynamicRouterModService", { useValue: new DynamicRouterModService(depContainer) });
        depContainer.register("StaticRouterModService", { useValue: new StaticRouterModService(depContainer) });

        depContainer.registerType("OnLoad", "DatabaseImporter");
        depContainer.registerType("OnLoad", "PostDBModLoader");
        depContainer.registerType("OnLoad", "HandbookCallbacks");
        depContainer.registerType("OnLoad", "HttpCallbacks");
        depContainer.registerType("OnLoad", "PresetCallbacks");
        depContainer.registerType("OnLoad", "SaveCallbacks");
        depContainer.registerType("OnLoad", "TraderCallbacks"); // must occur prior to RagfairCallbacks
        depContainer.registerType("OnLoad", "RagfairPriceService");
        depContainer.registerType("OnLoad", "RagfairCallbacks");
        depContainer.registerType("OnLoad", "ModCallbacks");
        depContainer.registerType("OnLoad", "GameCallbacks");
        depContainer.registerType("OnUpdate", "DialogueCallbacks");
        depContainer.registerType("OnUpdate", "HideoutCallbacks");
        depContainer.registerType("OnUpdate", "TraderCallbacks");
        depContainer.registerType("OnUpdate", "RagfairCallbacks");
        depContainer.registerType("OnUpdate", "InsuranceCallbacks");
        depContainer.registerType("OnUpdate", "SaveCallbacks");

        depContainer.registerType("StaticRoutes", "BotStaticRouter");
        depContainer.registerType("StaticRoutes", "ClientLogStaticRouter");
        depContainer.registerType("StaticRoutes", "CustomizationStaticRouter");
        depContainer.registerType("StaticRoutes", "DataStaticRouter");
        depContainer.registerType("StaticRoutes", "DialogStaticRouter");
        depContainer.registerType("StaticRoutes", "GameStaticRouter");
        depContainer.registerType("StaticRoutes", "HealthStaticRouter");
        depContainer.registerType("StaticRoutes", "InraidStaticRouter");
        depContainer.registerType("StaticRoutes", "InsuranceStaticRouter");
        depContainer.registerType("StaticRoutes", "ItemEventStaticRouter");
        depContainer.registerType("StaticRoutes", "LauncherStaticRouter");
        depContainer.registerType("StaticRoutes", "LocationStaticRouter");
        depContainer.registerType("StaticRoutes", "WeatherStaticRouter");
        depContainer.registerType("StaticRoutes", "MatchStaticRouter");
        depContainer.registerType("StaticRoutes", "QuestStaticRouter");
        depContainer.registerType("StaticRoutes", "RagfairStaticRouter");
        depContainer.registerType("StaticRoutes", "BundleStaticRouter");
        depContainer.registerType("StaticRoutes", "AchievementStaticRouter");
        depContainer.registerType("StaticRoutes", "BuildsStaticRouter");
        depContainer.registerType("StaticRoutes", "NotifierStaticRouter");
        depContainer.registerType("StaticRoutes", "ProfileStaticRouter");
        depContainer.registerType("StaticRoutes", "TraderStaticRouter");
        depContainer.registerType("DynamicRoutes", "BotDynamicRouter");
        depContainer.registerType("DynamicRoutes", "BundleDynamicRouter");
        depContainer.registerType("DynamicRoutes", "CustomizationDynamicRouter");
        depContainer.registerType("DynamicRoutes", "DataDynamicRouter");
        depContainer.registerType("DynamicRoutes", "HttpDynamicRouter");
        depContainer.registerType("DynamicRoutes", "InraidDynamicRouter");
        depContainer.registerType("DynamicRoutes", "LocationDynamicRouter");
        depContainer.registerType("DynamicRoutes", "NotifierDynamicRouter");
        depContainer.registerType("DynamicRoutes", "TraderDynamicRouter");

        depContainer.registerType("IERouters", "CustomizationItemEventRouter");
        depContainer.registerType("IERouters", "HealthItemEventRouter");
        depContainer.registerType("IERouters", "HideoutItemEventRouter");
        depContainer.registerType("IERouters", "InsuranceItemEventRouter");
        depContainer.registerType("IERouters", "InventoryItemEventRouter");
        depContainer.registerType("IERouters", "NoteItemEventRouter");
        depContainer.registerType("IERouters", "QuestItemEventRouter");
        depContainer.registerType("IERouters", "RagfairItemEventRouter");
        depContainer.registerType("IERouters", "RepairItemEventRouter");
        depContainer.registerType("IERouters", "TradeItemEventRouter");
        depContainer.registerType("IERouters", "WishlistItemEventRouter");

        depContainer.registerType("Serializer", "ImageSerializer");
        depContainer.registerType("Serializer", "BundleSerializer");
        depContainer.registerType("Serializer", "NotifySerializer");
        depContainer.registerType("SaveLoadRouter", "HealthSaveLoadRouter");
        depContainer.registerType("SaveLoadRouter", "InraidSaveLoadRouter");
        depContainer.registerType("SaveLoadRouter", "InsuranceSaveLoadRouter");
        depContainer.registerType("SaveLoadRouter", "ProfileSaveLoadRouter");

        // Chat Bots
        depContainer.registerType("DialogueChatBot", "SptDialogueChatBot");
        depContainer.registerType("DialogueChatBot", "CommandoDialogueChatBot");

        // Commando Commands
        depContainer.registerType("CommandoCommand", "SptCommandoCommands");

        // SptCommando Commands
        depContainer.registerType("SptCommand", "GiveSptCommand");
        depContainer.registerType("SptCommand", "TraderSptCommand");
        depContainer.registerType("SptCommand", "ProfileSptCommand");

        // WebSocketHandlers
        depContainer.registerType("WebSocketConnectionHandler", "SptWebSocketConnectionHandler");

        // WebSocketMessageHandlers
        depContainer.registerType("SptWebSocketMessageHandler", "DefaultSptWebSocketMessageHandler");
    }

    private static registerUtils(depContainer: DependencyContainer): void {
        // Utils
        depContainer.register<App>("App", App, { lifecycle: Lifecycle.Singleton });
        depContainer.register<DatabaseDecompressionUtil>("DatabaseDecompressionUtil", DatabaseDecompressionUtil, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<DatabaseImporter>("DatabaseImporter", DatabaseImporter, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<HashUtil>("HashUtil", HashUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ImporterUtil>("ImporterUtil", ImporterUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<HttpResponseUtil>("HttpResponseUtil", HttpResponseUtil);
        depContainer.register<EncodingUtil>("EncodingUtil", EncodingUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<JsonUtil>("JsonUtil", JsonUtil);
        depContainer.register<WinstonMainLogger>("WinstonLogger", WinstonMainLogger, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<WinstonRequestLogger>("RequestsLogger", WinstonRequestLogger, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<MathUtil>("MathUtil", MathUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ObjectId>("ObjectId", ObjectId);
        depContainer.register<RandomUtil>("RandomUtil", RandomUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<TimeUtil>("TimeUtil", TimeUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<VFS>("VFS", VFS, { lifecycle: Lifecycle.Singleton });
        depContainer.register<WatermarkLocale>("WatermarkLocale", WatermarkLocale, { lifecycle: Lifecycle.Singleton });
        depContainer.register<Watermark>("Watermark", Watermark, { lifecycle: Lifecycle.Singleton });
        depContainer.register<IAsyncQueue>("AsyncQueue", AsyncQueue, { lifecycle: Lifecycle.Singleton });
        depContainer.register<HttpFileUtil>("HttpFileUtil", HttpFileUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ModLoadOrder>("ModLoadOrder", ModLoadOrder, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ModTypeCheck>("ModTypeCheck", ModTypeCheck, { lifecycle: Lifecycle.Singleton });
        depContainer.register<CompareUtil>("CompareUtil", CompareUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ICloner>("StructuredCloner", StructuredCloner, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ICloner>("JsonCloner", JsonCloner, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ICloner>("RecursiveCloner", RecursiveCloner, { lifecycle: Lifecycle.Singleton });
    }

    private static registerRouters(depContainer: DependencyContainer): void {
        // Routers
        depContainer.register<HttpRouter>("HttpRouter", HttpRouter, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ImageRouter>("ImageRouter", ImageRouter);
        depContainer.register<EventOutputHolder>("EventOutputHolder", EventOutputHolder, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<ItemEventRouter>("ItemEventRouter", ItemEventRouter);

        // Dynamic routes
        depContainer.register<BotDynamicRouter>("BotDynamicRouter", { useClass: BotDynamicRouter });
        depContainer.register<BundleDynamicRouter>("BundleDynamicRouter", { useClass: BundleDynamicRouter });
        depContainer.register<CustomizationDynamicRouter>("CustomizationDynamicRouter", {
            useClass: CustomizationDynamicRouter,
        });
        depContainer.register<DataDynamicRouter>("DataDynamicRouter", { useClass: DataDynamicRouter });
        depContainer.register<HttpDynamicRouter>("HttpDynamicRouter", { useClass: HttpDynamicRouter });
        depContainer.register<InraidDynamicRouter>("InraidDynamicRouter", { useClass: InraidDynamicRouter });
        depContainer.register<LocationDynamicRouter>("LocationDynamicRouter", { useClass: LocationDynamicRouter });
        depContainer.register<NotifierDynamicRouter>("NotifierDynamicRouter", { useClass: NotifierDynamicRouter });
        depContainer.register<TraderDynamicRouter>("TraderDynamicRouter", { useClass: TraderDynamicRouter });

        // Item event routes
        depContainer.register<CustomizationItemEventRouter>("CustomizationItemEventRouter", {
            useClass: CustomizationItemEventRouter,
        });
        depContainer.register<HealthItemEventRouter>("HealthItemEventRouter", { useClass: HealthItemEventRouter });
        depContainer.register<HideoutItemEventRouter>("HideoutItemEventRouter", { useClass: HideoutItemEventRouter });
        depContainer.register<InsuranceItemEventRouter>("InsuranceItemEventRouter", {
            useClass: InsuranceItemEventRouter,
        });
        depContainer.register<InventoryItemEventRouter>("InventoryItemEventRouter", {
            useClass: InventoryItemEventRouter,
        });
        depContainer.register<NoteItemEventRouter>("NoteItemEventRouter", { useClass: NoteItemEventRouter });
        depContainer.register<QuestItemEventRouter>("QuestItemEventRouter", { useClass: QuestItemEventRouter });
        depContainer.register<RagfairItemEventRouter>("RagfairItemEventRouter", { useClass: RagfairItemEventRouter });
        depContainer.register<RepairItemEventRouter>("RepairItemEventRouter", { useClass: RepairItemEventRouter });
        depContainer.register<TradeItemEventRouter>("TradeItemEventRouter", { useClass: TradeItemEventRouter });
        depContainer.register<WishlistItemEventRouter>("WishlistItemEventRouter", {
            useClass: WishlistItemEventRouter,
        });

        // save load routes
        depContainer.register<HealthSaveLoadRouter>("HealthSaveLoadRouter", { useClass: HealthSaveLoadRouter });
        depContainer.register<InraidSaveLoadRouter>("InraidSaveLoadRouter", { useClass: InraidSaveLoadRouter });
        depContainer.register<InsuranceSaveLoadRouter>("InsuranceSaveLoadRouter", {
            useClass: InsuranceSaveLoadRouter,
        });
        depContainer.register<ProfileSaveLoadRouter>("ProfileSaveLoadRouter", { useClass: ProfileSaveLoadRouter });

        // Route serializers
        depContainer.register<BundleSerializer>("BundleSerializer", { useClass: BundleSerializer });
        depContainer.register<ImageSerializer>("ImageSerializer", { useClass: ImageSerializer });
        depContainer.register<NotifySerializer>("NotifySerializer", { useClass: NotifySerializer });

        // Static routes
        depContainer.register<BotStaticRouter>("BotStaticRouter", { useClass: BotStaticRouter });
        depContainer.register<BundleStaticRouter>("BundleStaticRouter", { useClass: BundleStaticRouter });
        depContainer.register<ClientLogStaticRouter>("ClientLogStaticRouter", { useClass: ClientLogStaticRouter });
        depContainer.register<CustomizationStaticRouter>("CustomizationStaticRouter", {
            useClass: CustomizationStaticRouter,
        });
        depContainer.register<DataStaticRouter>("DataStaticRouter", { useClass: DataStaticRouter });
        depContainer.register<DialogStaticRouter>("DialogStaticRouter", { useClass: DialogStaticRouter });
        depContainer.register<GameStaticRouter>("GameStaticRouter", { useClass: GameStaticRouter });
        depContainer.register<HealthStaticRouter>("HealthStaticRouter", { useClass: HealthStaticRouter });
        depContainer.register<InraidStaticRouter>("InraidStaticRouter", { useClass: InraidStaticRouter });
        depContainer.register<InsuranceStaticRouter>("InsuranceStaticRouter", { useClass: InsuranceStaticRouter });
        depContainer.register<ItemEventStaticRouter>("ItemEventStaticRouter", { useClass: ItemEventStaticRouter });
        depContainer.register<LauncherStaticRouter>("LauncherStaticRouter", { useClass: LauncherStaticRouter });
        depContainer.register<LocationStaticRouter>("LocationStaticRouter", { useClass: LocationStaticRouter });
        depContainer.register<MatchStaticRouter>("MatchStaticRouter", { useClass: MatchStaticRouter });
        depContainer.register<NotifierStaticRouter>("NotifierStaticRouter", { useClass: NotifierStaticRouter });
        depContainer.register<ProfileStaticRouter>("ProfileStaticRouter", { useClass: ProfileStaticRouter });
        depContainer.register<QuestStaticRouter>("QuestStaticRouter", { useClass: QuestStaticRouter });
        depContainer.register<RagfairStaticRouter>("RagfairStaticRouter", { useClass: RagfairStaticRouter });
        depContainer.register<TraderStaticRouter>("TraderStaticRouter", { useClass: TraderStaticRouter });
        depContainer.register<WeatherStaticRouter>("WeatherStaticRouter", { useClass: WeatherStaticRouter });
        depContainer.register<AchievementStaticRouter>("AchievementStaticRouter", {
            useClass: AchievementStaticRouter,
        });
        depContainer.register<BuildsStaticRouter>("BuildsStaticRouter", { useClass: BuildsStaticRouter });
    }

    private static registerGenerators(depContainer: DependencyContainer): void {
        // Generators
        depContainer.register<BotGenerator>("BotGenerator", BotGenerator);
        depContainer.register<BotWeaponGenerator>("BotWeaponGenerator", BotWeaponGenerator);
        depContainer.register<BotLootGenerator>("BotLootGenerator", BotLootGenerator);
        depContainer.register<BotInventoryGenerator>("BotInventoryGenerator", BotInventoryGenerator);
        depContainer.register<LocationLootGenerator>("LocationLootGenerator", { useClass: LocationLootGenerator });
        depContainer.register<PMCLootGenerator>("PMCLootGenerator", PMCLootGenerator, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<ScavCaseRewardGenerator>("ScavCaseRewardGenerator", ScavCaseRewardGenerator, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<RagfairAssortGenerator>("RagfairAssortGenerator", { useClass: RagfairAssortGenerator });
        depContainer.register<RagfairOfferGenerator>("RagfairOfferGenerator", { useClass: RagfairOfferGenerator });
        depContainer.register<WeatherGenerator>("WeatherGenerator", { useClass: WeatherGenerator });
        depContainer.register<PlayerScavGenerator>("PlayerScavGenerator", { useClass: PlayerScavGenerator });
        depContainer.register<LootGenerator>("LootGenerator", { useClass: LootGenerator });
        depContainer.register<FenceBaseAssortGenerator>("FenceBaseAssortGenerator", {
            useClass: FenceBaseAssortGenerator,
        });
        depContainer.register<BotLevelGenerator>("BotLevelGenerator", { useClass: BotLevelGenerator });
        depContainer.register<BotEquipmentModGenerator>("BotEquipmentModGenerator", {
            useClass: BotEquipmentModGenerator,
        });
        depContainer.register<RepeatableQuestGenerator>("RepeatableQuestGenerator", {
            useClass: RepeatableQuestGenerator,
        });
        depContainer.register<RepeatableQuestRewardGenerator>("RepeatableQuestRewardGenerator", {
            useClass: RepeatableQuestRewardGenerator,
        });

        depContainer.register<BarrelInventoryMagGen>("BarrelInventoryMagGen", { useClass: BarrelInventoryMagGen });
        depContainer.register<ExternalInventoryMagGen>("ExternalInventoryMagGen", {
            useClass: ExternalInventoryMagGen,
        });
        depContainer.register<InternalMagazineInventoryMagGen>("InternalMagazineInventoryMagGen", {
            useClass: InternalMagazineInventoryMagGen,
        });
        depContainer.register<UbglExternalMagGen>("UbglExternalMagGen", { useClass: UbglExternalMagGen });

        depContainer.registerType("InventoryMagGen", "BarrelInventoryMagGen");
        depContainer.registerType("InventoryMagGen", "ExternalInventoryMagGen");
        depContainer.registerType("InventoryMagGen", "InternalMagazineInventoryMagGen");
        depContainer.registerType("InventoryMagGen", "UbglExternalMagGen");
    }

    private static registerHelpers(depContainer: DependencyContainer): void {
        // Helpers
        depContainer.register<AssortHelper>("AssortHelper", { useClass: AssortHelper });
        depContainer.register<BotHelper>("BotHelper", { useClass: BotHelper });
        depContainer.register<BotGeneratorHelper>("BotGeneratorHelper", { useClass: BotGeneratorHelper });
        depContainer.register<ContainerHelper>("ContainerHelper", ContainerHelper);
        depContainer.register<DialogueHelper>("DialogueHelper", { useClass: DialogueHelper });
        depContainer.register<DurabilityLimitsHelper>("DurabilityLimitsHelper", { useClass: DurabilityLimitsHelper });
        depContainer.register<GameEventHelper>("GameEventHelper", GameEventHelper);
        depContainer.register<HandbookHelper>("HandbookHelper", HandbookHelper, { lifecycle: Lifecycle.Singleton });
        depContainer.register<HealthHelper>("HealthHelper", { useClass: HealthHelper });
        depContainer.register<HideoutHelper>("HideoutHelper", { useClass: HideoutHelper });
        depContainer.register<InRaidHelper>("InRaidHelper", { useClass: InRaidHelper });
        depContainer.register<InventoryHelper>("InventoryHelper", { useClass: InventoryHelper });
        depContainer.register<PaymentHelper>("PaymentHelper", PaymentHelper);
        depContainer.register<ItemHelper>("ItemHelper", { useClass: ItemHelper });
        depContainer.register<PresetHelper>("PresetHelper", PresetHelper, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ProfileHelper>("ProfileHelper", { useClass: ProfileHelper });
        depContainer.register<QuestHelper>("QuestHelper", { useClass: QuestHelper });
        depContainer.register<QuestConditionHelper>("QuestConditionHelper", QuestConditionHelper);
        depContainer.register<RagfairHelper>("RagfairHelper", { useClass: RagfairHelper });
        depContainer.register<RagfairSortHelper>("RagfairSortHelper", { useClass: RagfairSortHelper });
        depContainer.register<RagfairSellHelper>("RagfairSellHelper", { useClass: RagfairSellHelper });
        depContainer.register<RagfairOfferHelper>("RagfairOfferHelper", { useClass: RagfairOfferHelper });
        depContainer.register<RagfairServerHelper>("RagfairServerHelper", { useClass: RagfairServerHelper });
        depContainer.register<RepairHelper>("RepairHelper", { useClass: RepairHelper });
        depContainer.register<TraderHelper>("TraderHelper", TraderHelper);
        depContainer.register<TraderAssortHelper>("TraderAssortHelper", TraderAssortHelper, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<TradeHelper>("TradeHelper", { useClass: TradeHelper });
        depContainer.register<NotifierHelper>("NotifierHelper", { useClass: NotifierHelper });
        depContainer.register<UtilityHelper>("UtilityHelper", UtilityHelper);
        depContainer.register<WeightedRandomHelper>("WeightedRandomHelper", { useClass: WeightedRandomHelper });
        depContainer.register<HttpServerHelper>("HttpServerHelper", { useClass: HttpServerHelper });
        depContainer.register<NotificationSendHelper>("NotificationSendHelper", { useClass: NotificationSendHelper });
        depContainer.register<SecureContainerHelper>("SecureContainerHelper", { useClass: SecureContainerHelper });
        depContainer.register<ProbabilityHelper>("ProbabilityHelper", { useClass: ProbabilityHelper });
        depContainer.register<WeatherHelper>("WeatherHelper", { useClass: WeatherHelper });
        depContainer.register<BotWeaponGeneratorHelper>("BotWeaponGeneratorHelper", {
            useClass: BotWeaponGeneratorHelper,
        });
        depContainer.register<BotDifficultyHelper>("BotDifficultyHelper", { useClass: BotDifficultyHelper });
        depContainer.register<RepeatableQuestHelper>("RepeatableQuestHelper", { useClass: RepeatableQuestHelper });

        // ChatBots
        depContainer.register<SptDialogueChatBot>("SptDialogueChatBot", SptDialogueChatBot);
        depContainer.register<CommandoDialogueChatBot>("CommandoDialogueChatBot", CommandoDialogueChatBot, {
            lifecycle: Lifecycle.Singleton,
        });
        // SptCommando
        depContainer.register<SptCommandoCommands>("SptCommandoCommands", SptCommandoCommands, {
            lifecycle: Lifecycle.Singleton,
        });
        // SptCommands
        depContainer.register<GiveSptCommand>("GiveSptCommand", GiveSptCommand, { lifecycle: Lifecycle.Singleton });
        depContainer.register<TraderSptCommand>("TraderSptCommand", TraderSptCommand, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<ProfileSptCommand>("ProfileSptCommand", ProfileSptCommand, {
            lifecycle: Lifecycle.Singleton,
        });
    }

    private static registerLoaders(depContainer: DependencyContainer): void {
        // Loaders
        depContainer.register<BundleLoader>("BundleLoader", BundleLoader, { lifecycle: Lifecycle.Singleton });
        depContainer.register<PreSptModLoader>("PreSptModLoader", PreSptModLoader, { lifecycle: Lifecycle.Singleton });
        depContainer.register<PostSptModLoader>("PostSptModLoader", PostSptModLoader, {
            lifecycle: Lifecycle.Singleton,
        });
    }

    private static registerCallbacks(depContainer: DependencyContainer): void {
        // Callbacks
        depContainer.register<BotCallbacks>("BotCallbacks", { useClass: BotCallbacks });
        depContainer.register<BundleCallbacks>("BundleCallbacks", { useClass: BundleCallbacks });
        depContainer.register<ClientLogCallbacks>("ClientLogCallbacks", { useClass: ClientLogCallbacks });
        depContainer.register<CustomizationCallbacks>("CustomizationCallbacks", { useClass: CustomizationCallbacks });
        depContainer.register<DataCallbacks>("DataCallbacks", { useClass: DataCallbacks });
        depContainer.register<DialogueCallbacks>("DialogueCallbacks", { useClass: DialogueCallbacks });
        depContainer.register<GameCallbacks>("GameCallbacks", { useClass: GameCallbacks });
        depContainer.register<HandbookCallbacks>("HandbookCallbacks", { useClass: HandbookCallbacks });
        depContainer.register<HealthCallbacks>("HealthCallbacks", { useClass: HealthCallbacks });
        depContainer.register<HideoutCallbacks>("HideoutCallbacks", { useClass: HideoutCallbacks });
        depContainer.register<HttpCallbacks>("HttpCallbacks", { useClass: HttpCallbacks });
        depContainer.register<InraidCallbacks>("InraidCallbacks", { useClass: InraidCallbacks });
        depContainer.register<InsuranceCallbacks>("InsuranceCallbacks", { useClass: InsuranceCallbacks });
        depContainer.register<InventoryCallbacks>("InventoryCallbacks", { useClass: InventoryCallbacks });
        depContainer.register<ItemEventCallbacks>("ItemEventCallbacks", { useClass: ItemEventCallbacks });
        depContainer.register<LauncherCallbacks>("LauncherCallbacks", { useClass: LauncherCallbacks });
        depContainer.register<LocationCallbacks>("LocationCallbacks", { useClass: LocationCallbacks });
        depContainer.register<MatchCallbacks>("MatchCallbacks", { useClass: MatchCallbacks });
        depContainer.register<ModCallbacks>("ModCallbacks", { useClass: ModCallbacks });
        depContainer.register<PostDBModLoader>("PostDBModLoader", { useClass: PostDBModLoader });
        depContainer.register<NoteCallbacks>("NoteCallbacks", { useClass: NoteCallbacks });
        depContainer.register<NotifierCallbacks>("NotifierCallbacks", { useClass: NotifierCallbacks });
        depContainer.register<PresetCallbacks>("PresetCallbacks", { useClass: PresetCallbacks });
        depContainer.register<ProfileCallbacks>("ProfileCallbacks", { useClass: ProfileCallbacks });
        depContainer.register<QuestCallbacks>("QuestCallbacks", { useClass: QuestCallbacks });
        depContainer.register<RagfairCallbacks>("RagfairCallbacks", { useClass: RagfairCallbacks });
        depContainer.register<RepairCallbacks>("RepairCallbacks", { useClass: RepairCallbacks });
        depContainer.register<SaveCallbacks>("SaveCallbacks", { useClass: SaveCallbacks });
        depContainer.register<TradeCallbacks>("TradeCallbacks", { useClass: TradeCallbacks });
        depContainer.register<TraderCallbacks>("TraderCallbacks", { useClass: TraderCallbacks });
        depContainer.register<WeatherCallbacks>("WeatherCallbacks", { useClass: WeatherCallbacks });
        depContainer.register<WishlistCallbacks>("WishlistCallbacks", { useClass: WishlistCallbacks });
        depContainer.register<AchievementCallbacks>("AchievementCallbacks", { useClass: AchievementCallbacks });
        depContainer.register<BuildsCallbacks>("BuildsCallbacks", { useClass: BuildsCallbacks });
    }

    private static registerServices(depContainer: DependencyContainer): void {
        // Services
        depContainer.register<DatabaseService>("DatabaseService", DatabaseService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ImageRouteService>("ImageRouteService", ImageRouteService, {
            lifecycle: Lifecycle.Singleton,
        });

        depContainer.register<FenceService>("FenceService", FenceService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<PlayerService>("PlayerService", { useClass: PlayerService });
        depContainer.register<PaymentService>("PaymentService", { useClass: PaymentService });
        depContainer.register<InsuranceService>("InsuranceService", InsuranceService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<TraderAssortService>("TraderAssortService", TraderAssortService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<RagfairPriceService>("RagfairPriceService", RagfairPriceService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<RagfairCategoriesService>("RagfairCategoriesService", RagfairCategoriesService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<RagfairOfferService>("RagfairOfferService", RagfairOfferService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<RagfairLinkedItemService>("RagfairLinkedItemService", RagfairLinkedItemService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<RagfairRequiredItemsService>("RagfairRequiredItemsService", RagfairRequiredItemsService, {
            lifecycle: Lifecycle.Singleton,
        });

        depContainer.register<NotificationService>("NotificationService", NotificationService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<MatchLocationService>("MatchLocationService", MatchLocationService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<ModCompilerService>("ModCompilerService", ModCompilerService);
        depContainer.register<BundleHashCacheService>("BundleHashCacheService", BundleHashCacheService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<ModHashCacheService>("ModHashCacheService", ModHashCacheService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<LocaleService>("LocaleService", LocaleService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ProfileFixerService>("ProfileFixerService", ProfileFixerService);
        depContainer.register<RepairService>("RepairService", RepairService);
        depContainer.register<BotLootCacheService>("BotLootCacheService", BotLootCacheService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<CustomItemService>("CustomItemService", CustomItemService);
        depContainer.register<BotEquipmentFilterService>("BotEquipmentFilterService", BotEquipmentFilterService);
        depContainer.register<InMemoryCacheService>("InMemoryCacheService", InMemoryCacheService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<ItemFilterService>("ItemFilterService", ItemFilterService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<BotGenerationCacheService>("BotGenerationCacheService", BotGenerationCacheService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<LocalisationService>("LocalisationService", LocalisationService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<CustomLocationWaveService>("CustomLocationWaveService", CustomLocationWaveService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<OpenZoneService>("OpenZoneService", OpenZoneService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ItemBaseClassService>("ItemBaseClassService", ItemBaseClassService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<BotEquipmentModPoolService>("BotEquipmentModPoolService", BotEquipmentModPoolService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<BotWeaponModLimitService>("BotWeaponModLimitService", BotWeaponModLimitService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<SeasonalEventService>("SeasonalEventService", SeasonalEventService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<MatchBotDetailsCacheService>("MatchBotDetailsCacheService", MatchBotDetailsCacheService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<RagfairTaxService>("RagfairTaxService", RagfairTaxService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<TraderPurchasePersisterService>(
            "TraderPurchasePersisterService",
            TraderPurchasePersisterService,
        );
        depContainer.register<PmcChatResponseService>("PmcChatResponseService", PmcChatResponseService);
        depContainer.register<GiftService>("GiftService", GiftService);
        depContainer.register<MailSendService>("MailSendService", MailSendService);
        depContainer.register<RaidTimeAdjustmentService>("RaidTimeAdjustmentService", RaidTimeAdjustmentService);
        depContainer.register<MapMarkerService>("MapMarkerService", MapMarkerService);

        depContainer.register<ProfileActivityService>("ProfileActivityService", ProfileActivityService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<AirdropService>("AirdropService", AirdropService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<LocationLifecycleService>("LocationLifecycleService", LocationLifecycleService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<CircleOfCultistService>("CircleOfCultistService", CircleOfCultistService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<BotNameService>("BotNameService", BotNameService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<RaidWeatherService>("RaidWeatherService", RaidWeatherService, {
            lifecycle: Lifecycle.Singleton,
        });
        depContainer.register<PostDbLoadService>("PostDbLoadService", PostDbLoadService, {
            lifecycle: Lifecycle.Singleton,
        });
    }

    private static registerServers(depContainer: DependencyContainer): void {
        // Servers
        depContainer.register<DatabaseServer>("DatabaseServer", DatabaseServer, { lifecycle: Lifecycle.Singleton });
        depContainer.register<HttpServer>("HttpServer", HttpServer, { lifecycle: Lifecycle.Singleton });
        depContainer.register<WebSocketServer>("WebSocketServer", WebSocketServer, { lifecycle: Lifecycle.Singleton });
        depContainer.register<IWebSocketConnectionHandler>(
            "SptWebSocketConnectionHandler",
            SptWebSocketConnectionHandler,
            { lifecycle: Lifecycle.Singleton },
        );
        depContainer.register<ISptWebSocketMessageHandler>(
            "DefaultSptWebSocketMessageHandler",
            DefaultSptWebSocketMessageHandler,
            { lifecycle: Lifecycle.Singleton },
        );
        depContainer.register<RagfairServer>("RagfairServer", RagfairServer);
        depContainer.register<SaveServer>("SaveServer", SaveServer, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ConfigServer>("ConfigServer", ConfigServer, { lifecycle: Lifecycle.Singleton });
    }

    private static registerControllers(depContainer: DependencyContainer): void {
        // Controllers
        depContainer.register<BotController>("BotController", { useClass: BotController });
        depContainer.register<ClientLogController>("ClientLogController", { useClass: ClientLogController });
        depContainer.register<CustomizationController>("CustomizationController", {
            useClass: CustomizationController,
        });
        depContainer.register<DialogueController>(
            "DialogueController",
            { useClass: DialogueController },
            {
                lifecycle: Lifecycle.Singleton,
            },
        );
        depContainer.register<GameController>("GameController", { useClass: GameController });
        depContainer.register<HandbookController>("HandbookController", { useClass: HandbookController });
        depContainer.register<HealthController>("HealthController", { useClass: HealthController });
        depContainer.register<HideoutController>("HideoutController", { useClass: HideoutController });
        depContainer.register<InraidController>("InraidController", { useClass: InraidController });
        depContainer.register<InsuranceController>("InsuranceController", { useClass: InsuranceController });
        depContainer.register<InventoryController>("InventoryController", { useClass: InventoryController });
        depContainer.register<LauncherController>("LauncherController", { useClass: LauncherController });
        depContainer.register<LocationController>("LocationController", { useClass: LocationController });
        depContainer.register<MatchController>("MatchController", MatchController);
        depContainer.register<NoteController>("NoteController", { useClass: NoteController });
        depContainer.register<NotifierController>("NotifierController", { useClass: NotifierController });
        depContainer.register<BuildController>("BuildController", { useClass: BuildController });
        depContainer.register<PresetController>("PresetController", { useClass: PresetController });
        depContainer.register<ProfileController>("ProfileController", { useClass: ProfileController });
        depContainer.register<QuestController>("QuestController", { useClass: QuestController });
        depContainer.register<RagfairController>("RagfairController", { useClass: RagfairController });
        depContainer.register<RepairController>("RepairController", { useClass: RepairController });
        depContainer.register<RepeatableQuestController>("RepeatableQuestController", {
            useClass: RepeatableQuestController,
        });
        depContainer.register<TradeController>("TradeController", { useClass: TradeController });
        depContainer.register<TraderController>("TraderController", { useClass: TraderController });
        depContainer.register<WeatherController>("WeatherController", { useClass: WeatherController });
        depContainer.register<WishlistController>("WishlistController", WishlistController);
        depContainer.register<AchievementController>("AchievementController", AchievementController);
    }
}
