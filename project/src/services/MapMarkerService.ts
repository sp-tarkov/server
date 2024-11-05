import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IInventoryCreateMarkerRequestData } from "@spt/models/eft/inventory/IInventoryCreateMarkerRequestData";
import { IInventoryDeleteMarkerRequestData } from "@spt/models/eft/inventory/IInventoryDeleteMarkerRequestData";
import { IInventoryEditMarkerRequestData } from "@spt/models/eft/inventory/IInventoryEditMarkerRequestData";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { inject, injectable } from "tsyringe";

@injectable()
export class MapMarkerService {
    constructor(@inject("PrimaryLogger") protected logger: ILogger) {}

    /**
     * Add note to a map item in player inventory
     * @param pmcData Player profile
     * @param request Add marker request
     * @returns Item
     */
    public createMarkerOnMap(pmcData: IPmcData, request: IInventoryCreateMarkerRequestData): IItem {
        // Get map from inventory
        const mapItem = pmcData.Inventory.items.find((i) => i._id === request.item);

        // add marker to map item
        mapItem.upd.Map = mapItem.upd.Map || { Markers: [] };

        // Update request note with text, then add to maps upd
        request.mapMarker.Note = this.sanitiseMapMarkerText(request.mapMarker.Note);
        mapItem.upd.Map.Markers.push(request.mapMarker);

        return mapItem;
    }

    /**
     * Delete a map marker
     * @param pmcData Player profile
     * @param request Delete marker request
     * @returns Item
     */
    public deleteMarkerFromMap(pmcData: IPmcData, request: IInventoryDeleteMarkerRequestData): IItem {
        // Get map from inventory
        const mapItem = pmcData.Inventory.items.find((item) => item._id === request.item);

        // remove marker
        const markers = mapItem.upd.Map.Markers.filter((marker) => {
            return marker.X !== request.X && marker.Y !== request.Y;
        });
        mapItem.upd.Map.Markers = markers;

        return mapItem;
    }

    /**
     * Edit an existing map marker
     * @param pmcData Player profile
     * @param request Edit marker request
     * @returns Item
     */
    public editMarkerOnMap(pmcData: IPmcData, request: IInventoryEditMarkerRequestData): IItem {
        // Get map from inventory
        const mapItem = pmcData.Inventory.items.find((item) => item._id === request.item);

        // edit marker
        const indexOfExistingNote = mapItem.upd.Map.Markers.findIndex((m) => m.X === request.X && m.Y === request.Y);
        request.mapMarker.Note = this.sanitiseMapMarkerText(request.mapMarker.Note);
        mapItem.upd.Map.Markers[indexOfExistingNote] = request.mapMarker;

        return mapItem;
    }

    /**
     * Strip out characters from note string that are not: letter/numbers/unicode/spaces
     * @param mapNoteText Marker text to sanitise
     * @returns Sanitised map marker text
     */
    protected sanitiseMapMarkerText(mapNoteText: string): string {
        return mapNoteText.replace(/[^\p{L}\d ]/gu, "");
    }
}
