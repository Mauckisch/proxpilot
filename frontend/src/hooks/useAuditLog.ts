import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '../api';

export type AuditResult =
  | 'success'
  | 'failed';

export type AuditSeverity =
  | 'info'
  | 'warning'
  | 'error';

export type AuditEvent = {
  id: number;
  created_at: string;
  user_id: number | null;
  username: string | null;
  role: string | null;
  source: string | null;
  ip_address: string | null;
  action: string;
  target_type: string | null;
  target: string | null;
  node: string | null;
  result: AuditResult;
  severity: AuditSeverity;
  duration_ms: number | null;
  details:
    | Record<string, unknown>
    | string
    | null;
};

export type AuditFilters = {
  usernames: string[];
  roles: string[];
  sources: string[];
  actions: string[];
  results: string[];
  severities: string[];
  nodes: string[];
  target_types: string[];
};

export type AuditSummary = {
  total: number;
  oldest_entry: string | null;
  newest_entry: string | null;
  failed_count: number;
  warning_count: number;
  error_count: number;
};

export type AuditResponse = {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
  retention_days: number;
  filters: AuditFilters;
  summary: AuditSummary;
};

export type AuditQuery = {
  limit: number;
  offset: number;
  username?: string[];
  role?: string[];
  source?: string[];
  action?: string[];
  result?: AuditResult[];
  severity?: AuditSeverity[];
  node?: string[];
  target_type?: string[];
  search?: string | null;
  date_from?: string | null;
  date_to?: string | null;
};

const auditQueryKey = ['audit'];

function appendValues(
  params: URLSearchParams,
  key: string,
  values?: string[],
) {
  for (const value of values ?? []) {
    if (value.trim()) {
      params.append(
        key,
        value.trim(),
      );
    }
  }
}

export function useAuditLog(
  query: AuditQuery,
) {
  return useQuery({
    queryKey: [
      ...auditQueryKey,
      query,
    ],

    queryFn: async () => {
      const params =
        new URLSearchParams();

      params.set(
        'limit',
        String(query.limit),
      );

      params.set(
        'offset',
        String(query.offset),
      );

      appendValues(
        params,
        'username',
        query.username,
      );

      appendValues(
        params,
        'role',
        query.role,
      );

      appendValues(
        params,
        'source',
        query.source,
      );

      appendValues(
        params,
        'action',
        query.action,
      );

      appendValues(
        params,
        'result',
        query.result,
      );

      appendValues(
        params,
        'severity',
        query.severity,
      );

      appendValues(
        params,
        'node',
        query.node,
      );

      appendValues(
        params,
        'target_type',
        query.target_type,
      );

      if (query.search) {
        params.set(
          'search',
          query.search,
        );
      }

      if (query.date_from) {
        params.set(
          'date_from',
          query.date_from,
        );
      }

      if (query.date_to) {
        params.set(
          'date_to',
          query.date_to,
        );
      }

      const response =
        await api.get<AuditResponse>(
          `/audit?${params.toString()}`,
        );

      return response.data;
    },
  });
}

export function useUpdateAuditRetention() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      retentionDays: number,
    ) => {
      const response =
        await api.put(
          '/audit/settings',
          null,
          {
            params: {
              retention_days:
                retentionDays,
            },
          },
        );

      return response.data;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: auditQueryKey,
      });
    },
  });
}

export function useClearAuditLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response =
        await api.delete(
          '/audit',
          {
            params: {
              confirmed: true,
            },
          },
        );

      return response.data;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: auditQueryKey,
      });
    },
  });
}
