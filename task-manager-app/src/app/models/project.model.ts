/**
 * タスクが紐づくプロジェクトを表すモデル
 */
import { Task } from './task.model';

export interface Project {
    /** UUID 等の一意識別子 */
    id: string;
    /** プロジェクト名 */
    name: string;
    description?: string;
    startDate?: Date;
    dueDate?: Date;
    tags?: string[];
    status?: 'active' | 'completed' | 'archived';
    progress?: number;
    links?: ProjectLink[];
    notes?: string;
    milestones?: Milestone[];
    reminderSettings?: ProjectReminder[];
    type: 'personal' | 'team';
    tasks: Task[];
    createdAt: Date;
}

export interface ProjectLink {
    id: string;
    label: string;
    url: string;
    type?: 'pdf' | 'doc' | 'url' | 'other';
}

export interface Milestone {
    id: string;
    title: string;
    description?: string;
    dueDate?: Date;
    completed?: boolean;
}

export interface ProjectReminder {
    id: string;
    title: string;
    date: Date;
    notified?: boolean;
}

export const PROJECT_TYPES = ['personal', 'team'] as const;

// デフォルトの個人カテゴリー
export const DEFAULT_PERSONAL_CATEGORIES = [
    { name: '日常タスク', type: 'personal' },
    { name: '買い物', type: 'personal' },
    { name: '勉強', type: 'personal' },
    { name: '趣味', type: 'personal' }
] as const;