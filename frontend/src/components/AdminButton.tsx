import {
  Button,
  Tooltip,
  type ButtonProps,
} from '@mantine/core';
import type {
  MouseEvent,
  ReactNode,
} from 'react';

import { useAuth } from '../auth';

type AdminButtonProps = ButtonProps & {
  children: ReactNode;
  onClick?: (
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  permissionTooltip?: string;
};

export function AdminButton({
  children,
  disabled,
  onClick,
  permissionTooltip =
    'Only administrators can perform this action.',
  ...buttonProps
}: AdminButtonProps) {
  const { isAdmin } = useAuth();

  const permissionDenied = !isAdmin;
  const isDisabled =
    permissionDenied || Boolean(disabled);

  const button = (
    <Button
      {...buttonProps}
      disabled={isDisabled}
      onClick={
        permissionDenied
          ? undefined
          : onClick
      }
    >
      {children}
    </Button>
  );

  if (!permissionDenied) {
    return button;
  }

  return (
    <Tooltip
      label={permissionTooltip}
      withArrow
    >
      <span style={{ display: 'inline-flex' }}>
        {button}
      </span>
    </Tooltip>
  );
}
