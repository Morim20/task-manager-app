// Task インターフェースと TaskStatus 型（Not Yet／In Progress／Completed）を定義。モデルのルールブック。

// ステータスの型を動的に定義
export type TaskStatus = string;

// 通知の種類
export type NotificationType = 'ブラウザ';

// 通知のタイミング
export type NotificationTiming = '5分前' | '10分前' | '15分前' | '30分前' | '1時間前' | '2時間前' | '1日前' | 'カスタム';

// 通知の重要度
export type NotificationPriority = '高' | '中' | '低';

// 通知設定のインターフェース
export interface NotificationSettings {
  enabled: boolean;
  type: NotificationType;
  timing: NotificationTiming;
  priority: NotificationPriority;
  customMinutes?: number; // カスタムタイミングの場合の分数
}

// 繰り返しの頻度
export type RepeatFrequency = '毎日' | '毎週' | '毎月' | '毎年';

// 繰り返し設定のインターフェース
export interface RepeatSettings {
  enabled: boolean;
  frequency: RepeatFrequency;
  startDate?: Date | null;    // 繰り返し開始日を追加
  daysOfWeek?: number[];  // 0-6 (日曜-土曜)
  dayOfMonth?: number;    // 1-31
  month?: number | null;  // 0-11 (1月-12月)
  endDate?: Date | null;  // 繰り返し終了日（nullの場合は無期限）
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TimeBlock {
  date: Date;
  startTime: string; // 'HH:mm'
  endTime:   string; // 'HH:mm'
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  inProgress?: boolean;
  categoryId: string;
  category?: string;  // 後方互換性のために追加
  status?: TaskStatus;
  order?: number;  // タスクの表示順序を追加
  dueDate?: Date;
  dueTime?: string;
  startTime?: string;  // 開始時間を追加
  endTime?: string;  // 終了時間を追加
  noTask?: boolean;  // タスクなしフラグを追加
  repeat?: RepeatSettings;  // 繰り返し設定を追加
  notification?: NotificationSettings;  // 通知設定を追加
  targetCompletionDate?: Date;  // 目標完了日を追加
  scheduleDate?: Date; // スケジュールタスクの日付
  relatedLinks?: string[];  // 関連リンクを追加
  memo?: string;  // メモを追加
  priority?: 'low' | 'medium' | 'high';
  labels?: Label[];
  subTasks?: SubTask[];
  notificationSettings?: NotificationSettings;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  archivedAt?: string;
  exDates?: string[]; // 例外日（YYYY-MM-DD形式）を追加
  repeatGroupId?: string;
}

// デフォルトのラベル
export const DEFAULT_LABELS: Label[] = [
  { id: '1', name: '重要', color: '#FF4D4F' },
  { id: '2', name: '仕事', color: '#1890FF' },
  { id: '3', name: '個人', color: '#52C41A' },
  { id: '4', name: '勉強', color: '#722ED1' }
];

// デフォルトのカテゴリー
export const DEFAULT_CATEGORIES = ['プロジェクト', 'グループタスク', '個人タスク'] as const;

// カテゴリー管理用のインターフェース
export interface Category {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  startDate?: Date;
  dueDate?: Date;
  memo?: string;
  links?: { label: string; url: string }[];
  createdAt: string;
  deleted?: boolean;
  order?: number;
  updatedAt?: string;
}

// カテゴリーごとのステータスを管理するインターフェース
export interface CategoryStatus {
  categoryId: string;
  statuses: string[];
  createdAt: string;
  updatedAt: string;
}
