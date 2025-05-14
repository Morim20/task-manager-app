import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CategoryStatus } from '../models/task.model';
import { StatusMaster } from '../models/status.model';

@Injectable({
  providedIn: 'root'
})
export class CategoryStatusService {
  private categoryStatuses = new BehaviorSubject<CategoryStatus[]>([]);
  private readonly DB_NAME = 'TaskManagerDB';
  private readonly STORE_NAME = 'categoryStatuses';
  private readonly DB_VERSION = 1;
  private db!: IDBDatabase;

  constructor() {
    this.initializeDB();
  }

  private initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDBの初期化に失敗しました:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDBの初期化が成功しました');
        this.loadCategoryStatuses();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // カテゴリーステータスストアの作成
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'categoryId' });
          store.createIndex('categoryId', 'categoryId', { unique: true });
        }
      };
    });
  }

  private async ensureDBInitialized(): Promise<void> {
    if (!this.db) {
      await this.initializeDB();
    }
  }

  private loadCategoryStatuses(): void {
    const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
    const store = transaction.objectStore(this.STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      this.categoryStatuses.next(request.result || []);
    };

    request.onerror = () => {
      console.error('カテゴリーステータスの読み込みに失敗しました:', request.error);
    };
  }

  getCategoryStatuses(): Observable<CategoryStatus[]> {
    return this.categoryStatuses.asObservable();
  }

  async getStatusesByCategoryId(categoryId: string): Promise<StatusMaster[]> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('categoryId');
      const request = index.getAll(categoryId);

      request.onsuccess = () => {
        const categoryStatus = request.result[0];
        if (categoryStatus) {
          // orderでソート
          const statuses: StatusMaster[] = (categoryStatus.statuses as any[])
            .map((s: any, index: number) => ({
              id: s.id ?? `status-${index}`,
              name: s.name,
              order: s.order ?? index
            }))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          resolve(statuses);
        } else {
          resolve([]);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setCategoryStatuses(categoryId: string, statuses: StatusMaster[]): Promise<void> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      // orderも含めて保存
      const categoryStatus: any = {
        categoryId,
        statuses: statuses.map(s => ({ name: s.name, order: s.order ?? 0 })),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const request = store.put(categoryStatus);
      request.onsuccess = () => {
        this.loadCategoryStatuses();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async addStatusToCategory(categoryId: string, newStatus: StatusMaster): Promise<void> {
    const currentStatuses = await this.getStatusesByCategoryId(categoryId);
    if (!currentStatuses.some(s => s.name === newStatus.name)) {
      currentStatuses.push(newStatus);
      await this.setCategoryStatuses(categoryId, currentStatuses);
    }
  }
} 