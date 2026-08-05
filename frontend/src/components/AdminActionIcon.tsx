import {
  ActionIcon,
  Tooltip,
  type ActionIconProps,
} from '@mantine/core';
import type {
  MouseEvent,
  ReactNode,
} from 'react';

import { useAuth } from '../auth';

type AdminActionIconProps = ActionIconProps & {
  children: ReactNode;
  onClick?: (
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  permissionTooltip?: string;
};

export function AdminActionIcon({
  children,
  disabled,
  onClick,
  permissionTooltip =
    'Only administrators can perform this action.',
  ...actionIconProps
}: AdminActionIconProps) {
  const { isAdmin } = useAuth();

  const permissionDenied = !isAdmin;
  const isDisabled =
    permissionDenied || Boolean(disabled);

  const actionIcon = (
    <ActionIcon
      {...actionIconProps}
      disabled={isDisabled}
      onClick={
        permissionDenied
          ? undefined
          : onClick
      }
    >
      {children}
    </ActionIcon>
  );

  if (!permissionDenied) {
    return actionIcon;
  }

  return (
    <Tooltip
      label={permissionTooltip}
      withArrow
    >
      <span style={{ display: 'inline-flex' }}>
        {actionIcon}
      </span>
    </Tooltip>
  );
}
