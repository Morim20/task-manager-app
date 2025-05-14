import { Injectable } from '@angular/core';
import { Task, NotificationSettings, NotificationTiming } from '../models/task.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationPermission: NotificationPermission = 'default';
  private scheduledNotifications: Map<string, number[]> = new Map();
  private permissionReady: Promise<NotificationPermission>;
  private readonly MAX_TIMEOUT = 2147483647; // JavaScriptのsetTimeoutの最大値（約24.8日）

  constructor() {
    this.permissionReady = this.requestPermission();
  }

  private async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('このブラウザは通知をサポートしていません');
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      this.notificationPermission = permission;
      return permission;
    } catch (error) {
      console.error('通知の許可リクエストに失敗しました:', error);
      return 'denied';
    }
  }

  private getNotificationOptions(task: Task, settings: NotificationSettings): NotificationOptions {
    return {
      body: task.description || '',
      icon: '/assets/logo.png',
      badge: '/assets/logo.png',
      tag: `task-${task.id}`,
      requireInteraction: settings.priority === '高',
      data: {
        taskId: task.id,
        dueDate: task.dueDate,
        dueTime: task.dueTime
      }
    };
  }

  private formatDueDateTime(task: Task): string {
    if (!task.dueDate || !task.dueTime) return '未設定';
    const date = new Date(task.dueDate);
    const [hours, minutes] = task.dueTime.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long'
    });
  }

  private calculateNotificationTime(task: Task, settings: NotificationSettings): number {
    // デバッグ用ログ
    console.log('[通知] calculateNotificationTime呼び出し:', {
      taskTitle: task.title,
      taskId: task.id,
      dueDate: task.dueDate,
      startTime: task.startTime,
      dueTime: task.dueTime,
      timing: settings.timing,
      settings: settings
    });

    // 通知設定の検証
    if (!settings.timing) {
      console.warn('[通知] 通知タイミングが設定されていません。デフォルト値（10分前）を使用します。');
      settings.timing = '10分前';
    }

    if (!task.dueDate) {
      const msg = '通知を設定するには、具体的な日付（dueDate）を1つ指定してください。';
      console.error('[通知] ' + msg, task);
      throw new Error(msg);
    }
    if (!task.startTime && !task.dueTime) {
      const msg = '通知時刻（startTimeまたはdueTime）が設定されていません。';
      console.error('[通知] ' + msg, task);
      throw new Error(msg);
    }

    try {
      // 日付のパース処理
      let dueDate: Date;
      if (typeof task.dueDate === 'string') {
        const dateStr: string = task.dueDate;
        const jaMatch = dateStr.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
        if (jaMatch) {
          const [_, year, month, day] = jaMatch;
          dueDate = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day)
          );
        } else {
          dueDate = new Date(dateStr);
        }
      } else {
        dueDate = new Date(task.dueDate as any);
      }

      if (isNaN(dueDate.getTime())) {
        console.error('[通知] 無効な日付:', task.dueDate);
        throw new Error(`無効な日付です: ${task.dueDate}`);
      }

      // 時間のパース処理（startTime優先、なければdueTime）
      const timeStr = (task.startTime || task.dueTime || '').trim();
      let hours: number, minutes: number;
      const time24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      const time12Match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/);
      if (time24Match) {
        hours = Number(time24Match[1]);
        minutes = Number(time24Match[2]);
      } else if (time12Match) {
        hours = Number(time12Match[1]);
        minutes = Number(time12Match[2]);
        const period = time12Match[3].toUpperCase();
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
      } else {
        console.error('[通知] 時間の形式が不正:', timeStr);
        throw new Error(`時間の形式が不正です: ${timeStr}`);
      }

      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        console.error('[通知] 時間の値が不正:', timeStr);
        throw new Error(`時間の値が不正です: ${timeStr}`);
      }

      const localDueDate = new Date(dueDate);
      localDueDate.setHours(hours, minutes, 0, 0);
      const now = new Date();

      console.log('[通知] 日時パース結果:', {
        taskTitle: task.title,
        taskId: task.id,
        parsedDate: localDueDate.toLocaleString(),
        parsedHours: hours,
        parsedMinutes: minutes,
        now: now.toLocaleString()
      });

      if (localDueDate.getTime() <= now.getTime()) {
        console.error('[通知] 期限が過去の日時:', {
          taskTitle: task.title,
          taskId: task.id,
          dueDate: localDueDate.toLocaleString(),
          now: now.toLocaleString()
        });
        throw new Error('期限が過去の日時です');
      }

      let minutesBefore = 0;
      switch (settings.timing as NotificationTiming) {
        case '5分前': minutesBefore = 5; break;
        case '10分前': minutesBefore = 10; break;
        case '15分前': minutesBefore = 15; break;
        case '30分前': minutesBefore = 30; break;
        case '1時間前': minutesBefore = 60; break;
        case '2時間前': minutesBefore = 120; break;
        case '1日前': minutesBefore = 1440; break;
        case 'カスタム': 
          if (!settings.customMinutes) {
            console.warn('[通知] カスタム通知の分数が設定されていません。デフォルト値（10分）を使用します。');
            minutesBefore = 10;
          } else {
            minutesBefore = settings.customMinutes;
          }
          break;
        default:
          console.warn('[通知] 通知タイミングの値が不正:', settings.timing, 'デフォルト値（10分前）を使用します。');
          minutesBefore = 10;
      }

      const notificationTime = new Date(localDueDate.getTime() - (minutesBefore * 60 * 1000));
      if (notificationTime.getTime() <= now.getTime()) {
        console.error('[通知] 計算された通知時間が過去:', {
          taskTitle: task.title,
          taskId: task.id,
          notificationTime: notificationTime.toLocaleString(),
          now: now.toLocaleString()
        });
        throw new Error('計算された通知時間が過去の時刻です');
      }

      console.log('[通知] 通知時間の計算結果:', {
        taskTitle: task.title,
        taskId: task.id,
        settingsTiming: settings.timing,
        minutesBefore: minutesBefore,
        notificationDateTime: notificationTime.toISOString(),
        notificationLocaleTime: notificationTime.toLocaleString(),
        timeUntilNotification: Math.round((notificationTime.getTime() - now.getTime()) / 1000 / 60) + '分後',
        delayMs: (notificationTime.getTime() - now.getTime()),
        isFuture: notificationTime.getTime() > now.getTime()
      });

      return notificationTime.getTime();
    } catch (error) {
      console.error('[通知] 通知時間の計算に失敗:', error);
      throw error;
    }
  }

  public async scheduleNotification(task: Task, settings: NotificationSettings): Promise<void> {
    console.log('[通知] scheduleNotification開始:', {
      taskTitle: task.title,
      taskId: task.id,
      currentTime: new Date().toLocaleString(),
      settings: settings,
      notificationPermission: this.notificationPermission,
      NotificationPermission: Notification.permission,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      startTime: task.startTime
    });

    try {
      const permission = await this.permissionReady;
      console.log('[通知] permissionReady結果:', permission);
      if (permission !== 'granted') {
        console.warn('[通知] 通知の許可が得られていません - 現在の権限:', permission);
        return;
      }
      if (!settings.enabled || settings.type !== 'ブラウザ') {
        console.log('[通知] 通知が無効か、ブラウザ通知ではありません', settings);
        return;
      }

      // 既存の通知をキャンセル
      this.cancelNotification(task.id);

      // 通知時間の計算
      const notificationTime = this.calculateNotificationTime(task, settings);
      const now = Date.now();
      const delay = notificationTime - now;

      console.log('[通知] 通知タイマーセット:', {
        taskTitle: task.title,
        taskId: task.id,
        notificationTime: new Date(notificationTime).toLocaleString(),
        now: new Date(now).toLocaleString(),
        delayMs: delay,
        delayMinutes: Math.round(delay / 1000 / 60),
        settings: settings
      });

      if (delay <= 0) {
        console.warn('[通知] 通知時間が既に過ぎています - 通知をスキップ:', {
          taskTitle: task.title,
          taskId: task.id,
          notificationTime: new Date(notificationTime).toLocaleString(),
          now: new Date(now).toLocaleString(),
          difference: Math.round(-delay / 1000 / 60) + '分前'
        });
        return;
      }

      if (delay > this.MAX_TIMEOUT) {
        console.log('[通知] 長時間の遅延を分割して処理:', {
          taskTitle: task.title,
          taskId: task.id,
          totalDelay: delay,
          maxTimeout: this.MAX_TIMEOUT,
          estimatedDays: Math.round(delay / (24 * 60 * 60 * 1000))
        });
        this.handleLongDelay(task, settings, delay);
        return;
      }

      const timerIds: number[] = [];
      const mainTimerId = window.setTimeout(() => {
        console.log('[通知] 通知を表示（タイマー発火）:', {
          taskTitle: task.title,
          taskId: task.id,
          scheduledTime: new Date(notificationTime).toLocaleString(),
          actualTime: new Date().toLocaleString(),
          delay: Math.round(delay / 1000 / 60) + '分後',
          settings: settings
        });
        this.showNotification(task, settings);
        this.scheduledNotifications.delete(task.id);
      }, delay);

      timerIds.push(mainTimerId);
      this.scheduledNotifications.set(task.id, timerIds);

      console.log('[通知] 通知のスケジュール完了:', {
        taskTitle: task.title,
        taskId: task.id,
        scheduledTime: new Date(notificationTime).toLocaleString(),
        delay: Math.round(delay / 1000 / 60) + '分後',
        currentScheduledCount: this.scheduledNotifications.size,
        timerId: mainTimerId,
        settings: settings
      });
    } catch (error) {
      console.error('[通知] 通知のスケジュールに失敗:', error);
      throw error;
    }
  }

  private handleLongDelay(task: Task, settings: NotificationSettings, totalDelay: number): void {
    const timerIds: number[] = [];
    let remainingDelay = totalDelay;

    const scheduleNextInterval = () => {
      const currentDelay = Math.min(remainingDelay, this.MAX_TIMEOUT);
      const timerId = window.setTimeout(() => {
        console.log('長時間遅延のタイマー発火:', {
          taskTitle: task.title,
          remainingDelay: Math.round(remainingDelay / (24 * 60 * 60 * 1000)) + '日',
          currentDelay: Math.round(currentDelay / (24 * 60 * 60 * 1000)) + '日'
        });
        remainingDelay -= currentDelay;
        if (remainingDelay <= 0) {
          this.showNotification(task, settings);
          this.scheduledNotifications.delete(task.id);
        } else {
          scheduleNextInterval();
        }
      }, currentDelay);
      timerIds.push(timerId);
    };

    scheduleNextInterval();
    this.scheduledNotifications.set(task.id, timerIds);
  }

  public cancelNotification(taskId: string): void {
    const timerIds = this.scheduledNotifications.get(taskId);
    if (timerIds) {
      console.log(`タスク [${taskId}] の通知をキャンセルします:`, {
        timerIds: timerIds,
        cancellationTime: new Date().toLocaleString()
      });
      
      timerIds.forEach(timerId => {
        window.clearTimeout(timerId);
      });
      this.scheduledNotifications.delete(taskId);
    }
  }

  public cancelAllNotifications(): void {
    console.log('すべての通知をキャンセルします', {
      notificationCount: this.scheduledNotifications.size,
      cancellationTime: new Date().toLocaleString()
    });
    
    this.scheduledNotifications.forEach((timerIds, taskId) => {
      timerIds.forEach(timerId => {
        window.clearTimeout(timerId);
      });
    });
    
    this.scheduledNotifications.clear();
  }

  private showNotification(task: Task, settings: NotificationSettings): void {
    try {
      console.log('[通知] showNotification呼び出し:', {
        taskId: task.id,
        title: task.title,
        now: new Date().toLocaleString(),
        settings: settings
      });
      const options = this.getNotificationOptions(task, settings);
      const notification = new Notification(task.title, options);
      notification.onclick = () => {
        console.log('[通知] 通知がクリックされました:', {
          taskId: task.id,
          taskTitle: task.title,
          clickTime: new Date().toLocaleString()
        });
        window.focus();
        if (settings.priority !== '高') {
          notification.close();
        }
      };
      console.log('[通知] 通知を表示しました:', {
        taskTitle: task.title,
        displayTime: new Date().toLocaleString()
      });
    } catch (error) {
      console.error('[通知] 通知の表示に失敗:', error);
    }
  }

  public sendTestNotification(message: string): void {
    if (this.notificationPermission !== 'granted') {
      console.warn('テスト通知: 通知の許可が得られていません');
      return;
    }
    
    try {
      const options: NotificationOptions = {
        body: '通知機能のテスト中です',
        icon: '/assets/icons/icon-192x192.png',
        tag: 'test-notification',
      };
      
      new Notification(`テスト通知: ${message}`, options);
      console.log('テスト通知を送信しました:', message);
    } catch (error) {
      console.error('テスト通知の送信に失敗しました:', error);
    }
  }
} 