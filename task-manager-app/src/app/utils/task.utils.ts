import { Task, RepeatSettings } from '../models/task.model';

export function generateRepeatedTasks(task: Task): Task[] {
  if (!task.repeat?.enabled || !task.dueDate) {
    return [task];
  }

  const tasks: Task[] = [];
  const startDate = new Date(task.dueDate);
  const endDate = task.repeat.endDate ? new Date(task.repeat.endDate) : null;

  let currentDate = new Date(startDate);
  let count = 0;
  const maxTasks = 100; // 無限ループを防ぐための制限

  while (count < maxTasks) {
    if (endDate && currentDate > endDate) {
      break;
    }

    if (isValidRepeatDate(currentDate, task.repeat)) {
      const newTask: Task = {
        ...task,
        id: `${task.id}_${count}`,
        dueDate: new Date(currentDate),
        repeat: undefined // 生成されたタスクは繰り返し設定を持たない
      };
      tasks.push(newTask);
    }

    currentDate = getNextRepeatDate(currentDate, task.repeat);
    count++;
  }

  return tasks;
}

function isValidRepeatDate(date: Date, repeat: RepeatSettings): boolean {
  if (!repeat.enabled) return true;

  switch (repeat.frequency) {
    case '毎日':
      return true;
    case '毎週':
      return repeat.daysOfWeek?.includes(date.getDay()) ?? true;
    case '毎月':
      return repeat.dayOfMonth === date.getDate();
    case '毎年':
      return repeat.dayOfMonth === date.getDate() && repeat.month === date.getMonth();
    default:
      return true;
  }
}

function getNextRepeatDate(date: Date, repeat: RepeatSettings): Date {
  const nextDate = new Date(date);

  switch (repeat.frequency) {
    case '毎日':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case '毎週':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case '毎月':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case '毎年':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }

  return nextDate;
}

/**
 * タスクの表示用時間文字列を返す（詳細ダイアログ・TODAYページ共通）
 */
export function getTaskDisplayTime(task: Task): string {
  if (task.startTime && task.endTime) {
    return `${task.startTime} - ${task.endTime}`;
  } else if (task.dueTime) {
    return task.dueTime;
  } else {
    return '';
  }
} 