import { DependencyContainer, Lifecycle } from "tsyringe";

import { AchievementCallbacks } from "@spt-aki/callbacks/AchievementCallbacks";
import { BotCallbacks } from "@spt-aki/callbacks/BotCallbacks";
import { BuildsCallbacks } from "@spt-aki/callbacks/BuildsCallbacks";
import { BundleCallbacks } from "@spt-aki/callbacks/BundleCallbacks";
import { ClientLogCallbacks } from "@spt-aki/callbacks/ClientLogCallbacks";
import { CustomizationCallbacks } from "@spt-aki/callbacks/CustomizationCallbacks";
import { DataCallbacks } from "@spt-aki/callbacks/DataCallbacks";
import { DialogueCallbacks } from "@spt-aki/callbacks/DialogueCallbacks";
import { GameCallbacks } from "@spt-aki/callbacks/GameCallbacks";
import { HandbookCallbacks } from "@spt-aki/callbacks/HandbookCallbacks";
import { HealthCallbacks } from "@spt-aki/callbacks/HealthCallbacks";
import { HideoutCallbacks } from "@spt-aki/callbacks/HideoutCallbacks";
import { HttpCallbacks } from "@spt-aki/callbacks/HttpCallbacks";
import { InraidCallbacks } from "@spt-aki/callbacks/InraidCallbacks";
import { InsuranceCallbacks } from "@spt-aki/callbacks/InsuranceCallbacks";
import { InventoryCallbacks } from "@spt-aki/callbacks/InventoryCallbacks";
import { ItemEventCallbacks } from "@spt-aki/callbacks/ItemEventCallbacks";
import { LauncherCallbacks } from "@spt-aki/callbacks/LauncherCallbacks";
import { LocationCallbacks } from "@spt-aki/callbacks/LocationCallbacks";
import { MatchCallbacks } from "@spt-aki/callbacks/MatchCallbacks";
import { ModCallbacks } from "@spt-aki/callbacks/ModCallbacks";
import { NoteCallbacks } from "@spt-aki/callbacks/NoteCallbacks";
import { NotifierCallbacks } from "@spt-aki/callbacks/NotifierCallbacks";
import { PresetCallbacks } from "@spt-aki/callbacks/PresetCallbacks";
import { ProfileCallbacks } from "@spt-aki/callbacks/ProfileCallbacks";
import { QuestCallbacks } from "@spt-aki/callbacks/QuestCallbacks";
import { RagfairCallbacks } from "@spt-aki/callbacks/RagfairCallbacks";
import { RepairCallbacks } from "@spt-aki/callbacks/RepairCallbacks";
import { SaveCallbacks } from "@spt-aki/callbacks/SaveCallbacks";
import { TradeCallbacks } from "@spt-aki/callbacks/TradeCallbacks";
import { TraderCallbacks } from "@spt-aki/callbacks/TraderCallbacks";
import { WeatherCallbacks } from "@spt-aki/callbacks/WeatherCallbacks";
import { WishlistCallbacks } from "@spt-aki/callbacks/WishlistCallbacks";
import { ApplicationContext } from "@spt-aki/context/ApplicationContext";
import { AchievementController } from "@spt-aki/controllers/AchievementController";
import { BotController } from "@spt-aki/controllers/BotController";
import { BuildController } from "@spt-aki/controllers/BuildController";
import { ClientLogController } from "@spt-aki/controllers/ClientLogController";
import { CustomizationController } from "@spt-aki/controllers/CustomizationController";
import { DialogueController } from "@spt-aki/controllers/DialogueController";
import { GameController } from "@spt-aki/controllers/GameController";
import { HandbookController } from "@spt-aki/controllers/HandbookController";
import { HealthController } from "@spt-aki/controllers/HealthController";
import { HideoutController } from "@spt-aki/controllers/HideoutController";
import { InraidController } from "@spt-aki/controllers/InraidController";
import { InsuranceController } from "@spt-aki/controllers/InsuranceController";
import { InventoryController } from "@spt-aki/controllers/InventoryController";
import { LauncherController } from "@spt-aki/controllers/LauncherController";
import { LocationController } from "@spt-aki/controllers/LocationController";
import { MatchController } from "@spt-aki/controllers/MatchController";
import { NoteController } from "@spt-aki/controllers/NoteController";
import { NotifierController } from "@spt-aki/controllers/NotifierController";
import { PresetController } from "@spt-aki/controllers/PresetController";
import { ProfileController } from "@spt-aki/controllers/ProfileController";
import { QuestController } from "@spt-aki/controllers/QuestController";
import { RagfairController } from "@spt-aki/controllers/RagfairController";
import { RepairController } from "@spt-aki/controllers/RepairController";
import { RepeatableQuestController } from "@spt-aki/controllers/RepeatableQuestController";
import { TradeController } from "@spt-aki/controllers/TradeController";
import { TraderController } from "@spt-aki/controllers/TraderController";
import { WeatherController } from "@spt-aki/controllers/WeatherController";
import { WishlistController } from "@spt-aki/controllers/WishlistController";
import { BotEquipmentModGenerator } from "@spt-aki/generators/BotEquipmentModGenerator";
import { BotGenerator } from "@spt-aki/generators/BotGenerator";
import { BotInventoryGenerator } from "@spt-aki/generators/BotInventoryGenerator";
import { BotLevelGenerator } from "@spt-aki/generators/BotLevelGenerator";
import { BotLootGenerator } from "@spt-aki/generators/BotLootGenerator";
import { BotWeaponGenerator } from "@spt-aki/generators/BotWeaponGenerator";
import { FenceBaseAssortGenerator } from "@spt-aki/generators/FenceBaseAssortGenerator";
import { LocationGenerator } from "@spt-aki/generators/LocationGenerator";
import { LootGenerator } from "@spt-aki/generators/LootGenerator";
import { PMCLootGenerator } from "@spt-aki/generators/PMCLootGenerator";
import { PlayerScavGenerator } from "@spt-aki/generators/PlayerScavGenerator";
import { RagfairAssortGenerator } from "@spt-aki/generators/RagfairAssortGenerator";
import { RagfairOfferGenerator } from "@spt-aki/generators/RagfairOfferGenerator";
import { RepeatableQuestGenerator } from "@spt-aki/generators/RepeatableQuestGenerator";
import { RepeatableQuestRewardGenerator } from "@spt-aki/generators/RepeatableQuestRewardGenerator";
import { ScavCaseRewardGenerator } from "@spt-aki/generators/ScavCaseRewardGenerator";
import { WeatherGenerator } from "@spt-aki/generators/WeatherGenerator";
import { BarrelInventoryMagGen } from "@spt-aki/generators/weapongen/implementations/BarrelInventoryMagGen";
import { ExternalInventoryMagGen } from "@spt-aki/generators/weapongen/implementations/ExternalInventoryMagGen";
import { InternalMagazineInventoryMagGen } from "@spt-aki/generators/weapongen/implementations/InternalMagazineInventoryMagGen";
import { UbglExternalMagGen } from "@spt-aki/generators/weapongen/implementations/UbglExternalMagGen";
import { AssortHelper } from "@spt-aki/helpers/AssortHelper";
import { BotDifficultyHelper } from "@spt-aki/helpers/BotDifficultyHelper";
import { BotGeneratorHelper } from "@spt-aki/helpers/BotGeneratorHelper";
import { BotHelper } from "@spt-aki/helpers/BotHelper";
import { BotWeaponGeneratorHelper } from "@spt-aki/helpers/BotWeaponGeneratorHelper";
import { ContainerHelper } from "@spt-aki/helpers/ContainerHelper";
import { SptCommandoCommands } from "@spt-aki/helpers/Dialogue/Commando/SptCommandoCommands";
import { GiveSptCommand } from "@spt-aki/helpers/Dialogue/Commando/SptCommands/GiveSptCommand";
import { CommandoDialogueChatBot } from "@spt-aki/helpers/Dialogue/CommandoDialogueChatBot";
import { SptDialogueChatBot } from "@spt-aki/helpers/Dialogue/SptDialogueChatBot";
import { DialogueHelper } from "@spt-aki/helpers/DialogueHelper";
import { DurabilityLimitsHelper } from "@spt-aki/helpers/DurabilityLimitsHelper";
import { GameEventHelper } from "@spt-aki/helpers/GameEventHelper";
import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { HealthHelper } from "@spt-aki/helpers/HealthHelper";
import { HideoutHelper } from "@spt-aki/helpers/HideoutHelper";
import { HttpServerHelper } from "@spt-aki/helpers/HttpServerHelper";
import { InRaidHelper } from "@spt-aki/helpers/InRaidHelper";
import { InventoryHelper } from "@spt-aki/helpers/InventoryHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { NotificationSendHelper } from "@spt-aki/helpers/NotificationSendHelper";
import { NotifierHelper } from "@spt-aki/helpers/NotifierHelper";
import { PaymentHelper } from "@spt-aki/helpers/PaymentHelper";
import { PresetHelper } from "@spt-aki/helpers/PresetHelper";
import { ProbabilityHelper } from "@spt-aki/helpers/ProbabilityHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { QuestConditionHelper } from "@spt-aki/helpers/QuestConditionHelper";
import { QuestHelper } from "@spt-aki/helpers/QuestHelper";
import { RagfairHelper } from "@spt-aki/helpers/RagfairHelper";
import { RagfairOfferHelper } from "@spt-aki/helpers/RagfairOfferHelper";
import { RagfairSellHelper } from "@spt-aki/helpers/RagfairSellHelper";
import { RagfairServerHelper } from "@spt-aki/helpers/RagfairServerHelper";
import { RagfairSortHelper } from "@spt-aki/helpers/RagfairSortHelper";
import { RepairHelper } from "@spt-aki/helpers/RepairHelper";
import { RepeatableQuestHelper } from "@spt-aki/helpers/RepeatableQuestHelper";
import { SecureContainerHelper } from "@spt-aki/helpers/SecureContainerHelper";
import { TradeHelper } from "@spt-aki/helpers/TradeHelper";
import { TraderAssortHelper } from "@spt-aki/helpers/TraderAssortHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { UtilityHelper } from "@spt-aki/helpers/UtilityHelper";
import { WeightedRandomHelper } from "@spt-aki/helpers/WeightedRandomHelper";
import { BundleLoader } from "@spt-aki/loaders/BundleLoader";
import { ModLoadOrder } from "@spt-aki/loaders/ModLoadOrder";
import { ModTypeCheck } from "@spt-aki/loaders/ModTypeCheck";
import { PostAkiModLoader } from "@spt-aki/loaders/PostAkiModLoader";
import { PostDBModLoader } from "@spt-aki/loaders/PostDBModLoader";
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { IAsyncQueue } from "@spt-aki/models/spt/utils/IAsyncQueue";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { HttpRouter } from "@spt-aki/routers/HttpRouter";
import { ImageRouter } from "@spt-aki/routers/ImageRouter";
import { ItemEventRouter } from "@spt-aki/routers/ItemEventRouter";
import { BotDynamicRouter } from "@spt-aki/routers/dynamic/BotDynamicRouter";
import { BundleDynamicRouter } from "@spt-aki/routers/dynamic/BundleDynamicRouter";
import { CustomizationDynamicRouter } from "@spt-aki/routers/dynamic/CustomizationDynamicRouter";
import { DataDynamicRouter } from "@spt-aki/routers/dynamic/DataDynamicRouter";
import { HttpDynamicRouter } from "@spt-aki/routers/dynamic/HttpDynamicRouter";
import { InraidDynamicRouter } from "@spt-aki/routers/dynamic/InraidDynamicRouter";
import { LocationDynamicRouter } from "@spt-aki/routers/dynamic/LocationDynamicRouter";
import { NotifierDynamicRouter } from "@spt-aki/routers/dynamic/NotifierDynamicRouter";
import { TraderDynamicRouter } from "@spt-aki/routers/dynamic/TraderDynamicRouter";
import { CustomizationItemEventRouter } from "@spt-aki/routers/item_events/CustomizationItemEventRouter";
import { HealthItemEventRouter } from "@spt-aki/routers/item_events/HealthItemEventRouter";
import { HideoutItemEventRouter } from "@spt-aki/routers/item_events/HideoutItemEventRouter";
import { InsuranceItemEventRouter } from "@spt-aki/routers/item_events/InsuranceItemEventRouter";
import { InventoryItemEventRouter } from "@spt-aki/routers/item_events/InventoryItemEventRouter";
import { NoteItemEventRouter } from "@spt-aki/routers/item_events/NoteItemEventRouter";
import { QuestItemEventRouter } from "@spt-aki/routers/item_events/QuestItemEventRouter";
import { RagfairItemEventRouter } from "@spt-aki/routers/item_events/RagfairItemEventRouter";
import { RepairItemEventRouter } from "@spt-aki/routers/item_events/RepairItemEventRouter";
import { TradeItemEventRouter } from "@spt-aki/routers/item_events/TradeItemEventRouter";
import { WishlistItemEventRouter } from "@spt-aki/routers/item_events/WishlistItemEventRouter";
import { HealthSaveLoadRouter } from "@spt-aki/routers/save_load/HealthSaveLoadRouter";
import { InraidSaveLoadRouter } from "@spt-aki/routers/save_load/InraidSaveLoadRouter";
import { InsuranceSaveLoadRouter } from "@spt-aki/routers/save_load/InsuranceSaveLoadRouter";
import { ProfileSaveLoadRouter } from "@spt-aki/routers/save_load/ProfileSaveLoadRouter";
import { BundleSerializer } from "@spt-aki/routers/serializers/BundleSerializer";
import { ImageSerializer } from "@spt-aki/routers/serializers/ImageSerializer";
import { NotifySerializer } from "@spt-aki/routers/serializers/NotifySerializer";
import { AchievementStaticRouter } from "@spt-aki/routers/static/AchievementStaticRouter";
import { BotStaticRouter } from "@spt-aki/routers/static/BotStaticRouter";
import { BuildsStaticRouter } from "@spt-aki/routers/static/BuildStaticRouter";
import { BundleStaticRouter } from "@spt-aki/routers/static/BundleStaticRouter";
import { ClientLogStaticRouter } from "@spt-aki/routers/static/ClientLogStaticRouter";
import { CustomizationStaticRouter } from "@spt-aki/routers/static/CustomizationStaticRouter";
import { DataStaticRouter } from "@spt-aki/routers/static/DataStaticRouter";
import { DialogStaticRouter } from "@spt-aki/routers/static/DialogStaticRouter";
import { GameStaticRouter } from "@spt-aki/routers/static/GameStaticRouter";
import { HealthStaticRouter } from "@spt-aki/routers/static/HealthStaticRouter";
import { InraidStaticRouter } from "@spt-aki/routers/static/InraidStaticRouter";
import { InsuranceStaticRouter } from "@spt-aki/routers/static/InsuranceStaticRouter";
import { ItemEventStaticRouter } from "@spt-aki/routers/static/ItemEventStaticRouter";
import { LauncherStaticRouter } from "@spt-aki/routers/static/LauncherStaticRouter";
import { LocationStaticRouter } from "@spt-aki/routers/static/LocationStaticRouter";
import { MatchStaticRouter } from "@spt-aki/routers/static/MatchStaticRouter";
import { NotifierStaticRouter } from "@spt-aki/routers/static/NotifierStaticRouter";
import { ProfileStaticRouter } from "@spt-aki/routers/static/ProfileStaticRouter";
import { QuestStaticRouter } from "@spt-aki/routers/static/QuestStaticRouter";
import { RagfairStaticRouter } from "@spt-aki/routers/static/RagfairStaticRouter";
import { TraderStaticRouter } from "@spt-aki/routers/static/TraderStaticRouter";
import { WeatherStaticRouter } from "@spt-aki/routers/static/WeatherStaticRouter";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { HttpServer } from "@spt-aki/servers/HttpServer";
import { RagfairServer } from "@spt-aki/servers/RagfairServer";
import { SaveServer } from "@spt-aki/servers/SaveServer";
import { WebSocketServer } from "@spt-aki/servers/WebSocketServer";
import { AkiHttpListener } from "@spt-aki/servers/http/AkiHttpListener";
import { BotEquipmentFilterService } from "@spt-aki/services/BotEquipmentFilterService";
import { BotEquipmentModPoolService } from "@spt-aki/services/BotEquipmentModPoolService";
import { BotGenerationCacheService } from "@spt-aki/services/BotGenerationCacheService";
import { BotLootCacheService } from "@spt-aki/services/BotLootCacheService";
import { BotWeaponModLimitService } from "@spt-aki/services/BotWeaponModLimitService";
import { CustomLocationWaveService } from "@spt-aki/services/CustomLocationWaveService";
import { FenceService } from "@spt-aki/services/FenceService";
import { GiftService } from "@spt-aki/services/GiftService";
import { InsuranceService } from "@spt-aki/services/InsuranceService";
import { ItemBaseClassService } from "@spt-aki/services/ItemBaseClassService";
import { ItemFilterService } from "@spt-aki/services/ItemFilterService";
import { LocaleService } from "@spt-aki/services/LocaleService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { MailSendService } from "@spt-aki/services/MailSendService";
import { MatchBotDetailsCacheService } from "@spt-aki/services/MatchBotDetailsCacheService";
import { MatchLocationService } from "@spt-aki/services/MatchLocationService";
import { ModCompilerService } from "@spt-aki/services/ModCompilerService";
import { NotificationService } from "@spt-aki/services/NotificationService";
import { OpenZoneService } from "@spt-aki/services/OpenZoneService";
import { PaymentService } from "@spt-aki/services/PaymentService";
import { PlayerService } from "@spt-aki/services/PlayerService";
import { PmcChatResponseService } from "@spt-aki/services/PmcChatResponseService";
import { ProfileFixerService } from "@spt-aki/services/ProfileFixerService";
import { ProfileSnapshotService } from "@spt-aki/services/ProfileSnapshotService";
import { RagfairCategoriesService } from "@spt-aki/services/RagfairCategoriesService";
import { RagfairLinkedItemService } from "@spt-aki/services/RagfairLinkedItemService";
import { RagfairOfferService } from "@spt-aki/services/RagfairOfferService";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";
import { RagfairRequiredItemsService } from "@spt-aki/services/RagfairRequiredItemsService";
import { RagfairTaxService } from "@spt-aki/services/RagfairTaxService";
import { RaidTimeAdjustmentService } from "@spt-aki/services/RaidTimeAdjustmentService";
import { RepairService } from "@spt-aki/services/RepairService";
import { SeasonalEventService } from "@spt-aki/services/SeasonalEventService";
import { TraderAssortService } from "@spt-aki/services/TraderAssortService";
import { TraderPurchasePersisterService } from "@spt-aki/services/TraderPurchasePersisterService";
import { TraderServicesService } from "@spt-aki/services/TraderServicesService";
import { BundleHashCacheService } from "@spt-aki/services/cache/BundleHashCacheService";
import { ModHashCacheService } from "@spt-aki/services/cache/ModHashCacheService";
import { CustomItemService } from "@spt-aki/services/mod/CustomItemService";
import { DynamicRouterModService } from "@spt-aki/services/mod/dynamicRouter/DynamicRouterModService";
import { HttpListenerModService } from "@spt-aki/services/mod/httpListener/HttpListenerModService";
import { ImageRouteService } from "@spt-aki/services/mod/image/ImageRouteService";
import { OnLoadModService } from "@spt-aki/services/mod/onLoad/OnLoadModService";
import { OnUpdateModService } from "@spt-aki/services/mod/onUpdate/OnUpdateModService";
import { StaticRouterModService } from "@spt-aki/services/mod/staticRouter/StaticRouterModService";
import { App } from "@spt-aki/utils/App";
import { AsyncQueue } from "@spt-aki/utils/AsyncQueue";
import { DatabaseImporter } from "@spt-aki/utils/DatabaseImporter";
import { EncodingUtil } from "@spt-aki/utils/EncodingUtil";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { HttpFileUtil } from "@spt-aki/utils/HttpFileUtil";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { ImporterUtil } from "@spt-aki/utils/ImporterUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { MathUtil } from "@spt-aki/utils/MathUtil";
import { ObjectId } from "@spt-aki/utils/ObjectId";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";
import { VFS } from "@spt-aki/utils/VFS";
import { Watermark, WatermarkLocale } from "@spt-aki/utils/Watermark";
import { WinstonMainLogger } from "@spt-aki/utils/logging/WinstonMainLogger";
import { WinstonRequestLogger } from "@spt-aki/utils/logging/WinstonRequestLogger";

