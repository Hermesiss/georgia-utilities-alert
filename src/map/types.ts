export interface GeoJsonData {
  type: string;
  name: string;
  crs: Crs;
  features: (FeaturesEntity)[];
}

export const MapPlaceholderLink = "https://via.placeholder.com/640x640.png?text=Map+Unavailable"

export interface Crs {
  type: string;
  properties: Properties;
}

export interface Properties {
  name: string;
}

export interface FeaturesEntity {
  type: string;
  properties: FeatureProperties;
  geometry: Geometry;
}

export interface FeatureProperties {
  highway?: string | null;
  name?: string | null;
  surface?: string | null;
  "name:ru"?: string | null;
  "name:en"?: string | null;
  "name:ka"?: string | null;
  oneway?: string | null;
  "name:tr"?: string | null;
  ref?: string | null;
  lit?: string | null;
  lanes?: string | null;
  "is_in:city"?: string | null;
  route?: string | null;
  maxspeed?: string | null;
  route_pref_color?: string | null;
  access?: string | null;
  network?: string | null;
  foot?: string | null;
  bicycle?: string | null;
  route_name?: string | null;
  cycleway?: string | null;
  smoothness?: string | null;
  operator?: string | null;
  int_ref?: string | null;
  junction?: string | null;
  horse?: string | null;
  bridge?: string | null;
  hgv?: string | null;
  layer?: string | null;
  nat_ref?: string | null;
  wikidata?: string | null;
  wikipedia?: string | null;
  description?: string | null;
}

export interface Geometry {
  type: "LineString";
  //coordinates?: ((number)[] | null)[] | null;
  coordinates: number[] [] ;
}

export interface SavedStreet {
  name: string | null | undefined
  en: string
  ru: string | null | undefined
  geometry: Geometry;
}
