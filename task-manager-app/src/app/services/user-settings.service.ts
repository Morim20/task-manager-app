import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';

export interface UserCapacitySettings {
  capacity: number; // 標準キャパシティ
  weekdayCapacity: { [key: string]: number | null }; // 0(日)～6(土)
  specialCapacity: { [date: string]: number }; // 'YYYY-MM-DD' : 分
}

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  constructor(private afs: AngularFirestore) {}

  async setUserCapacitySettings(userId: string, settings: UserCapacitySettings): Promise<void> {
    console.log('setUserCapacitySettings called', userId, settings);
    try {
      // users/{userId}/capacity/main ドキュメントとして保存
      await this.afs.collection('users').doc(userId).collection('capacity').doc('main').set(settings);
      console.log('setDoc success');
    } catch (e) {
      console.error('setDoc error', e);
      throw e;
    }
  }

  async getUserCapacitySettings(userId: string): Promise<UserCapacitySettings | null> {
    try {
      // users/{userId}/capacity/main ドキュメントから取得
      const doc = await this.afs.collection('users').doc(userId).collection('capacity').doc('main').ref.get();
      if (doc.exists) {
        const data = doc.data() as any;
        return {
          capacity: typeof data.capacity === 'number' ? data.capacity : 0,
          weekdayCapacity: typeof data.weekdayCapacity === 'object' ? data.weekdayCapacity : {},
          specialCapacity: typeof data.specialCapacity === 'object' ? data.specialCapacity : {},
        };
      }
      return null;
    } catch (e) {
      console.error('getUserCapacitySettings error:', e);
      return null;
    }
  }
} 