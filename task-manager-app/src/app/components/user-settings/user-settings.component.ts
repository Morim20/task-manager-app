import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserSettingsService, UserCapacitySettings } from '../../services/user-settings.service';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-user-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-container">
      <h2>キャパシティ設定</h2>
      <form #form="ngForm" (ngSubmit)="save()" novalidate>
        <div class="form-group">
          <label>標準キャパシティ（1日あたり・分）</label>
          <input type="number" [(ngModel)]="defaultCapacity" name="defaultCapacity" min="0" [ngModelOptions]="{standalone: true}" />
        </div>
        <div class="form-group">
          <label>曜日ごとのキャパシティ（分）</label>
          <div class="weekday-row" *ngFor="let w of weekdays; let i = index">
            <span>{{ w }}</span>
            <input type="number" [(ngModel)]="weekdayCapacities[i]" [name]="'weekday' + i" min="0" />
          </div>
        </div>
        <div class="form-group">
          <label>特定日だけ例外設定</label>
          <div class="special-date-row" *ngFor="let d of specialDateKeys">
            <input type="date" [value]="d" (change)="onSpecialDateChange($event, d)" />
            <input type="number" [(ngModel)]="specialDates[d]" [name]="'specialDate' + d" min="0" [ngModelOptions]="{standalone: true}" />
            <button type="button" (click)="removeSpecialDate(d)">削除</button>
          </div>
          <div class="add-special-date">
            <input type="date" [(ngModel)]="newSpecialDate" name="newSpecialDate" />
            <input type="number" [(ngModel)]="newSpecialCapacity" name="newSpecialCapacity" min="0" placeholder="分" />
            <button type="button" (click)="addSpecialDate()">追加</button>
          </div>
        </div>
        <button type="submit">保存</button>
      </form>
      <div *ngIf="saved" class="saved-message">保存しました！</div>
    </div>
  `,
  styles: [`
    .settings-container { max-width: 480px; margin: 32px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(25,118,210,0.08); padding: 32px; }
    h2 { color: #1976d2; margin-bottom: 24px; }
    .form-group { margin-bottom: 24px; }
    label { font-weight: bold; color: #1976d2; display: block; margin-bottom: 8px; }
    input[type=number], input[type=date] { margin-right: 8px; padding: 4px 8px; border-radius: 4px; border: 1px solid #bbb; }
    .weekday-row, .special-date-row, .add-special-date { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .saved-message { color: #388e3c; margin-top: 16px; font-weight: bold; }
    button { background: #1976d2; color: #fff; border: none; border-radius: 4px; padding: 4px 12px; cursor: pointer; }
    button[type=button] { background: #bbb; color: #fff; }
  `]
})
export class UserSettingsComponent implements OnInit {
  defaultCapacity: number | null = null;
  weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  weekdayCapacities: (number | null)[] = [null, null, null, null, null, null, null];
  specialDates: { [date: string]: number } = {};
  newSpecialDate: string = '';
  newSpecialCapacity: number | null = null;
  saved = false;

  get specialDateKeys() {
    return Object.keys(this.specialDates);
  }

  constructor(
    private userSettingsService: UserSettingsService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    const user = await firstValueFrom(this.authService.getCurrentUser());
    if (!user || !(user as any).uid) return;
    const settings = await this.userSettingsService.getUserCapacitySettings((user as any).uid);
    if (settings) {
      this.defaultCapacity = settings.capacity ?? 180;
      this.weekdayCapacities = [0,1,2,3,4,5,6].map(i => settings.weekdayCapacity && settings.weekdayCapacity[i] !== undefined ? settings.weekdayCapacity[i] : null);
      this.specialDates = settings.specialCapacity ?? {};
    }
  }

  async save() {
    try {
      console.log('save called');
      const user = await firstValueFrom(this.authService.getCurrentUser());
      console.log('user:', user);
      const userObj = user as any;
      if (!userObj || typeof userObj !== 'object' || !userObj.uid) {
        console.error('ユーザーが取得できません');
        return;
      }

      const weekdayCapacityObj: { [key: string]: number } = {};
      this.weekdayCapacities.forEach((v, i) => { weekdayCapacityObj[i] = v ?? 0; });

      const settings: UserCapacitySettings = {
        capacity: this.defaultCapacity ?? 0,
        weekdayCapacity: weekdayCapacityObj,
        specialCapacity: this.specialDates ?? {}
      };

      console.log('保存する設定:', settings);
      await this.userSettingsService.setUserCapacitySettings(userObj.uid, settings);
      console.log('設定の保存が完了しました');
      this.saved = true;
      setTimeout(() => this.saved = false, 2000);
    } catch (e) {
      console.error('設定の保存に失敗しました:', e);
      alert('保存に失敗しました: ' + (e ? String(e) : ''));
    }
  }

  addSpecialDate() {
    if (this.newSpecialDate && this.newSpecialCapacity != null) {
      this.specialDates[this.newSpecialDate] = this.newSpecialCapacity;
      this.newSpecialDate = '';
      this.newSpecialCapacity = null;
    }
  }

  removeSpecialDate(date: string) {
    delete this.specialDates[date];
  }

  onSpecialDateChange(event: any, oldDate: string) {
    const newDate = event.target.value;
    if (newDate && newDate !== oldDate) {
      this.specialDates[newDate] = this.specialDates[oldDate];
      delete this.specialDates[oldDate];
    }
  }
} 