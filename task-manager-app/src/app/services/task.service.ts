// src/app/services/task.service.ts

import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Task, NotificationSettings } from '../models/task.model';
import { v4 as uuidv4 } from 'uuid';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { NotificationService } from './notification.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CategoryService } from './category.service';
import firebase from 'firebase/compat/app';
import { doc, deleteDoc, collection, query, where, getDocs, writeBatch } from '@angular/fire/firestore';

function removeUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => {
        // Date型で無効な日付はnullに
        if (v instanceof Date && (isNaN(v.getTime()) || v === undefined)) return [k, null];
        return [k, removeUndefined(v)];
      })
  );
}

function reviveTaskDates(task: any): any {
  const dateFields = ['dueDate', 'createdAt', 'updatedAt', 'targetCompletionDate', 'archivedAt'];
  const result = { ...task };
  for (const field of dateFields) {
    const v = result[field];
    if (!v || v === '' || v === null) {
      result[field] = undefined;
    } else if (typeof v === 'object' && typeof v.toDate === 'function') {
      // Firestore Timestamp型
      result[field] = v.toDate();
    } else if (typeof v === 'object' && v.seconds !== undefined && v.nanoseconds !== undefined) {
      // Timestamp型の生データ
      result[field] = new Date(v.seconds * 1000);
    } else if (typeof v === 'string') {
      const d = new Date(v);
      if (isNaN(d.getTime()) || v === undefined) return v;
    } else {
      result[field] = undefined;
    }
  }

  // exDatesをstring型（yyyy-MM-dd）に統一
  if (Array.isArray(result.exDates)) {
    result.exDates = result.exDates
      .map((d: any) => {
        if (typeof d === 'string') return d.slice(0, 10);
        if (d && typeof d.toDate === 'function') return d.toDate().toISOString().slice(0, 10);
        if (d instanceof Date) return d.toISOString().slice(0, 10);
        return '';
      })
      .filter((d: string) => !!d); // 空文字除外
  }

  // repeat.startDate, repeat.endDateもDate型に変換
  if (result.repeat) {
    if (result.repeat.startDate) {
      if (typeof result.repeat.startDate === 'object' && typeof result.repeat.startDate.toDate === 'function') {
        result.repeat.startDate = result.repeat.startDate.toDate();
      } else if (typeof result.repeat.startDate === 'object' && result.repeat.startDate.seconds !== undefined) {
        result.repeat.startDate = new Date(result.repeat.startDate.seconds * 1000);
      } else {
        const d = new Date(result.repeat.startDate);
        result.repeat.startDate = isNaN(d.getTime()) ? undefined : d;
      }
    }
    if (result.repeat.endDate) {
      if (typeof result.repeat.endDate === 'object' && typeof result.repeat.endDate.toDate === 'function') {
        result.repeat.endDate = result.repeat.endDate.toDate();
      } else if (typeof result.repeat.endDate === 'object' && result.repeat.endDate.seconds !== undefined) {
        result.repeat.endDate = new Date(result.repeat.endDate.seconds * 1000);
      } else {
        const d = new Date(result.repeat.endDate);
        result.repeat.endDate = isNaN(d.getTime()) ? undefined : d;
      }
    }
  }
  // 数値フィールドの処理
  const numericFields = ['progress', 'priority'];
  for (const field of numericFields) {
    if (result[field] !== undefined && result[field] !== null) {
      const num = Number(result[field]);
      result[field] = isNaN(num) ? 0 : num;
    } else {
      result[field] = 0;
    }
  }
  return result;
}

function toFirestoreTimestamp(date: any): firebase.firestore.Timestamp | null {
  if (!date) return null;
  if (typeof date === 'string' && !isNaN(new Date(date).getTime())) return firebase.firestore.Timestamp.fromDate(new Date(date));
  if (typeof date === 'object') {
    if (typeof date.toDate === 'function') return firebase.firestore.Timestamp.fromDate(date.toDate());
    if (date.seconds !== undefined) return firebase.firestore.Timestamp.fromDate(new Date(date.seconds * 1000));
    if (date.toISOString) return firebase.firestore.Timestamp.fromDate(new Date(date.toISOString()));
    if (date.getTime) return firebase.firestore.Timestamp.fromDate(new Date(date.getTime()));
    try {
      return firebase.firestore.Timestamp.fromDate(new Date(date));
    } catch {}
  }
  return null;
}