/**
 * Handle the registration of classes to be used by the Dependency Injection code
 */
export class Container
{
    public static registerPostLoadTypes(container: DependencyContainer, childContainer: DependencyContainer): void
    {
        container.register<AkiHttpListener>("AkiHttpListener", AkiHttpListener, { lifecycle: Lifecycle.Singleton });
        childContainer.registerType("HttpListener", "AkiHttpListener");
    }

    public static registerTypes(depContainer: DependencyContainer): void
    {
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
    }

    public static registerListTypes(depContainer: DependencyContainer): void
    {
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
    }

    private static registerUtils(depContainer: DependencyContainer): void
    {
        // Utils
        depContainer.register<App>("App", App, { lifecycle: Lifecycle.Singleton });
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
    }

    private static registerRouters(depContainer: DependencyContainer): void
    {
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

    private static registerGenerators(depContainer: DependencyContainer): void
    {
        // Generators
        depContainer.register<BotGenerator>("BotGenerator", BotGenerator);
        depContainer.register<BotWeaponGenerator>("BotWeaponGenerator", BotWeaponGenerator);
        depContainer.register<BotLootGenerator>("BotLootGenerator", BotLootGenerator);
        depContainer.register<BotInventoryGenerator>("BotInventoryGenerator", BotInventoryGenerator);
        depContainer.register<LocationGenerator>("LocationGenerator", { useClass: LocationGenerator });
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

    private static registerHelpers(depContainer: DependencyContainer): void
    {
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
        depContainer.register<GiveSptCommand>("GiveSptCommand", GiveSptCommand);
    }

    private static registerLoaders(depContainer: DependencyContainer): void
    {
        // Loaders
        depContainer.register<BundleLoader>("BundleLoader", BundleLoader, { lifecycle: Lifecycle.Singleton });
        depContainer.register<PreAkiModLoader>("PreAkiModLoader", PreAkiModLoader, { lifecycle: Lifecycle.Singleton });
        depContainer.register<PostAkiModLoader>("PostAkiModLoader", PostAkiModLoader, {
            lifecycle: Lifecycle.Singleton,
        });
    }

    private static registerCallbacks(depContainer: DependencyContainer): void
    {
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

    private static registerServices(depContainer: DependencyContainer): void
    {
        // Services
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
        depContainer.register<TraderServicesService>("TraderServicesService", TraderServicesService, {
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
        depContainer.register<ProfileSnapshotService>("ProfileSnapshotService", ProfileSnapshotService, {
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
    }

    private static registerServers(depContainer: DependencyContainer): void
    {
        // Servers
        depContainer.register<DatabaseServer>("DatabaseServer", DatabaseServer, { lifecycle: Lifecycle.Singleton });
        depContainer.register<HttpServer>("HttpServer", HttpServer, { lifecycle: Lifecycle.Singleton });
        depContainer.register<WebSocketServer>("WebSocketServer", WebSocketServer, { lifecycle: Lifecycle.Singleton });
        depContainer.register<RagfairServer>("RagfairServer", RagfairServer);
        depContainer.register<SaveServer>("SaveServer", SaveServer, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ConfigServer>("ConfigServer", ConfigServer, { lifecycle: Lifecycle.Singleton });
    }

    private static registerControllers(depContainer: DependencyContainer): void
    {
        // Controllers
        depContainer.register<BotController>("BotController", { useClass: BotController });
        depContainer.register<ClientLogController>("ClientLogController", { useClass: ClientLogController });
        depContainer.register<CustomizationController>("CustomizationController", {
            useClass: CustomizationController,
        });
        depContainer.register<DialogueController>("DialogueController", { useClass: DialogueController }, {
            lifecycle: Lifecycle.Singleton,
        });
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
