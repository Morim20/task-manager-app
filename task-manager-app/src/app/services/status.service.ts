import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { StatusMaster } from '../models/status.model';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject } from 'rxjs';
import firebase from 'firebase/compat/app';

@Injectable({ providedIn: 'root' })
export class StatusService {
  private statuses = new BehaviorSubject<StatusMaster[]>([]);

  constructor(
    private firestore: AngularFirestore,
    private auth: AngularFireAuth
  ) {
    this.auth.authState.subscribe(user => {
      if (user) {
        // カテゴリー選択時などに明示的にinitializeStatuses(categoryId)を呼ぶ
      } else {
        this.statuses.next([]);
      }
    });
  }

  getStatuses() {
    return this.statuses.asObservable();
  }

  private async getStatusesCollection(categoryId: string) {
    const user = await this.auth.currentUser;
    if (!user) throw new Error('未認証');
    return this.firestore.collection(`users/${user.uid}/categories/${categoryId}/statuses`);
  }

  async getAll(categoryId: string): Promise<StatusMaster[]> {
    const col = await this.getStatusesCollection(categoryId);
    const snapshot = await col.ref.orderBy('order', 'asc').get();
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data() as Omit<StatusMaster, 'id'>;
      return { id: docSnap.id, ...data } as StatusMaster;
    });
  }

  public async initializeStatuses(categoryId: string) {
    const user = await this.auth.currentUser;
    if (!user) return;
    const statusesRef = this.firestore.collection(`users/${user.uid}/categories/${categoryId}/statuses`);
    statusesRef.ref.orderBy('order', 'asc').onSnapshot((snapshot) => {
      const statuses = snapshot.docs.map(doc => {
        const data = doc.data() as Omit<StatusMaster, 'id'>;
        return { id: doc.id, ...data } as StatusMaster;
      });
      this.statuses.next(statuses);
    });
  }

  async add(categoryId: string, name: string): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) {
      throw new Error('ユーザーが認証されていません');
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('ステータス名を入力してください');
    }
    const statusesRef = this.firestore.collection(`users/${user.uid}/categories/${categoryId}/statuses`);
    const snapshot = await statusesRef.get().toPromise();
    const order = snapshot?.size || 0;
    const id = uuidv4();
    const newStatus = { id, name: trimmedName, order };
    const docRef = statusesRef.doc(id);
    console.log('Firestoreに追加するデータ:', newStatus);
    await docRef.set(newStatus);
  }

  async update(categoryId: string, status: StatusMaster): Promise<void> {
    const col = await this.getStatusesCollection(categoryId);
    const docRef = col.doc(status.id);
    await docRef.update(status as any);
  }

  async delete(categoryId: string, id: string): Promise<void> {
    const col = await this.getStatusesCollection(categoryId);
    const docRef = col.doc(id);
    await docRef.delete();
  }

  /**
   * 指定したカテゴリーIDのstatusesコレクションにデフォルトステータスを追加
   */
  public async addDefaultStatuses(categoryId: string): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) return;
    const statusesRef = this.firestore.collection(`users/${user.uid}/categories/${categoryId}/statuses`);
    const defaultStatuses = [
      { id: uuidv4(), name: '未着手', order: 0 },
      { id: uuidv4(), name: '進行中', order: 1 },
      { id: uuidv4(), name: '完了', order: 2 }
    ];
    await Promise.all(defaultStatuses.map(status => {
      const docRef = statusesRef.doc(status.id);
      return docRef.set(status);
    }));
  }

  /**
   * ステータスの順番を一括更新（orderフィールドを保存）
   */
  public async updateStatusOrder(categoryId: string, orderedStatuses: StatusMaster[]): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) return;
    
    const statusesRef = this.firestore.collection(`users/${user.uid}/categories/${categoryId}/statuses`);
    const batch = this.firestore.firestore.batch();
    
    // バッチ処理で一括更新
    orderedStatuses.forEach((status, idx) => {
      const docRef = statusesRef.doc(status.id).ref;
      batch.update(docRef, { 
        order: idx,
        updatedAt: new Date().toISOString()
      });
    });
    
    // バッチ処理を実行
    await batch.commit();
    
    // 更新後のステータスを取得してBehaviorSubjectを更新
    const updatedStatuses = await this.getAll(categoryId);
    this.statuses.next(updatedStatuses);
  }
} 