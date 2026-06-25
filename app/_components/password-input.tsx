'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  wrapperClassName?: string;
};

export function PasswordInput({
  className,
  wrapperClassName,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  return (
    <div className={cn('relative', wrapperClassName)}>
      <input
        {...props}
        type={isVisible ? 'text' : 'password'}
        className={cn(
          'w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 pr-12 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white',
          className
        )}
      />
      <button
        type="button"
        onClick={() => setIsVisible((current) => !current)}
        className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-neutral-400 transition hover:text-neutral-900"
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        aria-pressed={isVisible}
      >
        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
