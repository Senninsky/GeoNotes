import L from 'leaflet';
import { createMap } from './map';
import { addNewMarker, deleteMarker, loadMarkers, setUserCategories, userCategories, createPinIcon } from './pins';
import { addNewArea, deleteArea, loadAreas, clearAllAreaLayers } from './areas';
import { initPanel } from './panel';
import { initDrawing } from './drawing';
import { signInWithGoogle, signOut, onAuth } from './auth';
import { clearAllPins, clearAllAreas, getAllCategories, addCategory, updateCategory, removeCategory, clearAllCategories } from './store';
import type { PinMarker, AreaPolygon, UserCategory } from './types';
import type { User } from 'firebase/auth';
import './style.css';

// -- Auth UI --

const loginScreen = document.getElementById('login-screen')!;
const googleSignInBtn = document.getElementById('google-sign-in')!;
const userBar = document.getElementById('user-bar')!;
const userAvatar = document.getElementById('user-avatar') as HTMLImageElement;
const userName = document.getElementById('user-name')!;
const signOutBtn = document.getElementById('sign-out')!;

let currentUser: User | null = null;

googleSignInBtn.addEventListener('click', async () => {
  try {
    await signInWithGoogle();
  } catch (err) {
    console.error('Sign-in failed', err);
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOut();
});

// -- Map setup --

const map = createMap();
const markers = L.layerGroup().addTo(map);

const allPins: PinMarker[] = [];
const allAreas: { polygon: AreaPolygon; labelMarker: L.Marker | null }[] = [];

let currentMode: 'select' | 'pin' | 'draw' = 'select';

function updateAreaInteractivity() {
  const interactive = currentMode === 'select';
  allAreas.forEach(({ polygon }) => {
    polygon.options.interactive = interactive;
    const el = (polygon as any)._path;
    if (el) el.style.pointerEvents = interactive ? 'auto' : 'none';
  });
}

function setMode(mode: 'select' | 'pin' | 'draw') {
  currentMode = mode;
  selectBtn.classList.toggle('active', mode === 'select');
  pinBtn.classList.toggle('active', mode === 'pin');
  drawBtn.classList.toggle('active', mode === 'draw');
  if (mode === 'draw') {
    drawing.start();
  } else {
    drawing.stop();
  }
  updateAreaInteractivity();
}

// -- Panel --

const panel = initPanel({
  onDeletePin(lat, lng) {
    const idx = allPins.findIndex(m => m._pinData.lat === lat && m._pinData.lng === lng);
    if (idx >= 0) allPins.splice(idx, 1);
    deleteMarker(markers, lat, lng);
  },
  onDeleteArea(polygon) {
    const idx = allAreas.findIndex(a => a.polygon === polygon);
    if (idx >= 0) allAreas.splice(idx, 1);
    deleteArea(map, polygon);
  },
});

function onMarkerClick(marker: PinMarker) {
  panel.openPin(marker);
}

function onAreaClick(polygon: AreaPolygon) {
  panel.openArea(polygon);
}

// -- Modal --

const modalOverlay = document.getElementById('pin-modal')!;
const modalInput = document.getElementById('pin-name-input') as HTMLInputElement;
const modalOk = document.getElementById('pin-ok')!;
const modalCancel = document.getElementById('pin-cancel')!;
const modalLabel = modalOverlay.querySelector('.modal-box label') as HTMLLabelElement;

type ModalMode = 'pin' | 'area';
let modalMode: ModalMode = 'pin';
let pendingLatLng: { lat: number; lng: number } | null = null;
let pendingVertices: [number, number][] | null = null;
let selectedCategoryId: string | null = null;

function renderCategorySelector(container: HTMLElement, selectedId: string | null) {
  container.innerHTML = '';
  const noCatBtn = document.createElement('button');
  noCatBtn.className = 'category-btn no-category' + (selectedId === null ? ' active' : '');
  noCatBtn.textContent = 'No category';
  noCatBtn.addEventListener('click', () => {
    selectedCategoryId = null;
    const sel = document.getElementById('pin-category-select');
    if (sel) renderCategorySelector(sel, null);
  });
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
    btn.addEventListener('click', () => {
      selectedCategoryId = cat.id;
      const sel = document.getElementById('pin-category-select');
      if (sel) renderCategorySelector(sel, cat.id);
    });
    container.appendChild(btn);
  });

  if (userCategories.length > 0) {
    container.classList.add('has-categories');
  } else {
    container.classList.remove('has-categories');
  }
}

