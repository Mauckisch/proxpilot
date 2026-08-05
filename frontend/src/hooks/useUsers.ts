import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '../api';

export type UserRole = 'admin' | 'viewer';
export type UserSource = 'local' | 'ldap';

export type ProxPilotUser = {
  id: number;
  username: string;
  role: UserRole;
  enabled: boolean;
  source: UserSource;
  created_at: string;
  last_login: string | null;
};

type UsersResponse = {
  users: ProxPilotUser[];
};

export type CreateUserInput = {
  username: string;
  password: string;
  role: UserRole;
};

export type UpdateUserInput = {
  userId: number;
  username?: string;
  role?: UserRole;
  enabled?: boolean;
};

export type UpdateUserPasswordInput = {
  userId: number;
  password: string;
};

const usersQueryKey = ['users'];

export function useUsers() {
  return useQuery({
    queryKey: usersQueryKey,
    queryFn: async () => {
      const response =
        await api.get<UsersResponse>('/users');

      return response.data.users;
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      userData: CreateUserInput,
    ) => {
      const response =
        await api.post<ProxPilotUser>(
          '/users',
          userData,
        );

      return response.data;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryKey,
      });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: UpdateUserInput,
    ) => {
      const {
        userId,
        ...userData
      } = input;

      const response =
        await api.patch<ProxPilotUser>(
          `/users/${userId}`,
          userData,
        );

      return response.data;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryKey,
      });
    },
  });
}

export function useUpdateUserPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: UpdateUserPasswordInput,
    ) => {
      const response = await api.post<{
        ok: boolean;
        user: ProxPilotUser;
      }>(
        `/users/${input.userId}/password`,
        {
          password: input.password,
        },
      );

      return response.data;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryKey,
      });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: number) => {
      const response = await api.delete<{
        ok: boolean;
        deleted_user_id: number;
      }>(`/users/${userId}`);

      return response.data;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: usersQueryKey,
      });
    },
  });
}
