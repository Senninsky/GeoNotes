import type { PinMarker, AreaPolygon } from './types';
import { userCategories } from './pins';
import L from 'leaflet';
import { createPinIcon } from './pins';
import { findPin, updatePin, findArea, updateArea } from './store';

type ActiveItem =
  | { kind: 'pin'; marker: PinMarker }
  | { kind: 'area'; polygon: AreaPolygon }
  | null;

export interface PanelCallbacks {
  onDeletePin: (lat: number, lng: number) => void;
  onDeleteArea: (polygon: AreaPolygon) => void;
}

function calculateAreaInKm2(vertices: [number, number][]): number {
  if (vertices.length < 3) return 0;
  const R = 6371;
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = vertices[i][0] * Math.PI / 180;
    const lng1 = vertices[i][1] * Math.PI / 180;
    const lat2 = vertices[j][0] * Math.PI / 180;
    const lng2 = vertices[j][1] * Math.PI / 180;
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = Math.abs(area * R * R / 2);
  return area;
}

function getCategoryColor(categoryId: string | null): string {
  if (!categoryId) return '#3b82f6';
  const cat = userCategories.find(c => c.id === categoryId);
  return cat ? cat.color : '#3b82f6';
}

function updateAreaPolygonStyle(polygon: AreaPolygon, categoryId: string | null) {
  const color = getCategoryColor(categoryId);
  polygon.setStyle({
    color,
    fillColor: color,
  });
  const labelMarker = (polygon as any)._labelMarker;
  if (labelMarker) {
    const label = polygon._areaData.label;
    labelMarker.setIcon(
      L.divIcon({
        className: 'area-label',
        html: '<span style="background:' + color + '99">' + label + '</span>',
        iconSize: [0, 0],
      })
    );
  }
}

function renderPanelCategorySelector(
  container: HTMLElement,
  selectedId: string | null,
  onSelect: (id: string | null) => void
) {
  container.innerHTML = '';
  const noCatBtn = document.createElement('button');
  noCatBtn.className = 'category-btn no-category' + (selectedId === null ? ' active' : '');
  noCatBtn.textContent = 'No category';
  noCatBtn.addEventListener('click', () => onSelect(null));
  container.appendChild(noCatBtn);

  userCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-btn' + (selectedId === cat.id ? ' active' : '');
    btn.style.setProperty('--cat-color', cat.color);
    btn.setAttribute('data-cat-id', cat.id);
    const dot = document.createElement('span');
    dot.className = 'category-dot';
    dot.style.background = cat.color;
    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = cat.name;
    btn.appendChild(dot);
    btn.appendChild(name);
    btn.addEventListener('click', () => onSelect(cat.id));
    container.appendChild(btn);
  });

  if (userCategories.length > 0) {
    container.classList.add('has-categories');
  } else {
    container.classList.remove('has-categories');
  }
}

