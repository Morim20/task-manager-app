import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CategoryStatus } from '../models/task.model';
import { StatusMaster } from '../models/status.model';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { FirebaseError } from '@angular/fire/app';

@Injectable({
  providedIn: 'root'
})
export class CategoryStatusService {
  private categoryStatuses = new BehaviorSubject<CategoryStatus[]>([]);

  constructor(
    private firestore: AngularFirestore,
    private auth: AngularFireAuth
  ) {
    // 認証状態の変更を監視
    this.auth.authState.subscribe(user => {
      if (user) {
        console.log('ユーザー認証状態:', user.uid);
        this.initializeStatuses();
      } else {
        console.log('ユーザー未認証');
        this.categoryStatuses.next([]);
      }
    });
  }

  private async initializeStatuses() {
    const user = await this.auth.currentUser;
    if (!user) {
      console.log('ユーザーが認証されていません');
      this.categoryStatuses.next([]);
      return;
    }

    try {
      console.log('カテゴリーステータスの取得開始:', user.uid);
      // Firestoreからステータスを取得
      const statusesRef = this.firestore.collection(`users/${user.uid}/categoryStatuses`);
      const snapshot = await statusesRef.get().toPromise();
      const statuses: CategoryStatus[] = [];
      snapshot?.forEach(docSnap => {
        const data = docSnap.data() as CategoryStatus;
        statuses.push({
          ...data,
          id: docSnap.id
        });
      });

      console.log('取得したカテゴリーステータス:', statuses);
      this.categoryStatuses.next(statuses);
    } catch (error) {
      console.error('カテゴリーステータスの取得中にエラーが発生しました:', error);
      if (error instanceof FirebaseError) {
        console.error('エラーの詳細:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
      }
      this.categoryStatuses.next([]);
    }
  }

  getCategoryStatuses(): Observable<CategoryStatus[]> {
    return this.categoryStatuses.asObservable();
  }

  async addCategoryStatus(status: CategoryStatus): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) throw new Error('ユーザーが認証されていません');

    const docRef = await this.firestore.collection(`users/${user.uid}/categoryStatuses`).add(status);
    status.id = docRef.id;
    const currentStatuses = this.categoryStatuses.value;
    this.categoryStatuses.next([...currentStatuses, status]);
  }

  async updateCategoryStatus(status: CategoryStatus): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) throw new Error('ユーザーが認証されていません');

    await this.firestore.doc(`users/${user.uid}/categoryStatuses/${status.id}`).update(status);
    const currentStatuses = this.categoryStatuses.value;
    const index = currentStatuses.findIndex(s => s.id === status.id);
    if (index !== -1) {
      currentStatuses[index] = status;
      this.categoryStatuses.next([...currentStatuses]);
    }
  }

  async deleteCategoryStatus(statusId: string): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) throw new Error('ユーザーが認証されていません');

    await this.firestore.doc(`users/${user.uid}/categoryStatuses/${statusId}`).delete();
    const currentStatuses = this.categoryStatuses.value;
    this.categoryStatuses.next(currentStatuses.filter(s => s.id !== statusId));
  }
} 