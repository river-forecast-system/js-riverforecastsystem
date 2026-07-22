'use strict';

// Reading the FLDPLN flood libraries: the per-tile zarr stores under ${v3Base}/flood-maps.
// This is the data layer only — turning slices into depths, colors, or a canvas is the consumer's.
export {FloodMapsIndex, httpFetcher} from "./zarrTiles.js";
