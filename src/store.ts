import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { PinData, AreaData, UserCategory } from './types';

function uid(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.uid;
}

function pinsRef() {
  return collection(db, 'users', uid(), 'pins');
}

function areasRef() {
  return collection(db, 'users', uid(), 'areas');
}

function categoriesRef() {
  return collection(db, 'users', uid(), 'categories');
}

// --- Categories ---

export async function getAllCategories(): Promise<UserCategory[]> {
  const snap = await getDocs(query(categoriesRef()));
  return snap.docs.map((d) => d.data() as UserCategory);
}

export async function addCategory(category: UserCategory): Promise<void> {
  await setDoc(doc(categoriesRef(), category.id), category);
}

export async function updateCategory(
  id: string,
  changes: Partial<UserCategory>
): Promise<void> {
  await updateDoc(doc(categoriesRef(), id), changes);
}

export async function removeCategory(id: string): Promise<void> {
  await deleteDoc(doc(categoriesRef(), id));
}

export async function clearAllCategories(): Promise<void> {
  const snap = await getDocs(query(categoriesRef()));
  const deletes = snap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletes);
}

// --- Pins ---

export async function getAllPins(): Promise<PinData[]> {
  const snap = await getDocs(query(pinsRef()));
  return snap.docs.map((d) => d.data() as PinData);
}

export async function addPin(pin: PinData): Promise<void> {
  const key = pin.lat + '_' + pin.lng;
  await setDoc(doc(pinsRef(), key), pin);
}

export async function removePin(lat: number, lng: number): Promise<void> {
  const key = lat + '_' + lng;
  await deleteDoc(doc(pinsRef(), key));
}

export async function updatePin(
  lat: number,
  lng: number,
  changes: Partial<PinData>
): Promise<void> {
  const key = lat + '_' + lng;
  await updateDoc(doc(pinsRef(), key), changes);
}

export async function findPin(
  lat: number,
  lng: number
): Promise<PinData | undefined> {
  const pins = await getAllPins();
  return pins.find((p) => p.lat === lat && p.lng === lng);
}

export async function clearAllPins(): Promise<void> {
  const snap = await getDocs(query(pinsRef()));
  const deletes = snap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletes);
}

// --- Areas ---

export async function getAllAreas(): Promise<AreaData[]> {
  const snap = await getDocs(query(areasRef()));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      vertices: (data.vertices as { lat: number; lng: number }[]).map(
        (v) => [v.lat, v.lng] as [number, number]
      ),
    } as AreaData;
  });
}

export async function addArea(area: AreaData): Promise<void> {
  const docData = {
    ...area,
    vertices: area.vertices.map(([lat, lng]) => ({ lat, lng })),
  };
  await setDoc(doc(areasRef(), area.id), docData);
}

export async function removeArea(id: string): Promise<void> {
  await deleteDoc(doc(areasRef(), id));
}

export async function updateArea(
  id: string,
  changes: Partial<AreaData>
): Promise<void> {
  await updateDoc(doc(areasRef(), id), changes);
}

export async function findArea(id: string): Promise<AreaData | undefined> {
  const areas = await getAllAreas();
  return areas.find((a) => a.id === id);
}

export async function clearAllAreas(): Promise<void> {
  const snap = await getDocs(query(areasRef()));
  const deletes = snap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletes);
}
