import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { Label, DEFAULT_LABELS } from '../models/task.model';
import { v4 as uuidv4 } from 'uuid';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { map, catchError, switchMap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class LabelService {
  private labels = new BehaviorSubject<Label[]>([]);

  constructor(
    private firestore: AngularFirestore,
    private auth: AngularFireAuth
  ) {
    this.auth.authState.subscribe(user => {
      if (user) {
        this.initializeLabels(user.uid);
      } else {
        this.labels.next([]);
      }
    });
  }

  private async initializeLabels(uid: string): Promise<Label[]> {
    try {
      const labelsRef = this.firestore.collection<Label>(`users/${uid}/labels`);
      const snapshot = await labelsRef.get().toPromise();
      
      if (!snapshot) {
        throw new Error('ラベルの取得に失敗しました');
      }

      const labels = snapshot.docs
        .map(doc => ({
          ...doc.data(),
          id: doc.id
        }))
        .reduce((unique: Label[], item: Label) => {
          return unique.some(label => label.name.toLowerCase() === item.name.toLowerCase())
            ? unique
            : [...unique, item];
        }, []);

      if (labels.length === 0) {
        // デフォルトラベルの初期化
        const batch = this.firestore.firestore.batch();
        DEFAULT_LABELS.forEach(label => {
          const docRef = labelsRef.doc(label.id).ref;
          batch.set(docRef, label);
        });
        await batch.commit();
        this.labels.next(DEFAULT_LABELS);
        return DEFAULT_LABELS;
      }

      this.labels.next(labels);
      return labels;
    } catch (error) {
      console.error('ラベルの初期化に失敗しました:', error);
      throw error;
    }
  }

  getLabels(): Observable<Label[]> {
    return this.labels.asObservable();
  }

  async add(name: string, color: string = '#1890FF'): Promise<void> {
    try {
      const user = await this.auth.currentUser;
      if (!user) {
        throw new Error('ユーザーが認証されていません');
      }

      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error('ラベル名を入力してください');
      }

      const existingLabels = this.labels.getValue();
      if (existingLabels.some(l => l.name.toLowerCase() === trimmedName.toLowerCase())) {
        throw new Error('同名のラベルが既に存在します');
      }

      const labelsRef = this.firestore.collection<Label>(`users/${user.uid}/labels`);
      const newLabel: Label = {
        id: uuidv4(),
        name: trimmedName,
        color
      };

      await labelsRef.doc(newLabel.id).set(newLabel);
    } catch (error) {
      console.error('ラベルの追加に失敗しました:', error);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const user = await this.auth.currentUser;
      if (!user) {
        throw new Error('ユーザーが認証されていません');
      }

      const docRef = this.firestore.doc<Label>(`users/${user.uid}/labels/${id}`);
      await docRef.delete();
    } catch (error) {
      console.error('ラベルの削除に失敗しました:', error);
      throw error;
    }
  }

  async update(label: Label): Promise<void> {
    try {
      const user = await this.auth.currentUser;
      if (!user) {
        throw new Error('ユーザーが認証されていません');
      }

      const docRef = this.firestore.doc<Label>(`users/${user.uid}/labels/${label.id}`);
      await docRef.set(label);
    } catch (error) {
      console.error('ラベルの更新に失敗しました:', error);
      throw error;
    }
  }
} 