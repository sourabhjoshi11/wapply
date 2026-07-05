'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { InputHTMLAttributes, ForwardedRef } from 'react';
import { forwardRef, useCallback } from 'react';

interface PhoneInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Phone input with auto-prepended +91 prefix.
 * - User only types the 10-digit mobile number
 * - onChange returns the full number with +91 prefix
 * - Strips any non-digit characters automatically
 */
const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, className, ...props }, ref: ForwardedRef<HTMLInputElement>) => {
    // Extract just the 10-digit portion for display
    const displayValue = value.replace(/^\+91/, '');

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        // Strip everything except digits
        const raw = e.target.value.replace(/\D/g, '');
        // Max 10 digits
        const digits = raw.slice(0, 10);
        // Return full number with +91
        onChange(`+91${digits}`);
      },
      [onChange],
    );

    return (
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10">
          <span className="text-sm text-gray-400 font-medium">+91</span>
          <div className="w-px h-5 bg-gray-700 ml-2" />
        </div>
        <Input
          ref={ref}
          type="tel"
          value={displayValue}
          onChange={handleChange}
          className={cn('pl-16', className)}
          inputMode="numeric"
          maxLength={10}
          {...props}
        />
      </div>
    );
  },
);

PhoneInput.displayName = 'PhoneInput';

export { PhoneInput };
