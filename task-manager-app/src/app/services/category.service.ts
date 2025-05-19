import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { Category, DEFAULT_CATEGORIES } from '../models/task.model';
import { v4 as uuidv4 } from 'uuid';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { StatusService } from './status.service';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private categories = new BehaviorSubject<Category[]>([]);
  private subscription: Subscription = new Subscription();

  constructor(
    private firestore: AngularFirestore,
    private auth: AngularFireAuth,
    private statusService: StatusService
  ) {
    this.auth.authState.subscribe(async user => {
      if (user) {
        try {
          const categoriesRef = this.firestore.collection<Category>(`users/${user.uid}/categories`);
          this.subscription.add(
            categoriesRef.snapshotChanges().subscribe({
              next: actions => {
                const categories = actions
                  .map(a => ({
                    ...a.payload.doc.data(),
                    id: a.payload.doc.id
                  } as Category))
                  .filter(category => !category.deleted)
                  .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

                if (categories.length === 0) {
                  this.initializeDefaultCategories(user.uid).catch(err => 
                    console.error('デフォルトカテゴリ初期化失敗:', err)
                  );
                }
                this.categories.next(categories);
              },
              error: error => {
                console.error('カテゴリーの取得中にエラーが発生しました:', error);
                this.categories.next([]);
              }
            })
          );
        } catch (error) {
          console.error('カテゴリの初期化エラー:', error);
          this.categories.next([]);
        }
      } else {
        this.categories.next([]);
      }
    });
  }

  private async initializeDefaultCategories(uid: string): Promise<void> {
    const categoriesRef = this.firestore.collection<Category>(`users/${uid}/categories`);
    const batch = this.firestore.firestore.batch();
    const defaultCategories: Category[] = DEFAULT_CATEGORIES.map((name, index) => ({
      id: uuidv4(),
      name,
      order: index,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false
    }));

    defaultCategories.forEach(category => {
      const docRef = categoriesRef.doc(category.id).ref;
      batch.set(docRef, category);
    });

    try {
      await batch.commit();
      this.categories.next(defaultCategories.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)));
      // デフォルトカテゴリに対応するデフォルトステータスも作成
      for (const category of defaultCategories) {
        await this.statusService.addDefaultStatuses(category.id);
      }
    } catch (error) {
      console.error('デフォルトカテゴリーの初期化中にエラーが発生しました:', error);
      throw new Error('デフォルトカテゴリーの初期化に失敗しました');
    }
  }

  getCategories(): Observable<Category[]> {
    return this.categories.asObservable();
  }

  async add(name: string): Promise<string> {
    const user = await this.auth.currentUser;
    if (!user) {
      throw new Error('ユーザーが認証されていません');
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('カテゴリー名を入力してください');
    }
    const existingCategories = this.categories.getValue();
    if (existingCategories.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      throw new Error('同名のカテゴリーが既に存在します');
    }
    
    const categoriesRef = this.firestore.collection<Category>(`users/${user.uid}/categories`);
    const newCategoryId = uuidv4();
    const newCategory: Category = {
      id: newCategoryId,
      name: trimmedName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
      order: existingCategories.length // 新しいカテゴリはリストの最後に追加
    };
    
    try {
      await categoriesRef.doc(newCategoryId).set(newCategory);
      await this.statusService.addDefaultStatuses(newCategoryId);
      return newCategoryId;
    } catch (error) {
      console.error('カテゴリーの追加中にエラーが発生しました:', error);
      throw new Error('カテゴリーの追加に失敗しました');
    }
  }

  getAll(): Category[] {
    return this.categories.getValue();
  }

  async update(category: Category): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) {
      throw new Error('ユーザーが認証されていません');
    }
    if (!category.id) {
      throw new Error('カテゴリーIDが必要です');
    }
    try {
      const docRef = this.firestore.doc<Category>(`users/${user.uid}/categories/${category.id}`);
      await docRef.update({
        ...category,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('カテゴリーの更新中にエラーが発生しました:', error);
      throw new Error('カテゴリーの更新に失敗しました');
    }
  }

  async delete(categoryId: string): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) {
      throw new Error('ユーザーが認証されていません');
    }
    try {
      const docRef = this.firestore.doc<Category>(`users/${user.uid}/categories/${categoryId}`);
      await docRef.update({
        deleted: true,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('カテゴリーの削除中にエラーが発生しました:', error);
      throw new Error('カテゴリーの削除に失敗しました');
    }
  }

  async updateCategoryOrder(categories: Category[]): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) {
      throw new Error('ユーザーが認証されていません');
    }

    const batch = this.firestore.firestore.batch();
    const categoriesRef = this.firestore.collection<Category>(`users/${user.uid}/categories`);

    categories.forEach((category, index) => {
      const docRef = categoriesRef.doc(category.id).ref;
      batch.update(docRef, {
        order: index,
        updatedAt: new Date().toISOString()
      });
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error('カテゴリーの順序更新中にエラーが発生しました:', error);
      throw new Error('カテゴリーの順序更新に失敗しました');
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
} 