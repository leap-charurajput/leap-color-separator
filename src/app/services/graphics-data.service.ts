import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
 providedIn: 'root'
})
export class GraphicsDataService {
 private graphicsDataSubject = new BehaviorSubject<any[]>([]);
 public graphicsData$: Observable<any[]> = this.graphicsDataSubject.asObservable();

 constructor() {
  this.loadInitialData();
 }

 /**
  * Updates the graphics data and notifies all subscribers.
  * @param data The new graphics data array.
  */
 updateGraphicsData(data: any[]): void {
  if (Array.isArray(data)) {
   this.graphicsDataSubject.next(data);
   // We still keep a backup in case of panel refresh, 
   // but components should rely on graphicsData$ for real-time sync.
   try {
    localStorage.setItem('graphicsPositions', JSON.stringify(data));
   } catch (e) {
    console.error('[GraphicsDataService] Error saving to localStorage fallback:', e);
   }
  }
 }

 /**
  * Gets the current value of graphics data.
  */
 get currentGraphicsData(): any[] {
  return this.graphicsDataSubject.getValue();
 }

 /**
  * Resets the graphics data.
  */
 resetData(): void {
  this.updateGraphicsData([]);
 }

 private loadInitialData(): void {
  try {
   const saved = localStorage.getItem('graphicsPositions');
   if (saved) {
    const data = JSON.parse(saved);
    if (Array.isArray(data)) {
     this.graphicsDataSubject.next(data);
    }
   }
  } catch (e) {
   console.error('[GraphicsDataService] Error loading initial data:', e);
  }
 }
}
