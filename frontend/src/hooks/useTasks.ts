import { useQuery } from '@tanstack/react-query';

import { api } from '../api';

export type TaskState =
  | 'queued'
  | 'running'
  | 'success'
  | 'error';

export type TaskSource =
  | 'manual'
  | 'scheduler';

export type ManagedTask = {
  id: string;
  node?: string;
  action?: string;
  title: string;
  source?: TaskSource;
  state: TaskState;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  output?: string[];
  error?: string | null;
  result?: {
    updates?: number;
    reboot_required?: boolean;
    [key: string]: unknown;
  } | null;
};

type TasksResponse = {
  tasks: ManagedTask[];
};

async function fetchTasks(): Promise<TasksResponse> {
  const response = await api.get<TasksResponse>('/tasks');

  return response.data;
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
    refetchInterval: (query) => {
      const tasks = query.state.data?.tasks ?? [];

      const hasActiveTasks = tasks.some(
        (task) =>
          task.state === 'queued' ||
          task.state === 'running',
      );

      return hasActiveTasks ? 1500 : 5000;
    },
  });
}
