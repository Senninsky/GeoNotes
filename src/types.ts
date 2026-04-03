import type { Marker, Polygon } from 'leaflet';

export interface UserCategory {
  id: string;
  name: string;
  color: string;
  visible: boolean;
}

export interface PinData {
  lat: number;
  lng: number;
  label: string;
  note: string;
  categoryId: string | null;
}

export interface AreaData {
  id: string;
  label: string;
  note: string;
  vertices: [number, number][];
  categoryId: string | null;
}

export type PinMarker = Marker & {
  _pinData: PinData;
};

export type AreaPolygon = Polygon & {
  _areaData: AreaData;
};