function openModal(mode: ModalMode) {
  modalMode = mode;
  modalLabel.textContent = mode === 'area' ? 'Area Name' : 'Pin Name';
  modalInput.placeholder =
    mode === 'area' ? 'e.g. Downtown, Park, ...' : 'e.g. Home, Paris, ...';
  modalOk.textContent = mode === 'area' ? 'Create Area' : 'Place Pin';
  modalInput.value = '';
  selectedCategoryId = null;
  const categorySelector = document.getElementById('pin-category-select');
  const categoryLabel = document.getElementById('pin-category-select')?.previousElementSibling;
  if (categorySelector) {
    categorySelector.style.display = 'flex';
    renderCategorySelector(categorySelector, selectedCategoryId);
  }
  modalOverlay.classList.add('open');
  setTimeout(() => modalInput.focus(), 50);
}

function closeModal() {
  modalOverlay.classList.remove('open');
  pendingLatLng = null;
  pendingVertices = null;
  drawing.stop();
  setMode('select');
}

async function confirmNameModal() {
  const label = modalInput.value.trim();
  try {
    if (modalMode === 'pin' && pendingLatLng) {
      const marker = await addNewMarker(
        markers,
        pendingLatLng.lat,
        pendingLatLng.lng,
        label || 'Unnamed Pin',
        onMarkerClick,
        selectedCategoryId
      );
      allPins.push(marker);
      applyCategoryFilters();
    } else if (modalMode === 'area' && pendingVertices) {
      const polygon = await addNewArea(
        map,
        pendingVertices,
        label || 'Unnamed Area',
        onAreaClick,
        selectedCategoryId
      );
      allAreas.push({ polygon, labelMarker: (polygon as any)._labelMarker || null });
      applyCategoryFilters();
    } else {
      console.error('Missing data:', { modalMode, pendingLatLng, pendingVertices });
      return;
    }
    closeModal();
  } catch (err) {
    console.error('Failed to save:', err);
  }
}

modalOk.addEventListener('click', confirmNameModal);
modalCancel.addEventListener('click', closeModal);
modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmNameModal();
  if (e.key === 'Escape') closeModal();
});
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// -- Categories modal --

const categoriesModal = document.getElementById('categories-modal')!;
const categoriesList = document.getElementById('categories-list')!;
const categoryNameInput = document.getElementById('category-name-input') as HTMLInputElement;
const categoryColorInput = document.getElementById('category-color-input') as HTMLInputElement;
const categorySaveBtn = document.getElementById('category-save-btn')!;
const categoryCancelBtn = document.getElementById('category-cancel-btn')!;
const categoriesCloseBtn = document.getElementById('categories-close')!;

let editingCategoryId: string | null = null;

function openCategoriesModal() {
  renderCategoriesList();
  categoryNameInput.value = '';
  categoryColorInput.value = '#3b82f6';
  categorySaveBtn.textContent = 'Add Category';
  editingCategoryId = null;
  categoriesModal.classList.add('open');
  setTimeout(() => categoryNameInput.focus(), 50);
}

function closeCategoriesModal() {
  categoriesModal.classList.remove('open');
  refreshAllCategorySelectors();
}

