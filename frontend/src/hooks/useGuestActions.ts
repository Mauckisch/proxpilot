import { useState } from 'react';

import { notifications } from '@mantine/notifications';

import { api } from '../api';
import type { GuestAction } from '../components/GuestCard';
import type { Guest } from './useDashboard';

export type GuestConfirmState = {
  guest: Guest;
  action: GuestAction;
} | null;

type RefetchFunction = () => Promise<unknown>;

function getApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?: string;
            message?: string;
          };
        };
      }
    ).response;

    return (
      response?.data?.detail ??
      response?.data?.message ??
      fallback
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function getGuestDisplayName(
  guest: Guest,
): string {
  return guest.name || `Guest ${guest.vmid}`;
}

export function getGuestActionTitle(
  action: GuestAction,
): string {
  switch (action) {
    case 'start':
      return 'Start guest';

    case 'shutdown':
      return 'Shutdown guest';

    case 'reboot':
      return 'Reboot guest';

    case 'stop':
      return 'Force stop guest';
  }
}

export function getGuestActionText(
  guest: Guest,
  action: GuestAction,
): string {
  const name = getGuestDisplayName(guest);

  switch (action) {
    case 'start':
      return `Start ${name}?`;

    case 'shutdown':
      return `Gracefully shut down ${name}? The guest operating system will receive a shutdown request.`;

    case 'reboot':
      return `Gracefully reboot ${name}?`;

    case 'stop':
      return `Force stop ${name}? This is comparable to disconnecting the power and may cause data loss.`;
  }
}

export function useGuestActions(
  refetch: RefetchFunction,
) {
  const [confirmState, setConfirmState] =
    useState<GuestConfirmState>(null);

  const [actionRunning, setActionRunning] =
    useState(false);

  function requestAction(
    guest: Guest,
    action: GuestAction,
  ) {
    setConfirmState({
      guest,
      action,
    });
  }

  function closeConfirmation() {
    if (!actionRunning) {
      setConfirmState(null);
    }
  }

  async function confirmAction() {
    if (!confirmState) {
      return;
    }

    const { guest, action } = confirmState;

    if (!guest.node || !guest.type) {
      notifications.show({
        title: 'Guest action failed',
        message:
          'The guest does not contain a valid node or type.',
        color: 'red',
      });

      setConfirmState(null);
      return;
    }

    setActionRunning(true);

    try {
      const response = await api.post(
        '/guest/action',
        {
          infrastructure_id:
            guest.infrastructure_id,
          node: guest.node,
          guest_type: guest.type,
          vmid: guest.vmid,
          action,
        },
      );

      notifications.show({
        title: 'Guest action started',
        message:
          response.data?.message ??
          (response.data?.upid
            ? `Proxmox task: ${response.data.upid}`
            : `${getGuestActionTitle(action)} started for ${getGuestDisplayName(guest)}.`),
        color: action === 'stop' ? 'orange' : 'blue',
      });

      window.setTimeout(() => {
        void refetch();
      }, 1800);
    } catch (error) {
      notifications.show({
        title: 'Guest action failed',
        message: getApiErrorMessage(
          error,
          'The guest action could not be started.',
        ),
        color: 'red',
      });
    } finally {
      setActionRunning(false);
      setConfirmState(null);
    }
  }

  return {
    confirmState,
    actionRunning,
    requestAction,
    closeConfirmation,
    confirmAction,
  };
}