// undefined値をnullに変換する再帰関数
function sanitizeData(obj: any): any {
  if (obj === null) return null;
  if (obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeData(item));
  }
  if (obj instanceof Date) {
    return firebase.firestore.Timestamp.fromDate(obj);
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = sanitizeData(obj[key]);
      }
    }
    return result;
  }
  if (typeof obj === 'string') {
    const d = new Date(obj);
    if (!isNaN(d.getTime())) return firebase.firestore.Timestamp.fromDate(d);
  }
  return obj;
}

function prepareTaskForFirestore(task: any): any {
  // まず全体をsanitize
  const sanitizedTask = sanitizeData(task);

  // dueDateを必ずTimestamp型に変換
  if (sanitizedTask.dueDate) {
    // すでにTimestamp型ならそのまま
    if (!(sanitizedTask.dueDate.seconds !== undefined && sanitizedTask.dueDate.nanoseconds !== undefined)) {
      const d = new Date(sanitizedTask.dueDate);
      if (!isNaN(d.getTime())) {
        sanitizedTask.dueDate = firebase.firestore.Timestamp.fromDate(d);
      } else {
        sanitizedTask.dueDate = null;
      }
    }
  }

  // updatedAt, createdAt, repeatの特別処理
  if (task.updatedAt === undefined) {
    sanitizedTask.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  }
  if (task.createdAt === undefined) {
    sanitizedTask.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  }
  if (sanitizedTask.repeat === undefined) {
    sanitizedTask.repeat = null;
  } else if (sanitizedTask.repeat) {
    // repeat内の日付をTimestampに
    if (typeof sanitizedTask.repeat.startDate === 'string') {
      const d = new Date(sanitizedTask.repeat.startDate);
      if (!isNaN(d.getTime())) sanitizedTask.repeat.startDate = firebase.firestore.Timestamp.fromDate(d);
    }
    if (typeof sanitizedTask.repeat.endDate === 'string') {
      const d = new Date(sanitizedTask.repeat.endDate);
      if (!isNaN(d.getTime())) sanitizedTask.repeat.endDate = firebase.firestore.Timestamp.fromDate(d);
    }
    // repeat内のundefinedをnullに
    for (const key in sanitizedTask.repeat) {
      if (sanitizedTask.repeat[key] === undefined) {
        sanitizedTask.repeat[key] = null;
      }
    }
  }
  if (typeof sanitizedTask.scheduleDate === 'string') {
    const d = new Date(sanitizedTask.scheduleDate);
    if (!isNaN(d.getTime())) sanitizedTask.scheduleDate = firebase.firestore.Timestamp.fromDate(d);
  }
  return sanitizedTask;
}

interface RepeatTaskCompletion {
  completed: boolean;
  updatedAt: firebase.firestore.Timestamp;
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private tasksSubject = new BehaviorSubject<Task[]>([]);
  tasks$ = this.tasksSubject.asObservable();
  private isInitialized = false;
  private repeatTaskCompletions: { [key: string]: boolean } = {};

  constructor(
    private auth: AngularFireAuth,
    private ngZone: NgZone,
    private firestore: AngularFirestore,
    private notificationService: NotificationService,
    private snackBar: MatSnackBar,
    private categorySvc: CategoryService
  ) {
    this.auth.authState.subscribe(user => {
      this.ngZone.run(async () => {
        if (user) {
          try {
            if (!this.isInitialized) {
              await this.loadTasks(user.uid);
              this.isInitialized = true;
            }
          } catch (error) {
            this.isInitialized = false;
          }
        } else {
          this.tasksSubject.next([]);
          this.isInitialized = false;
        }
      });
    });
  }