function renderCategoriesList() {
  categoriesList.innerHTML = '';
  if (userCategories.length === 0) {
    categoriesList.innerHTML = '<p style="font-size:13px;color:#888;margin-bottom:8px;">No categories yet. Create one below.</p>';
    return;
  }
  userCategories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-list-item';
    const colorDot = document.createElement('span');
    colorDot.className = 'cat-color-preview';
    colorDot.style.background = cat.color;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'cat-name';
    nameSpan.textContent = cat.name;
    const visBtn = document.createElement('button');
    visBtn.className = 'cat-vis-btn';
    visBtn.title = cat.visible ? 'Hide category' : 'Show category';
    visBtn.innerHTML = cat.visible
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    visBtn.addEventListener('click', async () => {
      cat.visible = !cat.visible;
      await updateCategory(cat.id, { visible: cat.visible });
      renderCategoriesList();
      applyCategoryFilters();
    });
    const editBtn = document.createElement('button');
    editBtn.className = 'cat-edit-btn';
    editBtn.title = 'Edit';
    editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    editBtn.addEventListener('click', () => {
      editingCategoryId = cat.id;
      categoryNameInput.value = cat.name;
      categoryColorInput.value = cat.color;
      categorySaveBtn.textContent = 'Save';
      categoryNameInput.focus();
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'cat-delete-btn';
    deleteBtn.title = 'Delete';
    deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
    deleteBtn.addEventListener('click', async () => {
      await removeCategory(cat.id);
      userCategories.splice(userCategories.indexOf(cat), 1);
      applyCategoryFilters();
      renderCategoriesList();
    });
    item.appendChild(colorDot);
    item.appendChild(nameSpan);
    item.appendChild(visBtn);
    item.appendChild(editBtn);
    item.appendChild(deleteBtn);
    categoriesList.appendChild(item);
  });
}

async function saveCategory() {
  const name = categoryNameInput.value.trim();
  if (!name) return;
  const color = categoryColorInput.value;
  if (editingCategoryId) {
    await updateCategory(editingCategoryId, { name, color });
    const cat = userCategories.find(c => c.id === editingCategoryId);
    if (cat) {
      cat.name = name;
      cat.color = color;
    }
    editingCategoryId = null;
    categorySaveBtn.textContent = 'Add Category';
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newCat: UserCategory = { id, name, color, visible: true };
    await addCategory(newCat);
    userCategories.push(newCat);
  }
  categoryNameInput.value = '';
  categoryColorInput.value = '#3b82f6';
  renderCategoriesList();
}

categorySaveBtn.addEventListener('click', saveCategory);
categoryCancelBtn.addEventListener('click', () => {
  editingCategoryId = null;
  categoryNameInput.value = '';
  categoryColorInput.value = '#3b82f6';
  categorySaveBtn.textContent = 'Add Category';
});
categoriesCloseBtn.addEventListener('click', closeCategoriesModal);
categoriesModal.addEventListener('click', (e) => {
  if (e.target === categoriesModal) closeCategoriesModal();
});
categoryNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveCategory();
  if (e.key === 'Escape') closeCategoriesModal();
});

function refreshAllCategorySelectors() {
  const pinSelector = document.getElementById('pin-category-select');
  if (pinSelector && modalOverlay.classList.contains('open')) {
    renderCategorySelector(pinSelector, selectedCategoryId);
  }
  panel.refreshCategorySelectors();
}

// -- Drawing --

const drawing = initDrawing(map, {
  onFinish(vertices) {
    pendingVertices = vertices;
    pendingLatLng = null;
    openModal('area');
  },
});

// -- Toolbar --

const toolbar = document.createElement('div');
toolbar.className = 'toolbar';
toolbar.innerHTML =
  '<button class="toolbar-btn active" data-mode="select" title="Select">' +
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>' +
  '</button>' +
  '<button class="toolbar-btn" data-mode="pin" title="Place Pin">' +
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
  '</button>' +
  '<button class="toolbar-btn" data-mode="draw" title="Draw Area">' +
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/></svg>' +
  '</button>' +
  '<div class="toolbar-sep"></div>' +
  '<button class="toolbar-btn" id="categories-toolbar-btn" title="Manage Categories">' +
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>' +
  '</button>' +
  '<div class="toolbar-sep"></div>' +
  '<button class="toolbar-btn" id="clear-all-btn" title="Clear All">' +
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
  '</button>';
document.body.appendChild(toolbar);

const selectBtn = toolbar.querySelector('[data-mode="select"]') as HTMLButtonElement;
const pinBtn = toolbar.querySelector('[data-mode="pin"]') as HTMLButtonElement;
const drawBtn = toolbar.querySelector('[data-mode="draw"]') as HTMLButtonElement;
const categoriesToolbarBtn = document.getElementById('categories-toolbar-btn')!;

