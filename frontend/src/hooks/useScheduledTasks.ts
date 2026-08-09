import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '../api';

export type SchedulerIntervalUnit =
  | 'minutes'
  | 'hours'
  | 'days'
  | 'weeks'
  | 'months';

export interface ScheduledTask {
  id: number;
  infrastructure_id: number;
  uuid: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  action: string;
  target_type: string;
  node?: string | null;
  guest_type?: 'qemu' | 'lxc' | null;
  vmid?: number | null;
  payload: Record<string, unknown>;
  repeat_enabled: boolean;
  interval_value?: number | null;
  interval_unit?: SchedulerIntervalUnit | null;
  timezone: string;
  start_at: string;
  next_run?: string | null;
  last_run?: string | null;
  last_result?: 'success' | 'failed' | null;
  last_error?: string | null;
  created_by_user_id?: number | null;
  created_by_username: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface ScheduledTaskInput {
  infrastructure_id: number;
  name: string;
  description?: string | null;
  action: string;
  target_type: string;
  node?: string | null;
  guest_type?: 'qemu' | 'lxc' | null;
  vmid?: number | null;
  payload: Record<string, unknown>;
  repeat_enabled: boolean;
  interval_value?: number | null;
  interval_unit?: SchedulerIntervalUnit | null;
  timezone: string;
  start_at: string;
  enabled: boolean;
}

type ScheduledTaskListResponse = {
  tasks: ScheduledTask[];
};

export function useScheduledTasks() {
  return useQuery({
    queryKey: ['scheduled-tasks'],
    queryFn: async () => {
      const response =
        await api.get<ScheduledTaskListResponse>(
          '/scheduler/tasks',
        );

      return response.data.tasks;
    },
    refetchInterval: 30000,
  });
}

export function useCreateScheduledTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: ScheduledTaskInput,
    ) => {
      const response =
        await api.post<ScheduledTask>(
          '/scheduler/tasks',
          input,
        );

      return response.data;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['scheduled-tasks'],
      });
    },
  });
}

export function useUpdateScheduledTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: number;
      input: ScheduledTaskInput;
    }) => {
      const response =
        await api.put<ScheduledTask>(
          `/scheduler/tasks/${id}`,
          input,
        );

      return response.data;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['scheduled-tasks'],
      });
    },
  });
}

export function useSetScheduledTaskEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      enabled,
    }: {
      id: number;
      enabled: boolean;
    }) => {
      const response =
        await api.patch<ScheduledTask>(
          `/scheduler/tasks/${id}/enabled`,
          {
            enabled,
          },
        );

      return response.data;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['scheduled-tasks'],
      });
    },
  });
}

export function useDeleteScheduledTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      id: number,
    ) => {
      await api.delete(
        `/scheduler/tasks/${id}`,
      );
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['scheduled-tasks'],
      });
    },
  });
}

export interface ScheduledTaskRunNowResponse {
  ok: boolean;
  task_id: number;
  run_id: number;
  trigger: 'manual';
  started_at: string;
}

export function useRunScheduledTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      id: number,
    ) => {
      const response =
        await api.post<ScheduledTaskRunNowResponse>(
          `/scheduler/tasks/${id}/run`,
        );

      return response.data;
    },

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['scheduled-tasks'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['tasks'],
        }),
      ]);
    },
  });
}
