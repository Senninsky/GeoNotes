import L from 'leaflet';
import type { AreaData, AreaPolygon } from './types';
import { addArea as storeAddArea, removeArea as storeRemoveArea, getAllAreas } from './store';
import { userCategories } from './pins';

function getCategoryColor(categoryId: string | null): string {
  if (!categoryId) return '#3b82f6';
  const cat = userCategories.find(c => c.id === categoryId);
  return cat ? cat.color : '#3b82f6';
}

export function createAreaPolygon(
  map: L.Map,
  area: AreaData,
  onClick: (poly: AreaPolygon) => void
): AreaPolygon {
  const color = getCategoryColor(area.categoryId ?? null);
  const polygon = L.polygon(
    area.vertices.map((v) => L.latLng(v[0], v[1])),
    {
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.15,
    }
  ).addTo(map) as AreaPolygon;

  polygon._areaData = area;

  const label = L.divIcon({
    className: 'area-label',
    html: '<span style="background:' + color + '99">' + area.label + '</span>',
    iconSize: [0, 0],
  });

  const center = polygon.getBounds().getCenter();
  const labelMarker = L.marker(center, {
    icon: label,
    interactive: false,
  }).addTo(map);

  (polygon as any)._labelMarker = labelMarker;

  polygon.on('click', (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    onClick(polygon);
  });

  return polygon;
}

export async function addNewArea(
  map: L.Map,
  vertices: [number, number][],
  label: string,
  onClick: (poly: AreaPolygon) => void,
  categoryId: string | null = null
): Promise<AreaPolygon> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const area: AreaData = { id, label, note: '', vertices, categoryId };
  await storeAddArea(area);
  return createAreaPolygon(map, area, onClick);
}

export async function deleteArea(
  map: L.Map,
  polygon: AreaPolygon
): Promise<void> {
  const id = polygon._areaData.id;
  if ((polygon as any)._labelMarker) {
    map.removeLayer((polygon as any)._labelMarker);
  }
  map.removeLayer(polygon);
  await storeRemoveArea(id);
}

export async function loadAreas(
  map: L.Map,
  onClick: (poly: AreaPolygon) => void
): Promise<AreaPolygon[]> {
  const areas = await getAllAreas();
  return areas.map((area) => {
    return createAreaPolygon(map, area, onClick);
  });
}

export function clearAllAreaLayers(map: L.Map): void {
  const toRemove: L.Layer[] = [];
  map.eachLayer((layer: L.Layer) => {
    const poly = layer as any;
    if (poly._areaData) {
      if (poly._labelMarker) {
        toRemove.push(poly._labelMarker);
      }
      toRemove.push(layer);
    }
  });
  toRemove.forEach((layer) => map.removeLayer(layer));
}
