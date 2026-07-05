import { Injectable } from '@angular/core';
import { errLog } from './errlog';

export type LeapSepsLogLevel = 'LOG' | 'INFO' | 'WARN' | 'ERROR' | 'CLICK' | 'PROCESS';

@Injectable({ providedIn: 'root' })
export class LeapSepsLogService {
 private write(level: LeapSepsLogLevel, category: string, message: string, detail?: unknown): void {
  const w = (window as any).leapSepsWrite;
  if (typeof w === 'function') {
   w(level, category, message, detail);
  }
 }

 logClick(where: string, detail?: unknown): void {
  this.write('CLICK', 'UI', where, detail);
 }

 logProcess(step: string, detail?: unknown): void {
  this.write('PROCESS', 'Workflow', step, detail);
 }

 logError(where: string, error: unknown, detail?: unknown): void {
  const msg =
   error instanceof Error
    ? error.message
    : error != null
      ? String(error)
      : 'Unknown error';
  this.write('ERROR', where, msg, detail ?? (error instanceof Error ? error.stack : error));
  // Also forward to the LEAP error dashboard (near-real-time; guarded, never throws)
  try { errLog(where, error, detail ? { detail: String(detail).slice(0, 500) } : undefined); } catch (e) { /* */ }
 }

 logInfo(category: string, message: string, detail?: unknown): void {
  this.write('INFO', category, message, detail);
 }

 logWarn(category: string, message: string, detail?: unknown): void {
  this.write('WARN', category, message, detail);
 }
}
