import { DependencyContainer, Lifecycle } from "tsyringe";

import { BotCallbacks } from "../callbacks/BotCallbacks";
import { BundleCallbacks } from "../callbacks/BundleCallbacks";
import { CustomizationCallbacks } from "../callbacks/CustomizationCallbacks";
import { DataCallbacks } from "../callbacks/DataCallbacks";
import { DialogueCallbacks } from "../callbacks/DialogueCallbacks";
import { GameCallbacks } from "../callbacks/GameCallbacks";
import { HandbookCallbacks } from "../callbacks/HandbookCallbacks";
import { HealthCallbacks } from "../callbacks/HealthCallbacks";
import { HideoutCallbacks } from "../callbacks/HideoutCallbacks";
import { HttpCallbacks } from "../callbacks/HttpCallbacks";
import { InraidCallbacks } from "../callbacks/InraidCallbacks";
import { InsuranceCallbacks } from "../callbacks/InsuranceCallbacks";
import { InventoryCallbacks } from "../callbacks/InventoryCallbacks";
import { ItemEventCallbacks } from "../callbacks/ItemEventCallbacks";
import { LauncherCallbacks } from "../callbacks/LauncherCallbacks";
import { LocationCallbacks } from "../callbacks/LocationCallbacks";
import { MatchCallbacks } from "../callbacks/MatchCallbacks";
import { ModCallbacks } from "../callbacks/ModCallbacks";
import { NoteCallbacks } from "../callbacks/NoteCallbacks";
import { NotifierCallbacks } from "../callbacks/NotifierCallbacks";
import { PresetBuildCallbacks } from "../callbacks/PresetBuildCallbacks";
import { PresetCallbacks } from "../callbacks/PresetCallbacks";
import { ProfileCallbacks } from "../callbacks/ProfileCallbacks";
import { QuestCallbacks } from "../callbacks/QuestCallbacks";
import { RagfairCallbacks } from "../callbacks/RagfairCallbacks";
import { RepairCallbacks } from "../callbacks/RepairCallbacks";
import { SaveCallbacks } from "../callbacks/SaveCallbacks";
import { TradeCallbacks } from "../callbacks/TradeCallbacks";
import { TraderCallbacks } from "../callbacks/TraderCallbacks";
import { WeatherCallbacks } from "../callbacks/WeatherCallbacks";
import { WishlistCallbacks } from "../callbacks/WishlistCallbacks";
import { ApplicationContext } from "../context/ApplicationContext";
import { BotController } from "../controllers/BotController";
import { CustomizationController } from "../controllers/CustomizationController";
import { DialogueController } from "../controllers/DialogueController";
import { GameController } from "../controllers/GameController";
import { HandbookController } from "../controllers/HandbookController";
import { HealthController } from "../controllers/HealthController";
import { HideoutController } from "../controllers/HideoutController";
import { InraidController } from "../controllers/InraidController";
import { InsuranceController } from "../controllers/InsuranceController";
import { InventoryController } from "../controllers/InventoryController";
import { LauncherController } from "../controllers/LauncherController";
import { LocationController } from "../controllers/LocationController";
import { MatchController } from "../controllers/MatchController";
import { NoteController } from "../controllers/NoteController";
import { NotifierController } from "../controllers/NotifierController";
import { PresetBuildController } from "../controllers/PresetBuildController";
import { PresetController } from "../controllers/PresetController";
import { ProfileController } from "../controllers/ProfileController";
import { QuestController } from "../controllers/QuestController";
import { RagfairController } from "../controllers/RagfairController";
import { RepairController } from "../controllers/RepairController";
import { RepeatableQuestController } from "../controllers/RepeatableQuestController";
import { TradeController } from "../controllers/TradeController";
import { TraderController } from "../controllers/TraderController";
import { WeatherController } from "../controllers/WeatherController";
import { WishlistController } from "../controllers/WishlistController";
import { BotEquipmentModGenerator } from "../generators/BotEquipmentModGenerator";
import { BotGenerator } from "../generators/BotGenerator";
import { BotInventoryGenerator } from "../generators/BotInventoryGenerator";
import { BotLevelGenerator } from "../generators/BotLevelGenerator";
import { BotLootGenerator } from "../generators/BotLootGenerator";
import { BotWeaponGenerator } from "../generators/BotWeaponGenerator";
import { FenceBaseAssortGenerator } from "../generators/FenceBaseAssortGenerator";
import { LocationGenerator } from "../generators/LocationGenerator";
import { LootGenerator } from "../generators/LootGenerator";
import { PlayerScavGenerator } from "../generators/PlayerScavGenerator";
import { PMCLootGenerator } from "../generators/PMCLootGenerator";
import { RagfairAssortGenerator } from "../generators/RagfairAssortGenerator";
import { RagfairOfferGenerator } from "../generators/RagfairOfferGenerator";
import { ScavCaseRewardGenerator } from "../generators/ScavCaseRewardGenerator";
import {
    BarrelInventoryMagGen
} from "../generators/weapongen/implementations/BarrelInventoryMagGen";
import {
    ExternalInventoryMagGen
} from "../generators/weapongen/implementations/ExternalInventoryMagGen";
import {
    InternalMagazineInventoryMagGen
} from "../generators/weapongen/implementations/InternalMagazineInventoryMagGen";
import { UbglExternalMagGen } from "../generators/weapongen/implementations/UbglExternalMagGen";
import { WeatherGenerator } from "../generators/WeatherGenerator";
import { AssortHelper } from "../helpers/AssortHelper";
import { BotDifficultyHelper } from "../helpers/BotDifficultyHelper";
import { BotGeneratorHelper } from "../helpers/BotGeneratorHelper";
import { BotHelper } from "../helpers/BotHelper";
import { BotWeaponGeneratorHelper } from "../helpers/BotWeaponGeneratorHelper";
import { ContainerHelper } from "../helpers/ContainerHelper";
import { DialogueHelper } from "../helpers/DialogueHelper";
import { DurabilityLimitsHelper } from "../helpers/DurabilityLimitsHelper";
import { GameEventHelper } from "../helpers/GameEventHelper";
import { HandbookHelper } from "../helpers/HandbookHelper";
import { HealthHelper } from "../helpers/HealthHelper";
import { HideoutHelper } from "../helpers/HideoutHelper";
import { HttpServerHelper } from "../helpers/HttpServerHelper";
import { InRaidHelper } from "../helpers/InRaidHelper";
import { InventoryHelper } from "../helpers/InventoryHelper";
import { ItemHelper } from "../helpers/ItemHelper";
import { NotificationSendHelper } from "../helpers/NotificationSendHelper";
import { NotifierHelper } from "../helpers/NotifierHelper";
import { PaymentHelper } from "../helpers/PaymentHelper";
import { PresetHelper } from "../helpers/PresetHelper";
import { ProbabilityHelper } from "../helpers/ProbabilityHelper";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { QuestConditionHelper } from "../helpers/QuestConditionHelper";
import { QuestHelper } from "../helpers/QuestHelper";
import { RagfairHelper } from "../helpers/RagfairHelper";
import { RagfairOfferHelper } from "../helpers/RagfairOfferHelper";
import { RagfairSellHelper } from "../helpers/RagfairSellHelper";
import { RagfairServerHelper } from "../helpers/RagfairServerHelper";
import { RagfairSortHelper } from "../helpers/RagfairSortHelper";
import { RagfairTaxHelper } from "../helpers/RagfairTaxHelper";
import { RepairHelper } from "../helpers/RepairHelper";
import { SecureContainerHelper } from "../helpers/SecureContainerHelper";
import { TradeHelper } from "../helpers/TradeHelper";
import { TraderAssortHelper } from "../helpers/TraderAssortHelper";
import { TraderHelper } from "../helpers/TraderHelper";
import { UtilityHelper } from "../helpers/UtilityHelper";
import { WeightedRandomHelper } from "../helpers/WeightedRandomHelper";
import { BundleLoader } from "../loaders/BundleLoader";
import { ModTypeCheck } from "../loaders/ModTypeCheck";
import { PostAkiModLoader } from "../loaders/PostAkiModLoader";
import { PostDBModLoader } from "../loaders/PostDBModLoader";
import { PreAkiModLoader } from "../loaders/PreAkiModLoader";
import { IAsyncQueue } from "../models/spt/utils/IAsyncQueue";
import { IUUidGenerator } from "../models/spt/utils/IUuidGenerator";
import { BotDynamicRouter } from "../routers/dynamic/BotDynamicRouter";
import { BundleDynamicRouter } from "../routers/dynamic/BundleDynamicRouter";
import { CustomizationDynamicRouter } from "../routers/dynamic/CustomizationDynamicRouter";
import { DataDynamicRouter } from "../routers/dynamic/DataDynamicRouter";
import { HttpDynamicRouter } from "../routers/dynamic/HttpDynamicRouter";
import { InraidDynamicRouter } from "../routers/dynamic/InraidDynamicRouter";
import { LocationDynamicRouter } from "../routers/dynamic/LocationDynamicRouter";
import { NotifierDynamicRouter } from "../routers/dynamic/NotifierDynamicRouter";
import { TraderDynamicRouter } from "../routers/dynamic/TraderDynamicRouter";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { HttpRouter } from "../routers/HttpRouter";
import { ImageRouter } from "../routers/ImageRouter";
import { ItemEventRouter } from "../routers/ItemEventRouter";
import { CustomizationItemEventRouter } from "../routers/item_events/CustomizationItemEventRouter";
import { HealthItemEventRouter } from "../routers/item_events/HealthItemEventRouter";
import { HideoutItemEventRouter } from "../routers/item_events/HideoutItemEventRouter";
import { InsuranceItemEventRouter } from "../routers/item_events/InsuranceItemEventRouter";
import { InventoryItemEventRouter } from "../routers/item_events/InventoryItemEventRouter";
import { NoteItemEventRouter } from "../routers/item_events/NoteItemEventRouter";
import { PresetBuildItemEventRouter } from "../routers/item_events/PresetBuildItemEventRouter";
import { QuestItemEventRouter } from "../routers/item_events/QuestItemEventRouter";
import { RagfairItemEventRouter } from "../routers/item_events/RagfairItemEventRouter";
import { RepairItemEventRouter } from "../routers/item_events/RepairItemEventRouter";
import { TradeItemEventRouter } from "../routers/item_events/TradeItemEventRouter";
import { WishlistItemEventRouter } from "../routers/item_events/WishlistItemEventRouter";
import { HealthSaveLoadRouter } from "../routers/save_load/HealthSaveLoadRouter";
import { InraidSaveLoadRouter } from "../routers/save_load/InraidSaveLoadRouter";
import { InsuranceSaveLoadRouter } from "../routers/save_load/InsuranceSaveLoadRouter";
import { ProfileSaveLoadRouter } from "../routers/save_load/ProfileSaveLoadRouter";
import { BundleSerializer } from "../routers/serializers/BundleSerializer";
import { ImageSerializer } from "../routers/serializers/ImageSerializer";
import { NotifySerializer } from "../routers/serializers/NotifySerializer";
import { BotStaticRouter } from "../routers/static/BotStaticRouter";
import { BundleStaticRouter } from "../routers/static/BundleStaticRouter";
import { CustomizationStaticRouter } from "../routers/static/CustomizationStaticRouter";
import { DataStaticRouter } from "../routers/static/DataStaticRouter";
import { DialogStaticRouter } from "../routers/static/DialogStaticRouter";
import { GameStaticRouter } from "../routers/static/GameStaticRouter";
import { HealthStaticRouter } from "../routers/static/HealthStaticRouter";
import { InraidStaticRouter } from "../routers/static/InraidStaticRouter";
import { InsuranceStaticRouter } from "../routers/static/InsuranceStaticRouter";
import { ItemEventStaticRouter } from "../routers/static/ItemEventStaticRouter";
import { LauncherStaticRouter } from "../routers/static/LauncherStaticRouter";
import { LocationStaticRouter } from "../routers/static/LocationStaticRouter";
import { MatchStaticRouter } from "../routers/static/MatchStaticRouter";
import { NotifierStaticRouter } from "../routers/static/NotifierStaticRouter";
import { PresetStaticRouter } from "../routers/static/PresetStaticRouter";
import { ProfileStaticRouter } from "../routers/static/ProfileStaticRouter";
import { QuestStaticRouter } from "../routers/static/QuestStaticRouter";
import { RagfairStaticRouter } from "../routers/static/RagfairStaticRouter";
import { TraderStaticRouter } from "../routers/static/TraderStaticRouter";
import { WeatherStaticRouter } from "../routers/static/WeatherStaticRouter";
import { ConfigServer } from "../servers/ConfigServer";
import { DatabaseServer } from "../servers/DatabaseServer";
import { AkiHttpListener } from "../servers/http/AkiHttpListener";
import { HttpBufferHandler } from "../servers/http/HttpBufferHandler";
import { HttpServer } from "../servers/HttpServer";
import { RagfairServer } from "../servers/RagfairServer";
import { SaveServer } from "../servers/SaveServer";
import { WebSocketServer } from "../servers/WebSocketServer";
import { BotEquipmentFilterService } from "../services/BotEquipmentFilterService";
import { BotEquipmentModPoolService } from "../services/BotEquipmentModPoolService";
import { BotGenerationCacheService } from "../services/BotGenerationCacheService";
import { BotLootCacheService } from "../services/BotLootCacheService";
import { BotWeaponModLimitService } from "../services/BotWeaponModLimitService";
import { CustomLocationWaveService } from "../services/CustomLocationWaveService";
import { FenceService } from "../services/FenceService";
import { HashCacheService } from "../services/HashCacheService";
import { InsuranceService } from "../services/InsuranceService";
import { ItemBaseClassService } from "../services/ItemBaseClassService";
import { ItemFilterService } from "../services/ItemFilterService";
import { LocaleService } from "../services/LocaleService";
import { LocalisationService } from "../services/LocalisationService";
import { MatchBotDetailsCacheService } from "../services/MatchBotDetailsCacheService";
import { MatchLocationService } from "../services/MatchLocationService";
import { CustomItemService } from "../services/mod/CustomItemService";
import { DynamicRouterModService } from "../services/mod/dynamicRouter/DynamicRouterModService";
import { HttpListenerModService } from "../services/mod/httpListener/HttpListenerModService";
import { ImageRouteService } from "../services/mod/image/ImageRouteService";
import { OnLoadModService } from "../services/mod/onLoad/OnLoadModService";
import { OnUpdateModService } from "../services/mod/onUpdate/OnUpdateModService";
import { StaticRouterModService } from "../services/mod/staticRouter/StaticRouterModService";
import { ModCompilerService } from "../services/ModCompilerService";
import { NotificationService } from "../services/NotificationService";
import { OpenZoneService } from "../services/OpenZoneService";
import { PaymentService } from "../services/PaymentService";
import { PlayerService } from "../services/PlayerService";
import { PmcChatResponseService } from "../services/PmcChatResponseService";
import { ProfileFixerService } from "../services/ProfileFixerService";
import { ProfileSnapshotService } from "../services/ProfileSnapshotService";
import { RagfairCategoriesService } from "../services/RagfairCategoriesService";
import { RagfairLinkedItemService } from "../services/RagfairLinkedItemService";
import { RagfairOfferService } from "../services/RagfairOfferService";
import { RagfairPriceService } from "../services/RagfairPriceService";
import { RagfairRequiredItemsService } from "../services/RagfairRequiredItemsService";
import { RepairService } from "../services/RepairService";
import { SeasonalEventService } from "../services/SeasonalEventService";
import { TraderAssortService } from "../services/TraderAssortService";
import { TraderPurchasePersisterService } from "../services/TraderPurchasePersisterService";
import { App } from "../utils/App";
import { AsyncQueue } from "../utils/AsyncQueue";
import { DatabaseImporter } from "../utils/DatabaseImporter";
import { EncodingUtil } from "../utils/EncodingUtil";
import { HashUtil } from "../utils/HashUtil";
import { HttpFileUtil } from "../utils/HttpFileUtil";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { ImporterUtil } from "../utils/ImporterUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { WinstonMainLogger } from "../utils/logging/WinstonMainLogger";
import { WinstonRequestLogger } from "../utils/logging/WinstonRequestLogger";
import { MathUtil } from "../utils/MathUtil";
import { ObjectId } from "../utils/ObjectId";
import { RandomUtil } from "../utils/RandomUtil";
import { TimeUtil } from "../utils/TimeUtil";
import { UUidGenerator } from "../utils/UUidGenerator";
import { VFS } from "../utils/VFS";
import { Watermark, WatermarkLocale } from "../utils/Watermark";

