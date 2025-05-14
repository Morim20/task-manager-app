import { Injectable } from '@angular/core';
import { Task } from '../models/task.model';

@Injectable({
  providedIn: 'root'
})
export class TaskStorageService {
  private db!: IDBDatabase;
  private readonly DB_NAME = 'taskManagerDB';
  private readonly STORE_NAME = 'tasks';
  private readonly DB_VERSION = 1;
  private readonly REPEAT_COMPLETION_STORE = 'repeatTaskCompletions';
  private readonly USER_SETTINGS_STORE = 'userSettings';
  private dbInitialized: Promise<void>;

  constructor() {
    this.dbInitialized = this.initializeDB();
  }

  private initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION + 2);

      request.onerror = () => {
        console.error('IndexedDBの初期化に失敗しました:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDBの初期化が成功しました');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // タスクストアの作成
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          
          // 検索用のインデックスを作成
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('dueDate', 'dueDate', { unique: false });
          store.createIndex('labels', 'labels', { unique: false, multiEntry: true });
          store.createIndex('completed', 'completed', { unique: false });
        }
        // 仮想タスク完了ストアの作成
        if (!db.objectStoreNames.contains(this.REPEAT_COMPLETION_STORE)) {
          const store = db.createObjectStore(this.REPEAT_COMPLETION_STORE, { keyPath: 'key' });
          store.createIndex('id', 'id', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
        // ユーザー設定ストアの作成
        if (!db.objectStoreNames.contains(this.USER_SETTINGS_STORE)) {
          db.createObjectStore(this.USER_SETTINGS_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  private async ensureDBInitialized(): Promise<void> {
    await this.dbInitialized;
  }

  async addTask(task: Task): Promise<void> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      // データの整形
      const taskToStore = this.prepareTaskForStorage(task);
      const request = store.add(taskToStore);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('タスク追加エラー:', request.error);
        reject(request.error);
      };
    });
  }

  async updateTask(task: Task): Promise<void> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      // データの整形
      const taskToStore = this.prepareTaskForStorage(task);
      const request = store.put(taskToStore);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('タスク更新エラー:', request.error);
        reject(request.error);
      };
    });
  }

  private prepareTaskForStorage(task: Task): any {
    // IDの存在確認
    if (!task.id) {
      throw new Error('タスクにIDが設定されていません');
    }

    // 日付が有効かチェックする関数
    const isValidDate = (date: any): boolean => {
      return date instanceof Date && !isNaN(date.getTime());
    };

    // 日付をISOString形式に変換（無効な日付の場合はnullを返す）
    const safeToISOString = (date: any): string | null => {
      if (!date) return null;
      
      if (typeof date === 'string') {
        return date; // すでに文字列の場合はそのまま返す
      }
      
      if (isValidDate(date)) {
        return date.toISOString();
      }
      
      return null;
    };

    // 現在時刻を安全に取得
    const now = new Date();
    const safeNow = isValidDate(now) ? now.toISOString() : null;

    // 日付データの処理
    const preparedTask = {
      ...task,
      order: task.order !== undefined ? task.order : 9999, // orderがundefinedの場合は大きな値を設定
      dueDate: safeToISOString(task.dueDate),
      targetCompletionDate: safeToISOString(task.targetCompletionDate),
      createdAt: safeToISOString(task.createdAt) || safeNow || null,
      updatedAt: safeToISOString(task.updatedAt) || safeNow || null
    };

    // デバッグ用のログ
    console.log('Prepared task for storage:', {
      taskId: task.id,
      title: task.title,
      order: preparedTask.order,
      original: {
        dueDate: task.dueDate,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      },
      prepared: {
        dueDate: preparedTask.dueDate,
        createdAt: preparedTask.createdAt,
        updatedAt: preparedTask.updatedAt
      }
    });

    return preparedTask;
  }

  private prepareTaskFromStorage(task: any): Task {
    if (!task) return task;

    // 文字列から日付への安全な変換
    const safeToDate = (dateStr: any): Date | null => {
      if (!dateStr) return null;
      try {
        const date = new Date(dateStr);
        return !isNaN(date.getTime()) ? date : null;
      } catch (e) {
        console.error('日付変換エラー:', e);
        return null;
      }
    };

    return {
      ...task,
      order: task.order !== undefined ? task.order : 9999, // orderが未定義の場合は大きな値を設定
      dueDate: safeToDate(task.dueDate),
      createdAt: safeToDate(task.createdAt) || new Date(),
      updatedAt: safeToDate(task.updatedAt) || new Date(),
      targetCompletionDate: safeToDate(task.targetCompletionDate)
    };
  }

  async deleteTask(id: string): Promise<void> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTask(id: string): Promise<Task | undefined> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllTasks(): Promise<Task[]> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const tasks = request.result.map(task => this.prepareTaskFromStorage(task));
        resolve(tasks);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getTasksByCategory(category: string): Promise<Task[]> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('category');
      const request = index.getAll(category);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getTasksByStatus(status: string): Promise<Task[]> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('status');
      const request = index.getAll(status);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getTasksByLabel(label: string): Promise<Task[]> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('labels');
      const request = index.getAll(label);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getCompletedTasks(): Promise<Task[]> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('completed');
      const request = index.getAll(IDBKeyRange.only(1));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingTasks(): Promise<Task[]> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('completed');
      const request = index.getAll(IDBKeyRange.only(0));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async setRepeatTaskCompletion(id: string, date: string, completed: boolean): Promise<void> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.REPEAT_COMPLETION_STORE, 'readwrite');
      const store = transaction.objectStore(this.REPEAT_COMPLETION_STORE);
      const key = `${id}_${date}`;
      const data = { key, id, date, completed };
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getRepeatTaskCompletion(id: string, date: string): Promise<boolean> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.REPEAT_COMPLETION_STORE, 'readonly');
      const store = transaction.objectStore(this.REPEAT_COMPLETION_STORE);
      const key = `${id}_${date}`;
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result ? !!request.result.completed : false);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setUserSetting(key: string, value: any): Promise<void> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.USER_SETTINGS_STORE, 'readwrite');
      const store = transaction.objectStore(this.USER_SETTINGS_STORE);
      const data = { key, value };
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getUserSetting(key: string): Promise<any> {
    await this.ensureDBInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.USER_SETTINGS_STORE, 'readonly');
      const store = transaction.objectStore(this.USER_SETTINGS_STORE);
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }
} 