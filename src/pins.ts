import L from 'leaflet';
import type { PinMarker, UserCategory } from './types';
import { addPin, removePin, getAllPins } from './store';

export let userCategories: UserCategory[] = [];

export function setUserCategories(cats: UserCategory[]) {
  userCategories = cats;
}

function getCategoryColor(categoryId: string | null): string {
  if (!categoryId) return '#e74c3c';
  const cat = userCategories.find(c => c.id === categoryId);
  return cat ? cat.color : '#e74c3c';
}

export function createPinIcon(label: string, categoryId: string | null = null): L.DivIcon {
  const color = getCategoryColor(categoryId);
  const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
  <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/>
  <circle cx="12" cy="12" r="5" fill="#fff"/>
</svg>`;
  return L.divIcon({
    className: 'custom-pin',
    html:
      '<div class="pin-wrapper">' +
      '<div class="pin-label">' +
      label +
      '</div>' +
      pinSvg +
      '</div>',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -38],
  });
}

export function createMarker(
  layer: L.LayerGroup,
  lat: number,
  lng: number,
  label: string,
  onClick: (marker: PinMarker) => void,
  categoryId: string | null = null
): PinMarker {
  const marker = L.marker([lat, lng], {
    icon: createPinIcon(label, categoryId),
  }).addTo(layer) as PinMarker;

  marker._pinData = { lat, lng, label, note: '', categoryId };

  marker.on('click', (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    onClick(marker);
  });

  return marker;
}

export async function addNewMarker(
  layer: L.LayerGroup,
  lat: number,
  lng: number,
  label: string,
  onClick: (marker: PinMarker) => void,
  categoryId: string | null = null
): Promise<PinMarker> {
  const marker = createMarker(layer, lat, lng, label, onClick, categoryId);
  await addPin({ lat, lng, label, note: '', categoryId });
  return marker;
}

export async function deleteMarker(
  layer: L.LayerGroup,
  lat: number,
  lng: number
): Promise<void> {
  layer.eachLayer((l: L.Layer) => {
    const m = l as PinMarker;
    if (m._pinData && m._pinData.lat === lat && m._pinData.lng === lng) {
      layer.removeLayer(m);
    }
  });
  await removePin(lat, lng);
}

export async function loadMarkers(
  layer: L.LayerGroup,
  onClick: (marker: PinMarker) => void
): Promise<PinMarker[]> {
  const pins = await getAllPins();
  return pins.map((pin) => {
    return createMarker(layer, pin.lat, pin.lng, pin.label, onClick, pin.categoryId ?? null);
  });
}