/**
 * Handle the registration of classes to be used by the Dependency Injection code
 */
export class Container 
{
    
    public static registerPostLoadTypes(container: DependencyContainer, childContainer: DependencyContainer):void 
    {
        container.register<AkiHttpListener>("AkiHttpListener", AkiHttpListener, {lifecycle: Lifecycle.Singleton});
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
        depContainer.registerType("OnUpdate", "DialogueCallbacks");
        depContainer.registerType("OnUpdate", "HideoutCallbacks");
        depContainer.registerType("OnUpdate", "TraderCallbacks");
        depContainer.registerType("OnUpdate", "RagfairCallbacks");
        depContainer.registerType("OnUpdate", "InsuranceCallbacks");
        depContainer.registerType("OnUpdate", "SaveCallbacks");

        depContainer.registerType("StaticRoutes", "BotStaticRouter");
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
        depContainer.registerType("StaticRoutes", "PresetStaticRouter");
        depContainer.registerType("StaticRoutes", "BundleStaticRouter");
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
        depContainer.registerType("IERouters", "PresetBuildItemEventRouter");
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
    }

    private static registerUtils(depContainer: DependencyContainer): void 
    {
        // Utils
        depContainer.register<App>("App", App, { lifecycle: Lifecycle.Singleton });
        depContainer.register<DatabaseImporter>("DatabaseImporter", DatabaseImporter, { lifecycle: Lifecycle.Singleton });
        depContainer.register<HashUtil>("HashUtil", HashUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ImporterUtil>("ImporterUtil", ImporterUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<HttpResponseUtil>("HttpResponseUtil", HttpResponseUtil);
        depContainer.register<EncodingUtil>("EncodingUtil", EncodingUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<JsonUtil>("JsonUtil", JsonUtil);
        depContainer.register<WinstonMainLogger>("WinstonLogger", WinstonMainLogger, { lifecycle: Lifecycle.Singleton });
        depContainer.register<WinstonRequestLogger>("RequestsLogger", WinstonRequestLogger, { lifecycle: Lifecycle.Singleton });
        depContainer.register<MathUtil>("MathUtil", MathUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ObjectId>("ObjectId", ObjectId);
        depContainer.register<RandomUtil>("RandomUtil", RandomUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<TimeUtil>("TimeUtil", TimeUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<VFS>("VFS", VFS, { lifecycle: Lifecycle.Singleton });
        depContainer.register<WatermarkLocale>("WatermarkLocale", WatermarkLocale, { lifecycle: Lifecycle.Singleton });
        depContainer.register<Watermark>("Watermark", Watermark, { lifecycle: Lifecycle.Singleton });
        depContainer.register<IAsyncQueue>("AsyncQueue", AsyncQueue, { lifecycle: Lifecycle.Singleton });
        depContainer.register<IUUidGenerator>("UUidGenerator", UUidGenerator, { lifecycle: Lifecycle.Singleton });
        depContainer.register<HttpFileUtil>("HttpFileUtil", HttpFileUtil, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ModTypeCheck>("ModTypeCheck", ModTypeCheck, { lifecycle: Lifecycle.Singleton });
    }

    private static registerRouters(depContainer: DependencyContainer): void 
    {
        // Routers
        depContainer.register<HttpRouter>("HttpRouter", HttpRouter, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ImageRouter>("ImageRouter", ImageRouter);
        depContainer.register<EventOutputHolder>("EventOutputHolder", EventOutputHolder, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ItemEventRouter>("ItemEventRouter", ItemEventRouter);

        // Dynamic routes
        depContainer.register<BotDynamicRouter>("BotDynamicRouter", { useClass: BotDynamicRouter });
        depContainer.register<BundleDynamicRouter>("BundleDynamicRouter", { useClass: BundleDynamicRouter });
        depContainer.register<CustomizationDynamicRouter>("CustomizationDynamicRouter", { useClass: CustomizationDynamicRouter });
        depContainer.register<DataDynamicRouter>("DataDynamicRouter", { useClass: DataDynamicRouter });
        depContainer.register<HttpDynamicRouter>("HttpDynamicRouter", { useClass: HttpDynamicRouter });
        depContainer.register<InraidDynamicRouter>("InraidDynamicRouter", { useClass: InraidDynamicRouter });
        depContainer.register<LocationDynamicRouter>("LocationDynamicRouter", { useClass: LocationDynamicRouter });
        depContainer.register<NotifierDynamicRouter>("NotifierDynamicRouter", { useClass: NotifierDynamicRouter });
        depContainer.register<TraderDynamicRouter>("TraderDynamicRouter", { useClass: TraderDynamicRouter });

        // Item event routes
        depContainer.register<CustomizationItemEventRouter>("CustomizationItemEventRouter", { useClass: CustomizationItemEventRouter });
        depContainer.register<HealthItemEventRouter>("HealthItemEventRouter", { useClass: HealthItemEventRouter });
        depContainer.register<HideoutItemEventRouter>("HideoutItemEventRouter", { useClass: HideoutItemEventRouter });
        depContainer.register<InsuranceItemEventRouter>("InsuranceItemEventRouter", { useClass: InsuranceItemEventRouter });
        depContainer.register<InventoryItemEventRouter>("InventoryItemEventRouter", { useClass: InventoryItemEventRouter });
        depContainer.register<NoteItemEventRouter>("NoteItemEventRouter", { useClass: NoteItemEventRouter });
        depContainer.register<PresetBuildItemEventRouter>("PresetBuildItemEventRouter", { useClass: PresetBuildItemEventRouter });
        depContainer.register<QuestItemEventRouter>("QuestItemEventRouter", { useClass: QuestItemEventRouter });
        depContainer.register<RagfairItemEventRouter>("RagfairItemEventRouter", { useClass: RagfairItemEventRouter });
        depContainer.register<RepairItemEventRouter>("RepairItemEventRouter", { useClass: RepairItemEventRouter });
        depContainer.register<TradeItemEventRouter>("TradeItemEventRouter", { useClass: TradeItemEventRouter });
        depContainer.register<WishlistItemEventRouter>("WishlistItemEventRouter", { useClass: WishlistItemEventRouter });

        // save load routes
        depContainer.register<HealthSaveLoadRouter>("HealthSaveLoadRouter", { useClass: HealthSaveLoadRouter });
        depContainer.register<InraidSaveLoadRouter>("InraidSaveLoadRouter", { useClass: InraidSaveLoadRouter });
        depContainer.register<InsuranceSaveLoadRouter>("InsuranceSaveLoadRouter", { useClass: InsuranceSaveLoadRouter });
        depContainer.register<ProfileSaveLoadRouter>("ProfileSaveLoadRouter", { useClass: ProfileSaveLoadRouter });

        // Route serializers
        depContainer.register<BundleSerializer>("BundleSerializer", { useClass: BundleSerializer });
        depContainer.register<ImageSerializer>("ImageSerializer", { useClass: ImageSerializer });
        depContainer.register<NotifySerializer>("NotifySerializer", { useClass: NotifySerializer });

        // Static routes
        depContainer.register<BotStaticRouter>("BotStaticRouter", { useClass: BotStaticRouter });
        depContainer.register<BundleStaticRouter>("BundleStaticRouter", { useClass: BundleStaticRouter });
        depContainer.register<CustomizationStaticRouter>("CustomizationStaticRouter", { useClass: CustomizationStaticRouter });
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
        depContainer.register<PresetStaticRouter>("PresetStaticRouter", { useClass: PresetStaticRouter });
        depContainer.register<ProfileStaticRouter>("ProfileStaticRouter", { useClass: ProfileStaticRouter });
        depContainer.register<QuestStaticRouter>("QuestStaticRouter", { useClass: QuestStaticRouter });
        depContainer.register<RagfairStaticRouter>("RagfairStaticRouter", { useClass: RagfairStaticRouter });
        depContainer.register<TraderStaticRouter>("TraderStaticRouter", { useClass: TraderStaticRouter });
        depContainer.register<WeatherStaticRouter>("WeatherStaticRouter", { useClass: WeatherStaticRouter });
    }

    private static registerGenerators(depContainer: DependencyContainer): void 
    {
        // Generators
        depContainer.register<BotGenerator>("BotGenerator", BotGenerator);
        depContainer.register<BotWeaponGenerator>("BotWeaponGenerator", BotWeaponGenerator);
        depContainer.register<BotLootGenerator>("BotLootGenerator", BotLootGenerator);
        depContainer.register<BotInventoryGenerator>("BotInventoryGenerator", BotInventoryGenerator);
        depContainer.register<LocationGenerator>("LocationGenerator", { useClass: LocationGenerator });
        depContainer.register<PMCLootGenerator>("PMCLootGenerator", PMCLootGenerator, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ScavCaseRewardGenerator>("ScavCaseRewardGenerator", ScavCaseRewardGenerator, { lifecycle: Lifecycle.Singleton });
        depContainer.register<RagfairAssortGenerator>("RagfairAssortGenerator", { useClass: RagfairAssortGenerator });
        depContainer.register<RagfairOfferGenerator>("RagfairOfferGenerator", { useClass: RagfairOfferGenerator });
        depContainer.register<WeatherGenerator>("WeatherGenerator", { useClass: WeatherGenerator });
        depContainer.register<PlayerScavGenerator>("PlayerScavGenerator", { useClass: PlayerScavGenerator });
        depContainer.register<LootGenerator>("LootGenerator", { useClass: LootGenerator });
        depContainer.register<FenceBaseAssortGenerator>("FenceBaseAssortGenerator", { useClass: FenceBaseAssortGenerator });
        depContainer.register<BotLevelGenerator>("BotLevelGenerator", { useClass: BotLevelGenerator });
        depContainer.register<BotEquipmentModGenerator>("BotEquipmentModGenerator", { useClass: BotEquipmentModGenerator });
        
        
        depContainer.register<BarrelInventoryMagGen>("BarrelInventoryMagGen", { useClass: BarrelInventoryMagGen });
        depContainer.register<ExternalInventoryMagGen>("ExternalInventoryMagGen", { useClass: ExternalInventoryMagGen });
        depContainer.register<InternalMagazineInventoryMagGen>("InternalMagazineInventoryMagGen", { useClass: InternalMagazineInventoryMagGen });
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
        depContainer.register<RagfairTaxHelper>("RagfairTaxHelper", { useClass: RagfairTaxHelper });
        depContainer.register<RagfairSellHelper>("RagfairSellHelper", { useClass: RagfairSellHelper });
        depContainer.register<RagfairOfferHelper>("RagfairOfferHelper", { useClass: RagfairOfferHelper });
        depContainer.register<RagfairServerHelper>("RagfairServerHelper", { useClass: RagfairServerHelper });
        depContainer.register<RepairHelper>("RepairHelper", { useClass: RepairHelper });
        depContainer.register<TraderHelper>("TraderHelper", TraderHelper);
        depContainer.register<TraderAssortHelper>("TraderAssortHelper", TraderAssortHelper, { lifecycle: Lifecycle.Singleton });
        depContainer.register<TradeHelper>("TradeHelper", { useClass: TradeHelper });
        depContainer.register<NotifierHelper>("NotifierHelper", { useClass: NotifierHelper });
        depContainer.register<UtilityHelper>("UtilityHelper", UtilityHelper);
        depContainer.register<WeightedRandomHelper>("WeightedRandomHelper", { useClass: WeightedRandomHelper });
        depContainer.register<HttpServerHelper>("HttpServerHelper", { useClass: HttpServerHelper });
        depContainer.register<NotificationSendHelper>("NotificationSendHelper", { useClass: NotificationSendHelper });
        depContainer.register<SecureContainerHelper>("SecureContainerHelper", { useClass: SecureContainerHelper });
        depContainer.register<ProbabilityHelper>("ProbabilityHelper", { useClass: ProbabilityHelper });
        depContainer.register<BotWeaponGeneratorHelper>("BotWeaponGeneratorHelper", { useClass: BotWeaponGeneratorHelper });
        depContainer.register<BotDifficultyHelper>("BotDifficultyHelper", { useClass: BotDifficultyHelper });
    }

    private static registerLoaders(depContainer: DependencyContainer): void 
    {
        // Loaders
        depContainer.register<BundleLoader>("BundleLoader", BundleLoader, { lifecycle: Lifecycle.Singleton });
        depContainer.register<PreAkiModLoader>("PreAkiModLoader", PreAkiModLoader, { lifecycle: Lifecycle.Singleton });
        depContainer.register<PostAkiModLoader>("PostAkiModLoader", PostAkiModLoader, { lifecycle: Lifecycle.Singleton });
    }

    private static registerCallbacks(depContainer: DependencyContainer): void 
    {
        // Callbacks
        depContainer.register<BotCallbacks>("BotCallbacks", { useClass: BotCallbacks });
        depContainer.register<BundleCallbacks>("BundleCallbacks", { useClass: BundleCallbacks });
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
        depContainer.register<PresetBuildCallbacks>("PresetBuildCallbacks", { useClass: PresetBuildCallbacks });
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
    }

    private static registerServices(depContainer: DependencyContainer): void 
    {
        // Services
        depContainer.register<ImageRouteService>("ImageRouteService", ImageRouteService, { lifecycle: Lifecycle.Singleton });

        depContainer.register<FenceService>("FenceService", FenceService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<PlayerService>("PlayerService", { useClass: PlayerService });
        depContainer.register<PaymentService>("PaymentService", { useClass: PaymentService });
        depContainer.register<InsuranceService>("InsuranceService", InsuranceService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<TraderAssortService>("TraderAssortService", TraderAssortService, { lifecycle: Lifecycle.Singleton });

        depContainer.register<RagfairPriceService>("RagfairPriceService", RagfairPriceService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<RagfairCategoriesService>("RagfairCategoriesService", RagfairCategoriesService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<RagfairOfferService>("RagfairOfferService", RagfairOfferService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<RagfairLinkedItemService>("RagfairLinkedItemService", RagfairLinkedItemService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<RagfairRequiredItemsService>("RagfairRequiredItemsService", RagfairRequiredItemsService, { lifecycle: Lifecycle.Singleton });

        depContainer.register<NotificationService>("NotificationService", NotificationService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<MatchLocationService>("MatchLocationService", MatchLocationService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ModCompilerService>("ModCompilerService", ModCompilerService);
        depContainer.register<HashCacheService>("HashCacheService", HashCacheService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<LocaleService>("LocaleService", LocaleService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ProfileFixerService>("ProfileFixerService", ProfileFixerService);
        depContainer.register<RepairService>("RepairService", RepairService);
        depContainer.register<BotLootCacheService>("BotLootCacheService", BotLootCacheService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<CustomItemService>("CustomItemService", CustomItemService);
        depContainer.register<BotEquipmentFilterService>("BotEquipmentFilterService", BotEquipmentFilterService);
        depContainer.register<ProfileSnapshotService>("ProfileSnapshotService", ProfileSnapshotService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ItemFilterService>("ItemFilterService", ItemFilterService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<BotGenerationCacheService>("BotGenerationCacheService", BotGenerationCacheService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<LocalisationService>("LocalisationService", LocalisationService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<CustomLocationWaveService>("CustomLocationWaveService", CustomLocationWaveService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<OpenZoneService>("OpenZoneService", OpenZoneService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<ItemBaseClassService>("ItemBaseClassService", ItemBaseClassService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<BotEquipmentModPoolService>("BotEquipmentModPoolService", BotEquipmentModPoolService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<BotWeaponModLimitService>("BotWeaponModLimitService", BotWeaponModLimitService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<SeasonalEventService>("SeasonalEventService", SeasonalEventService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<MatchBotDetailsCacheService>("MatchBotDetailsCacheService", MatchBotDetailsCacheService, { lifecycle: Lifecycle.Singleton });
        depContainer.register<TraderPurchasePersisterService>("TraderPurchasePersisterService", TraderPurchasePersisterService);
        depContainer.register<PmcChatResponseService>("PmcChatResponseService", PmcChatResponseService);
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
        depContainer.register<HttpBufferHandler>("HttpBufferHandler", HttpBufferHandler, {lifecycle: Lifecycle.Singleton});

    }

    private static registerControllers(depContainer: DependencyContainer): void 
    {
        // Controllers
        depContainer.register<BotController>("BotController", { useClass: BotController });
        depContainer.register<CustomizationController>("CustomizationController", { useClass: CustomizationController });
        depContainer.register<DialogueController>("DialogueController", { useClass: DialogueController });
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
        depContainer.register<PresetBuildController>("PresetBuildController", { useClass: PresetBuildController });
        depContainer.register<PresetController>("PresetController", { useClass: PresetController });
        depContainer.register<ProfileController>("ProfileController", { useClass: ProfileController });
        depContainer.register<QuestController>("QuestController", { useClass: QuestController });
        depContainer.register<RagfairController>("RagfairController", { useClass: RagfairController });
        depContainer.register<RepairController>("RepairController", { useClass: RepairController });
        depContainer.register<RepeatableQuestController>("RepeatableQuestController", { useClass: RepeatableQuestController });
        depContainer.register<TradeController>("TradeController", { useClass: TradeController });
        depContainer.register<TraderController>("TraderController", { useClass: TraderController });
        depContainer.register<WeatherController>("WeatherController", { useClass: WeatherController });
        depContainer.register<WishlistController>("WishlistController", WishlistController);
    }
}