selectBtn.addEventListener('click', () => setMode('select'));
pinBtn.addEventListener('click', () => setMode('pin'));
drawBtn.addEventListener('click', () => setMode('draw'));

// -- Confirm dialog --

const confirmModal = document.getElementById('confirm-modal')!;
const confirmMessage = document.getElementById('confirm-message')!;
const confirmOk = document.getElementById('confirm-ok')!;
const confirmCancel = document.getElementById('confirm-cancel')!;
let onConfirmAction: (() => void | Promise<void>) | null = null;

function showConfirm(message: string, action: () => void | Promise<void>) {
  confirmMessage.textContent = message;
  onConfirmAction = action;
  confirmModal.classList.add('open');
}

function hideConfirm() {
  confirmModal.classList.remove('open');
  onConfirmAction = null;
}

confirmOk.addEventListener('click', () => {
  if (onConfirmAction) onConfirmAction();
  hideConfirm();
});

confirmCancel.addEventListener('click', hideConfirm);
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) hideConfirm();
});

// -- Clear all --

const clearAllBtn = document.getElementById('clear-all-btn') as HTMLButtonElement;

clearAllBtn.addEventListener('click', () => {
  showConfirm('Remove all pins and areas?', async () => {
    markers.clearLayers();
    clearAllAreaLayers(map);
    allPins.length = 0;
    allAreas.length = 0;
    await clearAllPins();
    await clearAllAreas();
    panel.close();
  });
});

// -- Map click --

map.on('click', (e: L.LeafletMouseEvent) => {
  if (drawing.isActive()) return;
  if (currentMode !== 'pin') return;
  pendingLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
  pendingVertices = null;
  openModal('pin');
});

// -- Auth state & data loading --

function updateAuthUI(user: User | null) {
  currentUser = user;
  if (user) {
    loginScreen.classList.remove('visible');
    userBar.classList.add('visible');
    userAvatar.src = user.photoURL ?? '';
    userName.textContent = user.displayName ?? user.email ?? 'User';
  } else {
    loginScreen.classList.add('visible');
    userBar.classList.remove('visible');
  }
}

function applyCategoryFilters() {
  const visibleCatIds = new Set(userCategories.filter(c => c.visible).map(c => c.id));
  allPins.forEach((m) => {
    const catId = m._pinData.categoryId;
    if (catId === null || catId === undefined || visibleCatIds.has(catId)) {
      if (!markers.hasLayer(m)) markers.addLayer(m);
    } else {
      if (markers.hasLayer(m)) markers.removeLayer(m);
    }
  });
  allAreas.forEach(({ polygon, labelMarker }) => {
    const catId = polygon._areaData.categoryId;
    if (catId === null || catId === undefined || visibleCatIds.has(catId)) {
      if (!map.hasLayer(polygon)) map.addLayer(polygon);
      if (labelMarker && !map.hasLayer(labelMarker)) map.addLayer(labelMarker);
    } else {
      if (map.hasLayer(polygon)) map.removeLayer(polygon);
      if (labelMarker && map.hasLayer(labelMarker)) map.removeLayer(labelMarker);
    }
  });
  updateAreaInteractivity();
}

onAuth(async (user) => {
  updateAuthUI(user);
  if (user) {
    markers.clearLayers();
    clearAllAreaLayers(map);
    allPins.length = 0;
    allAreas.length = 0;
    const cats = await getAllCategories();
    userCategories.length = 0;
    userCategories.push(...cats.map(c => ({ ...c, visible: c.visible !== false })));
    setUserCategories(userCategories);
    const loadedPins = await loadMarkers(markers, onMarkerClick);
    allPins.push(...loadedPins);
    const loadedAreas = await loadAreas(map, onAreaClick);
    loadedAreas.forEach(poly => {
      allAreas.push({ polygon: poly, labelMarker: (poly as any)._labelMarker || null });
    });
    applyCategoryFilters();
  }
});