export function initPanel(callbacks: PanelCallbacks) {
  const panel = document.getElementById('side-panel')!;
  const titleInput = document.getElementById('panel-title') as HTMLInputElement;
  const coordsEl = document.getElementById('panel-coords')!;
  const noteArea = document.getElementById('panel-note') as HTMLTextAreaElement;
  const closeBtn = document.getElementById('panel-close')!;
  const deleteBtn = document.getElementById('panel-delete')!;
  const categorySelector = document.getElementById('panel-category-select');
  const areaStatsEl = document.getElementById('panel-area-stats')!;

  let active: ActiveItem = null;
  let noteTimeout: ReturnType<typeof setTimeout> | null = null;
  let titleTimeout: ReturnType<typeof setTimeout> | null = null;

  function handlePanelCategorySelect(categoryId: string | null) {
    if (!active || active.kind !== 'pin') return;
    const d = active.marker._pinData;
    d.categoryId = categoryId;
    active.marker.setIcon(createPinIcon(d.label, categoryId));
    updatePin(d.lat, d.lng, { categoryId });
    if (categorySelector) {
      renderPanelCategorySelector(categorySelector, categoryId, handlePanelCategorySelect);
    }
  }

  if (categorySelector) {
    categorySelector.addEventListener('click', (e) => {
      if (!active) return;
      const btn = (e.target as HTMLElement).closest('.category-btn');
      if (!btn) return;
      const catId = btn.getAttribute('data-cat-id');
      const categoryId = catId || null;
      if (active.kind === 'pin') {
        const d = active.marker._pinData;
        d.categoryId = categoryId;
        active.marker.setIcon(createPinIcon(d.label, categoryId));
        updatePin(d.lat, d.lng, { categoryId });
        renderPanelCategorySelector(categorySelector, categoryId, handlePanelCategorySelect);
      } else {
        const d = active.polygon._areaData;
        d.categoryId = categoryId;
        updateArea(d.id, { categoryId });
        updateAreaPolygonStyle(active.polygon, categoryId);
        renderPanelCategorySelector(categorySelector, categoryId, handlePanelCategorySelect);
      }
    });
  }

  async function openPin(marker: PinMarker) {
    active = { kind: 'pin', marker };
    const d = marker._pinData;
    titleInput.value = d.label;
    coordsEl.textContent =
      d.lat.toFixed(4) + ', ' + d.lng.toFixed(4);

    const pin = await findPin(d.lat, d.lng);
    noteArea.value = pin?.note ?? '';
    deleteBtn.textContent = 'Delete Pin';

    if (categorySelector) {
      categorySelector.style.display = 'flex';
      renderPanelCategorySelector(categorySelector, d.categoryId ?? null, handlePanelCategorySelect);
    }

    areaStatsEl.style.display = 'none';

    panel.classList.add('open');
  }

  async function openArea(polygon: AreaPolygon) {
    active = { kind: 'area', polygon };
    const d = polygon._areaData;
    titleInput.value = d.label;
    coordsEl.textContent = d.vertices.length + ' vertices';

    const area = await findArea(d.id);
    noteArea.value = area?.note ?? '';
    deleteBtn.textContent = 'Delete Area';

    if (categorySelector) {
      categorySelector.style.display = 'flex';
      renderPanelCategorySelector(categorySelector, d.categoryId ?? null, handlePanelCategorySelect);
    }

    const areaKm2 = calculateAreaInKm2(d.vertices);
    const areaMi2 = areaKm2 * 0.386102;
    if (areaKm2 > 0) {
      areaStatsEl.style.display = 'block';
      areaStatsEl.textContent = areaKm2 < 1
        ? `${(areaKm2 * 1000000).toFixed(0)} m² (${areaMi2.toFixed(2)} mi²)`
        : `${areaKm2.toFixed(2)} km² (${areaMi2.toFixed(2)} mi²)`;
    } else {
      areaStatsEl.style.display = 'none';
    }

    panel.classList.add('open');
  }

  function close() {
    panel.classList.remove('open');
    active = null;
  }

  function refreshCategorySelectors() {
    if (!active) return;
    if (active.kind === 'pin') {
      const d = active.marker._pinData;
      if (categorySelector) {
        renderPanelCategorySelector(categorySelector, d.categoryId ?? null, handlePanelCategorySelect);
      }
    } else {
      const d = active.polygon._areaData;
      if (categorySelector) {
        renderPanelCategorySelector(categorySelector, d.categoryId ?? null, handlePanelCategorySelect);
      }
    }
  }

  closeBtn.addEventListener('click', close);

  noteArea.addEventListener('input', () => {
    if (!active) return;
    if (noteTimeout) clearTimeout(noteTimeout);
    const current = active;
    noteTimeout = setTimeout(() => {
      if (current.kind === 'pin') {
        const d = current.marker._pinData;
        updatePin(d.lat, d.lng, { note: noteArea.value });
      } else {
        const d = current.polygon._areaData;
        updateArea(d.id, { note: noteArea.value });
      }
    }, 400);
  });

  titleInput.addEventListener('input', () => {
    if (!active) return;
    if (titleTimeout) clearTimeout(titleTimeout);
    const current = active;
    titleTimeout = setTimeout(() => {
      const newLabel = titleInput.value.trim() || 'Unnamed';
      if (current.kind === 'pin') {
        const d = current.marker._pinData;
        current.marker._pinData.label = newLabel;
        current.marker.setIcon(createPinIcon(newLabel, d.categoryId));
        updatePin(d.lat, d.lng, { label: newLabel });
      } else {
        const d = current.polygon._areaData;
        current.polygon._areaData.label = newLabel;
        updateArea(d.id, { label: newLabel });
        const color = getCategoryColor(d.categoryId);
        const labelMarker = (current.polygon as any)._labelMarker;
        if (labelMarker) {
          labelMarker.setIcon(
            L.divIcon({
              className: 'area-label',
              html: '<span style="background:' + color + '99">' + newLabel + '</span>',
              iconSize: [0, 0],
            })
          );
        }
      }
    }, 400);
  });

  deleteBtn.addEventListener('click', () => {
    if (!active) return;
    if (active.kind === 'pin') {
      const d = active.marker._pinData;
      callbacks.onDeletePin(d.lat, d.lng);
    } else {
      callbacks.onDeleteArea(active.polygon);
    }
    close();
  });

  return { openPin, openArea, close, refreshCategorySelectors };
}
