import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSliderModule } from '@angular/material/slider';
import { NotificationSettings, NotificationType, NotificationTiming, NotificationPriority } from '../../models/task.model';

@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatSliderModule
  ],
  template: `
    <div class="notification-settings" [formGroup]="form">
      <mat-checkbox formControlName="enabled">通知を有効にする</mat-checkbox>

      <ng-container *ngIf="form.get('enabled')?.value">
        <mat-form-field appearance="outline">
          <mat-label>通知方法</mat-label>
          <mat-select formControlName="type">
            <mat-option value="ブラウザ">ブラウザ通知</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>通知タイミング</mat-label>
          <mat-select formControlName="timing">
            <mat-option value="5分前">5分前</mat-option>
            <mat-option value="10分前">10分前</mat-option>
            <mat-option value="15分前">15分前</mat-option>
            <mat-option value="30分前">30分前</mat-option>
            <mat-option value="1時間前">1時間前</mat-option>
            <mat-option value="2時間前">2時間前</mat-option>
            <mat-option value="1日前">1日前</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>重要度</mat-label>
          <mat-select formControlName="priority">
            <mat-option value="高">高</mat-option>
            <mat-option value="中">中</mat-option>
            <mat-option value="低">低</mat-option>
          </mat-select>
        </mat-form-field>
      </ng-container>
    </div>
  `,
  styles: [`
    .notification-settings {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
    }
  `]
})
export class NotificationSettingsComponent implements OnChanges {
  @Input() settings: NotificationSettings | null = null;
  @Output() settingsChange = new EventEmitter<NotificationSettings>();

  form: FormGroup;
  private isInternalChange = false;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      enabled: [false],
      type: ['ブラウザ'],
      timing: ['10分前'],
      priority: ['中']
    });

    // フォームの値が変更されたときの処理
    this.form.valueChanges.subscribe(value => {
      if (!this.isInternalChange) {
        this.settingsChange.emit(value);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['settings'] && !this.isInternalChange) {
      this.isInternalChange = true;
      this.form.patchValue(this.settings || {
        enabled: false,
        type: 'ブラウザ',
        timing: '10分前',
        priority: '中'
      }, { emitEvent: false });
      this.isInternalChange = false;
    }
  }
} 