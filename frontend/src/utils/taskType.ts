import {
  IconArrowsExchange,
  IconBrush,
  IconCamera,
  IconDatabase,
  IconPlayerPlay,
  IconSettings,
  IconTerminal2,
  IconTool,
} from '@tabler/icons-react';

import type { ManagedTask } from '../hooks/useTasks';

export type TaskType =
  | 'backup'
  | 'snapshot'
  | 'migration'
  | 'update'
  | 'cleanup'
  | 'power'
  | 'maintenance'
  | 'console'
  | 'other';

export type TaskTypeConfiguration = {
  type: TaskType;
  label: string;
  color: string;
  icon: typeof IconTool;
};

function normalizeTaskText(
  task: ManagedTask,
): string {
  return `${task.action ?? ''} ${task.title ?? ''}`
    .trim()
    .toLowerCase();
}

export function getTaskType(
  task: ManagedTask,
): TaskTypeConfiguration {
  const value = normalizeTaskText(task);

  if (
    value.includes('backup') ||
    value.includes('vzdump')
  ) {
    return {
      type: 'backup',
      label: 'Backup',
      color: 'blue',
      icon: IconDatabase,
    };
  }

  if (value.includes('snapshot')) {
    return {
      type: 'snapshot',
      label: 'Snapshot',
      color: 'cyan',
      icon: IconCamera,
    };
  }

  if (
    value.includes('migrate') ||
    value.includes('migration')
  ) {
    return {
      type: 'migration',
      label: 'Migration',
      color: 'violet',
      icon: IconArrowsExchange,
    };
  }

  if (
    value.includes('update') ||
    value.includes('upgrade')
  ) {
    return {
      type: 'update',
      label: 'Update',
      color: 'orange',
      icon: IconSettings,
    };
  }

  if (
    value.includes('cleanup') ||
    value.includes('autoclean') ||
    value.includes('autoremove')
  ) {
    return {
      type: 'cleanup',
      label: 'Cleanup',
      color: 'yellow',
      icon: IconBrush,
    };
  }

  if (
    value.includes('start') ||
    value.includes('stop') ||
    value.includes('shutdown') ||
    value.includes('reboot') ||
    value.includes('reset') ||
    value.includes('resume') ||
    value.includes('suspend')
  ) {
    return {
      type: 'power',
      label: 'Power',
      color: 'green',
      icon: IconPlayerPlay,
    };
  }

  if (
    value.includes('maintenance')
  ) {
    return {
      type: 'maintenance',
      label: 'Maintenance',
      color: 'gray',
      icon: IconTool,
    };
  }

  if (
    value.includes('console') ||
    value.includes('vnc')
  ) {
    return {
      type: 'console',
      label: 'Console',
      color: 'indigo',
      icon: IconTerminal2,
    };
  }

  return {
    type: 'other',
    label: 'Other',
    color: 'gray',
    icon: IconTool,
  };
}
