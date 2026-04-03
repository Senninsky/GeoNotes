import L from 'leaflet';

export interface DrawingCallbacks {
  onFinish: (vertices: [number, number][]) => void;
}

export interface DrawingHandle {
  start: () => void;
  stop: () => void;
  isActive: () => boolean;
}

export function initDrawing(
  map: L.Map,
  callbacks: DrawingCallbacks
): DrawingHandle {
  let active = false;
  let finished = false;
  let vertices: [number, number][] = [];
  let previewLine: L.Polyline | null = null;
  let vertexMarkers: L.CircleMarker[] = null!;

  const vertexLayer = L.layerGroup().addTo(map);

  const CLOSE_THRESHOLD_PX = 12;

  function start() {
    if (active) return;
    active = true;
    finished = false;
    vertices = [];
    vertexLayer.clearLayers();
    vertexMarkers = null! as any;
    previewLine = L.polyline([], {
      color: '#3b82f6',
      weight: 2,
      dashArray: '6 4',
    }).addTo(map);
    map.getContainer().style.cursor = 'crosshair';
  }

  function stop() {
    active = false;
    finished = false;
    vertices = [];
    if (previewLine) {
      map.removeLayer(previewLine);
      previewLine = null;
    }
    vertexLayer.clearLayers();
    map.getContainer().style.cursor = '';
  }

  function isActive() {
    return active;
  }

  function addVertex(lat: number, lng: number) {
    vertices.push([lat, lng]);

    const marker = L.circleMarker([lat, lng], {
      radius: 5,
      color: '#3b82f6',
      fillColor: '#fff',
      fillOpacity: 1,
      weight: 2,
    }).addTo(vertexLayer);

    if (previewLine) {
      previewLine.setLatLngs(
        vertices.map((v) => L.latLng(v[0], v[1]))
      );
    }
  }

  function finish() {
    if (vertices.length < 3) return;
    finished = true;
    const result = [...vertices];
    // Don't stop here — let caller stop when modal closes
    // so that map clicks during modal don't create a pin
    callbacks.onFinish(result);
  }

  map.on('click', (e: L.LeafletMouseEvent) => {
    if (!active || finished) return;
    L.DomEvent.stopPropagation(e);

    if (vertices.length >= 3) {
      const first = map.latLngToContainerPoint(
        L.latLng(vertices[0][0], vertices[0][1])
      );
      const click = map.latLngToContainerPoint(e.latlng);
      if (first.distanceTo(click) < CLOSE_THRESHOLD_PX) {
        finish();
        return;
      }
    }

    addVertex(e.latlng.lat, e.latlng.lng);
  });

  map.on('dblclick', (e: L.LeafletMouseEvent) => {
    if (!active || finished) return;
    L.DomEvent.stopPropagation(e);
    e.originalEvent.preventDefault();
    if (vertices.length >= 3) {
      finish();
    }
  });

  return { start, stop, isActive };
}