  private async loadTasks(userId: string): Promise<void> {
    const tasksRef = this.firestore.collection(`users/${userId}/tasks`);
    const snapshot = await tasksRef.get().toPromise();
    const tasks: Task[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      const revivedTask = reviveTaskDates({ ...data, id: docSnap.id });
      tasks.push(revivedTask);
    });
    this.tasksSubject.next(tasks);
  }

  async addTask(task: Omit<Task, 'id'>): Promise<void | 'notification-failed'> {
    return this.ngZone.run(async () => {
      const user = await this.auth.currentUser;
      if (!user) throw new Error('ユーザーが認証されていません');
      const id = uuidv4();
      const now = new Date();
      const newTask: Task = {
        ...task,
        id,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        completed: task.completed ?? false,
        status: task.status ?? '未着手',
        labels: task.labels ?? [],
        subTasks: task.subTasks ?? [],
        relatedLinks: task.relatedLinks ?? [],
        memo: task.memo ?? '',
        description: task.description ?? '',
        archivedAt: undefined,
        dueDate: task.dueDate
      };

      const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`);
      const docRef = this.firestore.doc(`users/${user.uid}/tasks/${id}`);
      const cleanTask = prepareTaskForFirestore(newTask);
      await docRef.set(cleanTask);
      await this.loadTasks(user.uid);

      // 通知設定の処理を改善
      if (newTask.notification?.enabled) {
        const hasValidDateTime = newTask.dueDate && (newTask.dueTime || newTask.startTime);

        if (hasValidDateTime) {
          try {
            await this.notificationService.scheduleNotification(newTask, newTask.notification);
          } catch (e) {
            this.snackBar.open('通知の設定に失敗しましたが、タスクは保存されました', '閉じる', { duration: 4000 });
            return 'notification-failed';
          }
        } else {
          this.snackBar.open('通知を設定するには日付と時間を設定してください', '閉じる', { duration: 4000 });
        }
      }
      return;
    });
  }

  async updateTask(task: Task): Promise<void | 'notification-failed'> {
    return this.ngZone.run(async () => {
      const user = await this.auth.currentUser;
      if (!user) throw new Error('ユーザーが認証されていません');
      let completed = task.status === '完了';
      let archivedAt = task.archivedAt;
      if (task.archived) {
        if (!archivedAt) archivedAt = new Date().toISOString();
        const at: any = archivedAt;
        if (typeof at === 'string') {
          const d = new Date(at);
          archivedAt = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } else if (at && typeof at.toISOString === 'function') {
          archivedAt = at.toISOString();
        }
      } else {
        archivedAt = undefined;
      }
      const updatedTask = { 
        ...task, 
        completed, 
        updatedAt: new Date().toISOString(), 
        archivedAt,
        status: task.status ?? '未着手',
        dueDate: task.dueDate
      };

      const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`);
      const docRef = this.firestore.doc(`users/${user.uid}/tasks/${task.id}`);
      const cleanTask = prepareTaskForFirestore(updatedTask);
      await docRef.set(cleanTask);
      await this.loadTasks(user.uid);

      // 通知設定の処理を改善
      if (updatedTask.notification?.enabled && !updatedTask.completed) {
        const hasValidDateTime = updatedTask.dueDate && (updatedTask.dueTime || updatedTask.startTime);

        if (hasValidDateTime) {
          try {
            await this.notificationService.scheduleNotification(updatedTask, updatedTask.notification);
          } catch (e) {
            return 'notification-failed';
          }
        } else {
          this.snackBar.open('通知を設定するには日付と時間を設定してください', '閉じる', { duration: 4000 });
        }
      }
      return;
    });
  }

  async deleteTask(taskId: string, isCalendarPage: boolean = false): Promise<void> {
    return this.ngZone.run(async () => {
      const user = await this.auth.currentUser;
      if (!user) throw new Error('ユーザーが認証されていません');

      const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`);
      const taskDoc = await tasksRef.doc(taskId).get().toPromise();
      
      if (!taskDoc?.exists) {
        throw new Error('タスクが見つかりません');
      }

      const task = taskDoc.data() as Task;

      // 繰り返しタスクの場合
      if (task.repeat?.enabled && task.repeatGroupId && !isCalendarPage) {
        // repeatGroupIdが一致する全タスクを一括削除
        const batch = this.firestore.firestore.batch();
        const groupTasks = await tasksRef.ref.where('repeatGroupId', '==', task.repeatGroupId).get();
        groupTasks.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      } else if (task.repeat?.enabled && isCalendarPage) {
        // カレンダーページの場合、特定の日付のタスクのみを削除
        await tasksRef.doc(taskId).delete();
      } else {
        // 通常のタスクの場合
        await tasksRef.doc(taskId).delete();
      }

      // 通知を削除
      if (task.notification?.enabled) {
        this.notificationService.cancelNotification(taskId);
      }

      await this.loadTasks(user.uid);
    });
  }

  getTasks(): Observable<Task[]> {
    return this.tasks$;
  }

  async getTasksByCategory(categoryId: string): Promise<Task[]> {
    const user = await this.auth.currentUser;
    if (!user) return [];
    const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`, ref => ref.where('categoryId', '==', categoryId));
    const snapshot = await tasksRef.get().toPromise();
    const tasks: Task[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      tasks.push(reviveTaskDates({ ...data, id: docSnap.id }));
    });
    return tasks;
  }

  async getTasksByStatus(status: string): Promise<Task[]> {
    const user = await this.auth.currentUser;
    if (!user) return [];
    const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`, ref => ref.where('status', '==', status));
    const snapshot = await tasksRef.get().toPromise();
    const tasks: Task[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      tasks.push(reviveTaskDates({ ...data, id: docSnap.id }));
    });
    return tasks;
  }

  async getTasksByLabel(label: string): Promise<Task[]> {
    const user = await this.auth.currentUser;
    if (!user) return [];
    const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`, ref => ref.where('labels', 'array-contains', label));
    const snapshot = await tasksRef.get().toPromise();
    const tasks: Task[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      tasks.push(reviveTaskDates({ ...data, id: docSnap.id }));
    });
    return tasks;
  }

  async getCompletedTasks(): Promise<Task[]> {
    const user = await this.auth.currentUser;
    if (!user) return [];
    const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`, ref => ref.where('status', '==', '完了'));
    const snapshot = await tasksRef.get().toPromise();
    const tasks: Task[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      tasks.push(reviveTaskDates({ ...data, id: docSnap.id }));
    });
    return tasks;
  }

  async getPendingTasks(): Promise<Task[]> {
    const user = await this.auth.currentUser;
    if (!user) return [];
    const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`, ref => ref.where('status', '==', '未完了'));
    const snapshot = await tasksRef.get().toPromise();
    const tasks: Task[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      tasks.push(reviveTaskDates({ ...data, id: docSnap.id }));
    });
    return tasks;
  }

  async getTask(id: string): Promise<Task | undefined> {
    const user = await this.auth.currentUser;
    if (!user) return undefined;
    const docRef = this.firestore.doc(`users/${user.uid}/tasks/${id}`);
    const docSnap = await docRef.get().toPromise();
    if (docSnap && docSnap.exists) {
      return reviveTaskDates({ ...(docSnap.data() as Task), id: docSnap.id });
    }
    return undefined;
  }

  async archiveTask(id: string): Promise<void> {
    const task = await this.getTask(id);
    if (task) {
      task.archived = true;
      task.archivedAt = new Date().toISOString();
      await this.updateTask(task);
    }
  }

  async restoreTask(id: string): Promise<void> {
    const task = await this.getTask(id);
    if (task) {
      task.archived = false;
      task.archivedAt = undefined;
      await this.updateTask(task);
    }
  }

  // データ移行用のメソッド
  async migrateToCategoryId(): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) return;
    const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`);
    const snapshot = await tasksRef.get().toPromise();
    const tasks: Task[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      tasks.push(reviveTaskDates({ ...data, id: docSnap.id }));
    });
    const categories = await this.categorySvc.getAll();

    // カテゴリー名からIDへのマッピングを作成
    const categoryMap = new Map(
      categories.map(cat => [cat.name, cat.id])
    );

    // 各タスクのcategoryIdを設定
    const updatedTasks = tasks.map(task => ({
      ...task,
      categoryId: categoryMap.get(task.category || '') || task.category || '', // デフォルト値を設定
      category: task.category // 後方互換性のために保持
    }));

    // 更新されたタスクを保存
    await Promise.all(updatedTasks.map(task => this.updateTask(task)));
    
    // タスクリストを更新
    this.tasksSubject.next(updatedTasks);
  }

  // カテゴリーIDでタスクを取得するメソッド
  async getTasksByCategoryId(categoryId: string): Promise<Task[]> {
    const user = await this.auth.currentUser;
    if (!user) return [];
    const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`, ref => ref.where('categoryId', '==', categoryId));
    const snapshot = await tasksRef.get().toPromise();
    const tasks: Task[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      tasks.push(reviveTaskDates({ ...data, id: docSnap.id }));
    });
    return tasks;
  }

  /**
   * 既存タスクのcreatedAt, updatedAt, archivedAtがnullや不正な場合に自動で補完する
   */
  async fixAllTaskDates(): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) return;
    const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`);
    const snapshot = await tasksRef.get().toPromise();
    const updates: Promise<void>[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      let needsUpdate = false;
      const now = new Date();

      // createdAt
      let createdAt = data.createdAt;
      if (!createdAt || isNaN(new Date(createdAt).getTime())) {
        createdAt = now.toISOString();
        needsUpdate = true;
      }

      // updatedAt
      let updatedAt = data.updatedAt;
      if (!updatedAt || isNaN(new Date(updatedAt).getTime())) {
        updatedAt = createdAt;
        needsUpdate = true;
      }

      // archivedAt
      let archivedAt = data.archivedAt;
      if (data.archived && (!archivedAt || isNaN(new Date(archivedAt).getTime()))) {
        archivedAt = updatedAt;
        needsUpdate = true;
      }

      if (needsUpdate) {
        const docRef = this.firestore.doc(`users/${user.uid}/tasks/${docSnap.id}`);
        updates.push(docRef.update({
          ...data,
          createdAt,
          updatedAt,
          archivedAt
        }) as Promise<void>);
      }
    });
    await Promise.all(updates);
  }

  async cutRepeatEndDate(taskId: string, date: Date | string): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) throw new Error('ユーザーが認証されていません');
    const docRef = this.firestore.doc(`users/${user.uid}/tasks/${taskId}`);
    const endDate = typeof date === 'string' ? date : (date instanceof Date ? date.toISOString().slice(0, 10) : '');
    if (!endDate) throw new Error('日付が不正です');
    await docRef.update({ 'repeat.endDate': endDate });
    await this.loadTasks(user.uid);
  }

  async addExDate(taskId: string, date: string): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) throw new Error('ユーザーが認証されていません');
    const docRef = this.firestore.doc(`users/${user.uid}/tasks/${taskId}`);
    const task = await this.getTask(taskId);
    if (!task) throw new Error('タスクが見つかりません');
    // exDatesをすべてstring型（yyyy-MM-dd）に変換
    const exDates = (task.exDates || []).map((d: any) =>
      typeof d === 'string'
        ? d.slice(0, 10)
        : d && typeof d.toDate === 'function'
          ? d.toDate().toISOString().slice(0, 10)
          : d instanceof Date
            ? d.toISOString().slice(0, 10)
            : ''
    );
    const dateStr = date.slice(0, 10);
    if (!exDates.includes(dateStr)) {
      exDates.push(dateStr);
    }
    await docRef.update({ exDates });
    await this.loadTasks(user.uid);
  }

  /**
   * 既存の全タスクのexDatesをstring型（yyyy-MM-dd）に一括変換するバッチ関数
   */
  async fixAllExDatesToString(): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) return;
    const tasksRef = this.firestore.collection(`users/${user.uid}/tasks`);
    const snapshot = await tasksRef.get().toPromise();
    const updates: Promise<void>[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as Task;
      if (data.exDates && Array.isArray(data.exDates)) {
        const fixed = data.exDates.map((d: any) =>
          typeof d === 'string'
            ? d.slice(0, 10)
            : d && typeof d.toDate === 'function'
              ? d.toDate().toISOString().slice(0, 10)
              : d instanceof Date
                ? d.toISOString().slice(0, 10)
                : ''
        );
        const docRef = this.firestore.doc(`users/${user.uid}/tasks/${docSnap.id}`);
        updates.push(docRef.update({ exDates: fixed }) as Promise<void>);
      }
    });
    await Promise.all(updates);
  }

  async getRepeatTaskCompletion(taskId: string, date: string): Promise<boolean> {
    const user = await this.auth.currentUser;
    if (!user) return false;

    const docRef = this.firestore.doc(`users/${user.uid}/repeatTaskCompletions/${taskId}_${date}`);
    const docSnap = await docRef.get().toPromise();
    return docSnap?.exists ? (docSnap.data() as RepeatTaskCompletion).completed : false;
  }

  async setRepeatTaskCompletion(taskId: string, date: string, completed: boolean): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) throw new Error('ユーザーが認証されていません');

    const docRef = this.firestore.doc(`users/${user.uid}/repeatTaskCompletions/${taskId}_${date}`);
    await docRef.set({ completed, updatedAt: firebase.firestore.FieldValue.serverTimestamp() } as RepeatTaskCompletion);
  }

  // Firestoreのキャッシュをクリアするメソッド
  async clearFirestoreCache(): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) return;

    try {
      // タスクの再読み込み
      await this.loadTasks(user.uid);
      this.snackBar.open('データを再読み込みしました', '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('データの再読み込みに失敗しました:', error);
      this.snackBar.open('データの再読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }
}